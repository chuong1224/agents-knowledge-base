/* debts.js — Sổ nợ vault: cây rẽ nhánh việc còn treo (/debts).
   Nguồn chân lý + luật phân loại nằm trong vault (Vault Operation/Sổ Nợ Vault);
   module này CHỈ vẽ — không tự suy diễn thứ tự, không hard-code danh sách nợ.
   Bố cục: mỗi nhóm một băng ngang, trong băng cột = độ sâu phụ thuộc (lá trái →
   gốc phải). Node là HTML (CSS lo wrap/scroll), mũi tên vẽ bằng SVG SAU khi
   layout xong — đo bằng getBoundingClientRect nên phải chờ 1 khung hình. */
import { $, esc, byId } from './state.js';
import { wsOpen } from './workspace.js';

let DB = null;              // dữ liệu /debts lần fetch gần nhất
let readyOnly = false;      // bộ lọc "chỉ việc làm ngay được"

const BUCKET_LABEL = {
  ready: 'làm ngay được',
  waiting_dep: 'chờ việc khác',
  waiting_gate: 'chờ điều kiện',
  closed: 'đã đóng',
};

/* Note nguồn của một món nợ -> node trên graph (mở được bằng Reader).
   byId khoá theo đường dẫn; vault đổi cấu trúc thì fallback so stem. */
function nodeForNote(p) {
  if (!p) return null;
  const direct = byId.get(p);
  if (direct) return direct;
  const stem = p.split('/').pop().replace(/\.md$/i, '');
  for (const node of byId.values()) {
    if (node.kind === 'note' && node.stem === stem) return node;
  }
  return null;
}

function gateText(d) {
  return (d.blocking_gates || [])
    .map(g => (DB.gates[g] || {}).desc || g).join(' · ');
}

function nodeHtml(d) {
  const bits = [];
  if (d.unblocks) bits.push(`gỡ nút cho ${d.unblocks}`);
  if (d.bucket === 'waiting_dep') bits.push('cần: ' + d.unmet.join(', '));
  if (d.bucket === 'waiting_gate') bits.push(gateText(d));
  const tip = [d.why || '', bits.join(' · ')].filter(Boolean).join('\n');
  const note = (d.source || {}).note || '';
  return `<button class="dbt-node b-${d.bucket}" data-id="${esc(d.id)}" data-note="${esc(note)}"
      title="${esc(tip)}">
    <span class="dbt-p">${esc(d.priority || 'P?')}</span>
    <span class="dbt-t">${esc(d.title)}</span>
    ${d.unblocks ? `<span class="dbt-u" title="Trả xong món này thì ${d.unblocks} món khác hết chờ">⛓${d.unblocks}</span>` : ''}
  </button>`;
}

function render() {
  const shown = DB.debts.filter(d => d.bucket !== 'closed' && (!readyOnly || d.bucket === 'ready'));
  const c = DB.counts || {};
  $('dbt-sum').innerHTML =
    `<b>${(c.ready || 0) + (c.waiting_dep || 0) + (c.waiting_gate || 0)}</b> món đang mở · ` +
    `<span class="b-ready">${c.ready || 0} làm ngay được</span> · ` +
    `<span class="b-waiting_dep">${c.waiting_dep || 0} chờ việc khác</span> · ` +
    `<span class="b-waiting_gate">${c.waiting_gate || 0} chờ điều kiện</span> · ` +
    `${c.closed || 0} đã đóng · 🖥 ${esc(DB.host || '')}`;

  const maxLayer = shown.reduce((m, d) => Math.max(m, d.layer || 0), 0);
  let html = '';
  for (const g of DB.groups) {
    const mine = shown.filter(d => d.group === g.id);
    if (!mine.length) continue;
    html += `<div class="dbt-band"><div class="dbt-bh">${esc(g.title)}</div><div class="dbt-cols">`;
    for (let L = 0; L <= maxLayer; L++) {
      const col = mine.filter(d => (d.layer || 0) === L);
      html += `<div class="dbt-col">${col.map(nodeHtml).join('')}</div>`;
    }
    html += '</div></div>';
  }
  if (!html) html = '<div class="dbt-empty">Không còn món nợ nào trong bộ lọc này.</div>';
  $('dbt-graph').innerHTML = `<svg id="dbt-edges"></svg>${html}`;

  $('dbt-graph').querySelectorAll('.dbt-node').forEach(el => {
    el.onclick = () => {
      const node = nodeForNote(el.dataset.note);
      if (!node) return;
      closeDebts();
      wsOpen(node);
    };
  });
  // Layout xong mới đo được toạ độ — vẽ mũi tên ở khung hình kế tiếp
  requestAnimationFrame(drawEdges);
}

function drawEdges() {
  const svg = document.getElementById('dbt-edges');
  const wrap = $('dbt-graph');
  if (!svg || !wrap) return;
  const base = wrap.getBoundingClientRect();
  const pos = new Map();
  wrap.querySelectorAll('.dbt-node').forEach(el => {
    const r = el.getBoundingClientRect();
    pos.set(el.dataset.id, {
      x1: r.left - base.left + wrap.scrollLeft, x2: r.right - base.left + wrap.scrollLeft,
      y: r.top - base.top + wrap.scrollTop + r.height / 2,
    });
  });
  const paths = [];
  for (const d of DB.debts) {
    const to = pos.get(d.id);
    if (!to) continue;
    for (const dep of d.depends || []) {
      const from = pos.get(dep);
      if (!from) continue;
      const mx = (from.x2 + to.x1) / 2;
      paths.push(`<path d="M${from.x2} ${from.y} C${mx} ${from.y} ${mx} ${to.y} ${to.x1} ${to.y}"/>`);
    }
  }
  svg.setAttribute('width', wrap.scrollWidth);
  svg.setAttribute('height', wrap.scrollHeight);
  svg.innerHTML =
    '<defs><marker id="dbt-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">' +
    '<path d="M0 0 L8 4 L0 8 z" fill="var(--cyan)"/></marker></defs>' + paths.join('');
}

export async function openDebts() {
  $('debts').classList.add('show');
  if (!DB) $('dbt-graph').innerHTML = '<div class="dbt-empty">Đang đọc sổ nợ…</div>';
  try {
    const r = await fetch('/debts', { cache: 'no-store' });
    if (r.status === 404) {
      $('dbt-sum').textContent = '';
      $('dbt-graph').innerHTML = '<div class="dbt-empty">Vault này chưa có sổ nợ ' +
        '(<code>Vault Operation/Sổ Nợ Vault</code>).</div>';
      return;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    render();
  } catch (e) {
    $('dbt-graph').innerHTML = `<div class="dbt-empty">Không đọc được sổ nợ: ${esc(String(e))}</div>`;
  }
}

export function closeDebts() { $('debts').classList.remove('show'); }

export function initDebts() {
  $('dbt-open').onclick = () => openDebts();
  $('dbt-x').onclick = closeDebts;
  $('debts').onclick = ev => { if (ev.target === $('debts')) closeDebts(); };  // click nền mờ = đóng
  $('dbt-ready').onclick = () => {
    readyOnly = !readyOnly;
    $('dbt-ready').classList.toggle('on', readyOnly);
    if (DB) render();
  };
  // Esc bắt ở pha capture: modal chồng modal (switcher/dash) không cướp phím
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('debts').classList.contains('show')) {
      ev.stopPropagation();
      closeDebts();
    }
  }, true);
  window.addEventListener('resize', () => { if (DB && $('debts').classList.contains('show')) drawEdges(); });
}

/* Số tóm tắt cho section trong panel — gọi lúc boot, không mở overlay. */
export async function pollDebtCount() {
  try {
    const r = await fetch('/debts', { cache: 'no-store' });
    if (!r.ok) { $('dbt-mini').textContent = 'chưa có sổ nợ trong vault này'; return; }
    DB = await r.json();
    const c = DB.counts || {};
    $('dbt-mini').innerHTML = `<b>${c.ready || 0}</b> việc làm ngay được · ` +
      `${(c.waiting_dep || 0) + (c.waiting_gate || 0)} đang chờ`;
  } catch (e) {
    $('dbt-mini').textContent = 'không đọc được sổ nợ';
  }
}
