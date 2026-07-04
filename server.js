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

/** Validate + insert a run, keep the list sorted and capped. Returns the rank. */
function addLeaderboardEntry(raw) {
  const entry = {
    name:
      String(raw.name ?? 'ANON')
        .slice(0, 12)
        .replace(/[^\w \-]/g, '')
        .trim() || 'ANON',
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
        [socket.id, { name: name || 'HOST', character: character || 'cypher', ready: true }],
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

    room.players.set(socket.id, {
      name: name || 'PLAYER',
      character: character || 'cypher',
      ready: false,
    });
    socket.join(code);

    socket.emit('joined-room', { roomCode: code, hostId: room.hostId });
    broadcastLobby(code);
    console.log(`[Server] Client ${socket.id} joined lobby ${code} as "${name || 'PLAYER'}"`);
  });

  // 2b. Lobby updates: ready toggle / character / name changes
  socket.on('lobby-set', ({ roomCode, ready, character, name }) => {
    const room = rooms.get(roomCode);
    const p = room?.players.get(socket.id);
    if (!room || !p || room.started) return;
    if (typeof ready === 'boolean') p.ready = ready;
    if (typeof character === 'string') p.character = character;
    if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 12);
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
