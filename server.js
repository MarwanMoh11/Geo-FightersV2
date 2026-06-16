import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Geo-Fighters V2.0 Multiplayer Server\n');
});

const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from Vite dev server
    methods: ['GET', 'POST'],
  },
});

// Map of roomCode -> { hostId: string, clients: string[] }
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

io.on('connection', (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  // 1. Host creates a room
  socket.on('host-create-room', () => {
    const code = generateRoomCode();
    rooms.set(code, {
      hostId: socket.id,
      clients: [],
    });
    socket.join(code);
    socket.emit('room-created', { roomCode: code });
    console.log(`[Server] Room created: ${code} by host ${socket.id}`);
  });

  // 2. Client joins a room
  socket.on('client-join-room', ({ roomCode }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('join-error', { message: 'Room not found.' });
      console.log(`[Server] Join attempt failed: Room ${code} not found`);
      return;
    }

    if (room.clients.length >= 3) {
      // Supports up to 4 players total (1 host + 3 clients)
      socket.emit('join-error', { message: 'Room is full.' });
      console.log(`[Server] Join attempt failed: Room ${code} is full`);
      return;
    }

    room.clients.push(socket.id);
    socket.join(code);

    // Notify client they joined successfully
    socket.emit('joined-room', { roomCode: code, hostId: room.hostId });
    // Notify host that a new player joined
    io.to(room.hostId).emit('player-joined', { playerId: socket.id });

    console.log(`[Server] Client ${socket.id} joined room ${code}`);
  });

  // 3. Relay state update from Client to Host
  socket.on('client-update', ({ roomCode, state }) => {
    const room = rooms.get(roomCode);
    if (room) {
      // Send directly to the host
      io.to(room.hostId).emit('client-state-update', { playerId: socket.id, state });
    }
  });

  // 4. Relay state update from Host to all Clients
  socket.on('host-update', ({ roomCode, state }) => {
    // Send to all sockets in room except host
    socket.to(roomCode).emit('host-state-update', { state });
  });

  // 5. Broadcast visual events (like shoot, damage numbers, effects)
  socket.on('shoot-event', ({ roomCode, projectileData }) => {
    // Broadcast to everyone in the room except sender
    socket.to(roomCode).emit('remote-shoot', projectileData);
  });

  // 6. Broadcast loot collection / level up / upgrades
  socket.on('sync-game-event', ({ roomCode, eventType, data }) => {
    socket.to(roomCode).emit('game-event', { eventType, data });
  });

  // 7. Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[Server] Socket disconnected: ${socket.id}`);

    // Check if the disconnected socket was a host or a client
    for (const [code, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        // Host disconnected: teardown room, notify clients
        socket.to(code).emit('host-disconnected');
        rooms.delete(code);
        console.log(`[Server] Host disconnected. Room ${code} destroyed.`);
      } else {
        const clientIndex = room.clients.indexOf(socket.id);
        if (clientIndex !== -1) {
          // Client disconnected: remove from room, notify host
          room.clients.splice(clientIndex, 1);
          io.to(room.hostId).emit('player-left', { playerId: socket.id });
          console.log(`[Server] Client ${socket.id} left room ${code}.`);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Multiplayer signaling server running on port ${PORT}`);
});
