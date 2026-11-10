/* =========================================================================
   Блок Бласт — игровая логика
   Поле 8x8, три фигуры в лотке, перетаскивание (мышь + тач),
   сжигание полных рядов и столбцов, комбо.
   ========================================================================= */
(function () {
  'use strict';

  const GRID = 8;
  const BEST_KEY = 'blockblast_best';

  // Набор фигур (ненормализованные смещения; нормализуем при загрузке)
  const RAW_SHAPES = [
    [[0,0]],
    [[0,0],[0,1]], [[0,0],[1,0]],
    [[0,0],[0,1],[0,2]], [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[1,0],[1,1]],
    // уголки (тримино)
    [[0,0],[1,0],[1,1]], [[0,1],[1,0],[1,1]], [[0,0],[0,1],[1,0]], [[0,0],[0,1],[1,1]],
    // L / J (тетрамино)
    [[0,0],[1,0],[2,0],[2,1]], [[0,1],[1,1],[2,1],[2,0]],
    [[0,0],[0,1],[0,2],[1,0]], [[0,0],[0,1],[0,2],[1,2]],
    // T
    [[0,0],[0,1],[0,2],[1,1]], [[0,1],[1,0],[1,1],[1,2]],
    // S / Z
    [[0,1],[0,2],[1,0],[1,1]], [[0,0],[0,1],[1,1],[1,2]],
    // большой уголок 3x3
    [[0,0],[1,0],[2,0],[2,1],[2,2]], [[0,0],[0,1],[0,2],[1,0],[2,0]],
    // прямоугольники
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
    [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
  ];

  // Вес выпадения: мелкие фигуры чаще (игра честнее)
  const SHAPES = RAW_SHAPES.map(normalize);
  const WEIGHTS = SHAPES.map((s) => {
    const n = s.cells.length;
    if (n <= 2) return 5;
    if (n === 3) return 5;
    if (n === 4) return 4;
    if (n === 5) return 2;
    return 1; // 6-клеточные
  });
  const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

  const COLORS = ['#7c5cff','#00e0c6','#ff5ca8','#ffb15c','#5cc2ff','#9bff5c','#ff7a5c','#c15cff'];

  function normalize(cells) {
    const minR = Math.min(...cells.map((c) => c[0]));
    const minC = Math.min(...cells.map((c) => c[1]));
    const norm = cells.map((c) => [c[0] - minR, c[1] - minC]);
    const h = Math.max(...norm.map((c) => c[0])) + 1;
    const w = Math.max(...norm.map((c) => c[1])) + 1;
    return { cells: norm, w, h };
  }

  // ---- Состояние ----
  let board = [];           // board[r][c] = color | null
  let cellEls = [];         // DOM-ссылки на клетки
  let pieces = [];          // 3 фигуры (или null)
  let score = 0, best = 0, streak = 0;
  let cellSize = 0, gap = 5, stride = 0;
  let hammerMode = false;
  let busy = false;

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const trayEl = $('tray');
  const scoreEl = $('score');
  const bestEl = $('best');
  const comboEl = $('combo');
  const overlay = $('overlay');
  const hammerHint = $('hammer-hint');

  const dragLayer = document.createElement('div');
  dragLayer.id = 'drag-layer';
  document.body.appendChild(dragLayer);

  // ===== Инициализация =====
  function init() {
    best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    bestEl.textContent = best;

    buildBoard();
    layout();
    window.addEventListener('resize', layout);

    bindButtons();
    newGame();
    exposeTestApi();
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    cellEls = [];
    for (let r = 0; r < GRID; r++) {
      cellEls[r] = [];
      for (let c = 0; c < GRID; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.r = r; el.dataset.c = c;
        boardEl.appendChild(el);
        cellEls[r][c] = el;
        el.addEventListener('click', () => onCellClick(r, c));
      }
    }
  }

  function layout() {
    gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 5;
    const inner = boardEl.clientWidth - gap * 2;
    cellSize = (inner - gap * (GRID - 1)) / GRID;
    stride = cellSize + gap;
  }

  // ===== Поле =====
  function emptyBoard() {
    board = [];
    for (let r = 0; r < GRID; r++) board.push(new Array(GRID).fill(null));
  }

  function renderBoard() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) {
        const el = cellEls[r][c];
        el.classList.remove('preview-ok', 'preview-bad');
        if (board[r][c]) {
          el.classList.add('filled');
          el.style.background = board[r][c];
        } else {
          el.classList.remove('filled');
          el.style.background = '';
        }
      }
  }

  function clearPreview() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        cellEls[r][c].classList.remove('preview-ok', 'preview-bad');
  }

  // ===== Фигуры / лоток =====
  function randShape() {
    let x = Math.random() * WEIGHT_SUM;
    for (let i = 0; i < SHAPES.length; i++) {
      x -= WEIGHTS[i];
      if (x <= 0) return SHAPES[i];
    }
    return SHAPES[0];
  }

  function dealPieces() {
    pieces = [0, 1, 2].map(() => {
      const s = randShape();
      return { cells: s.cells, w: s.w, h: s.h, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    });
    renderTray();
  }

  function renderTray() {
    trayEl.innerHTML = '';
    pieces.forEach((piece, idx) => {
      const slot = document.createElement('div');
      slot.className = 'tray-slot' + (piece ? '' : ' empty');
      if (piece) {
        const el = buildPieceEl(piece, trayBlockSize(piece));
        slot.appendChild(el);
        attachDrag(el, idx, piece);
      }
      trayEl.appendChild(slot);
    });
  }

  function trayBlockSize(piece) {
    return Math.min(22, Math.floor(72 / Math.max(piece.w, piece.h)));
  }

  function buildPieceEl(piece, bs, className) {
    const el = document.createElement('div');
    el.className = className || 'piece';
    el.style.gridTemplateColumns = `repeat(${piece.w}, ${bs}px)`;
    el.style.gridTemplateRows = `repeat(${piece.h}, ${bs}px)`;
    const set = new Set(piece.cells.map((c) => c[0] + ',' + c[1]));
    for (let r = 0; r < piece.h; r++)
      for (let c = 0; c < piece.w; c++) {
        const b = document.createElement('div');
        if (set.has(r + ',' + c)) {
          b.className = 'pblock';
          b.style.background = piece.color;
          b.style.width = bs + 'px'; b.style.height = bs + 'px';
        } else {
          b.style.width = bs + 'px'; b.style.height = bs + 'px';
        }
        el.appendChild(b);
      }
    return el;
  }

  // ===== Перетаскивание =====
  function attachDrag(el, idx, piece) {
    el.addEventListener('pointerdown', (e) => {
      if (busy || hammerMode) return;
      e.preventDefault();
      startDrag(e, idx, piece, el);
    });
  }

  let drag = null;
  function startDrag(e, idx, piece, srcEl) {
    const floatW = piece.w * stride - gap;
    const floatH = piece.h * stride - gap;
    const floatEl = buildPieceEl(piece, cellSize, 'floating');
    dragLayer.appendChild(floatEl);
    srcEl.classList.add('dragging');

    drag = { idx, piece, floatEl, floatW, floatH, srcEl, origin: null };
    moveDrag(e);

    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
  }

  function moveDrag(e) {
    if (!drag) return;
    const { piece, floatEl, floatW, floatH } = drag;
    const LIFT = 28;
    const floatLeft = e.clientX - floatW / 2;
    const floatTop = e.clientY - floatH - LIFT;
    floatEl.style.left = floatLeft + 'px';
    floatEl.style.top = floatTop + 'px';

    const rect = boardEl.getBoundingClientRect();
    const originX = rect.left + gap;
    const originY = rect.top + gap;
    const col = Math.round((floatLeft - originX) / stride);
    const row = Math.round((floatTop - originY) / stride);

    clearPreview();
    const ok = canPlace(piece, row, col);
    drag.origin = ok ? [row, col] : null;
    for (const [dr, dc] of piece.cells) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < GRID && c >= 0 && c < GRID)
        cellEls[r][c].classList.add(ok ? 'preview-ok' : 'preview-bad');
    }
  }

  function endDrag() {
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    if (!drag) return;
    const { idx, piece, floatEl, srcEl, origin } = drag;
    floatEl.remove();
    srcEl.classList.remove('dragging');
    clearPreview();
    const d = drag;
    drag = null;
    if (origin) {
      placePiece(idx, piece, origin[0], origin[1]);
    }
  }

  // ===== Логика размещения =====
  function canPlace(piece, row, col) {
    for (const [dr, dc] of piece.cells) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c]) return false;
    }
    return true;
  }

  function canPlaceAnywhere(piece) {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (canPlace(piece, r, c)) return true;
    return false;
  }

  function anyMoveLeft() {
    return pieces.some((p) => p && canPlaceAnywhere(p));
  }

  function placePiece(idx, piece, row, col) {
    if (!canPlace(piece, row, col)) return false;
    for (const [dr, dc] of piece.cells) board[row + dr][col + dc] = piece.color;
    addScore(piece.cells.length);
    pieces[idx] = null;
    renderBoard();

    clearLines(() => {
      if (pieces.every((p) => !p)) dealPieces();
      else renderTray();

      if (!anyMoveLeft()) {
        setTimeout(() => showOverlay(), 250);
      }
    });
    return true;
  }

  function clearLines(done) {
    const fullRows = [], fullCols = [];
    for (let r = 0; r < GRID; r++)
      if (board[r].every((v) => v)) fullRows.push(r);
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) if (!board[r][c]) { full = false; break; }
      if (full) fullCols.push(c);
    }

    const lines = fullRows.length + fullCols.length;
    if (lines === 0) { streak = 0; done && done(); return; }

    // Пометить клетки на сжигание
    const toClear = new Set();
    fullRows.forEach((r) => { for (let c = 0; c < GRID; c++) toClear.add(r + ',' + c); });
    fullCols.forEach((c) => { for (let r = 0; r < GRID; r++) toClear.add(r + ',' + c); });
    toClear.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      cellEls[r][c].classList.add('clearing');
    });

    // Очки за сжигание + комбо
    streak++;
    let gained = toClear.size * 10 + (lines - 1) * 50;
    if (streak > 1) gained += streak * 20;
    addScore(gained);
    if (lines >= 2 || streak >= 2) showCombo(lines, streak, gained);

    setTimeout(() => {
      toClear.forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        board[r][c] = null;
        cellEls[r][c].classList.remove('clearing');
      });
      renderBoard();
      done && done();
    }, 300);
  }

  // ===== Счёт / комбо =====
  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
  }

  function showCombo(lines, streakVal, gained) {
    let txt = '';
    if (lines >= 2) txt = lines + ' ЛИНИИ!';
    if (streakVal >= 2) txt = 'КОМБО ×' + streakVal;
    txt += '  +' + gained;
    comboEl.textContent = txt;
    comboEl.classList.remove('hidden', 'show');
    void comboEl.offsetWidth;
    comboEl.classList.add('show');
    setTimeout(() => comboEl.classList.add('hidden'), 1000);
  }

  // ===== Суперспособности =====
  function doRefresh() {
    if (busy) return;
    window.YSDK.showRewarded(() => {
      dealPieces();
      if (!anyMoveLeft()) setTimeout(showOverlay, 250);
    });
  }

  function enterHammer() {
    if (busy || hammerMode) return;
    // есть ли что разбивать
    let hasBlocks = false;
    for (let r = 0; r < GRID && !hasBlocks; r++)
      for (let c = 0; c < GRID; c++) if (board[r][c]) { hasBlocks = true; break; }
    if (!hasBlocks) return;
    window.YSDK.showRewarded(() => {
      hammerMode = true;
      boardEl.parentElement.classList.add('hammer-on');
      boardEl.classList.add('hammer-on');
      hammerHint.classList.remove('hidden');
    });
  }

  function onCellClick(r, c) {
    if (!hammerMode) return;
    if (board[r][c]) {
      board[r][c] = null;
      renderBoard();
      exitHammer();
      // после разбивки могли появиться ходы — перепроверим game over
      if (!anyMoveLeft()) setTimeout(showOverlay, 200);
    }
  }

  function exitHammer() {
    hammerMode = false;
    boardEl.classList.remove('hammer-on');
    boardEl.parentElement.classList.remove('hammer-on');
    hammerHint.classList.add('hidden');
  }

  // ===== Конец игры =====
  function showOverlay() {
    $('overlay-sub').textContent = 'Счёт: ' + score;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function continueAfterAd() {
    window.YSDK.showRewarded(() => {
      // Освобождаем нижние 3 ряда
      for (let r = GRID - 3; r < GRID; r++)
        for (let c = 0; c < GRID; c++) board[r][c] = null;
      streak = 0;
      renderBoard();
      hideOverlay();
      if (pieces.every((p) => !p)) dealPieces();
      if (!anyMoveLeft()) setTimeout(showOverlay, 300);
    });
  }

  // ===== Новая игра =====
  let started = false;
  function newGame(fromUser) {
    const run = () => {
      hideOverlay();
      exitHammer();
      emptyBoard();
      renderBoard();
      score = 0; streak = 0;
      scoreEl.textContent = 0;
      dealPieces();
    };
    if (fromUser && started) window.YSDK.showFullscreen(run);
    else run();
    started = true;
  }

  function bindButtons() {
    $('btn-new').onclick = () => newGame(true);
    $('btn-restart').onclick = () => newGame(true);
    $('btn-continue').onclick = continueAfterAd;
    $('pw-refresh').onclick = doRefresh;
    $('pw-hammer').onclick = enterHammer;
  }

  // ===== Тестовый API (для автотестов) =====
  function exposeTestApi() {
    window.__bb = {
      place: (idx, r, c) => pieces[idx] && placePiece(idx, pieces[idx], r, c),
      canPlaceAnywhere: (idx) => pieces[idx] && canPlaceAnywhere(pieces[idx]),
      anyMoveLeft,
      fillBoard: (keepEmpty) => { // заполнить всё поле кроме keepEmpty=[ [r,c].. ]
        const skip = new Set((keepEmpty || []).map((x) => x[0] + ',' + x[1]));
        for (let r = 0; r < GRID; r++)
          for (let c = 0; c < GRID; c++)
            board[r][c] = skip.has(r + ',' + c) ? null : '#7c5cff';
        renderBoard();
      },
      setPiece: (idx, shapeIndex) => {
        const s = SHAPES[shapeIndex];
        pieces[idx] = { cells: s.cells, w: s.w, h: s.h, color: '#00e0c6' };
        renderTray();
      },
      state: () => ({ score, board, pieces }),
    };
  }

  // ===== Запуск =====
  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
