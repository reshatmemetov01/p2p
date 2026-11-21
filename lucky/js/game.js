/* =========================================================================
   Lucky Block Survival — разбивай лаки-блоки, получай сюрпризы, выживай.
   Модели: KayKit Adventurers (герой), KayKit Skeletons (монстры),
   KayKit Platformer Pack (арена) — всё CC0.
   ========================================================================= */
(function () {
  'use strict';
  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'lucky_save_v1';

  // ---------- Языки ----------
  const TEXTS = {
    en: { loading: 'Loading', over: 'You died!', revive: 'Revive (watch ad)', x2: 'Double coins (watch ad)', shop: '🛒 Upgrades', again: 'Play again',
      shopTitle: '🛒 Upgrades', play: 'Play!', paused: 'Paused', resume: 'Resume', quit: 'Give up',
      tip: 'Break the lucky blocks with your axe! Surprises inside — good and bad 😈', tipPc: 'WASD — move · Click / F — hit · Space — jump',
      score: 'Score', best: 'Best', time: 'Survived', earned: 'Coins earned', newBest: '🏆 New record!',
      r: ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SECRET'],
      coins: (n) => '+' + n + ' ●', gem: '💎 GEM!', heart: '❤️ +1 LIFE', speed: '⚡ SUPER SPEED', power: '🦸 SUPER STRENGTH', bomb: '💣 BOMB!', monster: '💀 MONSTER!', army: '🧟 SKELETON ARMY!', jackpot: '🌈 JACKPOT!',
      evWave: '💀 SKELETON WAVE!', evRain: '💣 BOMB RAIN!', evLucky: '🍀 LUCKY TIME!', evGold: '✨ GOLD RUSH!', evSub: 'Random event',
      upDmg: ['🪓', 'Sharper axe', 'More damage per hit'], upSpd: ['👟', 'Fast boots', 'Run faster'], upHp: ['❤️', 'Extra heart', '+1 life at start'], upLuck: ['🍀', 'Luck', 'Rarer blocks, fewer traps'],
      lvl: 'Lv', max: 'MAX' },
    ru: { loading: 'Загрузка', over: 'Ты погиб!', revive: 'Воскреснуть (реклама)', x2: 'Удвоить монеты (реклама)', shop: '🛒 Прокачка', again: 'Ещё раз',
      shopTitle: '🛒 Прокачка', play: 'Играть!', paused: 'Пауза', resume: 'Продолжить', quit: 'Сдаться',
      tip: 'Разбивай лаки-блоки топором! Внутри сюрпризы — хорошие и плохие 😈', tipPc: 'WASD — движение · Клик / F — удар · Пробел — прыжок',
      score: 'Очки', best: 'Рекорд', time: 'Продержался', earned: 'Монет заработано', newBest: '🏆 Новый рекорд!',
      r: ['ОБЫЧНЫЙ', 'РЕДКИЙ', 'ЭПИЧЕСКИЙ', 'ЛЕГЕНДАРНЫЙ', 'МИФИЧЕСКИЙ', 'СЕКРЕТНЫЙ'],
      coins: (n) => '+' + n + ' ●', gem: '💎 КРИСТАЛЛ!', heart: '❤️ +1 ЖИЗНЬ', speed: '⚡ СУПЕРСКОРОСТЬ', power: '🦸 СУПЕРСИЛА', bomb: '💣 БОМБА!', monster: '💀 МОНСТР!', army: '🧟 АРМИЯ СКЕЛЕТОВ!', jackpot: '🌈 ДЖЕКПОТ!',
      evWave: '💀 ВОЛНА СКЕЛЕТОВ!', evRain: '💣 ДОЖДЬ ИЗ БОМБ!', evLucky: '🍀 ВРЕМЯ УДАЧИ!', evGold: '✨ ЗОЛОТАЯ ЛИХОРАДКА!', evSub: 'Случайное событие',
      upDmg: ['🪓', 'Острый топор', 'Больше урона за удар'], upSpd: ['👟', 'Быстрые ботинки', 'Бегаешь быстрее'], upHp: ['❤️', 'Лишнее сердце', '+1 жизнь на старте'], upLuck: ['🍀', 'Удача', 'Реже ловушки, чаще редкие блоки'],
      lvl: 'Ур.', max: 'МАКС' },
  };
  const RU_LANGS = ['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'tg', 'hy', 'az', 'tt'];
  let L = TEXTS.en;
  function detectLang() {
    let code = '';
    try { code = (window.bridge && bridge.platform && bridge.platform.language) || ''; } catch (e) {}
    if (!code) code = navigator.language || 'en';
    L = RU_LANGS.indexOf(String(code).toLowerCase().slice(0, 2)) >= 0 ? TEXTS.ru : TEXTS.en;
    document.documentElement.lang = L === TEXTS.ru ? 'ru' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => { const v = L[el.getAttribute('data-i18n')]; if (typeof v === 'string') el.textContent = v; });
  }

  // ---------- Сохранение ----------
  let save = { coins: 0, best: 0, up: { dmg: 0, spd: 0, hp: 0, luck: 0 }, runs: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) { save = Object.assign(save, s); save.up = Object.assign({ dmg: 0, spd: 0, hp: 0, luck: 0 }, s.up || {}); } } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ---------- Константы ----------
  const TILE = 4, NT = 9, HALF = (NT * TILE) / 2, EDGE = HALF - 1.0;
  const RAR = [
    { c: '#38c95a', d: '#1e7a35', glow: 0x000000, hp: 2, w: 55, pts: 10 },
    { c: '#3a9bff', d: '#1b4f99', glow: 0x0a2a66, hp: 3, w: 25, pts: 25 },
    { c: '#a65cff', d: '#5a2a99', glow: 0x2a0a55, hp: 4, w: 12, pts: 60 },
    { c: '#ffc531', d: '#a5700a', glow: 0x553300, hp: 5, w: 5.5, pts: 150 },
    { c: '#ff4545', d: '#8a1414', glow: 0x550808, hp: 6, w: 2.2, pts: 400 },
    { c: '#ffffff', d: '#7a4ac9', glow: 0x333333, hp: 6, w: 0.5, pts: 1000 },
  ];

  // ---------- Three ----------
  let renderer, scene, camera, sun; const clock = new T.Clock();
  const K = {}; let heroTmpl, heroClips, skelTmpl, skelClips, boxTex = [], boxGeo, rainbowMat;
  let loaded = false, mode = 'load'; // load | play | dead | pause | over
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3();

  function texCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  function blockTexture(r) {
    return texCanvas(128, 128, (x, w, h) => {
      const R = RAR[r];
      if (r === 5) { const g = x.createLinearGradient(0, 0, w, h); ['#ff4d6d', '#ffb13b', '#ffe94a', '#4fe083', '#3fa7ff', '#a65cff'].forEach((c, i) => g.addColorStop(i / 5, c)); x.fillStyle = g; }
      else { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, R.c); g.addColorStop(1, R.d); x.fillStyle = g; }
      x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(14, 14, w - 28, 22);
      x.font = '900 82px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = 'rgba(20,10,50,.75)'; x.strokeText('?', w / 2, h / 2 + 6);
      x.fillStyle = r === 3 ? '#fff6c8' : '#ffffff'; x.fillText('?', w / 2, h / 2 + 6);
    });
  }

  function initThree() {
    renderer = new T.WebGLRenderer({ canvas: $('game'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputEncoding = T.sRGBEncoding;
    scene = new T.Scene();
    scene.background = texCanvas(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3e9cff'); g.addColorStop(0.55, '#9fdcff'); g.addColorStop(1, '#e8f7ff'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    scene.fog = new T.Fog(0xbfe6ff, 45, 110);
    camera = new T.PerspectiveCamera(50, 1, 0.3, 250);
    scene.add(new T.HemisphereLight(0xeaf6ff, 0x6a7a9a, 0.85));
    sun = new T.DirectionalLight(0xfff2dc, 0.9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 }); sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);
    window.addEventListener('resize', onResize); onResize();
  }
  let portrait = false;
  function onResize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; portrait = h > w; camera.fov = portrait ? 62 : 50; camera.updateProjectionMatrix(); }

  function inst(name, x, y, z, ry, s) {
    const t = K[name]; if (!t) return new T.Group();
    const o = t.clone(); o.position.set(x, y, z); o.rotation.y = ry || 0; if (s) o.scale.setScalar(s);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(o); return o;
  }

  // ---------- Арена ----------
  function buildArena() {
    for (let i = 0; i < NT; i++) for (let j = 0; j < NT; j++) {
      const x = (i - (NT - 1) / 2) * TILE, z = (j - (NT - 1) / 2) * TILE;
      const edge = i === 0 || j === 0 || i === NT - 1 || j === NT - 1;
      inst(edge ? 'platform_4x4x1_blue' : (i + j) % 2 || (i % 3 && j % 3) ? 'platform_4x4x1_green' : 'platform_4x4x1_yellow', x, -1, z);
    }
    // опоры острова
    for (const [x, z] of [[-HALF + 2, -HALF + 2], [HALF - 2, -HALF + 2], [-HALF + 2, HALF - 2], [HALF - 2, HALF - 2], [0, -HALF + 2], [0, HALF - 2], [-HALF + 2, 0], [HALF - 2, 0]]) inst('pillar_2x2x4', x, -5, z, 0, 1);
    // ограждение и флаги
    const fl = ['flag_A_red', 'flag_A_blue', 'flag_A_yellow', 'flag_A_green'];
    for (let k = -HALF + 2; k <= HALF - 2; k += 4) {
      inst('barrier_4x1x1', k, 0, -HALF + 0.4, 0); inst('barrier_4x1x1', k, 0, HALF - 0.4, 0);
      inst('barrier_4x1x1', -HALF + 0.4, 0, k, Math.PI / 2); inst('barrier_4x1x1', HALF - 0.4, 0, k, Math.PI / 2);
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => inst(fl[i], a * (HALF - 0.6), 1, b * (HALF - 0.6), 0, 1.6));
    // декоративные кубы-колонны по углам арены (столкновения)
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => { inst(i % 2 ? 'platform_decorative_2x2x2_blue' : 'platform_decorative_2x2x2_green', a * (HALF - 5), 0, b * (HALF - 5)); obstacles.push({ x: a * (HALF - 5), z: b * (HALF - 5), r: 1.25 }); });
    // далёкие острова и облака
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + 0.3, r = 46 + (k % 3) * 12; const o = inst(k % 2 ? 'platform_4x4x1_green' : 'platform_4x4x1_yellow', Math.cos(a) * r, -6 - (k % 4) * 3, Math.sin(a) * r, a, 2 + (k % 3)); o.traverse((m) => { if (m.isMesh) m.castShadow = false; }); }
    const cm = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
    for (let k = 0; k < 22; k++) { const g = new T.Group(); for (let q = 0; q < 4; q++) { const s = new T.Mesh(new T.SphereGeometry(1, 10, 8), cm); s.position.set(q * 1.4 - 2, Math.random() * 0.6, Math.random()); s.scale.setScalar(1 + Math.random() * 0.8); g.add(s); }
      const a = Math.random() * 6.28, r = 40 + Math.random() * 40; g.position.set(Math.cos(a) * r, -10 + Math.random() * 25, Math.sin(a) * r); g.scale.setScalar(1.5 + Math.random() * 1.5); scene.add(g); }
  }
  const obstacles = [];

  // ---------- Персонажи ----------
  function makeChar(tmpl, clips, scale, once) {
    const root = T.SkeletonUtils.clone(tmpl); root.scale.setScalar(scale);
    root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } }); scene.add(root);
    const mixer = new T.AnimationMixer(root), act = {}; clips.forEach((c) => { act[c.name] = mixer.clipAction(c); });
    once.forEach((n) => { if (act[n]) { act[n].setLoop(T.LoopOnce); act[n].clampWhenFinished = true; } });
    return { root, mixer, act, cur: null };
  }
  function play(ch, name, fade, restart) {
    if (!ch.act[name] || (ch.cur === name && !restart)) return;
    const n = ch.act[name]; n.reset(); n.play(); if (ch.cur && ch.act[ch.cur] && ch.cur !== name) ch.act[ch.cur].crossFadeTo(n, fade == null ? 0.12 : fade, false); ch.cur = name;
  }

  // ---------- Состояние забега ----------
  let hero = null, blocks = [], monsters = [], bombs = [], pickups = [], fx = [];
  let hp = 3, maxHp = 3, score = 0, runCoins = 0, time = 0, nextBlock = 0, nextEvent = 25, luckyLeft = 0, revived = false;
  let pSpeed = 0, pPower = 0, inv = 0, atkT = 0, atkCd = 0, hitDone = false, vy = 0, py = 0, yaw = 0, camShake = 0;
  const input = { x: 0, y: 0, keys: {}, hit: 0, jump: 0 };
  const pos = new T.Vector3();

  function resetRun() {
    blocks.forEach((b) => scene.remove(b.mesh)); blocks = [];
    monsters.forEach((m) => scene.remove(m.ch.root)); monsters = [];
    bombs.forEach((b) => scene.remove(b.obj)); bombs = [];
    pickups.forEach((p) => scene.remove(p.obj)); pickups = [];
    fx.forEach((f) => scene.remove(f.m)); fx = [];
    maxHp = 3 + save.up.hp; hp = maxHp; score = 0; runCoins = 0; time = 0; nextBlock = 0; nextEvent = 25; luckyLeft = 0; revived = false;
    pSpeed = 0; pPower = 0; inv = 1.5; atkT = 0; atkCd = 0; vy = 0; py = 0; yaw = 0;
    pos.set(0, 0, -4);
    for (let k = 0; k < 9; k++) spawnBlock(k < 3 ? 0 : undefined);
    renderHearts(); updateHud();
  }
  function startRun() {
    ['end', 'shop', 'pause', 'loading'].forEach((id) => $(id).classList.add('hidden'));
    resetRun(); mode = 'play'; hero.root.visible = true; play(hero, 'Idle', 0);
    save.runs++; persist(); window.YSDK.event('level_started', save.runs);
    showTip(save.runs <= 2 ? L.tip : null);
  }
  function showTip(t) {
    const el = $('tip'); if (!t) { el.classList.add('hidden'); return; }
    const pc = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    el.innerHTML = t + (pc ? '<br><small>' + L.tipPc + '</small>' : ''); el.classList.remove('hidden');
    clearTimeout(showTip._t); showTip._t = setTimeout(() => el.classList.add('hidden'), 6500);
  }

  // ---------- Блоки ----------
  function rollRarity(boost) {
    const luck = save.up.luck * 0.12 + (luckyLeft > 0 ? 1.2 : 0) + (boost || 0);
    const w = RAR.map((r, i) => r.w * (i === 0 ? Math.max(0.2, 1 - luck * 0.5) : 1 + luck * i * 0.35));
    let s = w.reduce((a, b) => a + b, 0) * Math.random();
    for (let i = 0; i < w.length; i++) { s -= w[i]; if (s <= 0) return i; } return 0;
  }
  function freeSpot(minPlayer) {
    for (let k = 0; k < 40; k++) {
      const x = (Math.random() * 2 - 1) * (EDGE - 1.2), z = (Math.random() * 2 - 1) * (EDGE - 1.2);
      if (Math.hypot(x - pos.x, z - pos.z) < minPlayer) continue;
      if (blocks.some((b) => Math.hypot(b.x - x, b.z - z) < 2.6)) continue;
      if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4)) continue;
      return [x, z];
    } return null;
  }
  function spawnBlock(forced) {
    const sp = freeSpot(3); if (!sp) return;
    const r = forced != null ? forced : rollRarity();
    const mats = r === 5 ? rainbowMat : new T.MeshStandardMaterial({ map: boxTex[r], roughness: 0.35, metalness: 0.05, emissive: RAR[r].glow, emissiveIntensity: 1 });
    const m = new T.Mesh(boxGeo, mats); m.castShadow = true; m.position.set(sp[0], 0.75, sp[1]); m.scale.setScalar(0.01); scene.add(m);
    const b = { mesh: m, x: sp[0], z: sp[1], r, hp: RAR[r].hp, max: RAR[r].hp, t: Math.random() * 6, born: 0, shake: 0, bar: null };
    if (r >= 3) { const l = new T.PointLight(r === 3 ? 0xffc531 : r === 4 ? 0xff4545 : 0xffffff, 1.2, 5); l.position.y = 0.2; m.add(l); }
    blocks.push(b);
  }
  function damageBlock(b, dmg) {
    b.hp -= dmg; b.shake = 0.25; sparks(b.mesh.position, RAR[b.r].c, 6);
    if (window.GameAudio) GameAudio.sfx('place');
    if (b.hp <= 0) breakBlock(b);
  }
  function breakBlock(b) {
    const i = blocks.indexOf(b); if (i < 0) return; blocks.splice(i, 1); scene.remove(b.mesh);
    if (b.bar) { b.bar.remove(); b.bar = null; }
    sparks(b.mesh.position, RAR[b.r].c, 24, true);
    score += RAR[b.r].pts; camShake = Math.max(camShake, 0.12 + b.r * 0.05);
    if (b.r >= 3) { banner(L.r[b.r] + '!', '', RAR[b.r].c); if (window.GameAudio) GameAudio.sfx('perfect'); }
    surprise(b);
    if (luckyLeft > 0) luckyLeft--;
  }

  // ---------- Сюрпризы ----------
  function surprise(b) {
    const r = b.r, p = b.mesh.position.clone();
    const badChance = Math.max(0.08, [0.36, 0.3, 0.28, 0.2, 0.25, 0][r] - save.up.luck * 0.03);
    if (r === 5) { // секретный: джекпот
      addCoins(500, p); label(p, L.jackpot, '#fff', true); giveSpeed(10); givePower(10); hp = Math.min(maxHp + 1, hp + 1); renderHearts();
      for (let k = 0; k < 4; k++) setTimeout(() => spawnBlock(3 + (k % 2)), 300 + k * 250); return;
    }
    if (Math.random() < badChance) {
      const roll = Math.random();
      if (r >= 2 && roll < 0.4) { label(p, L.army, '#ff6a6a', true); const n = 3 + r; for (let k = 0; k < n; k++) setTimeout(() => spawnMonster(p.x + Math.cos(k / n * 6.28) * 2.2, p.z + Math.sin(k / n * 6.28) * 2.2), k * 120); }
      else if (roll < 0.7) { label(p, L.monster, '#ff6a6a'); spawnMonster(p.x, p.z); if (r >= 3) spawnMonster(p.x + 1.5, p.z); }
      else { label(p, L.bomb, '#ff9a3a'); dropBomb(p.x, p.z, 0.6, 1.4); }
      if (window.GameAudio) GameAudio.sfx('fail');
      return;
    }
    const good = Math.random();
    const base = [20, 45, 90, 200, 450][r];
    if (good < 0.45) { addCoins(base + Math.floor(Math.random() * base * 0.5), p); }
    else if (good < 0.6) { score += 50 * (r + 1); addCoins(Math.floor(base / 2), p); popItem('diamond_blue', p); label(p, L.gem, '#7ad7ff'); }
    else if (good < 0.72) { if (hp < maxHp + 2) { hp++; renderHearts(); } popItem('heart_red', p); label(p, L.heart, '#ff7a8a'); if (window.GameAudio) GameAudio.sfx('perfect'); }
    else if (good < 0.86) { giveSpeed(6 + r * 1.5); label(p, L.speed, '#7ad7ff'); popItem('power_yellow', p); }
    else { givePower(6 + r * 1.5); label(p, L.power, '#ffb36b'); popItem('star_yellow', p); }
    if (r >= 3) addCoins(base, p, true);
  }
  function addCoins(n, p, silent) {
    runCoins += n; score += n; if (!silent) label(p, L.coins(n), '#ffd23f', n >= 200);
    const c = Math.min(10, 2 + Math.floor(n / 30));
    for (let k = 0; k < c; k++) { const o = new T.Mesh(coinGeo, coinMat); o.position.copy(p); scene.add(o); const a = Math.random() * 6.28;
      fx.push({ m: o, v: new T.Vector3(Math.cos(a) * 2.5, 6 + Math.random() * 3, Math.sin(a) * 2.5), life: 1.1, coin: true, spin: 8 }); }
    if (window.GameAudio) GameAudio.sfx('coin');
  }
  let coinGeo, coinMat;
  function popItem(name, p) { const o = inst(name, p.x, p.y + 0.6, p.z, 0, 1.3); fx.push({ m: o, v: new T.Vector3(0, 4, 0), life: 1.0, item: true, spin: 6 }); }
  function giveSpeed(s) { pSpeed = Math.max(pSpeed, s); if (window.GameAudio) GameAudio.sfx('power'); }
  function givePower(s) { pPower = Math.max(pPower, s); if (window.GameAudio) GameAudio.sfx('power'); }

  // ---------- Монстры ----------
  function spawnMonster(x, z) {
    if (monsters.length >= 26) return;
    x = Math.max(-EDGE, Math.min(EDGE, x)); z = Math.max(-EDGE, Math.min(EDGE, z));
    const ch = makeChar(skelTmpl, skelClips, 0.64, ['Spawn_Ground_Skeletons', 'Hit_A', 'Death_A', 'Unarmed_Melee_Attack_Punch_A']);
    ch.root.position.set(x, 0, z); play(ch, 'Spawn_Ground_Skeletons', 0);
    const tier = Math.min(3, Math.floor(time / 75));
    monsters.push({ ch, x, z, hp: 3 + tier, st: 'spawn', t: 1.3, cd: 0, yaw: 0, speed: 2.6 + tier * 0.35 + Math.random() * 0.4, kb: new T.Vector3() });
    sparks(tmpV.set(x, 0.2, z), '#9a8a7a', 10);
  }
  function hurtMonster(m, dmg, dir) {
    if (m.st === 'dead' || m.st === 'spawn') return;
    m.hp -= dmg; m.kb.copy(dir).multiplyScalar(7); sparks(tmpV.set(m.x, 0.9, m.z), '#ffffff', 8);
    if (m.hp <= 0) { m.st = 'dead'; m.t = 1.4; play(m.ch, 'Death_A', 0.05); score += 50; addCoins(8, tmpV.set(m.x, 1, m.z).clone(), true); label(tmpV.set(m.x, 1.6, m.z).clone(), '+50', '#fff'); }
    else { m.st = 'hit'; m.t = 0.35; play(m.ch, 'Hit_A', 0.05, true); }
  }
  function updateMonsters(dt) {
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i], ch = m.ch; ch.mixer.update(dt);
      if (m.st === 'dead') { m.t -= dt; if (m.t < 0.4) ch.root.position.y -= dt * 2; if (m.t <= 0) { scene.remove(ch.root); monsters.splice(i, 1); } continue; }
      m.x += m.kb.x * dt; m.z += m.kb.z * dt; m.kb.multiplyScalar(Math.exp(-8 * dt));
      const dx = pos.x - m.x, dz = pos.z - m.z, d = Math.hypot(dx, dz);
      if (m.st === 'spawn') { m.t -= dt; if (m.t <= 0) m.st = 'chase'; }
      else if (m.st === 'hit') { m.t -= dt; if (m.t <= 0) m.st = 'chase'; }
      else if (m.st === 'chase') {
        if (mode === 'play' && d < 1.15 && m.cd <= 0) { m.st = 'attack'; m.t = 0.55; m.hitDone = false; play(m.ch, 'Unarmed_Melee_Attack_Punch_A', 0.08, true); }
        else if (mode === 'play') { m.x += dx / (d || 1) * m.speed * dt; m.z += dz / (d || 1) * m.speed * dt; m.yaw = Math.atan2(dx, dz); play(ch, 'Running_A', 0.15); }
        else play(ch, 'Idle', 0.2);
      } else if (m.st === 'attack') {
        m.t -= dt; m.yaw = Math.atan2(dx, dz);
        if (!m.hitDone && m.t < 0.3) { m.hitDone = true; if (d < 1.5) hurtHero(new T.Vector3(dx, 0, dz).normalize()); }
        if (m.t <= 0) { m.st = 'chase'; m.cd = 0.9; }
      }
      if (m.cd > 0) m.cd -= dt;
      // раздвигаем монстров и блоки
      for (const o of monsters) if (o !== m && o.st !== 'dead') { const ex = m.x - o.x, ez = m.z - o.z, ed = Math.hypot(ex, ez); if (ed < 0.8 && ed > 0.001) { m.x += ex / ed * (0.8 - ed) * 0.5; m.z += ez / ed * (0.8 - ed) * 0.5; } }
      pushOut(m, 0.4);
      ch.root.position.set(m.x, 0, m.z); ch.root.rotation.y = m.yaw;
    }
  }
  function pushOut(o, r) {
    for (const b of blocks) { const ex = o.x - b.x, ez = o.z - b.z, ed = Math.hypot(ex, ez), md = r + 0.9; if (ed < md && ed > 0.001) { o.x = b.x + ex / ed * md; o.z = b.z + ez / ed * md; } }
    for (const b of obstacles) { const ex = o.x - b.x, ez = o.z - b.z, ed = Math.hypot(ex, ez), md = r + b.r; if (ed < md && ed > 0.001) { o.x = b.x + ex / ed * md; o.z = b.z + ez / ed * md; } }
    o.x = Math.max(-EDGE, Math.min(EDGE, o.x)); o.z = Math.max(-EDGE, Math.min(EDGE, o.z));
  }

  // ---------- Бомбы ----------
  function dropBomb(x, z, h, fuse) {
    const o = inst('bomb_A_red', x, h, z, 0, 1.4); const ring = new T.Mesh(new T.RingGeometry(2.6, 2.9, 32), new T.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z); scene.add(ring);
    bombs.push({ obj: o, ring, x, z, y: h, vy: 0, t: fuse, max: fuse });
  }
  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i]; b.t -= dt;
      if (b.y > 0) { b.vy -= 25 * dt; b.y = Math.max(0, b.y + b.vy * dt); }
      b.obj.position.set(b.x, b.y, b.z); const f = 1 - b.t / b.max; b.obj.scale.setScalar(1.4 + Math.sin(f * f * 60) * 0.15 * f);
      b.ring.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(f * 20));
      if (b.t <= 0) { scene.remove(b.obj); scene.remove(b.ring); bombs.splice(i, 1); explode(b.x, b.z); }
    }
  }
  function explode(x, z) {
    camShake = 0.5; sparks(tmpV.set(x, 0.5, z), '#ff8a2a', 26, true); sparks(tmpV.set(x, 0.5, z), '#444444', 14, true);
    const fl = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.8 })); fl.position.set(x, 0.6, z); scene.add(fl); fx.push({ m: fl, v: new T.Vector3(), life: 0.35, boom: true });
    if (window.GameAudio && GameAudio.ctx) GameAudio.slide(300, 40, GameAudio.ctx.currentTime, 0.5, 'sawtooth', 0.5);
    const R = 2.9;
    if (Math.hypot(pos.x - x, pos.z - z) < R && py < 1.2) hurtHero(new T.Vector3(pos.x - x, 0, pos.z - z).normalize(), 2);
    monsters.slice().forEach((m) => { if (Math.hypot(m.x - x, m.z - z) < R) hurtMonster(m, 99, new T.Vector3(m.x - x, 0, m.z - z).normalize()); });
    blocks.slice().forEach((b) => { if (Math.hypot(b.x - x, b.z - z) < R) damageBlock(b, 99); });
  }

  // ---------- Герой ----------
  function hurtHero(dir, dmg) {
    if (inv > 0 || mode !== 'play') return;
    hp -= dmg || 1; inv = 1.1; camShake = 0.35; renderHearts();
    pos.x += dir.x * 0.9; pos.z += dir.z * 0.9; play(hero, 'Hit_A', 0.05, true); atkT = 0;
    if (window.GameAudio) GameAudio.sfx('fail');
    if (hp <= 0) die();
  }
  function die() {
    mode = 'dead'; play(hero, 'Death_A', 0.1, true); window.YSDK.event('level_failed', save.runs);
    setTimeout(showEnd, 1500);
  }
  function updateHero(dt) {
    let ix = input.x, iy = input.y;
    if (input.keys.left) ix -= 1; if (input.keys.right) ix += 1; if (input.keys.up) iy += 1; if (input.keys.down) iy -= 1;
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    if (mode !== 'play') { ix = 0; iy = 0; }
    const spd = (5.2 + save.up.spd * 0.45) * (pSpeed > 0 ? 1.6 : 1) * (atkT > 0 ? 0.45 : 1);
    pos.x += -ix * spd * dt; pos.z += iy * spd * dt;
    const ho = { x: pos.x, z: pos.z }; pushOut(ho, 0.4); pos.x = ho.x; pos.z = ho.z;
    // прыжок
    if (input.jump > 0) { input.jump -= dt; if (py <= 0 && mode === 'play') { vy = 9.5; input.jump = 0; play(hero, 'Jump_Start', 0.05, true); hero.jumpT = 0.2; } }
    if (py > 0 || vy > 0) { vy -= 28 * dt; py = Math.max(0, py + vy * dt); if (py === 0) { vy = 0; play(hero, 'Jump_Land', 0.05, true); hero.landT = 0.15; } }
    // атака
    if (atkCd > 0) atkCd -= dt;
    if (input.hit > 0) input.hit -= dt;
    if (input.hit > 0 && atkCd <= 0 && mode === 'play') {
      input.hit = 0; atkT = 0.42; atkCd = 0.38; hitDone = false; play(hero, '1H_Melee_Attack_Chop', 0.05, true);
      const tg = nearestTarget(2.8); if (tg) yaw = Math.atan2(tg.x - pos.x, tg.z - pos.z);
    }
    if (atkT > 0) { atkT -= dt; if (!hitDone && atkT < 0.22) { hitDone = true; doHit(); } }
    else if (Math.hypot(ix, iy) > 0.1) { const ty = Math.atan2(-ix, iy); let d = ty - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yaw += d * Math.min(1, dt * 14); }
    // анимация
    if (mode === 'play') {
      if (atkT > 0 || hero.cur === 'Hit_A' && inv > 0.7) {}
      else if (py > 0) { if ((hero.jumpT -= dt) <= 0) play(hero, 'Jump_Idle', 0.12); }
      else if (hero.landT > 0) hero.landT -= dt;
      else if (Math.hypot(ix, iy) > 0.1) { play(hero, 'Running_A', 0.12); hero.act.Running_A.timeScale = pSpeed > 0 ? 1.5 : 1.05; }
      else play(hero, 'Idle', 0.2);
    }
    if (inv > 0) inv -= dt; if (pSpeed > 0) pSpeed -= dt; if (pPower > 0) pPower -= dt;
    const sc = pPower > 0 ? 0.86 : 0.66; hero.root.scale.setScalar(hero.root.scale.x + (sc - hero.root.scale.x) * Math.min(1, dt * 8));
    hero.root.position.set(pos.x, py, pos.z); hero.root.rotation.y = yaw;
    hero.root.visible = !(inv > 0 && mode === 'play' && Math.floor(inv * 14) % 2 === 0);
    hero.mixer.update(dt);
  }
  function nearestTarget(r) {
    let best = null, bd = r;
    for (const b of blocks) { const d = Math.hypot(b.x - pos.x, b.z - pos.z) - 0.5; if (d < bd) { bd = d; best = b; } }
    for (const m of monsters) { if (m.st === 'dead' || m.st === 'spawn') continue; const d = Math.hypot(m.x - pos.x, m.z - pos.z); if (d < bd - 0.3) { bd = d; best = m; } }
    return best;
  }
  function doHit() {
    const fx2 = Math.sin(yaw), fz = Math.cos(yaw), cx = pos.x + fx2 * 1.0, cz = pos.z + fz * 1.0;
    const dmg = (1 + save.up.dmg * 0.5) * (pPower > 0 ? 3 : 1), R = pPower > 0 ? 2.0 : 1.45;
    let any = false;
    blocks.slice().forEach((b) => { if (Math.hypot(b.x - cx, b.z - cz) < R + 0.3) { damageBlock(b, dmg); any = true; } });
    monsters.slice().forEach((m) => { if (Math.hypot(m.x - cx, m.z - cz) < R) { hurtMonster(m, dmg, new T.Vector3(fx2, 0, fz)); any = true; } });
    if (any) camShake = Math.max(camShake, 0.1);
  }

  // ---------- События ----------
  function randomEvent() {
    const r = Math.random(), tier = Math.min(5, Math.floor(time / 40));
    if (r < 0.35) { banner(L.evWave, L.evSub, '#ff6a6a'); const n = 3 + tier; for (let k = 0; k < n; k++) { const a = k / n * 6.28; setTimeout(() => spawnMonster(pos.x + Math.cos(a) * 7, pos.z + Math.sin(a) * 7), k * 150); } }
    else if (r < 0.6) { banner(L.evRain, L.evSub, '#ff9a3a'); for (let k = 0; k < 5 + tier; k++) setTimeout(() => { const sp = freeSpot(0) || [pos.x, pos.z]; dropBomb(k % 3 === 0 ? pos.x : sp[0], k % 3 === 0 ? pos.z : sp[1], 9, 2.2); }, k * 380); }
    else if (r < 0.82) { banner(L.evLucky, L.evSub, '#5ee08a'); luckyLeft = 6; for (let k = 0; k < 3; k++) spawnBlock(); }
    else { banner(L.evGold, L.evSub, '#ffd23f'); for (let k = 0; k < 4; k++) setTimeout(() => spawnBlock(3), k * 200); }
  }

  // ---------- Эффекты ----------
  const sparkGeo = new T.BoxGeometry(0.16, 0.16, 0.16);
  function sparks(p, color, n, big) {
    const mat = new T.MeshBasicMaterial({ color: new T.Color(color) });
    for (let k = 0; k < n; k++) { const m = new T.Mesh(sparkGeo, mat); m.position.copy(p); if (big) m.scale.setScalar(1.6 + Math.random()); scene.add(m); const a = Math.random() * 6.28, s = (big ? 3 : 2) + Math.random() * 3;
      fx.push({ m, v: new T.Vector3(Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s), life: 0.6 + Math.random() * 0.4, spin: 10 }); }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.boom) { f.m.scale.setScalar(1 + (0.35 - f.life) * 9); f.m.material.opacity = Math.max(0, f.life / 0.35 * 0.8); }
      else if (f.coin) { if (f.life < 0.6) { tmpV.set(pos.x, py + 1.2, pos.z).sub(f.m.position); f.m.position.addScaledVector(tmpV, Math.min(1, dt * 9)); } else { f.v.y -= 16 * dt; f.m.position.addScaledVector(f.v, dt); } f.m.rotation.y += dt * 12; }
      else if (f.item) { f.m.position.addScaledVector(f.v, dt); f.v.y -= 4 * dt; f.m.rotation.y += dt * f.spin; f.m.scale.setScalar(1.3 * Math.min(1, f.life * 2)); }
      else { f.v.y -= 18 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt * f.spin; f.m.rotation.y += dt * f.spin; if (f.m.position.y < 0.08) { f.m.position.y = 0.08; f.v.multiplyScalar(0.5); f.v.y *= -0.4; } }
      if (f.life <= 0) { scene.remove(f.m); fx.splice(i, 1); }
    }
  }
  function screenPos(p) { const v = tmpV2.copy(p).project(camera); return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight]; }
  function label(p, text, color, big) {
    const s = screenPos(p.clone().setY(p.y + 1.3)); const el = document.createElement('div'); el.className = 'lbl' + (big ? ' big' : ''); el.textContent = text; el.style.color = color || '#fff';
    el.style.left = s[0] + 'px'; el.style.top = s[1] + 'px'; $('labels').appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  function banner(text, sub, color) {
    const b = $('banner'); b.innerHTML = text + (sub ? '<small>' + sub + '</small>' : ''); b.style.color = color || '#fff'; b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.add('hidden'), 1800);
  }

  // ---------- HUD ----------
  function renderHearts() { let s = ''; const n = Math.max(maxHp, hp); for (let i = 0; i < n; i++) s += '<span class="' + (i < hp ? '' : 'lost') + '">❤️</span>'; $('hearts').innerHTML = s; }
  function updateHud() {
    $('score').textContent = Math.floor(score); $('coins').textContent = save.coins + runCoins;
    const t = Math.floor(time); $('timer').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    let p = ''; if (pSpeed > 0) p += '<div class="power">⚡ ' + Math.ceil(pSpeed) + 's</div>'; if (pPower > 0) p += '<div class="power" style="border-color:#ff8a3a">🦸 ' + Math.ceil(pPower) + 's</div>'; if (luckyLeft > 0) p += '<div class="power" style="border-color:#5ee08a">🍀 ×' + luckyLeft + '</div>';
    $('powers').innerHTML = p;
    // полоски прочности над повреждёнными блоками
    for (const b of blocks) {
      if (b.hp < b.max) { if (!b.bar) { b.bar = document.createElement('div'); b.bar.className = 'hpbar'; b.bar.innerHTML = '<div></div>'; $('labels').appendChild(b.bar); }
        const s = screenPos(tmpV.set(b.x, 1.9, b.z)); b.bar.style.left = s[0] + 'px'; b.bar.style.top = s[1] + 'px'; b.bar.firstChild.style.width = Math.max(0, b.hp / b.max * 100) + '%'; b.bar.firstChild.style.background = RAR[b.r].c; }
    }
  }

  // ---------- Конец забега ----------
  function showEnd() {
    mode = 'over'; const sc = Math.floor(score), isBest = sc > save.best; if (isBest) save.best = sc;
    save.coins += runCoins; persist(); $('tip').classList.add('hidden');
    const t = Math.floor(time);
    $('end-stats').innerHTML = (isBest ? '<div><b>' + L.newBest + '</b></div>' : '') + '<div>' + L.score + ': <b>' + sc + '</b> · ' + L.best + ': <b>' + save.best + '</b></div><div>' + L.time + ': <b>' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '</b></div><div>' + L.earned + ': <b id="end-coins">' + runCoins + '</b> ●</div>';
    $('btn-revive').classList.toggle('hidden', revived); $('btn-x2').disabled = runCoins <= 0;
    $('end').classList.remove('hidden'); updateHud();
  }
  function revive() {
    window.YSDK.showRewarded(() => {
      revived = true; save.coins -= runCoins; persist(); hp = maxHp; inv = 2.5; renderHearts(); mode = 'play'; play(hero, 'Idle', 0, true);
      monsters.forEach((m) => { if (Math.hypot(m.x - pos.x, m.z - pos.z) < 6) hurtMonster(m, 99, new T.Vector3(m.x - pos.x, 0, m.z - pos.z).normalize()); });
      bombs.forEach((b) => { scene.remove(b.obj); scene.remove(b.ring); }); bombs = [];
      $('end').classList.add('hidden');
    });
  }
  function doubleCoins() { const n = runCoins; window.YSDK.showRewarded(() => { save.coins += n; persist(); $('end-coins').textContent = n * 2; $('btn-x2').disabled = true; updateHud(); if (window.GameAudio) GameAudio.sfx('coin'); }); }

  // ---------- Прокачка ----------
  const UPG = { dmg: { max: 8, cost: (l) => 80 + l * 90 }, spd: { max: 6, cost: (l) => 60 + l * 70 }, hp: { max: 4, cost: (l) => 200 + l * 250 }, luck: { max: 8, cost: (l) => 120 + l * 110 } };
  function renderShop() {
    $('shop-coins').textContent = save.coins;
    $('upgrades').innerHTML = Object.keys(UPG).map((k) => { const t = L['up' + k[0].toUpperCase() + k.slice(1)], l = save.up[k], mx = l >= UPG[k].max, c = UPG[k].cost(l);
      return '<div class="upg"><div class="ic">' + t[0] + '</div><div class="info"><div class="nm">' + t[1] + ' · ' + L.lvl + ' ' + l + '</div><div class="ds">' + t[2] + '</div></div><button data-k="' + k + '" ' + (mx || save.coins < c ? 'disabled' : '') + '>' + (mx ? L.max : '● ' + c) + '</button></div>'; }).join('');
    $('upgrades').querySelectorAll('button').forEach((b) => b.onclick = () => { const k = b.dataset.k, c = UPG[k].cost(save.up[k]); if (save.coins < c) return; save.coins -= c; save.up[k]++; persist(); if (window.GameAudio) GameAudio.sfx('coin'); renderShop(); });
  }

  // ---------- Камера ----------
  const camT = new T.Vector3();
  function updateCamera(dt) {
    if (window.__camLock) { camera.position.fromArray(window.__camLock[0]); camera.lookAt(tmpV.fromArray(window.__camLock[1])); return; }
    if (portrait) camT.set(pos.x, 12.5, pos.z - 8.5); else camT.set(pos.x, 8.6, pos.z - 7.6);
    camera.position.lerp(camT, 1 - Math.exp(-6 * dt)); camera.lookAt(camera.position.x, 0.6, camera.position.z + 7.6 + (portrait ? 1.6 : 0));
    if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake; }
    sun.position.set(pos.x - 8, 22, pos.z - 6); sun.target.position.set(pos.x, 0, pos.z + 3);
  }

  // ---------- Цикл ----------
  function update(dt) {
    if (mode === 'play') {
      time += dt; score += dt * 5;
      nextBlock -= dt; const want = Math.min(16, 9 + Math.floor(time / 45));
      if (nextBlock <= 0 && blocks.length < want) { spawnBlock(); nextBlock = 1.6; }
      // фоновые монстры усиливаются со временем
      if (Math.random() < dt * Math.min(0.35, 0.04 + time / 900)) { const a = Math.random() * 6.28; spawnMonster(pos.x + Math.cos(a) * 9, pos.z + Math.sin(a) * 9); }
      nextEvent -= dt; if (nextEvent <= 0) { nextEvent = 30; randomEvent(); }
    }
    for (const b of blocks) {
      b.t += dt; b.born = Math.min(1, b.born + dt * 3); const k = b.born < 1 ? 1 - Math.pow(1 - b.born, 3) * Math.cos(b.born * 8) : 1;
      b.mesh.scale.setScalar(Math.max(0.01, k));
      b.mesh.position.set(b.x + (b.shake > 0 ? (Math.random() - 0.5) * 0.25 : 0), 0.85 + Math.sin(b.t * 2.2) * 0.12, b.z);
      b.mesh.rotation.y = b.t * (b.r >= 3 ? 1.2 : 0.5); if (b.shake > 0) b.shake -= dt;
    }
    if (rainbowMat) rainbowMat.emissive.setHSL((clock.elapsedTime * 0.4) % 1, 0.9, 0.35);
    updateHero(dt); updateMonsters(dt); updateBombs(dt); updateFx(dt); updateCamera(dt); updateHud();
  }
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!loaded) return;
    if (mode !== 'pause') { const n = window.__ts || 1; for (let k = 0; k < n; k++) update(dt); }
    renderer.render(scene, camera);
  }

  // ---------- Ввод ----------
  function setupInput() {
    const joy = $('joy'), knob = $('joy-knob'); let jid = null, jx = 0, jy = 0; const R = 55, app = $('app');
    app.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('.screen')) return;
      if (e.pointerType === 'mouse') { input.hit = 0.2; return; }
      if (mode !== 'play') return;
      if (e.clientX < window.innerWidth * 0.5 && jid === null) { jid = e.pointerId; jx = e.clientX; jy = e.clientY; joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.classList.remove('hidden'); knob.style.transform = ''; }
      else input.hit = 0.2;
    });
    app.addEventListener('pointermove', (e) => { if (e.pointerId !== jid) return; let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; input.x = dx / R; input.y = -dy / R; });
    const endJ = (e) => { if (e.pointerId !== jid) return; jid = null; input.x = 0; input.y = 0; joy.classList.add('hidden'); };
    app.addEventListener('pointerup', endJ); app.addEventListener('pointercancel', endJ);
    const bind = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); b.classList.add('on'); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('on'))); };
    bind('btn-hit', () => { input.hit = 0.2; }); bind('btn-jump', () => { input.jump = 0.15; });
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    window.addEventListener('keydown', (e) => { if (map[e.code]) { input.keys[map[e.code]] = true; e.preventDefault(); } if (e.code === 'Space') { if (!e.repeat) input.jump = 0.15; e.preventDefault(); } if (e.code === 'KeyF' || e.code === 'KeyJ' || e.code === 'Enter') input.hit = 0.2; if (e.code === 'Escape') pause(); });
    window.addEventListener('keyup', (e) => { if (map[e.code]) input.keys[map[e.code]] = false; });
  }
  function pause() { if (mode !== 'play') return; mode = 'pause'; $('pause').classList.remove('hidden'); window.YSDK.event('level_paused', save.runs); }
  function resume() { $('pause').classList.add('hidden'); mode = 'play'; window.YSDK.event('level_resumed', save.runs); }

  // ---------- Запуск ----------
  function init() {
    detectLang(); initThree(); setupInput();
    $('load-text').textContent = L.loading + '…';
    const loader = new T.GLTFLoader(); let left = 3; const prog = {};
    const onProg = (k) => (e) => { if (!e.total) return; prog[k] = [e.loaded, e.total]; let a = 0, b = 0; Object.values(prog).forEach((v) => { a += v[0]; b += v[1]; }); const pc = Math.min(99, Math.round(a / Math.max(b, 2.3e6) * 100)); $('load-fill').style.width = pc + '%'; $('load-text').textContent = L.loading + ' ' + pc + '%'; };
    const fixMaps = (s) => s.traverse((m) => { if (m.isMesh && m.material && m.material.map) m.material.map.encoding = T.sRGBEncoding; });
    const done = () => {
      if (--left) return;
      for (let r = 0; r < 6; r++) boxTex.push(blockTexture(r));
      boxGeo = new T.BoxGeometry(1.5, 1.5, 1.5);
      rainbowMat = new T.MeshStandardMaterial({ map: boxTex[5], roughness: 0.3, emissive: 0xff0000, emissiveIntensity: 0.35 });
      coinGeo = new T.CylinderGeometry(0.22, 0.22, 0.06, 14).rotateX(Math.PI / 2); coinMat = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a5a00 });
      buildArena();
      hero = makeChar(heroTmpl, heroClips, 0.66, ['Jump_Start', 'Jump_Land', '1H_Melee_Attack_Chop', 'Hit_A', 'Death_A']);
      loaded = true; startRun();
    };
    const fail = (e) => { console.error(e); $('load-text').textContent = 'Error'; };
    const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const get = (name, glob, cb) => { if (window[glob]) loader.parse(b64(window[glob]), '', cb, fail); else loader.load('assets/' + name, cb, onProg(name), fail); };
    get('kit.glb', 'KIT_GLB_B64', (g) => { let r = g.scene; if (r.children.length === 1 && !r.children[0].isMesh) r = r.children[0]; r.children.forEach((c) => { K[c.name] = c; }); fixMaps(g.scene); done(); });
    get('hero.glb', 'HERO_GLB_B64', (g) => { heroTmpl = g.scene; heroClips = g.animations; fixMaps(g.scene); done(); });
    get('skeleton.glb', 'SKEL_GLB_B64', (g) => { skelTmpl = g.scene; skelClips = g.animations; fixMaps(g.scene); done(); });

    $('btn-revive').onclick = revive; $('btn-x2').onclick = doubleCoins;
    $('btn-again').onclick = () => { $('end').classList.add('hidden'); window.YSDK.showFullscreen(startRun); };
    $('btn-shop').onclick = () => { $('end').classList.add('hidden'); renderShop(); $('shop').classList.remove('hidden'); };
    $('btn-shop-close').onclick = () => { $('shop').classList.add('hidden'); window.YSDK.showFullscreen(startRun); };
    $('btn-pause').onclick = pause; $('btn-resume').onclick = resume;
    $('btn-quit').onclick = () => { $('pause').classList.add('hidden'); mode = 'play'; hp = 0; die(); };
    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);
    loop();

    window.__lucky = {
      ready: () => loaded, state: () => ({ mode, hp, score: Math.floor(score), time: +time.toFixed(1), blocks: blocks.length, monsters: monsters.length, bombs: bombs.length, coins: runCoins, speed: +pSpeed.toFixed(1), power: +pPower.toFixed(1) }),
      move: (x, y) => { input.x = x; input.y = y; }, hit: () => { input.hit = 0.2; }, jump: () => { input.jump = 0.15; },
      blocksAt: () => blocks.map((b) => [+b.x.toFixed(1), +b.z.toFixed(1), b.r, b.hp]), pos: () => [pos.x, pos.z],
      tp: (x, z) => { pos.x = x; pos.z = z; }, spawn: (r, x, z) => { spawnBlock(r); const b = blocks[blocks.length - 1]; if (b && x != null) { b.x = x; b.z = z; } }, event: () => randomEvent(),
      monster: (x, z) => spawnMonster(x, z), bomb: (x, z) => dropBomb(x, z, 6, 1.5), kill: () => { hp = 1; inv = 0; hurtHero(new T.Vector3(1, 0, 0)); }, god: (v) => { inv = v ? 1e9 : 0; },
    };
  }
  window.addEventListener('load', async () => { try { await window.YSDK.init(); } catch (e) {} try { init(); } catch (e) { console.error('init fail', e); } try { window.YSDK.gameReady(); } catch (e) {} });
})();
