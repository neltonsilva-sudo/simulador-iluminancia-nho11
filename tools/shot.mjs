// Headless screenshot via Chrome DevTools Protocol (no deps; Node >= 22 has global WebSocket).
// usage: node tools/shot.mjs <out.png> "<query>" [width=1280] [height=720] [waitSeconds=8]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [out, qs = 'demo=1', W = '1280', H = '720', waitS = '8'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 600);
const prof = mkdtempSync(join(tmpdir(), 'tr-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let target;
  for (let k = 0; k < 50 && !target; k++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const logs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: /^(https?|file):/.test(qs) ? qs : `http://localhost:${process.env.PORT||8802}/?${qs}` });
  await sleep(+waitS * 1000);
  if (process.env.EVAL) { await send('Runtime.evaluate', { expression: process.env.EVAL, awaitPromise: true }); await sleep(+(process.env.EWAIT || 1500)); }
  const fps = await send('Runtime.evaluate', { expression: 'window.__fps||0', returnByValue: true });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${out} fps=${fps?.result?.value}`);
  if (logs.length) console.log(logs.join('\n'));
} catch (e) { console.error('shot failed', e); }
finally { chrome.kill('SIGKILL'); await sleep(300); rmSync(prof, { recursive: true, force: true }); process.exit(0); }
