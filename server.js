import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 4;

// --- GLOBAL LEADERBOARD -----------------------------------------------------
// Best runs across all players. Ranked by time survived, then kills. Stored in
// a JSON file so it survives within the container's lifetime (HF free tier
// storage is ephemeral across full rebuilds/sleeps — good enough for a board).
const LEADERBOARD_FILE = process.env.LEADERBOARD_FILE || './leaderboard.json';
const LEADERBOARD_MAX = 100;
let leaderboard = [];

try {
  if (existsSync(LEADERBOARD_FILE)) {
    leaderboard = JSON.parse(readFileSync(LEADERBOARD_FILE, 'utf-8'));
    if (!Array.isArray(leaderboard)) leaderboard = [];
  }
} catch {
  leaderboard = [];
}

function saveLeaderboard() {
  try {
    writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard));
  } catch {
    /* ephemeral / read-only FS — keep the in-memory copy */
  }
}

// --- NAME MODERATION ------------------------------------------------------
// Player-supplied names reach two public surfaces: the global leaderboard and
// the co-op lobby roster. Both are visible to strangers, on a portal whose
// audience skews young, so neither can take raw input.
//
// Matching is done on a NORMALISED copy — lowercased, leet-substituted, and
// stripped to bare letters — so the usual evasions ("f_u_c_k", "5h1t",
// "b.i.t.c.h") collapse onto the same string as the plain spelling.
const LEET = {
  4: 'a',
  '@': 'a',
  3: 'e',
  1: 'i',
  '!': 'i',
  '|': 'i',
  0: 'o',
  5: 's',
  $: 's',
  7: 't',
  8: 'b',
  9: 'g',
  6: 'g',
};

function normaliseForMatch(s) {
  return s
    .toLowerCase()
    .replace(/[4@31!|05$78963]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

// Tier 1 — matched anywhere in the normalised name. Reserved for terms with no
// plausible innocent substring use.
const BLOCKED_SUBSTRING = [
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'chink',
  'spic',
  'kike',
  'tranny',
  'rape',
  'rapist',
  'nazi',
  'hitler',
  'pedo',
  'paedo',
  'incest',
  'molest',
  'cunt',
  'fuck',
  'shit',
  'bitch',
  'whore',
  'slut',
  'penis',
  'vagina',
  'pussy',
  'wank',
  'jizz',
  'porn',
  'blowjob',
  'handjob',
];

// Tier 2 — must match the WHOLE normalised name. These appear inside ordinary
// words (assassin, class, hello, shell, dammit, analysis), so substring
// matching them would reject perfectly reasonable handles.
const BLOCKED_EXACT = [
  'ass',
  'anal',
  'hell',
  'damn',
  'crap',
  'tit',
  'tits',
  'sex',
  'butt',
  'arse',
  // Substring-matching these would take Cumbria, cumulus, Dickens and Hancock
  // with them — all plausible 12-character handles.
  'cum',
  'dick',
  'cock',
];

/**
 * Clamp, strip and moderate a player-supplied name.
 *
 * Returns `fallback` rather than rejecting the whole request: a flagged name
 * still gets its score or its lobby seat, just anonymously. Rejecting would
 * also tell an attacker exactly which spellings get through.
 */
function sanitizeName(raw, fallback = 'ANON') {
  const cleaned = String(raw ?? '')
    .slice(0, 12)
    .replace(/[^\w \-]/g, '')
    .trim();
  if (!cleaned) return fallback;
  const normalised = normaliseForMatch(cleaned);
  if (!normalised) return fallback;
  if (BLOCKED_EXACT.includes(normalised)) return fallback;
  if (BLOCKED_SUBSTRING.some((term) => normalised.includes(term))) return fallback;
  return cleaned;
}

// --- SUBMISSION RATE LIMIT ------------------------------------------------
// A finished run takes minutes; nothing legitimate submits faster than this.
// Without a cap one script can own all 100 slots, which is the whole board.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_SUBMISSIONS = 20;
/** Hard cap on tracked IPs so the limiter itself cannot be used to exhaust memory. */
const RATE_MAX_TRACKED_IPS = 5000;
const submissionLog = new Map();

function clientIp(req) {
  // Render/HF/most portals put the real client behind a proxy, so the socket
  // address would otherwise be the proxy's and every player would share one
  // bucket. Take the first hop of the forwarded chain when present.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** @returns true when the caller is over quota and should be rejected. */
function isRateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();

  // Opportunistic sweep — keeps the map bounded without a timer.
  if (submissionLog.size > RATE_MAX_TRACKED_IPS) {
    for (const [key, stamps] of submissionLog) {
      const live = stamps.filter((t) => now - t < RATE_WINDOW_MS);
      if (live.length === 0) submissionLog.delete(key);
      else submissionLog.set(key, live);
    }
  }

  const recent = (submissionLog.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_SUBMISSIONS) {
    submissionLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  submissionLog.set(ip, recent);
  return false;
}

/** Validate + insert a run, keep the list sorted and capped. Returns the rank. */
function addLeaderboardEntry(raw) {
  const entry = {
    name: sanitizeName(raw.name, 'ANON'),
    time: Math.max(0, Math.min(36000, Math.round(Number(raw.time) || 0))),
    level: Math.max(1, Math.min(999, Math.round(Number(raw.level) || 1))),
    kills: Math.max(0, Math.min(1000000, Math.round(Number(raw.kills) || 0))),
    character: String(raw.character ?? 'cypher').slice(0, 20),
    victory: !!raw.victory,
    ts: Date.now(),
  };
  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.time - a.time || b.kills - a.kills);
  if (leaderboard.length > LEADERBOARD_MAX) leaderboard.length = LEADERBOARD_MAX;
  saveLeaderboard();
  return { rank: leaderboard.indexOf(entry) + 1, total: leaderboard.length };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // GET /leaderboard[?limit=N] — top runs
  if (req.method === 'GET' && url === '/leaderboard') {
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.url.split('limit=')[1] || '25', 10) || 25),
    );
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ entries: leaderboard.slice(0, limit), total: leaderboard.length }));
    return;
  }

  // POST /leaderboard — submit a finished run
  if (req.method === 'POST' && url === '/leaderboard') {
    // Checked before the body is even read, so a flood costs us nothing.
    if (isRateLimited(req)) {
      res.writeHead(429, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'rate limited' }));
      return;
    }
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2048) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        const result = addLeaderboardEntry(JSON.parse(body));
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad payload' }));
      }
    });
    return;
  }

  // Health/banner
  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
  res.end('Geo-Fighters V2.0 Multiplayer Server\n');
});

const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from Vite dev server
    methods: ['GET', 'POST'],
  },
});

/**
 * Room model (party system):
 *   roomCode -> {
 *     hostId: string,
 *     started: boolean,
 *     players: Map<socketId, { name, character, ready }>,
 *   }
 * The host is included in `players`. The lobby roster is broadcast to the
 * whole room on every change; the host may start once everyone is ready.
 */
const rooms = new Map();

// Generate a clean 4-character room code (avoiding ambiguous letters/digits)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function lobbyPayload(code, room) {
  return {
    roomCode: code,
    started: room.started,
    players: Array.from(room.players.entries()).map(([id, p]) => ({
      connectionId: id,
      name: p.name,
      character: p.character,
      ready: p.ready,
      isHost: id === room.hostId,
    })),
  };
}

function broadcastLobby(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('lobby-state', lobbyPayload(code, room));
}

function findRoomOf(socketId) {
  for (const [code, room] of rooms.entries()) {
    if (room.players.has(socketId)) return { code, room };
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  // 1. Host creates a room (enters the lobby as its first player)
  socket.on('host-create-room', ({ name, character } = {}) => {
    const code = generateRoomCode();
    rooms.set(code, {
      hostId: socket.id,
      started: false,
      players: new Map([
        [
          socket.id,
          {
            name: sanitizeName(name, 'HOST'),
            character: character || 'cypher',
            ready: true,
          },
        ],
      ]),
    });
    socket.join(code);
    socket.emit('room-created', { roomCode: code });
    broadcastLobby(code);
    console.log(`[Server] Room created: ${code} by host ${socket.id}`);
  });

  // 2. Client joins a room (lands in the lobby; game starts when host says so)
  socket.on('client-join-room', ({ roomCode, name, character }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('join-error', { message: 'Room not found.' });
      return;
    }
    if (room.started) {
      socket.emit('join-error', { message: 'Run already in progress.' });
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('join-error', { message: 'Room is full.' });
      return;
    }

    const joinName = sanitizeName(name, 'PLAYER');
    room.players.set(socket.id, {
      name: joinName,
      character: character || 'cypher',
      ready: false,
    });
    socket.join(code);

    socket.emit('joined-room', { roomCode: code, hostId: room.hostId });
    broadcastLobby(code);
    console.log(`[Server] Client ${socket.id} joined lobby ${code} as "${joinName}"`);
  });

  // 2b. Lobby updates: ready toggle / character / name changes
  socket.on('lobby-set', ({ roomCode, ready, character, name }) => {
    const room = rooms.get(roomCode);
    const p = room?.players.get(socket.id);
    if (!room || !p || room.started) return;
    if (typeof ready === 'boolean') p.ready = ready;
    if (typeof character === 'string') p.character = character;
    // Re-sanitised on every change, not just at join: this is the seam a
    // client can call repeatedly, so it is the one worth guarding hardest.
    if (typeof name === 'string' && name.trim()) p.name = sanitizeName(name, p.name || 'PLAYER');
    broadcastLobby(roomCode);
  });

  // 2c. Host starts the run (requires everyone ready)
  socket.on('start-game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.started) return;
    const allReady = Array.from(room.players.values()).every((p) => p.ready);
    if (!allReady) {
      socket.emit('start-rejected', { message: 'Not everyone is ready.' });
      return;
    }
    room.started = true;
    io.to(roomCode).emit('game-started', lobbyPayload(roomCode, room));
    console.log(`[Server] Room ${roomCode} started with ${room.players.size} players`);
  });

  // 3. Relay state update from Client to Host
  socket.on('client-update', ({ roomCode, state }) => {
    const room = rooms.get(roomCode);
    if (room) {
      io.to(room.hostId).emit('client-state-update', { playerId: socket.id, state });
    }
  });

  // 4. Relay state update from Host to all Clients
  socket.on('host-update', ({ roomCode, state }) => {
    socket.to(roomCode).emit('host-state-update', { state });
  });

  // 5. Broadcast visual events (like shoot, damage numbers, effects)
  socket.on('shoot-event', ({ roomCode, projectileData }) => {
    socket.to(roomCode).emit('remote-shoot', projectileData);
  });

  // 6. Broadcast game events (game-over, victory, revive, chest toasts, ...)
  socket.on('sync-game-event', ({ roomCode, eventType, data }) => {
    socket.to(roomCode).emit('game-event', { eventType, data });
  });

  // 6b. Targeted event: host → one specific client (e.g. "you opened a chest")
  socket.on('direct-event', ({ roomCode, targetId, eventType, data }) => {
    const room = rooms.get(roomCode);
    if (room && room.hostId === socket.id && room.players.has(targetId)) {
      io.to(targetId).emit('game-event', { eventType, data });
    }
  });

  // 6d. Client → host request. The mirror of direct-event: lets a joiner ask
  // the host to arbitrate something host-authoritative (claiming a breach node,
  // reporting a dive outcome). The host is the only recipient, and it validates
  // — this is a request, never a command.
  socket.on('client-request', ({ roomCode, reqType, data }) => {
    const room = rooms.get(roomCode);
    if (room && room.players.has(socket.id)) {
      io.to(room.hostId).emit('client-request', { fromId: socket.id, reqType, data });
    }
  });

  // 6c. WebRTC signaling relay: forwards SDP offers/answers + ICE candidates
  // between room members so peers can open direct P2P data channels. Once the
  // P2P link is up, gameplay traffic bypasses this server entirely.
  socket.on('rtc-signal', ({ roomCode, targetId, data }) => {
    const room = rooms.get(roomCode);
    if (room && room.players.has(socket.id) && room.players.has(targetId)) {
      io.to(targetId).emit('rtc-signal', { fromId: socket.id, data });
    }
  });

  // 7. Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[Server] Socket disconnected: ${socket.id}`);
    const found = findRoomOf(socket.id);
    if (!found) return;
    const { code, room } = found;

    if (room.hostId === socket.id) {
      // Host disconnected: teardown room, notify remaining players
      socket.to(code).emit('host-disconnected');
      rooms.delete(code);
      console.log(`[Server] Host disconnected. Room ${code} destroyed.`);
    } else {
      room.players.delete(socket.id);
      io.to(room.hostId).emit('player-left', { playerId: socket.id });
      broadcastLobby(code);
      console.log(`[Server] Client ${socket.id} left room ${code}.`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Multiplayer signaling server running on port ${PORT}`);
});
