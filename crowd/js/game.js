/* =========================================================================
   Толпа 3D — раннер с толпой (Count Masters) на настоящем 3D (Three.js).
   Камера под углом, объёмная дорога, 3D-человечки толпой, воротца с
   математикой, ловушки и стены.
   ========================================================================= */
(function () {
  'use strict';
  const T = window.THREE;

  const SAVE_KEY = 'crowd3d_save_v1';
  const CAP = 160;           // максимум видимых человечков
  const ROAD_W = 7;          // ширина дороги (мир. единицы)
  const ROAD_HALF = 2.9;     // куда может уйти толпа вбок
  const FAR = 56;            // дальность видимости

  // ---- Состояние ----
  let scene, camera, renderer;
  let parts = {}, eparts = {};     // синяя толпа игрока / красная вражеская
  let countSprite, ecountSprite, lastShownN = -1, eLastN = -1;
  let bluePool, redPool;           // «разлёт»: пулы летящих кусочков
  const enemyPlaced = new Set();
  let shake = 0;                   // тряска камеры
  const _m = new T.Matrix4(), _r = new T.Matrix4(), _s = new T.Vector3();
  let W = 0, H = 0;

  let mode = 'ready';
  let N = 10, lat = 0, targetLat = 0, crowdX = 0;
  let traveled = 0, dist = 0, speed = 0, t = 0;
  let objects = [], genDist = 0; const wallPlaced = new Set();
  let coins = 0, runCoins = 0, bestDist = 0;
  let upg = { start: 0, income: 0 };
  let slots = [];

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');

  // ===== Сохранение =====
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, upg, bestDist })); } catch (e) {} }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) { coins = s.coins || 0; upg = Object.assign(upg, s.upg || {}); bestDist = s.bestDist || 0; } } catch (e) {} }

  // ===== Текстуры с числами =====
  function numTexture(text, bg, fg) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 256, 128);
    x.fillStyle = fg; x.font = '900 72px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 70);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 2;
    tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // смотрим с изнанки — отражаем
    return tex;
  }
  function gateTexture(lg, rg) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = lg.good ? '#57d07a' : '#ff5a6a'; x.fillRect(0, 0, 128, 96);
    x.fillStyle = rg.good ? '#57d07a' : '#ff5a6a'; x.fillRect(128, 0, 128, 96);
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 4; x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 96); x.stroke();
    x.fillStyle = '#fff'; x.font = '900 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(gateText(lg), 64, 52); x.fillText(gateText(rg), 192, 52);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 2;
    tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // смотрим с изнанки — отражаем
    return tex;
  }

  // ===== Инициализация =====
  function init() {
    load(); buildSlots();
    scene = new T.Scene();
    const sky = new T.Color(0xdcd9f6);
    scene.background = sky;
    scene.fog = new T.Fog(sky, 34, 62);

    camera = new T.PerspectiveCamera(46, 1, 0.1, 300);

    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    resize();
    window.addEventListener('resize', resize);

    // свет
    scene.add(new T.HemisphereLight(0xffffff, 0x8fb0c8, 0.9));
    const dir = new T.DirectionalLight(0xffffff, 0.8);
    dir.position.set(-6, 12, -4); scene.add(dir);

    buildStaticWorld();
    buildCrowd();

    bindInput();
    updateHUD();
    renderer.setAnimationLoop(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    camera.position.set(CAM.x, CAM.y, CAM.z);
    camera.lookAt(CAM.tx, CAM.ty, CAM.tz);
  }

  // ===== Статичный мир (дорога, земля, горы) =====
  let roadMat;
  function buildStaticWorld() {
    // дорога с мягкими бегущими полосами (лавандовая)
    const rc = document.createElement('canvas'); rc.width = 8; rc.height = 64;
    const rx = rc.getContext('2d');
    for (let i = 0; i < 8; i++) { rx.fillStyle = (i % 2 === 0) ? '#cac4ef' : '#c0b9e9'; rx.fillRect(0, i * 8, 8, 8); }
    const rtex = new T.CanvasTexture(rc); rtex.wrapS = rtex.wrapT = T.RepeatWrapping; rtex.repeat.set(1, 36);
    roadMat = new T.MeshLambertMaterial({ map: rtex });
    const road = new T.Mesh(new T.PlaneGeometry(ROAD_W, 320), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, 150); scene.add(road);
    roadMat._tex = rtex;

    // белые бортики дороги
    const edgeMat = new T.MeshBasicMaterial({ color: 0xffffff });
    [-1, 1].forEach((s) => {
      const e = new T.Mesh(new T.BoxGeometry(0.18, 0.22, 320), edgeMat);
      e.position.set(s * ROAD_W / 2, 0.08, 150); scene.add(e);
    });

    // мягкие абстрактные боковые блоки (пустота по бокам)
    const blockMat = new T.MeshLambertMaterial({ color: 0xb9c6ec });
    const blockMat2 = new T.MeshLambertMaterial({ color: 0xc7d2f0 });
    for (let i = 0; i < 26; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = 8 + (i >> 1) * 7 + Math.random() * 5;
      const x = side * (7 + Math.random() * 10);
      const h = 1 + Math.random() * 4;
      const w = 1.2 + Math.random() * 2.5;
      const m = new T.Mesh(new T.BoxGeometry(w, h, w), Math.random() < 0.5 ? blockMat : blockMat2);
      m.position.set(x, h / 2 - 0.3, z); m.rotation.y = Math.random() * 0.6; scene.add(m);
    }
  }

  // ===== Толпа =====
  function buildSlots() {
    slots = [];
    for (let i = 0; i < CAP; i++) {
      const a = i * 2.399, r = Math.sqrt(i);
      slots.push({ x: Math.cos(a) * r * 0.2, z: Math.sin(a) * r * 0.2, ph: Math.random() * 6.3 });
    }
  }
  // Длины конечностей (совпадают с геометрией; pivot сверху в начале координат)
  const ARM_LEN = 0.26, LEG_LEN = 0.34;
  const CAM = { x: 0, y: 6.6, z: -8.2, tx: 0, ty: -0.4, tz: 10 };
  // Создать набор частей тела (гладкие «чанковые» фигурки — как в референсе)
  function buildCharSet(color) {
    const torsoGeo = new T.SphereGeometry(0.26, 12, 10); torsoGeo.scale(1, 1.32, 1); torsoGeo.translate(0, 0.5, 0);
    const headGeo = new T.SphereGeometry(0.21, 12, 10); headGeo.translate(0, 0.94, 0);
    const legGeo = new T.CylinderGeometry(0.1, 0.085, LEG_LEN, 6); legGeo.translate(0, -LEG_LEN / 2, 0);
    const armGeo = new T.CylinderGeometry(0.075, 0.06, ARM_LEN, 6); armGeo.translate(0, -ARM_LEN / 2, 0);
    const shadowGeo = new T.CircleGeometry(0.3, 14); shadowGeo.rotateX(-Math.PI / 2);
    const im = (geo, col, opts) => {
      const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial(Object.assign({ color: col }, opts || {})), CAP);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); return m;
    };
    return {
      shadow: im(shadowGeo, 0x4a4a7a, { transparent: true, opacity: 0.22 }),
      legL: im(legGeo, color), legR: im(legGeo, color),
      armL: im(armGeo, color), armR: im(armGeo, color),
      torso: im(torsoGeo, color), head: im(headGeo, color),
    };
  }
  function makePool(color) {
    const mesh = new T.InstancedMesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshLambertMaterial({ color }), 140);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh);
    const data = []; for (let i = 0; i < 140; i++) data.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    return { mesh, data };
  }
  function buildCrowd() {
    parts = buildCharSet(0x1f6fe0);   // синяя толпа (игрок)
    eparts = buildCharSet(0xe23b3b);  // красная толпа (враг)
    bluePool = makePool(0x1f6fe0); redPool = makePool(0xe23b3b);
    countSprite = new T.Sprite(new T.SpriteMaterial({ map: countTex(10, '#2e86de'), depthTest: false, transparent: true }));
    countSprite.scale.set(1.3, 0.66, 1); countSprite.renderOrder = 10; scene.add(countSprite);
    ecountSprite = new T.Sprite(new T.SpriteMaterial({ map: countTex(10, '#e23b3b'), depthTest: false, transparent: true }));
    ecountSprite.scale.set(1.3, 0.66, 1); ecountSprite.renderOrder = 10; ecountSprite.visible = false; scene.add(ecountSprite);
  }

  // ===== Разлёт =====
  function spawnInPool(pool, count, cx, cz) {
    let spawned = 0;
    for (let i = 0; i < pool.data.length && spawned < count; i++) {
      const b = pool.data[i]; if (b.life > 0) continue;
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 3;
      b.life = 0.7 + Math.random() * 0.4;
      b.x = cx + (Math.random() - 0.5) * 1.4; b.y = 0.5 + Math.random() * 0.6; b.z = cz + (Math.random() - 0.5) * 1.4;
      b.vx = Math.cos(a) * sp; b.vz = Math.sin(a) * sp; b.vy = 4 + Math.random() * 3;
      spawned++;
    }
    shake = Math.min(0.55, shake + 0.28);
  }
  function spawnBurst(count) { spawnInPool(bluePool, count, crowdX, 0); }
  function spawnBurstRed(count, cz) { spawnInPool(redPool, count, 0, cz); }
  function updatePool(pool, dt) {
    let n = 0;
    for (const b of pool.data) {
      if (b.life <= 0) continue;
      b.life -= dt; b.vy -= 14 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0.1) { b.y = 0.1; b.vy *= -0.4; b.vx *= 0.7; b.vz *= 0.7; }
      const sc = Math.max(0.01, Math.min(1, b.life * 1.6));
      _m.makeScale(sc, sc, sc); _m.setPosition(b.x, b.y, b.z);
      pool.mesh.setMatrixAt(n++, _m);
    }
    pool.mesh.count = n; pool.mesh.instanceMatrix.needsUpdate = true;
  }
  function updateBurst(dt) { updatePool(bluePool, dt); updatePool(redPool, dt); }

  function countTex(n, bg) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = bg || '#2e86de'; roundRect(x, 6, 6, 148, 56, 16); x.fill();
    x.beginPath(); x.moveTo(72, 62); x.lineTo(88, 62); x.lineTo(80, 76); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.font = '900 42px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(n), 80, 32);
    const tex = new T.CanvasTexture(c); return tex;
  }
  function roundRect(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y);
    x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }

  function setLimb(mesh, i, x, y, z, swing) {
    _r.makeRotationX(swing);
    _m.makeTranslation(x, y, z); _m.multiply(_r);
    mesh.setMatrixAt(i, _m);
  }

  // ===== Старт =====
  function startRun() {
    hideScreens();
    clearObjects();
    N = 10 + upg.start * 2; lat = 0; targetLat = 0; crowdX = 0;
    traveled = 0; dist = 0; speed = 7; runCoins = 0;
    genDist = 10; wallPlaced.clear(); enemyPlaced.clear(); eLastN = -1;
    mode = 'play';
    $('tap-hint').style.display = '';
    generateUpTo(FAR);
    updateHUD();
  }

  // ===== Генерация =====
  function generateUpTo(max) {
    while (genDist < max) {
      const nw = Math.round(genDist / 80) * 80;            // стены: 80, 160, ...
      const ne = Math.round((genDist - 40) / 80) * 80 + 40; // враги между: 40, 120, ...
      if (nw > 0 && Math.abs(genDist - nw) < 9 && !wallPlaced.has(nw)) {
        wallPlaced.add(nw); spawnWall(nw); genDist = nw + 18;
      } else if (ne >= 40 && Math.abs(genDist - ne) < 9 && !enemyPlaced.has(ne)) {
        enemyPlaced.add(ne); spawnEnemy(ne); genDist = ne + 18;
      } else {
        if (Math.random() < 0.7) spawnGate(genDist); else spawnObstacle(genDist);
        genDist += 9 + Math.random() * 6;
      }
    }
  }
  function spawnEnemy(d) { objects.push({ type: 'enemy', worldZ: d, count: Math.round(8 + d * 0.05) }); }
  function scaledAdd(d) { return Math.max(4, Math.round((6 + d * 0.03) * (0.6 + Math.random() * 0.9))); }
  // Зелёные (выгодные) воротца
  function greenOp(d) {
    const r = Math.random();
    if (r < 0.22) return { op: 'mul', val: 2, good: true };
    if (r < 0.34) return { op: 'mul', val: 3, good: true };
    return { op: 'add', val: scaledAdd(d), good: true };
  }
  // Красные (вредные/хитрые) воротца
  function redOp(d, allowZero) {
    const r = Math.random();
    if (allowZero && r < 0.13) return { op: 'mul', val: 0, good: false };  // ×0 — убивает толпу!
    if (r < 0.32) return { op: 'mul', val: 1, good: false };               // ×1 — ловушка (ничего)
    if (r < 0.64) return { op: 'sub', val: scaledAdd(d), good: false };    // −N
    if (r < 0.86) return { op: 'div', val: 2, good: false };               // ÷2
    return { op: 'div', val: 3, good: false };                            // ÷3
  }
  function sameOp(a, b) { return a.op === b.op && a.val === b.val; }
  function makeGatePair(d) {
    let left, right;
    if (Math.random() < 0.68) {
      // один зелёный + один красный (классика, но без двух зелёных)
      const g = greenOp(d), b = redOp(d, true);
      if (Math.random() < 0.5) { left = g; right = b; } else { left = b; right = g; }
    } else {
      // два красных — выбираешь меньшее зло (×1 vs ÷2 и т.п.)
      left = redOp(d, false); right = redOp(d, true);
      let guard = 0;
      while ((sameOp(left, right) || (left.val === 0 && right.val === 0)) && guard++ < 8) right = redOp(d, false);
    }
    return { left, right };
  }
  function gateText(g) { return (g.op === 'add' ? '+' : g.op === 'sub' ? '−' : g.op === 'mul' ? '×' : '÷') + g.val; }

  function spawnGate(d) {
    const pair = makeGatePair(d);
    const left = pair.left, right = pair.right;
    const tex = gateTexture(left, right);
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide });
    const mesh = new T.Mesh(new T.PlaneGeometry(ROAD_W, 2.1), mat);
    mesh.position.set(0, 1.05, 0);
    // столбы
    const postMat = new T.MeshLambertMaterial({ color: 0x55637a });
    [-ROAD_W / 2, 0, ROAD_W / 2].forEach((px) => {
      const p = new T.Mesh(new T.BoxGeometry(0.12, 2.1, 0.12), postMat); p.position.set(px, 1.05, 0); mesh.add(p);
    });
    const g = new T.Group(); g.add(mesh); scene.add(g);
    objects.push({ type: 'gate', worldZ: d, left, right, obj: g, tex, mat });
  }
  function spawnObstacle(d) {
    const hw = 0.9 + Math.random() * 0.8;
    const cx = (Math.random() * 2 - 1) * (ROAD_HALF - hw);
    const mat = new T.MeshLambertMaterial({ color: 0xff4d5e });
    const mesh = new T.Mesh(new T.BoxGeometry(hw * 2, 0.7, 0.5), mat); mesh.position.set(cx, 0.35, 0);
    scene.add(mesh);
    objects.push({ type: 'obst', worldZ: d, cx, hw, dmg: Math.round(8 + d * 0.02), obj: mesh, mat });
  }
  function spawnWall(d) {
    const req = Math.round(15 + d * 0.07);
    const tex = numTexture('🧱 ' + req, '#8a5a3a', '#ffffff');
    const front = new T.MeshBasicMaterial({ map: tex });
    const side = new T.MeshLambertMaterial({ color: 0x6e4428 });
    const mesh = new T.Mesh(new T.BoxGeometry(ROAD_W, 2.2, 0.7), [side, side, side, side, front, side]);
    mesh.position.set(0, 1.1, 0); scene.add(mesh);
    objects.push({ type: 'wall', worldZ: d, req, obj: mesh, tex, mat: front });
  }

  function clearObjects() { for (const o of objects) disposeObj(o); objects = []; }
  function disposeObj(o) {
    if (!o.obj) return;
    scene.remove(o.obj);
    o.obj.traverse && o.obj.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
    if (o.tex) o.tex.dispose();
    if (o.mat) o.mat.dispose && o.mat.dispose();
  }

  // ===== Цикл =====
  function loop() {
    const now = performance.now();
    const dt = loop._l ? Math.min((now - loop._l) / 1000, 0.05) : 0; loop._l = now; t += dt;
    update(dt);
    // тряска камеры
    if (shake > 0) { camera.position.x = CAM.x + (Math.random() - 0.5) * shake; camera.position.y = CAM.y + (Math.random() - 0.5) * shake; }
    else if (camera.position.x !== CAM.x) { camera.position.x = CAM.x; camera.position.y = CAM.y; }
    renderer.render(scene, camera);
  }

  function update(dt) {
    if (mode === 'play') {
      speed = Math.min(17, 7 + traveled * 0.004);
      traveled += speed * dt; dist = Math.floor(traveled);
      lat += (targetLat - lat) * Math.min(1, dt * 12); lat = Math.max(-1, Math.min(1, lat));
      crowdX = -lat * ROAD_HALF; // экран↔мир по X отзеркалены этой камерой
      generateUpTo(traveled + FAR);
      processObjects();
      updateHUD();
      if (N <= 0) gameOver();
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
    // бег полос
    if (roadMat && roadMat._tex) roadMat._tex.offset.y = -traveled * 0.25;
    // позиции объектов
    for (const o of objects) if (o.obj) o.obj.position.z = o.worldZ - traveled;
    updateCrowd(dt);
    updateBurst(dt);
  }

  function crowdWidth() { return Math.min(1.9, 0.35 + Math.sqrt(Math.min(N, CAP)) * 0.085); }

  function ballAt(mesh, i, px, py, pz, len, swing) {
    _m.makeTranslation(px, py - len * Math.cos(swing), pz - len * Math.sin(swing));
    mesh.setMatrixAt(i, _m);
  }
  function poseCrowdSet(set, count, cx, cz, spread, running) {
    for (let i = 0; i < count; i++) {
      const s = slots[i];
      const run = running ? (t * 12 + s.ph) : s.ph;
      const bob = running ? Math.abs(Math.sin(run)) * 0.06 : 0;
      const px = cx + s.x * spread, pz = cz + s.z * spread, py = bob;
      const ls = running ? Math.sin(run) * 0.5 : 0;
      const as = running ? Math.sin(run) * 0.35 : 0.1;
      _m.makeTranslation(px, 0.02, pz); set.shadow.setMatrixAt(i, _m);
      _m.makeTranslation(px, py, pz);
      set.torso.setMatrixAt(i, _m); set.head.setMatrixAt(i, _m);
      // короткие ножки (pivot — бедро)
      const hy = py + LEG_LEN;
      setLimb(set.legL, i, px - 0.11, hy, pz, ls); setLimb(set.legR, i, px + 0.11, hy, pz, -ls);
      // короткие ручки по бокам (pivot — плечо)
      const sy = py + 0.62;
      setLimb(set.armL, i, px - 0.24, sy, pz, -as); setLimb(set.armR, i, px + 0.24, sy, pz, as);
    }
    for (const k in set) { set[k].count = count; set[k].instanceMatrix.needsUpdate = true; }
  }
  function updateCrowd(dt) {
    const running = mode === 'play';
    // игрок
    const want = Math.max(0, Math.min(N, CAP)), spread = crowdWidth();
    poseCrowdSet(parts, want, crowdX, 0, spread, running);
    if (countSprite) {
      countSprite.visible = mode !== 'ready' && want > 0;
      countSprite.position.set(crowdX, 1.7 + spread * 0.2, 0.3);
      if (N !== lastShownN) {
        lastShownN = N; countSprite.material.map.dispose();
        countSprite.material.map = countTex(Math.max(0, N), '#2e86de'); countSprite.material.needsUpdate = true;
      }
    }
    // ближайшая вражеская толпа
    let en = null, enz = 1e9;
    for (const o of objects) if (o.type === 'enemy' && !o.done) { const z = o.worldZ - traveled; if (z > -1 && z < FAR && z < enz) { enz = z; en = o; } }
    if (en) {
      const ec = Math.max(0, Math.min(en.count, CAP));
      const espread = Math.min(2.2, 0.5 + Math.sqrt(ec) * 0.095);
      poseCrowdSet(eparts, ec, 0, enz, espread, true);
      ecountSprite.visible = true; ecountSprite.position.set(0, 1.7 + espread * 0.2, enz + 0.3);
      if (en.count !== eLastN) {
        eLastN = en.count; ecountSprite.material.map.dispose();
        ecountSprite.material.map = countTex(en.count, '#e23b3b'); ecountSprite.material.needsUpdate = true;
      }
    } else {
      for (const k in eparts) { eparts[k].count = 0; eparts[k].instanceMatrix.needsUpdate = true; }
      ecountSprite.visible = false;
    }
  }

  function processObjects() {
    for (const o of objects) {
      if (o.done || traveled < o.worldZ) continue;
      o.done = true;
      if (o.type === 'gate') applyGate(lat < 0 ? o.left : o.right);
      else if (o.type === 'obst') {
        if (Math.abs(crowdX - o.cx) < o.hw + crowdWidth() * 0.5) {
          N = Math.max(0, N - o.dmg); spawnBurst(Math.min(o.dmg, 24)); if (window.GameAudio) GameAudio.sfx('fail');
        }
      } else if (o.type === 'wall') {
        N -= o.req; spawnBurst(Math.min(o.req, 36)); if (window.GameAudio) GameAudio.sfx('clear');
        if (N > 0) runCoins += Math.max(1, Math.round(o.req / 2)); else N = 0;
      } else if (o.type === 'enemy') {
        // замес: чья толпа больше, тот побеждает
        if (N > o.count) {
          N -= o.count; runCoins += Math.max(1, Math.round(o.count / 3));
          spawnBurstRed(Math.min(o.count, 40), 0.3); spawnBurst(Math.min(o.count, 12));
          if (window.GameAudio) GameAudio.sfx('clear');
        } else {
          N = 0; spawnBurst(40); spawnBurstRed(Math.min(o.count, 40), 0.3);
          if (window.GameAudio) GameAudio.sfx('fail');
        }
      }
    }
    for (const o of objects) if (o.worldZ - traveled < -6 && !o._gone) { o._gone = true; disposeObj(o); }
    objects = objects.filter((o) => !o._gone);
  }
  function applyGate(g) {
    if (g.op === 'add') N += g.val; else if (g.op === 'sub') N = Math.max(0, N - g.val);
    else if (g.op === 'mul') N = Math.round(N * g.val); else if (g.op === 'div') N = Math.round(N / g.val);
    if (window.GameAudio) GameAudio.sfx(g.good ? 'coin' : 'move');
  }

  function gameOver() {
    if (mode === 'over') return; mode = 'over';
    spawnBurst(40);
    const bonus = Math.round(dist / 8) * (1 + upg.income * 0.5);
    runCoins += Math.round(bonus); coins += runCoins;
    if (dist > bestDist) bestDist = dist; save();
    $('end-dist').textContent = dist; $('end-coins').textContent = runCoins;
    $('btn-x2').disabled = false; $('btn-x2').style.opacity = 1;
    $('tap-hint').style.display = 'none';
    $('end').classList.remove('hidden');
    if (window.GameAudio) GameAudio.sfx('fail');
  }

  // ===== HUD / магазин =====
  function updateHUD() {
    $('crowd').textContent = Math.max(0, N);
    $('dist').textContent = dist;
    $('coins').textContent = coins + (runCoins ? '+' + runCoins : '');
  }
  const UPG_DEF = {
    start: { name: '👥 Стартовая толпа', max: 10, cost: (l) => 60 + l * 70, desc: (l) => '+' + (l * 2) + ' в старте' },
    income: { name: '💰 Доход', max: 5, cost: (l) => 100 + l * 120, desc: (l) => '+' + (l * 50) + '% монет' },
  };
  function renderShop() {
    $('shop-coins').textContent = coins;
    for (const key of Object.keys(UPG_DEF)) {
      const def = UPG_DEF[key], lvl = upg[key], el = $('upg-' + key);
      const maxed = lvl >= def.max, cost = def.cost(lvl);
      el.innerHTML = `<div class="upg-info"><div class="upg-name">${def.name}</div>` +
        `<div class="upg-lvl">Ур. ${lvl}/${def.max} · ${def.desc(lvl)}</div>` +
        `<div class="upg-bar"><div style="width:${lvl / def.max * 100}%"></div></div></div>` +
        (maxed ? `<button class="upg-buy max" disabled>МАКС</button>` : `<button class="upg-buy" data-k="${key}" ${coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`);
    }
    $('shop').querySelectorAll('.upg-buy[data-k]').forEach((btn) => {
      btn.onclick = () => { const k = btn.dataset.k, cost = UPG_DEF[k].cost(upg[k]);
        if (coins >= cost && upg[k] < UPG_DEF[k].max) { coins -= cost; upg[k]++; save(); renderShop(); updateHUD(); if (window.GameAudio) GameAudio.sfx('power'); } };
    });
  }

  // ===== Реклама =====
  let runCount = 0;
  function maybeInterstitial(after) { runCount++; if (runCount % 3 === 0) window.YSDK.showFullscreen(after); else after(); }
  function revive() { window.YSDK.showRewarded(() => {
    N = Math.max(25, 10 + upg.start * 2); traveled += 5; mode = 'play';
    $('end').classList.add('hidden'); $('tap-hint').style.display = ''; if (window.GameAudio) GameAudio.sfx('power'); updateHUD(); }); }
  function doubleCoins() { window.YSDK.showRewarded(() => {
    coins += runCoins; $('end-coins').textContent = runCoins * 2; $('btn-x2').disabled = true; $('btn-x2').style.opacity = 0.5; save(); updateHUD(); if (window.GameAudio) GameAudio.sfx('coin'); }); }

  // ===== Ввод =====
  function bindInput() {
    const toLat = (e) => { const r = canvas.getBoundingClientRect(); return Math.max(-1, Math.min(1, ((e.clientX - r.left) - W / 2) / (W * 0.42))); };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => { if (mode === 'play') { dragging = true; targetLat = toLat(e); } });
    canvas.addEventListener('pointermove', (e) => { if (dragging) targetLat = toLat(e); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    $('btn-start').onclick = startRun;
    $('btn-again').onclick = () => { $('end').classList.add('hidden'); maybeInterstitial(startRun); };
    $('btn-revive').onclick = revive;
    $('btn-x2').onclick = doubleCoins;
    $('btn-upgrades').onclick = () => { $('end').classList.add('hidden'); renderShop(); $('shop').classList.remove('hidden'); };
    $('btn-close-shop').onclick = () => { $('shop').classList.add('hidden'); startRun(); };

    const sb = $('sound-btn'); if (sb && window.GameAudio) GameAudio.attachButton(sb);

    window.__crowd = {
      start: startRun, steerTo: (x) => { targetLat = Math.max(-1, Math.min(1, (x - W / 2) / (W * 0.42))); },
      state: () => ({ mode, N, dist, coins, runCoins }),
      addCoins: (n) => { coins += n; save(); updateHUD(); },
      forceOver: () => { N = 0; },
      grow: (n) => { N += (n || 20); updateHUD(); },
      burst: () => spawnBurst(30),
      webgl: () => !!(renderer && renderer.getContext()),
    };
  }

  function hideScreens() { $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('shop').classList.add('hidden'); }

  window.addEventListener('load', async () => {
    await window.YSDK.init();
    try { init(); } catch (e) { console.error('init fail', e); }
    window.YSDK.gameReady();
  });
})();
