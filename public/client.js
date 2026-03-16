// client.js - 소켓 통신 및 입력 처리

const socket = io('https://battle-soccer-production.up.railway.app', {
  transports: ['websocket', 'polling']
});

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
  if (window.renderer) window.renderer.render(state, socket.id);
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
  const itemNames = { missile: '🚀 미사일', lightning: '⚡ 번개', tornado: '🌀 돌풍' };
  document.getElementById('item-display').textContent = '아이템: ' + (itemNames[item] || '없음');
});

// ── 키보드 입력 처리 ─────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w') keys.w = true;
  if (key === 'a') keys.a = true;
  if (key === 's') keys.s = true;
  if (key === 'd') keys.d = true;
  if (e.code === 'Space')                              { e.preventDefault(); socket.emit('kick'); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); socket.emit('useItem'); }
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

// ── 원형 조이스틱 ────────────────────────────────────────
function setupMobileControls() {
  const container = document.createElement('div');
  container.id = 'mobile-controls';
  container.innerHTML = `
    <div id="joystick-zone">
      <div id="joystick-base">
        <div id="joystick-knob"></div>
      </div>
    </div>
    <div id="action-btns">
      <div class="action-btn" id="btn-kick">KICK</div>
      <div class="action-btn" id="btn-item">ITEM</div>
    </div>
  `;
  document.body.appendChild(container);

  const base  = document.getElementById('joystick-base');
  const knob  = document.getElementById('joystick-knob');
  const RADIUS = 45; // 조이스틱 최대 반경

  let touching = false;
  let baseX = 0, baseY = 0;

  function getBaseCenter() {
    const rect = base.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function updateJoystick(cx, cy) {
    const center = getBaseCenter();
    let dx = cx - center.x;
    let dy = cy - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > RADIUS) { dx = dx / dist * RADIUS; dy = dy / dist * RADIUS; }

    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const threshold = RADIUS * 0.3;
    keys.w = dy < -threshold;
    keys.s = dy >  threshold;
    keys.a = dx < -threshold;
    keys.d = dx >  threshold;
  }

  function resetJoystick() {
    knob.style.transform = 'translate(0px, 0px)';
    keys.w = keys.s = keys.a = keys.d = false;
  }

  base.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touching = true;
    updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touching) updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  base.addEventListener('touchend', (e) => {
    e.preventDefault();
    touching = false;
    resetJoystick();
  }, { passive: false });

  document.getElementById('btn-kick').addEventListener('touchstart', (e) => {
    e.preventDefault(); socket.emit('kick'); e.currentTarget.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-kick').addEventListener('touchend', (e) => {
    e.currentTarget.classList.remove('active');
  });

  document.getElementById('btn-item').addEventListener('touchstart', (e) => {
    e.preventDefault(); socket.emit('useItem'); e.currentTarget.classList.add('active');
  }, { passive: false });
  document.getElementById('btn-item').addEventListener('touchend', (e) => {
    e.currentTarget.classList.remove('active');
  });
}

setupMobileControls();
