// Генератор уровней «Парковки»: случайная расстановка -> обход всего графа состояний ->
// расстояние до решения для каждого состояния -> берём состояния нужной сложности.
// Ход = сдвиг одной машины на любое число клеток. Цель: красная (A) в столбце 4 строки 2.
const N = 6, ROW = 2;
let seed = +process.argv[2] || 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function randomLayout(count) {
  const g = Array(36).fill(-1), cars = [];
  const put = (r, c, len, h) => {
    for (let k = 0; k < len; k++) { const rr = h ? r : r + k, cc = h ? c + k : c; if (rr >= N || cc >= N || g[rr * N + cc] >= 0) return false; }
    const id = cars.length; cars.push({ r, c, len, h });
    for (let k = 0; k < len; k++) { const rr = h ? r : r + k, cc = h ? c + k : c; g[rr * N + cc] = id; }
    return true;
  };
  put(ROW, ri(0, 2), 2, true);
  let tries = 0;
  while (cars.length < count && tries++ < 400) {
    const h = rnd() < 0.5, len = rnd() < 0.3 ? 3 : 2;
    const r = ri(0, h ? 5 : 6 - len), c = ri(0, h ? 6 - len : 5);
    if (h && r === ROW) continue; // горизонтальная в ряду выхода = тупик
    put(r, c, len, h);
  }
  return cars;
}
// состояние = массив позиций (c для горизонтальных, r для вертикальных)
function solveAll(cars, cap) {
  const key = (p) => String.fromCharCode(...p.map((x) => 48 + x));
  const start = cars.map((v) => (v.h ? v.c : v.r));
  const seen = new Map([[key(start), 0]]), states = [start], adj = [];
  for (let i = 0; i < states.length; i++) {
    if (states.length > cap) return null;
    const p = states[i], g = new Int8Array(36).fill(-1);
    cars.forEach((v, id) => { for (let k = 0; k < v.len; k++) { const rr = v.h ? v.r : p[id] + k, cc = v.h ? p[id] + k : v.c; g[rr * N + cc] = id; } });
    const nb = [];
    cars.forEach((v, id) => {
      for (const dir of [-1, 1]) {
        let pos = p[id];
        while (true) {
          const head = dir < 0 ? pos - 1 : pos + v.len;
          if (head < 0 || head >= N) break;
          const cell = v.h ? v.r * N + head : head * N + v.c;
          if (g[cell] >= 0) break;
          pos += dir;
          const q = p.slice(); q[id] = pos; const kq = key(q);
          let j = seen.get(kq); if (j === undefined) { j = states.length; seen.set(kq, j); states.push(q); }
          nb.push(j);
        }
      }
    });
    adj.push(nb);
  }
  const dist = new Int32Array(states.length).fill(-1), qu = [];
  states.forEach((p, i) => { if (p[0] === N - 2) { dist[i] = 0; qu.push(i); } });
  if (!qu.length) return null;
  for (let h = 0; h < qu.length; h++) for (const j of adj[qu[h]]) if (dist[j] < 0) { dist[j] = dist[qu[h]] + 1; qu.push(j); }
  return { states, dist };
}
function toStr(cars, p) {
  const g = Array(36).fill('.'); const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  cars.forEach((v, id) => { for (let k = 0; k < v.len; k++) { const rr = v.h ? v.r : p[id] + k, cc = v.h ? p[id] + k : v.c; g[rr * N + cc] = L[id]; } });
  return g.join('');
}
const want = { easy: [4, 8, 260], medium: [10, 17, 260], hard: [19, 60, 260] };
const out = { easy: new Map(), medium: new Map(), hard: new Map() };
const t0 = Date.now();
let iter = 0;
while (Object.keys(want).some((k) => out[k].size < want[k][2]) && Date.now() - t0 < 25 * 60e3) {
  iter++;
  const needHard = out.hard.size < want.hard[2];
  const cars = randomLayout(needHard && rnd() < 0.7 ? ri(10, 14) : ri(6, 12));
  const res = solveAll(cars, 120000); if (!res) continue;
  const { states, dist } = res;
  let maxD = 0; for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  for (const k of Object.keys(want)) {
    const [lo, hi, cnt] = want[k]; if (out[k].size >= cnt) continue;
    const pick = k === 'hard' ? Math.min(maxD, hi) : ri(lo, hi);
    if (pick < lo || pick > maxD) continue;
    const cand = []; for (let i = 0; i < dist.length; i++) if (dist[i] === pick) cand.push(i);
    if (!cand.length) continue;
    const s = toStr(cars, states[cand[ri(0, cand.length - 1)]]);
    // не больше 1 уровня с одной «раскладки», и чтобы машин было не меньше 5
    if ((s.match(/[A-Z]/g) || []).length / 2 < 5) continue;
    if (!out[k].has(s)) { out[k].set(s, pick); break; }
  }
  if (iter % 500 === 0) console.error(iter, out.easy.size, out.medium.size, out.hard.size, ((Date.now() - t0) / 1000) | 0, 's');
}
const res = {};
for (const k of Object.keys(out)) res[k] = [...out[k].entries()].sort((a, b) => a[1] - b[1]).map(([s, d]) => s + d);
console.error('done', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.length + ' lvls, moves ' + v[0].slice(36) + '..' + v[v.length - 1].slice(36)])));
process.stdout.write('window.PARKING_LEVELS = ' + JSON.stringify(res) + ';\n');
