/* =========================================================================
   Parking Escape — головоломка «выведи красную машину с парковки».
   Поле 6×6, машины двигаются только вдоль своей оси. Уровни заранее
   сгенерированы (tools/gen-levels.js) и проверены решателем: у каждого
   известно минимальное число ходов. Подсказка за рекламу = следующий
   оптимальный ход (ищется поиском в ширину прямо в браузере).
   ========================================================================= */
(function () {
  'use strict';
  const N = 6, EXIT_ROW = 2, SAVE_KEY = 'parking_save_v1';
  const DIFFS = ['easy', 'medium', 'hard'];
  const LV = window.PARKING_LEVELS || { easy: [], medium: [], hard: [] };
  const $ = (id) => document.getElementById(id);

  // ---- Языки ----
  const TEXTS = {
    en: { title1: 'PARKING', title2: 'ESCAPE', easy: 'Easy', medium: 'Medium', hard: 'Hard', level: 'Level', moves: 'Moves', best: 'Best',
      howto: 'Slide the cars to free the way for the red car!', done: 'Level complete!', next: 'Next ▶', replay: 'Replay',
      info: (m, b) => 'Moves: ' + m + ' · Best possible: ' + b, nextIn: (n) => 'Next ▶ ' + n, tip: 'Drag the cars to clear the way →', noHint: 'Ad not available, try later' },
    ru: { title1: 'ПАРКОВКА', title2: 'ВЫЕЗД', easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', level: 'Уровень', moves: 'Ходы', best: 'Лучший',
      howto: 'Двигай машины, чтобы освободить путь красной машине!', done: 'Уровень пройден!', next: 'Дальше ▶', replay: 'Ещё раз',
      info: (m, b) => 'Ходов: ' + m + ' · Минимум: ' + b, nextIn: (n) => 'Дальше ▶ ' + n, tip: 'Двигай машины, освободи выезд →', noHint: 'Реклама недоступна, попробуй позже' },
  };
  const RU_LANGS = ['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'tg', 'hy', 'az', 'tt'];
  let L = TEXTS.en;
  function detectLang() {
    let code = '';
    try { code = (window.bridge && bridge.platform && bridge.platform.language) || ''; } catch (e) {}
    if (!code) code = navigator.language || 'en';
    code = String(code).toLowerCase().slice(0, 2);
    L = RU_LANGS.indexOf(code) >= 0 ? TEXTS.ru : TEXTS.en;
    document.documentElement.lang = L === TEXTS.ru ? 'ru' : 'en';
    document.title = L === TEXTS.ru ? 'Парковка: Выезд' : 'Parking Escape';
    document.querySelectorAll('[data-i18n]').forEach((el) => { const v = L[el.getAttribute('data-i18n')]; if (typeof v === 'string') el.textContent = v; });
  }

  // ---- Сохранение ----
  let save = { easy: 0, medium: 0, hard: 0, stars: {} };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  // ---- Рисунок машин (SVG, «смотрит» вправо в системе L×100) ----
  const CAR_COLORS = ['#ffd23f', '#3fa7ff', '#46d39a', '#a77bff', '#ff8a3d', '#ff6fae', '#eef0f6', '#6fd8ff', '#c4dd4f', '#8e9bd0'];
  const TRUCK_COLORS = ['#3fa7ff', '#46d39a', '#ffd23f', '#a77bff', '#ff8a3d', '#eef0f6'];
  const CARGO = ['#e8dcc2', '#d9dff0', '#f5e6a8', '#cfe9dd'];
  function shade(hex, k) { // k>0 светлее, k<0 темнее
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return '#' + [f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function carShape(len, color, target, cargo) {
    const Lw = len * 100, s = '#15172a', glass = '#22283d', hl = shade(color, 0.35), dk = shade(color, -0.18);
    let g = `<rect x="9" y="13" width="${Lw - 14}" height="82" rx="24" fill="rgba(0,0,0,.35)"/>`;
    if (len === 2) {
      g += `<rect x="${Lw - 84}" y="1" width="14" height="12" rx="4" fill="${color}" stroke="${s}" stroke-width="4"/>` +
           `<rect x="${Lw - 84}" y="87" width="14" height="12" rx="4" fill="${color}" stroke="${s}" stroke-width="4"/>` +
           `<rect x="6" y="8" width="${Lw - 12}" height="84" rx="26" fill="${color}" stroke="${s}" stroke-width="5"/>` +
           `<rect x="12" y="14" width="${Lw - 24}" height="12" rx="6" fill="${hl}" opacity=".55"/>` +
           `<path d="M${Lw - 72} 20 L${Lw - 50} 14 Q${Lw - 44} 50 ${Lw - 50} 86 L${Lw - 72} 80 Z" fill="${glass}"/>` +
           `<rect x="62" y="22" width="${Lw - 136}" height="56" rx="12" fill="${hl}"/>` +
           `<path d="M34 18 L56 24 L56 76 L34 82 Q28 50 34 18 Z" fill="${glass}"/>` +
           `<rect x="${Lw - 18}" y="17" width="9" height="16" rx="4" fill="#fff4b0"/><rect x="${Lw - 18}" y="67" width="9" height="16" rx="4" fill="#fff4b0"/>` +
           `<rect x="9" y="18" width="7" height="14" rx="3" fill="#ff4d5e"/><rect x="9" y="68" width="7" height="14" rx="3" fill="#ff4d5e"/>`;
      if (target) g += `<path d="M84 36 L100 50 L84 64" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
                       `<path d="M104 36 L120 50 L104 64" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>`;
    } else {
      const cx = Lw - 100;
      g += `<rect x="6" y="5" width="${cx - 2}" height="90" rx="12" fill="${cargo}" stroke="${s}" stroke-width="5"/>`;
      for (let x = 40; x < cx - 10; x += 42) g += `<rect x="${x}" y="16" width="6" height="68" rx="3" fill="${shade(cargo, -0.12)}"/>`;
      g += `<rect x="${cx - 4}" y="34" width="14" height="32" fill="${dk}" stroke="${s}" stroke-width="4"/>` +
           `<rect x="${Lw - 30}" y="2" width="12" height="12" rx="4" fill="${color}" stroke="${s}" stroke-width="4"/>` +
           `<rect x="${Lw - 30}" y="86" width="12" height="12" rx="4" fill="${color}" stroke="${s}" stroke-width="4"/>` +
           `<rect x="${cx + 6}" y="9" width="88" height="82" rx="20" fill="${color}" stroke="${s}" stroke-width="5"/>` +
           `<rect x="${cx + 14}" y="20" width="42" height="60" rx="9" fill="${hl}"/>` +
           `<path d="M${Lw - 40} 19 L${Lw - 22} 14 Q${Lw - 16} 50 ${Lw - 22} 86 L${Lw - 40} 81 Z" fill="${glass}"/>` +
           `<rect x="${Lw - 15}" y="17" width="8" height="14" rx="3" fill="#fff4b0"/><rect x="${Lw - 15}" y="69" width="8" height="14" rx="3" fill="#fff4b0"/>`;
    }
    return g;
  }
  function carSVG(len, h, dir, color, target, cargo) {
    const Lw = len * 100, inner = carShape(len, color, target, cargo);
    if (h) {
      const tr = dir > 0 ? '' : `translate(${Lw},100) rotate(180)`;
      return `<svg viewBox="0 0 ${Lw} 100" preserveAspectRatio="none"><g transform="${tr}">${inner}</g></svg>`;
    }
    const tr = dir > 0 ? `translate(100,0) rotate(90)` : `translate(0,${Lw}) rotate(-90)`;
    return `<svg viewBox="0 0 100 ${Lw}" preserveAspectRatio="none"><g transform="${tr}">${inner}</g></svg>`;
  }

  // ---- Состояние уровня ----
  let diff = 'easy', idx = 0, optimal = 0, levelStr = '';
  let cars = [], moves = 0, history = [], cell = 50, busy = false, solved = false;
  const board = $('board');

  function seeded(n) { let x = n * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  function parseLevel(str) {
    const map = {};
    for (let i = 0; i < 36; i++) { const ch = str[i]; if (ch === '.') continue; (map[ch] = map[ch] || []).push(i); }
    const rnd = seeded(idx * 31 + DIFFS.indexOf(diff) * 7 + 3);
    const letters = Object.keys(map).sort();
    let ci = Math.floor(rnd() * CAR_COLORS.length), ti = Math.floor(rnd() * TRUCK_COLORS.length);
    return letters.map((ch) => {
      const cells = map[ch], r = Math.floor(cells[0] / N), c = cells[0] % N, len = cells.length;
      const h = cells.length > 1 && Math.floor(cells[1] / N) === r;
      const target = ch === 'A';
      const color = target ? '#ff3b4e' : len === 3 ? TRUCK_COLORS[ti++ % TRUCK_COLORS.length] : CAR_COLORS[ci++ % CAR_COLORS.length];
      return { ch, r, c, len, h, target, color, cargo: CARGO[Math.floor(rnd() * CARGO.length)], dir: target ? 1 : rnd() < 0.5 ? 1 : -1, el: null };
    });
  }
  const posOf = (v) => (v.h ? v.c : v.r);
  function setPos(v, p) { if (v.h) v.c = p; else v.r = p; }
  function grid() {
    const g = new Int8Array(36).fill(-1);
    cars.forEach((v, i) => { for (let k = 0; k < v.len; k++) g[(v.h ? v.r : v.r + k) * N + (v.h ? v.c + k : v.c)] = i; });
    return g;
  }
  function range(i) {
    const v = cars[i], g = grid(); let lo = posOf(v), hi = posOf(v);
    const free = (p) => { const cc = v.h ? p : v.c, rr = v.h ? v.r : p; return p >= 0 && p < N && (g[rr * N + cc] < 0 || g[rr * N + cc] === i); };
    while (free(lo - 1)) lo--;
    while (free(hi + v.len)) hi++;
    return [lo, hi];
  }

  // ---- Отрисовка ----
  function layout() {
    const wrap = board.parentElement, W = Math.min(wrap.clientWidth, 520) - 34, H = wrap.clientHeight - 24;
    cell = Math.max(30, Math.floor(Math.min(W, H) / N));
    const S = cell * N + 20;
    board.style.width = S + 'px'; board.style.height = S + 'px';
    const lot = board.querySelector('.lot');
    lot.style.backgroundImage =
      `linear-gradient(rgba(255,255,255,.06) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.06) 2px, transparent 2px)`;
    lot.style.backgroundSize = `${cell}px ${cell}px`; lot.style.backgroundPosition = '-1px -1px';
    const ex = board.querySelector('.exit');
    Object.assign(ex.style, { left: (cell * N + 6) + 'px', top: (10 + EXIT_ROW * cell + 6) + 'px', width: '44px', height: (cell - 12) + 'px',
      background: 'linear-gradient(90deg, #262938 0 14px, transparent 14px)' });
    cars.forEach((v) => { v.el.style.width = (v.h ? v.len : 1) * cell + 'px'; v.el.style.height = (v.h ? 1 : v.len) * cell + 'px'; place(v, posOf(v), false); });
  }
  function place(v, p, anim, dur) {
    const x = 10 + (v.h ? p : v.c) * cell, y = 10 + (v.h ? v.r : p) * cell;
    v.el.style.transition = anim ? `transform ${dur || 0.14}s ease-out` : 'none';
    v.el.style.transform = `translate(${x}px,${y}px)`;
  }
  function buildBoard() {
    board.innerHTML = '<div class="lot"></div><div class="exit"><i></i><i></i><i></i></div>';
    cars.forEach((v, i) => {
      const el = document.createElement('div'); el.className = 'car';
      el.innerHTML = carSVG(v.len, v.h, v.dir, v.color, v.target, v.cargo);
      v.el = el; board.appendChild(el); attachDrag(el, i);
    });
    layout();
  }

  // ---- Перетаскивание ----
  function attachDrag(el, i) {
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (busy || solved) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const v = cars[i]; const [lo, hi] = range(i);
      start = { x: e.clientX, y: e.clientY, p: posOf(v), lo, hi, f: posOf(v) };
      el.classList.add('drag');
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const v = cars[i], d = ((v.h ? e.clientX - start.x : e.clientY - start.y)) / cell;
      start.f = Math.max(start.lo, Math.min(start.hi, start.p + d));
      const x = 10 + (v.h ? start.f : v.c) * cell, y = 10 + (v.h ? v.r : start.f) * cell;
      el.style.transition = 'none'; el.style.transform = `translate(${x}px,${y}px)`;
    });
    const end = () => {
      if (!start) return;
      const v = cars[i], np = Math.round(start.f), from = start.p; start = null;
      el.classList.remove('drag');
      commitMove(i, from, np);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function commitMove(i, from, to, dur) {
    const v = cars[i];
    setPos(v, to); place(v, to, true, dur);
    if (to !== from) {
      history.push([i, from]); moves++; updateHud();
      if (window.GameAudio) GameAudio.sfx('move');
      if (v.target && to === N - 2) win();
    }
  }

  // ---- Решатель (для подсказки) ----
  function nextBestMove() {
    const start = cars.map(posOf), key = (p) => p.join(',');
    const prev = new Map([[key(start), null]]), qu = [start];
    for (let h = 0; h < qu.length && h < 200000; h++) {
      const p = qu[h];
      if (p[0] === N - 2) { // восстановить первый ход
        let k = key(p), step = null;
        while (prev.get(k)) { step = prev.get(k); k = step.from; }
        return step ? [step.i, step.to] : null;
      }
      const g = new Int8Array(36).fill(-1);
      cars.forEach((v, i) => { for (let k = 0; k < v.len; k++) g[(v.h ? v.r : p[i] + k) * N + (v.h ? p[i] + k : v.c)] = i; });
      for (let i = 0; i < cars.length; i++) {
        const v = cars[i];
        for (const dir of [-1, 1]) {
          let pos = p[i];
          while (true) {
            const head = dir < 0 ? pos - 1 : pos + v.len;
            if (head < 0 || head >= N) break;
            if (g[v.h ? v.r * N + head : head * N + v.c] >= 0) break;
            pos += dir;
            const q = p.slice(); q[i] = pos; const kq = key(q);
            if (!prev.has(kq)) { prev.set(kq, { from: key(p), i, to: pos }); qu.push(q); }
          }
        }
      }
    }
    return null;
  }
  function doHint() {
    if (busy || solved) return;
    const mv = nextBestMove(); if (!mv) return;
    const [i, to] = mv, v = cars[i];
    busy = true; v.el.classList.add('hint');
    setTimeout(() => { commitMove(i, posOf(v), to, 0.35); }, 450);
    setTimeout(() => { v.el.classList.remove('hint'); busy = false; }, 1600);
  }

  // ---- Уровень ----
  function levelList() { return LV[diff] && LV[diff].length ? LV[diff] : LV.easy; }
  function loadLevel(d, i) {
    diff = d; idx = i;
    const list = levelList(), raw = list[i % list.length];
    levelStr = raw.slice(0, 36); optimal = +raw.slice(36);
    cars = parseLevel(levelStr);
    moves = 0; history = []; solved = false; busy = false;
    $('diff-pill').textContent = L[diff].toUpperCase(); $('diff-pill').className = 'pill ' + diff;
    $('lvl-title').textContent = L.level + ' ' + (i + 1);
    $('best').textContent = optimal;
    $('win').classList.add('hidden');
    buildBoard(); updateHud(); save.last = diff; persist();
    if (window.YSDK && window.YSDK.event) window.YSDK.event('level_started', diff + '-' + (i + 1));
    if (diff === 'easy' && i === 0) toast(L.tip, 3200);
  }
  function updateHud() { $('moves').textContent = moves; $('btn-undo').disabled = !history.length || solved; }
  function undo() {
    if (busy || solved || !history.length) return;
    const [i, from] = history.pop(); const v = cars[i];
    setPos(v, from); place(v, from, true); moves = Math.max(0, moves - 1); updateHud();
    if (window.GameAudio) GameAudio.sfx('click');
  }
  function win() {
    solved = true; busy = true; updateHud();
    const v = cars[0];
    v.el.style.transition = 'transform .55s cubic-bezier(.5,0,.9,.6)';
    v.el.style.transform = `translate(${10 + (N + 2.5) * cell}px,${10 + v.r * cell}px)`;
    if (window.GameAudio) GameAudio.sfx('power');
    const stars = moves <= optimal ? 3 : moves <= optimal + Math.ceil(optimal * 0.5) + 1 ? 2 : 1;
    const k = diff + ':' + idx; save.stars[k] = Math.max(save.stars[k] || 0, stars);
    if (save[diff] <= idx) save[diff] = idx + 1;
    persist(); updateMenu();
    setTimeout(() => {
      const st = $('stars').children; for (let s = 0; s < 3; s++) st[s].className = s < stars ? 'on' : '';
      $('win-info').textContent = L.info(moves, optimal);
      $('win').classList.remove('hidden');
      if (window.GameAudio) GameAudio.sfx('win');
      const nb = $('btn-next'); let n = 3; nb.textContent = L.nextIn(n);
      clearInterval(win._iv); win._iv = setInterval(() => { if (--n <= 0) { clearInterval(win._iv); next(); } else nb.textContent = L.nextIn(n); }, 1000);
    }, 650);
    if (window.YSDK && window.YSDK.event) window.YSDK.event('level_completed', diff + '-' + (idx + 1));
  }
  function next() {
    clearInterval(win._iv); if ($('win').classList.contains('hidden')) return;
    $('win').classList.add('hidden');
    const go = () => loadLevel(diff, idx + 1);
    if (window.YSDK && window.YSDK.showFullscreen) window.YSDK.showFullscreen(go); else go();
  }
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms || 2000);
  }

  // ---- Меню ----
  function updateMenu() { DIFFS.forEach((d) => { $('lv-' + d).textContent = L.level + ' ' + (save[d] + 1); }); }
  function showMenu() { $('game').classList.add('hidden'); $('menu').classList.remove('hidden'); updateMenu(); }
  function startDiff(d) {
    if (window.GameAudio) GameAudio.sfx('click');
    $('menu').classList.add('hidden'); $('game').classList.remove('hidden');
    loadLevel(d, save[d]);
  }

  function init() {
    detectLang();
    $('menu').querySelector('.logo-car').innerHTML = carSVG(2, true, 1, '#ff3b4e', true, '');
    document.querySelectorAll('.diff').forEach((b) => b.addEventListener('click', () => startDiff(b.dataset.d)));
    $('btn-back').addEventListener('click', () => { clearInterval(win._iv); if (window.GameAudio) GameAudio.sfx('click'); showMenu(); });
    $('btn-restart').addEventListener('click', () => { if (busy) return; if (window.GameAudio) GameAudio.sfx('click'); loadLevel(diff, idx); });
    $('btn-undo').addEventListener('click', undo);
    $('btn-hint').addEventListener('click', () => {
      if (busy || solved) return;
      if (window.GameAudio) GameAudio.sfx('click');
      if (window.YSDK && window.YSDK.showRewarded) window.YSDK.showRewarded(doHint); else doHint();
    });
    $('btn-next').addEventListener('click', next);
    $('btn-replay').addEventListener('click', () => { clearInterval(win._iv); loadLevel(diff, idx); });
    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);
    window.addEventListener('resize', () => { if (cars.length) layout(); });
    updateMenu();
    startDiff(DIFFS.indexOf(save.last) >= 0 ? save.last : 'easy');

    // API для автотестов
    window.__parking = {
      state: () => ({ diff, idx, moves, optimal, solved, cars: cars.length }),
      load: (d, i) => { $('menu').classList.add('hidden'); $('game').classList.remove('hidden'); loadLevel(d, i); },
      hint: () => doHint(), menu: showMenu,
      solve: async () => { while (!solved) { const mv = nextBestMove(); if (!mv) return false; commitMove(mv[0], posOf(cars[mv[0]]), mv[1]); await new Promise((r) => setTimeout(r, 30)); } return true; },
      counts: () => ({ easy: LV.easy.length, medium: LV.medium.length, hard: LV.hard.length }),
    };
  }

  window.addEventListener('load', async () => {
    try { if (window.YSDK) await window.YSDK.init(); } catch (e) {}
    init();
    try { window.YSDK && window.YSDK.gameReady(); } catch (e) {}
  });
})();
