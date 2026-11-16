/* =========================================================================
   Толпа — раннер с толпой (Count Masters). Псевдо-3D: дорога уходит в
   перспективу к горизонту, человечки объёмные и уменьшаются вдали.
   ========================================================================= */
(function () {
  'use strict';

  const SAVE_KEY = 'crowd_save_v2';
  const SPRITE_CAP = 70;

  // Перспектива
  const D0 = 7;          // «фокус»: чем меньше, тем сильнее сужение
  const VIS_Z = 34;      // сколько метров видно вперёд

  // ---- Состояние ----
  let W = 0, H = 0, horizonY = 0, crowdScreenY = 0, halfRoad = 0;
  let mode = 'ready';
  let N = 10, lat = 0, targetLat = 0;      // lat: боковое положение толпы (-1..1)
  let traveled = 0, dist = 0, speed = 0;
  let objects = [], particles = [], floaters = [];
  let coins = 0, runCoins = 0, bestDist = 0;
  let upg = { start: 0, income: 0 };
  let genDist = 0; const wallPlaced = new Set();
  let slots = [], sprites = 0, t = 0;

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
    load(); buildSlots(); resize();
    window.addEventListener('resize', resize);
    bindInput(); updateHUD();
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    horizonY = H * 0.22; crowdScreenY = H * 0.78;
    halfRoad = Math.min(W * 0.44, 300);
  }

  // Формация человечков (подсолнух, в боковом смещении и глубине)
  function buildSlots() {
    slots = [];
    for (let i = 0; i < SPRITE_CAP; i++) {
      const a = i * 2.399, r = Math.sqrt(i);
      slots.push({ lat: Math.cos(a) * r * 0.021, z: 1.4 + Math.sin(a) * r * 0.17, ph: Math.random() * 6.3 });
    }
    slots.sort((p, q) => q.z - p.z); // дальние рисуем первыми
  }

  // ===== Проекция: боковое lat(-1..1) + глубина z(м вперёд) -> экран =====
  function proj(latN, zAhead) {
    const d = Math.max(0, zAhead);
    const sc = D0 / (D0 + d);
    return { x: W / 2 + latN * halfRoad * sc, y: horizonY + (crowdScreenY - horizonY) * sc, sc };
  }

  // ===== Старт =====
  function startRun() {
    hideScreens();
    N = 10 + upg.start * 2;
    lat = 0; targetLat = 0;
    traveled = 0; dist = 0; speed = 9;
    objects = []; particles = []; floaters = [];
    genDist = 40; wallPlaced.clear(); runCoins = 0;
    sprites = Math.min(N, SPRITE_CAP);
    mode = 'play';
    $('tap-hint').style.display = '';
    generateUpTo(traveled + VIS_Z + 5);
    updateHUD();
  }

  // ===== Генерация =====
  function generateUpTo(max) {
    while (genDist < max) {
      const nearestWall = Math.round(genDist / 350) * 350;
      if (nearestWall > 0 && Math.abs(genDist - nearestWall) < 45 && !wallPlaced.has(nearestWall)) {
        wallPlaced.add(nearestWall); objects.push(makeWall(nearestWall)); genDist = nearestWall + 90;
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
    let left = makeGate(d, false), right = makeGate(d, false);
    if (!left.good && !right.good) { if (Math.random() < 0.5) left = makeGate(d, true); else right = makeGate(d, true); }
    return { type: 'gate', worldDist: d, left, right };
  }
  function makeObstacle(d) {
    const hw = 0.22 + Math.random() * 0.12;
    const cx = (Math.random() * 2 - 1) * (0.7 - hw);
    return { type: 'obst', worldDist: d, cx, hw, dmg: Math.round(10 + d * 0.025) };
  }
  function makeWall(d) { return { type: 'wall', worldDist: d, req: Math.round(15 + d * 0.07) }; }

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
      lat += (targetLat - lat) * Math.min(1, dt * 12);
      lat = Math.max(-0.82, Math.min(0.82, lat));
      generateUpTo(traveled + VIS_Z + 5);
      processObjects();
      updateHUD();
      if (N <= 0) gameOver();
    }
    for (const p of particles) { p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.6; }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 32 * dt; f.life -= dt * 1.2; }
    floaters = floaters.filter((f) => f.life > 0);
    const want = Math.min(Math.max(0, N), SPRITE_CAP);
    if (sprites < want) sprites += Math.ceil((want - sprites) * 0.3) || 1;
    else if (sprites > want) sprites = want;
  }

  function crowdHalfLat() { return Math.min(0.42, 0.06 + Math.sqrt(Math.min(N, SPRITE_CAP)) * 0.016); }

  function processObjects() {
    for (const o of objects) {
      if (o.done || traveled < o.worldDist) continue;
      o.done = true;
      if (o.type === 'gate') applyGate(lat < 0 ? o.left : o.right);
      else if (o.type === 'obst') {
        if (Math.abs(lat - o.cx) < o.hw + crowdHalfLat()) {
          N = Math.max(0, N - o.dmg); floater('−' + o.dmg, '#ff5a6a'); burst('#ff5a6a', 12);
          if (window.GameAudio) GameAudio.sfx('fail');
        }
      } else if (o.type === 'wall') {
        N -= o.req; burst('#ffcc4d', 20);
        if (window.GameAudio) GameAudio.sfx('clear');
        if (N > 0) { runCoins += Math.max(1, Math.round(o.req / 2)); floater('ПРОБИЛ! +' + Math.round(o.req / 2) + '🪙', '#4dd16b'); }
        else { N = 0; floater('Стена устояла…', '#ff5a6a'); }
      }
    }
    objects = objects.filter((o) => o.worldDist > traveled - 6);
  }
  function applyGate(g) {
    if (g.op === 'add') N += g.val;
    else if (g.op === 'sub') N = Math.max(0, N - g.val);
    else if (g.op === 'mul') N = Math.round(N * g.val);
    else if (g.op === 'div') N = Math.round(N / g.val);
    floater(gateText(g), g.good ? '#4dd16b' : '#ff5a6a');
    if (window.GameAudio) GameAudio.sfx(g.good ? 'coin' : 'move');
  }
  function gateText(g) { return (g.op === 'add' ? '+' : g.op === 'sub' ? '−' : g.op === 'mul' ? '×' : '÷') + g.val; }

  function gameOver() {
    if (mode === 'over') return;
    mode = 'over';
    const bonus = Math.round(dist / 10) * (1 + upg.income * 0.5);
    runCoins += Math.round(bonus); coins += runCoins;
    if (dist > bestDist) bestDist = dist;
    save();
    $('end-dist').textContent = dist; $('end-coins').textContent = runCoins;
    $('btn-x2').disabled = false; $('btn-x2').style.opacity = 1;
    $('tap-hint').style.display = 'none';
    $('end').classList.remove('hidden');
    if (window.GameAudio) GameAudio.sfx('fail');
  }

  // ===== Эффекты =====
  function burst(color, n) {
    const p = proj(lat, 0.3);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, s = 1 + Math.random() * 4;
      particles.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, color }); }
  }
  function floater(text, color) { const p = proj(lat, 0.3); floaters.push({ text, color, x: p.x, y: p.y - 70, life: 1.1 }); }

  // ===== Рендер =====
  function render() {
    // фон (ледяной)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#bfe3f5'); g.addColorStop(0.45, '#8fc4e6'); g.addColorStop(1, '#6aa8d6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // дальние холмы
    ctx.fillStyle = '#9fcbe8'; ctx.fillRect(0, horizonY - 16, W, 16);

    // дорога (трапеция в перспективе)
    const bl = proj(-1, 0), br = proj(1, 0), tl = proj(-1, VIS_Z), tr = proj(1, VIS_Z);
    ctx.fillStyle = '#eef3f7';
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y); ctx.closePath(); ctx.fill();
    // поперечные полосы (бегут)
    const off = traveled % 4;
    for (let z = VIS_Z - (off); z > 0; z -= 4) {
      const a = proj(-1, z), c = proj(1, z);
      ctx.fillStyle = (Math.floor((traveled + z) / 4) % 2 === 0) ? 'rgba(255,255,255,0.5)' : 'rgba(210,225,235,0.5)';
      const a2 = proj(-1, Math.max(0, z - 2)), c2 = proj(1, Math.max(0, z - 2));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
    }

    // объекты — от дальних к ближним
    const sorted = objects.filter((o) => o.worldDist - traveled < VIS_Z && o.worldDist - traveled > -4)
      .sort((p, q) => q.worldDist - p.worldDist);
    for (const o of sorted) {
      const z = o.worldDist - traveled;
      if (o.type === 'gate') drawGate(o, z);
      else if (o.type === 'obst') drawObstacle(o, z);
      else if (o.type === 'wall') drawWall(o, z);
    }

    // толпа
    if (mode !== 'ready') drawCrowd();

    // частицы / текст
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    ctx.globalAlpha = 1;
    for (const f of floaters) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.color; ctx.font = '900 26px Arial'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;
  }

  function drawGate(o, z) {
    const L = proj(-1, z), M = proj(0, z), R = proj(1, z), sc = M.sc;
    const h = 46 * sc;
    // панели
    ctx.fillStyle = o.left.good ? 'rgba(77,209,107,0.45)' : 'rgba(255,90,106,0.45)';
    ctx.fillRect(L.x, M.y - h, M.x - L.x, h);
    ctx.fillStyle = o.right.good ? 'rgba(77,209,107,0.45)' : 'rgba(255,90,106,0.45)';
    ctx.fillRect(M.x, M.y - h, R.x - M.x, h);
    // верхние планки
    ctx.fillStyle = o.left.good ? '#4dd16b' : '#ff5a6a'; ctx.fillRect(L.x, M.y - h - 5 * sc, M.x - L.x, 7 * sc);
    ctx.fillStyle = o.right.good ? '#4dd16b' : '#ff5a6a'; ctx.fillRect(M.x, M.y - h - 5 * sc, R.x - M.x, 7 * sc);
    // столбы
    ctx.fillStyle = '#5a6475';
    [L, M, R].forEach((p) => ctx.fillRect(p.x - 3 * sc, M.y - h, 6 * sc, h));
    // текст
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.max(11, Math.round(30 * sc)) + 'px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(gateText(o.left), (L.x + M.x) / 2, M.y - h / 2);
    ctx.fillText(gateText(o.right), (M.x + R.x) / 2, M.y - h / 2);
    ctx.textBaseline = 'alphabetic';
  }
  function drawObstacle(o, z) {
    const a = proj(o.cx - o.hw, z), c = proj(o.cx + o.hw, z), sc = proj(o.cx, z).sc;
    ctx.fillStyle = '#ff4d5e'; ctx.fillRect(a.x, a.y - 18 * sc, c.x - a.x, 20 * sc);
    ctx.fillStyle = '#b02030';
    const teeth = Math.max(2, Math.floor((c.x - a.x) / (14 * sc)));
    for (let i = 0; i < teeth; i++) {
      const tx = a.x + (c.x - a.x) * (i + 0.5) / teeth;
      ctx.beginPath(); ctx.moveTo(tx - 7 * sc, a.y - 18 * sc); ctx.lineTo(tx, a.y - 30 * sc); ctx.lineTo(tx + 7 * sc, a.y - 18 * sc); ctx.fill();
    }
  }
  function drawWall(o, z) {
    const L = proj(-1, z), R = proj(1, z), sc = L.sc, h = 52 * sc;
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(L.x, L.y - h, R.x - L.x, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
    for (let y = 0; y < h; y += 16 * sc) { ctx.beginPath(); ctx.moveTo(L.x, L.y - h + y); ctx.lineTo(R.x, L.y - h + y); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.max(12, Math.round(32 * sc)) + 'px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧱 ' + o.req, (L.x + R.x) / 2, L.y - h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawCrowd() {
    const hl = crowdHalfLat() / 0.42; // 0..1 насколько толпа широкая
    for (let i = 0; i < sprites; i++) {
      const s = slots[i];
      const bob = Math.sin(t * 9 + s.ph) * 0.04;
      const p = proj(lat + s.lat * (0.5 + hl), s.z);
      drawPerson(p.x, p.y + bob * p.sc * 40, p.sc);
    }
    // пузырь с числом над толпой (над дальними человечками)
    const far = proj(lat, 2.9);
    drawBubble(far.x, far.y - 48 * far.sc, Math.max(0, N));
  }

  function drawPerson(x, y, sc) {
    const bw = 24 * sc, bh = 40 * sc, hr = 12 * sc;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, bw * 0.55, bw * 0.22, 0, 0, 6.3); ctx.fill();
    // тело-капсула с градиентом
    const grd = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    grd.addColorStop(0, '#6bb8ff'); grd.addColorStop(1, '#2e86de');
    ctx.fillStyle = grd;
    rr(x - bw / 2, y - bh, bw, bh, bw / 2); ctx.fill();
    // голова
    ctx.fillStyle = '#58a9f0';
    ctx.beginPath(); ctx.arc(x, y - bh - hr * 0.3, hr, 0, 6.3); ctx.fill();
    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(x - hr * 0.35, y - bh - hr * 0.6, hr * 0.42, 0, 6.3); ctx.fill();
  }

  function drawBubble(x, y, num) {
    const txt = String(num);
    ctx.font = '900 22px Arial';
    const w = Math.max(44, ctx.measureText(txt).width + 26), h = 34;
    ctx.fillStyle = '#2e86de';
    rr(x - w / 2, y - h, w, h, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y - h / 2);
    ctx.textBaseline = 'alphabetic';
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
      N = Math.max(25, 10 + upg.start * 2); traveled += 8; mode = 'play';
      $('end').classList.add('hidden'); $('tap-hint').style.display = '';
      if (window.GameAudio) GameAudio.sfx('power'); updateHUD();
    });
  }
  function doubleCoins() {
    window.YSDK.showRewarded(() => {
      coins += runCoins; $('end-coins').textContent = runCoins * 2;
      $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5; save(); updateHUD();
      if (window.GameAudio) GameAudio.sfx('coin');
    });
  }

  // ===== Ввод =====
  function bindInput() {
    const toLat = (e) => { const r = canvas.getBoundingClientRect(); return Math.max(-0.82, Math.min(0.82, ((e.clientX - r.left) - W / 2) / halfRoad)); };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => { if (mode === 'play') { dragging = true; targetLat = toLat(e); } });
    canvas.addEventListener('pointermove', (e) => { if (dragging) targetLat = toLat(e); });
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
      start: startRun, steerTo: (x) => { targetLat = Math.max(-0.82, Math.min(0.82, (x - W / 2) / halfRoad)); },
      state: () => ({ mode, N, dist, coins, runCoins }),
      addCoins: (n) => { coins += n; save(); updateHUD(); },
      forceOver: () => { N = 0; },
    };
  }

  function hideScreens() { $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('shop').classList.add('hidden'); }

  window.addEventListener('load', async () => {
    await window.YSDK.init(); init(); window.YSDK.gameReady();
  });
})();
