/* insight.js — 🩺 Sức khoẻ vault (/insight): "vault đang khoẻ không", đối trọng của
   📊 Dashboard ("agent đã làm gì hôm nay").

   Module này CHỈ trình bày — mọi định nghĩa chỉ số nằm ở .graph3d/insight.py (cùng
   hàm mà CLI --report dùng), đừng tính lại con số nào ở đây.
   KHÔNG poll nền: chỉ số ở thang ngày/tuần nên fetch lúc mở section, mở overlay và
   khi bấm ↻ — thêm một vòng poll 4s vào đây chỉ tốn CPU cho số không đổi. */
import { $, esc, byId } from './state.js';
import { wsOpen } from './workspace.js';

let DB = null;

function fmtDay(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('vi-VN');
}

/* Một dòng note: tên note (stem) + số bên phải. Note không còn trong graph
   (đường dẫn cũ trong log/heat) thì KHÔNG click được — đánh dấu mờ thay vì im lặng. */
function row(file, right, tip, barPct, barCol) {
  const node = byId.get(file);
  const stem = node ? node.stem : (file || '').split('/').pop().replace(/\.md$/i, '');
  const dead = node ? '' : ' ins-dead';
  const bar = barPct == null ? '' :
    `<span class="hbar"><span style="width:${barPct}%;background:${barCol || 'var(--cyan)'}"></span></span>`;
  return `<div class="heatrow${dead}" data-file="${esc(file)}" title="${esc(tip || file)}">` +
    `<span class="hn">${esc(stem)}</span>${bar}<span class="hc">${esc(String(right))}</span></div>`;
}

function list(rows, empty) {
  return rows.length ? rows.join('') : `<div class="dash-empty">${esc(empty)}</div>`;
}

function histHtml(hist, oldest) {
  const mx = Math.max(1, ...Object.values(hist));
  const bars = Object.entries(hist).map(([label, n]) =>
    `<div class="ins-hrow"><span class="l">${esc(label)}</span>` +
    `<span class="b"><span style="width:${Math.round(100 * n / mx)}%"></span></span>` +
    `<span class="c">${n}</span></div>`).join('');
  return `<div class="ins-hist">${bars}</div>` +
    `<div class="ins-note">Đơn vị: NGÀY kể từ lần cuối có agent đụng · note già nhất ${oldest.toFixed(1)} ngày</div>`;
}

function render() {
  const d = DB, p = d.params, c = d.coverage, w = d.window, wk = d.weak, da = d.data;
  $('ins-sum').innerHTML =
    `<b>${c.notes}</b> note · coverage <b>${c.pct}%</b> · cửa sổ <b>${p.days}</b> ngày cuộn` +
    ` · nguội ≥ <b>${p.cold_days}</b> ngày · 🖥 ${esc(d.host || '')}`;

  const tiles = [
    ['Ghé tuần này', w.cur_notes + ' note', ''],
    ['Lượt tuần này', w.cur_events + (w.cur_events >= w.prev_events ? ' ▲' : ' ▼'), ''],
    ['Chưa bao giờ đụng', c.never, c.never ? 'warn' : ''],
    ['Nguội ≥' + p.cold_days + 'd', d.cold.total, d.cold.total ? 'warn' : ''],
    ['Đang nguội đi', d.cooling.total, ''],
    ['Không nằm index', wk.no_index.total, wk.no_index.total ? 'warn' : ''],
  ].map(([lab, val, cls]) =>
    `<div class="tile ${cls}"><b>${esc(String(val))}</b><span>${esc(lab)}</span></div>`).join('');

  const hotMax = Math.max(1, ...d.hot.map(h => h.n));
  const hot = d.hot.map(h => row(h.file, h.n,
    `${h.file}\ntuần này ${h.n} lượt · tuần trước ${h.prev} · chênh ${h.delta > 0 ? '+' : ''}${h.delta}`,
    Math.round(100 * h.n / hotMax), (byId.get(h.file) || {}).color));

  const cooling = d.cooling.list.map(x => row(x.file, x.prev + ' → 0',
    `${x.file}\ntuần trước ${x.prev} lượt · tuần này chưa lần nào`));

  const cold = d.cold.list.map(x => row(x.file, x.days.toFixed(1) + 'd',
    `${x.file}\nlần cuối ${fmtDay(x.last)} (${x.days.toFixed(1)} ngày) · tổng ${x.total} lượt`));

  const never = d.never.list.map(x => row(x.file, x.degree + '🔗',
    `${x.file}\nchưa có dấu vết truy xuất nào · ${x.degree} liên kết note`));
  const unread = d.unread.list.map(f => row(f, 'grep',
    `${f}\nchỉ tình cờ khớp tìm kiếm — chưa lần nào được đọc/sửa`));

  const small = wk.small.map(cl =>
    `<div class="ins-note">cụm ${cl.size} note: ${cl.files.map(f =>
      esc((byId.get(f) || {}).stem || f)).join(' · ')}</div>`).join('');
  const areas = d.areas.map(a =>
    `<div class="ins-arow"><span class="n">${esc(a.area)}</span>` +
    `<span>${a.notes} note</span><span>${a.touched} đã đụng</span>` +
    `<span class="${a.never ? 'w' : ''}">${a.never} chưa</span>` +
    `<span>${a.cold} nguội</span><span class="${a.orphans ? 'w' : ''}">${a.orphans} mồ côi</span></div>`).join('');

  $('ins-body').innerHTML =
    `<div id="ins-tiles">${tiles}</div>` +
    `<div class="dash-h">🔥 Nóng nhất ${p.days} ngày qua (số = lượt; tooltip có tuần trước)</div>${list(hot, 'Chưa có lượt truy xuất nào trong cửa sổ này.')}` +
    `<div class="dash-h">🌡 Tuổi lần đụng cuối — toàn vault</div>${histHtml(d.cold.hist, d.cold.oldest_age)}` +
    `<div class="dash-h">🥶 Đang nguội đi (tuần trước ≥${p.cooling_min} lượt, tuần này 0)</div>${list(cooling, 'Không có note nào vừa rời tay.')}` +
    `<div class="dash-h">🕸 Nguội ≥${p.cold_days} ngày (${d.cold.total} note, nguội nhất trước)</div>${list(cold, 'Không có note nào nguội quá ngưỡng.')}` +
    `<div class="dash-h">🚫 Chưa vào đường truy xuất (${d.never.total} không dấu vết · ${d.unread.total} chỉ khớp tìm kiếm)</div>${list(never.concat(unread), 'Mọi note đều đã từng được agent mở.')}` +
    `<div class="dash-h">🔗 Cụm ít kết nối — đồ thị note–note (${wk.components} thành phần, lớn nhất ${wk.largest} note)</div>` +
    (small || '') +
    list(wk.orphans.list.map(f => row(f, 'mồ côi', f + '\nkhông có liên kết note nào'))
      .concat(wk.thin.list.map(f => row(f, '1 dây', f + '\nchỉ có đúng 1 liên kết note')))
      .concat(wk.no_index.list.map(f => row(f, 'ngoài index', f + '\nkhông liên kết tới note index/MOC nào'))),
      'Không có note rời rạc: mọi note đều nhiều dây và nằm trong index.') +
    `<div class="dash-h">🗺 Theo khu vực</div><div class="ins-areas">${areas}</div>`;

  $('ins-foot').innerHTML =
    `Cửa sổ dữ liệu: event từ <b>${fmtDay(da.oldest_event)}</b> (${da.events} event, log cuộn) · ` +
    `heat tích luỹ từ <b>${fmtDay(da.heat_since)}</b> · máy: ${esc((da.heat_machines || []).join(', ') || '—')}` +
    (da.heat_stale_paths ? ` · ${da.heat_stale_paths} đường dẫn trong heat store không còn trong vault (note đã rename/xoá)` : '') +
    `<br>Không tính note báo cáo do chính công cụ sinh — vì vậy tổng note ở đây lệch 1 so với thanh stats của graph.`;

  $('ins-body').querySelectorAll('.heatrow').forEach(el => {
    const node = byId.get(el.dataset.file);
    if (!node) return;                       // note không còn tồn tại: không mở được
    el.onclick = () => { closeInsight(); wsOpen(node); };
  });
}

function renderMini() {
  const d = DB;
  if (!d) return;
  $('ins-mini').innerHTML =
    `coverage <b>${d.coverage.pct}%</b> · ${d.coverage.never} chưa đụng · ` +
    `<b>${d.cold.total}</b> nguội ≥${d.params.cold_days}d · ${d.weak.orphans.total} mồ côi · ` +
    `${d.weak.no_index.total} ngoài index`;
}

export async function pollInsight() {
  try {
    const r = await fetch('/insight', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    renderMini();
    if ($('insight').classList.contains('show')) render();
  } catch (e) {
    $('ins-mini').textContent = 'không đo được sức khoẻ vault: ' + String(e);
  }
}

export async function openInsight() {
  $('insight').classList.add('show');
  if (!DB) {
    $('ins-body').innerHTML = '<div class="dash-empty">Đang đo sức khoẻ vault…</div>';
    await pollInsight();
  }
  if (DB) render();
}

export function closeInsight() { $('insight').classList.remove('show'); }

export function initInsight() {
  $('ins-open').onclick = () => openInsight();
  $('ins-refresh').onclick = ev => { ev.stopPropagation(); pollInsight(); };
  $('ins-x').onclick = closeInsight;
  $('insight').onclick = ev => { if (ev.target === $('insight')) closeInsight(); };
  // Esc bắt ở pha capture như các modal khác (switcher/dash/workmap không cướp phím)
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('insight').classList.contains('show')) {
      ev.stopPropagation();
      closeInsight();
    }
  }, true);
}
