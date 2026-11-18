/* =========================================================================
   Толпа 3D — раннер с толпой (жанр Count Masters) на Three.js.
   Персонажи — готовые CC0-модели KayKit (Kay Lousberg) со скелетной
   анимацией: бег, удар, стрельба, радость.
   Трасса: воротца с математикой, пропасти у края дороги, красные толпы
   (замес с потерями с обеих сторон), стрелки-арбалетчики, финишная лестница.
   ========================================================================= */
(function () {
  'use strict';
  const T = window.THREE;

  // ---- Языки: английский по умолчанию, русский для русскоязычных ----
  const TEXTS = {
    en: {
      title: 'CROWD RUSH', hint: 'Drag left and right', loading: 'Loading…', loadErr: 'Loading error', play: 'Play!',
      intro: 'Lead your crowd with your finger. Pick the best gates, avoid pits, beat the red crowds and reach the finish stairs!',
      fallen: 'Crowd lost!', passed: 'Progress', runCoins: 'Coins this run', revive: 'Continue (watch ad)',
      x2: 'Double coins', upgrades: '🔧 Upgrades', again: 'Retry', next: 'Next ▶', levelDone: (l) => 'Level ' + l + ' complete!',
      mult: 'Multiplier', reward: 'Reward', shop: '🔧 Upgrades', done: 'Done',
      upStart: '👥 Starting crowd', upIncome: '💰 Income', inStart: ' at start', coinsPct: '% coins', lvl: 'Lv.', max: 'MAX', sound: 'Sound',
    },
    ru: {
      title: 'ТОЛПА', hint: 'Веди пальцем влево-вправо', loading: 'Загрузка…', loadErr: 'Ошибка загрузки', play: 'В бой!',
      intro: 'Веди толпу пальцем. Выбирай выгодные воротца, обходи пропасти, побеждай красные толпы и добеги до финишной лестницы!',
      fallen: 'Толпа пала!', passed: 'Пройдено', runCoins: 'Монеты за забег', revive: 'Продолжить за рекламу',
      x2: 'Удвоить монеты', upgrades: '🔧 Прокачка', again: 'Заново', next: 'Дальше ▶', levelDone: (l) => 'Уровень ' + l + ' пройден!',
      mult: 'Множитель', reward: 'Награда', shop: '🔧 Прокачка', done: 'Готово',
      upStart: '👥 Стартовая толпа', upIncome: '💰 Доход', inStart: ' в старте', coinsPct: '% монет', lvl: 'Ур.', max: 'МАКС', sound: 'Звук',
    },
  };
  const RU_LANGS = ['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'tg', 'hy', 'az', 'tt'];
  let L = TEXTS.en;
  function detectLang() {
    let code = '';
    try { code = (window.bridge && bridge.platform && bridge.platform.language) || ''; } catch (e) {}
    if (!code) code = (navigator.language || 'en');
    code = String(code).toLowerCase().slice(0, 2);
    L = RU_LANGS.indexOf(code) >= 0 ? TEXTS.ru : TEXTS.en;
    document.documentElement.lang = L === TEXTS.ru ? 'ru' : 'en';
    document.title = L === TEXTS.ru ? 'Толпа' : 'Crowd Rush';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = L[el.getAttribute('data-i18n')];
      if (typeof v === 'string') { if (el.hasAttribute('data-i18n-title')) el.title = v; else el.textContent = v; }
    });
  }

  // ---- Константы ----
  const SAVE_KEY = 'crowd3d_save_v2';
  const ROAD_W = 7.2, ROAD_HALF = ROAD_W / 2;
  const CH = 1.0;                 // рост человечка (мир. единицы)
  const PCAP = 70, ECAP = 45, FCAP = 14;   // пулы: игроки / враги / падающие
  const FAR = 60;
  const CAM = { x: 0, y: 7.4, z: -6.6, tx: 0, ty: 0, tz: 9.5 };
  const C_BLUE = 0x2f8cff, C_RED = 0xec4a3f;
  const STEP_MULT = [1, 1.2, 1.5, 2, 2.5, 3, 4], THRESH = [0, 12, 25, 45, 70, 100, 150];
  const STEPS = 7, STEP_H = 0.55, STEP_D = 1.5, STAIR_Z = 5;

  // ---- Состояние ----
  let scene, camera, renderer, loaded = false;
  let tmpl = null, clips = {}, scaleK = 1;
  let players = [], enemies = [], fallers = [];
  let matBlue, matRed;
  let shadowMesh, splatMeshes, boltMesh, chunkMeshes;
  let countSprite, ecountSprite, aura, lastN = -1, lastEN = -1;
  let roadTex, scenery = [], stairs = [];
  const slots = [];
  const splats = [], bolts = [], chunks = [];

  let mode = 'ready';               // ready | play | clash | finish | over
  let N = 10, lat = 0, targetLat = 0, crowdX = 0, crowdZ = 0;
  let traveled = 0, speed = 0, t = 0, shake = 0;
  let level = 1, FINISH = 170;
  let objects = [], genDist = 0; const milestones = new Set();
  let clashEn = null, clashT = 0;
  let finaleT = 0, finaleStep = 0, finaleMult = 1, finaleReward = 0, finaleShown = false;
  let coins = 0, runCoins = 0, bestDist = 0;
  let upg = { start: 0, income: 0 };

  const _m = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(), _p = new T.Vector3(), _cv = new T.Vector3(), _e = new T.Euler();
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');

  // ===== Сохранение =====
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, upg, bestDist, level })); } catch (e) {} }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) { coins = s.coins || 0; upg = Object.assign(upg, s.upg || {}); bestDist = s.bestDist || 0; level = s.level || 1; } } catch (e) {} }

  // ===== Текстуры =====
  function canvasTex(w, h, draw, flip) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 4;
    if (flip) { tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; } // смотрим с изнанки
    return tex;
  }
  function rr(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  function gateText(g) { return (g.op === 'add' ? '+' : g.op === 'sub' ? '−' : g.op === 'mul' ? 'x' : '÷') + g.val; }
  function gateTexture(lg, rg) {
    return canvasTex(512, 160, (x, w, h) => {
      [[lg, 0], [rg, w / 2]].forEach(([g, ox]) => {
        const gr = x.createLinearGradient(0, 0, 0, h);
        if (g.good) { gr.addColorStop(0, 'rgba(120,215,255,0.55)'); gr.addColorStop(1, 'rgba(25,150,255,0.92)'); }
        else { gr.addColorStop(0, 'rgba(255,150,150,0.55)'); gr.addColorStop(1, 'rgba(235,55,60,0.92)'); }
        x.fillStyle = gr; x.fillRect(ox, 0, w / 2, h);
        x.fillStyle = 'rgba(255,255,255,0.28)';
        for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(ox + 20 + ((i * 53) % (w / 2 - 30)), 30 + ((i * 37) % (h - 50)), 4 + (i % 4) * 3, 0, 6.3); x.fill(); }
        x.font = '900 88px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 8; x.strokeStyle = 'rgba(20,40,110,0.35)'; x.strokeText(gateText(g), ox + w / 4, h / 2 + 6);
        x.fillStyle = '#ffffff'; x.fillText(gateText(g), ox + w / 4, h / 2 + 4);
      });
    }, true);
  }
  function countTex(n, bg) {
    return canvasTex(160, 96, (x) => {
      x.fillStyle = bg; rr(x, 8, 8, 144, 62, 30); x.fill();
      x.beginPath(); x.moveTo(68, 68); x.lineTo(92, 68); x.lineTo(80, 86); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.font = '900 46px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 80, 41);
    });
  }
  function stepTex(text) {
    return canvasTex(256, 128, (x) => {
      x.font = 'italic 900 84px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 12; x.strokeStyle = '#2b6fd0'; x.strokeText(text, 128, 66);
      x.fillStyle = '#ffffff'; x.fillText(text, 128, 66);
    }, false);
  }

  // ===== Инициализация =====
  function init() {
    load(); buildSlots();
    scene = new T.Scene();
    scene.background = canvasTex(4, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9592dc'); g.addColorStop(1, '#cfccf6');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    scene.fog = new T.Fog(0xb9b6ef, 24, 62);
    camera = new T.PerspectiveCamera(55, 1, 0.1, 300);
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    resize(); window.addEventListener('resize', resize);

    scene.add(new T.HemisphereLight(0xffffff, 0x7d77c4, 0.85));
    const dir = new T.DirectionalLight(0xffffff, 0.7); dir.position.set(-4, 10, -6); scene.add(dir);

    buildWorld(); buildFx(); bindInput(); updateHUD();
    renderer.setAnimationLoop(loop);

    const loader = new T.GLTFLoader();
    const onModel = (g) => {
      tmpl = g.scene;
      g.animations.forEach((a) => { clips[a.name] = a; });
      tmpl.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(tmpl); scaleK = CH / (box.max.y - box.min.y || 1);
      matBlue = new T.MeshLambertMaterial({ color: C_BLUE, skinning: true });
      matRed = new T.MeshLambertMaterial({ color: C_RED, skinning: true });
      for (let i = 0; i < PCAP; i++) players.push(makeChar(matBlue));
      for (let i = 0; i < ECAP; i++) enemies.push(makeChar(matRed));
      for (let i = 0; i < FCAP; i++) fallers.push({ ch: makeChar(matBlue), life: 0, x: 0, y: 0, wz: 0, vy: 0, rot: 0 });
      loaded = true;
      const b = $('btn-start'); b.disabled = false; b.textContent = L.play;
      resetCrowdIdle();
    };
    const onErr = (e) => { console.error('model load failed', e); $('btn-start').textContent = L.loadErr; };
    if (window.CHAR_GLB_B64) { // запасной вариант для превью: модель встроена в js
      const bin = atob(window.CHAR_GLB_B64), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      loader.parse(buf.buffer, '', onModel, onErr);
    } else loader.load('assets/char.glb', onModel, undefined, onErr);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (mode !== 'finish') { camera.position.set(CAM.x, CAM.y, CAM.z); camera.lookAt(CAM.tx, CAM.ty, CAM.tz); }
  }

  // ===== Персонаж =====
  function makeChar(mat) {
    const root = T.SkeletonUtils.clone(tmpl);
    let bow = null;
    root.traverse((m) => {
      if (m.isSkinnedMesh) { m.material = mat; m.frustumCulled = false; }
      else if (m.isMesh && m.name === 'Crossbow') { bow = m; m.visible = false; }
    });
    root.scale.setScalar(scaleK); root.visible = false; scene.add(root);
    const mixer = new T.AnimationMixer(root), act = {};
    [['run', 'Running_A'], ['idle', 'Idle'], ['punch', 'Unarmed_Melee_Attack_Punch_A'], ['cheer', 'Cheer'], ['shoot', '1H_Ranged_Shooting'], ['death', 'Death_A']]
      .forEach(([k, n]) => { if (clips[n]) act[k] = mixer.clipAction(clips[n]); });
    if (act.death) { act.death.setLoop(T.LoopOnce); act.death.clampWhenFinished = true; }
    const ch = { root, mixer, act, cur: null, bow, phase: Math.random() };
    setAnim(ch, 'idle'); return ch;
  }
  function setAnim(ch, name) {
    if (ch.cur === name || !ch.act[name]) return;
    const next = ch.act[name];
    next.reset(); next.time = ch.phase * next.getClip().duration; next.play();
    if (ch.cur && ch.act[ch.cur]) ch.act[ch.cur].crossFadeTo(next, 0.15, false);
    ch.cur = name;
  }

  // ===== Мир =====
  function buildWorld() {
    // нижняя «пустота»
    const low = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshLambertMaterial({ color: 0xa8a5e6 }));
    low.rotation.x = -Math.PI / 2; low.position.set(0, -7, 80); scene.add(low);
    // дорога с «шевронами»
    roadTex = canvasTex(128, 256, (x, w, h) => {
      x.fillStyle = '#5e5897'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#544e8b';
      x.beginPath(); x.moveTo(0, 40); x.lineTo(w / 2, 0); x.lineTo(w, 40); x.lineTo(w, 120); x.lineTo(w / 2, 80); x.lineTo(0, 120); x.closePath(); x.fill();
    });
    // короткая разбитая на сегменты дорога (без шва и без выхода за дальность камеры)
    roadTex.wrapS = roadTex.wrapT = T.RepeatWrapping; roadTex.repeat.set(1, 110 / 12);
    const road = new T.Mesh(new T.PlaneGeometry(ROAD_W, 110, 1, 44), new T.MeshBasicMaterial({ map: roadTex }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, 40); scene.add(road);
    // толстые белые бортики
    const curbMat = new T.MeshLambertMaterial({ color: 0xffffff });
    [-1, 1].forEach((s) => { const c = new T.Mesh(new T.BoxGeometry(0.45, 0.35, 110, 1, 1, 30), curbMat); c.position.set(s * (ROAD_HALF + 0.22), 0.06, 40); scene.add(c); });
    // боковые ледяные скалы (скроллятся вместе с миром)
    const mats = [0xc8c9f4, 0xd9daf9, 0xb9bbee].map((c) => new T.MeshLambertMaterial({ color: c }));
    const topMat = new T.MeshLambertMaterial({ color: 0xf2f2ff });
    for (let i = 0; i < 34; i++) {
      const side = i % 2 ? 1 : -1, h = 2.5 + Math.random() * 6, r = 1 + Math.random() * 1.8;
      const g = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(r * 0.85, r, h, 6), mats[i % 3]); body.position.y = h / 2 - 2.5; g.add(body);
      const cap = new T.Mesh(new T.CylinderGeometry(r * 0.9, r * 0.85, 0.35, 6), topMat); cap.position.y = h - 2.5 + 0.1; g.add(cap);
      g.position.x = side * (ROAD_HALF + 2.2 + Math.random() * 7); g.rotation.y = Math.random() * 3;
      scene.add(g); scenery.push({ g, wz: -8 + (i >> 1) * 7.5 + Math.random() * 4 });
    }
  }

  function buildFx() {
    shadowMesh = new T.InstancedMesh(new T.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0x2b2558, transparent: true, opacity: 0.28, depthWrite: false }), PCAP + ECAP + FCAP);
    shadowMesh.frustumCulled = false; scene.add(shadowMesh);
    const splatT = canvasTex(128, 128, (x) => {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 30, 0, 6.3); x.fill();
      for (let i = 0; i < 11; i++) { const a = i * 0.57 + 0.3, d = 34 + (i % 3) * 12, r = 6 + (i % 4) * 4; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 6.3); x.fill(); }
    });
    const splatG = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    splatMeshes = {};
    [C_BLUE, C_RED].forEach((c) => {
      const m = new T.InstancedMesh(splatG, new T.MeshBasicMaterial({ map: splatT, color: c, transparent: true, depthWrite: false }), 160);
      m.frustumCulled = false; m.count = 0; scene.add(m); splatMeshes[c] = m;
    });
    for (let i = 0; i < 160; i++) splats.push({ on: false });
    boltMesh = new T.InstancedMesh(new T.BoxGeometry(0.06, 0.06, 0.55), new T.MeshBasicMaterial({ color: 0xffd23b }), 60);
    boltMesh.frustumCulled = false; boltMesh.count = 0; scene.add(boltMesh);
    for (let i = 0; i < 60; i++) bolts.push({ on: false });
    const chunkG = new T.BoxGeometry(0.13, 0.13, 0.13);
    chunkMeshes = {};
    [C_BLUE, C_RED].forEach((c) => {
      const m = new T.InstancedMesh(chunkG, new T.MeshBasicMaterial({ color: c }), 180);
      m.frustumCulled = false; m.count = 0; scene.add(m); chunkMeshes[c] = m;
    });
    for (let i = 0; i < 180; i++) chunks.push({ life: 0 });
    countSprite = new T.Sprite(new T.SpriteMaterial({ map: countTex(10, '#29a3ff'), depthTest: false, transparent: true }));
    countSprite.scale.set(1.25, 0.75, 1); countSprite.renderOrder = 10; scene.add(countSprite);
    ecountSprite = new T.Sprite(new T.SpriteMaterial({ map: countTex(10, '#ec4a3f'), depthTest: false, transparent: true }));
    ecountSprite.scale.set(1.1, 0.66, 1); ecountSprite.renderOrder = 10; ecountSprite.visible = false; scene.add(ecountSprite);
    aura = new T.Mesh(new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff3b4f, transparent: true, opacity: 0.25, depthWrite: false }));
    aura.visible = false; scene.add(aura);
  }

  function buildSlots() {
    slots.length = 0;
    for (let i = 0; i < Math.max(PCAP, ECAP); i++) {
      const a = i * 2.399963, r = Math.sqrt(i) * 0.3;
      slots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.85 });
    }
  }
  function blobR(n) { return Math.sqrt(Math.max(1, Math.min(n, PCAP))) * 0.3 + 0.3; }

  // ===== Старт =====
  function resetCrowdIdle() { N = 10 + upg.start * 2; crowdX = 0; crowdZ = 0; }
  function startRun() {
    if (!loaded) return;
    hideScreens(); clearObjects(); clearStairs();
    FINISH = 160 + (level - 1) * 20;
    resetCrowdIdle(); lat = 0; targetLat = 0;
    traveled = 0; speed = 7; runCoins = 0; genDist = 14; milestones.clear();
    splats.forEach((s) => { s.on = false; }); bolts.forEach((b) => { b.on = false; }); chunks.forEach((c) => { c.life = 0; }); fallers.forEach((f) => { f.life = 0; f.ch.root.visible = false; });
    clashEn = null; mode = 'play';
    camera.position.set(CAM.x, CAM.y, CAM.z); camera.lookAt(CAM.tx, CAM.ty, CAM.tz);
    $('tap-hint').style.display = '';
    generateUpTo(FAR); updateHUD();
  }

  // ===== Генерация трассы =====
  function generateUpTo(max) {
    max = Math.min(max, FINISH - 8);
    while (genDist < max) {
      const ms = Math.round(genDist / 42) * 42;
      if (ms > 0 && Math.abs(genDist - ms) < 7 && !milestones.has(ms)) {
        milestones.add(ms);
        if ((ms / 42) % 2 === 0) spawnGroup(ms, 'gunner'); else spawnGroup(ms, 'enemy');
        genDist = ms + 14;
      } else {
        if (Math.random() < 0.64) spawnGate(genDist); else spawnPit(genDist);
        genDist += 10 + Math.random() * 5;
      }
    }
  }
  function scaledAdd(d) { return Math.max(4, Math.round((6 + d * 0.035) * (0.6 + Math.random() * 0.9))); }
  function greenOp(d) { const r = Math.random(); if (r < 0.22) return { op: 'mul', val: 2, good: true }; if (r < 0.32) return { op: 'mul', val: 3, good: true }; return { op: 'add', val: scaledAdd(d), good: true }; }
  function redOp(d, allowZero) {
    const r = Math.random();
    if (allowZero && r < 0.1) return { op: 'mul', val: 0, good: false };
    if (r < 0.3) return { op: 'mul', val: 1, good: false };
    if (r < 0.64) return { op: 'sub', val: scaledAdd(d), good: false };
    if (r < 0.86) return { op: 'div', val: 2, good: false };
    return { op: 'div', val: 3, good: false };
  }
  function spawnGate(d) {
    let left, right;
    if (Math.random() < 0.7) { const g = greenOp(d), b = redOp(d, true); if (Math.random() < 0.5) { left = g; right = b; } else { left = b; right = g; } }
    else { left = redOp(d, false); right = redOp(d, true); let k = 0; while (left.op === right.op && left.val === right.val && k++ < 8) right = redOp(d, false); }
    const tex = gateTexture(left, right);
    const grp = new T.Group();
    const panel = new T.Mesh(new T.PlaneGeometry(ROAD_W, 1.5), new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthWrite: false }));
    panel.position.y = 1.0; grp.add(panel);
    const postMat = new T.MeshLambertMaterial({ color: 0x4a5570 });
    [-ROAD_HALF, 0, ROAD_HALF].forEach((px) => { const p = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 1.9, 10), postMat); p.position.set(px, 0.95, 0); grp.add(p); });
    scene.add(grp);
    objects.push({ type: 'gate', worldZ: d, left, right, obj: grp, tex });
  }
  // Пропасть: прямоугольный вырез у края дороги (как в эталоне)
  function spawnPit(d) {
    const side = Math.random() < 0.5 ? -1 : 1, pw = 2.6 + Math.random() * 0.8, len = 2.6;
    const x0 = side > 0 ? ROAD_HALF - pw : -ROAD_HALF, x1 = x0 + pw, cx = (x0 + x1) / 2;
    const g = new T.Group();
    // «колодец»: серый провал с тенью от дальней и внутренней стенок
    const pitTex = canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#7d8696'; x.fillRect(0, 0, w, h);
      const gb = x.createLinearGradient(0, 0, 0, h * 0.45); gb.addColorStop(0, '#3e4452'); gb.addColorStop(1, 'rgba(62,68,82,0)');
      x.fillStyle = gb; x.fillRect(0, 0, w, h * 0.45);
      const gi = side > 0 ? x.createLinearGradient(0, 0, w * 0.3, 0) : x.createLinearGradient(w, 0, w * 0.7, 0);
      gi.addColorStop(0, 'rgba(50,55,68,0.85)'); gi.addColorStop(1, 'rgba(50,55,68,0)');
      x.fillStyle = gi; x.fillRect(0, 0, w, h);
    });
    const mouth = new T.Mesh(new T.PlaneGeometry(pw, len).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: pitTex }));
    mouth.position.set(cx, 0.01, 0); g.add(mouth);
    // белая окантовка по краям выреза
    const rim = new T.MeshLambertMaterial({ color: 0xffffff });
    const rf = new T.Mesh(new T.BoxGeometry(pw + 0.2, 0.18, 0.2), rim); rf.position.set(cx, 0.08, -len / 2 - 0.05); g.add(rf);
    const rb = new T.Mesh(new T.BoxGeometry(pw + 0.2, 0.18, 0.2), rim); rb.position.set(cx, 0.08, len / 2 + 0.05); g.add(rb);
    const ri = new T.Mesh(new T.BoxGeometry(0.2, 0.18, len + 0.2), rim); ri.position.set(side > 0 ? x0 - 0.05 : x1 + 0.05, 0.08, 0); g.add(ri);
    scene.add(g);
    objects.push({ type: 'pit', worldZ: d, len, x0, x1, obj: g, tex: pitTex });
  }
  function spawnGroup(d, kind) {
    const count = kind === 'gunner' ? Math.round(5 + d * 0.035) : Math.round(8 + d * 0.06);
    objects.push({ type: kind, worldZ: d, count, fireT: 0.4 });
  }
  function clearObjects() { objects.forEach(disposeObj); objects = []; }
  function disposeObj(o) {
    if (!o.obj) return;
    scene.remove(o.obj);
    o.obj.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
    if (o.tex) o.tex.dispose();
  }

  // ===== Игровой цикл =====
  let lastTs = 0;
  function loop(ts) {
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0; lastTs = ts; t += dt;
    update(dt);
    if (mode !== 'finish') {
      const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      camera.position.set(CAM.x + sx, CAM.y + sy, CAM.z);
    }
    renderer.render(scene, camera);
  }

  function update(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
    if (mode === 'play') {
      speed = Math.min(15, 7 + traveled * 0.035);
      traveled += speed * dt;
      lat += (targetLat - lat) * Math.min(1, dt * 12); lat = Math.max(-1, Math.min(1, lat));
      const maxX = Math.max(0.3, ROAD_HALF - blobR(N) * 0.85);
      crowdX = -lat * maxX;   // экран↔мир по X отзеркалены этой камерой
      generateUpTo(traveled + FAR);
      processObjects(dt);
      updateGunners(dt);
      if (N <= 0) gameOver();
      else if (traveled >= FINISH) enterFinale();
    } else if (mode === 'clash') {
      updateClash(dt);
    } else if (mode === 'finish') {
      updateFinale(dt);
    }
    if (roadTex) roadTex.offset.y = -traveled / 12;
    for (const s of scenery) { let z = s.wz - traveled; if (z < -12) { s.wz += 130; z += 130; } s.g.position.z = z; }
    for (const o of objects) if (o.obj) o.obj.position.z = o.worldZ - traveled;
    updateBolts(dt); updateFallers(dt); updateChunks(dt);
    if (loaded) { updateCrowd(dt); updateEnemies(dt); }
    updateSplats(); updateHUD();
  }

  // ===== Объекты на трассе =====
  function processObjects() {
    for (const o of objects) {
      if (o.done) continue;
      const z = o.worldZ - traveled;
      if (o.type === 'gate' && z <= 0) {
        o.done = true; applyGate(lat < 0 ? o.left : o.right);
      } else if (o.type === 'pit' && z <= 0.2) {
        o.done = true; pitCheck(o);
      } else if ((o.type === 'enemy' || o.type === 'gunner') && z <= blobR(N) + 1.0) {
        o.done = true; clashEn = o; clashT = 0; mode = 'clash';
      }
    }
    for (const o of objects) if (o.worldZ - traveled < -8 && !o._gone) { o._gone = true; disposeObj(o); }
    objects = objects.filter((o) => !o._gone);
  }
  function applyGate(g) {
    const before = N;
    if (g.op === 'add') N += g.val; else if (g.op === 'sub') N = Math.max(0, N - g.val);
    else if (g.op === 'mul') N = Math.round(N * g.val); else if (g.op === 'div') N = Math.floor(N / g.val);
    if (N < before) for (let i = 0; i < Math.min(before - N, 12); i++) addSplat(crowdX + (Math.random() - 0.5) * 1.6, traveled + (Math.random() - 0.5) * 1.2, C_BLUE);
    if (window.GameAudio) GameAudio.sfx(g.good ? 'coin' : 'move');
  }
  // Пропасть: падают те, кто оказался над вырезом
  function pitCheck(o) {
    const vp = Math.min(N, PCAP); let fell = 0;
    for (let i = 0; i < vp; i++) {
      const x = crowdX + slots[i].x;
      if (x > o.x0 && x < o.x1) { fell++; spawnFaller(x, slots[i].z); }
    }
    if (!fell) return;
    const lost = Math.min(N, Math.max(1, Math.round(N * fell / vp)));
    N -= lost; shake = Math.min(0.4, shake + 0.2);
    if (window.GameAudio) GameAudio.sfx('fail');
  }
  function spawnFaller(x, zoff) {
    const f = fallers.find((q) => q.life <= 0); if (!f) return;
    f.life = 1.0; f.x = x; f.y = 0; f.wz = traveled + zoff; f.vy = 0; f.rot = 0;
    f.ch.root.visible = true; setAnim(f.ch, 'idle');
  }
  function updateFallers(dt) {
    for (const f of fallers) {
      if (f.life <= 0) continue;
      f.life -= dt; f.vy -= 16 * dt; f.y += f.vy * dt; f.rot += dt * 4;
      const r = f.ch.root; r.position.set(f.x, f.y, f.wz - traveled); r.rotation.set(f.rot, 0, f.rot * 0.4);
      f.ch.mixer.update(dt);
      if (f.life <= 0) r.visible = false;
    }
  }

  // ===== Замес: гибнут по одному с обеих сторон =====
  function updateClash(dt) {
    const en = clashEn; clashT += dt;
    // вражеская толпа подтягивается вплотную
    const targetZ = traveled + 1.2 + blobR(en.count) * 0.5;
    en.worldZ += (targetZ - en.worldZ) * Math.min(1, dt * 6);
    // драка длится ~1.4 с: гибнут по одному с каждой стороны
    const step = Math.min(0.12, Math.max(0.03, 1.4 / Math.max(1, Math.min(N, en.count))));
    while (clashT >= step && N > 0 && en.count > 0) {
      clashT -= step; N--; en.count--;
      const front = traveled + crowdZ + blobR(N) * 0.8 + 0.3;           // линия столкновения
      const xx = crowdX + (Math.random() - 0.5) * Math.min(ROAD_W - 1, blobR(Math.min(N, en.count) + 4) * 1.7);
      addSplat(xx, front - 0.25 - Math.random() * 0.4, C_BLUE); addSplat(xx + (Math.random() - 0.5) * 0.7, front + 0.3 + Math.random() * 0.4, C_RED);
      addChunks(xx, front - 0.2, C_BLUE, 3); addChunks(xx, front + 0.3, C_RED, 3);
      runCoins += 1;
      if (window.GameAudio && Math.random() < 0.25) GameAudio.sfx('move');
    }
    shake = Math.max(shake, 0.12);
    if (en.count <= 0) {
      clashEn = null; mode = 'play';
      if (window.GameAudio) GameAudio.sfx('clear');
    } else if (N <= 0) {
      N = 0; gameOver();
    }
  }

  // ===== Стрелки: стреляют болтами, пока подходишь =====
  function updateGunners(dt) {
    let g = null, gz = 1e9;
    for (const o of objects) if (o.type === 'gunner' && !o.done) { const z = o.worldZ - traveled; if (z > 2 && z < 22 && z < gz) { gz = z; g = o; } }
    if (!g) return;
    g.fireT -= dt;
    const interval = Math.max(0.07, 0.55 / Math.sqrt(g.count));
    let k = 0;
    while (g.fireT <= 0 && k++ < 4) { g.fireT += interval; fireBolt(gz, g.count); }
  }
  function fireBolt(gz, count) {
    const b = bolts.find((q) => !q.on); if (!b) return;
    const sl = slots[Math.floor(Math.random() * Math.min(count, ECAP))];
    b.on = true; b.x = sl.x * 1.0; b.y = 0.55; b.wz = traveled + gz + sl.z;
    b.tx = crowdX + (Math.random() - 0.5) * blobR(N); b.ty = 0.5;
    if (window.GameAudio && Math.random() < 0.3) GameAudio.sfx('click');
  }
  function updateBolts(dt) {
    let n = 0;
    for (const b of bolts) {
      if (!b.on) continue;
      const z = b.wz - traveled;
      const dz = -z, dx = b.tx - b.x, d = Math.hypot(dx, dz) || 1, sp = 26 * dt;
      b.x += dx / d * sp; b.wz += dz / d * sp; b.y += (b.ty - b.y) * Math.min(1, dt * 4);
      const nz = b.wz - traveled;
      if (nz <= 0.4 || mode !== 'play') {
        b.on = false;
        if (mode === 'play' && N > 0) { N--; addSplat(b.x, traveled + 0.2, C_BLUE); }
        continue;
      }
      _q.setFromEuler(_e.set(0, Math.atan2(dx, dz), 0)); _m.compose(_p.set(b.x, b.y, nz), _q, _s.set(1, 1, 1));
      boltMesh.setMatrixAt(n++, _m);
    }
    boltMesh.count = n; boltMesh.instanceMatrix.needsUpdate = true;
  }

  // ===== Брызги кусочками =====
  function addChunks(x, wz, color, n) {
    for (let k = 0; k < n; k++) {
      const i = chunks.findIndex((c) => c.life <= 0); if (i < 0) return;
      const c = chunks[i], a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2.5;
      c.life = 0.55 + Math.random() * 0.3; c.x = x; c.y = 0.5 + Math.random() * 0.4; c.wz = wz;
      c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = 3 + Math.random() * 3; c.r = Math.random() * 6;
      c.c = color === C_RED ? C_RED : C_BLUE;
    }
  }
  function updateChunks(dt) {
    const cnt = { [C_BLUE]: 0, [C_RED]: 0 };
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.life > 0) {
        c.life -= dt; c.vy -= 14 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.wz += c.vz * dt; c.r += dt * 8;
        if (c.y < 0.07) { c.y = 0.07; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; }
      }
      if (c.life <= 0) continue;
      const k = Math.min(1, c.life * 2.5), mesh = chunkMeshes[c.c];
      _q.setFromEuler(_e.set(c.r, c.r, 0)); _m.compose(_p.set(c.x, c.y, c.wz - traveled), _q, _s.set(k, k, k));
      mesh.setMatrixAt(cnt[c.c]++, _m);
    }
    for (const key in chunkMeshes) { chunkMeshes[key].count = cnt[key]; chunkMeshes[key].instanceMatrix.needsUpdate = true; }
  }

  // ===== Кляксы на дороге =====
  function addSplat(x, wz, color) {
    const s = splats.find((q) => !q.on) || splats[Math.floor(Math.random() * splats.length)];
    s.on = true; s.x = x; s.wz = wz; s.r = Math.random() * 6.28; s.k = 0.6 + Math.random() * 0.7; s.c = color === C_RED ? C_RED : C_BLUE;
  }
  function updateSplats() {
    const cnt = { [C_BLUE]: 0, [C_RED]: 0 };
    for (let i = 0; i < splats.length; i++) {
      const s = splats[i]; if (!s.on) continue;
      const z = s.wz - traveled; if (z < -9) { s.on = false; continue; }
      _q.setFromEuler(_e.set(0, s.r, 0)); _m.compose(_p.set(s.x, 0.02, z), _q, _s.set(s.k, 1, s.k));
      splatMeshes[s.c].setMatrixAt(cnt[s.c]++, _m);
    }
    for (const key in splatMeshes) { splatMeshes[key].count = cnt[key]; splatMeshes[key].instanceMatrix.needsUpdate = true; }
  }

  // ===== Отрисовка толпы игрока =====
  let shadowN = 0;
  function putShadow(x, z, k) { _m.compose(_p.set(x, 0.015, z), _q.identity(), _s.set(k, 1, k)); shadowMesh.setMatrixAt(shadowN++, _m); }
  function updateCrowd(dt) {
    shadowN = 0;
    const vp = mode === 'ready' ? Math.min(N, PCAP) : Math.min(Math.max(N, 0), PCAP);
    const anim = mode === 'ready' ? 'idle' : mode === 'clash' ? 'punch' : mode === 'finish' ? null : mode === 'over' ? 'idle' : 'run';
    for (let i = 0; i < PCAP; i++) {
      const ch = players[i], r = ch.root;
      if (i >= vp) { r.visible = false; continue; }
      r.visible = true;
      let x, y = 0, z;
      if (mode === 'finish') {
        const tg = ch.fin;
        ch.fx += (tg.x - ch.fx) * Math.min(1, dt * 2.4); ch.fy += (tg.y - ch.fy) * Math.min(1, dt * 2.4); ch.fz += (tg.z - ch.fz) * Math.min(1, dt * 2.4);
        x = ch.fx; y = ch.fy; z = ch.fz;
        setAnim(ch, Math.abs(tg.z - ch.fz) > 0.3 ? 'run' : 'cheer');
      } else {
        x = crowdX + slots[i].x; z = crowdZ + slots[i].z;
        setAnim(ch, anim);
      }
      r.position.set(x, y, z); r.rotation.set(0, 0, 0);
      ch.mixer.update(dt);
      putShadow(x, z, 1);
    }
    countSprite.visible = mode !== 'ready' && mode !== 'over' && N > 0;
    const top = mode === 'finish' ? stairTop() : null;
    countSprite.position.set(top ? 0 : crowdX, top ? top.y + 1.9 : CH + 0.9 + blobR(N) * 0.15, top ? top.z : crowdZ + 0.2);
    if (N !== lastN) { lastN = N; countSprite.material.map.dispose(); countSprite.material.map = countTex(Math.max(0, N), '#29a3ff'); countSprite.material.needsUpdate = true; }
  }

  // ===== Отрисовка вражеской толпы (ближайшей) =====
  function updateEnemies(dt) {
    let en = clashEn, ez = en ? en.worldZ - traveled : 1e9;
    if (!en) for (const o of objects) if ((o.type === 'enemy' || o.type === 'gunner') && !o.done) { const z = o.worldZ - traveled; if (z > -2 && z < FAR && z < ez) { ez = z; en = o; } }
    const ve = en ? Math.min(en.count, ECAP) : 0;
    const anim = !en ? 'idle' : mode === 'clash' && en === clashEn ? 'punch' : en.type === 'gunner' ? 'shoot' : 'idle';
    for (let i = 0; i < ECAP; i++) {
      const ch = enemies[i], r = ch.root;
      if (i >= ve) { r.visible = false; continue; }
      r.visible = true;
      if (ch.bow) ch.bow.visible = en.type === 'gunner';
      const x = slots[i].x * 0.95, z = ez + slots[i].z;
      r.position.set(x, 0, z); r.rotation.set(0, Math.PI, 0);
      setAnim(ch, anim); ch.mixer.update(dt);
      putShadow(x, z, 1);
    }
    shadowMesh.count = shadowN; shadowMesh.instanceMatrix.needsUpdate = true;
    if (en && ve > 0) {
      const R = blobR(en.count) + 0.5;
      aura.visible = true; aura.position.set(0, 0.012, ez); aura.scale.set(R, 1, R);
      ecountSprite.visible = true; ecountSprite.position.set(0, CH + 1.0 + blobR(en.count) * 0.15, ez - 0.2);
      if (en.count !== lastEN) { lastEN = en.count; ecountSprite.material.map.dispose(); ecountSprite.material.map = countTex(en.count, '#ec4a3f'); ecountSprite.material.needsUpdate = true; }
    } else { aura.visible = false; ecountSprite.visible = false; }
  }

  // ===== Финал: лестница множителей =====
  function stairTop() { return { y: (finaleStep + 1) * STEP_H, z: STAIR_Z + finaleStep * STEP_D }; }
  function clearStairs() { stairs.forEach((s) => scene.remove(s)); stairs = []; }
  function buildStairs() {
    clearStairs();
    const colors = [0xf6d860, 0xc6e48b, 0xf4b860, 0xb48ee0, 0xf9c24a, 0x9fd36b, 0xf28fb0];
    for (let i = 0; i < STEPS; i++) {
      const g = new T.Group(), topY = (i + 1) * STEP_H;
      const box = new T.Mesh(new T.BoxGeometry(ROAD_W, topY, STEP_D), new T.MeshLambertMaterial({ color: colors[i] }));
      box.position.set(0, topY / 2, STAIR_Z + i * STEP_D); g.add(box);
      const lab = new T.Mesh(new T.PlaneGeometry(2.4, 1.2), new T.MeshBasicMaterial({ map: stepTex('x' + STEP_MULT[i]), transparent: true, depthWrite: false }));
      lab.rotation.set(-Math.PI / 2, 0, Math.PI); lab.position.set(-(ROAD_HALF - 1.25), topY + 0.02, STAIR_Z + i * STEP_D); g.add(lab);
      scene.add(g); stairs.push(g);
    }
  }
  function enterFinale() {
    mode = 'finish'; finaleT = 0; finaleShown = false; clearObjects();
    let reach = 0; for (let i = 0; i < STEPS; i++) if (N >= THRESH[i]) reach = i;
    finaleStep = reach; finaleMult = STEP_MULT[reach];
    finaleReward = Math.max(1, Math.round(N * finaleMult * (1 + upg.income * 0.5)));
    buildStairs();
    // каждому человечку — своё место на ступенях (пирамидой)
    const vp = Math.min(N, PCAP);
    for (let i = 0; i < vp; i++) {
      const ch = players[i], s = Math.min(reach, Math.floor(i / vp * (reach + 1)));
      const onStep = []; for (let j = 0; j < vp; j++) if (Math.min(reach, Math.floor(j / vp * (reach + 1))) === s) onStep.push(j);
      const k = onStep.indexOf(i), w = Math.min(4.0, onStep.length * 0.42);
      ch.fin = { x: 0.95 + (onStep.length > 1 ? -w / 2 + k * (w / (onStep.length - 1)) : 0), y: (s + 1) * STEP_H, z: STAIR_Z + s * STEP_D + (Math.random() - 0.5) * 0.4 };
      ch.fx = crowdX + slots[i].x; ch.fy = 0; ch.fz = crowdZ + slots[i].z;
    }
    $('tap-hint').style.display = 'none';
    if (window.GameAudio) GameAudio.sfx('win');
  }
  function updateFinale(dt) {
    finaleT += dt;
    const top = stairTop();
    _cv.set(0, top.y + 9.8, top.z - 13.5);
    camera.position.lerp(_cv, Math.min(1, dt * 1.8));
    camera.lookAt(0, top.y * 0.6, top.z + 1.5);
    if (finaleT > 2.6 && !finaleShown) { finaleShown = true; showWin(); }
  }

  // ===== Экраны =====
  function gameOver() {
    if (mode === 'over') return; mode = 'over';
    for (let i = 0; i < 18; i++) addSplat(crowdX + (Math.random() - 0.5) * 2, traveled + (Math.random() - 0.5) * 2, C_BLUE);
    shake = 0.5;
    const dist = Math.floor(traveled);
    const bonus = Math.round(dist / 8 * (1 + upg.income * 0.5));
    runCoins += bonus; coins += runCoins; if (dist > bestDist) bestDist = dist; save();
    const end = $('end');
    end.querySelector('.big-emoji').textContent = '💀';
    end.querySelector('h1').textContent = L.fallen;
    end.querySelector('.stats').innerHTML = '<div>' + L.passed + ': <b>' + Math.min(100, Math.round(traveled / FINISH * 100)) + '%</b></div><div>' + L.runCoins + ': <b id="end-coins">' + runCoins + '</b> 🪙</div>';
    $('btn-revive').style.display = ''; $('btn-revive').onclick = revive;
    $('btn-x2').style.display = ''; $('btn-x2').disabled = false; $('btn-x2').style.opacity = 1; $('btn-x2').onclick = doubleCoins;
    $('btn-again').textContent = L.again; $('btn-again').onclick = () => { $('end').classList.add('hidden'); maybeInterstitial(startRun); };
    $('tap-hint').style.display = 'none';
    setTimeout(() => end.classList.remove('hidden'), 700);
    if (window.GameAudio) GameAudio.sfx('fail');
  }
  function showWin() {
    coins += finaleReward; save();
    const end = $('end');
    end.querySelector('.big-emoji').textContent = '🏆';
    end.querySelector('h1').textContent = L.levelDone(level);
    end.querySelector('.stats').innerHTML = '<div>' + L.mult + ': <b>x' + finaleMult + '</b></div><div>' + L.reward + ': <b id="end-coins">' + finaleReward + '</b> 🪙</div>';
    $('btn-revive').style.display = 'none';
    $('btn-x2').style.display = ''; $('btn-x2').disabled = false; $('btn-x2').style.opacity = 1;
    $('btn-x2').onclick = () => window.YSDK.showRewarded(() => {
      coins += finaleReward; $('end-coins').textContent = finaleReward * 2; $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5; save();
      if (window.GameAudio) GameAudio.sfx('coin');
    });
    $('btn-again').textContent = L.next; $('btn-again').onclick = () => { level++; save(); $('end').classList.add('hidden'); maybeInterstitial(startRun); };
    end.classList.remove('hidden');
  }
  function hideScreens() { ['start', 'end', 'shop'].forEach((id) => $(id).classList.add('hidden')); }

  // ===== HUD / магазин =====
  function updateHUD() {
    $('prog').style.width = Math.min(100, traveled / FINISH * 100) + '%';
    $('lvl').textContent = level;
    $('coins').textContent = coins + runCoins;
  }
  const UPG_DEF = {
    start: { name: () => L.upStart, max: 10, cost: (l) => 60 + l * 70, desc: (l) => '+' + (l * 2) + L.inStart },
    income: { name: () => L.upIncome, max: 5, cost: (l) => 100 + l * 120, desc: (l) => '+' + (l * 50) + L.coinsPct },
  };
  function renderShop() {
    $('shop-coins').textContent = coins;
    for (const key of Object.keys(UPG_DEF)) {
      const def = UPG_DEF[key], lvl = upg[key], el = $('upg-' + key), maxed = lvl >= def.max, cost = def.cost(lvl);
      el.innerHTML = `<div class="upg-info"><div class="upg-name">${def.name()}</div><div class="upg-lvl">${L.lvl} ${lvl}/${def.max} · ${def.desc(lvl)}</div>` +
        `<div class="upg-bar"><div style="width:${lvl / def.max * 100}%"></div></div></div>` +
        (maxed ? `<button class="upg-buy max" disabled>${L.max}</button>` : `<button class="upg-buy" data-k="${key}" ${coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`);
    }
    $('shop').querySelectorAll('.upg-buy[data-k]').forEach((btn) => {
      btn.onclick = () => { const k = btn.dataset.k, cost = UPG_DEF[k].cost(upg[k]);
        if (coins >= cost && upg[k] < UPG_DEF[k].max) { coins -= cost; upg[k]++; save(); renderShop(); updateHUD(); if (window.GameAudio) GameAudio.sfx('power'); } };
    });
  }

  // ===== Реклама =====
  let runCount = 0;
  function maybeInterstitial(after) { runCount++; if (runCount % 3 === 0) window.YSDK.showFullscreen(after); else after(); }
  function revive() {
    window.YSDK.showRewarded(() => {
      N = Math.max(20, 10 + upg.start * 2); mode = 'play'; clashEn = null;
      for (const o of objects) if (!o.done && o.worldZ - traveled < 12) { o.done = true; o._gone = true; disposeObj(o); }
      objects = objects.filter((o) => !o._gone);
      $('end').classList.add('hidden'); $('tap-hint').style.display = '';
      if (window.GameAudio) GameAudio.sfx('power');
    });
  }
  function doubleCoins() {
    window.YSDK.showRewarded(() => {
      coins += runCoins; $('end-coins').textContent = runCoins * 2; $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5; save();
      if (window.GameAudio) GameAudio.sfx('coin');
    });
  }

  // ===== Ввод =====
  function bindInput() {
    const toLat = (e) => { const r = canvas.getBoundingClientRect(); return Math.max(-1, Math.min(1, ((e.clientX - r.left) - r.width / 2) / (r.width * 0.4))); };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => { if (mode === 'play') { dragging = true; targetLat = toLat(e); } });
    canvas.addEventListener('pointermove', (e) => { if (dragging) targetLat = toLat(e); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    $('btn-start').onclick = startRun;
    $('btn-upgrades').onclick = () => { $('end').classList.add('hidden'); renderShop(); $('shop').classList.remove('hidden'); };
    $('btn-close-shop').onclick = () => { $('shop').classList.add('hidden'); startRun(); };
    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);

    // Тестовый API (для автотестов)
    window.__crowd = {
      ready: () => loaded, start: startRun,
      steerTo: (x) => { const W = canvas.getBoundingClientRect().width; targetLat = Math.max(-1, Math.min(1, (x - W / 2) / (W * 0.4))); },
      state: () => ({ mode, N, dist: Math.floor(traveled), coins, runCoins, level, enemy: clashEn ? clashEn.count : null }),
      grow: (n) => { N += (n || 20); }, forceOver: () => { N = 0; },
      toFinish: () => { clearObjects(); genDist = FINISH + 100; traveled = FINISH - 0.5; },
      jumpTo: (type) => {
        const o = objects.find((q) => q.type === type && !q.done); if (!o) return false;
        const tz = o.worldZ - 6;
        for (const q of objects) if (q !== o && q.worldZ < tz + 1) { q.done = true; q._gone = true; disposeObj(q); }
        objects = objects.filter((q) => !q._gone); traveled = tz; return true;
      },
      webgl: () => !!(renderer && renderer.getContext()),
    };
  }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    try { detectLang(); } catch (e) {}
    try { init(); } catch (e) { console.error('init fail', e); }
    window.YSDK.gameReady();
  });
})();
