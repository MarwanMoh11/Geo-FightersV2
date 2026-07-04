/**
 * WebRTC P2P transport for co-op state sync.
 *
 * Why: through the relay every packet travels client → signaling server (HF
 * Space, possibly another continent) → host. A direct WebRTC data channel cuts
 * that to a single peer-to-peer hop (~1-5ms on LAN, ISP-latency on WAN) and —
 * because it runs SCTP-over-UDP configured unreliable/unordered — a dropped
 * packet never stalls the ones behind it (no TCP head-of-line blocking).
 *
 * Topology: host-star mesh. The host is always the offerer; each client
 * answers. One negotiated data channel per pair:
 *   - id 0 "state": ordered:false, maxRetransmits:0 — 30Hz snapshots where
 *     only the newest matters (receivers dedupe via sequence numbers).
 * Low-rate reliable traffic (shoot events, chest/revive/game-over) stays on
 * the socket.io relay: it's sporadic, needs reliability, and isn't latency-
 * critical the way position sync is.
 *
 * Fallback: if ICE fails (symmetric NAT without TURN, ~10-15% of networks),
 * the channel simply never opens and callers keep using the relay — per peer.
 */

import type { Socket } from 'socket.io-client';
import { uiState } from './UIState.svelte';

type RtcMessageHandler = (type: string, data: any, fromId: string) => void;

interface Peer {
  pc: RTCPeerConnection;
  state: RTCDataChannel;
  rtt: number; // last measured round-trip in ms (-1 = unknown)
  pingTimer: ReturnType<typeof setInterval> | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const peers = new Map<string, Peer>();
let signalSocket: Socket | null = null;
let signalRoom = '';
let messageHandler: RtcMessageHandler | null = null;
let signalsBound = false;

function sendSignal(targetId: string, data: any) {
  signalSocket?.emit('rtc-signal', { roomCode: signalRoom, targetId, data });
}

function createPeer(peerId: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Negotiated channel with a fixed id: both sides construct it symmetrically,
  // no ondatachannel race. Unreliable + unordered = UDP-like.
  const state = pc.createDataChannel('state', {
    negotiated: true,
    id: 0,
    ordered: false,
    maxRetransmits: 0,
  });

  const peer: Peer = { pc, state, rtt: -1, pingTimer: null };

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(peerId, { candidate: e.candidate.toJSON() });
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      // Leave the peer entry; channel readyState gates sending, so traffic
      // falls back to the relay automatically. Stop measuring.
      if (peer.pingTimer) {
        clearInterval(peer.pingTimer);
        peer.pingTimer = null;
      }
      peer.rtt = -1;
      updateTransportUi();
    }
  };

  state.onopen = () => {
    console.log(`[RTC] P2P state channel open → ${peerId}`);
    // RTT probe every 2s (also acts as a keepalive for NAT bindings)
    peer.pingTimer = setInterval(() => {
      if (state.readyState === 'open') {
        state.send(JSON.stringify({ t: '__ping', d: performance.now() }));
      }
    }, 2000);
    updateTransportUi();
  };

  state.onclose = () => updateTransportUi();

  state.onmessage = (e) => {
    let msg: { t: string; d: any };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === '__ping') {
      if (state.readyState === 'open') state.send(JSON.stringify({ t: '__pong', d: msg.d }));
      return;
    }
    if (msg.t === '__pong') {
      peer.rtt = Math.round(performance.now() - msg.d);
      updateTransportUi();
      return;
    }
    messageHandler?.(msg.t, msg.d, peerId);
  };

  peers.set(peerId, peer);
  return peer;
}

async function handleSignal(fromId: string, data: any) {
  let peer = peers.get(fromId);

  try {
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        // Host offered to us (client side): build our end and answer.
        if (!peer) peer = createPeer(fromId);
        await peer.pc.setRemoteDescription(data.sdp);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        sendSignal(fromId, { sdp: peer.pc.localDescription });
      } else if (data.sdp.type === 'answer' && peer) {
        await peer.pc.setRemoteDescription(data.sdp);
      }
    } else if (data.candidate && peer) {
      await peer.pc.addIceCandidate(data.candidate);
    }
  } catch (err) {
    console.warn('[RTC] signaling error (falling back to relay):', err);
  }
}

/**
 * Start P2P connections. Host calls with every client's connId (it offers);
 * clients call with no peer list and simply answer the host's offer.
 */
export function initRtc(
  socket: Socket,
  roomCode: string,
  offerToPeerIds: string[],
  onMessage: RtcMessageHandler,
) {
  signalSocket = socket;
  signalRoom = roomCode;
  messageHandler = onMessage;

  if (!signalsBound) {
    signalsBound = true;
    socket.on('rtc-signal', ({ fromId, data }) => handleSignal(fromId, data));
  }

  if (typeof RTCPeerConnection === 'undefined') {
    console.warn('[RTC] WebRTC unavailable — staying on relay transport');
    return;
  }

  for (const peerId of offerToPeerIds) {
    if (peers.has(peerId)) continue;
    const peer = createPeer(peerId);
    peer.pc
      .createOffer()
      .then(async (offer) => {
        await peer.pc.setLocalDescription(offer);
        sendSignal(peerId, { sdp: peer.pc.localDescription });
      })
      .catch((err) => console.warn('[RTC] offer failed:', err));
  }
  updateTransportUi();
}

/** True when a direct channel to this peer is open. */
export function isRtcOpen(peerId: string): boolean {
  return peers.get(peerId)?.state.readyState === 'open';
}

/** Send a state message P2P. Returns false if the channel isn't open. */
export function rtcSendStateTo(peerId: string, type: string, data: any): boolean {
  const peer = peers.get(peerId);
  if (!peer || peer.state.readyState !== 'open') return false;
  try {
    peer.state.send(JSON.stringify({ t: type, d: data }));
    return true;
  } catch {
    return false;
  }
}

export function closeRtcPeer(peerId: string) {
  const peer = peers.get(peerId);
  if (peer) {
    if (peer.pingTimer) clearInterval(peer.pingTimer);
    try {
      peer.state.close();
      peer.pc.close();
    } catch {
      /* already closed */
    }
    peers.delete(peerId);
  }
  updateTransportUi();
}

export function closeRtc() {
  for (const id of [...peers.keys()]) closeRtcPeer(id);
  messageHandler = null;
  signalRoom = '';
  updateTransportUi();
}

/** Reflect current transport + best RTT into the HUD state. */
function updateTransportUi() {
  if (peers.size === 0) {
    uiState.netTransport = 'relay';
    uiState.netRtt = -1;
    return;
  }
  let open = 0;
  let bestRtt = -1;
  for (const p of peers.values()) {
    if (p.state.readyState === 'open') {
      open++;
      if (p.rtt >= 0 && (bestRtt === -1 || p.rtt < bestRtt)) bestRtt = p.rtt;
    }
  }
  uiState.netTransport = open === 0 ? 'relay' : open === peers.size ? 'p2p' : 'mixed';
  uiState.netRtt = bestRtt;
}
