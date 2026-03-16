// 프로세스 레벨 예외 핸들러 - 서버가 죽지 않게 방어
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException] 서버 유지:', e.message);
});
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection] 서버 유지:', e);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'https://battle-soccer.dyungsfamily.workers.dev',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

// 게임 인스턴스 초기화
const game = new GameLogic(io);

io.on('connection', (socket) => {
  console.log(`[접속] 플레이어 연결됨: ${socket.id}`);

  const info = game.addPlayer(socket.id);
  socket.emit('init', { team: info.team, number: info.number });
  socket.emit('scoreUpdate', game.scores);

  socket.on('move', (keys) => {
    try { game.handleMove(socket.id, keys); } catch (e) {}
  });

  socket.on('kick', () => {
    try { game.handleKick(socket.id); } catch (e) {}
  });

  socket.on('useItem', () => {
    try {
      const p = game.getPlayer(socket.id);
      if (p && p.item) game.useItem(socket.id);
    } catch (e) {}
  });

  socket.on('disconnect', () => {
    console.log(`[해제] 플레이어 연결 해제: ${socket.id}`);
    try { game.removePlayer(socket.id); } catch (e) {}
  });
});

server.listen(PORT, () => {
  console.log(`Battle Soccer 서버 실행 중: http://localhost:${PORT}`);
});
