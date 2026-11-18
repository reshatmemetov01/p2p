// Накладывает название на кадры из игры (кадры делает dposter.js через __deliv.poster)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const RAW = process.argv[2], OUT = path.join(__dirname, '../delivery');
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(RAW, f)).toString('base64');
const logo = (fs, align) => `<div style="text-align:${align};line-height:.92;font-family:'Arial Black',Arial,sans-serif">
 <div style="font-size:${fs}px;font-weight:900;color:#ffd94a;letter-spacing:4px;-webkit-text-stroke:${fs * .075}px #2a1660;paint-order:stroke fill;text-shadow:0 ${fs * .07}px 0 #2a1660">CRAZY</div>
 <div style="display:inline-block;margin-top:${fs * .1}px;font-size:${fs * .62}px;font-weight:900;color:#fff;letter-spacing:4px;background:linear-gradient(#ff8a3d,#e5571c);padding:${fs * .02}px ${fs * .2}px ${fs * .07}px;border-radius:${fs * .12}px;transform:rotate(-3deg);box-shadow:0 ${fs * .07}px 0 #8a3010;-webkit-text-stroke:${fs * .03}px #8a3010;paint-order:stroke fill">DELIVERY</div></div>`;
const SETS = {
  'cover-1920x1080.png': [1920, 1080, 'raw-land.png', `<div style="position:absolute;left:70px;top:40px">${logo(170, 'left')}</div>`],
  'cover-1080x1920.png': [1080, 1920, 'raw-port.png', `<div style="position:absolute;left:0;right:0;top:1440px">${logo(190, 'center')}</div>`],
  'cover-800.png': [800, 800, 'raw-sq.png', `<div style="position:absolute;left:22px;top:18px">${logo(78, 'left')}</div>`],
};
(async () => { const b = await chromium.launch();
  for (const [name, [W, H, raw, over]] of Object.entries(SETS)) { const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(`<html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;background:url(${img(raw)}) center/cover">
      <div style="position:absolute;inset:${name.includes('1080x1920') ? 'auto 0 0 0' : '0 0 auto 0'};height:${H * 0.42}px;background:linear-gradient(${name.includes('1080x1920') ? 'rgba(40,30,110,0),rgba(40,30,110,.6)' : 'rgba(40,30,110,.55),rgba(40,30,110,0)'})"></div>${over}</body></html>`);
    await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, name) }); await p.close(); console.log(name); }
  await b.close(); })();
