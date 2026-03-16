// itemLogic.js - 아이템 발동 로직

const Matter = require('matter-js');
const { Body, Bodies, World } = Matter;

const GAME_W = 800;
const GAME_H = 600;
const PLAYER_R = 20;
const BALL_R = 14;

class ItemLogic {
  constructor(game) {
    this.game = game;
  }

  use(socketId) {
    try {
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
    } catch (e) {
      console.error('[itemLogic.use] 오류:', e.message);
    }
  }

  // ── 미사일 ───────────────────────────────────────────────
  _fireMissile(player) {
    const { body } = player;
    const pos = body.position;
    const vel = body.velocity;

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
      angle: Math.atan2(dy, dx),
      ttl: 120,
      exploded: false,
      inWorld: true,
    });
  }

  updateMissiles() {
    try {
      const toRemove = [];

      this.game.missiles.forEach(m => {
        if (m.exploded || !m.inWorld) { toRemove.push(m); return; }
        m.ttl--;

        const mPos = m.body.position;

        // 경계 충돌
        if (mPos.x < 15 || mPos.x > GAME_W - 15 || mPos.y < 15 || mPos.y > GAME_H - 15) {
          this._explodeMissileAt(m, mPos.x, mPos.y);
          toRemove.push(m);
          return;
        }

        // 공과 충돌
        if (this.game.ball) {
          const bPos = this.game.ball.position;
          if (this._dist(mPos, bPos) < BALL_R + 6) {
            this._explodeMissileAt(m, mPos.x, mPos.y);
            toRemove.push(m);
            return;
          }
        }

        // 플레이어와 충돌
        const ownerId = m.body.gameData && m.body.gameData.ownerId;
        for (const p of Object.values(this.game.players)) {
          if (p.id === ownerId) continue;
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
        try {
          if (m.inWorld) {
            World.remove(this.game.world, m.body);
            m.inWorld = false;
          }
        } catch (_) {}
        this.game.missiles = this.game.missiles.filter(x => x !== m);
      });
    } catch (e) {
      console.error('[itemLogic.updateMissiles] 오류:', e.message);
    }
  }

  _explodeMissileAt(missile, x, y) {
    if (missile.exploded) return;
    missile.exploded = true;

    const EXPLOSION_RADIUS = 100;
    const FORCE_MAG = 0.12;

    this.game.explosions.push({ x, y, radius: EXPLOSION_RADIUS, progress: 0 });

    try {
      if (this.game.ball) {
        const bPos = this.game.ball.position;
        const bd = this._dist({ x, y }, bPos);
        if (bd < EXPLOSION_RADIUS) {
          const factor = (1 - bd / EXPLOSION_RADIUS) * FORCE_MAG;
          const norm = this._normalize({ x: bPos.x - x, y: bPos.y - y });
          Body.applyForce(this.game.ball, bPos, { x: norm.x * factor, y: norm.y * factor });
        }
      }

      Object.values(this.game.players).forEach(p => {
        try {
          const pd = this._dist({ x, y }, p.body.position);
          if (pd < EXPLOSION_RADIUS) {
            const factor = (1 - pd / EXPLOSION_RADIUS) * FORCE_MAG * 1.5;
            const norm = this._normalize({ x: p.body.position.x - x, y: p.body.position.y - y });
            Body.applyForce(p.body, p.body.position, { x: norm.x * factor, y: norm.y * factor });
          }
        } catch (_) {}
      });
    } catch (e) {
      console.error('[itemLogic._explodeMissileAt] 오류:', e.message);
    }
  }

  // ── 번개 ─────────────────────────────────────────────────
  _fireLightning(player) {
    try {
      const bPos = this.game.ball.position;
      let target = null;
      let minDist = Infinity;

      Object.values(this.game.players).forEach(p => {
        if (p.team === player.team) return;
        const d = this._dist(p.body.position, bPos);
        if (d < minDist) { minDist = d; target = p; }
      });

      if (!target) return;

      this.game.lightnings.push({
        fromX: player.body.position.x, fromY: player.body.position.y,
        toX: target.body.position.x,   toY: target.body.position.y,
        ttl: 30,
      });

      this._applyStun(target, 2000);
    } catch (e) {
      console.error('[itemLogic._fireLightning] 오류:', e.message);
    }
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
    try {
      const { body } = player;
      const vel = body.velocity;
      const pos = body.position;

      let dx = vel.x, dy = vel.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed < 0.1) { dx = player.team === 'red' ? 1 : -1; dy = 0; }
      else { dx /= speed; dy /= speed; }

      const tx = Math.max(60, Math.min(GAME_W - 60, pos.x + dx * 60));
      const ty = Math.max(60, Math.min(GAME_H - 60, pos.y + dy * 60));
      const TORNADO_RADIUS = 70;

      const sensorBody = Bodies.circle(tx, ty, TORNADO_RADIUS, {
        isStatic: true, isSensor: true, label: 'tornado',
      });
      World.add(this.game.world, sensorBody);

      this.game.tornados.push({
        body: sensorBody,
        radius: TORNADO_RADIUS,
        ownerTeam: player.team,
        ttl: 300,
        inWorld: true,
      });
    } catch (e) {
      console.error('[itemLogic._createTornado] 오류:', e.message);
    }
  }

  updateTornados() {
    try {
      const toRemove = [];

      this.game.tornados.forEach(t => {
        t.ttl--;
        if (t.ttl <= 0 || !t.inWorld) { toRemove.push(t); return; }

        try {
          const tPos = t.body.position;
          const FORCE_MAG = 0.004;

          if (this.game.ball) {
            const bPos = this.game.ball.position;
            const bd = this._dist(tPos, bPos);
            if (bd < t.radius) {
              const norm = this._normalize({ x: bPos.x - tPos.x, y: bPos.y - tPos.y });
              const tangent = { x: -norm.y, y: norm.x };
              Body.applyForce(this.game.ball, bPos, {
                x: (tangent.x * 0.6 + norm.x * 0.4) * FORCE_MAG * 2,
                y: (tangent.y * 0.6 + norm.y * 0.4) * FORCE_MAG * 2,
              });
            }
          }

          Object.values(this.game.players).forEach(p => {
            try {
              const pd = this._dist(tPos, p.body.position);
              if (pd < t.radius) {
                const norm = this._normalize({ x: p.body.position.x - tPos.x, y: p.body.position.y - tPos.y });
                const tangent = { x: -norm.y, y: norm.x };
                Body.applyForce(p.body, p.body.position, {
                  x: (tangent.x * 0.6 + norm.x * 0.4) * FORCE_MAG,
                  y: (tangent.y * 0.6 + norm.y * 0.4) * FORCE_MAG,
                });
              }
            } catch (_) {}
          });
        } catch (e) {
          console.error('[itemLogic.updateTornados tick] 오류:', e.message);
          toRemove.push(t);
        }
      });

      toRemove.forEach(t => {
        try {
          if (t.inWorld) {
            World.remove(this.game.world, t.body);
            t.inWorld = false;
          }
        } catch (_) {}
        this.game.tornados = this.game.tornados.filter(x => x !== t);
      });
    } catch (e) {
      console.error('[itemLogic.updateTornados] 오류:', e.message);
    }
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
