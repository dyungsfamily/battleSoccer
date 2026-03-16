// client.js - 소켓 통신 및 입력 처리

const socket = io();

// 연결 이벤트
socket.on('connect', () => {
  console.log('서버에 연결됨:', socket.id);
});

// 초기화 이벤트 (팀, 번호 배정)
socket.on('init', (data) => {
  const teamName = data.team === 'red' ? '🔴 레드팀' : '🔵 블루팀';
  const msg = document.getElementById('status-msg');
  msg.textContent = `${teamName} #${data.number} 로 입장!`;
  setTimeout(() => { msg.textContent = ''; }, 2500);
});

socket.on('disconnect', () => {
  console.log('서버 연결 해제됨');
  document.getElementById('status-msg').textContent = '서버와 연결이 끊겼습니다. 새로고침하세요.';
});

// 서버로부터 게임 상태 수신 → renderer에 전달
socket.on('gameState', (state) => {
  if (window.renderer) {
    window.renderer.render(state, socket.id);
  }
});

// 점수 업데이트
socket.on('scoreUpdate', (scores) => {
  document.getElementById('score-red').textContent = scores.red;
  document.getElementById('score-blue').textContent = scores.blue;
});

// 골 메시지
socket.on('goalScored', (data) => {
  const msg = document.getElementById('status-msg');
  msg.textContent = data.team === 'red' ? '🔴 레드 팀 골!' : '🔵 블루 팀 골!';
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

// 아이템 업데이트
socket.on('itemUpdate', (item) => {
  const itemNames = { missile: '🚀 미사일', lightning: '⚡ 번개', tornado: '🌀 돌풍', null: '없음' };
  document.getElementById('item-display').textContent = '아이템: ' + (itemNames[item] || '없음');
});

// ── 키보드 입력 처리 ──────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w') keys.w = true;
  if (key === 'a') keys.a = true;
  if (key === 's') keys.s = true;
  if (key === 'd') keys.d = true;

  if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('kick');
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    socket.emit('useItem');
  }
});

document.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w') keys.w = false;
  if (key === 'a') keys.a = false;
  if (key === 's') keys.s = false;
  if (key === 'd') keys.d = false;
});

// 이동 입력을 60fps로 서버에 전송
setInterval(() => {
  if (keys.w || keys.a || keys.s || keys.d) {
    socket.emit('move', { w: keys.w, a: keys.a, s: keys.s, d: keys.d });
  }
}, 1000 / 60);

// ── 모바일 가상 패드 ─────────────────────────────────────
function setupMobileControls() {
  const container = document.createElement('div');
  container.id = 'mobile-controls';
  container.innerHTML = `
    <div id="dpad">
      <div class="dpad-btn" id="btn-up">▲</div>
      <div class="dpad-btn" id="btn-left">◀</div>
      <div class="dpad-btn" id="btn-right">▶</div>
      <div class="dpad-btn" id="btn-down">▼</div>
    </div>
    <div id="action-btns">
      <div class="action-btn" id="btn-kick">KICK</div>
      <div class="action-btn" id="btn-item">ITEM</div>
    </div>
  `;
  document.body.appendChild(container);

  const btnMap = {
    'btn-up': 'w', 'btn-down': 's', 'btn-left': 'a', 'btn-right': 'd'
  };

  Object.entries(btnMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; el.classList.add('active'); }, { passive: false });
    el.addEventListener('touchend',   (e) => { e.preventDefault(); keys[key] = false; el.classList.remove('active'); }, { passive: false });
  });

  document.getElementById('btn-kick').addEventListener('touchstart', (e) => {
    e.preventDefault();
    socket.emit('kick');
    e.target.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-kick').addEventListener('touchend', (e) => {
    e.target.classList.remove('active');
  });

  document.getElementById('btn-item').addEventListener('touchstart', (e) => {
    e.preventDefault();
    socket.emit('useItem');
    e.target.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-item').addEventListener('touchend', (e) => {
    e.target.classList.remove('active');
  });
}

setupMobileControls();
