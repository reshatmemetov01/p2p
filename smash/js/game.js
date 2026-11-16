/* =========================================================================
   Крушитель — запусти тряпичную куклу из катапульты, лети далеко и круши
   ящики, бочки и TNT. Физика на Matter.js, рендер — свой на Canvas.
   ========================================================================= */
(function () {
  'use strict';

  const { Engine, Composite, Bodies, Body, Constraint, Events, Vector } = Matter;

  const SAVE_KEY = 'smash_save_v1';
  const GROUND_Y = 620;          // верх земли (мировые координаты)
  const START_X = 130;           // позиция катапульты
  const WORLD_END = 11000;

  // ---- Состояние ----
  let engine, world;
  let W = 0, H = 0;
  let camX = 0, camY = 0;
  let mode = 'ready';            // ready | aim | fly | end
  let rag = null;                // {parts:[], torso, head}
  let obstacles = [];            // динамические тела с gameType
  let particles = [];
  let coins = 0, runCoins = 0, dist = 0, bestDist = 0;
  let boostsLeft = 0;
  let lowSpeedTime = 0;
  let launchedX = START_X;

  let upg = { power: 0, bounce: 0, boost: 0 }; // уровни прокачки

  // Прицеливание
  let aiming = false, aimStart = null, aimCur = null;

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // ===== Сохранение =====
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, upg, bestDist })); } catch (e) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s) { coins = s.coins || 0; upg = Object.assign(upg, s.upg || {}); bestDist = s.bestDist || 0; }
    } catch (e) {}
  }

  // ===== Инициализация =====
  function init() {
    load();
    resize();
    window.addEventListener('resize', resize);
    engine = Engine.create();
    engine.gravity.y = 1.1;
    world = engine.world;
    buildWorld();
    bindInput();
    updateHUD();
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===== Мир =====
  function buildWorld() {
    Composite.clear(world, false);
    obstacles = [];
    particles = [];

    // Земля
    const ground = Bodies.rectangle(WORLD_END / 2, GROUND_Y + 400, WORLD_END + 2000, 800, { isStatic: true, friction: 0.9 });
    ground.label = 'ground';
    Composite.add(world, ground);

    // Препятствия вдоль трассы
    let x = 650;
    while (x < WORLD_END - 400) {
      const kind = Math.random();
      if (kind < 0.5) {
        // стопка ящиков
        const cols = 1 + Math.floor(Math.random() * 2);
        const rows = 1 + Math.floor(Math.random() * 3);
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++)
            addCrate(x + c * 34, GROUND_Y - 17 - r * 34);
        x += cols * 34 + 120 + Math.random() * 160;
      } else if (kind < 0.72) {
        addBarrel(x, GROUND_Y - 26);
        x += 120 + Math.random() * 160;
      } else if (kind < 0.86) {
        addTNT(x, GROUND_Y - 24);
        x += 160 + Math.random() * 180;
      } else {
        addTrampoline(x, GROUND_Y - 10);
        x += 180 + Math.random() * 200;
      }
    }
  }

  function addCrate(x, y) {
    const b = Bodies.rectangle(x, y, 32, 32, { friction: 0.6, restitution: 0.1, density: 0.004 });
    b.label = 'crate'; b.gameType = 'crate';
    Composite.add(world, b); obstacles.push(b);
  }
  function addBarrel(x, y) {
    const b = Bodies.rectangle(x, y, 32, 48, { friction: 0.5, restitution: 0.25, density: 0.005, chamfer: { radius: 8 } });
    b.label = 'barrel'; b.gameType = 'barrel';
    Composite.add(world, b); obstacles.push(b);
  }
  function addTNT(x, y) {
    const b = Bodies.rectangle(x, y, 34, 40, { friction: 0.5, restitution: 0.2, density: 0.004 });
    b.label = 'tnt'; b.gameType = 'tnt';
    Composite.add(world, b); obstacles.push(b);
  }
  function addTrampoline(x, y) {
    const b = Bodies.rectangle(x, y, 90, 16, { isStatic: true, restitution: 1.8 });
    b.label = 'tramp'; b.gameType = 'tramp';
    Composite.add(world, b); obstacles.push(b);
  }

  // ===== Кукла (ragdoll) =====
  function buildRagdoll(x, y) {
    const group = Body.nextGroup(true); // части не сталкиваются между собой
    const opt = (type, color) => ({
      collisionFilter: { group }, friction: 0.4, restitution: 0.3 + upg.bounce * 0.05,
      density: 0.0012, gameType: type, gameColor: color, label: 'rag',
    });
    const head = Bodies.circle(x, y - 42, 15, opt('head', '#f4c48a'));
    head.gameR = 15;
    const torso = Bodies.rectangle(x, y - 8, 24, 46, opt('torso', '#e85a4f')); torso.gameW = 24; torso.gameH = 46;
    const armL = Bodies.rectangle(x - 20, y - 12, 10, 36, opt('arm', '#f4c48a')); armL.gameW = 10; armL.gameH = 36;
    const armR = Bodies.rectangle(x + 20, y - 12, 10, 36, opt('arm', '#f4c48a')); armR.gameW = 10; armR.gameH = 36;
    const legL = Bodies.rectangle(x - 8, y + 34, 12, 40, opt('leg', '#3a4a8c')); legL.gameW = 12; legL.gameH = 40;
    const legR = Bodies.rectangle(x + 8, y + 34, 12, 40, opt('leg', '#3a4a8c')); legR.gameW = 12; legR.gameH = 40;

    const parts = [head, torso, armL, armR, legL, legR];
    const stiff = 0.7;
    const cons = [
      joint(head, torso, 0, 12, 0, -23, stiff),
      joint(armL, torso, 0, -16, -12, -18, stiff),
      joint(armR, torso, 0, -16, 12, -18, stiff),
      joint(legL, torso, 0, -18, -7, 22, stiff),
      joint(legR, torso, 0, -18, 7, 22, stiff),
    ];
    Composite.add(world, parts);
    Composite.add(world, cons);
    rag = { parts, torso, head };
  }
  function joint(a, b, ax, ay, bx, by, stiffness) {
    return Constraint.create({ bodyA: a, pointA: { x: ax, y: ay }, bodyB: b, pointB: { x: bx, y: by }, stiffness, length: 0, damping: 0.1 });
  }

  function removeRagdoll() {
    if (!rag) return;
    Composite.allConstraints(world).forEach((c) => { if ((c.bodyA && c.bodyA.label === 'rag') || (c.bodyB && c.bodyB.label === 'rag')) Composite.remove(world, c); });
    rag.parts.forEach((p) => Composite.remove(world, p));
    rag = null;
  }

  // ===== Игровой цикл =====
  function startRun() {
    hideScreens();
    buildWorld();
    removeRagdoll();
    buildRagdoll(START_X, GROUND_Y - 50);
    runCoins = 0; dist = 0; launchedX = START_X;
    boostsLeft = 1 + upg.boost;
    camX = 0; camY = 0;
    mode = 'aim';
    lowSpeedTime = 0;
    $('tap-hint').textContent = 'Тяни в сторону запуска и отпусти';
    updateHUD();
  }

  function launch(vx, vy) {
    if (mode !== 'aim' || !rag) return;
    mode = 'fly';
    $('tap-hint').textContent = 'Нажми в полёте — буст 🚀';
    rag.parts.forEach((p) => {
      Body.setVelocity(p, { x: vx, y: vy });
      Body.setAngularVelocity(p, (Math.random() - 0.5) * 0.4);
    });
    if (window.GameAudio) GameAudio.sfx('power');
  }

  function boost() {
    if (mode !== 'fly' || boostsLeft <= 0 || !rag) return;
    boostsLeft--;
    rag.parts.forEach((p) => Body.setVelocity(p, { x: p.velocity.x + 10, y: p.velocity.y - 5 }));
    spawn(rag.torso.position.x, rag.torso.position.y, '#00e0c6', 10);
    if (window.GameAudio) GameAudio.sfx('move');
    updateHUD();
  }

  function endRun() {
    if (mode === 'end') return;
    mode = 'end';
    coins += runCoins;
    if (dist > bestDist) bestDist = dist;
    save();
    $('end-dist').textContent = dist;
    $('end-coins').textContent = runCoins;
    $('tap-hint').textContent = '';
    $('end').classList.remove('hidden');
    if (window.GameAudio) GameAudio.sfx('place');
  }

  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min(ts - last, 50) : 16;
    last = ts;
    if (mode === 'fly' || mode === 'aim') Engine.update(engine, dt);
    update(dt / 1000);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (rag) {
      const t = rag.torso;
      // камера
      const tx = Math.max(0, t.position.x - W * 0.32);
      const ty = Math.min(0, t.position.y - H * 0.5);
      camX += (tx - camX) * Math.min(1, dt * 6);
      camY += (ty - camY) * Math.min(1, dt * 6);

      if (mode === 'fly') {
        dist = Math.max(dist, Math.round((t.position.x - START_X) / 12));
        updateHUD();
        const sp = Math.hypot(t.velocity.x, t.velocity.y);
        if (sp < 1.4) { lowSpeedTime += dt; if (lowSpeedTime > 0.9) endRun(); }
        else lowSpeedTime = 0;
        if (t.position.x > WORLD_END - 300) endRun();
      }
    }
    // частицы
    for (const p of particles) { p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.5; }
    particles = particles.filter((p) => p.life > 0);
  }

  // ===== Столкновения =====
  function setupCollisions() {
    Events.on(engine, 'collisionStart', (ev) => {
      for (const pair of ev.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        const ragBody = a.label === 'rag' ? a : (b.label === 'rag' ? b : null);
        const other = ragBody === a ? b : a;
        if (!ragBody) continue;
        const sp = Math.hypot(ragBody.velocity.x, ragBody.velocity.y);
        if (other.gameType === 'crate' && !other.smashed && sp > 5) {
          other.smashed = true;
          Composite.remove(world, other);
          runCoins += 5; spawn(other.position.x, other.position.y, '#c79a5a', 10);
          if (window.GameAudio) GameAudio.sfx('clear');
          updateHUD();
        } else if (other.gameType === 'barrel' && !other.smashed && sp > 6) {
          other.smashed = true;
          Composite.remove(world, other);
          runCoins += 8; spawn(other.position.x, other.position.y, '#4a8c3f', 12);
          if (window.GameAudio) GameAudio.sfx('clear');
          updateHUD();
        } else if (other.gameType === 'tnt' && !other.exploded && sp > 4) {
          other.exploded = true;
          explode(other.position.x, other.position.y);
          Composite.remove(world, other);
        }
      }
    });
  }

  function explode(x, y) {
    runCoins += 20;
    spawn(x, y, '#ff7a3f', 26);
    if (rag) rag.parts.forEach((p) => {
      const dx = p.position.x - x, dy = p.position.y - y;
      const d = Math.max(30, Math.hypot(dx, dy));
      const f = 22 / d;
      Body.setVelocity(p, { x: p.velocity.x + dx * f, y: p.velocity.y + dy * f - 6 });
    });
    if (window.GameAudio) GameAudio.sfx('fail');
    updateHUD();
  }

  function spawn(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, color });
    }
  }

  // ===== Рендер =====
  function render() {
    // небо
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a3d7a'); g.addColorStop(0.6, '#4a7fa5'); g.addColorStop(1, '#7fb5c9');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-camX, -camY);

    // земля
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(camX - 50, GROUND_Y, W + 100, H + Math.abs(camY) + 200);
    ctx.fillStyle = '#4a8c3f';
    ctx.fillRect(camX - 50, GROUND_Y, W + 100, 14);

    // катапульта (визуал)
    drawLauncher();

    // препятствия
    for (const o of obstacles) {
      if (o.gameType === 'crate' && o.smashed) continue;
      if ((o.gameType === 'barrel' || o.gameType === 'tnt') && (o.smashed || o.exploded)) continue;
      drawBody(o);
    }

    // кукла
    if (rag) rag.parts.forEach(drawRagPart);

    // частицы
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // прицел (поверх, в экранных координатах)
    if (mode === 'aim' && aiming && aimStart && aimCur) drawAim();
  }

  function drawLauncher() {
    ctx.save();
    ctx.translate(START_X, GROUND_Y);
    ctx.fillStyle = '#5a3d23';
    ctx.fillRect(-26, -8, 52, 16);
    ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-30, 40); ctx.moveTo(18, 0); ctx.lineTo(30, 40); ctx.stroke();
    ctx.restore();
  }

  function drawBody(b) {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    if (b.gameType === 'crate') {
      rr(-16, -16, 32, 32, 4); ctx.fillStyle = '#b07a3a'; ctx.fill();
      ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, -16); ctx.lineTo(16, 16); ctx.moveTo(16, -16); ctx.lineTo(-16, 16); ctx.stroke();
    } else if (b.gameType === 'barrel') {
      rr(-16, -24, 32, 48, 8); ctx.fillStyle = '#5a8c4a'; ctx.fill();
      ctx.strokeStyle = '#3a5f30'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(16, -8); ctx.moveTo(-16, 8); ctx.lineTo(16, 8); ctx.stroke();
    } else if (b.gameType === 'tnt') {
      rr(-17, -20, 34, 40, 4); ctx.fillStyle = '#d63a3a'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 0);
    } else if (b.gameType === 'tramp') {
      rr(-45, -8, 90, 16, 8); ctx.fillStyle = '#00e0c6'; ctx.fill();
      ctx.fillStyle = '#009e8c'; ctx.fillRect(-45, 2, 90, 6);
    }
    ctx.restore();
  }

  function drawRagPart(b) {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = b.gameColor;
    if (b.gameType === 'head') {
      ctx.beginPath(); ctx.arc(0, 0, b.gameR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(-5, -2, 2.2, 0, 6.3); ctx.arc(5, -2, 2.2, 0, 6.3); ctx.fill();
      // шляпа
      ctx.fillStyle = '#7c5cff'; rr(-13, -16, 26, 8, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -14, 8, Math.PI, 0); ctx.fill();
    } else {
      rr(-b.gameW / 2, -b.gameH / 2, b.gameW, b.gameH, 4); ctx.fill();
    }
    ctx.restore();
  }

  function drawAim() {
    const dx = aimCur.x - aimStart.x, dy = aimCur.y - aimStart.y;
    const len = Math.min(Math.hypot(dx, dy), 200);
    const ang = Math.atan2(dy, dx);
    const sx = START_X - camX, sy = (GROUND_Y - 50) - camY;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(ang);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffcc4d';
    ctx.fillRect(0, -5, len, 10);
    ctx.beginPath(); ctx.moveTo(len, -14); ctx.lineTo(len + 20, 0); ctx.lineTo(len, 14); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    // шкала силы
    const pct = Math.round(len / 200 * 100);
    ctx.fillStyle = '#fff'; ctx.font = '800 16px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Сила: ' + pct + '%', W / 2, 60);
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ===== HUD / магазин =====
  function updateHUD() {
    $('dist').textContent = dist;
    $('coins').textContent = coins + (runCoins ? '+' + runCoins : '');
    $('boosts').textContent = boostsLeft;
    $('boost-hud').style.opacity = mode === 'fly' ? 1 : 0.5;
  }

  const UPG_DEF = {
    power: { name: '💪 Сила запуска', max: 10, cost: (l) => 50 + l * 60 },
    bounce: { name: '🦘 Прыгучесть', max: 8, cost: (l) => 80 + l * 80 },
    boost: { name: '🚀 Бусты в полёте', max: 5, cost: (l) => 120 + l * 120 },
  };
  function renderShop() {
    $('shop-coins').textContent = coins;
    for (const key of Object.keys(UPG_DEF)) {
      const def = UPG_DEF[key], lvl = upg[key], el = $('upg-' + key);
      const maxed = lvl >= def.max;
      const cost = def.cost(lvl);
      el.innerHTML =
        `<div class="upg-info"><div class="upg-name">${def.name}</div>` +
        `<div class="upg-lvl">Уровень ${lvl}/${def.max}</div>` +
        `<div class="upg-bar"><div style="width:${lvl / def.max * 100}%"></div></div></div>` +
        (maxed ? `<button class="upg-buy max" disabled>МАКС</button>`
               : `<button class="upg-buy" data-k="${key}" ${coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`);
    }
    $('shop').querySelectorAll('.upg-buy[data-k]').forEach((btn) => {
      btn.onclick = () => {
        const k = btn.dataset.k, cost = UPG_DEF[k].cost(upg[k]);
        if (coins >= cost && upg[k] < UPG_DEF[k].max) {
          coins -= cost; upg[k]++; save(); renderShop(); updateHUD();
          if (window.GameAudio) GameAudio.sfx('power');
        }
      };
    });
  }

  // ===== Ввод =====
  function bindInput() {
    setupCollisions();
    const toLocal = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    canvas.addEventListener('pointerdown', (e) => {
      if (mode === 'aim') { aiming = true; aimStart = toLocal(e); aimCur = aimStart; }
      else if (mode === 'fly') boost();
    });
    canvas.addEventListener('pointermove', (e) => { if (aiming) aimCur = toLocal(e); });
    canvas.addEventListener('pointerup', (e) => {
      if (aiming && mode === 'aim') {
        aiming = false;
        const dx = aimCur.x - aimStart.x, dy = aimCur.y - aimStart.y;
        const len = Math.hypot(dx, dy);
        if (len < 12) return; // слишком короткий — не запускаем
        const power = Math.min(len, 200) / 200;
        const speed = (16 + upg.power * 1.6) * (0.4 + power * 0.9);
        const nx = dx / len, ny = dy / len;
        launch(nx * speed, ny * speed);
      }
    });

    $('btn-start').onclick = startRun;
    $('btn-again').onclick = () => { $('end').classList.add('hidden'); maybeInterstitial(startRun); };
    $('btn-x2').onclick = () => {
      window.YSDK.showRewarded(() => {
        coins += runCoins; $('end-coins').textContent = runCoins * 2;
        $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5;
        save(); updateHUD();
        if (window.GameAudio) GameAudio.sfx('coin');
      });
    };
    $('btn-upgrades').onclick = () => { $('end').classList.add('hidden'); renderShop(); $('shop').classList.remove('hidden'); };
    $('btn-close-shop').onclick = () => { $('shop').classList.add('hidden'); startRun(); };

    const sb = $('sound-btn');
    if (sb && window.GameAudio) GameAudio.attachButton(sb);

    // Тестовый API
    window.__smash = {
      start: startRun,
      launch,
      state: () => ({ mode, dist, runCoins, coins, boostsLeft }),
      ragX: () => rag && rag.torso.position.x,
      forceEnd: endRun,
      addCoins: (n) => { coins += n; save(); updateHUD(); },
    };
  }

  let runCount = 0;
  function maybeInterstitial(after) {
    runCount++;
    if (runCount % 3 === 0) window.YSDK.showFullscreen(after); else after();
  }

  function hideScreens() {
    $('start').classList.add('hidden');
    $('end').classList.add('hidden');
    $('shop').classList.add('hidden');
  }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
