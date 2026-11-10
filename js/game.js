/* =========================================================================
   2048: Суперсила — игровая логика
   Чистый JS + DOM. Плитки — абсолютно спозиционированные элементы,
   анимация через CSS transform/transition.
   ========================================================================= */
(function () {
  'use strict';

  const SIZE = 4;              // поле 4x4
  const WIN_VALUE = 2048;
  const BEST_KEY = 'superpow2048_best';

  // ---- Состояние ----
  let grid = [];              // grid[r][c] = tile | null
  let tiles = [];             // список активных плиток
  let score = 0;
  let best = 0;
  let tileSeq = 0;
  let cellSize = 0;
  let gap = 12;
  let busy = false;           // блокировка ввода во время анимации
  let won = false;            // показывали ли экран победы
  let bombMode = false;
  let undoSnapshot = null;    // снимок для отмены хода
  let gamesPlayed = 0;        // счётчик партий (для показа рекламы)
  let bestTile = 0;           // самая большая собранная плитка (для поздравления)

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const gridBg = $('grid-bg');
  const tilesEl = $('tiles');
  const scoreEl = $('score');
  const bestEl = $('best');
  const comboEl = $('combo');
  const overlay = $('overlay');
  const overlayEmoji = $('overlay-emoji');
  const overlayTitle = $('overlay-title');
  const overlaySub = $('overlay-sub');
  const bombHint = $('bomb-hint');

  // ===== Инициализация =====
  function init() {
    best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    bestEl.textContent = best;

    // Фон-клетки
    gridBg.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement('div');
      c.className = 'cell-bg';
      gridBg.appendChild(c);
    }

    layout();
    window.addEventListener('resize', () => { layout(); repositionAll(); });

    bindInput();
    bindButtons();
    newGame(false);
  }

  function layout() {
    const inner = tilesEl.clientWidth; // область без внешних отступов
    gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 12;
    cellSize = (inner - gap * (SIZE - 1)) / SIZE;
  }

  function posX(c) { return c * (cellSize + gap); }
  function posY(r) { return r * (cellSize + gap); }

  function fontFor(value) {
    const digits = String(value).length;
    let f = 0.46;
    if (digits === 3) f = 0.40;
    else if (digits === 4) f = 0.32;
    else if (digits >= 5) f = 0.26;
    return Math.round(cellSize * f) + 'px';
  }

  function tileClass(value) {
    return value > 2048 ? 'tbig' : 't' + value;
  }

  // ===== Управление плитками =====
  function emptyGrid() {
    grid = [];
    for (let r = 0; r < SIZE; r++) grid.push(new Array(SIZE).fill(null));
  }

  function spawnTile(value) {
    const empties = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) empties.push([r, c]);
    if (!empties.length) return null;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    const v = value || (Math.random() < 0.9 ? 2 : 4);
    const tile = createTile(v, r, c, true);
    grid[r][c] = tile;
    return tile;
  }

  function createTile(value, r, c, isNew) {
    const el = document.createElement('div');
    el.className = 'tile ' + tileClass(value) + (isNew ? ' new' : '');
    const span = document.createElement('span');
    span.className = 'tv';
    span.textContent = value;
    el.appendChild(span);
    const tile = { id: ++tileSeq, value, row: r, col: c, el, span };
    styleTile(tile);
    el.style.setProperty('--pos', transformFor(r, c));
    tilesEl.appendChild(el);
    tiles.push(tile);
    return tile;
  }

  function transformFor(r, c) {
    return 'translate(' + posX(c) + 'px,' + posY(r) + 'px)';
  }

  function styleTile(tile) {
    const el = tile.el;
    el.style.width = cellSize + 'px';
    el.style.height = cellSize + 'px';
    el.style.transform = transformFor(tile.row, tile.col);
    el.style.setProperty('--pos', transformFor(tile.row, tile.col));
    tile.span.style.fontSize = fontFor(tile.value);
  }

  function repositionAll() {
    tiles.forEach(styleTile);
  }

  function updateTileVisual(tile) {
    tile.el.className = 'tile ' + tileClass(tile.value);
    tile.span.textContent = tile.value;
    tile.span.style.fontSize = fontFor(tile.value);
  }

  function removeTile(tile) {
    const idx = tiles.indexOf(tile);
    if (idx >= 0) tiles.splice(idx, 1);
    if (tile.el && tile.el.parentNode) tile.el.parentNode.removeChild(tile.el);
  }

  function clearAllTiles() {
    tiles.slice().forEach(removeTile);
    tiles = [];
  }

  // ===== Новая игра =====
  function newGame(fromUser) {
    if (fromUser && gamesPlayed > 0) {
      // Межстраничная реклама между партиями
      window.YSDK.showFullscreen(() => startFresh());
    } else {
      startFresh();
    }
  }

  function startFresh() {
    hideOverlay();
    clearAllTiles();
    emptyGrid();
    score = 0;
    won = false;
    undoSnapshot = null;
    bombMode = false;
    tilesEl.classList.remove('bombing');
    bombHint.classList.add('hidden');
    updateScore(0);
    bestTile = 0;
    spawnTile();
    spawnTile();
    gamesPlayed++;
  }

  // ===== Счёт =====
  function updateScore(add) {
    score += add;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
  }

  // ===== Логика хода =====
  // dir: 'up' | 'down' | 'left' | 'right'
  function move(dir) {
    if (busy || bombMode) return;

    const snap = snapshot();          // на случай отмены
    const lines = buildLines(dir);
    let moved = false;
    let mergeCount = 0;
    let gained = 0;
    const toRemove = [];
    const merged = [];

    for (const cells of lines) {
      const line = cells.map(([r, c]) => grid[r][c]).filter(Boolean);
      const result = [];
      let i = 0;
      while (i < line.length) {
        if (i + 1 < line.length && line[i].value === line[i + 1].value) {
          const survivor = line[i];
          const eaten = line[i + 1];
          survivor.value *= 2;
          gained += survivor.value;
          mergeCount++;
          merged.push(survivor);
          toRemove.push({ tile: eaten, to: null }); // позицию зададим ниже
          eaten._mergeInto = survivor;
          result.push(survivor);
          i += 2;
        } else {
          result.push(line[i]);
          i += 1;
        }
      }
      // Расставляем результат по клеткам линии от края
      for (let k = 0; k < result.length; k++) {
        const t = result[k];
        const [nr, nc] = cells[k];
        if (t.row !== nr || t.col !== nc) moved = true;
        t.row = nr; t.col = nc;
      }
      // Съеденные плитки едут в клетку своего «пожирателя»
      for (const rem of toRemove) {
        if (rem.tile._mergeInto && rem.to === null) {
          rem.to = [rem.tile._mergeInto.row, rem.tile._mergeInto.col];
        }
      }
    }

    if (mergeCount > 0) moved = true;
    if (!moved) return;

    busy = true;
    undoSnapshot = snap;

    // Перестраиваем grid по выжившим
    emptyGrid();
    for (const t of tiles) {
      if (t._mergeInto) continue; // съеденные пока в воздухе
      grid[t.row][t.col] = t;
    }

    // Анимация: двигаем всё
    for (const rem of toRemove) {
      const [tr, tc] = rem.to;
      rem.tile.el.style.transform = transformFor(tr, tc);
    }
    for (const t of tiles) {
      if (t._mergeInto) continue;
      t.el.style.transform = transformFor(t.row, t.col);
    }

    // После слайда: обновляем слившиеся, удаляем съеденные, спавним новую
    setTimeout(() => {
      for (const rem of toRemove) removeTile(rem.tile);
      for (const m of merged) {
        updateTileVisual(m);
        m.el.classList.remove('merged');
        void m.el.offsetWidth;
        m.el.classList.add('merged');
        m._mergeInto = undefined;
      }
      if (gained > 0) updateScore(gained);
      if (mergeCount >= 2) showCombo(mergeCount, gained);

      if (mergeCount > 0) {
        const maxV = Math.max.apply(null, merged.map((m) => m.value));
        if (window.GameAudio) { GameAudio.sfx('merge', Math.log2(maxV)); GameAudio.shake(boardEl); }
        checkMilestone(maxV);
      } else if (window.GameAudio) {
        GameAudio.sfx('move');
      }

      spawnTile();

      // Победа
      if (!won && merged.some((m) => m.value >= WIN_VALUE)) {
        won = true;
        setTimeout(() => showOverlay('win'), 150);
      } else if (!canMove()) {
        setTimeout(() => showOverlay('lose'), 150);
      }
      busy = false;
    }, 130);
  }

  function buildLines(dir) {
    const lines = [];
    if (dir === 'left') {
      for (let r = 0; r < SIZE; r++) lines.push([[r,0],[r,1],[r,2],[r,3]]);
    } else if (dir === 'right') {
      for (let r = 0; r < SIZE; r++) lines.push([[r,3],[r,2],[r,1],[r,0]]);
    } else if (dir === 'up') {
      for (let c = 0; c < SIZE; c++) lines.push([[0,c],[1,c],[2,c],[3,c]]);
    } else if (dir === 'down') {
      for (let c = 0; c < SIZE; c++) lines.push([[3,c],[2,c],[1,c],[0,c]]);
    }
    return lines;
  }

  function canMove() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return true;
        const v = grid[r][c].value;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === v) return true;
      }
    return false;
  }

  // ===== Рекорд плитки =====
  function checkMilestone(v) {
    if (v > bestTile) {
      bestTile = v;
      if (v >= 128) {
        comboEl.textContent = '🏆 ' + v + '!';
        comboEl.classList.remove('hidden', 'show');
        void comboEl.offsetWidth;
        comboEl.classList.add('show');
        setTimeout(() => comboEl.classList.add('hidden'), 900);
        if (window.GameAudio) GameAudio.sfx('coin');
      }
    }
  }

  // ===== Комбо =====
  function showCombo(count, gained) {
    comboEl.textContent = 'КОМБО ×' + count + '  +' + gained;
    comboEl.classList.remove('hidden', 'show');
    void comboEl.offsetWidth;
    comboEl.classList.add('show');
    setTimeout(() => comboEl.classList.add('hidden'), 900);
  }

  // ===== Снимок / отмена =====
  function snapshot() {
    return {
      score: score,
      tiles: tiles.filter((t) => !t._mergeInto).map((t) => ({ value: t.value, row: t.row, col: t.col })),
    };
  }

  function restore(snap) {
    clearAllTiles();
    emptyGrid();
    score = 0;
    scoreEl.textContent = 0;
    for (const s of snap.tiles) {
      const t = createTile(s.value, s.row, s.col, false);
      grid[s.row][s.col] = t;
    }
    score = snap.score;
    scoreEl.textContent = score;
  }

  // ===== Суперспособности (через рекламу за награду) =====
  function doUndo() {
    if (!undoSnapshot || busy) return;
    window.YSDK.showRewarded(() => {
      if (window.GameAudio) GameAudio.sfx('power');
      const snap = undoSnapshot;
      undoSnapshot = null;
      restore(snap);
      hideOverlay();
      won = false;
    });
  }

  function doShuffle() {
    if (busy) return;
    window.YSDK.showRewarded(() => {
      if (window.GameAudio) GameAudio.sfx('power');
      const values = tiles.filter((t) => !t._mergeInto).map((t) => t.value);
      clearAllTiles();
      emptyGrid();
      // Случайные клетки
      const cells = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push([r, c]);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      values.forEach((v, idx) => {
        const [r, c] = cells[idx];
        const t = createTile(v, r, c, true);
        grid[r][c] = t;
      });
      hideOverlay();
      if (!canMove()) setTimeout(() => showOverlay('lose'), 200);
    });
  }

  function enterBombMode() {
    if (busy || bombMode) return;
    window.YSDK.showRewarded(() => {
      if (window.GameAudio) GameAudio.sfx('power');
      bombMode = true;
      tilesEl.classList.add('bombing');
      bombHint.classList.remove('hidden');
    });
  }

  function bombTile(tile) {
    if (!bombMode) return;
    if (window.GameAudio) GameAudio.sfx('clear');
    grid[tile.row][tile.col] = null;
    tile.el.style.transition = 'transform .2s ease, opacity .2s ease';
    tile.el.style.transform += ' scale(0)';
    tile.el.style.opacity = '0';
    setTimeout(() => removeTile(tile), 200);
    exitBombMode();
  }

  function exitBombMode() {
    bombMode = false;
    tilesEl.classList.remove('bombing');
    bombHint.classList.add('hidden');
  }

  // ===== Экран конца / победы =====
  function showOverlay(type) {
    if (window.GameAudio) GameAudio.sfx(type === 'win' ? 'win' : 'fail');
    if (type === 'win') {
      overlayEmoji.textContent = '🏆';
      overlayTitle.textContent = 'Победа! 2048!';
      overlaySub.textContent = 'Счёт: ' + score + ' — продолжай дальше!';
      $('btn-continue').textContent = 'Играть дальше';
      $('btn-continue').onclick = () => { hideOverlay(); };
    } else {
      overlayEmoji.textContent = '💀';
      overlayTitle.textContent = 'Игра окончена';
      overlaySub.textContent = 'Счёт: ' + score;
      $('btn-continue').innerHTML = '<span class="reward-ico">▶</span> Продолжить за рекламу';
      $('btn-continue').onclick = continueAfterAd;
    }
    overlay.classList.remove('hidden');
  }

  function hideOverlay() { overlay.classList.add('hidden'); }

  // Продолжить после проигрыша: смотрим рекламу → освобождаем место
  function continueAfterAd() {
    window.YSDK.showRewarded(() => {
      if (window.GameAudio) GameAudio.sfx('power');
      // Убираем 3 самых маленьких плитки, чтобы дать место
      const sorted = tiles.filter((t) => !t._mergeInto).slice().sort((a, b) => a.value - b.value);
      const toClear = sorted.slice(0, Math.min(3, sorted.length));
      toClear.forEach((t) => {
        grid[t.row][t.col] = null;
        t.el.style.transition = 'transform .2s ease, opacity .2s ease';
        t.el.style.opacity = '0';
        t.el.style.transform += ' scale(0)';
        setTimeout(() => removeTile(t), 200);
      });
      hideOverlay();
    });
  }

  // ===== Ввод =====
  function bindInput() {
    // Клавиатура
    window.addEventListener('keydown', (e) => {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        ц: 'up', ы: 'down', ф: 'left', в: 'right',
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    });

    // Свайпы
    let sx = 0, sy = 0, tracking = false;
    const THRESH = 24;
    boardEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; tracking = true;
    }, { passive: true });
    boardEl.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    }, { passive: true });

    // Мышь (для десктопа — драг)
    let mdown = false, mx = 0, my = 0;
    boardEl.addEventListener('mousedown', (e) => { mdown = true; mx = e.clientX; my = e.clientY; });
    window.addEventListener('mouseup', (e) => {
      if (!mdown) return;
      mdown = false;
      const dx = e.clientX - mx, dy = e.clientY - my;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    });

    // Клик по плитке в режиме бомбы
    tilesEl.addEventListener('click', (e) => {
      if (!bombMode) return;
      const el = e.target.closest('.tile');
      if (!el) return;
      const tile = tiles.find((t) => t.el === el);
      if (tile) bombTile(tile);
    });
  }

  function bindButtons() {
    $('btn-new').onclick = () => newGame(true);
    $('btn-restart').onclick = () => newGame(true);
    $('pw-undo').onclick = doUndo;
    $('pw-bomb').onclick = enterBombMode;
    $('pw-shuffle').onclick = doShuffle;
    const sb = $('sound-btn');
    if (sb && window.GameAudio) GameAudio.attachButton(sb);
  }

  // ===== Запуск =====
  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
