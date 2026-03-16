// gameLogic.js - Matter.js 기반 서버 물리 엔진

const Matter = require('matter-js');
const ItemLogic = require('./itemLogic');

const { Engine, World, Bodies, Body, Events } = Matter;

const GAME_W = 800;
const GAME_H = 600;
const WALL_T = 20;
const GOAL_H = 160;
const PLAYER_R = 20;
const BALL_R = 14;
const ITEM_BOX_R = 14;

// 충돌 카테고리 (플레이어가 골대 안으로 못 들어가게)
const CAT_WALL          = 0x0001;
const CAT_PLAYER        = 0x0002;
const CAT_BALL          = 0x0004;
const CAT_GOAL_BLOCKER  = 0x0008;

const SPAWN_POSITIONS = {
  red:  [{ x: 200, y: GAME_H / 2 }, { x: 280, y: GAME_H / 2 - 80 }, { x: 280, y: GAME_H / 2 + 80 }],
  blue: [{ x: 600, y: GAME_H / 2 }, { x: 520, y: GAME_H / 2 - 80 }, { x: 520, y: GAME_H / 2 + 80 }]
};

class GameLogic {
  constructor(io) {
    this.io = io;
    this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
    this.world = this.engine.world;

    this.players   = {};
    this.ball      = null;
    this.walls     = [];
    this.goalSensors = [];
    this.itemBoxes = [];
    this.missiles  = [];
    this.explosions = [];
    this.lightnings = [];
    this.tornados  = [];

    this.scores    = { red: 0, blue: 0 };
    this.resetting = false;
    this.playerCount = 0;

    this.itemLogic = new ItemLogic(this);

    this._setupMap();
    this._setupBall();
    this._setupCollisions();
    this._startLoop();
    this._startItemSpawner();
  }

  // ── 맵 생성 ─────────────────────────────────────────────
  _setupMap() {
    const W = GAME_W, H = GAME_H;
    const goalY1 = H / 2 - GOAL_H / 2;
    const goalY2 = H / 2 + GOAL_H / 2;

    const wallOpts = {
      isStatic: true, friction: 0.1, restitution: 0.5,
      collisionFilter: { category: CAT_WALL, mask: CAT_WALL | CAT_PLAYER | CAT_BALL }
    };

    const wallDefs = [
      { x: W / 2,           y: WALL_T / 2,                  hw: W / 2,      hh: WALL_T / 2,          label: 'wall' },
      { x: W / 2,           y: H - WALL_T / 2,              hw: W / 2,      hh: WALL_T / 2,          label: 'wall' },
      { x: WALL_T / 2,      y: goalY1 / 2,                  hw: WALL_T / 2, hh: goalY1 / 2,          label: 'wall' },
      { x: WALL_T / 2,      y: goalY2 + (H - goalY2) / 2,  hw: WALL_T / 2, hh: (H - goalY2) / 2,   label: 'wall' },
      { x: W - WALL_T / 2, y: goalY1 / 2,                  hw: WALL_T / 2, hh: goalY1 / 2,          label: 'wall' },
      { x: W - WALL_T / 2, y: goalY2 + (H - goalY2) / 2,  hw: WALL_T / 2, hh: (H - goalY2) / 2,   label: 'wall' },
      { x: WALL_T / 2,      y: goalY1,                      hw: WALL_T / 2, hh: 5, label: 'goalPost', team: 'red'  },
      { x: WALL_T / 2,      y: goalY2,                      hw: WALL_T / 2, hh: 5, label: 'goalPost', team: 'red'  },
      { x: W - WALL_T / 2, y: goalY1,                      hw: WALL_T / 2, hh: 5, label: 'goalPost', team: 'blue' },
      { x: W - WALL_T / 2, y: goalY2,                      hw: WALL_T / 2, hh: 5, label: 'goalPost', team: 'blue' },
    ];

    wallDefs.forEach(def => {
      const body = Bodies.rectangle(def.x, def.y, def.hw * 2, def.hh * 2, {
        ...wallOpts, label: def.label || 'wall'
      });
      body.gameData = { isGoal: def.label === 'goalPost', team: def.team };
      World.add(this.world, body);
      this.walls.push({ body, def });
    });

    // 골 입구 플레이어 차단벽 (공은 통과, 플레이어는 통과 불가)
    const blockerOpts = {
      isStatic: true, isSensor: false, label: 'goalBlocker',
      collisionFilter: { category: CAT_GOAL_BLOCKER, mask: CAT_PLAYER }
    };
    const leftBlocker  = Bodies.rectangle(WALL_T, H / 2, WALL_T, GOAL_H, blockerOpts);
    const rightBlocker = Bodies.rectangle(W - WALL_T, H / 2, WALL_T, GOAL_H, blockerOpts);
    World.add(this.world, [leftBlocker, rightBlocker]);

    // 골 감지 센서
    const redGoalSensor = Bodies.rectangle(0, H / 2, WALL_T * 2, GOAL_H, {
      isStatic: true, isSensor: true, label: 'goalSensor'
    });
    redGoalSensor.gameData = { team: 'blue' };
    const blueGoalSensor = Bodies.rectangle(W, H / 2, WALL_T * 2, GOAL_H, {
      isStatic: true, isSensor: true, label: 'goalSensor'
    });
    blueGoalSensor.gameData = { team: 'red' };

    World.add(this.world, [redGoalSensor, blueGoalSensor]);
    this.goalSensors = [redGoalSensor, blueGoalSensor];
  }

  // ── 공 생성 ─────────────────────────────────────────────
  _setupBall() {
    this.ball = Bodies.circle(GAME_W / 2, GAME_H / 2, BALL_R, {
      label: 'ball',
      friction: 0.01, frictionAir: 0.015, restitution: 0.8, density: 0.002,
      collisionFilter: { category: CAT_BALL, mask: CAT_WALL | CAT_PLAYER }
    });
    World.add(this.world, this.ball);
  }

  // ── 충돌 이벤트 ─────────────────────────────────────────
  _setupCollisions() {
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(({ bodyA, bodyB }) => {
        this._handleCollision(bodyA, bodyB);
        this._handleCollision(bodyB, bodyA);
      });
    });
  }

  _handleCollision(a, b) {
    try {
      // 골 감지
      if (a.label === 'goalSensor' && b.label === 'ball' && !this.resetting) {
        this._onGoal(a.gameData.team);
      }
      // 아이템 박스 획득 (null 체크 포함)
      if (a.label === 'itemBox' && b.label === 'player' && b.gameData && b.gameData.socketId) {
        this._collectItem(a, b.gameData.socketId);
      }
    } catch (e) {
      console.error('충돌 처리 오류:', e.message);
    }
  }

  // ── 골 처리 ─────────────────────────────────────────────
  _onGoal(scoringTeam) {
    this.resetting = true;
    this.scores[scoringTeam]++;
    this.io.emit('goalScored', { team: scoringTeam });
    this.io.emit('scoreUpdate', this.scores);
    setTimeout(() => this._resetPositions(), 2000);
  }

  _resetPositions() {
    Body.setPosition(this.ball, { x: GAME_W / 2, y: GAME_H / 2 });
    Body.setVelocity(this.ball, { x: 0, y: 0 });

    const redPlayers  = Object.values(this.players).filter(p => p.team === 'red');
    const bluePlayers = Object.values(this.players).filter(p => p.team === 'blue');
    redPlayers.forEach((p, i) => {
      const pos = SPAWN_POSITIONS.red[i % SPAWN_POSITIONS.red.length];
      Body.setPosition(p.body, pos); Body.setVelocity(p.body, { x: 0, y: 0 });
    });
    bluePlayers.forEach((p, i) => {
      const pos = SPAWN_POSITIONS.blue[i % SPAWN_POSITIONS.blue.length];
      Body.setPosition(p.body, pos); Body.setVelocity(p.body, { x: 0, y: 0 });
    });
    this.resetting = false;
  }

  // ── 플레이어 추가/제거 ──────────────────────────────────
  addPlayer(socketId) {
    this.playerCount++;
    const team = this.playerCount % 2 === 1 ? 'red' : 'blue';
    const teamPlayers = Object.values(this.players).filter(p => p.team === team);
    const spawnPos = SPAWN_POSITIONS[team][teamPlayers.length % SPAWN_POSITIONS[team].length];

    const body = Bodies.circle(spawnPos.x, spawnPos.y, PLAYER_R, {
      label: 'player',
      friction: 0.05, frictionAir: 0.12, restitution: 0.3, density: 0.005,
      collisionFilter: { category: CAT_PLAYER, mask: CAT_WALL | CAT_PLAYER | CAT_BALL | CAT_GOAL_BLOCKER }
    });
    body.gameData = { socketId };
    World.add(this.world, body);

    this.players[socketId] = {
      id: socketId, body, team,
      number: this.playerCount,
      item: null, stunned: false, stunTimer: null,
      keys: { w: false, a: false, s: false, d: false },
    };
    return { team, number: this.playerCount };
  }

  removePlayer(socketId) {
    const p = this.players[socketId];
    if (!p) return;
    if (p.stunTimer) clearTimeout(p.stunTimer);
    World.remove(this.world, p.body);
    delete this.players[socketId];
  }

  // ── 입력 처리 ───────────────────────────────────────────
  handleMove(socketId, keys) {
    const p = this.players[socketId];
    if (!p) return;
    p.keys = keys;
  }

  handleKick(socketId) {
    const p = this.players[socketId];
    if (!p || p.stunned) return;

    const pPos = p.body.position;
    const bPos = this.ball.position;
    const dx = bPos.x - pPos.x;
    const dy = bPos.y - pPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < PLAYER_R + BALL_R + 15) {
      Body.applyForce(this.ball, bPos, {
        x: (dx / dist) * 0.03,
        y: (dy / dist) * 0.03,
      });
    }
  }

  // ── 아이템 박스 스폰 ────────────────────────────────────
  _startItemSpawner() {
    setInterval(() => {
      if (Object.keys(this.players).length === 0) return;
      this._spawnItemBox();
    }, 10000);
  }

  _spawnItemBox() {
    const margin = 100;
    const x = margin + Math.random() * (GAME_W - margin * 2);
    const y = margin + Math.random() * (GAME_H - margin * 2);
    const body = Bodies.circle(x, y, ITEM_BOX_R, {
      isStatic: true, isSensor: true, label: 'itemBox'
    });
    body.gameData = {};
    World.add(this.world, body);
    this.itemBoxes.push(body);
  }

  _collectItem(boxBody, socketId) {
    const p = this.players[socketId];
    if (!p || p.item) return;
    // 중복 처리 방지
    if (!this.itemBoxes.includes(boxBody)) return;

    const items = ['missile', 'lightning', 'tornado'];
    p.item = items[Math.floor(Math.random() * items.length)];
    World.remove(this.world, boxBody);
    this.itemBoxes = this.itemBoxes.filter(b => b !== boxBody);
    this.io.to(socketId).emit('itemUpdate', p.item);
  }

  // ── 게임 루프 ───────────────────────────────────────────
  _startLoop() {
    const TICK = 1000 / 60;
    setInterval(() => {
      this._applyPlayerForces();
      this._updateMissiles();
      this._updateTornados();
      this._updateExplosions();
      this._updateLightnings();
      Engine.update(this.engine, TICK);
      this._broadcast();
    }, TICK);
  }

  _applyPlayerForces() {
    Object.values(this.players).forEach(p => {
      const { keys, body, stunned } = p;
      const forceMag = stunned ? 0.003 : 0.006; // 이동속도 향상, 스턴 시 절반
      let fx = 0, fy = 0;
      if (keys.w) fy -= 1;
      if (keys.s) fy += 1;
      if (keys.a) fx -= 1;
      if (keys.d) fx += 1;
      if (fx !== 0 || fy !== 0) {
        const len = Math.sqrt(fx * fx + fy * fy);
        Body.applyForce(body, body.position, { x: (fx / len) * forceMag, y: (fy / len) * forceMag });
      }
    });
  }

  _updateMissiles()   { this.itemLogic.updateMissiles(); }
  _updateTornados()   { this.itemLogic.updateTornados(); }

  _updateExplosions() {
    this.explosions = this.explosions.filter(e => { e.progress += 0.05; return e.progress < 1; });
  }
  _updateLightnings() {
    this.lightnings = this.lightnings.filter(l => { l.ttl--; return l.ttl > 0; });
  }

  // ── 브로드캐스트 ────────────────────────────────────────
  _broadcast() {
    const state = {
      players: Object.values(this.players).map(p => ({
        id: p.id, x: p.body.position.x, y: p.body.position.y,
        r: PLAYER_R, team: p.team, number: p.number,
        item: p.item, stunned: p.stunned,
      })),
      ball: { x: this.ball.position.x, y: this.ball.position.y, r: BALL_R },
      walls: this.walls.map(({ body, def }) => ({
        x: body.position.x, y: body.position.y,
        hw: def.hw, hh: def.hh,
        isGoal: body.gameData.isGoal, team: body.gameData.team,
      })),
      itemBoxes:  this.itemBoxes.map(b => ({ x: b.position.x, y: b.position.y, r: ITEM_BOX_R })),
      missiles:   this.missiles.map(m => ({ x: m.body.position.x, y: m.body.position.y, angle: m.angle })),
      explosions: this.explosions.map(e => ({ x: e.x, y: e.y, radius: e.radius, progress: e.progress })),
      lightnings: this.lightnings.map(l => ({ fromX: l.fromX, fromY: l.fromY, toX: l.toX, toY: l.toY })),
      tornados:   this.tornados.map(t => ({ x: t.body.position.x, y: t.body.position.y, radius: t.radius })),
    };
    this.io.emit('gameState', state);
  }

  // ── 아이템 사용 ──────────────────────────────────────────
  useItem(socketId) { this.itemLogic.use(socketId); }

  getPlayer(socketId) { return this.players[socketId]; }
}

module.exports = GameLogic;
