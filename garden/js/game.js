/* =========================================================================
   Грядки — простая ферма-идл в стиле «Grow a Garden».
   Сажаешь семена → растут по таймеру → собираешь урожай → покупаешь лучше.
   Растения зреют по абсолютному времени, поэтому растут и пока игра закрыта.
   ========================================================================= */
(function () {
  'use strict';

  const SAVE_KEY = 'garden_save_v1';
  const PLOTS = 9;

  const SEEDS = [
    { id: 0, emoji: '🥕', name: 'Морковь',   cost: 10,    grow: 4000,   sell: 22 },
    { id: 1, emoji: '🍓', name: 'Клубника',  cost: 50,    grow: 9000,   sell: 130 },
    { id: 2, emoji: '🍇', name: 'Виноград',  cost: 220,   grow: 16000,  sell: 560 },
    { id: 3, emoji: '🍉', name: 'Арбуз',     cost: 850,   grow: 30000,  sell: 2400 },
    { id: 4, emoji: '🍍', name: 'Ананас',    cost: 3200,  grow: 60000,  sell: 9500 },
    { id: 5, emoji: '🌻', name: 'Подсолнух', cost: 13000, grow: 120000, sell: 42000 },
  ];

  // Стоимость разблокировки грядок (индексы 3..8)
  const UNLOCK_COST = [0, 0, 0, 120, 350, 900, 2200, 6000, 15000];

  // ---- Состояние ----
  let state = {
    coins: 30,
    plots: [],          // {seed:id|null, plantedAt:ms|null}
    unlocked: [],       // bool[9]
    selected: 0,
    x2Until: 0,
    harvestCount: 0,
  };
  let plotEls = [];

  const $ = (id) => document.getElementById(id);
  const gardenEl = $('garden');
  const shopEl = $('shop');
  const coinsEl = $('coins');
  const hintEl = $('hint');
  const x2Banner = $('x2-banner');
  const x2Time = $('x2-time');
  const toastEl = $('toast');

  // ===== Утилиты =====
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0','') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0','') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0','') + 'k';
    return String(n);
  }
  function now() { return Date.now(); }
  function mult() { return now() < state.x2Until ? 2 : 1; }

  // ===== Сохранение =====
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.plots) && s.plots.length === PLOTS) {
          state = Object.assign(state, s);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // ===== Инициализация =====
  function init() {
    if (!load()) {
      state.plots = [];
      state.unlocked = [];
      for (let i = 0; i < PLOTS; i++) {
        state.plots.push({ seed: null, plantedAt: null });
        state.unlocked.push(i < 3);
      }
    }
    buildGarden();
    buildShop();
    bind();
    updateCoins();
    setInterval(tick, 250);
    tick();
  }

  // ===== Грядки =====
  function buildGarden() {
    gardenEl.innerHTML = '';
    plotEls = [];
    for (let i = 0; i < PLOTS; i++) {
      const el = document.createElement('div');
      el.className = 'plot';
      el.innerHTML = '<div class="emoji"></div><div class="progress"></div>';
      el.addEventListener('click', () => onPlot(i));
      gardenEl.appendChild(el);
      plotEls.push(el);
      renderPlot(i);
    }
  }

  function renderPlot(i) {
    const el = plotEls[i];
    const p = state.plots[i];
    const emojiEl = el.querySelector('.emoji');
    const prog = el.querySelector('.progress');

    el.classList.remove('locked', 'ripe');
    if (!state.unlocked[i]) {
      el.classList.add('locked');
      el.innerHTML = `<div class="lockico">🔒</div><div class="lockcost">🪙 ${fmt(UNLOCK_COST[i])}</div>`;
      el.onclick = () => onPlot(i);
      return;
    }
    // восстановим структуру если была заблокирована
    if (!el.querySelector('.emoji')) {
      el.innerHTML = '<div class="emoji"></div><div class="progress"></div>';
    }
    const e2 = el.querySelector('.emoji');
    const pr = el.querySelector('.progress');

    if (p.seed === null) {
      e2.textContent = '';
      pr.style.width = '0%';
      return;
    }
    const seed = SEEDS[p.seed];
    const elapsed = now() - p.plantedAt;
    const ripe = elapsed >= seed.grow;
    if (ripe) {
      el.classList.add('ripe');
      e2.textContent = seed.emoji;
      pr.style.width = '0%';
    } else {
      e2.textContent = '🌱';
      pr.style.width = Math.min(100, (elapsed / seed.grow) * 100) + '%';
    }
  }

  function onPlot(i) {
    if (!state.unlocked[i]) {
      // разблокировать
      const cost = UNLOCK_COST[i];
      if (state.coins >= cost) {
        state.coins -= cost;
        state.unlocked[i] = true;
        state.plots[i] = { seed: null, plantedAt: null };
        renderPlot(i);
        updateCoins();
        toast('🌼 Новая грядка!');
        save();
      } else {
        hint(`Нужно 🪙 ${fmt(cost)} для новой грядки`);
      }
      return;
    }
    const p = state.plots[i];
    if (p.seed === null) {
      // посадить выбранное семя
      const seed = SEEDS[state.selected];
      if (state.coins >= seed.cost) {
        state.coins -= seed.cost;
        p.seed = seed.id;
        p.plantedAt = now();
        renderPlot(i);
        updateCoins();
        save();
      } else {
        hint(`Не хватает монет на ${seed.name} (🪙 ${fmt(seed.cost)})`);
      }
    } else {
      // собрать если созрело
      const seed = SEEDS[p.seed];
      if (now() - p.plantedAt >= seed.grow) {
        harvestPlot(i);
      }
    }
  }

  function harvestPlot(i) {
    const p = state.plots[i];
    const seed = SEEDS[p.seed];
    const gain = seed.sell * mult();
    state.coins += gain;
    p.seed = null; p.plantedAt = null;
    renderPlot(i);
    updateCoins();
    flyCoin(plotEls[i], '+' + fmt(gain));
    save();
  }

  function harvestAll() {
    let total = 0, count = 0;
    for (let i = 0; i < PLOTS; i++) {
      const p = state.plots[i];
      if (p.seed !== null && now() - p.plantedAt >= SEEDS[p.seed].grow) {
        total += SEEDS[p.seed].sell * mult();
        count++;
        p.seed = null; p.plantedAt = null;
        renderPlot(i);
      }
    }
    if (count === 0) { hint('Нет созревшего урожая'); return; }
    state.coins += total;
    updateCoins();
    toast(`🧺 Собрано ${count} · +🪙 ${fmt(total)}`);
    save();

    // Межстраничная реклама изредка
    state.harvestCount++;
    if (state.harvestCount % 5 === 0) window.YSDK.showFullscreen();
  }

  // ===== Магазин =====
  function buildShop() {
    shopEl.innerHTML = '';
    SEEDS.forEach((seed) => {
      const el = document.createElement('div');
      el.className = 'seed';
      el.dataset.id = seed.id;
      el.innerHTML =
        `<div class="seed-emoji">${seed.emoji}</div>` +
        `<div class="seed-name">${seed.name}</div>` +
        `<div class="seed-cost">🪙 ${fmt(seed.cost)}</div>`;
      el.addEventListener('click', () => {
        state.selected = seed.id;
        updateShop();
        hint(`Выбрано: ${seed.name}. Нажми на грядку, чтобы посадить`);
        save();
      });
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

  // ===== Монеты / подсказки =====
  function updateCoins() {
    coinsEl.textContent = fmt(state.coins);
    updateShop();
  }
  let hintTimer = null;
  function hint(txt) {
    hintEl.textContent = txt;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintEl.textContent = 'Выбери семя в магазине и нажми на грядку'; }, 2500);
  }
  let toastTimer = null;
  function toast(txt) {
    toastEl.textContent = txt;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1800);
  }
  function flyCoin(plotEl, txt) {
    const rect = plotEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-coin';
    el.textContent = '🪙 ' + txt;
    el.style.left = (rect.left + rect.width / 2 - 20) + 'px';
    el.style.top = (rect.top + rect.height / 2 - 10) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // ===== Суперспособности (реклама за награду) =====
  function buffX2() {
    window.YSDK.showRewarded(() => {
      state.x2Until = now() + 60000;
      toast('⚡ x2 монеты на 60 секунд!');
      tick();
      save();
    });
  }
  function buffWater() {
    window.YSDK.showRewarded(() => {
      let any = false;
      for (let i = 0; i < PLOTS; i++) {
        const p = state.plots[i];
        if (p.seed !== null) { p.plantedAt = now() - SEEDS[p.seed].grow; any = true; renderPlot(i); }
      }
      toast(any ? '💧 Весь урожай созрел!' : 'Нечего поливать');
      save();
    });
  }
  function buffGift() {
    window.YSDK.showRewarded(() => {
      const bonus = Math.max(100, Math.floor(state.coins * 0.5) + 150);
      state.coins += bonus;
      updateCoins();
      toast('🎁 Бонус: +🪙 ' + fmt(bonus));
      save();
    });
  }

  // ===== Тик =====
  function tick() {
    for (let i = 0; i < PLOTS; i++) if (state.unlocked[i]) renderPlot(i);
    // баннер x2
    const left = state.x2Until - now();
    if (left > 0) {
      x2Banner.classList.remove('hidden');
      x2Time.textContent = Math.ceil(left / 1000);
    } else {
      x2Banner.classList.add('hidden');
    }
  }

  function bind() {
    $('btn-harvest').onclick = harvestAll;
    $('pw-x2').onclick = buffX2;
    $('pw-water').onclick = buffWater;
    $('pw-gift').onclick = buffGift;

    // Тестовый API
    window.__garden = {
      state: () => state,
      plant: (i, seedId) => { state.selected = seedId; state.coins += SEEDS[seedId].cost; onPlot(i); },
      ripen: (i) => { if (state.plots[i].seed !== null) state.plots[i].plantedAt = now() - SEEDS[state.plots[i].seed].grow; renderPlot(i); },
      harvestAll,
    };
  }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    init();
    window.YSDK.gameReady();
  });
})();
