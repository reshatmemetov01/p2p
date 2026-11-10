/* =========================================================================
   Моя Ферма — ходилка сверху (как в Роблоксе, только 2D).
   Управляешь фермером: ходишь по участку, подходишь к грядке, сажаешь и
   собираешь урожай. Рендер на Canvas, управление джойстиком и WASD/стрелками.
   ========================================================================= */
(function () {
  'use strict';

  const SAVE_KEY = 'farm_walk_v1';
  const COLS = 4, ROWS = 3, PLOTS = COLS * ROWS;
  const SPEED = 165;          // скорость фермера, px/сек
  const CHAR_R = 15;

  const SEEDS = [
    { id: 0, emoji: '🥕', name: 'Морковь',   cost: 10,    grow: 4000,   sell: 22 },
    { id: 1, emoji: '🍓', name: 'Клубника',  cost: 50,    grow: 9000,   sell: 130 },
    { id: 2, emoji: '🍇', name: 'Виноград',  cost: 220,   grow: 16000,  sell: 560 },
    { id: 3, emoji: '🍉', name: 'Арбуз',     cost: 850,   grow: 30000,  sell: 2400 },
    { id: 4, emoji: '🍍', name: 'Ананас',    cost: 3200,  grow: 60000,  sell: 9500 },
    { id: 5, emoji: '🌻', name: 'Подсолнух', cost: 13000, grow: 120000, sell: 42000 },
  ];

  // ---- Состояние ----
  let state = {
    coins: 30,
    plots: [],          // {seed:id|null, plantedAt:ms|null}
    selected: 0,
    x2Until: 0,
    harvestCount: 0,
    px: null, py: null, // позиция фермера
  };

  const char = { x: 0, y: 0, facing: 1 };
  let plotCenters = [];   // {x,y}
  let plotSize = 40;
  let fieldRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let W = 0, H = 0;        // размеры холста в CSS-пикселях

  // ---- DOM / Canvas ----
  const $ = (id) => document.getElementById(id);
  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  const wrap = $('field-wrap');
  const coinsEl = $('coins');
  const shopEl = $('shop');
  const hintEl = $('hint');
  const x2Banner = $('x2-banner');
  const x2Time = $('x2-time');
  const toastEl = $('toast');
  const actionBtn = $('btn-action');
  const promptEl = $('prompt');
  const joy = $('joy');
  const joyKnob = $('joy-knob');

  // ===== Утилиты =====
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e9) return (n/1e9).toFixed(1).replace('.0','')+'B';
    if (n >= 1e6) return (n/1e6).toFixed(1).replace('.0','')+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1).replace('.0','')+'k';
    return String(n);
  }
  const now = () => Date.now();
  const mult = () => now() < state.x2Until ? 2 : 1;

  // ===== Сохранение =====
  function save() {
    state.px = char.x; state.py = char.y;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && Array.isArray(s.plots) && s.plots.length === PLOTS) { state = Object.assign(state, s); return true; }
    } catch (e) {}
    return false;
  }

  // ===== Инициализация =====
  function init() {
    if (!load()) {
      state.plots = [];
      for (let i = 0; i < PLOTS; i++) state.plots.push({ seed: null, plantedAt: null });
    }
    resize();
    window.addEventListener('resize', resize);
    if (state.px != null) { char.x = state.px; char.y = state.py; }
    else { char.x = W / 2; char.y = H - 50; }

    buildShop();
    bindInput();
    updateCoins();
    requestAnimationFrame(loop);
    setInterval(save, 4000); // автосейв
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const M = Math.round(W * 0.05);
    fieldRect = { x0: M, y0: M, x1: W - M, y1: H - M };

    // Сетка грядок в центральной зоне
    const pad = Math.round(W * 0.04);
    const areaX0 = fieldRect.x0 + pad, areaX1 = fieldRect.x1 - pad;
    const areaY0 = fieldRect.y0 + pad * 2.2, areaY1 = fieldRect.y1 - pad * 2.2;
    const cellW = (areaX1 - areaX0) / COLS;
    const cellH = (areaY1 - areaY0) / ROWS;
    plotSize = Math.min(cellW, cellH) * 0.74;
    plotCenters = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        plotCenters.push({ x: areaX0 + cellW * (col + 0.5), y: areaY0 + cellH * (row + 0.5) });

    // Удержим фермера в границах
    char.x = clamp(char.x || W/2, fieldRect.x0 + CHAR_R, fieldRect.x1 - CHAR_R);
    char.y = clamp(char.y || H-50, fieldRect.y0 + CHAR_R, fieldRect.y1 - CHAR_R);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ===== Ввод =====
  const keys = new Set();
  let joyVec = { x: 0, y: 0 };
  let joyId = null, joyBase = null;

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','ц','ф','ы','в'].includes(k)) {
        keys.add(k); e.preventDefault();
      }
      if (k === ' ' || k === 'enter') { e.preventDefault(); act(); }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

    // Джойстик — палец/мышь по холсту
    canvas.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;
      joyId = e.pointerId;
      const rect = wrap.getBoundingClientRect();
      joyBase = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      joy.style.left = joyBase.x + 'px';
      joy.style.top = joyBase.y + 'px';
      joy.classList.remove('hidden');
      joyKnob.style.transform = 'translate(-50%, -50%)';
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      const rect = wrap.getBoundingClientRect();
      let dx = (e.clientX - rect.left) - joyBase.x;
      let dy = (e.clientY - rect.top) - joyBase.y;
      const R = 48;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, R);
      const nx = dx / len, ny = dy / len;
      joyVec = { x: nx * (cl / R), y: ny * (cl / R) };
      joyKnob.style.transform = `translate(calc(-50% + ${nx*cl}px), calc(-50% + ${ny*cl}px))`;
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; joyVec = { x: 0, y: 0 };
      joy.classList.add('hidden');
    };
    canvas.addEventListener('pointerup', endJoy);
    canvas.addEventListener('pointercancel', endJoy);

    actionBtn.addEventListener('click', act);
    $('btn-harvest').addEventListener('click', harvestAll);
    $('pw-x2').onclick = buffX2;
    $('pw-water').onclick = buffWater;
    $('pw-gift').onclick = buffGift;

    exposeTest();
  }

  function inputVector() {
    let vx = 0, vy = 0;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('ф')) vx -= 1;
    if (keys.has('arrowright') || keys.has('d') || keys.has('в')) vx += 1;
    if (keys.has('arrowup') || keys.has('w') || keys.has('ц')) vy -= 1;
    if (keys.has('arrowdown') || keys.has('s') || keys.has('ы')) vy += 1;
    vx += joyVec.x; vy += joyVec.y;
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    return { x: vx, y: vy };
  }

  // ===== Игровой цикл =====
  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const v = inputVector();
    if (v.x || v.y) {
      char.x = clamp(char.x + v.x * SPEED * dt, fieldRect.x0 + CHAR_R, fieldRect.x1 - CHAR_R);
      char.y = clamp(char.y + v.y * SPEED * dt, fieldRect.y0 + CHAR_R, fieldRect.y1 - CHAR_R);
      if (v.x < -0.1) char.facing = -1; else if (v.x > 0.1) char.facing = 1;
    }

    // баннер x2
    const left = state.x2Until - now();
    if (left > 0) { x2Banner.classList.remove('hidden'); x2Time.textContent = Math.ceil(left/1000); }
    else x2Banner.classList.add('hidden');

    // контекст действия
    updateActionUI();
  }

  function nearestPlot() {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < PLOTS; i++) {
      const d = Math.hypot(char.x - plotCenters[i].x, char.y - plotCenters[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD < plotSize * 0.95 ? best : -1;
  }

  function plotStatus(i) {
    if (i < 0) return 'none';
    const p = state.plots[i];
    if (p.seed === null) return 'empty';
    return now() - p.plantedAt >= SEEDS[p.seed].grow ? 'ripe' : 'growing';
  }

  function updateActionUI() {
    const i = nearestPlot();
    const st = plotStatus(i);
    if (st === 'empty') {
      const seed = SEEDS[state.selected];
      actionBtn.textContent = '🌱';
      actionBtn.classList.toggle('dim', state.coins < seed.cost);
      showPrompt(i, `🌱 ${seed.name} · 🪙${fmt(seed.cost)}`);
    } else if (st === 'ripe') {
      actionBtn.textContent = '🧺';
      actionBtn.classList.remove('dim');
      showPrompt(i, '🧺 Собрать');
    } else {
      actionBtn.textContent = '🌱';
      actionBtn.classList.add('dim');
      hidePrompt();
    }
  }

  function showPrompt(i, txt) {
    promptEl.textContent = txt;
    promptEl.style.left = plotCenters[i].x + 'px';
    promptEl.style.top = (plotCenters[i].y - plotSize * 0.6) + 'px';
    promptEl.classList.remove('hidden');
  }
  function hidePrompt() { promptEl.classList.add('hidden'); }

  // ===== Действие: посадить / собрать =====
  function act() {
    const i = nearestPlot();
    const st = plotStatus(i);
    if (st === 'empty') {
      const seed = SEEDS[state.selected];
      if (state.coins >= seed.cost) {
        state.coins -= seed.cost;
        state.plots[i] = { seed: seed.id, plantedAt: now() };
        updateCoins(); save();
      } else hint(`Не хватает монет на ${seed.name}`);
    } else if (st === 'ripe') {
      harvestPlot(i);
    }
  }

  function harvestPlot(i) {
    const p = state.plots[i];
    const gain = SEEDS[p.seed].sell * mult();
    state.coins += gain;
    state.plots[i] = { seed: null, plantedAt: null };
    updateCoins();
    flyCoinAt(plotCenters[i], '+' + fmt(gain));
    save();
  }

  function harvestAll() {
    let total = 0, count = 0;
    for (let i = 0; i < PLOTS; i++) {
      if (plotStatus(i) === 'ripe') {
        total += SEEDS[state.plots[i].seed].sell * mult();
        count++;
        state.plots[i] = { seed: null, plantedAt: null };
      }
    }
    if (!count) { hint('Нет созревшего урожая'); return; }
    state.coins += total; updateCoins();
    toast(`🧺 Собрано ${count} · +🪙${fmt(total)}`);
    save();
    state.harvestCount++;
    if (state.harvestCount % 5 === 0) window.YSDK.showFullscreen();
  }

  // ===== Рендер =====
  function render() {
    // Трава
    ctx.fillStyle = '#4a8c3f';
    ctx.fillRect(0, 0, W, H);
    const tile = W / 9;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < H; y += tile)
      for (let x = 0; x < W; x += tile)
        if (((x / tile | 0) + (y / tile | 0)) % 2 === 0) ctx.fillRect(x, y, tile, tile);

    // Забор (рамка)
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 6;
    roundRect(fieldRect.x0, fieldRect.y0, fieldRect.x1 - fieldRect.x0, fieldRect.y1 - fieldRect.y0, 12);
    ctx.stroke();

    // Декор: домик и деревья
    emoji('🏠', fieldRect.x0 + 26, fieldRect.y0 + 22, 30);
    emoji('🌳', fieldRect.x1 - 24, fieldRect.y0 + 24, 28);
    emoji('🌳', fieldRect.x0 + 24, fieldRect.y1 - 22, 26);

    // Грядки
    const near = nearestPlot();
    for (let i = 0; i < PLOTS; i++) {
      const c = plotCenters[i];
      const s = plotSize;
      // земля
      ctx.fillStyle = '#5a3d23';
      roundRect(c.x - s/2, c.y - s/2, s, s, 8); ctx.fill();
      ctx.fillStyle = '#6b4a2b';
      roundRect(c.x - s/2 + 3, c.y - s/2 + 3, s - 6, s - 6, 6); ctx.fill();
      // борозды
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(c.x - s/2 + 5, c.y - s/2 + (s/3)*k);
        ctx.lineTo(c.x + s/2 - 5, c.y - s/2 + (s/3)*k);
        ctx.stroke();
      }

      const p = state.plots[i];
      if (p.seed !== null) {
        const seed = SEEDS[p.seed];
        const t = (now() - p.plantedAt) / seed.grow;
        if (t >= 1) {
          // спелый: пульс + фрукт
          const pulse = 1 + Math.sin(now() / 200) * 0.06;
          ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 3;
          roundRect(c.x - s/2, c.y - s/2, s, s, 8); ctx.stroke();
          emoji(seed.emoji, c.x, c.y, s * 0.6 * pulse);
        } else {
          emoji('🌱', c.x, c.y, s * (0.35 + 0.25 * t));
          // прогресс
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(c.x - s/2 + 5, c.y + s/2 - 8, s - 10, 4);
          ctx.fillStyle = '#4dd16b';
          ctx.fillRect(c.x - s/2 + 5, c.y + s/2 - 8, (s - 10) * t, 4);
        }
      }
      // подсветка ближайшей грядки
      if (i === near) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
        roundRect(c.x - s/2 - 2, c.y - s/2 - 2, s + 4, s + 4, 9); ctx.stroke();
      }
    }

    // Фермер (нарисован фигурами — виден на любом устройстве)
    drawFarmer(char.x, char.y, char.facing);
  }

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function ellipseF(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

  function drawFarmer(x, y, facing) {
    const r = CHAR_R;
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ellipseF(x, y + r * 1.15, r * 0.85, r * 0.35);
    // ноги
    ctx.fillStyle = '#3a4a8c';
    roundRect(x - r*0.5, y + r*0.35, r*0.4, r*0.75, 3); ctx.fill();
    roundRect(x + r*0.1, y + r*0.35, r*0.4, r*0.75, 3); ctx.fill();
    // тело (комбинезон)
    ctx.fillStyle = '#4a7fe0';
    roundRect(x - r*0.6, y - r*0.15, r*1.2, r*0.9, 6); ctx.fill();
    // рубашка (плечи)
    ctx.fillStyle = '#e85a4f';
    roundRect(x - r*0.6, y - r*0.2, r*1.2, r*0.28, 5); ctx.fill();
    // руки
    ctx.fillStyle = '#f0c088';
    circle(x - r*0.68, y + r*0.05, r*0.2);
    circle(x + r*0.68, y + r*0.05, r*0.2);
    // голова
    ctx.fillStyle = '#f4c48a';
    circle(x, y - r*0.55, r*0.52);
    // глаза (смотрят по направлению движения)
    ctx.fillStyle = '#2a2a2a';
    const ex = facing < 0 ? -1 : 1;
    circle(x + ex*r*0.12 - r*0.12, y - r*0.6, r*0.06);
    circle(x + ex*r*0.12 + r*0.12, y - r*0.6, r*0.06);
    // соломенная шляпа
    ctx.fillStyle = '#e0b24a';
    ellipseF(x, y - r*0.85, r*0.78, r*0.26);
    ctx.fillStyle = '#eec15a';
    ctx.beginPath(); ctx.arc(x, y - r*0.9, r*0.42, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#c99a34';
    ctx.fillRect(x - r*0.42, y - r*0.92, r*0.84, r*0.1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function emoji(ch, x, y, size) {
    ctx.font = size + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
  }

  // ===== Магазин =====
  function buildShop() {
    shopEl.innerHTML = '';
    SEEDS.forEach((seed) => {
      const el = document.createElement('div');
      el.className = 'seed';
      el.dataset.id = seed.id;
      el.innerHTML = `<div class="seed-emoji">${seed.emoji}</div><div class="seed-name">${seed.name}</div><div class="seed-cost">🪙 ${fmt(seed.cost)}</div>`;
      el.addEventListener('click', () => { state.selected = seed.id; updateShop(); hint(`Выбрано: ${seed.name}`); save(); });
      shopEl.appendChild(el);
    });
    updateShop();
  }
  function updateShop() {
    [...shopEl.children].forEach((el) => {
      const id = +el.dataset.id;
      el.classList.toggle('selected', id === state.selected);
      el.classList.toggle('unaffordable', state.coins < SEEDS[id].cost);
    });
  }

  // ===== Монеты / сообщения =====
  function updateCoins() { coinsEl.textContent = fmt(state.coins); updateShop(); }
  let hintTimer = null;
  function hint(txt) {
    hintEl.textContent = txt; clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.textContent = 'Ходи джойстиком (или WASD) · подойди к грядке и нажми 🌱', 2500);
  }
  let toastTimer = null;
  function toast(txt) {
    toastEl.textContent = txt; toastEl.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1800);
  }
  function flyCoinAt(c, txt) {
    const rect = wrap.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-coin';
    el.textContent = '🪙 ' + txt;
    el.style.left = (rect.left + c.x - 18) + 'px';
    el.style.top = (rect.top + c.y - 10) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // ===== Бусты (реклама за награду) =====
  function buffX2() {
    window.YSDK.showRewarded(() => { state.x2Until = now() + 60000; toast('⚡ x2 монеты на 60 секунд!'); save(); });
  }
  function buffWater() {
    window.YSDK.showRewarded(() => {
      let any = false;
      for (let i = 0; i < PLOTS; i++) { const p = state.plots[i]; if (p.seed !== null) { p.plantedAt = now() - SEEDS[p.seed].grow; any = true; } }
      toast(any ? '💧 Весь урожай созрел!' : 'Нечего поливать'); save();
    });
  }
  function buffGift() {
    window.YSDK.showRewarded(() => {
      const bonus = Math.max(100, Math.floor(state.coins * 0.5) + 150);
      state.coins += bonus; updateCoins(); toast('🎁 Бонус: +🪙 ' + fmt(bonus)); save();
    });
  }

  // ===== Тестовый API =====
  function exposeTest() {
    window.__farm = {
      state: () => state,
      pos: () => ({ x: char.x, y: char.y }),
      teleport: (i) => { char.x = plotCenters[i].x; char.y = plotCenters[i].y; },
      nearest: nearestPlot,
      act, harvestAll,
      ripenAll: () => { for (let i=0;i<PLOTS;i++){const p=state.plots[i]; if(p.seed!==null) p.plantedAt=now()-SEEDS[p.seed].grow;} },
      setCoins: (n) => { state.coins = n; updateCoins(); },
    };
  }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
