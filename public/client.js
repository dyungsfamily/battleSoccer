// client.js

const socket = io('https://battle-soccer-production.up.railway.app', {
  transports: ['websocket', 'polling']
});

// ── 상태 ─────────────────────────────────────────────────
let myNickname = '';
let myRoomCode = '';

// ── 화면 전환 ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ── 랜덤 닉네임 ──────────────────────────────────────────
const ADJ  = ['빠른','강한','날쌘','용감한','무적의','날카로운','번개같은','불꽃의','폭풍의','거친','화끈한','맹렬한'];
const NOUN = ['호랑이','독수리','늑대','사자','표범','용사','전사','번개','폭풍','불꽃','드래곤','파이터'];

function randomNick() {
  return ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];
}

// ── 닉네임 화면 ──────────────────────────────────────────
document.getElementById('btn-random-nick').addEventListener('click', () => {
  document.getElementById('nickname-input').value = randomNick();
});

document.getElementById('btn-confirm-nick').addEventListener('click', confirmNickname);
document.getElementById('nickname-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmNickname();
});

function confirmNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  if (!val) {
    document.getElementById('nickname-input').value = randomNick();
    return;
  }
  myNickname = val;
  document.getElementById('lobby-nickname').textContent = myNickname;
  showScreen('lobby');
  socket.emit('getRooms');
}

// ── 로비 화면 ────────────────────────────────────────────
document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
  socket.emit('getRooms');
});

document.getElementById('btn-create-room').addEventListener('click', () => {
  setLobbyError('');
  socket.emit('createRoom', { nickname: myNickname });
});

document.getElementById('btn-join-code').addEventListener('click', joinByCode);
document.getElementById('join-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinByCode();
});
document.getElementById('join-code-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

function joinByCode() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (code.length !== 4) { setLobbyError('방 코드는 4자리입니다.'); return; }
  setLobbyError('');
  socket.emit('joinRoom', { code, nickname: myNickname });
}

function setLobbyError(msg) {
  document.getElementById('lobby-error').textContent = msg;
}

// 방 목록 렌더링
socket.on('roomList', (rooms) => {
  const list = document.getElementById('room-list');
  if (!rooms || rooms.length === 0) {
    list.innerHTML = '<p class="empty-msg">열린 방이 없습니다.</p>';
    return;
  }
  list.innerHTML = rooms.map(r => {
    const full = r.playerCount >= r.maxPlayers;
    const members = r.members.map(m =>
      `<span style="color:${m.team === 'red' ? '#ff6b6b' : '#74b9ff'}">${m.nickname}</span>`
    ).join(', ');
    return `
      <div class="room-item">
        <div class="room-item-info">
          <span class="room-code-text">${r.code}</span>
          <span class="room-members">${members || '(비어있음)'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="room-count">${r.playerCount}/${r.maxPlayers}</span>
          ${full
            ? '<span class="room-full">가득 참</span>'
            : `<button class="btn btn-secondary btn-sm" onclick="joinRoom('${r.code}')">입장</button>`
          }
        </div>
      </div>`;
  }).join('');
});

window.joinRoom = function(code) {
  setLobbyError('');
  socket.emit('joinRoom', { code, nickname: myNickname });
};

// ── 방 생성/입장 응답 ─────────────────────────────────────
socket.on('roomCreated', ({ code }) => {
  enterGame(code);
});

socket.on('roomJoined', ({ code }) => {
  enterGame(code);
});

socket.on('joinError', (msg) => {
  setLobbyError(msg);
});

function enterGame(code) {
  myRoomCode = code;
  document.getElementById('room-code-display').textContent = code;
  document.getElementById('score-red').textContent  = '0';
  document.getElementById('score-blue').textContent = '0';
  document.getElementById('item-display').textContent = '아이템: 없음';
  document.getElementById('status-msg').textContent = '';
  showScreen('game');
  if (window.renderer) window.renderer.resize();
}

// 방 코드 클릭 → 복사
document.getElementById('room-code-display').addEventListener('click', () => {
  const code = myRoomCode;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const el = document.getElementById('room-code-display');
    el.textContent = '복사됨!';
    setTimeout(() => { el.textContent = code; }, 1200);
  });
});

// ── 게임 화면 버튼 ────────────────────────────────────────
document.getElementById('btn-leave-room').addEventListener('click', leaveAndGoLobby);
document.getElementById('btn-other-room').addEventListener('click', leaveAndGoLobby);

function leaveAndGoLobby() {
  socket.emit('leaveRoom');
  myRoomCode = '';
  showScreen('lobby');
  socket.emit('getRooms');
}

// ── 게임 소켓 이벤트 ─────────────────────────────────────
socket.on('init', (data) => {
  const teamName = data.team === 'red' ? '🔴 레드팀' : '🔵 블루팀';
  const msg = document.getElementById('status-msg');
  msg.textContent = `${teamName} ${data.nickname} 입장!`;
  setTimeout(() => { msg.textContent = ''; }, 2500);
});

socket.on('playerJoined', (data) => {
  const msg = document.getElementById('status-msg');
  const teamName = data.team === 'red' ? '🔴' : '🔵';
  msg.textContent = `${teamName} ${data.nickname} 님이 입장했습니다`;
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

socket.on('playerLeft', () => {
  socket.emit('getRooms');
});

socket.on('disconnect', () => {
  document.getElementById('status-msg').textContent = '서버와 연결이 끊겼습니다. 새로고침하세요.';
});

socket.on('gameState', (state) => {
  if (window.renderer && myRoomCode) {
    window.renderer.render(state, socket.id);
  }
});

socket.on('scoreUpdate', (scores) => {
  document.getElementById('score-red').textContent  = scores.red;
  document.getElementById('score-blue').textContent = scores.blue;
});

socket.on('goalScored', (data) => {
  const msg = document.getElementById('status-msg');
  msg.textContent = data.team === 'red' ? '🔴 레드 팀 골!' : '🔵 블루 팀 골!';
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

socket.on('itemUpdate', (item) => {
  const names = { missile: '🚀 미사일', lightning: '⚡ 번개', tornado: '🌀 돌풍' };
  document.getElementById('item-display').textContent = '아이템: ' + (names[item] || '없음');
});

// ── 키보드 입력 ──────────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
  if (!myRoomCode) return;
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = true;
  if (k === 'a') keys.a = true;
  if (k === 's') keys.s = true;
  if (k === 'd') keys.d = true;
  if (e.code === 'Space')                                { e.preventDefault(); socket.emit('kick'); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); socket.emit('useItem'); }
});

document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = false;
  if (k === 'a') keys.a = false;
  if (k === 's') keys.s = false;
  if (k === 'd') keys.d = false;
});

setInterval(() => {
  if (!myRoomCode) return;
  if (keys.w || keys.a || keys.s || keys.d) {
    socket.emit('move', { w: keys.w, a: keys.a, s: keys.s, d: keys.d });
  }
}, 1000 / 60);

// ── 원형 조이스틱 (모바일) ───────────────────────────────
function setupMobileControls() {
  const container = document.createElement('div');
  container.id = 'mobile-controls';
  container.innerHTML = `
    <div id="joystick-zone">
      <div id="joystick-base"><div id="joystick-knob"></div></div>
    </div>
    <div id="action-btns">
      <div class="action-btn" id="btn-kick">KICK</div>
      <div class="action-btn" id="btn-item">ITEM</div>
    </div>`;
  document.body.appendChild(container);

  const base   = document.getElementById('joystick-base');
  const knob   = document.getElementById('joystick-knob');
  const RADIUS = 45;
  let touching = false;

  function updateJoystick(cx, cy) {
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top  + rect.height / 2;
    let dx = cx - centerX, dy = cy - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > RADIUS) { dx = dx / dist * RADIUS; dy = dy / dist * RADIUS; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const t = RADIUS * 0.3;
    keys.w = dy < -t; keys.s = dy > t;
    keys.a = dx < -t; keys.d = dx > t;
  }

  function resetJoystick() {
    knob.style.transform = 'translate(0px, 0px)';
    keys.w = keys.s = keys.a = keys.d = false;
  }

  base.addEventListener('touchstart', (e) => { e.preventDefault(); touching = true; updateJoystick(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  base.addEventListener('touchmove',  (e) => { e.preventDefault(); if (touching) updateJoystick(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  base.addEventListener('touchend',   (e) => { e.preventDefault(); touching = false; resetJoystick(); }, { passive: false });

  document.getElementById('btn-kick').addEventListener('touchstart', (e) => {
    e.preventDefault(); if (myRoomCode) socket.emit('kick'); e.currentTarget.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-kick').addEventListener('touchend', (e) => { e.currentTarget.classList.remove('active'); });

  document.getElementById('btn-item').addEventListener('touchstart', (e) => {
    e.preventDefault(); if (myRoomCode) socket.emit('useItem'); e.currentTarget.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-item').addEventListener('touchend', (e) => { e.currentTarget.classList.remove('active'); });
}

setupMobileControls();

// ── 초기 화면 ────────────────────────────────────────────
document.getElementById('nickname-input').value = randomNick();
showScreen('nickname');
