// renderer.js - Canvas 렌더링 (Step 1: 빈 캔버스 초기화)

window.renderer = (() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const GAME_W = 800;
  const GAME_H = 600;

  // 캔버스 크기를 화면에 맞게 조정 (모바일 최적화)
  function resize() {
    const maxW = window.innerWidth - 4;
    const maxH = window.innerHeight - 4;
    const scale = Math.min(maxW / GAME_W, maxH / GAME_H, 1);
    canvas.style.width  = (GAME_W * scale) + 'px';
    canvas.style.height = (GAME_H * scale) + 'px';
    canvas.width  = GAME_W;
    canvas.height = GAME_H;
    drawWaiting();
  }

  function drawWaiting() {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Battle Soccer', GAME_W / 2, GAME_H / 2 - 20);
    ctx.font = '16px Arial';
    ctx.fillText('서버에 연결 중...', GAME_W / 2, GAME_H / 2 + 20);
  }

  // 서버 gameState를 받아 렌더링 (Step 2 이후 채워짐)
  function render(state, myId) {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    if (!state) return;

    // 필드 그라디언트
    drawField();

    // 벽/골대
    if (state.walls) drawWalls(state.walls);

    // 아이템 박스
    if (state.itemBoxes) drawItemBoxes(state.itemBoxes);

    // 토네이도
    if (state.tornados) drawTornados(state.tornados);

    // 공
    if (state.ball) drawBall(state.ball);

    // 플레이어
    if (state.players) drawPlayers(state.players, myId);

    // 미사일
    if (state.missiles) drawMissiles(state.missiles);

    // 폭발 이펙트
    if (state.explosions) drawExplosions(state.explosions);

    // 번개 이펙트
    if (state.lightnings) drawLightnings(state.lightnings);
  }

  function drawField() {
    // 잔디 느낌의 배경
    ctx.fillStyle = '#1a5c2a';
    ctx.fillRect(40, 40, GAME_W - 80, GAME_H - 80);

    // 중앙선
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(GAME_W / 2, 40);
    ctx.lineTo(GAME_W / 2, GAME_H - 40);
    ctx.stroke();
    ctx.setLineDash([]);

    // 중앙 원
    ctx.beginPath();
    ctx.arc(GAME_W / 2, GAME_H / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWalls(walls) {
    walls.forEach(w => {
      if (w.isGoal) {
        ctx.fillStyle = w.team === 'red' ? 'rgba(255,100,100,0.3)' : 'rgba(100,150,255,0.3)';
        ctx.strokeStyle = w.team === 'red' ? '#ff6b6b' : '#74b9ff';
      } else {
        ctx.fillStyle = 'rgba(180,180,200,0.8)';
        ctx.strokeStyle = '#aaa';
      }
      ctx.lineWidth = 2;
      ctx.fillRect(w.x - w.hw, w.y - w.hh, w.hw * 2, w.hh * 2);
      ctx.strokeRect(w.x - w.hw, w.y - w.hh, w.hw * 2, w.hh * 2);
    });
  }

  function drawBall(ball) {
    ctx.save();
    const grad = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#dddddd');
    grad.addColorStop(1, '#888888');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayers(players, myId) {
    players.forEach(p => {
      ctx.save();

      // 스턴 상태 표시
      if (p.stunned) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffff00';
      }

      // 팀 색상
      const color = p.team === 'red' ? '#ff6b6b' : '#74b9ff';
      const grad = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, p.r);
      grad.addColorStop(0, p.team === 'red' ? '#ffaaaa' : '#aad4ff');
      grad.addColorStop(1, color);

      ctx.fillStyle = grad;
      ctx.strokeStyle = p.id === myId ? '#ffd700' : (p.team === 'red' ? '#cc0000' : '#0055cc');
      ctx.lineWidth = p.id === myId ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 이름/번호 표시
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.floor(p.r * 0.8)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.number || '?', p.x, p.y);

      // 아이템 보유 표시
      if (p.item) {
        const icons = { missile: '🚀', lightning: '⚡', tornado: '🌀' };
        ctx.font = '12px Arial';
        ctx.fillText(icons[p.item] || '', p.x, p.y - p.r - 8);
      }

      ctx.restore();
    });
  }

  function drawItemBoxes(boxes) {
    boxes.forEach(b => {
      ctx.save();
      const t = Date.now() / 500;
      ctx.shadowBlur = 10 + Math.sin(t) * 5;
      ctx.shadowColor = '#ffd700';

      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#ff8c00';
      ctx.lineWidth = 2;
      const size = b.r * 1.4;
      ctx.beginPath();
      ctx.rect(b.x - size / 2, b.y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(size * 0.7)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', b.x, b.y);
      ctx.restore();
    });
  }

  function drawMissiles(missiles) {
    missiles.forEach(m => {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#ff4400';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff8800';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 불꽃
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.ellipse(-8, 0, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawExplosions(explosions) {
    explosions.forEach(e => {
      const progress = e.progress || 0; // 0~1
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      const r = e.radius * progress;
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#ffaa00');
      grad.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawLightnings(lightnings) {
    lightnings.forEach(l => {
      ctx.save();
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ffff00';
      ctx.globalAlpha = 0.8 + Math.random() * 0.2;
      ctx.beginPath();
      ctx.moveTo(l.fromX, l.fromY);
      // 지그재그 번개
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mx = l.fromX + (l.toX - l.fromX) * t + (Math.random() - 0.5) * 30;
        const my = l.fromY + (l.toY - l.fromY) * t + (Math.random() - 0.5) * 30;
        ctx.lineTo(mx, my);
      }
      ctx.lineTo(l.toX, l.toY);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawTornados(tornados) {
    tornados.forEach(t => {
      const time = Date.now() / 200;
      ctx.save();
      ctx.translate(t.x, t.y);
      for (let i = 0; i < 3; i++) {
        const angle = time + (i * Math.PI * 2 / 3);
        const r = t.radius;
        ctx.strokeStyle = `rgba(150,200,255,${0.6 - i * 0.15})`;
        ctx.lineWidth = 3 - i;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.4 + i * 0.3), angle, angle + Math.PI * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(150,200,255,0.15)';
      ctx.beginPath();
      ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  window.addEventListener('resize', resize);
  resize();

  return { render, resize };
})();
