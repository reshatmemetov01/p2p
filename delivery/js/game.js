/* =========================================================================
   Crazy Delivery — курьер доставляет посылку через хаотичный город.
   Модели: KayKit City Builder Bits + Character Pack Adventurers (CC0).
   Город собирается из тайлов 2×2 (масштаб S), статичная геометрия
   объединяется в несколько мешей (быстро на телефонах).
   Машины ездят по полосам и слушаются светофоров. Сбили — посылка летит.
   Посылку переехала машина или она упала в люк — проигрыш.
   ========================================================================= */
(function () {
  'use strict';
  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'delivery_city_v1';

  // ---- Языки ----
  const TEXTS = {
    en: { level: 'Level', loading: 'Loading…', play: 'Play!', intro: 'Deliver the parcel across the crazy city! Watch out for cars and open manholes.',
      ctrl: 'Left side: move · Right button: jump · PC: WASD + Space', dropped: 'Parcel dropped! Pick it up!', cont: 'Continue (watch ad)',
      next: 'Next delivery ▶', retry: 'Retry', paused: 'Paused', resume: 'Resume', restart: 'Restart level', rotate: 'Rotate your device',
      delivered: 'Delivered!', crushed: 'Parcel crushed!', crushedText: 'A car ran over your parcel…', fell: 'Parcel lost!', fellText: 'Your parcel fell into a manhole…',
      double: 'Double coins (watch ad)', winText: (c, t) => 'Coins: +' + c + ' · Time: ' + t + 's',
      pickup: '📦 Pick up the parcel! Follow the red arrow', eagleWarn: '🦅 Eagle! Move away!', eagleStole: '🦅 The eagle stole your parcel!', dogBit: '🐕 The dog grabbed your parcel!', slip: '🍌 Oops! Banana peel!', splash: '💦 Splash!', dogChase: '🐕 Run! Jump on something!' },
    ru: { level: 'Уровень', loading: 'Загрузка…', play: 'Играть!', intro: 'Доставь посылку через безумный город! Берегись машин и открытых люков.',
      ctrl: 'Слева — движение · Кнопка справа — прыжок · ПК: WASD + Пробел', dropped: 'Посылка упала! Подбери её!', cont: 'Продолжить за рекламу',
      next: 'Следующая доставка ▶', retry: 'Заново', paused: 'Пауза', resume: 'Продолжить', restart: 'Начать уровень заново', rotate: 'Поверни телефон',
      delivered: 'Доставлено!', crushed: 'Посылку раздавили!', crushedText: 'Машина переехала посылку…', fell: 'Посылка потеряна!', fellText: 'Посылка упала в люк…',
      double: 'Удвоить монеты (реклама)', winText: (c, t) => 'Монеты: +' + c + ' · Время: ' + t + ' с',
      pickup: '📦 Подними посылку! Беги по красной стрелке', eagleWarn: '🦅 Орёл! Уходи с тени!', eagleStole: '🦅 Орёл украл посылку!', dogBit: '🐕 Собака выбила посылку!', slip: '🍌 Ой! Банановая кожура!', splash: '💦 Окатило водой!', dogChase: '🐕 Беги! Запрыгни повыше!' },
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

  let save = { level: 1, coins: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ---- Масштаб и карта ----
  const S = 3.4, TILE = 2 * S, N = 15, WALK = 0.1 * S, LANE = 0.35 * S;
  let GROUND = 0.05 * S; // высота асфальта (уточняется по модели)
  const isRoad = (i) => i % 4 === 3;
  const tileX = (i) => (i - (N - 1) / 2) * TILE, tileZ = (j) => (j - (N - 1) / 2) * TILE;
  const HALF = (N * TILE) / 2;
  const G = 32, JUMP_V = 11, SPEED = 6.4, COURIER_H = 1.3;
  const PH = { hw: 0.3, h: 1.25 }, BOX = { hw: 0.22, h: 0.44 };

  let renderer, scene, camera, sun; const clock = new T.Clock();
  const K = {}; let cityMat, fadeMat, courierTmpl = null, courierClips = [];
  let loaded = false, mode = 'menu', dogTmpl = null, dogClips = [];
  let dogs = [], bananas = [], jets = [], eagle = null;
  let solids = [], blocks = [], holes = [], cars = [], lights = { t: 0, phase: 0 }, coinsArr = [], fx = [], levelObjs = [];
  let targetFwd = [0, 1], target = null, startPos = null, levelTime = 0, runCoins = 0, lostReason = 'fell';
  let player = null, parcel = null, gps = null, ring = null, marker = null;
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpBox = new T.Box3();

  function texCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; }
  function rngFor(level) { let s = level * 7919 + 101; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // ---- Three.js ----
  function initThree() {
    renderer = new T.WebGLRenderer({ canvas: $('game'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputEncoding = T.sRGBEncoding;
    scene = new T.Scene();
    scene.background = texCanvas(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5fb4ff'); g.addColorStop(0.65, '#bfe6ff'); g.addColorStop(1, '#fff1d6'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    scene.fog = new T.Fog(0xd8eefc, 55, 130);
    camera = new T.PerspectiveCamera(50, 1, 0.3, 260);
    scene.add(new T.HemisphereLight(0xe8f4ff, 0x8a7a6a, 0.8));
    sun = new T.DirectionalLight(0xfff4e0, 0.9); sun.position.set(-10, 25, -6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 }); sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);
    // земля вокруг города
    const gm = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshLambertMaterial({ color: 0x8fcf6a }));
    gm.rotation.x = -Math.PI / 2; gm.position.y = -0.05; gm.receiveShadow = true; scene.add(gm);
    window.addEventListener('resize', onResize); onResize();
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.3 ? 64 : 50; camera.updateProjectionMatrix();
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    $('rotate').classList.toggle('hidden', !(touch && h > w));
  }

  // ---- Сборка статичной геометрии ----
  // Кладём модель в «пакет» (без добавления в сцену), потом объединяем пакет в один меш.
  function batch() { return { geos: [] }; }
  const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _sc = new T.Vector3();
  function addTo(b, name, x, y, z, ry, s) {
    const t = K[name]; if (!t) return;
    _m4.compose(tmpV.set(x, y, z), _q.setFromAxisAngle(tmpV2.set(0, 1, 0), ry || 0), _sc.setScalar(s || S));
    t.updateMatrixWorld(true);
    t.traverse((m) => {
      if (!m.isMesh) return;
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      g.applyMatrix4(m.matrixWorld); g.applyMatrix4(_m4); b.geos.push(g);
    });
  }
  function flush(b, opts) {
    if (!b.geos.length) return null;
    const g = T.BufferGeometryUtils.mergeBufferGeometries(b.geos, false); b.geos.forEach((x) => x.dispose());
    const m = new T.Mesh(g, cityMat); m.castShadow = !!(opts && opts.cast); m.receiveShadow = true;
    scene.add(m); levelObjs.push(m); return m;
  }
  // AABB «тела» дома: вершины на высоте первого этажа (без тротуара и козырьков)
  const bodyBoxCache = {};
  function bodyBoxOf(name) {
    if (bodyBoxCache[name]) return bodyBoxCache[name];
    const bb = new T.Box3(); K[name].updateMatrixWorld(true);
    K[name].traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { tmpV.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (tmpV.y > 0.4 && tmpV.y < 0.6) bb.expandByPoint(tmpV); } });
    return (bodyBoxCache[name] = bb);
  }
  function solidBox(minX, minY, minZ, maxX, maxY, maxZ, kind) { const s = { box: new T.Box3(new T.Vector3(minX, minY, minZ), new T.Vector3(maxX, maxY, maxZ)), kind: kind || 'static', active: true }; solids.push(s); return s; }
  function rotBox(bb, x, z, ry, s, y0, h) { // повернуть AABB модели на ry (кратно 90°) и поставить в (x,z)
    const pts = [[bb.min.x, bb.min.z], [bb.max.x, bb.max.z]].map(([a, c]) => { const ca = Math.cos(ry), sa = Math.sin(ry); return [x + (a * ca + c * sa) * s, z + (-a * sa + c * ca) * s]; });
    return solidBox(Math.min(pts[0][0], pts[1][0]), y0, Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), y0 + h, Math.max(pts[0][1], pts[1][1]));
  }

  // ---- Город ----
  function clearLevel() {
    levelObjs.forEach((o) => { scene.remove(o); if (o.geometry) o.geometry.dispose(); }); levelObjs = [];
    solids = []; blocks = []; holes = []; coinsArr = []; cars.forEach((c) => scene.remove(c.obj)); cars = [];
    fx.forEach((f) => scene.remove(f.m)); fx = [];
    dogs.forEach((d) => scene.remove(d.obj)); dogs = []; bananas = []; jets = [];
    if (eagle) { eagle.state = 'off'; eagle.g.visible = false; eagle.shadow.visible = false; eagle.timer = 14; }
  }
  const BUILD = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
  const DIRS = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

  function buildCity(level) {
    clearLevel();
    const R = rngFor(level);
    const roads = batch(), props = batch();
    const fronts = []; // места у дверей: {x,z,ry,dir}
    // дороги
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = tileX(i), z = tileZ(j), ri = isRoad(i), rj = isRoad(j);
      if (ri && rj) addTo(roads, 'road_junction', x, 0, z, 0);
      else if (ri) addTo(roads, (j % 4 === 2 || j % 4 === 0) ? 'road_straight_crossing' : 'road_straight', x, 0, z, 0); // вдоль z
      else if (rj) addTo(roads, (i % 4 === 2 || i % 4 === 0) ? 'road_straight_crossing' : 'road_straight', x, 0, z, Math.PI / 2); // вдоль x
    }
    // кварталы
    for (let bi = 0; bi < N; bi += 4) for (let bj = 0; bj < N; bj += 4) {
      for (let di = 0; di < 3; di++) for (let dj = 0; dj < 3; dj++) {
        const i = bi + di, j = bj + dj; if (i >= N || j >= N) continue;
        const x = tileX(i), z = tileZ(j);
        // в какую сторону дорога
        const opts = [];
        if (j + 1 < N && isRoad(j + 1)) opts.push('+z'); if (j - 1 >= 0 && isRoad(j - 1)) opts.push('-z');
        if (i + 1 < N && isRoad(i + 1)) opts.push('+x'); if (i - 1 >= 0 && isRoad(i - 1)) opts.push('-x');
        if (!opts.length) { // внутренний двор
          addTo(props, 'base', x, 0, z, 0);
          for (let k = 0; k < 5; k++) addTo(props, 'bush', x + (R() - 0.5) * 4.5, WALK, z + (R() - 0.5) * 4.5, R() * 6, S * (1.2 + R()));
          addTo(props, 'watertower', x, WALK, z, 0, S * 1.3);
          continue;
        }
        const d = opts[Math.floor(R() * opts.length)], ry = DIRS[d], name = BUILD[Math.floor(R() * BUILD.length)];
        const bo = K[name].clone(); bo.scale.setScalar(S); bo.position.set(x, 0, z); bo.rotation.y = ry; bo.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(bo); levelObjs.push(bo);
        const body = bodyBoxOf(name), top = K[name] ? new T.Box3().setFromObject(K[name]).max.y * S : 6;
        const s = rotBox(body, x, z, ry, S, WALK, top); blocks.push({ mesh: bo, box: new T.Box3().setFromObject(bo), faded: false });
        // место у двери (перед фасадом, на тротуаре)
        const fwd = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] }[d];
        const faceDist = fwd[0] > 0 ? s.box.max.x - x : fwd[0] < 0 ? x - s.box.min.x : fwd[1] > 0 ? s.box.max.z - z : z - s.box.min.z;
        const fd = Math.min(faceDist + 0.75, TILE / 2 - 0.35); fronts.push({ x: x + fwd[0] * fd, z: z + fwd[1] * fd, ry, fwd, i, j });
        // мелочи на тротуаре
        const side = [-fwd[1], fwd[0]], edge = TILE / 2 - 0.55;
        if (R() < 0.35) { const sx = x + fwd[0] * edge + side[0] * 2.2, sz = z + fwd[1] * edge + side[1] * 2.2; addTo(props, 'streetlight', sx, WALK, sz, ry + Math.PI, S * 1.5); solidBox(sx - 0.15, WALK, sz - 0.15, sx + 0.15, 5, sz + 0.15); }
        else if (R() < 0.3) { const sx = x + fwd[0] * edge - side[0] * 2, sz = z + fwd[1] * edge - side[1] * 2; addTo(props, 'firehydrant', sx, WALK, sz, ry, S * 1.4); solidBox(sx - 0.2, WALK, sz - 0.2, sx + 0.2, WALK + 0.45, sz + 0.2); }
        if (R() < 0.25) { const sx = x + fwd[0] * (fd - 0.2) + side[0] * 2.4, sz = z + fwd[1] * (fd - 0.2) + side[1] * 2.4; addTo(props, 'dumpster', sx, WALK, sz, ry, S * 1.3);
          const hw = 0.28 * S * 1.3, hd = 0.18 * S * 1.3; const ax = fwd[0] ? hd : hw, az = fwd[0] ? hw : hd; solidBox(sx - ax, WALK, sz - az, sx + ax, WALK + 0.32 * S * 1.3, sz + az); }
        if (R() < 0.3) for (let k = 0; k < 3; k++) { const sx = x + fwd[0] * (fd - 0.3) - side[0] * (1.6 + k * 0.5), sz = z + fwd[1] * (fd - 0.3) - side[1] * (1.6 + k * 0.5); addTo(props, R() < 0.5 ? 'box_A' : 'box_B', sx, WALK, sz, R() * 3, S * 1.6); }
      }
      { const x0 = tileX(bi) - TILE / 2, z0 = tileZ(bj) - TILE / 2, x1 = tileX(Math.min(bi + 2, N - 1)) + TILE / 2, z1 = tileZ(Math.min(bj + 2, N - 1)) + TILE / 2; solidBox(x0, 0, z0, x1, WALK, z1, 'walk'); }
    }
    // светофоры на перекрёстках
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (isRoad(i) && isRoad(j)) {
      const x = tileX(i), z = tileZ(j), o = TILE / 2 + 0.4;
      [[o, o, Math.PI], [-o, -o, 0]].forEach(([dx, dz, r]) => { addTo(props, 'trafficlight_B', x + dx, WALK, z + dz, r, S * 1.6); solidBox(x + dx - 0.15, GROUND, z + dz - 0.15, x + dx + 0.15, 4, z + dz + 0.15); });
    }
    const ring2 = batch();
    for (let i = -2; i < N + 2; i++) for (let j = -2; j < N + 2; j++) {
      if (i >= 0 && i < N && j >= 0 && j < N) continue;
      const x = tileX(i), z = tileZ(j);
      if (isRoad(i) && j >= -2 && (j < 0 || j >= N) && i >= 0 && i < N) { addTo(roads, 'road_straight', x, 0, z, 0); continue; } // дороги уходят за край
      if (isRoad(j) && (i < 0 || i >= N) && j >= 0 && j < N) { addTo(roads, 'road_straight', x, 0, z, Math.PI / 2); continue; }
      const d = i < 0 ? '+x' : i >= N ? '-x' : j < 0 ? '+z' : '-z';
      addTo(ring2, BUILD[Math.floor(R() * BUILD.length)], x, 0, z, DIRS[d]);
    }
    flush(roads, { cast: false }); flush(props, { cast: true }); flush(ring2, { cast: false });
    // границы карты
    const W = HALF + 0.5; solidBox(-W - 1, 0, -W - 1, -W, 20, W + 1); solidBox(W, 0, -W - 1, W + 1, 20, W + 1); solidBox(-W - 1, 0, -W - 1, W + 1, 20, -W); solidBox(-W - 1, 0, W, W + 1, 20, W + 1);

    // ---- задание: старт и адрес ----
    const sorted = fronts.slice();
    const st = sorted[Math.floor(R() * sorted.length)];
    const want = Math.min(4 + level * 1.2, 15); // в тайлах
    let best = null, bd = 1e9;
    for (const f of fronts) { const d = Math.abs(Math.abs(f.i - st.i) + Math.abs(f.j - st.j) - want) + R() * 0.5; if (f !== st && d < bd) { bd = d; best = f; } }
    startPos = new T.Vector3(st.x, WALK, st.z);
    target = new T.Vector3(best.x, WALK, best.z); targetFwd = best.fwd;
    // фургон у старта
    const van = K.car_stationwagon.clone(); van.scale.setScalar(S); van.position.set(st.x + st.fwd[0] * (TILE / 2 + 0.2) - st.fwd[1] * 2.6 + st.fwd[0] * 1.8, GROUND + 0.06 * S, st.z + st.fwd[1] * (TILE / 2 + 0.2) + st.fwd[0] * 2.6 + st.fwd[1] * 1.8);
    van.rotation.y = st.ry + Math.PI / 2; van.traverse((m) => { if (m.isMesh) { m.castShadow = true; } }); scene.add(van); levelObjs.push(van);
    // кольцо и маркер у двери
    if (!ring) {
      ring = new T.Mesh(new T.RingGeometry(1.0, 1.35, 40), new T.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const mk = new T.Group(); const mm = new T.MeshLambertMaterial({ color: 0x3dff7a, emissive: 0x1a8a3a });
      const cone = new T.Mesh(new T.ConeGeometry(0.6, 1.1, 4), mm); cone.rotation.x = Math.PI; mk.add(cone);
      const bar = new T.Mesh(new T.BoxGeometry(0.42, 0.9, 0.42), mm); bar.position.y = 0.95; mk.add(bar); marker = mk; scene.add(mk);
      const ag = new T.Group(); const am = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a6a00 });
      const head = new T.Mesh(new T.ConeGeometry(0.32, 0.6, 3), am); head.rotation.x = Math.PI / 2; head.position.z = 0.5; ag.add(head);
      const tail = new T.Mesh(new T.BoxGeometry(0.18, 0.08, 0.55), am); tail.position.z = 0.0; ag.add(tail); gps = ag; scene.add(ag);
    }
    ring.position.set(target.x, WALK + 0.04, target.z); marker.position.set(target.x, WALK + 4.2, target.z);
    // люки
    const nh = Math.min(2 + level, 12);
    for (let k = 0; k < nh; k++) {
      const vertical = R() < 0.5, ri = 3 + 4 * Math.floor(R() * 3), along = Math.floor(R() * N); if (isRoad(along)) continue;
      const lane = (R() < 0.5 ? -1 : 1) * LANE;
      const x = vertical ? tileX(ri) + lane : tileX(along) + (R() - 0.5) * 3, z = vertical ? tileZ(along) + (R() - 0.5) * 3 : tileZ(ri) + lane;
      if (Math.hypot(x - startPos.x, z - startPos.z) < 6 || Math.hypot(x - target.x, z - target.z) < 4) continue;
      addHole(x, z);
    }
    // монеты вдоль пути (по прямой к цели, в обход домов не считаем — просто на дорогах рядом)
    for (let k = 0; k < 14; k++) {
      const vertical = R() < 0.5, ri = 3 + 4 * Math.floor(R() * 3), along = (R() - 0.5) * (N - 1) * TILE;
      const x = vertical ? tileX(ri) + (R() - 0.5) * 2 : along, z = vertical ? along : tileZ(ri) + (R() - 0.5) * 2;
      if (holes.some((h) => Math.hypot(h.x - x, h.z - z) < 1.5)) continue;
      const o = new T.Mesh(coinGeo || (coinGeo = new T.CylinderGeometry(0.42, 0.42, 0.12, 20).rotateX(Math.PI / 2)), coinMat || (coinMat = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a5a00 })));
      o.castShadow = true; o.position.set(x, GROUND + 0.9, z); scene.add(o); levelObjs.push(o); coinsArr.push({ o, taken: false });
    }
    // машины
    spawnCars(level, R);
    spawnChaos(level, R, fronts);
  }
  function addHole(x, z) {
    const tex = texCanvas(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, '#000'); g.addColorStop(0.75, '#141414'); g.addColorStop(0.86, '#555'); g.addColorStop(1, '#888'); c.fillStyle = g; c.beginPath(); c.arc(32, 32, 31, 0, 7); c.fill(); });
    const m = new T.Mesh(new T.CircleGeometry(0.95, 24), new T.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, GROUND + 0.015, z); scene.add(m); levelObjs.push(m);
    const lid = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.08, 18), new T.MeshLambertMaterial({ color: 0x5a5f66 })); lid.position.set(x + 1.3, GROUND + 0.04, z + 0.4); lid.castShadow = true; scene.add(lid); levelObjs.push(lid);
    for (let k = 0; k < 2; k++) { const c = K.cone ? K.cone.clone() : null; if (!c) break; c.scale.setScalar(1.6); c.position.set(x + (k ? -1.2 : 1.1), GROUND, z + (k ? 1 : -1.1)); scene.add(c); levelObjs.push(c); }
    holes.push({ x, z, r: 0.75 });
  }
  let coinGeo = null, coinMat = null;
  const inHole = (x, z) => holes.some((h) => (x - h.x) * (x - h.x) + (z - h.z) * (z - h.z) < h.r * h.r);

  // ---- Машины ----
  const CAR_TYPES = ['car_sedan', 'car_hatchback', 'car_taxi', 'car_police', 'car_stationwagon'];
  function spawnCars(level, R) {
    const lines = []; for (let r = 3; r < N; r += 4) for (const ax of ['x', 'z']) for (const dir of [1, -1]) lines.push({ ax, r, dir });
    const per = Math.min(1 + Math.floor(level / 3), 3);
    const len = N * TILE + 10;
    for (const ln of lines) for (let k = 0; k < per; k++) {
      const type = CAR_TYPES[Math.floor(R() * CAR_TYPES.length)], obj = K[type].clone(); obj.scale.setScalar(S);
      obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(obj);
      const c = { obj, ax: ln.ax, dir: ln.dir, line: (ln.ax === 'x' ? tileZ(ln.r) : tileX(ln.r)) - ln.dir * LANE * (ln.ax === 'x' ? -1 : 1),
        s: -len / 2 + ((k + R() * 0.6) / per) * len, v: 0, vmax: 6.5 + R() * 2 + Math.min(level * 0.15, 3), half: 0.47 * S, hw: 0.21 * S };
      cars.push(c);
    }
  }
  function lightGreen(ax) { return lights.phase === (ax === 'z' ? 0 : 2); } // 0: z-зелёный, 1: все красные, 2: x-зелёный, 3: все красные
  function updateLights(dt) { lights.t += dt; const dur = [6, 1.4, 6, 1.4][lights.phase]; if (lights.t > dur) { lights.t = 0; lights.phase = (lights.phase + 1) % 4; } }
  function updateCars(dt) {
    const len = N * TILE + 10;
    for (const c of cars) {
      // ограничение: машина впереди в той же полосе
      let limit = Infinity;
      for (const o of cars) if (o !== c && o.ax === c.ax && o.dir === c.dir && Math.abs(o.line - c.line) < 0.5) { const d = (o.s - c.s) * c.dir; if (d > 0 && d < limit) limit = d; }
      let want = c.vmax;
      if (limit < 4.6) want = 0; else if (limit < 8) want = Math.min(want, (limit - 4.6) * 2);
      // светофор: стоп-линия перед ближайшим перекрёстком
      if (!lightGreen(c.ax)) {
        for (let r = 3; r < N; r += 4) {
          const cpos = c.ax === 'x' ? tileX(r) : tileZ(r), stop = cpos - c.dir * (TILE / 2 + 0.6);
          const front = c.s + c.dir * c.half, d = (stop - front) * c.dir;
          if (d > -0.3 && d < 6) { want = Math.min(want, Math.max(0, d) * 1.6); }
        }
      }
      c.v += Math.max(-14 * dt, Math.min(6 * dt, want - c.v));
      c.s += c.v * c.dir * dt;
      if (c.s * c.dir > len / 2) c.s = -c.dir * len / 2;
      const o = c.obj;
      if (c.ax === 'x') { o.position.set(c.s, GROUND + 0.06 * S, c.line); o.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { o.position.set(c.line, GROUND + 0.06 * S, c.s); o.rotation.y = c.dir > 0 ? 0 : Math.PI; }
    }
  }
  function carBox(c, out) {
    const hx = c.ax === 'x' ? c.half : c.hw, hz = c.ax === 'x' ? c.hw : c.half, p = c.obj.position;
    out.min.set(p.x - hx, GROUND, p.z - hz); out.max.set(p.x + hx, GROUND + 1.3, p.z + hz); return out;
  }


  // ---- Хаос: собаки, орёл, банановые кожуры, сломанные гидранты ----
  function showAlert(text, sec) { const a = $('parcel-alert'); a.textContent = text; a.classList.remove('hidden'); a.style.animation = 'none'; void a.offsetWidth; a.style.animation = ''; alertT = sec || 2.2; }
  const far = (x, z, d) => Math.hypot(x - startPos.x, z - startPos.z) > d && Math.hypot(x - target.x, z - target.z) > d;
  function spawnChaos(level, R, fronts) {
    const pick = (n, minD) => { const out = []; for (let k = 0; k < 60 && out.length < n; k++) { const f = fronts[Math.floor(R() * fronts.length)]; if (far(f.x, f.z, minD) && out.indexOf(f) < 0) out.push(f); } return out; };
    // собаки — сидят у дверей
    pick(Math.min(1 + Math.floor(level / 3), 4), 12).forEach((f) => {
      const obj = T.SkeletonUtils.clone(dogTmpl); obj.scale.setScalar(1.5 / 690);
      obj.traverse((m) => { if (m.isMesh) { m.material = dogMat; m.castShadow = true; m.frustumCulled = false; } }); scene.add(obj);
      const mixer = new T.AnimationMixer(obj), act = {}; dogClips.forEach((c) => { act[/Walk/.test(c.name) ? 'walk' : 'idle'] = mixer.clipAction(c); }); act.idle.play();
      const body = makeBody(0.35, 0.6); body.pos.set(f.x - f.fwd[1] * 1.5, WALK, f.z + f.fwd[0] * 1.5);
      dogs.push({ obj, mixer, act, cur: 'idle', body, home: body.pos.clone(), side: [-f.fwd[1], f.fwd[0]], state: 'home', t: 0, cd: 0, yaw: Math.atan2(f.fwd[0], f.fwd[1]) });
    });
    // банановые кожуры — на тротуарах и дорогах
    const nb = Math.min(6 + level, 16);
    for (let k = 0; k < nb * 3 && bananas.length < nb; k++) {
      const vertical = R() < 0.5, ri = 3 + 4 * Math.floor(R() * 3), along = (R() - 0.5) * (N - 2) * TILE;
      const off = (R() < 0.5 ? -1 : 1) * (R() < 0.5 ? LANE * 0.6 : TILE / 2 + 0.9);
      const x = vertical ? tileX(ri) + off : along, z = vertical ? along : tileZ(ri) + off;
      if (!far(x, z, 6) || inHole(x, z)) continue;
      const g = new T.Group(); g.add(new T.Mesh(bananaGeo, bananaMat)); const tip = new T.Mesh(new T.ConeGeometry(0.06, 0.18, 5), new T.MeshLambertMaterial({ color: 0x6a4a1a })); tip.position.set(0.3, 0.03, 0); tip.rotation.z = -Math.PI / 2; g.add(tip);
      for (let q = 0; q < 3; q++) { const fl = new T.Mesh(new T.ConeGeometry(0.07, 0.3, 4), bananaMat); fl.position.set(-0.3, 0.03, (q - 1) * 0.12); fl.rotation.set(0, (q - 1) * 0.6, Math.PI / 2 + 0.3); g.add(fl); }
      g.position.set(x, (Math.abs(off) > LANE + 0.5 ? WALK : GROUND) + 0.05, z); g.rotation.y = R() * 6.28; g.scale.setScalar(1.3);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(g); levelObjs.push(g); bananas.push({ g, on: true, vertical });
    }
    // сломанные гидранты — бьют струёй в сторону дороги
    pick(Math.min(2 + Math.floor(level / 2), 7), 9).forEach((f, k) => {
      const x = f.x + f.fwd[0] * 1.9 - f.fwd[1] * 1.2, z = f.z + f.fwd[1] * 1.9 + f.fwd[0] * 1.2;
      const h = K.firehydrant.clone(); h.scale.setScalar(S * 1.5); h.position.set(x, WALK, z); h.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(h); levelObjs.push(h);
      solidBox(x - 0.22, WALK, z - 0.22, x + 0.22, WALK + 0.5, z + 0.22);
      const drops = []; const jg = new T.Group(); scene.add(jg); levelObjs.push(jg);
      for (let q = 0; q < 26; q++) { const d = new T.Mesh(dropGeo, dropMat); jg.add(d); drops.push(d); }
      jets.push({ x, z, dir: new T.Vector3(f.fwd[0], 0, f.fwd[1]), drops, jg, t: k * 1.7, on: false, len: 5.5 });
    });
  }
  let bananaGeo = null, bananaMat = null, dropGeo = null, dropMat = null, dogMat = null;
  function chaosAssets() {
    bananaGeo = new T.TorusGeometry(0.3, 0.075, 6, 14, Math.PI).rotateX(Math.PI / 2); bananaMat = new T.MeshLambertMaterial({ color: 0xffd93b, emissive: 0x3a2e00 });
    dropGeo = new T.SphereGeometry(0.16, 6, 5); dropMat = new T.MeshLambertMaterial({ color: 0x9fdcff, emissive: 0x2a6a9a, transparent: true, opacity: 0.85 });
    dogMat = new T.MeshLambertMaterial({ color: 0xb8814a, skinning: true });
    // орёл (лёгкая мультяшная модель)
    const g = new T.Group(), brown = new T.MeshLambertMaterial({ color: 0x6b4426 }), white = new T.MeshLambertMaterial({ color: 0xffffff }), yellow = new T.MeshLambertMaterial({ color: 0xffc23a });
    const body = new T.Mesh(new T.SphereGeometry(0.5, 12, 10), brown); body.scale.set(0.8, 0.7, 1.3); g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.33, 12, 10), white); head.position.set(0, 0.25, 0.68); g.add(head);
    const beak = new T.Mesh(new T.ConeGeometry(0.12, 0.34, 8), yellow); beak.rotation.x = Math.PI / 2 + 0.4; beak.position.set(0, 0.17, 1.0); g.add(beak);
    [-1, 1].forEach((sd) => { const e = new T.Mesh(new T.SphereGeometry(0.06, 6, 5), new T.MeshBasicMaterial({ color: 0x111111 })); e.position.set(sd * 0.17, 0.33, 0.9); g.add(e); });
    const tail = new T.Mesh(new T.BoxGeometry(0.5, 0.06, 0.5), white); tail.position.set(0, 0, -0.75); tail.rotation.x = -0.2; g.add(tail);
    const wings = [-1, 1].map((sd) => { const piv = new T.Group(); piv.position.set(sd * 0.32, 0.12, 0); const w = new T.Mesh(new T.BoxGeometry(1.5, 0.06, 0.62), brown); w.position.x = sd * 0.78; piv.add(w);
      const tipw = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.45), new T.MeshLambertMaterial({ color: 0x3e2614 })); tipw.position.x = sd * 1.7; piv.add(tipw); g.add(piv); return piv; });
    [-1, 1].forEach((sd) => { const c = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.35, 5), yellow); c.position.set(sd * 0.15, -0.4, 0.1); g.add(c); });
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); g.scale.setScalar(1.35); g.visible = false; scene.add(g);
    const sh = new T.Mesh(new T.CircleGeometry(1.3, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.visible = false; scene.add(sh);
    eagle = { g, wings, shadow: sh, state: 'off', t: 0, timer: 14, lock: new T.Vector3(), from: new T.Vector3(), to: new T.Vector3(), drop: new T.Vector3() };
  }
  function setDogAnim(d, n) { if (d.cur === n) return; d.act[n].reset().play(); d.act[d.cur].crossFadeTo(d.act[n], 0.15, false); d.cur = n; }
  function updateDogs(dt) {
    for (const d of dogs) {
      const b = d.body, p = player.pos; const dx = p.x - b.pos.x, dz = p.z - b.pos.z, dist = Math.hypot(dx, dz);
      let vx = 0, vz = 0; if (d.cd > 0) d.cd -= dt;
      if (d.state === 'home') { if (mode === 'play' && carrying && dist < 9 && d.cd <= 0 && stun <= 0) { d.state = 'chase'; showAlert(L.dogChase, 1.6); bark(); } }
      else if (d.state === 'chase') {
        const high = p.y > WALK + 0.5 && player.grounded;
        if (!carrying || mode !== 'play') d.state = 'return';
        else if (high) { d.state = 'bark'; d.t = 2.4; bark(); }
        else { vx = dx / (dist || 1) * 7.3; vz = dz / (dist || 1) * 7.3; if (dist < 0.95 && stun <= 0) { hitPlayer(new T.Vector3(dx, 0, dz).normalize(), 4.5); showAlert(L.dogBit); bark(); d.state = 'return'; d.cd = 9; } }
        if (Math.hypot(b.pos.x - d.home.x, b.pos.z - d.home.z) > 26) d.state = 'return';
      } else if (d.state === 'bark') { d.t -= dt; d.yaw = Math.atan2(dx, dz); b.pos.y = WALK + Math.abs(Math.sin(d.t * 14)) * 0.12; if (d.t <= 0) { d.state = 'return'; d.cd = 5; } if ((d.t * 3 | 0) !== ((d.t + dt) * 3 | 0)) bark(); }
      else if (d.state === 'return') { const hx = d.home.x - b.pos.x, hz = d.home.z - b.pos.z, hd = Math.hypot(hx, hz); if (hd < 0.4) d.state = 'home'; else { vx = hx / hd * 3.6; vz = hz / hd * 3.6; } }
      b.vel.x = vx; b.vel.z = vz; b.vel.y -= G * dt; moveBody(b, dt); if (b.pos.y < GROUND - 3) b.pos.copy(d.home);
      if (vx || vz) d.yaw = Math.atan2(vx, vz);
      setDogAnim(d, vx || vz ? 'walk' : 'idle'); d.act.walk.timeScale = d.state === 'chase' ? 2.6 : 1.4;
      d.obj.position.copy(b.pos); d.obj.rotation.y = d.yaw - Math.PI / 2; d.mixer.update(dt);
    }
  }
  function bark() { if (!window.GameAudio || !GameAudio.ctx || !GameAudio.on) return; const t = GameAudio.ctx.currentTime; GameAudio.tone(420, t, 0.09, 'square', 0.35); GameAudio.tone(300, t + 0.08, 0.1, 'square', 0.3); }
  function slipCheck() {
    if (stun > 0 || !player.grounded) return;
    for (const bn of bananas) {
      if (!bn.on || Math.hypot(bn.g.position.x - player.pos.x, bn.g.position.z - player.pos.z) > 0.6) continue;
      bn.on = false; bn.g.visible = false;
      const hs = Math.hypot(player.vel.x, player.vel.z); const dir = hs > 0.5 ? new T.Vector3(player.vel.x / hs, 0, player.vel.z / hs) : new T.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      stun = 1.1; camShake = 0.25; player.vel.set(dir.x * 10, 5, dir.z * 10); play(player.ch, 'Hit_A', 0.05);
      if (carrying) { carrying = false; parcel.state = 'free'; parcel.pickCd = 0.6; parcel.vel.set(dir.x * 8, 7, dir.z * 8); parcel.spin.set(6, 3, 5); }
      showAlert(L.slip); if (window.GameAudio && GameAudio.ctx) GameAudio.slide && GameAudio.slide(900, 200, GameAudio.ctx.currentTime, 0.35, 'sine', 0.4);
      break;
    }
  }
  function updateJets(dt, tt) {
    for (const j of jets) {
      j.t += dt; const cyc = j.t % 5.2; const on = cyc > 3; j.on = on; j.jg.visible = on;
      if (on) j.drops.forEach((d, q) => { const f = ((tt * 1.6 + q / j.drops.length) % 1); const s = f * j.len; d.position.set(j.x + j.dir.x * s + Math.sin(q * 7.1) * 0.12, WALK + 0.45 + s * 0.35 - s * s * 0.07, j.z + j.dir.z * s + Math.cos(q * 5.3) * 0.12); d.scale.setScalar(0.7 + f * 0.9); });
      if (!on || mode !== 'play') continue;
      const test = (b) => { const rx = b.pos.x - j.x, rz = b.pos.z - j.z, along = rx * j.dir.x + rz * j.dir.z, lat = Math.abs(rx * j.dir.z - rz * j.dir.x); return along > 0.2 && along < j.len && lat < 0.9 && b.pos.y < WALK + 2; };
      if (stun <= 0 && test(player)) { const dd = j.dir.clone(); hitPlayer(dd, 7.5); showAlert(L.splash, 1.6); }
      if (parcel.state === 'free' && test(parcel)) { parcel.vel.x = j.dir.x * 7; parcel.vel.z = j.dir.z * 7; parcel.vel.y = Math.max(parcel.vel.y, 3); }
    }
  }
  function updateEagle(dt, tt) {
    const e = eagle; if (!e) return;
    e.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(tt * (e.state === 'dive' ? 6 : 13)) * 0.65; });
    if (e.state === 'off') { if (mode === 'play' && carrying && stun <= 0) { e.timer -= dt; if (e.timer <= 0) { e.state = 'shadow'; e.t = 2.2; e.shadow.visible = true; e.shadow.material.color.setHex(0x000000); showAlert(L.eagleWarn, 2.2); } } return; }
    const p = player.pos;
    if (e.state === 'shadow') { e.t -= dt; e.shadow.position.set(p.x, p.y + 0.05, p.z); const k = 1.6 - e.t * 0.25; e.shadow.scale.setScalar(k);
      if (e.t <= 0) { e.state = 'lock'; e.t = 0.8; e.lock.copy(e.shadow.position); e.g.visible = true; e.from.set(p.x - 14, p.y + 16, p.z - 10); e.g.position.copy(e.from); } }
    else if (e.state === 'lock') { e.t -= dt; e.shadow.material.color.setHex(Math.sin(tt * 30) > 0 ? 0xff2020 : 0x000000);
      const f = 1 - e.t / 0.8; e.g.position.lerpVectors(e.from, tmpV.set(e.lock.x, e.lock.y + 6, e.lock.z), f * 0.8); e.g.lookAt(e.lock.x, e.lock.y + 4, e.lock.z);
      if (e.t <= 0) { e.state = 'dive'; e.t = 0.35; e.to.copy(e.g.position); } }
    else if (e.state === 'dive') { e.t -= dt; const f = 1 - Math.max(0, e.t) / 0.35; e.g.position.lerpVectors(e.to, tmpV.set(e.lock.x, e.lock.y + 1.3, e.lock.z), f); e.g.rotation.x = 0.6;
      if (e.t <= 0) {
        e.shadow.visible = false;
        if (carrying && Math.hypot(p.x - e.lock.x, p.z - e.lock.z) < 1.5 && mode === 'play') {
          carrying = false; parcel.state = 'eagle'; showAlert(L.eagleStole, 2.6); camShake = 0.3; if (window.GameAudio) GameAudio.sfx('fail');
          // куда уронит: случайная точка на дороге в 18–32 м
          for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, r = 18 + Math.random() * 14; const vertical = Math.random() < 0.5, ri = 3 + 4 * Math.floor(Math.random() * 3);
            let x = e.lock.x + Math.cos(a) * r, z = e.lock.z + Math.sin(a) * r; const sw = (Math.random() < 0.5 ? -1 : 1) * (TILE / 2 + 1.0); if (vertical) x = tileX(ri) + sw; else z = tileZ(ri) + sw;
            if (Math.abs(x) < HALF - 3 && Math.abs(z) < HALF - 3 && !inHole(x, z) && Math.hypot(x - e.lock.x, z - e.lock.z) > 12 && !solids.some((q) => q.kind === 'static' && q.box.containsPoint(tmpV2.set(x, WALK + 0.5, z)))) { e.drop.set(x, 0, z); break; } }
          e.state = 'carry';
        } else { e.state = 'leave'; e.t = 1.6; }
      } }
    else if (e.state === 'carry') {
      const tgt = tmpV.set(e.drop.x, 8, e.drop.z), d = tgt.clone().sub(e.g.position), L2 = d.length();
      if (L2 < 0.6) { parcel.state = 'free'; parcel.pos.set(e.g.position.x, e.g.position.y - 1.0, e.g.position.z); parcel.vel.set(0, -2, 0); parcel.spin.set(3, 2, 4); parcel.pickCd = 0.3; e.state = 'leave'; e.t = 1.8; }
      else { d.multiplyScalar(Math.min(1, dt * 9.5 / L2)); e.g.position.add(d); e.g.position.y += (8 - e.g.position.y) * dt * 2; e.g.lookAt(tgt.x, e.g.position.y, tgt.z); e.g.rotation.x = 0; }
    }
    else if (e.state === 'leave') { e.t -= dt; e.g.position.y += dt * 9; e.g.position.x += dt * 6; if (e.t <= 0) { e.state = 'off'; e.g.visible = false; e.timer = 26 + Math.random() * 14; } }
  }

  // ---- Физика тел ----
  function makeBody(hw, h) { return { pos: new T.Vector3(), vel: new T.Vector3(), hw, h, grounded: false, ground: null, landedV: 0 }; }
  function bodyBox(b, out) { out.min.set(b.pos.x - b.hw, b.pos.y + 0.02, b.pos.z - b.hw); out.max.set(b.pos.x + b.hw, b.pos.y + b.h, b.pos.z + b.hw); return out; }
  function moveBody(b, dt) {
    const bb = new T.Box3(); b.landedV = 0; const wasGround = b.grounded; b.grounded = false; b.ground = null;
    for (const ax of ['x', 'z', 'y']) {
      const d = b.vel[ax] * dt; if (!d && ax !== 'y') continue;
      const prevY = b.pos.y; b.pos[ax] += d; bodyBox(b, bb);
      for (const s of solids) {
        if (!s.active || !bb.intersectsBox(s.box)) continue;
        if (ax === 'y') { if (d <= 0) { b.landedV = -b.vel.y; b.pos.y = s.box.max.y; b.vel.y = 0; b.grounded = true; b.ground = s; } else { b.pos.y = s.box.min.y - b.h - 0.001; b.vel.y = 0; } }
        else {
          const top = s.box.max.y - b.pos.y;
          if (top > 0 && top < 0.35 && b.vel.y <= 0.1) { b.pos.y = s.box.max.y; continue; }
          if (b.pos.y < GROUND - 0.2) { /* внутри люка — стены не проверяем */ }
          if (d > 0) b.pos[ax] = s.box.min[ax] - b.hw - 0.001; else b.pos[ax] = s.box.max[ax] + b.hw + 0.001; b.vel[ax] = 0;
        }
        bodyBox(b, bb);
      }
      if (ax === 'y' && !b.grounded && d <= 0 && b.pos.y < GROUND && prevY >= GROUND - 0.02 && !inHole(b.pos.x, b.pos.z)) {
        b.landedV = -b.vel.y; b.pos.y = GROUND; b.vel.y = 0; b.grounded = true; b.ground = null;
      }
    }
    if (!b.grounded && wasGround && b.vel.y <= 0 && Math.abs(b.pos.y - GROUND) < 0.06 && !inHole(b.pos.x, b.pos.z)) { b.pos.y = GROUND; b.vel.y = 0; b.grounded = true; }
  }

  // ---- Персонаж ----
  function makeCourier() {
    const root = T.SkeletonUtils.clone(courierTmpl); root.scale.setScalar(COURIER_H / 2.19);
    const bones = {};
    root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } if (m.isBone) bones[m.name] = m; });
    scene.add(root);
    const mixer = new T.AnimationMixer(root), act = {};
    courierClips.forEach((c) => { act[c.name] = mixer.clipAction(c); });
    ['Jump_Start', 'Jump_Land', 'Hit_A', 'PickUp'].forEach((n) => { if (act[n]) { act[n].setLoop(T.LoopOnce); act[n].clampWhenFinished = true; } });
    return { root, mixer, act, cur: null, bones };
  }
  function play(ch, name, fade) {
    if (ch.cur === name || !ch.act[name]) return;
    const next = ch.act[name]; next.reset(); next.play();
    if (ch.cur && ch.act[ch.cur]) ch.act[ch.cur].crossFadeTo(next, fade == null ? 0.12 : fade, false);
    ch.cur = name;
  }
  const CARRY = { f: 0.33, y: 0.5, ul: [-1.25, 0, 0.35], ll: [-0.35, 0, 0], ur: [-1.25, 0, -0.35], lr: [-0.35, 0, 0] };
  function carryPose(ch) { const b = ch.bones, set = (bone, r) => { if (bone) bone.rotation.set(r[0], r[1], r[2]); }; set(b.upperarml, CARRY.ul); set(b.lowerarml, CARRY.ll); set(b.upperarmr, CARRY.ur); set(b.lowerarmr, CARRY.lr); }

  function makeParcel() {
    const tex = texCanvas(128, 128, (x, w, h) => {
      x.fillStyle = '#c98d4f'; x.fillRect(0, 0, w, h); x.fillStyle = '#b77a3e'; for (let i = 0; i < 9; i++) x.fillRect(0, i * 15 + 3, w, 2);
      x.fillStyle = '#e8c58c'; x.fillRect(w / 2 - 11, 0, 22, h); x.strokeStyle = '#7a4a1e'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
      x.fillStyle = '#d23b3b'; x.font = 'bold 26px Arial'; x.textAlign = 'center'; x.fillText('▲▲', w / 2, h - 18);
    });
    const m = new T.Mesh(new T.BoxGeometry(BOX.hw * 2, BOX.h, BOX.hw * 2), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 })); m.castShadow = true; scene.add(m);
    return Object.assign(makeBody(BOX.hw, BOX.h), { mesh: m, state: 'carried', spin: new T.Vector3(), pickCd: 0 });
  }

  // ---- Игровой цикл ----
  const input = { x: 0, y: 0, jump: 0, keys: {} };
  let stun = 0, carrying = true, deadT = 0, alertT = 0, camShake = 0, safePos = null;

  function resetPlayerAt(p) { player.pos.copy(p); player.vel.set(0, 0, 0); stun = 0; if (parcel.state !== 'free') { parcel.state = 'carried'; carrying = true; parcel.mesh.visible = true; } }
  function startLevel() {
    buildCity(save.level);
    parcel.state = 'carried'; carrying = true; parcel.mesh.visible = true; parcel.mesh.scale.set(1, 1, 1);
    resetPlayerAt(startPos); player.yaw = Math.atan2(target.x - startPos.x, target.z - startPos.z);
    safePos = startPos.clone(); levelTime = 0; runCoins = 0; mode = 'play';
    $('lvl').textContent = save.level; $('coins').textContent = save.coins; $('parcel-alert').classList.add('hidden');
    ['start', 'end', 'pause'].forEach((id) => $(id).classList.add('hidden'));
    camera.position.set(player.pos.x, 12, player.pos.z - 10);
  }
  function hitPlayer(dir, power) {
    if (stun > 0 || mode !== 'play') return;
    stun = 1.0; camShake = 0.45; const pw = power || 9;
    player.vel.set(dir.x * pw, 8, dir.z * pw);
    play(player.ch, 'Hit_A', 0.05);
    if (carrying) {
      carrying = false; parcel.state = 'free'; parcel.pickCd = 0.7;
      parcel.vel.set(dir.x * pw * 0.7 + (Math.random() - 0.5) * 2, 9, dir.z * pw * 0.7 + (Math.random() - 0.5) * 2);
      parcel.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      showAlert(L.dropped);
    }
    if (window.GameAudio) GameAudio.sfx('fail');
  }

  function update(dt) {
    const t = clock.elapsedTime;
    updateLights(dt); updateCars(dt);
    for (const c of coinsArr) if (!c.taken) c.o.rotation.y += dt * 3;
    if (ring) { ring.material.opacity = 0.55 + Math.sin(t * 5) * 0.3; marker.position.y = WALK + 4.2 + Math.sin(t * 3) * 0.35; marker.rotation.y += dt * 2; }
    if (mode === 'play' || mode === 'win') updatePlayer(dt);
    if (parcel.state === 'free' || parcel.state === 'carried' || parcel.state === 'eagle') updateParcel(dt);
    if (mode === 'play' || mode === 'dead') { updateDogs(dt); updateEagle(dt, t); slipCheck(); } updateJets(dt, t);
    if (mode === 'play') { levelTime += dt; checkCars(); }
    if (mode === 'dead') { deadT -= dt; if (deadT <= 0) { mode = 'play'; resetPlayerAt(safePos); player.ch.root.visible = true; } }
    updateFx(dt); updateCamera(dt); updateFade();
    if (alertT > 0) { alertT -= dt; if (alertT <= 0) $('parcel-alert').classList.add('hidden'); }
    // постоянная подсказка, пока посылка не в руках
    { const a = $('parcel-alert'), need = mode === 'play' && (parcel.state === 'free' || parcel.state === 'eagle') && alertT <= 0;
      if (need) { if (a.textContent !== L.pickup) a.textContent = L.pickup; a.classList.remove('hidden'); a.classList.add('pick'); }
      else if (a.classList.contains('pick')) { a.classList.remove('pick'); if (alertT <= 0) a.classList.add('hidden'); } }
    // HUD: расстояние до адреса
    const lostP = parcel.state === 'free' || parcel.state === 'eagle'; const src = lostP ? parcel.pos : player.pos;
    $('dist').textContent = Math.round(Math.hypot(target.x - src.x, target.z - src.z) / 1.1) + ' m';
    if (gps) { gps.visible = mode === 'play'; const p = player.pos; gps.position.set(p.x, p.y + 2.25, p.z); const goal = lostP ? parcel.pos : target; gps.rotation.y = Math.atan2(goal.x - p.x, goal.z - p.z); gps.children.forEach((m) => m.material.color.setHex(lostP ? 0xff5a5a : 0xffd23f)); }
  }

  function updatePlayer(dt) {
    const p = player;
    let ix = input.x, iy = input.y;
    if (input.keys.left) ix -= 1; if (input.keys.right) ix += 1; if (input.keys.up) iy += 1; if (input.keys.down) iy -= 1;
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    if (mode === 'win') { ix = 0; iy = 0; }
    const ctrl = stun > 0 ? 0.12 : 1;
    const a = 1 - Math.exp(-(p.grounded ? 14 : 6) * dt * ctrl);
    p.vel.x += (-ix * SPEED - p.vel.x) * a; p.vel.z += (iy * SPEED - p.vel.z) * a;
    p.vel.y -= G * dt;
    p.coyote = p.grounded ? 0.12 : Math.max(0, (p.coyote || 0) - dt);
    if (input.jump > 0) input.jump -= dt;
    if (input.jump > 0 && p.coyote > 0 && stun <= 0 && mode === 'play') { p.vel.y = JUMP_V; p.coyote = 0; input.jump = 0; play(p.ch, 'Jump_Start', 0.05); p.jumpT = 0.25; if (window.GameAudio) GameAudio.sfx('move'); }
    const wasAir = !p.grounded;
    moveBody(p, dt);
    if (p.grounded && wasAir && p.landedV > 6) p.landT = 0.18;
    if (p.grounded && p.pos.y < WALK + 0.05 && !inHole(p.pos.x, p.pos.z)) { if (!safePos) safePos = new T.Vector3(); if (stun <= 0) safePos.copy(p.pos); }
    if (stun > 0) stun -= dt;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs > 0.6 && stun <= 0) { const ty = Math.atan2(p.vel.x, p.vel.z); let d = ty - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, dt * 14); }
    const ch = p.ch; ch.root.position.copy(p.pos); ch.root.rotation.y = p.yaw;
    if (mode === 'win') play(ch, 'Cheer', 0.2);
    else if (stun > 0) { /* Hit_A */ }
    else if (!p.grounded) { if ((p.jumpT -= dt) <= 0) play(ch, 'Jump_Idle', 0.15); }
    else if (p.landT > 0) { p.landT -= dt; play(ch, 'Jump_Land', 0.05); }
    else if (hs > 0.8) { play(ch, 'Running_A', 0.12); ch.act.Running_A.timeScale = Math.min(1.4, hs / 5); }
    else play(ch, 'Idle', 0.2);
    ch.mixer.update(dt);
    if (carrying) carryPose(ch);
    if (p.pos.y < GROUND - 3 && mode === 'play') die();
    for (const c of coinsArr) if (!c.taken && c.o.position.distanceToSquared(tmpV.set(p.pos.x, p.pos.y + 0.8, p.pos.z)) < 1.1) {
      c.taken = true; c.o.visible = false; runCoins++; save.coins++; $('coins').textContent = save.coins; if (window.GameAudio) GameAudio.sfx('coin');
    }
    if (mode === 'play' && carrying && Math.hypot(p.pos.x - target.x, p.pos.z - target.z) < 1.4 && p.pos.y < WALK + 1) win();
  }

  function updateParcel(dt) {
    const b = parcel;
    if (b.state === 'carried') {
      const p = player, fx2 = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      b.mesh.position.set(p.pos.x + fx2 * CARRY.f, p.pos.y + CARRY.y, p.pos.z + fz * CARRY.f); b.mesh.rotation.set(0, p.yaw, 0);
      b.pos.copy(b.mesh.position); b.pos.y -= BOX.h / 2; return;
    }
    if (b.state === 'eagle') { b.mesh.position.set(eagle.g.position.x, eagle.g.position.y - 0.9, eagle.g.position.z); b.mesh.rotation.set(0, eagle.g.rotation.y, 0); b.pos.copy(b.mesh.position); b.pos.y -= BOX.h / 2; return; }
    b.vel.y -= G * dt;
    if (b.grounded) { const f = Math.exp(-6 * dt); b.vel.x *= f; b.vel.z *= f; b.spin.multiplyScalar(f); }
    moveBody(b, dt);
    if (b.grounded && b.landedV > 4) { b.vel.y = b.landedV * 0.3; b.grounded = false; }
    b.mesh.position.set(b.pos.x, b.pos.y + BOX.h / 2, b.pos.z);
    b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
    if (b.grounded && b.spin.lengthSq() < 0.5) { b.mesh.rotation.x *= 0.8; b.mesh.rotation.z *= 0.8; }
    if (b.pickCd > 0) b.pickCd -= dt;
    if (mode === 'play' && stun <= 0 && b.pickCd <= 0) {
      const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z, dy = b.pos.y - player.pos.y;
      if (dx * dx + dz * dz < 0.8 && dy > -0.6 && dy < 1.2) { b.state = 'carried'; carrying = true; $('parcel-alert').classList.add('hidden'); $('parcel-alert').classList.remove('pick'); alertT = 0; if (window.GameAudio) GameAudio.sfx('perfect'); }
    }
    if (b.pos.y < GROUND - 2.5 && b.state === 'free') { b.state = 'lost'; b.mesh.visible = false; lose('fell'); }
  }

  function checkCars() {
    const pb = bodyBox(player, new T.Box3());
    for (const c of cars) {
      if (c.v < 0.5) continue;
      carBox(c, tmpBox);
      if (stun <= 0 && tmpBox.intersectsBox(pb)) {
        const fwd = c.ax === 'x' ? new T.Vector3(c.dir, 0, 0) : new T.Vector3(0, 0, c.dir);
        const side = c.ax === 'x' ? new T.Vector3(0, 0, Math.sign(player.pos.z - c.line) || 1) : new T.Vector3(Math.sign(player.pos.x - c.line) || 1, 0, 0);
        hitPlayer(fwd.multiplyScalar(0.8).add(side.multiplyScalar(0.6)).normalize(), 10);
      }
      if (parcel.state === 'free' && parcel.grounded) { const qb = bodyBox(parcel, new T.Box3()); if (tmpBox.intersectsBox(qb)) { parcel.state = 'crushed'; parcel.mesh.scale.set(1.4, 0.15, 1.4); parcel.mesh.position.y = GROUND + 0.04; parcel.mesh.rotation.set(0, parcel.mesh.rotation.y, 0); lose('crushed'); } }
    }
  }
  function lose(reason) {
    if (mode !== 'play' && mode !== 'dead') return;
    lostReason = reason; mode = 'lost'; camShake = 0.3;
    if (reason === 'fell') splash(parcel.pos, 0x333333); else splash(parcel.mesh.position, 0xc98d4f);
    if (window.GameAudio) GameAudio.sfx('fail');
    setTimeout(showLost, 1100);
  }
  function die() { mode = 'dead'; deadT = 1.0; player.ch.root.visible = false; if (carrying) parcel.mesh.visible = false; if (window.GameAudio) GameAudio.sfx('fail'); }
  function win() {
    mode = 'win'; carrying = false; parcel.state = 'placed';
    parcel.mesh.position.set(target.x, WALK + BOX.h / 2, target.z); parcel.mesh.rotation.set(0, 0, 0);
    confetti(parcel.mesh.position, 70); if (window.GameAudio) GameAudio.sfx('win');
    const timeBonus = Math.max(0, 30 - Math.floor(levelTime / 2));
    const reward = 15 + save.level * 2 + timeBonus; save.coins += reward; runCoins += reward; save.level++; persist(); $('coins').textContent = save.coins;
    setTimeout(() => {
      $('end-emoji').textContent = '📦🎉'; $('end-title').textContent = L.delivered; $('end-text').textContent = L.winText(runCoins, levelTime.toFixed(1));
      const bc = $('btn-continue'); bc.classList.remove('hidden'); bc.lastElementChild.textContent = L.double; bc.disabled = false;
      bc.onclick = () => window.YSDK.showRewarded(() => { save.coins += runCoins; persist(); $('coins').textContent = save.coins; bc.disabled = true; $('end-text').textContent = L.winText(runCoins * 2, levelTime.toFixed(1)); });
      $('btn-next').classList.remove('hidden'); $('end').classList.remove('hidden');
    }, 1700);
  }
  function showLost() {
    $('end-emoji').textContent = lostReason === 'crushed' ? '📦🚗' : '📦🕳️';
    $('end-title').textContent = lostReason === 'crushed' ? L.crushed : L.fell; $('end-text').textContent = lostReason === 'crushed' ? L.crushedText : L.fellText;
    const bc = $('btn-continue'); bc.classList.remove('hidden'); bc.disabled = false; bc.lastElementChild.textContent = L.cont;
    bc.onclick = () => window.YSDK.showRewarded(() => { $('end').classList.add('hidden'); parcel.mesh.scale.set(1, 1, 1); parcel.state = 'carried'; carrying = true; parcel.mesh.visible = true; mode = 'play'; resetPlayerAt(safePos || startPos); player.ch.root.visible = true; });
    $('btn-next').classList.add('hidden'); $('end').classList.remove('hidden');
  }

  // ---- Эффекты ----
  function splash(pos, color) {
    for (let i = 0; i < 16; i++) { const m = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 0.14), new T.MeshBasicMaterial({ color: i % 2 ? color : 0xffffff })); m.position.copy(pos); m.position.y = Math.max(pos.y, GROUND) + 0.3; scene.add(m);
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 3; fx.push({ m, v: new T.Vector3(Math.cos(a) * sp, 5 + Math.random() * 4, Math.sin(a) * sp), life: 0.9 }); }
  }
  function confetti(pos, n) {
    const cols = [0xff4f6a, 0xffd23f, 0x46d39a, 0x3fa7ff, 0xa77bff];
    for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.18, 0.11), new T.MeshBasicMaterial({ color: cols[i % 5], side: T.DoubleSide })); m.position.copy(pos); m.position.y += 1; scene.add(m);
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 3.5; fx.push({ m, v: new T.Vector3(Math.cos(a) * sp, 5 + Math.random() * 5, Math.sin(a) * sp), life: 1.7, spin: Math.random() * 10 }); }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.v.y -= (f.spin ? 9 : 18) * dt; f.m.position.addScaledVector(f.v, dt); if (f.spin) { f.m.rotation.x += f.spin * dt; f.m.rotation.y += f.spin * dt * 0.7; } if (f.life <= 0) { scene.remove(f.m); fx.splice(i, 1); } }
  }

  // ---- Камера и прозрачность домов ----
  const camT = new T.Vector3(), lookT = new T.Vector3();
  function updateCamera(dt) {
    if (!player) return;
    if (window.__camLock) { camera.position.fromArray(window.__camLock[0]); camera.lookAt(tmpV.fromArray(window.__camLock[1])); return; }
    const p = player.pos;
    camT.set(p.x, GROUND + 15.5, p.z - 8.6);
    camera.position.lerp(camT, 1 - Math.exp(-5 * dt));
    lookT.set(p.x, GROUND + 0.6, p.z + 1.2); camera.lookAt(lookT);
    if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake * 0.6; camera.position.y += (Math.random() - 0.5) * camShake * 0.6; }
    sun.position.set(p.x - 10, 25, p.z - 6); sun.target.position.set(p.x, 0, p.z + 4);
  }
  const ray = new T.Ray();
  function updateFade() {
    if (!player || window.__ts === 0) return;
    const p = tmpV2.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
    ray.origin.copy(camera.position); ray.direction.subVectors(p, camera.position); const dist = ray.direction.length(); ray.direction.normalize();
    for (const b of blocks) {
      let hit = false;
      if (Math.abs(b.box.min.x - p.x) < 16 && Math.abs(b.box.min.z - p.z) < 16) { tmpBox.copy(b.box); const ip = ray.intersectBox(tmpBox, tmpV); if (ip && ip.distanceTo(camera.position) < dist - 0.6) hit = true; }
      if (hit !== b.faded) { b.faded = hit; b.mesh.traverse((m) => { if (m.isMesh) m.material = hit ? fadeMat : cityMat; }); }
    }
  }

  // ---- Управление ----
  function setupInput() {
    const joy = $('joy'), knob = $('joy-knob'); let jid = null, jx = 0, jy = 0; const R = 55;
    const app = $('app');
    app.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || mode !== 'play' || e.pointerType === 'mouse') return;
      if (e.clientX < window.innerWidth * 0.55 && jid === null) { jid = e.pointerId; jx = e.clientX; jy = e.clientY; joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.classList.remove('hidden'); knob.style.transform = ''; }
      else input.jump = 0.15;
    });
    app.addEventListener('pointermove', (e) => { if (e.pointerId !== jid) return; let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; input.x = dx / R; input.y = -dy / R; });
    const endJ = (e) => { if (e.pointerId !== jid) return; jid = null; input.x = 0; input.y = 0; joy.classList.add('hidden'); };
    app.addEventListener('pointerup', endJ); app.addEventListener('pointercancel', endJ);
    const jb = $('btn-jump');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); input.jump = 0.15; jb.classList.add('on'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => jb.addEventListener(ev, () => jb.classList.remove('on')));
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    window.addEventListener('keydown', (e) => { if (map[e.code]) { input.keys[map[e.code]] = true; e.preventDefault(); } if (e.code === 'Space') { if (!e.repeat) input.jump = 0.15; e.preventDefault(); } if (e.code === 'Escape' && mode === 'play') pause(); });
    window.addEventListener('keyup', (e) => { if (map[e.code]) input.keys[map[e.code]] = false; });
  }
  function pause() { if (mode !== 'play') return; mode = 'pause'; $('pause').classList.remove('hidden'); }
  function resume() { $('pause').classList.add('hidden'); mode = 'play'; }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!loaded) return;
    const rot = !$('rotate').classList.contains('hidden');
    if (mode === 'menu') { updateLights(dt); updateCars(dt); if (player) { player.ch.mixer.update(dt); carryPose(player.ch); updateParcel(0); } updateCamera(dt); updateFade(); }
    else if (mode !== 'pause' && !rot) { const n = window.__ts || 1; for (let k = 0; k < n; k++) update(dt); }
    renderer.render(scene, camera);
  }

  function init() {
    detectLang(); initThree(); setupInput();
    const loader = new T.GLTFLoader(); let left = 3;
    const done = () => {
      if (--left) return;
      cityMat = new T.MeshStandardMaterial({ map: K.__map, roughness: 0.65, metalness: 0 });
      fadeMat = new T.MeshStandardMaterial({ map: K.__map, roughness: 0.65, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
      // машины и мелочи используют тот же материал
      Object.keys(K).forEach((k) => { if (K[k] && K[k].traverse) K[k].traverse((m) => { if (m.isMesh) m.material = cityMat; }); });
      { let my = 0; K.road_straight.traverse((m) => { if (!m.isMesh) return; const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); if (Math.abs(x) < 0.3 && Math.abs(z) < 0.3) my = Math.max(my, y); } }); GROUND = my * S + 0.005; }
      chaosAssets();
      loaded = true;
      player = Object.assign(makeBody(PH.hw, PH.h), { ch: makeCourier(), yaw: 0 }); parcel = makeParcel();
      buildCity(save.level); resetPlayerAt(startPos); player.yaw = Math.atan2(target.x - startPos.x, target.z - startPos.z);
      player.ch.root.position.copy(player.pos); player.ch.root.rotation.y = player.yaw; play(player.ch, 'Idle');
      camera.position.set(player.pos.x, 12, player.pos.z - 10); $('lvl').textContent = save.level; $('coins').textContent = save.coins;
      const b = $('btn-play'); b.disabled = false; b.textContent = L.play;
    };
    const fail = (e) => { console.error(e); $('btn-play').textContent = 'Error'; };
    const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const cityDone = (g) => { let r = g.scene; if (r.children.length === 1 && !r.children[0].isMesh) r = r.children[0]; r.children.forEach((c) => { K[c.name] = c; c.traverse((m) => { if (m.isMesh && m.material.map) { m.material.map.encoding = T.sRGBEncoding; K.__map = m.material.map; } }); }); done(); };
    const courierDone = (g) => { courierTmpl = g.scene; courierClips = g.animations; g.scene.traverse((m) => { if (m.isMesh && m.material.map) m.material.map.encoding = T.sRGBEncoding; }); done(); };
    if (window.CITY_GLB_B64) loader.parse(b64(window.CITY_GLB_B64), '', cityDone, fail); else loader.load('assets/city.glb', cityDone, undefined, fail);
    const dogDone = (g) => { dogTmpl = g.scene; dogClips = g.animations; done(); };
    if (window.DOG_GLB_B64) loader.parse(b64(window.DOG_GLB_B64), '', dogDone, fail); else loader.load('assets/dog.glb', dogDone, undefined, fail);
    if (window.COURIER_GLB_B64) loader.parse(b64(window.COURIER_GLB_B64), '', courierDone, fail); else loader.load('assets/courier.glb', courierDone, undefined, fail);

    $('btn-play').addEventListener('click', () => { if (window.GameAudio) GameAudio.sfx('click'); startLevel(); });
    $('btn-next').addEventListener('click', () => { $('end').classList.add('hidden'); window.YSDK.showFullscreen(startLevel); });
    $('btn-retry').addEventListener('click', () => { $('end').classList.add('hidden'); if (mode === 'win') save.level = Math.max(1, save.level - 1); window.YSDK.showFullscreen(startLevel); });
    $('btn-pause').addEventListener('click', pause); $('btn-resume').addEventListener('click', resume);
    $('btn-restart').addEventListener('click', () => { $('pause').classList.add('hidden'); startLevel(); });
    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);
    loop();

    window.__deliv = {
      ready: () => loaded, start: startLevel,
      state: () => ({ mode, level: save.level, x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), carrying, parcel: parcel.state, coins: save.coins, stun: +stun.toFixed(2),
        target: [+target.x.toFixed(1), +target.z.toFixed(1)], cars: cars.length, holes: holes.length, light: lights.phase }),
      teleport: (x, y, z) => { player.pos.set(x, y, z); player.vel.set(0, 0, 0); }, move: (x, y) => { input.x = x; input.y = y; }, jump: () => { input.jump = 0.15; },
      hit: () => hitPlayer(new T.Vector3(1, 0, 0.2)), holesAt: () => holes.map((h) => [h.x, h.z]), carsAt: () => cars.map((c) => [c.obj.position.x, c.obj.position.z, c.ax, c.dir, +c.v.toFixed(1)]),
      dogsAt: () => dogs.map((d) => [d.body.pos.x, d.body.pos.z, d.state]), bananasAt: () => bananas.filter((b) => b.on).map((b) => [b.g.position.x, b.g.position.z]), jetsAt: () => jets.map((j) => [j.x, j.z, j.dir.x, j.dir.z, j.on]), eagleNow: () => { eagle.timer = 0; }, eagleState: () => eagle.state, eagleDbg: () => [eagle.state, eagle.g.position.toArray().map((v) => +v.toFixed(1)), eagle.drop.toArray()],
      place: (kind) => {
        if (kind === 'dog') { const d = dogs[0]; player.pos.set(d.home.x + d.side[1] * 5.5, GROUND + 0.1, d.home.z - d.side[0] * 5.5); return [d.home.x, d.home.z]; }
        if (kind === 'banana') { const bn = bananas.find((b) => b.on); const v = bn.vertical; player.pos.set(bn.g.position.x - (v ? 0 : 3), bn.g.position.y + 0.1, bn.g.position.z - (v ? 3 : 0)); return v ? [0, 1] : [-1, 0]; }
        if (kind === 'jet') { const j = jets[0]; j.t = 3.05; player.pos.set(j.x + j.dir.x * 2.5, WALK + 0.1, j.z + j.dir.z * 2.5); return [j.x, j.z]; }
      },
      poster: (c) => {
        window.__ts = 0; mode = 'play';
        player.pos.set(c.p[0], WALK, c.p[1]); player.yaw = c.p[2]; player.ch.root.position.copy(player.pos); player.ch.root.rotation.y = player.yaw;
        play(player.ch, c.anim || 'Running_A', 0); player.ch.mixer.update(c.at || 0.35); if (c.carry !== false) { parcel.state = 'carried'; carrying = true; carryPose(player.ch); updateParcel(0); parcel.mesh.visible = true; } else { carrying = false; parcel.state = 'free'; parcel.mesh.position.set(c.box[0], c.box[1], c.box[2]); parcel.mesh.rotation.set(0.5, 0.7, 0.3); }
        if (c.dog && dogs[0]) { const d = dogs[0]; d.body.pos.set(c.dog[0], WALK, c.dog[1]); d.obj.position.copy(d.body.pos); d.obj.rotation.y = c.dog[2] - Math.PI / 2; setDogAnim(d, 'walk'); d.mixer.update(0.4); }
        if (c.eagle) { eagle.g.visible = true; eagle.g.position.set(c.eagle[0], c.eagle[1], c.eagle[2]); eagle.g.lookAt(c.eagle[3], c.eagle[4], c.eagle[5]); eagle.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * 0.55; }); eagle.shadow.visible = !!c.shadow; if (c.shadow) { eagle.shadow.position.set(c.shadow[0], WALK + 0.06, c.shadow[1]); eagle.shadow.material.color.setHex(0xff2020); } }
        if (c.cars) c.cars.forEach((q, i) => { const k = cars[i]; k.ax = q[0]; k.line = q[1]; k.s = q[2]; k.dir = q[3]; k.v = 0; const o = k.obj; if (k.ax === 'x') { o.position.set(k.s, GROUND + 0.06 * S, k.line); o.rotation.y = k.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } else { o.position.set(k.line, GROUND + 0.06 * S, k.s); o.rotation.y = k.dir > 0 ? 0 : Math.PI; } });
        gps.visible = false; scene.remove(gps); ring.visible = !!c.ring; marker.visible = !!c.ring; window.__camLock = c.cam; updateCamera(0);
        blocks.forEach((b) => { b.faded = false; b.mesh.traverse((m) => { if (m.isMesh) m.material = cityMat; }); });
        if (c.slip) { const bn = bananas[0]; if (bn) { bn.g.position.set(c.slip[0], GROUND + 0.05, c.slip[1]); bn.g.visible = true; } }
      },
      toTarget: () => { player.pos.set(target.x + targetFwd[0] * 3, WALK + 0.2, target.z + targetFwd[1] * 3); return targetFwd; }, carry: CARRY, setLevel: (n) => { save.level = n; },
    };
  }
  window.addEventListener('load', async () => { try { await window.YSDK.init(); } catch (e) {} try { init(); } catch (e) { console.error('init fail', e); } try { window.YSDK.gameReady(); } catch (e) {} });
})();
