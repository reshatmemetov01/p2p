/* =========================================================================
   Crazy Delivery — 3D-полоса препятствий с посылкой в руках.
   Модели: KayKit Character Pack Adventurers + KayKit Platformer Pack (CC0).
   Своя простая физика: тела-коробки (AABB) против платформ-коробок.
   Если ударило ловушкой — посылка вылетает из рук, её надо подобрать.
   Посылка упала в лаву — проигрыш (можно продолжить за рекламу).
   ========================================================================= */
(function () {
  'use strict';
  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'delivery_save_v1';

  // ---- Языки ----
  const TEXTS = {
    en: { level: 'Level', loading: 'Loading…', play: 'Play!', intro: "Deliver the parcel through total chaos! Don't drop it into the lava.",
      ctrl: 'Left side: move · Right button: jump · PC: WASD + Space', dropped: 'Parcel dropped! Pick it up!', cont: 'Continue (watch ad)',
      next: 'Next level ▶', retry: 'Retry', paused: 'Paused', resume: 'Resume', restart: 'Restart level', rotate: 'Rotate your device',
      delivered: 'Delivered!', lost: 'Parcel lost!', lostText: 'Your parcel fell into the lava…', double: 'Double coins (watch ad)',
      winText: (c, t) => 'Coins: +' + c + ' · Time: ' + t + 's' },
    ru: { level: 'Уровень', loading: 'Загрузка…', play: 'Играть!', intro: 'Доставь посылку через полный хаос! Не урони её в лаву.',
      ctrl: 'Слева — движение · Кнопка справа — прыжок · ПК: WASD + Пробел', dropped: 'Посылка упала! Подбери её!', cont: 'Продолжить за рекламу',
      next: 'Следующий уровень ▶', retry: 'Заново', paused: 'Пауза', resume: 'Продолжить', restart: 'Начать уровень заново', rotate: 'Поверни телефон',
      delivered: 'Доставлено!', lost: 'Посылка потеряна!', lostText: 'Посылка упала в лаву…', double: 'Удвоить монеты (реклама)',
      winText: (c, t) => 'Монеты: +' + c + ' · Время: ' + t + ' с' },
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

  // ---- Сохранение ----
  let save = { level: 1, coins: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ---- Константы ----
  const G = 32, JUMP_V = 11.5, SPEED = 6.2, KILL_Y = -1.4, COURIER_H = 1.3;
  const PH = { hw: 0.28, h: 1.25 }, BOX = { hw: 0.22, h: 0.44 };

  // ---- Three.js ----
  let renderer, scene, camera, sun, clock = new T.Clock();
  const K = {}; // шаблоны моделей набора
  let courierTmpl = null, courierClips = [];
  let loaded = false, mode = 'menu'; // menu | play | dead | win | lost | pause
  let solids = [], movers = [], fallers = [], springs = [], hammers = [], sweepers = [], coinsArr = [], flags = [], fx = [], levelObjs = [];
  let startZ = 0, finishZ = 100, finishZone = null, checkpoint = null, levelTime = 0, runCoins = 0, lava = null, lavaTex = null;
  let player = null, parcel = null;
  const tmpBox = new T.Box3(), tmpV = new T.Vector3();

  function texCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new T.CanvasTexture(c); }

  function initThree() {
    const canvas = $('game');
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    scene = new T.Scene();
    scene.background = texCanvas(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4aa8ff'); g.addColorStop(0.6, '#9fdcff'); g.addColorStop(1, '#ffd9a8'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    scene.background.encoding = T.sRGBEncoding;
    scene.fog = new T.Fog(0xffc79a, 40, 95);
    camera = new T.PerspectiveCamera(55, 1, 0.1, 200);
    scene.add(new T.HemisphereLight(0xdff2ff, 0x9a6a50, 0.75));
    sun = new T.DirectionalLight(0xffffff, 0.95); sun.position.set(-6, 14, -4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
    sun.shadow.bias = -0.0015; scene.add(sun); scene.add(sun.target);
    // лава
    lavaTex = texCanvas(256, 256, (x, w, h) => {
      x.fillStyle = '#ff5a14'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const r = 6 + Math.random() * 26; const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, i % 3 ? 'rgba(255,214,70,.9)' : 'rgba(255,240,150,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
        const px = Math.random() * w, py = Math.random() * h;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { x.save(); x.translate(px + ox, py + oy); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); } }
      for (let i = 0; i < 25; i++) { x.fillStyle = 'rgba(160,30,10,.35)'; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, 7); x.fill(); }
    });
    lavaTex.wrapS = lavaTex.wrapT = T.RepeatWrapping; lavaTex.repeat.set(30, 60); lavaTex.encoding = T.sRGBEncoding;
    lava = new T.Mesh(new T.PlaneGeometry(240, 480), new T.MeshBasicMaterial({ map: lavaTex, fog: true }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(0, KILL_Y - 0.3, 150); scene.add(lava);
    // облака
    const cm = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 });
    for (let i = 0; i < 26; i++) {
      const g = new T.Group(); for (let k = 0; k < 4; k++) { const s = new T.Mesh(new T.SphereGeometry(1, 10, 8), cm); s.position.set(k * 1.4 - 2, Math.random() * 0.6, Math.random() * 0.8); s.scale.setScalar(1 + Math.random() * 0.9); g.add(s); }
      const side = i % 2 ? 1 : -1; g.position.set(side * (18 + Math.random() * 25), 4 + Math.random() * 12, i * 12 - 10); g.scale.setScalar(1.2 + Math.random()); scene.add(g);
    }
    window.addEventListener('resize', onResize); onResize();
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.3 ? 68 : 55; camera.updateProjectionMatrix();
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    $('rotate').classList.toggle('hidden', !(touch && h > w));
  }

  // ---- Модели ----
  function inst(name, x, y, z, ry, sx, sy, sz) {
    const t = K[name]; if (!t) { console.warn('no model', name); return new T.Group(); }
    const o = t.clone(); o.position.set(x, y, z); o.rotation.y = ry || 0; o.scale.set(sx || 1, sy || sx || 1, sz || sx || 1);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(o); levelObjs.push(o); return o;
  }
  function solidOf(o, kind, extra) { const s = Object.assign({ obj: o, kind: kind || 'static', box: new T.Box3().setFromObject(o), active: true }, extra || {}); solids.push(s); return s; }

  // ---- Тела (игрок и посылка): AABB, нижняя точка = pos ----
  function makeBody(hw, h) { return { pos: new T.Vector3(), vel: new T.Vector3(), hw, h, grounded: false, ground: null, landedV: 0 }; }
  function bodyBox(b, out) { out.min.set(b.pos.x - b.hw, b.pos.y + 0.02, b.pos.z - b.hw); out.max.set(b.pos.x + b.hw, b.pos.y + b.h, b.pos.z + b.hw); return out; }
  function moveBody(b, dt) {
    const bb = new T.Box3();
    b.landedV = 0; const wasGround = b.ground; b.grounded = false; b.ground = null;
    for (const ax of ['x', 'z', 'y']) {
      const d = b.vel[ax] * dt; if (!d && ax !== 'y') continue;
      b.pos[ax] += d; bodyBox(b, bb);
      for (const s of solids) {
        if (!s.active || !bb.intersectsBox(s.box)) continue;
        // тонкое перекрытие по вертикали у края платформы — считаем «встал сверху»
        if (ax === 'y') {
          if (d <= 0) { b.landedV = -b.vel.y; b.pos.y = s.box.max.y; b.vel.y = 0; b.grounded = true; b.ground = s; }
          else { b.pos.y = s.box.min.y - b.h - 0.001; b.vel.y = 0; }
        } else {
          const top = s.box.max.y - b.pos.y;
          if (top > 0 && top < 0.32 && b.vel.y <= 0.1) { b.pos.y = s.box.max.y; continue; } // маленькая ступенька
          if (d > 0) b.pos[ax] = s.box.min[ax] - b.hw - 0.001; else b.pos[ax] = s.box.max[ax] + b.hw + 0.001;
          b.vel[ax] = 0;
        }
        bodyBox(b, bb);
      }
    }
    if (!b.grounded && wasGround && b.vel.y <= 0) { // проверка «стоим ли» на 2 см ниже
      bodyBox(b, bb); bb.min.y -= 0.05;
      for (const s of solids) if (s.active && bb.intersectsBox(s.box) && s.box.max.y <= b.pos.y + 0.06) { b.pos.y = s.box.max.y; b.vel.y = 0; b.grounded = true; b.ground = s; break; }
    }
  }

  // ---- Персонаж ----
  function makeCourier() {
    const root = T.SkeletonUtils.clone(courierTmpl);
    const k = COURIER_H / 2.19; root.scale.setScalar(k);
    const bones = {};
    root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } if (m.isBone) bones[m.name] = m; if (m.isMesh && /Knife|Crossbow|Dagger/i.test(m.name)) m.visible = false; });
    scene.add(root);
    const mixer = new T.AnimationMixer(root), act = {};
    courierClips.forEach((c) => { act[c.name] = mixer.clipAction(c); });
    ['Jump_Start', 'Jump_Land', 'Hit_A', 'PickUp', 'Lie_Down', 'Lie_StandUp'].forEach((n) => { if (act[n]) { act[n].setLoop(T.LoopOnce); act[n].clampWhenFinished = true; } });
    return { root, mixer, act, cur: null, bones };
  }
  function play(ch, name, fade) {
    if (ch.cur === name || !ch.act[name]) return;
    const next = ch.act[name]; next.reset(); next.play();
    if (ch.cur && ch.act[ch.cur]) ch.act[ch.cur].crossFadeTo(next, fade == null ? 0.12 : fade, false);
    ch.cur = name;
  }
  const CARRY = { f: 0.33, y: 0.5, ul: [-1.25, 0, 0.35], ll: [-0.35, 0, 0.0], ur: [-1.25, 0, -0.35], lr: [-0.35, 0, 0.0] };
  function carryPose(ch) {
    const b = ch.bones, set = (bone, r) => { if (bone) bone.rotation.set(r[0], r[1], r[2]); };
    set(b.upperarml, CARRY.ul); set(b.lowerarml, CARRY.ll); set(b.upperarmr, CARRY.ur); set(b.lowerarmr, CARRY.lr);
  }

  // ---- Посылка ----
  function makeParcel() {
    const tex = texCanvas(128, 128, (x, w, h) => {
      x.fillStyle = '#c98d4f'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#b77a3e'; for (let i = 0; i < 9; i++) x.fillRect(0, i * 15 + 3, w, 2);
      x.fillStyle = '#e8c58c'; x.fillRect(w / 2 - 11, 0, 22, h);
      x.strokeStyle = '#7a4a1e'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
      x.fillStyle = '#d23b3b'; x.font = 'bold 26px Arial'; x.textAlign = 'center'; x.fillText('▲▲', w / 2, h - 18);
    });
    tex.encoding = T.sRGBEncoding;
    const m = new T.Mesh(new T.BoxGeometry(BOX.hw * 2, BOX.h, BOX.hw * 2), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.castShadow = true; scene.add(m);
    const b = makeBody(BOX.hw, BOX.h); return Object.assign(b, { mesh: m, state: 'carried', spin: new T.Vector3(), pickCd: 0 });
  }

  // ---- Построение уровня ----
  function clearLevel() {
    levelObjs.forEach((o) => scene.remove(o)); levelObjs = [];
    solids = []; movers = []; fallers = []; springs = []; hammers = []; sweepers = []; coinsArr = []; flags = [];
    fx.forEach((f) => scene.remove(f.m)); fx = [];
  }
  function rngFor(level) { let s = level * 7919 + 13; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function buildLevel(level) {
    clearLevel();
    const R = rngFor(level);
    let cz = 0, cy = 0;
    const tile = (name, x, z, y, ry) => { const o = inst(name, x, (y == null ? cy : y) - 1, z, ry); return solidOf(o); };
    const coinRow = (z0, z1, x, y) => { for (let z = z0; z <= z1; z += 1.6) { const o = inst('diamond_blue', x || 0, (y == null ? cy : y) + 0.8, z, 0, 0.55); coinsArr.push({ o, taken: false }); } };
    const flag = () => { const o = inst('flag_A_red', 1.6, cy, cz - 1.2, -Math.PI / 2); flags.push({ o, z: cz - 1.6, y: cy, on: false }); };

    const SEG = {
      start() { tile('platform_6x6x1_green', 0, cz + 3); inst('signage_arrow_stand_yellow', 2.2, cy, cz + 4.5, Math.PI); startZ = cz + 1.5; checkpoint = new T.Vector3(0, cy, cz + 1.5); cz += 6; },
      gaps(n) {
        for (let i = 0; i < n; i++) { const g = 1.5 + R() * 0.9, x = (R() - 0.5) * 2.2; tile(i % 2 ? 'platform_4x4x1_blue' : 'platform_4x4x1_yellow', x, cz + g + 2); coinRow(cz + g + 1.2, cz + g + 2.8, x); cz += g + 4; }
      },
      hammer() {
        tile('platform_4x4x1_yellow', 0, cz + 2); tile('platform_4x4x1_yellow', 0, cz + 6);
        const hz = cz + 4, top = cy + 4.7;
        inst('pillar_1x1x8', -2.6, KILL_Y - 0.4, hz, 0, 1, (top - KILL_Y + 0.4) / 8, 1); inst('pillar_1x1x8', 2.6, KILL_Y - 0.4, hz, 0, 1, (top - KILL_Y + 0.4) / 8, 1);
        inst('strut_horizontal', 0, top - 0.1, hz, 0, 2.8, 1.2, 1.2);
        const piv = new T.Group(); piv.position.set(0, top - 0.25, hz); scene.add(piv); levelObjs.push(piv);
        const arm = K.strut_vertical.clone(); arm.scale.set(0.7, 1.4, 0.7); arm.rotation.z = Math.PI; piv.add(arm);
        const head = K.platform_decorative_2x2x2_red.clone(); head.scale.set(0.75, 0.75, 0.75); head.position.set(0, -2.8 - 1.5, 0); piv.add(head);
        [arm, head].forEach((o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; } }));
        hammers.push({ piv, head, amp: 1.05, w: 1.7 + R() * 0.6 + level * 0.02, ph: R() * 6, prevX: 0 });
        cz += 8;
      },
      falling(n) {
        cz += 0.4;
        for (let i = 0; i < n; i++) { const x = (R() - 0.5) * 2; const s = tile('platform_2x2x1_yellow', x, cz + 1); s.kind = 'fall'; Object.assign(s, { home: s.obj.position.clone(), t: 0, st: 'idle', vy: 0 }); fallers.push(s); coinsArr.push({ o: inst('diamond_blue', x, cy + 0.8, cz + 1, 0, 0.55), taken: false }); cz += 2.6; }
      },
      movers(n) {
        for (let i = 0; i < n; i++) { cz += 1.1; const s = tile('platform_4x2x1_blue', 0, cz + 1); s.kind = 'move'; Object.assign(s, { base: s.obj.position.clone(), amp: 2.4, w: 1.1 + level * 0.015, ph: i * 2.2 + R(), prev: s.obj.position.clone(), delta: new T.Vector3() }); movers.push(s); cz += 2; }
        cz += 1.1;
      },
      spring() {
        tile('platform_4x4x1_green', 0, cz + 2); const sp = inst('spring_pad_yellow', 0, cy, cz + 2.4);
        const s = solidOf(sp, 'spring'); springs.push(s); s.box.max.y -= 0.35;
        cz += 4 + 1.6; const o = inst('platform_4x4x4_blue', 0, cy - 1, cz + 2); solidOf(o); cy += 3; coinRow(cz + 1, cz + 3, 0);
        cz += 4; tile('platform_6x2x1_green', 0, cz + 1, cy); cz += 2; cy = 0; cz += 1.2; tile('platform_4x4x1_yellow', 0, cz + 2); cz += 4;
      },
      sweeper() {
        tile('platform_6x6x1_blue', 0, cz + 3);
        inst('pillar_1x1x4', 0, cy, cz + 3, 0, 0.7, 0.28, 0.7);
        const g = new T.Group(); g.position.set(0, cy + 0.55, cz + 3); scene.add(g); levelObjs.push(g);
        const bar = K.strut_horizontal.clone(); bar.scale.set(3, 0.9, 0.9); g.add(bar);
        [-3, 3].forEach((x) => { const t = K.bomb_A_red.clone(); t.position.set(x, -0.1, 0); t.scale.setScalar(0.7); g.add(t); });
        g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
        sweepers.push({ g, w: (R() < 0.5 ? -1 : 1) * (1.5 + level * 0.02), y: cy, len: 3.2 });
        coinRow(cz + 1, cz + 5, -2.2); cz += 6;
      },
      bridge() { tile('floor_wood_2x6', 0, cz + 3, cy + 0.5, Math.PI / 2); coinRow(cz + 1, cz + 5, 0); cz += 6; },
      check() { tile('platform_4x4x1_green', 0, cz + 2); cz += 4; flag(); },
      finish() {
        cz += 1.5; tile('platform_6x6x1_green', 0, cz + 3); inst('signage_finish_wide', 0, cy, cz + 1.2);
        const pad = inst('platform_arrow_4x4x1_green', 0, cy - 0.95, cz + 3.8, 0, 0.6, 1, 0.6);
        finishZone = new T.Box3(new T.Vector3(-2.5, cy - 0.5, cz + 1.4), new T.Vector3(2.5, cy + 3, cz + 6)); finishZ = cz + 2; cz += 6;
      },
    };
    // последовательность
    SEG.start();
    if (level === 1) {
      SEG.bridge(); SEG.gaps(2); SEG.hammer(); SEG.check(); SEG.falling(4); SEG.movers(2); SEG.check(); SEG.spring(); SEG.sweeper(); SEG.hammer(); SEG.finish();
    } else {
      const pool = ['gaps', 'hammer', 'falling', 'movers', 'sweeper', 'spring', 'bridge'];
      const n = Math.min(10, 4 + Math.floor(level / 3));
      for (let i = 0; i < n; i++) {
        const t = pool[Math.floor(R() * pool.length)];
        if (t === 'gaps') SEG.gaps(2 + Math.floor(R() * 2)); else if (t === 'falling') SEG.falling(3 + Math.floor(R() * 3)); else if (t === 'movers') SEG.movers(2 + Math.floor(R() * 2)); else SEG[t]();
        if (i % 3 === 2 && i < n - 1) SEG.check();
      }
      SEG.finish();
    }
  }

  // ---- Игровой цикл ----
  const input = { x: 0, y: 0, jump: 0, keys: {} };
  let stun = 0, carrying = true, deadT = 0, alertT = 0, camShake = 0;

  function resetPlayerAt(p) {
    player.pos.copy(p); player.vel.set(0, 0, 0); stun = 0; player.yaw = 0;
    if (parcel.state !== 'free') { parcel.state = 'carried'; carrying = true; }
  }
  function startLevel() {
    buildLevel(save.level);
    if (!player) { player = Object.assign(makeBody(PH.hw, PH.h), { ch: makeCourier(), yaw: 0 }); }
    if (!parcel) parcel = makeParcel();
    parcel.state = 'carried'; carrying = true; parcel.mesh.visible = true;
    resetPlayerAt(checkpoint); levelTime = 0; runCoins = 0; mode = 'play';
    $('lvl').textContent = save.level; $('coins').textContent = save.coins;
    $('pbox').classList.remove('lost'); $('parcel-alert').classList.add('hidden');
    ['start', 'end', 'pause'].forEach((id) => $(id).classList.add('hidden'));
    camera.position.set(0, 6, checkpoint.z - 9);
  }

  function hitPlayer(dir) {
    if (stun > 0 || mode !== 'play') return;
    stun = 0.9; camShake = 0.35;
    player.vel.set(dir.x * 6.5, 7.5, dir.z * 6.5);
    play(player.ch, 'Hit_A', 0.05);
    if (carrying) {
      carrying = false; parcel.state = 'free'; parcel.pickCd = 0.8;
      parcel.vel.set(dir.x * 2.2 + (Math.random() - 0.5) * 1.5, 8.5, dir.z * 2 + 1.2);
      parcel.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
      $('parcel-alert').classList.remove('hidden'); alertT = 2.2;
    }
    if (window.GameAudio) GameAudio.sfx('fail');
  }

  function update(dt) {
    const t = clock.elapsedTime;
    lavaTex.offset.y = (lavaTex.offset.y + dt * 0.04) % 1; lavaTex.offset.x = Math.sin(t * 0.3) * 0.05;
    // движущиеся платформы
    for (const s of movers) {
      s.prev.copy(s.obj.position);
      s.obj.position.x = s.base.x + Math.sin(t * s.w + s.ph) * s.amp;
      s.delta.subVectors(s.obj.position, s.prev); s.box.setFromObject(s.obj);
    }
    // падающие плитки
    for (const s of fallers) {
      if (s.st === 'shake') { s.t -= dt; s.obj.position.x = s.home.x + Math.sin(t * 60) * 0.06; if (s.t <= 0) { s.st = 'fall'; s.vy = 0; } }
      else if (s.st === 'fall') { s.vy -= 25 * dt; s.obj.position.y += s.vy * dt; s.obj.rotation.z += dt * 0.8; if (s.obj.position.y < KILL_Y - 4) { s.st = 'gone'; s.active = false; s.obj.visible = false; s.t = 2.5; } s.box.setFromObject(s.obj); }
      else if (s.st === 'gone') { s.t -= dt; if (s.t <= 0) { s.st = 'idle'; s.active = true; s.obj.visible = true; s.obj.position.copy(s.home); s.obj.rotation.z = 0; s.box.setFromObject(s.obj); } }
    }
    for (const h of hammers) { h.piv.rotation.z = Math.sin(t * h.w + h.ph) * h.amp; }
    for (const s of sweepers) s.g.rotation.y += s.w * dt;
    for (const c of coinsArr) if (!c.taken) { c.o.rotation.y += dt * 2.5; c.o.position.y += Math.sin(t * 3 + c.o.position.z) * 0.002; }
    for (const s of springs) { const k = s.bounce > 0 ? 1 + Math.sin(s.bounce * 20) * 0.25 * s.bounce : 1; s.obj.scale.y = k; if (s.bounce > 0) s.bounce -= dt * 2; }

    if (mode === 'play' || mode === 'win') updatePlayer(dt, t);
    if (mode === 'play') { updateParcel(dt); levelTime += dt; checkHazards(); }
    else if (parcel && parcel.state === 'free') updateParcel(dt);
    if (mode === 'dead') { deadT -= dt; if (deadT <= 0) { mode = 'play'; resetPlayerAt(checkpoint); player.ch.root.visible = true; } }
    updateFx(dt);
    updateCamera(dt);
    if (alertT > 0) { alertT -= dt; if (alertT <= 0) $('parcel-alert').classList.add('hidden'); }
    // HUD
    const pr = Math.max(0, Math.min(1, (player.pos.z - startZ) / (finishZ - startZ)));
    $('prog').style.width = pr * 100 + '%'; $('pbox').style.left = pr * 100 + '%';
  }

  function updatePlayer(dt, t) {
    const p = player;
    // ввод
    let ix = input.x, iy = input.y;
    if (input.keys.left) ix -= 1; if (input.keys.right) ix += 1; if (input.keys.up) iy += 1; if (input.keys.down) iy -= 1;
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    if (mode === 'win') { ix = 0; iy = 0; }
    // перенос движущейся платформой
    if (p.ground && p.ground.kind === 'move') p.pos.add(p.ground.delta);
    const ctrl = stun > 0 ? 0.15 : 1;
    const tvx = -ix * SPEED, tvz = iy * SPEED, a = 1 - Math.exp(-(p.grounded ? 14 : 6) * dt * ctrl);
    p.vel.x += (tvx - p.vel.x) * a; p.vel.z += (tvz - p.vel.z) * a;
    p.vel.y -= G * dt;
    // прыжок (с «буфером» и «койот-временем»)
    p.coyote = p.grounded ? 0.12 : Math.max(0, (p.coyote || 0) - dt);
    if (input.jump > 0) input.jump -= dt;
    if (input.jump > 0 && p.coyote > 0 && stun <= 0 && mode === 'play') {
      p.vel.y = JUMP_V; p.coyote = 0; input.jump = 0; play(p.ch, 'Jump_Start', 0.05); p.jumpT = 0.25;
      if (window.GameAudio) GameAudio.sfx('move');
    }
    const wasAir = !p.grounded;
    moveBody(p, dt);
    if (p.grounded && wasAir && p.landedV > 6) { p.landT = 0.18; }
    // пружина / падающая плитка
    if (p.grounded && p.ground) {
      if (p.ground.kind === 'spring') { p.vel.y = 17.5; p.grounded = false; p.ground.bounce = 1; play(p.ch, 'Jump_Start', 0.05); if (window.GameAudio) GameAudio.sfx('power'); }
      else if (p.ground.kind === 'fall' && p.ground.st === 'idle') { p.ground.st = 'shake'; p.ground.t = 0.45; }
    }
    if (stun > 0) stun -= dt;
    // поворот
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs > 0.6 && stun <= 0) { const ty = Math.atan2(p.vel.x, p.vel.z); let d = ty - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, dt * 14); }
    const ch = p.ch; ch.root.position.copy(p.pos); ch.root.rotation.y = p.yaw;
    // анимация
    if (mode === 'win') play(ch, 'Cheer', 0.2);
    else if (stun > 0) { /* Hit_A */ }
    else if (!p.grounded) { if ((p.jumpT -= dt) <= 0) play(ch, 'Jump_Idle', 0.15); }
    else if (p.landT > 0) { p.landT -= dt; play(ch, 'Jump_Land', 0.05); }
    else if (hs > 0.8) { play(ch, 'Running_A', 0.12); ch.act.Running_A.timeScale = Math.min(1.4, hs / 5); }
    else play(ch, 'Idle', 0.2);
    ch.mixer.update(dt);
    if (carrying) carryPose(ch);
    // смерть в лаве
    if (p.pos.y < KILL_Y && mode === 'play') die();
    // чекпоинты, монеты, финиш
    for (const f of flags) if (!f.on && p.pos.z > f.z) { f.on = true; checkpoint = new T.Vector3(0, f.y, f.z + 0.4); swapFlag(f); }
    for (const c of coinsArr) if (!c.taken && c.o.position.distanceToSquared(tmpV.set(p.pos.x, p.pos.y + 0.7, p.pos.z)) < 0.9) {
      c.taken = true; c.o.visible = false; runCoins++; save.coins++; $('coins').textContent = save.coins; if (window.GameAudio) GameAudio.sfx('coin');
    }
    if (mode === 'play' && carrying && finishZone && finishZone.containsPoint(tmpV.set(p.pos.x, p.pos.y + 0.5, p.pos.z))) win();
  }

  function updateParcel(dt) {
    const b = parcel;
    if (b.state === 'carried') {
      const p = player, fx2 = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      b.mesh.position.set(p.pos.x + fx2 * CARRY.f, p.pos.y + CARRY.y, p.pos.z + fz * CARRY.f);
      b.mesh.rotation.set(0, p.yaw, 0); b.pos.copy(b.mesh.position); b.pos.y -= BOX.h / 2;
      return;
    }
    if (b.state !== 'free') return;
    if (b.ground && b.ground.kind === 'move') b.pos.add(b.ground.delta);
    b.vel.y -= G * dt;
    if (b.grounded) { const f = Math.exp(-6 * dt); b.vel.x *= f; b.vel.z *= f; b.spin.multiplyScalar(f); }
    moveBody(b, dt);
    if (b.grounded && b.landedV > 4) { b.vel.y = b.landedV * 0.3; b.grounded = false; }
    if (b.grounded && b.ground && b.ground.kind === 'fall' && b.ground.st === 'idle') { b.ground.st = 'shake'; b.ground.t = 0.6; }
    if (b.grounded && b.ground && b.ground.kind === 'spring') { b.vel.y = 15; b.ground.bounce = 1; }
    b.mesh.position.set(b.pos.x, b.pos.y + BOX.h / 2, b.pos.z);
    b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
    if (b.grounded && b.spin.lengthSq() < 0.5) { b.mesh.rotation.x *= 0.8; b.mesh.rotation.z *= 0.8; }
    if (b.pickCd > 0) b.pickCd -= dt;
    // подобрать
    if (mode === 'play' && stun <= 0 && b.pickCd <= 0) {
      const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z, dy = b.pos.y - player.pos.y;
      if (dx * dx + dz * dz < 0.75 && dy > -0.6 && dy < 1.2) {
        b.state = 'carried'; carrying = true; $('parcel-alert').classList.add('hidden'); alertT = 0;
        if (window.GameAudio) GameAudio.sfx('perfect');
      }
    }
    // в лаву
    if (b.pos.y < KILL_Y) {
      b.state = 'lost'; b.mesh.visible = false; splash(b.pos, 0xffa020);
      if (mode === 'play') { mode = 'lost'; $('pbox').classList.add('lost'); setTimeout(showLost, 1100); if (window.GameAudio) GameAudio.sfx('fail'); }
    }
  }

  function checkHazards() {
    if (!player || stun > 0) return;
    const pb = bodyBox(player, new T.Box3());
    for (const h of hammers) {
      tmpBox.setFromObject(h.head);
      const hx = tmpBox.getCenter(tmpV).x; const vx = hx - h.prevX; h.prevX = hx;
      if (tmpBox.intersectsBox(pb)) { hitPlayer(new T.Vector3(Math.sign(vx) || 1, 0, 0.15)); break; }
      if (parcel.state === 'free') { const qb = bodyBox(parcel, new T.Box3()); if (tmpBox.intersectsBox(qb)) { parcel.vel.set((Math.sign(vx) || 1) * 7, 6, 0); } }
    }
    for (const s of sweepers) {
      const a = s.g.rotation.y, c = Math.cos(a), sn = Math.sin(a);
      const test = (b, hw, h) => {
        const dx = b.pos.x - s.g.position.x, dz = b.pos.z - s.g.position.z;
        const along = dx * c - dz * sn, perp = dx * sn + dz * c;
        if (Math.abs(along) < s.len && Math.abs(perp) < 0.3 + hw && b.pos.y < s.y + 0.85 && b.pos.y + h > s.y + 0.25) {
          const tv = new T.Vector3(-sn, 0, -c).multiplyScalar(along * s.w); tv.y = 0; if (tv.lengthSq() < 0.01) tv.set(1, 0, 0); return tv.normalize();
        } return null;
      };
      const d = test(player, PH.hw, PH.h); if (d) { hitPlayer(d); break; }
      if (parcel.state === 'free') { const d2 = test(parcel, BOX.hw, BOX.h); if (d2) parcel.vel.set(d2.x * 7, 5, d2.z * 7); }
    }
  }

  function die() {
    mode = 'dead'; deadT = 1.1; splash(player.pos, 0xff7a20); camShake = 0.4;
    player.ch.root.visible = false;
    if (carrying) { parcel.mesh.visible = false; }
    if (window.GameAudio) GameAudio.sfx('fail');
    setTimeout(() => { if (parcel.state === 'carried') parcel.mesh.visible = true; }, 1100);
  }
  function swapFlag(f) {
    const o = inst('flag_A_green', f.o.position.x, f.o.position.y, f.o.position.z, f.o.rotation.y); scene.remove(f.o);
    confetti(o.position, 18); if (window.GameAudio) GameAudio.sfx('clear');
  }
  function win() {
    mode = 'win'; carrying = false; parcel.state = 'placed';
    parcel.mesh.position.set(0, finishZone.min.y + 0.5 + BOX.h / 2 + 0.05, (finishZone.min.z + finishZone.max.z) / 2 + 0.4); parcel.mesh.rotation.set(0, 0, 0);
    confetti(parcel.mesh.position, 60);
    if (window.GameAudio) GameAudio.sfx('win');
    const reward = 20 + save.level * 2; save.coins += reward; runCoins += reward; save.level++; persist();
    $('coins').textContent = save.coins;
    setTimeout(() => {
      $('end-emoji').textContent = '📦🎉'; $('end-title').textContent = L.delivered; $('end-text').textContent = L.winText(runCoins, levelTime.toFixed(1));
      const bc = $('btn-continue'); bc.classList.remove('hidden'); bc.lastElementChild.textContent = L.double; bc.disabled = false;
      bc.onclick = () => window.YSDK.showRewarded(() => { save.coins += runCoins; persist(); $('coins').textContent = save.coins; bc.disabled = true; $('end-text').textContent = L.winText(runCoins * 2, levelTime.toFixed(1)); });
      $('btn-next').classList.remove('hidden'); $('end').classList.remove('hidden');
    }, 1600);
  }
  function showLost() {
    $('end-emoji').textContent = '📦🔥'; $('end-title').textContent = L.lost; $('end-text').textContent = L.lostText;
    const bc = $('btn-continue'); bc.classList.remove('hidden'); bc.disabled = false; bc.lastElementChild.textContent = L.cont;
    bc.onclick = () => window.YSDK.showRewarded(() => { $('end').classList.add('hidden'); parcel.state = 'carried'; carrying = true; parcel.mesh.visible = true; $('pbox').classList.remove('lost'); mode = 'play'; resetPlayerAt(checkpoint); });
    $('btn-next').classList.add('hidden'); $('end').classList.remove('hidden');
  }

  // ---- Эффекты ----
  function splash(pos, color) {
    for (let i = 0; i < 16; i++) { const m = new T.Mesh(new T.SphereGeometry(0.12, 6, 5), new T.MeshBasicMaterial({ color: i % 2 ? color : 0xffe070 })); m.position.copy(pos); m.position.y = Math.max(pos.y, KILL_Y - 0.2); scene.add(m);
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 3; fx.push({ m, v: new T.Vector3(Math.cos(a) * sp, 5 + Math.random() * 4, Math.sin(a) * sp), life: 0.9 }); }
  }
  function confetti(pos, n) {
    const cols = [0xff4f6a, 0xffd23f, 0x46d39a, 0x3fa7ff, 0xa77bff];
    for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.16, 0.1), new T.MeshBasicMaterial({ color: cols[i % 5], side: T.DoubleSide })); m.position.copy(pos); m.position.y += 1; scene.add(m);
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 3.5; fx.push({ m, v: new T.Vector3(Math.cos(a) * sp, 5 + Math.random() * 5, Math.sin(a) * sp), life: 1.6, spin: Math.random() * 10 }); }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.v.y -= (f.spin ? 9 : 18) * dt; f.m.position.addScaledVector(f.v, dt); if (f.spin) { f.m.rotation.x += f.spin * dt; f.m.rotation.y += f.spin * dt * 0.7; }
      if (f.life <= 0) { scene.remove(f.m); fx.splice(i, 1); } }
  }

  // ---- Камера ----
  const camT = new T.Vector3(), lookT = new T.Vector3();
  function updateCamera(dt) {
    if (!player) return;
    const p = player.pos;
    if (window.__camLock) { camera.position.fromArray(window.__camLock[0]); camera.lookAt(tmpV.fromArray(window.__camLock[1])); return; }
    camT.set(p.x * 0.6, Math.max(p.y, 0) + 5.5, p.z - 6.6);
    camera.position.lerp(camT, 1 - Math.exp(-5 * dt));
    lookT.set(p.x * 0.8, Math.max(p.y, 0) + 1.0, p.z + 4.5);
    camera.lookAt(lookT);
    if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake * 0.5; camera.position.y += (Math.random() - 0.5) * camShake * 0.5; }
    sun.position.set(p.x - 6, p.y + 14, p.z - 4); sun.target.position.set(p.x, p.y, p.z + 3);
  }

  // ---- Управление ----
  function setupInput() {
    const joy = $('joy'), knob = $('joy-knob'); let jid = null, jx = 0, jy = 0; const R = 55;
    const app = $('app');
    app.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || mode !== 'play' || e.pointerType === 'mouse') return;
      if (e.clientX < window.innerWidth * 0.55 && jid === null) {
        jid = e.pointerId; jx = e.clientX; jy = e.clientY; joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.classList.remove('hidden'); knob.style.transform = '';
      } else input.jump = 0.15;
    });
    app.addEventListener('pointermove', (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`; input.x = dx / R; input.y = -dy / R;
    });
    const endJ = (e) => { if (e.pointerId !== jid) return; jid = null; input.x = 0; input.y = 0; joy.classList.add('hidden'); };
    app.addEventListener('pointerup', endJ); app.addEventListener('pointercancel', endJ);
    const jb = $('btn-jump');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); input.jump = 0.15; jb.classList.add('on'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => jb.addEventListener(ev, () => jb.classList.remove('on')));
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    window.addEventListener('keydown', (e) => { if (map[e.code]) { input.keys[map[e.code]] = true; e.preventDefault(); } if (e.code === 'Space') { if (!e.repeat) input.jump = 0.15; e.preventDefault(); } if (e.code === 'Escape' && mode === 'play') pause(); });
    window.addEventListener('keyup', (e) => { if (map[e.code]) input.keys[map[e.code]] = false; });
  }
  let prevMode = 'play';
  function pause() { if (mode !== 'play') return; prevMode = mode; mode = 'pause'; $('pause').classList.remove('hidden'); }
  function resume() { $('pause').classList.add('hidden'); mode = prevMode; }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!loaded) return;
    const rot = !$('rotate').classList.contains('hidden');
    if (mode !== 'pause' && mode !== 'menu' && !rot) update(dt);
    else if (mode === 'menu') { const t = clock.elapsedTime; for (const h of hammers) h.piv.rotation.z = Math.sin(t * h.w + h.ph) * h.amp; for (const s of sweepers) s.g.rotation.y += s.w * dt; if (player) { player.ch.mixer.update(dt); carryPose(player.ch); } updateCamera(dt); }
    renderer.render(scene, camera);
  }

  function init() {
    detectLang(); initThree(); setupInput();
    const loader = new T.GLTFLoader(); let left = 2;
    const done = () => {
      if (--left) return;
      loaded = true;
      buildLevel(save.level);
      player = Object.assign(makeBody(PH.hw, PH.h), { ch: makeCourier(), yaw: 0 }); parcel = makeParcel();
      resetPlayerAt(checkpoint); play(player.ch, 'Idle'); player.ch.root.position.copy(player.pos); updateParcel(0);
      camera.position.set(0, 6, checkpoint.z - 9); $('lvl').textContent = save.level; $('coins').textContent = save.coins;
      const b = $('btn-play'); b.disabled = false; b.textContent = L.play;
    };
    const fail = (e) => { console.error(e); $('btn-play').textContent = 'Error'; };
    const kitDone = (g) => {
      let rootG = g.scene; if (rootG.children.length === 1 && !rootG.children[0].isMesh) rootG = rootG.children[0];
      rootG.children.forEach((c) => { K[c.name] = c; c.traverse((m) => { if (m.isMesh && m.material.map) m.material.map.encoding = T.sRGBEncoding; }); });
      done();
    };
    const courierDone = (g) => { courierTmpl = g.scene; courierClips = g.animations; g.scene.traverse((m) => { if (m.isMesh && m.material.map) m.material.map.encoding = T.sRGBEncoding; }); done(); };
    const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    if (window.KIT_GLB_B64) loader.parse(b64(window.KIT_GLB_B64), '', kitDone, fail); else loader.load('assets/kit.glb', kitDone, undefined, fail);
    if (window.COURIER_GLB_B64) loader.parse(b64(window.COURIER_GLB_B64), '', courierDone, fail); else loader.load('assets/courier.glb', courierDone, undefined, fail);

    $('btn-play').addEventListener('click', () => { if (window.GameAudio) GameAudio.sfx('click'); startLevel(); });
    $('btn-next').addEventListener('click', () => { $('end').classList.add('hidden'); window.YSDK.showFullscreen(startLevel); });
    $('btn-retry').addEventListener('click', () => { $('end').classList.add('hidden'); if (mode === 'win') save.level = Math.max(1, save.level - 1); window.YSDK.showFullscreen(startLevel); });
    $('btn-pause').addEventListener('click', pause);
    $('btn-resume').addEventListener('click', resume);
    $('btn-restart').addEventListener('click', () => { $('pause').classList.add('hidden'); startLevel(); });
    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);
    loop();

    window.__deliv = {
      ready: () => loaded, start: startLevel,
      state: () => ({ vz: +player.vel.z.toFixed(2), mode, level: save.level, z: +player.pos.z.toFixed(2), y: +player.pos.y.toFixed(2), x: +player.pos.x.toFixed(2), carrying, parcel: parcel.state, coins: save.coins, stun: +stun.toFixed(2), finishZ }),
      teleport: (x, y, z) => { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
      move: (x, y) => { input.x = x; input.y = y; }, jump: () => { input.jump = 0.15; },
      hit: () => hitPlayer(new T.Vector3(1, 0, 0.2)), cam: () => camera.position.toArray(),
      setLevel: (n) => { save.level = n; }, carry: CARRY, objs: () => ({ hammers: hammers.length, sweepers: sweepers.length, movers: movers.length, fallers: fallers.length, springs: springs.length, flags: flags.length }),
      hammerZ: () => hammers.map((h) => h.piv.position.z), sweeperZ: () => sweepers.map((s) => s.g.position.z), springZ: () => springs.map((s) => s.obj.position.z), moverZ: () => movers.map((s) => s.base.z), fallZ: () => fallers.map((s) => s.home.z),
    };
  }

  window.addEventListener('load', async () => {
    try { await window.YSDK.init(); } catch (e) {}
    try { init(); } catch (e) { console.error('init fail', e); }
    try { window.YSDK.gameReady(); } catch (e) {}
  });
})();
