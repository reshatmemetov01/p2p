/* =========================================================================
   Башня (Stack) — ставь движущиеся блоки друг на друга.
   Что не совпало с блоком снизу — обрезается и падает. Строй выше!
   По мотивам тренда «ASMR Tower» из Roblox. Чистый Canvas.
   ========================================================================= */
(function () {
  'use strict';

  const BEST_KEY = 'tower_best_v1';
  const PERFECT_T = 6;        // порог идеального совпадения, px

  // ---- Canvas ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let BH = 30;                // высота блока
  let LINE = 0;               // экранная линия верхушки
  let INIT_W = 0;             // начальная ширина блока

  // ---- Состояние ----
  let mode = 'ready';         // ready | playing | over
  let blocks = [];            // {left, width, hue}
  let current = null;         // {left, width, dir, speed, hue}
  let falling = [];           // обрезки, что падают
  let particles = [];
  let scrollY = 0, targetScroll = 0;
  let score = 0, best = 0, combo = 0;
  let comboFlash = 0;

  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), bestEl = $('best');

  // ===== Инициализация =====
  function init() {
    best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    bestEl.textContent = best;
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    BH = Math.max(26, Math.round(H * 0.045));
    LINE = Math.round(H * 0.42);
    INIT_W = Math.round(W * 0.46);
  }

  // ===== Старт / рестарт =====
  function startGame() {
    blocks = []; falling = []; particles = [];
    score = 0; combo = 0; comboFlash = 0;
    scoreEl.textContent = 0;
    // базовый блок
    blocks.push({ left: (W - INIT_W) / 2, width: INIT_W, hue: 200 });
    targetScroll = LINE;
    scrollY = LINE;
    spawnCurrent();
    mode = 'playing';
    $('start').classList.add('hidden');
    $('over').classList.add('hidden');
    $('tap-hint').classList.remove('hidden');
  }

  function spawnCurrent() {
    const top = blocks[blocks.length - 1];
    const speed = Math.min(190 + score * 5, 520);
    const fromLeft = Math.random() < 0.5;
    current = {
      left: fromLeft ? 8 : W - 8 - top.width,
      width: top.width,
      dir: fromLeft ? 1 : -1,
      speed,
      hue: (200 + blocks.length * 9) % 360,
    };
  }

  // ===== Положить блок =====
  function drop() {
    if (mode === 'ready') { startGame(); return; }
    if (mode === 'over') return;
    if (mode !== 'playing' || !current) return;

    const top = blocks[blocks.length - 1];
    const diff = current.left - top.left;

    if (Math.abs(diff) <= PERFECT_T) {
      // идеально — ширина сохраняется, бонус
      current.left = top.left;
      combo++;
      comboFlash = 1;
      current.width = Math.min(INIT_W, current.width + 6);
      place(current.left, current.width, current.hue);
      burst(top.left + top.width / 2, LINE, current.hue);
      if (window.GameAudio) { GameAudio.sfx('perfect'); GameAudio.shake(canvas); }
    } else {
      combo = 0;
      const nl = Math.max(current.left, top.left);
      const nr = Math.min(current.left + current.width, top.left + top.width);
      const ov = nr - nl;
      if (ov <= 0) {
        // мимо — блок падает целиком, игра окончена
        falling.push(fallPiece(current.left, current.width, current.hue, current.dir * 2));
        gameOver();
        return;
      }
      // обрезок
      if (current.left < nl) falling.push(fallPiece(current.left, nl - current.left, current.hue, -2));
      if (current.left + current.width > nr) falling.push(fallPiece(nr, current.left + current.width - nr, current.hue, 2));
      place(nl, ov, current.hue);
      if (window.GameAudio) GameAudio.sfx('place', score);
    }

    score++;
    scoreEl.textContent = score;
    if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
    targetScroll += BH;
    spawnCurrent();
  }

  function place(left, width, hue) {
    blocks.push({ left, width, hue });
  }

  function fallPiece(left, width, hue, vxDir) {
    return { left, screenY: LINE - BH, width, vy: -1.5, vx: vxDir * (1.5 + Math.random()), rot: 0, vr: (Math.random() - 0.5) * 0.2, hue };
  }

  function burst(x, y, hue) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, hue });
    }
  }

  function gameOver() {
    mode = 'over';
    if (window.GameAudio) GameAudio.sfx('fail');
    $('final-score').textContent = score;
    $('over').classList.remove('hidden');
    $('tap-hint').classList.add('hidden');
    // межстраничная реклама изредка на экране конца
    if (score > 0 && Math.random() < 0.5) window.YSDK.showFullscreen();
  }

  // Продолжить за рекламу: вернуть блок и играть дальше
  function continueGame() {
    window.YSDK.showRewarded(() => {
      if (window.GameAudio) GameAudio.sfx('power');
      const top = blocks[blocks.length - 1];
      if (top.width < 40) top.width = 40; // чуть расширим, если совсем узко
      falling = [];
      combo = 0;
      spawnCurrent();
      mode = 'playing';
      $('over').classList.add('hidden');
      $('tap-hint').classList.remove('hidden');
    });
  }

  // ===== Цикл =====
  let last = 0;
  function loop(ts) {
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    scrollY += (targetScroll - scrollY) * Math.min(1, dt * 10);

    if (mode === 'playing' && current) {
      current.left += current.dir * current.speed * dt;
      const maxLeft = W - 8 - current.width;
      if (current.left <= 8) { current.left = 8; current.dir = 1; }
      else if (current.left >= maxLeft) { current.left = maxLeft; current.dir = -1; }
    }

    // падающие обрезки
    for (const f of falling) {
      f.vy += 28 * dt;
      f.screenY += f.vy;
      f.left += f.vx;
      f.rot += f.vr;
    }
    falling = falling.filter((f) => f.screenY < H + 120);

    // частицы
    for (const p of particles) {
      p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.6;
    }
    particles = particles.filter((p) => p.life > 0);

    if (comboFlash > 0) comboFlash -= dt * 1.6;
  }

  // ===== Рендер =====
  function render() {
    // фон-градиент (меняется с высотой для атмосферы)
    const topHue = (210 + score * 2) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${topHue} 45% 16%)`);
    g.addColorStop(1, `hsl(${(topHue + 30) % 360} 50% 8%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // поставленные блоки
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const y = -i * BH + scrollY;
      if (y < -BH || y > H + BH) continue;
      drawBlock(b.left, y, b.width, b.hue);
    }

    // падающие обрезки
    for (const f of falling) {
      ctx.save();
      ctx.translate(f.left + f.width / 2, f.screenY + BH / 2);
      ctx.rotate(f.rot);
      drawBlockRaw(-f.width / 2, -BH / 2, f.width, f.hue, 0.9);
      ctx.restore();
    }

    // текущий блок
    if (mode === 'playing' && current) {
      const y = -blocks.length * BH + scrollY;
      drawBlock(current.left, y, current.width, current.hue);
    }

    // частицы
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = `hsl(${p.hue} 80% 65%)`;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    // PERFECT
    if (comboFlash > 0 && combo > 0) {
      ctx.globalAlpha = Math.min(1, comboFlash);
      ctx.fillStyle = '#ffd24d';
      ctx.font = '900 ' + Math.round(H * 0.035) + 'px -apple-system, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('ИДЕАЛЬНО' + (combo > 1 ? ' ×' + combo : '') + '!', W / 2, LINE - BH);
      ctx.globalAlpha = 1;
    }
  }

  function drawBlock(left, y, width, hue) { drawBlockRaw(left, y, width, hue, 1); }
  function drawBlockRaw(left, y, width, hue, alpha) {
    ctx.globalAlpha = alpha;
    // корпус
    ctx.fillStyle = `hsl(${hue} 60% 52%)`;
    rr(left, y, width, BH, 6); ctx.fill();
    // верхняя светлая грань (объём)
    ctx.fillStyle = `hsl(${hue} 65% 64%)`;
    rr(left, y, width, Math.max(5, BH * 0.28), 6); ctx.fill();
    // нижняя тень
    ctx.fillStyle = `hsla(${hue} 60% 20% / 0.35)`;
    ctx.fillRect(left + 3, y + BH - 5, width - 6, 4);
    ctx.globalAlpha = 1;
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

  // ===== Ввод =====
  function bindInput() {
    const tap = (e) => {
      if (e.target.closest('button')) return; // клики по кнопкам не считаем
      e.preventDefault();
      drop();
    };
    canvas.addEventListener('pointerdown', tap);
    $('start').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) { e.preventDefault(); startGame(); } });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); drop(); } });

    $('btn-start').onclick = startGame;
    $('btn-restart').onclick = () => startGame();
    $('btn-continue').onclick = continueGame;
    const sb = $('sound-btn');
    if (sb && window.GameAudio) GameAudio.attachButton(sb);

    // Тестовый API
    window.__tower = {
      start: startGame,
      drop,
      setCurrentLeft: (x) => { if (current) current.left = x; },
      topLeft: () => blocks[blocks.length - 1].left,
      state: () => ({ mode, score, blocks: blocks.length, curWidth: current && current.width }),
      forceMiss: () => { if (current) current.left = W; },
    };
  }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
