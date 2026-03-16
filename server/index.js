process.on('uncaughtException', (e) => console.error('[uncaughtException]:', e.message));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]:', e));

const express = require('express');
const http = require('http');


const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://battle-soccer.dyungsfamily.workers.dev', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, '../public')));

// ── 방 관리 ──────────────────────────────────────────────
const rooms = new Map(); // code → { code, game, players: Map<socketId, {nickname, team}> }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getPlayerRoom(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) return { code, room };
  }
  return null;
}

function getRoomList() {
  return Array.from(rooms.values()).map(r => ({
    code: r.code,
    playerCount: r.players.size,
    maxPlayers: 4,
    members: Array.from(r.players.values()).map(p => ({ nickname: p.nickname, team: p.team, countryCode: p.countryCode || null })),
  }));
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

function leaveRoom(socket) {
  const found = getPlayerRoom(socket.id);
  if (!found) return;
  const { code, room } = found;

  socket.leave(code);
  room.game.removePlayer(socket.id);
  room.players.delete(socket.id);

  if (room.players.size === 0) {
    room.game.stop();
    rooms.delete(code);
    console.log(`[방 삭제] ${code}`);
  } else {
    io.to(code).emit('playerLeft', socket.id);
  }
  broadcastRoomList();
}

// ── 소켓 이벤트 ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[접속] ${socket.id}`);

  // 방 목록 요청
  socket.on('getRooms', () => {
    socket.emit('roomList', getRoomList());
  });

  // 방 생성
  socket.on('createRoom', ({ nickname, countryCode = null }) => {
    try {
      leaveRoom(socket);
      const code = generateRoomCode();
      const game = new GameLogic(io, code);
      rooms.set(code, { code, game, players: new Map() });

      const room = rooms.get(code);
      socket.join(code);
      const info = game.addPlayer(socket.id, nickname, countryCode);
      room.players.set(socket.id, { nickname, team: info.team, countryCode });

      socket.emit('roomCreated', { code });
      socket.emit('init', { team: info.team, number: info.number, nickname, code });
      socket.emit('scoreUpdate', game.scores);
      broadcastRoomList();
      console.log(`[방 생성] ${code} - ${nickname} (${countryCode || '?'})`);
    } catch (e) {
      console.error('[createRoom]:', e.message);
    }
  });

  // 방 입장
  socket.on('joinRoom', ({ code, nickname, countryCode = null }) => {
    try {
      const upperCode = code.toUpperCase();
      const room = rooms.get(upperCode);
      if (!room) { socket.emit('joinError', '방을 찾을 수 없습니다.'); return; }
      if (room.players.size >= 4) { socket.emit('joinError', '방이 가득 찼습니다. (최대 4명)'); return; }

      leaveRoom(socket);
      socket.join(upperCode);
      const info = room.game.addPlayer(socket.id, nickname, countryCode);
      room.players.set(socket.id, { nickname, team: info.team, countryCode });

      socket.emit('roomJoined', { code: upperCode });
      socket.emit('init', { team: info.team, number: info.number, nickname, code: upperCode });
      socket.emit('scoreUpdate', room.game.scores);
      io.to(upperCode).emit('playerJoined', { nickname, team: info.team, countryCode });
      broadcastRoomList();
      console.log(`[방 입장] ${upperCode} - ${nickname} (${countryCode || '?'})`);
    } catch (e) {
      console.error('[joinRoom]:', e.message);
    }
  });

  // 방 나가기
  socket.on('leaveRoom', () => {
    try { leaveRoom(socket); } catch (e) {}
  });

  // 이동
  socket.on('move', (keys) => {
    try {
      const found = getPlayerRoom(socket.id);
      if (found) found.room.game.handleMove(socket.id, keys);
    } catch (e) {}
  });

  // 시작 준비 (frozen 해제)
  socket.on('ready', () => {
    try {
      const found = getPlayerRoom(socket.id);
      if (found) found.room.game.handleReady(socket.id);
    } catch (e) {}
  });

  // 킥
  socket.on('kick', () => {
    try {
      const found = getPlayerRoom(socket.id);
      if (found) found.room.game.handleKick(socket.id);
    } catch (e) {}
  });

  // 아이템 사용
  socket.on('useItem', () => {
    try {
      const found = getPlayerRoom(socket.id);
      if (found) {
        const p = found.room.game.getPlayer(socket.id);
        if (p && p.item) found.room.game.useItem(socket.id);
      }
    } catch (e) {}
  });

  socket.on('disconnect', () => {
    console.log(`[해제] ${socket.id}`);
    try { leaveRoom(socket); } catch (e) {}
  });
});

server.listen(PORT, () => {
  console.log(`Battle Soccer 서버 실행 중: http://localhost:${PORT}`);
});
