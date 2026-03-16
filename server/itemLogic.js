// itemLogic.js - 아이템 발동 로직

const Matter = require('matter-js');
const { Body, Bodies, World, Vector } = Matter;

const GAME_W = 800;
const GAME_H = 600;
const PLAYER_R = 20;
const BALL_R = 14;

class ItemLogic {
  constructor(game) {
    this.game = game;
  }

  /**
   * 소켓ID의 플레이어가 보유한 아이템을 발동
   */
  use(socketId) {
    const p = this.game.players[socketId];
    if (!p || !p.item) return;

    const item = p.item;
    p.item = null;
    this.game.io.to(socketId).emit('itemUpdate', null);

    switch (item) {
      case 'missile':   this._fireMissile(p); break;
      case 'lightning': this._fireLightning(p); break;
      case 'tornado':   this._createTornado(p); break;
    }
  }

  // ── 미사일 ───────────────────────────────────────────────
  _fireMissile(player) {
    const { body } = player;
    const pos = body.position;
    const vel = body.velocity;

    // 이동 방향 또는 기본값(오른쪽)으로 발사
    let dx = vel.x, dy = vel.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.1) {
      dx = player.team === 'red' ? 1 : -1;
      dy = 0;
    } else {
      dx /= speed;
      dy /= speed;
    }

    const MISSILE_SPEED = 10;
    const missileBody = Bodies.circle(pos.x + dx * 30, pos.y + dy * 30, 6, {
      label: 'missile',
      isSensor: true,
      frictionAir: 0,
    });
    missileBody.gameData = { ownerId: player.id, ownerTeam: player.team };

    Body.setVelocity(missileBody, { x: dx * MISSILE_SPEED, y: dy * MISSILE_SPEED });
    World.add(this.game.world, missileBody);

    this.game.missiles.push({
      body: missileBody,
      dx, dy,
      ttl: 120, // 2초 (60fps)
      exploded: false,
    });
  }

  /**
   * 미사일 틱 처리 (gameLogic._updateMissiles에서 호출)
   */
  updateMissiles() {
    const toRemove = [];

    this.game.missiles.forEach(m => {
      if (m.exploded) { toRemove.push(m); return; }
      m.ttl--;

      const mPos = m.body.position;

      // 경계 충돌 확인
      if (mPos.x < 10 || mPos.x > GAME_W - 10 || mPos.y < 10 || mPos.y > GAME_H - 10) {
        this._explodeMissileAt(m, mPos.x, mPos.y);
        toRemove.push(m);
        return;
      }

      // 공과의 충돌
      const bPos = this.game.ball.position;
      if (this._dist(mPos, bPos) < BALL_R + 6) {
        this._explodeMissileAt(m, mPos.x, mPos.y);
        toRemove.push(m);
        return;
      }

      // 플레이어와 충돌
      for (const p of Object.values(this.game.players)) {
        if (p.id === m.body.gameData.ownerId) continue;
        if (this._dist(mPos, p.body.position) < PLAYER_R + 6) {
          this._explodeMissileAt(m, mPos.x, mPos.y);
          toRemove.push(m);
          return;
        }
      }

      if (m.ttl <= 0) {
        this._explodeMissileAt(m, mPos.x, mPos.y);
        toRemove.push(m);
      }
    });

    toRemove.forEach(m => {
      World.remove(this.game.world, m.body);
      this.game.missiles = this.game.missiles.filter(x => x !== m);
    });
  }

  _explodeMissileAt(missile, x, y) {
    if (missile.exploded) return;
    missile.exploded = true;

    const EXPLOSION_RADIUS = 100;
    const FORCE_MAG = 0.12;

    // 폭발 이펙트 등록
    this.game.explosions.push({ x, y, radius: EXPLOSION_RADIUS, progress: 0 });

    // 공에 넉백
    const bPos = this.game.ball.position;
    const bd = this._dist({ x, y }, bPos);
    if (bd < EXPLOSION_RADIUS) {
      const factor = (1 - bd / EXPLOSION_RADIUS) * FORCE_MAG;
      const norm = this._normalize({ x: bPos.x - x, y: bPos.y - y });
      Body.applyForce(this.game.ball, bPos, { x: norm.x * factor, y: norm.y * factor });
    }

    // 플레이어에 넉백
    Object.values(this.game.players).forEach(p => {
      const pd = this._dist({ x, y }, p.body.position);
      if (pd < EXPLOSION_RADIUS) {
        const factor = (1 - pd / EXPLOSION_RADIUS) * FORCE_MAG * 1.5;
        const norm = this._normalize({ x: p.body.position.x - x, y: p.body.position.y - y });
        Body.applyForce(p.body, p.body.position, { x: norm.x * factor, y: norm.y * factor });
      }
    });
  }

  // ── 번개 ─────────────────────────────────────────────────
  _fireLightning(player) {
    const ball = this.game.ball;
    const bPos = ball.position;

    // 상대팀 중 공과 가장 가까운 플레이어 선택
    let target = null;
    let minDist = Infinity;
    Object.values(this.game.players).forEach(p => {
      if (p.team === player.team) return;
      const d = this._dist(p.body.position, bPos);
      if (d < minDist) { minDist = d; target = p; }
    });

    if (!target) return;

    const tPos = target.body.position;
    const pPos = player.body.position;

    // 번개 이펙트 등록 (TTL 30 ≈ 0.5초)
    this.game.lightnings.push({
      fromX: pPos.x, fromY: pPos.y,
      toX: tPos.x,   toY: tPos.y,
      ttl: 30,
    });

    // 스턴 적용
    this._applyStun(target, 2000);
  }

  _applyStun(player, durationMs) {
    if (player.stunTimer) clearTimeout(player.stunTimer);
    player.stunned = true;
    player.stunTimer = setTimeout(() => {
      player.stunned = false;
      player.stunTimer = null;
    }, durationMs);
  }

  // ── 돌풍(토네이도) ───────────────────────────────────────
  _createTornado(player) {
    const { body } = player;
    const vel = body.velocity;
    const pos = body.position;

    // 플레이어 앞에 배치
    let dx = vel.x, dy = vel.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.1) { dx = player.team === 'red' ? 1 : -1; dy = 0; }
    else { dx /= speed; dy /= speed; }

    const tx = Math.max(60, Math.min(GAME_W - 60, pos.x + dx * 60));
    const ty = Math.max(60, Math.min(GAME_H - 60, pos.y + dy * 60));

    const TORNADO_RADIUS = 70;

    const sensorBody = Bodies.circle(tx, ty, TORNADO_RADIUS, {
      isStatic: true,
      isSensor: true,
      label: 'tornado',
    });
    World.add(this.game.world, sensorBody);

    const tornado = {
      body: sensorBody,
      radius: TORNADO_RADIUS,
      ownerTeam: player.team,
      ttl: 300, // 5초 (60fps)
    };
    this.game.tornados.push(tornado);
  }

  /**
   * 토네이도 틱 처리 (gameLogic._updateTornados에서 호출)
   */
  updateTornados() {
    const toRemove = [];

    this.game.tornados.forEach(t => {
      t.ttl--;
      if (t.ttl <= 0) { toRemove.push(t); return; }

      const tPos = t.body.position;
      const FORCE_MAG = 0.004;

      // 공에 힘 적용
      const bPos = this.game.ball.position;
      const bd = this._dist(tPos, bPos);
      if (bd < t.radius) {
        const norm = this._normalize({ x: bPos.x - tPos.x, y: bPos.y - tPos.y });
        // 회전 + 밀어내기 혼합
        const tangent = { x: -norm.y, y: norm.x };
        Body.applyForce(this.game.ball, bPos, {
          x: (tangent.x * 0.6 + norm.x * 0.4) * FORCE_MAG * 2,
          y: (tangent.y * 0.6 + norm.y * 0.4) * FORCE_MAG * 2,
        });
      }

      // 플레이어에 힘 적용
      Object.values(this.game.players).forEach(p => {
        const pd = this._dist(tPos, p.body.position);
        if (pd < t.radius) {
          const norm = this._normalize({ x: p.body.position.x - tPos.x, y: p.body.position.y - tPos.y });
          const tangent = { x: -norm.y, y: norm.x };
          Body.applyForce(p.body, p.body.position, {
            x: (tangent.x * 0.6 + norm.x * 0.4) * FORCE_MAG,
            y: (tangent.y * 0.6 + norm.y * 0.4) * FORCE_MAG,
          });
        }
      });
    });

    toRemove.forEach(t => {
      World.remove(this.game.world, t.body);
      this.game.tornados = this.game.tornados.filter(x => x !== t);
    });
  }

  // ── 유틸 ─────────────────────────────────────────────────
  _dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  }
}

module.exports = ItemLogic;
