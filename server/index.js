const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
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

  // 이동 입력
  socket.on('move', (keys) => {
    game.handleMove(socket.id, keys);
  });

  // 킥
  socket.on('kick', () => {
    game.handleKick(socket.id);
  });

  // 아이템 사용 (Step 5에서 itemLogic 연결)
  socket.on('useItem', () => {
    const p = game.getPlayer(socket.id);
    if (p && p.item) {
      game.useItem(socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[해제] 플레이어 연결 해제: ${socket.id}`);
    game.removePlayer(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Battle Soccer 서버 실행 중: http://localhost:${PORT}`);
});
