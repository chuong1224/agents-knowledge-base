/* integrity.js — 🧪 Toàn vẹn vault (/integrity): "vault có đang GÃY chỗ nào không",
   nằm cùng section 🩺 với insight.js ("vault có được dùng đủ khắp không").

   Module này CHỈ trình bày — mọi định nghĩa check nằm ở .graph3d/integrity.py (cùng
   hàm mà CLI `python .graph3d/integrity.py` gọi), đừng tính lại phép kiểm nào ở đây.
   KHÔNG poll nền: vault không tự gãy giữa hai cú click — fetch lúc mở section, mở
   overlay và khi bấm ↻ (cùng nhịp với insight). */
import { $, esc, byId, focusInto, restoreFocus } from './state.js';
import { tr } from './i18n.js';
import { wsOpen } from './workspace.js';

let DB = null;

/* 🟢 sạch · 🔴 có vấn đề · ⚪ check tắt (vault không có nguồn luật) */
function lamp(c) { return !c.available ? '⚪' : (c.total ? '🔴' : '🟢'); }

/* Mở mục lỗi: note → Reader; file khác → tab mới qua /asset (như cây vault).
   Không phải mục nào cũng là node trên graph: mục "ngoại lệ mồ côi" trỏ thẳng tới
   vault-rules.json (file .json không lên graph) — cứ theo ĐUÔI mà chọn cửa, đừng
   ném file phi-.md vào /note. */
function openItem(rel) {
  const node = byId.get(rel);
  if (node && node.kind === 'note') { closeIntegrity(); wsOpen(node); return; }
  const url = /\.md$/i.test(rel) ? '/note?path=' : '/asset?path=';
  window.open(url + encodeURIComponent(rel), '_blank', 'noopener');
}

function itemRow(it) {
  const node = byId.get(it.file);
  const name = node ? node.stem : (it.file || '').split('/').pop().replace(/\.md$/i, '');
  const where = it.line ? `:${it.line}` : '';
  return `<div class="itg-item" data-file="${esc(it.file)}" title="${esc(it.file + where)}">` +
    `<span class="f">${esc(name)}${esc(where)}</span>` +
    `<span class="d">${esc(it.detail || '')}</span></div>`;
}

/* Nhãn/mô tả/cách sửa của 6 check do integrity.py gửi kèm (tiếng Việt — CLI dùng chính
   chuỗi đó). Trên UI thì ƯU TIÊN từ điển theo id check để còn dịch được; thiếu khoá thì
   rơi về chuỗi server, không bao giờ trống. Server vẫn là nơi ĐỊNH NGHĨA check. */
function cText(c, field) {
  const key = `itg.c.${c.id}.${field}`;
  const s = tr(key);
  return s === key ? (c[field] || '') : s;
}

function checkBlock(c) {
  const head = `<div class="itg-h"><span class="lp">${lamp(c)}</span>` +
    `<b>${esc(cText(c, 'label'))}</b><span class="n">${c.available ? c.total : '—'}</span></div>`;
  let body;
  if (!c.available) {
    body = `<div class="itg-desc">${tr('itg.off')}</div>`;
  } else if (!c.total) {
    body = `<div class="itg-desc">${esc(cText(c, 'desc'))} — ${tr('itg.clean')}</div>`;
  } else {
    const more = c.total > c.list.length
      ? `<div class="itg-desc">${tr('itg.more', { n: c.total - c.list.length })}</div>` : '';
    body = `<div class="itg-desc">${esc(cText(c, 'desc'))}</div>` +
      `<div class="itg-items">${c.list.map(itemRow).join('')}</div>${more}` +
      `<div class="itg-fix">🛠 ${esc(cText(c, 'fix'))}</div>`;
  }
  return `<div class="itg-check${c.total && c.available ? ' bad' : ''}">${head}${body}</div>`;
}

function render() {
  const d = DB, v = d.vault;
  $('itg-sum').innerHTML = d.ok
    ? tr('itg.sum.ok', { c: v.checked, n: v.notes })
    : tr('itg.sum.bad', { p: d.problems, c: v.checked, n: v.notes });

  $('itg-body').innerHTML =
    `<div class="dash-h">${tr('itg.fam.structure')}</div>` +
    d.checks.filter(c => c.family === 'structure').map(checkBlock).join('') +
    `<div class="dash-h">${tr('itg.fam.contract')}</div>` +
    d.checks.filter(c => c.family === 'contract').map(checkBlock).join('');

  const r = d.rules || {};
  $('itg-foot').innerHTML =
    tr('itg.foot.scope', { n: v.notes, f: v.files, m: v.media, i: v.ignored }) +
    (r.loaded ? tr('itg.foot.rules', { p: esc(r.path || ''), m: esc((r.mandatory || []).join(', ')) })
      : tr('itg.foot.norules', { r: esc(r.reason || '?') })) +
    tr('itg.foot.subset');

  $('itg-body').querySelectorAll('.itg-item').forEach(el => {
    el.onclick = () => openItem(el.dataset.file);
  });
}

function renderMini() {
  const d = DB;
  if (!d) return;
  const bad = d.checks.filter(c => c.available && c.total);
  // Nhãn chạy giữa câu nên hạ chữ đầu — CHỈ chữ đầu: `toLowerCase()` cả chuỗi biến
  // "title ≠ tên file ≠ H1" thành "… h1" (audit W41).
  const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
  $('itg-mini').innerHTML = d.ok
    ? tr('itg.mini.ok', { c: d.vault.checked, n: d.vault.notes })
    : tr('itg.mini.bad', { p: d.problems }) +
      bad.map(c => `${c.total} ${esc(lower(cText(c, 'label')))}`).join(' · ');
}

export async function pollIntegrity() {
  try {
    const r = await fetch('/integrity', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    renderMini();
    if ($('integ').classList.contains('show')) render();
  } catch (e) {
    $('itg-mini').textContent = tr('itg.err', { e: String(e) });
  }
}

export async function openIntegrity() {
  $('integ').classList.add('show');
  focusInto($('itg-box'), '#itg-x');
  if (!DB) {
    $('itg-body').innerHTML = `<div class="dash-empty">${tr('itg.checking2')}</div>`;
    await pollIntegrity();
  }
  if (DB) render();
}

export function closeIntegrity() { $('integ').classList.remove('show'); restoreFocus(); }

export function initIntegrity() {
  $('itg-open').onclick = () => openIntegrity();
  // ↻ của section 🩺 làm tươi CẢ HAI bề mặt: insight.js đã gán .onclick, thêm
  // listener thứ hai (không phải gán đè) nên hai module không giẫm chân nhau.
  $('ins-refresh').addEventListener('click', ev => { ev.stopPropagation(); pollIntegrity(); });
  $('itg-x').onclick = closeIntegrity;
  $('integ').onclick = ev => { if (ev.target === $('integ')) closeIntegrity(); };
  // Esc bắt ở pha capture như mọi modal khác (switcher/dash/insight/workmap không cướp phím)
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('integ').classList.contains('show')) {
      ev.stopPropagation();
      closeIntegrity();
    }
  }, true);
}
