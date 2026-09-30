import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('./apresentacao-comercial.md', import.meta.url);
const target = new URL('./apresentacao-comercial.html', import.meta.url);
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const inline = s => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const lines = readFileSync(source, 'utf8').split(/\r?\n/);
let body = '', list = false, table = false, section = false;
const closeList = () => { if (list) { body += '</ul>'; list = false; } };
const closeTable = () => { if (table) { body += '</tbody></table></div>'; table = false; } };
for (const line of lines) {
  if (!line.trim()) { closeList(); closeTable(); continue; }
  if (line.startsWith('|')) {
    closeList();
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (!table) { body += '<div class="table-wrap"><table><thead><tr>' + cells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'; table = true; }
    else body += '<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
    continue;
  }
  closeTable();
  if (line.startsWith('- ')) { if (!list) { body += '<ul>'; list = true; } body += `<li>${inline(line.slice(2))}</li>`; continue; }
  closeList();
  const heading = line.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    if (level === 2) { if (section) body += '</section>'; body += '<section>'; section = true; }
    body += `<h${level}>${inline(heading[2])}</h${level}>`;
  } else body += `<p>${inline(line)}</p>`;
}
closeList(); closeTable(); if (section) body += '</section>';
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Então Bora | Gestão e experiência do usuário</title>
<style>
:root{--ink:#192238;--accent:#743bbd;--muted:#586175;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:#edeaf1;color:var(--ink);font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65}.toolbar{max-width:960px;margin:24px auto 0;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 24px;color:var(--muted);font-size:13px}button{background:var(--accent);color:white;border:0;padding:12px 20px;border-radius:8px;font-weight:700;cursor:pointer}main{max-width:960px;margin:20px auto 40px;background:var(--paper);padding:60px 70px;box-shadow:0 12px 50px #25143915;border-top:8px solid var(--accent)}h1{font-size:54px;line-height:1.1;margin:10px 0 30px;letter-spacing:-2px;color:var(--accent)}h2{font-size:27px;line-height:1.25;margin:0 0 20px;letter-spacing:-.5px}h3{font-size:18px;margin:24px 0 8px}section{padding:32px 0;border-bottom:1px solid #e4dfed}section:first-of-type{padding-top:0}p{margin:12px 0}li{margin:7px 0}ul{padding-left:23px}strong{color:#372455}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:18px 0}th,td{text-align:left;vertical-align:top;padding:13px;border:1px solid #ded7e8}th{background:#f0e9f8;color:#47256d}footer{padding-top:28px;font-size:12px;color:var(--muted)}
@media(max-width:650px){main{padding:28px 24px;margin:15px}h1{font-size:42px}h2{font-size:24px}.toolbar{align-items:flex-start}}
@page{size:A4;margin:18mm 18mm 20mm}
@media print{body{background:white;font-size:10.5pt;line-height:1.48}.toolbar{display:none}main{max-width:none;margin:0;padding:0;box-shadow:none;border-top:4px solid var(--accent)}h1{font-size:38pt;margin:14pt 0 20pt}h2{font-size:20pt}h3{font-size:13pt}section{padding:18pt 0}h1,h2,h3{break-after:avoid}p,li{orphans:3;widows:3}li,tr{break-inside:avoid}table{font-size:9.5pt}thead{display:table-header-group}th,td{padding:8pt}.table-wrap{overflow:visible}footer{font-size:8pt}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="toolbar"><span>Apresentação comercial · Gestão e experiência do usuário</span><button onclick="window.print()">Imprimir / Salvar em PDF</button></div><main>${body}<footer>Então Bora · Apresentação funcional · Setembro de 2026</footer></main></body></html>`;
writeFileSync(target, html, 'utf8');
console.log(`Gerado: ${fileURLToPath(target)}`);
