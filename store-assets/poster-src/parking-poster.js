// Генерирует обложки Parking Escape: node parking-poster.js
// Берёт рисунок машин прямо из parking/js/game.js, чтобы стиль совпадал с игрой.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '../..'), OUT = path.join(ROOT, 'store-assets/parking');
const src = fs.readFileSync(path.join(ROOT, 'parking/js/game.js'), 'utf8');
const draw = src.slice(src.indexOf('  const CAR_COLORS'), src.indexOf('  // ---- Состояние уровня'));
// уровень для картинки (средний, красивая раскладка)
const LEVEL = 'EEE.FGH.I.FGH.IAA.HJJJK.L.MMKNLOO..N';
const page = (W, H, P) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:'Arial Black',Arial,sans-serif}
#bg{position:absolute;inset:0;background:radial-gradient(circle at ${P.cx} ${P.cy},#8a7dff 0,#5b4fd6 35%,#2b2f7e 75%,#1b1d4e)}
#rays{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,255,255,.09) 0 6deg,transparent 6deg 14deg);transform:translate(calc(${P.cx} - 50%),calc(${P.cy} - 50%))}
.t1{font-size:${P.fs}px;font-weight:900;color:#ffd94a;-webkit-text-stroke:${P.fs * .07}px #2a1660;paint-order:stroke fill;text-shadow:0 ${P.fs * .07}px 0 #2a1660;letter-spacing:3px;line-height:1}
.t2{display:inline-block;margin-top:${P.fs * .12}px;font-size:${P.fs * .62}px;font-weight:900;color:#fff;letter-spacing:5px;background:linear-gradient(#ff5470,#e0234a);
 padding:${P.fs * .02}px ${P.fs * .2}px ${P.fs * .06}px;border-radius:${P.fs * .12}px;transform:rotate(-3deg);box-shadow:0 ${P.fs * .07}px 0 #8a1030}
#title{position:absolute;${P.title}}
#tag{position:absolute;${P.tag || 'display:none'};font:900 ${P.tfs || 40}px Arial,sans-serif;color:#fff;-webkit-text-stroke:${(P.tfs || 40) * .14}px #2a1660;paint-order:stroke fill;text-shadow:0 5px 0 #2a1660}
#scene{position:absolute;${P.scene};perspective:${P.persp || 1800}px}
#board{position:absolute;left:0;top:0;width:${P.B}px;height:${P.B}px;border-radius:${P.B * .06}px;background:#3b3f52;box-shadow:0 0 0 ${P.B * .012}px #c9cde0,0 ${P.B * .06}px ${P.B * .1}px rgba(0,0,0,.55);
 transform:rotateX(${P.rx || 22}deg) rotateZ(${P.rz || -8}deg);transform-style:preserve-3d}
.lot{position:absolute;inset:${P.B * .03}px;border-radius:${P.B * .04}px;background:#262938;
 background-image:linear-gradient(rgba(255,255,255,.07) 3px,transparent 3px),linear-gradient(90deg,rgba(255,255,255,.07) 3px,transparent 3px)}
.gate{position:absolute;right:-${P.B*.03}px;top:${P.B*.03+2*P.B*.94/6+6}px;width:${P.B*.06}px;height:${P.B*.94/6-12}px;background:#262938}
.car{position:absolute;z-index:2}.car svg{width:100%;height:100%;display:block;overflow:visible}
.speed{position:absolute;height:${P.B * .012}px;border-radius:9px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85))}
.lamp{position:absolute;display:flex;${P.lamp || 'display:none'};width:${P.B * .2}px;height:${P.B * .2}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe680,#ffb300 70%);
 box-shadow:0 ${P.B * .015}px 0 #b87a00,0 0 ${P.B * .08}px rgba(255,210,60,.7);align-items:center;justify-content:center;font-size:${P.B * .1}px}
.ad{position:absolute;top:-6%;right:-14%;background:#fff;color:#e5304d;font:900 ${P.B * .045}px Arial;padding:2px 10px;border-radius:12px;border:3px solid #e5304d}
</style></head><body><div id="bg"></div><div id="rays"></div>
<div id="scene"><div id="board"><div class="lot"></div><div class="gate"></div></div></div>
<div id="title"><div class="t1">PARKING</div><div class="t2">ESCAPE</div></div><div id="tag">${P.tagText || ''}</div>
<div class="lamp">💡<span class="ad">AD</span></div>
<script>
${draw}
const N=6,B=${P.B},cell=B*.94/6,off=B*.03, L='${LEVEL}';const map={};for(let i=0;i<36;i++){const c=L[i];if(c!=='.')(map[c]=map[c]||[]).push(i);}
const board=document.getElementById('board');let ci=2,ti=1;
Object.keys(map).sort().forEach((ch,k)=>{const c=map[ch],r=Math.floor(c[0]/N),cc=c[0]%N,len=c.length,h=Math.floor(c[1]/N)===r,t=ch==='A';
 const color=t?'#ff3b4e':len===3?TRUCK_COLORS[ti++%TRUCK_COLORS.length]:CAR_COLORS[ci++%CAR_COLORS.length];
 let x=off+cc*cell,y=off+r*cell; if(t){x=off+4.45*cell;}
 const d=document.createElement('div');d.className='car';Object.assign(d.style,{left:x+'px',top:y+'px',width:(h?len:1)*cell+'px',height:(h?1:len)*cell+'px'});
 d.innerHTML=carSVG(len,h,t?1:(k%2?1:-1),color,t,CARGO[k%CARGO.length]);board.appendChild(d);
 if(t){[[.25,.9],[.5,1.3],[.75,.8]].forEach(([fy,w])=>{const s=document.createElement('div');s.className='speed';Object.assign(s.style,{left:(x-w*cell)+'px',top:(y+fy*cell)+'px',width:w*cell+'px'});board.appendChild(s);});}
});
// убрать машины, попавшие под красную (она выезжает), — в исходном уровне справа от неё пусто
</script></body></html>`;
const SETS = {
  'cover-800.png': [800, 800, { cx: '50%', cy: '30%', fs: 108, title: 'left:0;right:0;top:40px;text-align:center', B: 480, scene: 'left:150px;top:300px', rx: 28, rz: -6, }],
  'cover-1080x1920.png': [1080, 1920, { cx: '50%', cy: '25%', fs: 170, title: 'left:0;right:0;top:170px;text-align:center', B: 860, scene: 'left:90px;top:660px', rx: 26, rz: -7,
    tag: 'left:0;right:0;bottom:170px;text-align:center', tfs: 62, tagText: 'Can you get the<br>red car out?'}],
  'cover-1920x1080.png': [1920, 1080, { cx: '30%', cy: '45%', fs: 170, title: 'left:110px;top:250px', B: 760, scene: 'left:1020px;top:150px', rx: 24, rz: -8,
    tag: 'left:330px;top:850px', tfs: 56, tagText: 'Can you get the red car out?', lamp: 'left:140px;top:820px', persp: 2000 }],
};
(async () => { const b = await chromium.launch();
  for (const [name, [W, H, P]] of Object.entries(SETS)) { const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(page(W, H, P)); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) }); await p.close(); console.log(name); }
  await b.close(); })();
