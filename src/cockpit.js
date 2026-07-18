/* cockpit.js — giai đoạn 3 Vault Cockpit (Cockpit): thanh tua phát lại hành trình
   agent CẢ NGÀY (/timeline) + dashboard hiệu quả truy xuất (/dashboard).
   Replay = "tour theo sự kiện": playhead nhảy theo THỨ TỰ event với delay nén
   (gap thật hàng giờ không chiếu 1:1); effects.js giữ nguyên quyền pacing hop
   (contract P4.3) — driver ở đây chỉ backpressure (queue agent đầy thì chờ).
   Mở thanh tua = ẩn #hint + #layout-fab (:root.tl-open) — bài học va chạm dải
   đáy 13/07 (hint đè cụm nút). Dashboard = modal pattern #qs, Esc bắt capture. */
import { byId, $, esc, ICONS } from './state.js';
import { flyTo } from './graph.js';
import { agentFlow, endAgentFlow, agentTrails, agentHit } from './effects.js';
import { agentVisible, agentColor, agentBadge, fmtDur } from './activity.js';

const SPEEDS = [1, 2, 4];

/* ---------- state thanh tua ---------- */
let tl = null;        // {day, events, t0, t1, idx, curTs, playing, timer, speed}

const fmtDay = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
const fmtClock = ts => new Date((ts || 0) * 1000).toTimeString().slice(0, 8);
// event từ journal máy KHÁC (log 2 máy sync qua vault, 16/07) → ghi rõ tên máy
const hostHint = e => (tl && e.host && e.host !== tl.host) ? ` · 🖥 ${esc(e.host)}` : '';
const stemOf = f => {
  const n = byId.get(f);
  return n ? n.stem : (f || '').split('/').pop().replace(/\.md$/i, '');
};

function populateDays(days, day) {
  const sel = $('ck-day');
  sel.innerHTML = (days || []).map(d =>
    `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${fmtDay(d)}</option>`).join('');
}

/* ---------- thanh tua: dựng track ---------- */
function frac(ts) { return Math.max(0, Math.min(1, (ts - tl.t0) / (tl.t1 - tl.t0 || 1))); }
function buildTrack() {
  const first = tl.events[0].ts, last = tl.events[tl.events.length - 1].ts;
  // t0/t1 làm tròn theo GIỜ LOCAL (Date, không chia epoch — múi giờ lẻ vẫn đúng nhãn)
  const d0 = new Date(first * 1000); d0.setMinutes(0, 0, 0);
  tl.t0 = d0.getTime() / 1000;
  tl.t1 = Math.max(tl.t0 + 3600, Math.ceil((last - tl.t0) / 3600) * 3600 + tl.t0);
  const spanH = (tl.t1 - tl.t0) / 3600;
  const step = Math.max(1, Math.ceil(spanH / 8));
  let ticks = '';
  for (let t = tl.t0; t <= tl.t1; t += 3600 * step)
    ticks += `<div class="tl-tick" style="left:${(frac(t) * 100).toFixed(2)}%">` +
             `<span>${new Date(t * 1000).getHours()}h</span></div>`;
  $('tl-ticks').innerHTML = ticks;
  $('tl-dots').innerHTML = tl.events.map(e => {
    const c = agentColor(e.agent);
    return `<div class="tl-dot" style="left:${(frac(e.ts) * 100).toFixed(2)}%;background:${c};color:${c}"` +
           ` title="${fmtClock(e.ts)} · ${ICONS[e.type] || ''} ${esc(stemOf(e.file))} · ${esc(e.agent)}${hostHint(e)}"></div>`;
  }).join('');
}
function setCursor(ts) {
  tl.curTs = ts;
  $('tl-cursor').style.left = (frac(ts) * 100).toFixed(2) + '%';
}
function setNow(html) { $('tl-now').innerHTML = html; }
function setPlayBtn() { $('tl-play').textContent = tl && tl.playing ? '⏸' : '▶'; }

/* ---------- thanh tua: phát ---------- */
function dispatch(ev) {
  const file = (ev.file || '').replace(/\\/g, '/');
  const node = byId.get(file);
  setNow(`<b>${tl.idx + 1}/${tl.events.length}</b> · ${fmtClock(ev.ts)} ${ICONS[ev.type] || ''} ` +
         `${esc(stemOf(file))} ${agentBadge(ev.agent)}${hostHint(ev)}`);
  if (node && agentVisible(ev.agent)) agentFlow(ev.agent, node, ev.type, true, ev);
}
function step() {
  if (!tl || !tl.playing) return;
  if (tl.idx >= tl.events.length) { pause(); setNow('Hết ngày — ▶ phát lại từ đầu.'); return; }
  const ev = tl.events[tl.idx];
  // backpressure: hàng đợi hop của agent này còn dày → chờ, KHÔNG phát tiếp
  // (tab ẩn rAF dừng → hop không xong → tự đứng lại thay vì dồn 500 hop)
  const tr = agentTrails.get(ev.agent);
  if (tr && tr.queue.length >= 3) { tl.timer = setTimeout(step, 300); return; }
  dispatch(ev);
  setCursor(ev.ts);
  tl.idx++;
  const nxt = tl.events[tl.idx];
  const gap = nxt ? Math.max(0, nxt.ts - ev.ts) : 0;
  const delay = Math.min(1200, Math.max(260, gap * 12)) / tl.speed;   // nén thời gian chết
  tl.timer = setTimeout(step, delay);
}
function play() {
  if (!tl || !tl.events.length) return;
  if (tl.idx >= tl.events.length) { tl.idx = 0; setCursor(tl.t0); }   // hết ngày → phát lại từ đầu
  tl.playing = true;
  setPlayBtn();
  clearTimeout(tl.timer);
  step();
}
function pause() {
  if (!tl) return;
  tl.playing = false;
  clearTimeout(tl.timer);
  setPlayBtn();
}
function seekClientX(x) {
  if (!tl || !tl.events.length) return;
  const r = $('tl-track').getBoundingClientRect();
  const ts = tl.t0 + Math.max(0, Math.min(1, (x - r.left) / (r.width || 1))) * (tl.t1 - tl.t0);
  let i = tl.events.findIndex(e => e.ts >= ts);
  if (i < 0) i = tl.events.length;
  tl.idx = i;
  setCursor(ts);
  setNow(`Tua tới ${fmtClock(ts)}` + (i < tl.events.length ? ` — event kế: ${fmtClock(tl.events[i].ts)}` : ' — hết ngày'));
}

export async function openTimeline(day) {
  pause();
  try {
    const r = await fetch('/timeline?day=' + encodeURIComponent(day || ''), { cache: 'no-store' });
    const d = await r.json();
    populateDays(d.days, d.day);
    tl = { day: d.day, host: d.host, events: (d.events || []).filter(e => typeof e.ts === 'number'),
           t0: 0, t1: 1, idx: 0, curTs: 0, playing: false, timer: 0, speed: SPEEDS[0] };
    $('tl-speed').textContent = '×' + tl.speed;
    document.documentElement.classList.add('tl-open');   // #hint + #layout-fab nhường chỗ
    $('timeline').classList.add('show');
    const ags = new Set(tl.events.map(e => e.agent));
    if (!tl.events.length) {
      $('tl-info').textContent = fmtDay(tl.day);
      $('tl-ticks').innerHTML = ''; $('tl-dots').innerHTML = '';
      setNow('Không có hoạt động trong ngày này.');
      setCursor(0); setPlayBtn();
      return;
    }
    $('tl-info').textContent = `${fmtDay(tl.day)} · ${tl.events.length} event · ${ags.size} agent`;
    buildTrack();
    setCursor(tl.t0);
    setNow(`${fmtClock(tl.events[0].ts)} → ${fmtClock(tl.events[tl.events.length - 1].ts)} — ▶ để phát lại.`);
    setPlayBtn();
  } catch (e) {
    tl = null;
    setNow('Không tải được timeline: ' + esc(String(e)));
  }
}
export function closeTimeline() {
  if (tl) {
    pause();
    new Set(tl.events.map(e => e.agent)).forEach(endAgentFlow);   // vệt đang chạy tự chơi nốt rồi tắt
  }
  tl = null;
  $('timeline').classList.remove('show');
  document.documentElement.classList.remove('tl-open');
}

/* ---------- dashboard hiệu quả truy xuất ---------- */
function tile(v, label, title, warn) {
  return `<div class="tile${warn ? ' warn' : ''}"${title ? ` title="${esc(title)}"` : ''}>` +
         `<b>${esc(String(v))}</b><span>${esc(label)}</span></div>`;
}
function renderDash(d) {
  $('dash-day').textContent = d.day
    ? `${fmtDay(d.day)} · ${fmtClock(d.first).slice(0, 5)} → ${fmtClock(d.last).slice(0, 5)}` : '—';
  if (!d.total) {
    $('dash-body').innerHTML = '<div class="dash-empty">Không có hoạt động trong ngày này.</div>';
    return;
  }
  let html = '<div id="dash-tiles">' +
    tile(d.total, 'lượt truy xuất', `👁${d.by_type.read} · 🔎${d.by_type.search} · ✏️${d.by_type.edit}`) +
    tile(d.distinct, 'note khác nhau') +
    tile(d.chains, 'chuỗi truy xuất') +
    tile(fmtDur(d.span_total), 'tổng thời gian') +
    tile(d.rereads, 'đọc lặp', 'đọc lặp cùng note trong một chuỗi — tín hiệu cấu trúc chưa tối ưu', d.rereads > 0) +
    '</div>';
  const maxH = Math.max(1, ...d.hours.map(h => h.read + h.search + h.edit));
  html += '<div class="dash-h">Theo giờ trong ngày</div><div id="dash-hours">' +
    d.hours.map((h, i) => {
      const tot = h.read + h.search + h.edit;
      const seg = t => h[t] ? `<i class="${t[0]}" style="height:${Math.max(2, Math.round(56 * h[t] / maxH))}px"></i>` : '';
      return `<div class="dh-col" title="${String(i).padStart(2, '0')}:00 — ${tot} lượt` +
             (tot ? ` (👁${h.read} 🔎${h.search} ✏️${h.edit})` : '') + '">' +
             seg('read') + seg('search') + seg('edit') + '</div>';
    }).join('') +
    '</div><div id="dash-hlab"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>';
  html += '<div class="dash-h">Theo agent</div>' + d.agents.map(a =>
    `<div class="dash-agent">${agentBadge(a.agent)}` +
    `<span title="đọc / tìm / sửa">👁${a.read} 🔎${a.search} ✏️${a.edit}</span>` +
    `<span title="note khác nhau">📄${a.distinct}</span>` +
    `<span title="chuỗi truy xuất">⛓${a.chains}</span>` +
    (a.rereads ? `<span class="rr" title="đọc lặp">⟳${a.rereads}</span>` : '') +
    (a.reedits ? `<span class="re" title="sửa lặp">✎${a.reedits}</span>` : '') +
    `<span class="m" title="tổng thời gian các chuỗi">${fmtDur(a.span)}</span></div>`).join('');
  const mx = d.top.length ? (d.top[0].n || 1) : 1;
  html += '<div class="dash-h">Note truy xuất nhiều nhất</div><div id="dash-top">' +
    d.top.map(t => {
      const node = byId.get(t.file);
      const stem = stemOf(t.file);
      const col = node ? node.color : 'var(--faint)';
      return `<div class="heatrow" data-file="${esc(t.file)}" title="${esc(stem)} · ${t.n} lượt` +
             ` (👁${t.types.read} 🔎${t.types.search} ✏️${t.types.edit})">` +
             `<span class="hn">${esc(stem)}</span><span class="hbar">` +
             `<span style="width:${Math.round(100 * t.n / mx)}%;background:${col}"></span></span>` +
             `<span class="hc">${t.n}</span></div>`;
    }).join('') + '</div>';
  $('dash-body').innerHTML = html;
  $('dash-body').querySelectorAll('.heatrow').forEach(el => {
    el.onclick = () => {
      const n = byId.get(el.dataset.file);
      if (n) { closeDashboard(); flyTo(n, 900); agentHit(n, 'read', true); }
    };
  });
}
export async function openDashboard(day) {
  try {
    const r = await fetch('/dashboard?day=' + encodeURIComponent(day || ''), { cache: 'no-store' });
    const d = await r.json();
    populateDays(d.days, d.day);
    renderDash(d);
    $('dash').classList.add('show');
  } catch (e) {
    $('dash-day').textContent = '—';
    $('dash-body').innerHTML = `<div class="dash-empty">Không tải được dashboard: ${esc(String(e))}</div>`;
    $('dash').classList.add('show');
  }
}
export function closeDashboard() { $('dash').classList.remove('show'); }

/* ---------- init ---------- */
export function initCockpit() {
  // Nạp danh sách ngày NGAY KHI BOOT — không thì dropdown "Ngày trong log" trống
  // cho tới lần mở replay/dashboard đầu tiên. User kịp mở trước khi fetch xong
  // (options đã có) thì nhường — không đè lựa chọn đang dùng.
  fetch('/timeline?day=', { cache: 'no-store' }).then(r => r.json())
    .then(d => { if (!$('ck-day').options.length) populateDays(d.days, d.day); })
    .catch(() => {});   // server lỗi → trống như cũ, hai nút vẫn tự fallback ngày mới nhất
  $('ck-replay').onclick = () => openTimeline($('ck-day').value);
  $('ck-dash').onclick = () => openDashboard($('ck-day').value);
  $('ck-day').onchange = () => {
    // đổi ngày áp ngay vào view đang mở
    if ($('timeline').classList.contains('show')) openTimeline($('ck-day').value);
    if ($('dash').classList.contains('show')) openDashboard($('ck-day').value);
  };
  $('tl-play').onclick = () => { if (tl) { tl.playing ? pause() : play(); } };
  $('tl-speed').onclick = () => {
    if (!tl) return;
    tl.speed = SPEEDS[(SPEEDS.indexOf(tl.speed) + 1) % SPEEDS.length];
    $('tl-speed').textContent = '×' + tl.speed;
  };
  $('tl-x').onclick = closeTimeline;
  // seek: click / kéo trên track (pointer capture như #sb-resize)
  const track = $('tl-track');
  track.onpointerdown = ev => {
    ev.preventDefault();
    try { track.setPointerCapture(ev.pointerId); } catch (e) {}
    seekClientX(ev.clientX);
    track.onpointermove = e => seekClientX(e.clientX);
    track.onpointerup = track.onpointercancel = () => {
      track.onpointermove = track.onpointerup = track.onpointercancel = null;
    };
  };
  $('dash-x').onclick = closeDashboard;
  $('dash').onclick = ev => { if (ev.target === $('dash')) closeDashboard(); };  // click nền mờ = đóng
  // Esc bắt CAPTURE + stopPropagation — không rơi xuống handler Esc của Reader
  // (gotcha modal chồng modal, cùng pattern quick switcher)
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('dash').classList.contains('show')) {
      ev.stopPropagation();
      closeDashboard();
    }
  }, true);
}
