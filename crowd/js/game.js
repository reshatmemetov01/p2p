/* =========================================================================
   Толпа — веди толпу человечков, проходи воротца (×2, +15), избегай красных
   и ловушек, пробивай стены и беги как можно дальше. Жанр Count Masters.
   ========================================================================= */
(function () {
  'use strict';

  const SAVE_KEY = 'crowd_save_v1';
  const PPM = 44;               // пикселей на метр
  const SPRITE_CAP = 60;        // сколько человечков рисуем максимум

  // ---- Состояние ----
  let W = 0, H = 0, crowdY = 0, roadL = 0, roadR = 0, roadMid = 0;
  let mode = 'ready';           // ready | play | over
  let N = 10, crowdX = 0, targetX = 0;
  let traveled = 0, dist = 0, speed = 0;
  let objects = [], particles = [], floaters = [];
  let coins = 0, runCoins = 0, bestDist = 0;
  let upg = { start: 0, income: 0 };
  let genDist = 0; const wallPlaced = new Set();
  let slots = [], sprites = 0;
  let t = 0;

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // ===== Сохранение =====
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, upg, bestDist })); } catch (e) {} }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s) { coins = s.coins || 0; upg = Object.assign(upg, s.upg || {}); bestDist = s.bestDist || 0; } } catch (e) {}
  }

  // ===== Инициализация =====
  function init() {
    load();
    buildSlots();
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    updateHUD();
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crowdY = H * 0.74;
    const roadW = Math.min(W - 30, 460);
    roadL = (W - roadW) / 2; roadR = roadL + roadW; roadMid = (roadL + roadR) / 2;
    if (mode === 'ready') { crowdX = roadMid; targetX = roadMid; }
  }

  // Формация человечков (подсолнух)
  function buildSlots() {
    slots = [];
    for (let i = 0; i < SPRITE_CAP; i++) {
      const a = i * 2.399, r = 7 * Math.sqrt(i);
      slots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, ph: Math.random() * 6.3 });
    }
  }

  // ===== Старт =====
  function startRun() {
    hideScreens();
    N = 10 + upg.start * 2;
    crowdX = roadMid; targetX = roadMid;
    traveled = 0; dist = 0; speed = 9;
    objects = []; particles = []; floaters = [];
    genDist = 40; wallPlaced.clear();
    runCoins = 0;
    sprites = Math.min(N, SPRITE_CAP);
    mode = 'play';
    $('tap-hint').style.display = '';
    generateUpTo(traveled + 50);
    updateHUD();
  }

  // ===== Генерация трассы =====
  function generateUpTo(max) {
    while (genDist < max) {
      const nearestWall = Math.round(genDist / 350) * 350;
      if (nearestWall > 0 && Math.abs(genDist - nearestWall) < 45 && !wallPlaced.has(nearestWall)) {
        wallPlaced.add(nearestWall);
        objects.push(makeWall(nearestWall));
        genDist = nearestWall + 90;
      } else {
        objects.push(Math.random() < 0.7 ? makeGatePair(genDist) : makeObstacle(genDist));
        genDist += 48 + Math.random() * 40;
      }
    }
  }

  function scaledAdd(d) { return Math.max(5, Math.round((7 + d * 0.03) * (0.6 + Math.random() * 0.9))); }

  function makeGate(d, forceGood) {
    const r = Math.random();
    if (forceGood || r < 0.55) {
      if (r < 0.18) return { op: 'mul', val: Math.random() < 0.3 ? 3 : 2, good: true };
      return { op: 'add', val: scaledAdd(d), good: true };
    }
    if (r < 0.8) return { op: 'sub', val: scaledAdd(d), good: false };
    return { op: 'div', val: 2, good: false };
  }
  function makeGatePair(d) {
    // хотя бы одни воротца хорошие
    let left = makeGate(d, false), right = makeGate(d, false);
    if (!left.good && !right.good) {
      if (Math.random() < 0.5) left = makeGate(d, true);
      else right = makeGate(d, true);
    }
    return { type: 'gate', worldDist: d, left, right };
  }
  function makeObstacle(d) {
    const w = (roadR - roadL) * (0.28 + Math.random() * 0.14);
    const x = roadL + w / 2 + Math.random() * (roadR - roadL - w);
    return { type: 'obst', worldDist: d, x, w, dmg: Math.round(10 + d * 0.025) };
  }
  function makeWall(d) {
    return { type: 'wall', worldDist: d, req: Math.round(15 + d * 0.07) };
  }

  // ===== Цикл =====
  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts; t += dt;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (mode === 'play') {
      speed = Math.min(22, 9 + traveled * 0.004);
      traveled += speed * dt;
      dist = Math.floor(traveled);
      crowdX += (targetX - crowdX) * Math.min(1, dt * 12);
      crowdX = Math.max(roadL + 24, Math.min(roadR - 24, crowdX));
      generateUpTo(traveled + 50);
      processObjects();
      updateHUD();
      if (N <= 0) gameOver();
    }
    for (const p of particles) { p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.6; }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 30 * dt; f.life -= dt * 1.2; }
    floaters = floaters.filter((f) => f.life > 0);
    // плавно подгоняем число спрайтов к N
    const want = Math.min(Math.max(0, N), SPRITE_CAP);
    if (sprites < want) sprites += Math.ceil((want - sprites) * 0.3) || 1;
    else if (sprites > want) sprites = want;
  }

  function crowdRadius() { return 10 + Math.sqrt(Math.min(N, SPRITE_CAP)) * 7; }

  function processObjects() {
    for (const o of objects) {
      if (o.done || traveled < o.worldDist) continue;
      o.done = true;
      if (o.type === 'gate') {
        const g = crowdX < roadMid ? o.left : o.right;
        applyGate(g);
      } else if (o.type === 'obst') {
        const rad = crowdRadius();
        if (crowdX + rad > o.x - o.w / 2 && crowdX - rad < o.x + o.w / 2) {
          N = Math.max(0, N - o.dmg);
          floater('−' + o.dmg, '#ff5a6a');
          burst(crowdX, crowdY, '#ff5a6a', 12);
          if (window.GameAudio) GameAudio.sfx('fail');
        }
      } else if (o.type === 'wall') {
        const before = N;
        N -= o.req;
        burst(crowdX, crowdY - 20, '#ffcc4d', 20);
        if (window.GameAudio) GameAudio.sfx('clear');
        if (N > 0) {
          runCoins += Math.max(1, Math.round(o.req / 2));
          floater('ПРОБИЛ! +' + Math.round(o.req / 2) + '🪙', '#4dd16b');
        } else {
          N = 0; floater('Стена устояла…', '#ff5a6a');
        }
      }
    }
    objects = objects.filter((o) => o.worldDist > traveled - 40);
  }

  function applyGate(g) {
    if (g.op === 'add') N += g.val;
    else if (g.op === 'sub') N = Math.max(0, N - g.val);
    else if (g.op === 'mul') N = Math.round(N * g.val);
    else if (g.op === 'div') N = Math.round(N / g.val);
    floater(gateText(g), g.good ? '#4dd16b' : '#ff5a6a');
    if (window.GameAudio) GameAudio.sfx(g.good ? 'coin' : 'move');
  }
  function gateText(g) {
    return (g.op === 'add' ? '+' : g.op === 'sub' ? '−' : g.op === 'mul' ? '×' : '÷') + g.val;
  }

  function gameOver() {
    if (mode === 'over') return;
    mode = 'over';
    const bonus = Math.round(dist / 10) * (1 + upg.income * 0.5);
    runCoins += Math.round(bonus);
    coins += runCoins;
    if (dist > bestDist) bestDist = dist;
    save();
    $('end-dist').textContent = dist;
    $('end-coins').textContent = runCoins;
    $('btn-x2').disabled = false; $('btn-x2').style.opacity = 1;
    $('tap-hint').style.display = 'none';
    $('end').classList.remove('hidden');
    if (window.GameAudio) GameAudio.sfx('fail');
  }

  // ===== Эффекты =====
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, s = 1 + Math.random() * 4;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, color }); }
  }
  function floater(text, color) { floaters.push({ text, color, x: crowdX, y: crowdY - 60, life: 1.1 }); }

  // ===== Рендер =====
  function render() {
    // трава
    ctx.fillStyle = '#2e6b3a'; ctx.fillRect(0, 0, W, H);
    // дорога
    ctx.fillStyle = '#3a3f52'; ctx.fillRect(roadL, 0, roadR - roadL, H);
    ctx.fillStyle = '#4a4f66'; ctx.fillRect(roadL, 0, 6, H); ctx.fillRect(roadR - 6, 0, 6, H);
    // разметка (бежит)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const off = (traveled * PPM) % 60;
    for (let y = -60 + off; y < H; y += 60) ctx.fillRect(roadMid - 3, y, 6, 34);

    // объекты
    for (const o of objects) {
      const sy = crowdY - (o.worldDist - traveled) * PPM;
      if (sy < -60 || sy > H + 60) continue;
      if (o.type === 'gate') drawGate(o, sy);
      else if (o.type === 'obst') drawObstacle(o, sy);
      else if (o.type === 'wall') drawWall(o, sy);
    }

    // толпа
    if (mode !== 'ready') drawCrowd();

    // частицы
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    ctx.globalAlpha = 1;
    // всплывающий текст
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.color;
      ctx.font = '900 24px Arial'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawGate(o, sy) {
    const half = (roadMid - roadL);
    drawGateHalf(o.left, roadL, roadMid, sy);
    drawGateHalf(o.right, roadMid, roadR, sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(roadMid, sy - 30); ctx.lineTo(roadMid, sy + 30); ctx.stroke();
  }
  function drawGateHalf(g, x0, x1, sy) {
    ctx.fillStyle = g.good ? 'rgba(77,209,107,0.35)' : 'rgba(255,90,106,0.35)';
    ctx.fillRect(x0, sy - 28, x1 - x0, 56);
    ctx.fillStyle = g.good ? '#4dd16b' : '#ff5a6a';
    ctx.fillRect(x0, sy - 30, x1 - x0, 7);
    ctx.fillStyle = '#fff'; ctx.font = '900 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(gateText(g), (x0 + x1) / 2, sy);
    ctx.textBaseline = 'alphabetic';
  }
  function drawObstacle(o, sy) {
    ctx.fillStyle = '#ff4d5e';
    ctx.fillRect(o.x - o.w / 2, sy - 14, o.w, 28);
    // зубья
    ctx.fillStyle = '#b02030';
    const teeth = Math.floor(o.w / 14);
    for (let i = 0; i < teeth; i++) {
      const tx = o.x - o.w / 2 + i * 14 + 7;
      ctx.beginPath(); ctx.moveTo(tx - 7, sy - 14); ctx.lineTo(tx, sy - 24); ctx.lineTo(tx + 7, sy - 14); ctx.fill();
    }
  }
  function drawWall(o, sy) {
    ctx.fillStyle = '#8a5a3a';
    ctx.fillRect(roadL, sy - 24, roadR - roadL, 48);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    for (let y = -24; y < 24; y += 16) { ctx.beginPath(); ctx.moveTo(roadL, sy + y); ctx.lineTo(roadR, sy + y); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = '900 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧱 ' + o.req, roadMid, sy);
    ctx.textBaseline = 'alphabetic';
  }

  function drawCrowd() {
    const scale = Math.min(1, crowdRadius() / 55);
    for (let i = 0; i < sprites; i++) {
      const s = slots[i];
      const bob = Math.sin(t * 9 + s.ph) * 2;
      const x = crowdX + s.x * (0.6 + scale), y = crowdY + s.y * (0.6 + scale) + bob;
      drawRunner(x, y);
    }
  }
  function drawRunner(x, y) {
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 5, 2, 0, 0, 6.3); ctx.fill();
    // тело
    ctx.fillStyle = '#3f6fd4'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 4, y - 2, 8, 11, 2) : ctx.rect(x - 4, y - 2, 8, 11); ctx.fill();
    // голова
    ctx.fillStyle = '#f4c48a'; ctx.beginPath(); ctx.arc(x, y - 6, 4, 0, 6.3); ctx.fill();
  }

  // ===== HUD / магазин =====
  function updateHUD() {
    $('crowd').textContent = Math.max(0, N);
    $('dist').textContent = dist;
    $('coins').textContent = coins + (runCoins ? '+' + runCoins : '');
  }

  const UPG_DEF = {
    start: { name: '👥 Стартовая толпа', max: 10, cost: (l) => 60 + l * 70, desc: (l) => '+' + (l * 2) + ' в старте' },
    income: { name: '💰 Доход', max: 5, cost: (l) => 100 + l * 120, desc: (l) => '+' + (l * 50) + '% монет' },
  };
  function renderShop() {
    $('shop-coins').textContent = coins;
    for (const key of Object.keys(UPG_DEF)) {
      const def = UPG_DEF[key], lvl = upg[key], el = $('upg-' + key);
      const maxed = lvl >= def.max, cost = def.cost(lvl);
      el.innerHTML = `<div class="upg-info"><div class="upg-name">${def.name}</div>` +
        `<div class="upg-lvl">Ур. ${lvl}/${def.max} · ${def.desc(lvl)}</div>` +
        `<div class="upg-bar"><div style="width:${lvl / def.max * 100}%"></div></div></div>` +
        (maxed ? `<button class="upg-buy max" disabled>МАКС</button>`
               : `<button class="upg-buy" data-k="${key}" ${coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`);
    }
    $('shop').querySelectorAll('.upg-buy[data-k]').forEach((btn) => {
      btn.onclick = () => { const k = btn.dataset.k, cost = UPG_DEF[k].cost(upg[k]);
        if (coins >= cost && upg[k] < UPG_DEF[k].max) { coins -= cost; upg[k]++; save(); renderShop(); updateHUD();
          if (window.GameAudio) GameAudio.sfx('power'); } };
    });
  }

  // ===== Реклама =====
  let runCount = 0;
  function maybeInterstitial(after) { runCount++; if (runCount % 3 === 0) window.YSDK.showFullscreen(after); else after(); }

  function revive() {
    window.YSDK.showRewarded(() => {
      N = Math.max(25, 10 + upg.start * 2);
      traveled += 8; mode = 'play';
      $('end').classList.add('hidden'); $('tap-hint').style.display = '';
      if (window.GameAudio) GameAudio.sfx('power');
      updateHUD();
    });
  }
  function doubleCoins() {
    window.YSDK.showRewarded(() => {
      coins += runCoins; $('end-coins').textContent = runCoins * 2;
      $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5;
      save(); updateHUD();
      if (window.GameAudio) GameAudio.sfx('coin');
    });
  }

  // ===== Ввод =====
  function bindInput() {
    const toX = (e) => { const r = canvas.getBoundingClientRect(); return e.clientX - r.left; };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => { if (mode === 'play') { dragging = true; targetX = toX(e); } });
    canvas.addEventListener('pointermove', (e) => { if (dragging) targetX = toX(e); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    $('btn-start').onclick = startRun;
    $('btn-again').onclick = () => { $('end').classList.add('hidden'); maybeInterstitial(startRun); };
    $('btn-revive').onclick = revive;
    $('btn-x2').onclick = doubleCoins;
    $('btn-upgrades').onclick = () => { $('end').classList.add('hidden'); renderShop(); $('shop').classList.remove('hidden'); };
    $('btn-close-shop').onclick = () => { $('shop').classList.add('hidden'); startRun(); };

    const sb = $('sound-btn');
    if (sb && window.GameAudio) GameAudio.attachButton(sb);

    window.__crowd = {
      start: startRun, steerTo: (x) => { targetX = x; },
      state: () => ({ mode, N, dist, coins, runCoins }),
      addCoins: (n) => { coins += n; save(); updateHUD(); },
      forceOver: () => { N = 0; },
    };
  }

  function hideScreens() { $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('shop').classList.add('hidden'); }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
