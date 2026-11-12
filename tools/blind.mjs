// Monta uma comparação cega lado a lado (ordem sorteada) de duas imagens.
// uso: node tools/blind.mjs <gemeo.png> <referencia.webp>  → shots/blind_<n>.png + shots/blind_<n>.key
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const [gameP, refP] = process.argv.slice(2);
const root = resolve(new URL('..', import.meta.url).pathname);
const mime = (p) => ({ '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[extname(p).toLowerCase()]);
const uri = (p) => `data:${mime(p)};base64,${readFileSync(resolve(p)).toString('base64')}`;
const swap = Math.random() < 0.5;
const [A, B] = swap ? [refP, gameP] : [gameP, refP];
let n = 1; while (existsSync(join(root, `shots/blind_${n}.png`))) n++;
const html = `<html><body style="margin:0;background:#111;display:flex;gap:12px;padding:12px;font:700 28px system-ui;color:#fff">
${[A, B].map((p, i) => `<div style="flex:1;position:relative"><img src="${uri(p)}" style="width:100%;height:377px;object-fit:cover;display:block"><div style="position:absolute;left:10px;top:8px;background:#000a;padding:2px 12px">${'AB'[i]}</div></div>`).join('')}
</body></html>`;
const tmp = mkdtempSync(join(tmpdir(), 'blind-'));
const page = join(tmp, 'b.html'); writeFileSync(page, html);
const out = join(root, `shots/blind_${n}.png`);
const p = spawn(process.execPath, [join(root, 'tools/shot.mjs'), out, 'file://' + page, '1932', '401', '2'], { stdio: 'ignore' });
p.on('exit', () => {
  writeFileSync(join(root, `shots/blind_${n}.key`), `A = ${swap ? 'referência' : 'gêmeo'} (${A})\nB = ${swap ? 'gêmeo' : 'referência'} (${B})\n`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`shots/blind_${n}.png  (resposta em shots/blind_${n}.key — decida antes de ler)`);
});
