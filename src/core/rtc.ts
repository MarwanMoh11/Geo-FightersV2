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

// STUN is enough to discover your public address, but it cannot get you
// through a symmetric or carrier-grade NAT — the two peers simply never find a
// working path and the connection silently falls back to the socket relay
// (higher latency, and all traffic through the signaling box). CGNAT is the
// norm on Egyptian and UAE mobile carriers, which is the exact audience for the
// Capacitor build, so a TURN relay is not optional here.
//
// Self-hosted coturn wins when configured (see .env: VITE_TURN_URL /
// VITE_TURN_USER / VITE_TURN_PASS — point these at the Oracle always-free VM).
// Otherwise fall back to the Open Relay Project's free tier so a fresh checkout
// still connects for CGNAT players without any setup.
const env = import.meta.env as Record<string, string | undefined>;

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const turnUrl = env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((u) => u.trim()),
      username: env.VITE_TURN_USER ?? '',
      credential: env.VITE_TURN_PASS ?? '',
    });
    return servers;
  }

  // Open Relay Project free tier. Port 443/TCP matters: restrictive mobile and
  // corporate networks that drop UDP will still get through on it.
  servers.push({
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });
  return servers;
}

const ICE_SERVERS: RTCIceServer[] = buildIceServers();

const peers = new Map<string, Peer>();
let signalSocket: Socket | null = null;
let signalRoom = '';
let messageHandler: RtcMessageHandler | null = null;
let signalsBound = false;

function sendSignal(targetId: string, data: any) {
  signalSocket?.emit('rtc-signal', { roomCode: signalRoom, targetId, data });
}

/**
 * Log whether this peer connected directly or via a TURN relay.
 *
 * Without this there is no way to tell that TURN is doing any work — a broken
 * or expired TURN credential looks exactly like "some players can't connect",
 * which is the failure mode the handoff doc calls out as hardest to diagnose.
 */
async function reportCandidateType(pc: RTCPeerConnection, peerId: string): Promise<void> {
  try {
    const stats = await pc.getStats();
    let pair: any = null;
    stats.forEach((r: any) => {
      if (r.type === 'candidate-pair' && (r.selected || r.state === 'succeeded') && !pair) pair = r;
    });
    if (!pair) return;
    const local: any = stats.get(pair.localCandidateId);
    const remote: any = stats.get(pair.remoteCandidateId);
    const relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
    uiState.netRelayed = relayed;
    console.log(
      `[RTC] ${peerId} connected via ${relayed ? 'TURN relay' : 'direct'} ` +
        `(local=${local?.candidateType ?? '?'} remote=${remote?.candidateType ?? '?'})`,
    );
  } catch {
    // getStats shape varies by browser — diagnostics only, never fatal.
  }
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
    void reportCandidateType(pc, peerId);
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
