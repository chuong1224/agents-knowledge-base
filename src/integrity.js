/* integrity.js — 🧪 Toàn vẹn vault (/integrity): "vault có đang GÃY chỗ nào không",
   nằm cùng section 🩺 với insight.js ("vault có được dùng đủ khắp không").

   Module này CHỈ trình bày — mọi định nghĩa check nằm ở .graph3d/integrity.py (cùng
   hàm mà CLI `python .graph3d/integrity.py` gọi), đừng tính lại phép kiểm nào ở đây.
   KHÔNG poll nền: vault không tự gãy giữa hai cú click — fetch lúc mở section, mở
   overlay và khi bấm ↻ (cùng nhịp với insight). */
import { $, esc, byId } from './state.js';
import { wsOpen } from './workspace.js';

let DB = null;

/* 🟢 sạch · 🔴 có vấn đề · ⚪ check tắt (vault không có nguồn luật) */
function lamp(c) { return !c.available ? '⚪' : (c.total ? '🔴' : '🟢'); }

/* Mở mục lỗi: note → Reader; ảnh/video → tab mới qua /asset (như cây vault). */
function openItem(rel) {
  const node = byId.get(rel);
  if (node && node.kind === 'note') { closeIntegrity(); wsOpen(node); return; }
  if (node) { window.open('/asset?path=' + encodeURIComponent(rel), '_blank', 'noopener'); return; }
  window.open('/note?path=' + encodeURIComponent(rel), '_blank', 'noopener');
}

function itemRow(it) {
  const node = byId.get(it.file);
  const name = node ? node.stem : (it.file || '').split('/').pop().replace(/\.md$/i, '');
  const where = it.line ? `:${it.line}` : '';
  return `<div class="itg-item" data-file="${esc(it.file)}" title="${esc(it.file + where)}">` +
    `<span class="f">${esc(name)}${esc(where)}</span>` +
    `<span class="d">${esc(it.detail || '')}</span></div>`;
}

function checkBlock(c) {
  const head = `<div class="itg-h"><span class="lp">${lamp(c)}</span>` +
    `<b>${esc(c.label)}</b><span class="n">${c.available ? c.total : '—'}</span></div>`;
  let body;
  if (!c.available) {
    body = `<div class="itg-desc">Tắt: vault này không có nguồn luật đếm được ` +
      `(<code>vault-rules.json</code>) nên app không tự đoán tiêu chí.</div>`;
  } else if (!c.total) {
    body = `<div class="itg-desc">${esc(c.desc)} — sạch.</div>`;
  } else {
    const more = c.total > c.list.length
      ? `<div class="itg-desc">… còn ${c.total - c.list.length} mục nữa (xem <code>python .graph3d/integrity.py</code>).</div>` : '';
    body = `<div class="itg-desc">${esc(c.desc)}</div>` +
      `<div class="itg-items">${c.list.map(itemRow).join('')}</div>${more}` +
      `<div class="itg-fix">🛠 ${esc(c.fix)}</div>`;
  }
  return `<div class="itg-check${c.total && c.available ? ' bad' : ''}">${head}${body}</div>`;
}

function render() {
  const d = DB, v = d.vault;
  $('itg-sum').innerHTML = d.ok
    ? `<b>sạch</b> · ${v.checked}/${v.notes} note được kiểm`
    : `<b>${d.problems}</b> vấn đề · ${v.checked}/${v.notes} note được kiểm`;

  $('itg-body').innerHTML =
    `<div class="dash-h">Cấu trúc — cùng tiêu chí gate verify_vault_integrity.py</div>` +
    d.checks.filter(c => c.family === 'structure').map(checkBlock).join('') +
    `<div class="dash-h">Contract — luật đọc từ vault-rules.json</div>` +
    d.checks.filter(c => c.family === 'contract').map(checkBlock).join('');

  const r = d.rules || {};
  $('itg-foot').innerHTML =
    `Phạm vi: <b>${v.notes}</b> note · <b>${v.files}</b> file (<b>${v.media}</b> ảnh/video) — đúng phạm vi graph (bỏ dot-folder). ` +
    `<b>${v.ignored}</b> note được miễn báo lỗi theo tiêu chí gate (tên bắt đầu <code>_</code> hoặc <code>gate_ignore: true</code>).<br>` +
    (r.loaded ? `Nguồn luật: <b>${esc(r.path || '')}</b> — bắt buộc: ${esc((r.mandatory || []).join(', '))}.`
      : `Nguồn luật KHÔNG nạp được (${esc(r.reason || '?')}) → 2 check contract đang tắt.`) +
    `<br>Đèn này là <b>tập con</b> của gate: im lặng ở đây KHÔNG thay cho gate PASS (gate còn bắt CN remnant, và là chuẩn nghiệm thu).`;

  $('itg-body').querySelectorAll('.itg-item').forEach(el => {
    el.onclick = () => openItem(el.dataset.file);
  });
}

function renderMini() {
  const d = DB;
  if (!d) return;
  const bad = d.checks.filter(c => c.available && c.total);
  $('itg-mini').innerHTML = d.ok
    ? `🧪 toàn vẹn: <b>sạch</b> · ${d.vault.checked}/${d.vault.notes} note được kiểm`
    : `🧪 <b>${d.problems}</b> vấn đề: ` +
      bad.map(c => `${c.total} ${esc(c.label.toLowerCase())}`).join(' · ');
}

export async function pollIntegrity() {
  try {
    const r = await fetch('/integrity', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    renderMini();
    if ($('integ').classList.contains('show')) render();
  } catch (e) {
    $('itg-mini').textContent = 'không kiểm được toàn vẹn vault: ' + String(e);
  }
}

export async function openIntegrity() {
  $('integ').classList.add('show');
  if (!DB) {
    $('itg-body').innerHTML = '<div class="dash-empty">Đang kiểm toàn vẹn vault…</div>';
    await pollIntegrity();
  }
  if (DB) render();
}

export function closeIntegrity() { $('integ').classList.remove('show'); }

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
