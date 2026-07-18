/* workspace.js — giai đoạn 4 Vault Cockpit (Workspace): Reader đa tab theo pane,
   ghim note, lịch sử đọc gần đây. Module này SỞ HỮU model (tabs/active per-pane,
   pins, recent) + persist localStorage + render tabbar & 2 section sidebar;
   reader.js chỉ lo fetch /note + render markdown vào pane. Thuần client-side —
   không endpoint mới, không database phụ trong vault (ràng buộc Vault Cockpit).
   Top-level chỉ ĐỊNH NGHĨA (không gọi chéo module lúc eval) — an toàn vòng import. */
import { S, $, esc } from './state.js';
import { renderPane, paneRefs, saveScroll, syncPin, closeReader } from './reader.js';
import { openSwitcher } from './finder.js';

const WS_KEY = 'kbgraph3d.ws.v1';
const PINS_KEY = 'kbgraph3d.pins.v1';
const RECENT_KEY = 'kbgraph3d.recent.v1';
const SB_SECT_KEY = 'kbgraph3d.sbSect.v1';
const RECENT_MAX = 100;      // cap lịch sử đọc trong storage
const RECENT_SHOW = 8;       // số dòng hiện ở section sidebar
export const HIST_MAX = 50;  // stack ← quay lại của MỖI tab (trước: 1 stack chung cả Reader)

// tab = { note: id, hist: [id…], scroll: px } — hist/scroll chỉ sống trong phiên,
// persist chỉ giữ ids + tab active (đủ để mở lại đúng workspace, không kéo rác theo).
export const WS = { tabs: [[], []], active: [-1, -1] };
let pins = [];               // [noteId] — ghim mới lên ĐẦU danh sách
let recent = [];             // [{id, ts}] — mới nhất trước, dedup move-to-front
let sbOpen = new Set(['pins', 'recent']);

/* ---------- persist ---------- */
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function persistWS() { saveJSON(WS_KEY, { t: WS.tabs.map(l => l.map(t => t.note)), a: WS.active }); }

/* ---------- helpers ---------- */
function noteMap() {
  const m = new Map();
  S.all.nodes.forEach(n => { if (n.kind === 'note') m.set(n.id, n); });
  return m;
}
export function tabAt(p) { return WS.tabs[p][WS.active[p]] || null; }
function splitOn() { return WS.tabs[1].length > 0; }
function ago(ts) {
  const d = Date.now() / 1000 - ts;
  if (d < 90) return 'vừa xong';
  if (d < 3600) return Math.round(d / 60) + 'ph';
  if (d < 86400) return Math.round(d / 3600) + 'h';
  if (d < 7 * 86400) return Math.round(d / 86400) + ' ngày';
  return new Date(ts * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/* ---------- render tabbar + trạng thái split ---------- */
function renderTabbar(p) {
  const R = paneRefs(p), m = noteMap();
  R.tabsWrap.innerHTML = WS.tabs[p].map((t, i) => {
    const n = m.get(t.note), on = i === WS.active[p];
    return `<div class="tab${on ? ' on' : ''}" role="tab" tabindex="0" aria-selected="${on}"` +
      ` data-i="${i}" title="${esc(n ? n.name : t.note)}">` +
      `<span class="dot" style="background:${n ? n.color : 'var(--faint)'}"></span>` +
      `<span class="n">${esc(n ? n.stem : '(đã xoá)')}</span><span class="tx" title="Đóng tab">✕</span></div>`;
  }).join('');
}
function syncSplit() { $('reader').classList.toggle('split', splitOn()); }
function showReader() {
  const el = $('reader');
  const was = el.classList.contains('show');
  el.classList.add('show');
  return was;
}

/* ---------- mở note — MỌI đường vào Reader đều qua đây ----------
   Hành vi cũ giữ nguyên: mở = thay note trong tab active (push history tab đó).
   newTab (Ctrl+click / middle-click / nút ＋) = tab mới; note đã mở sẵn trong pane
   thì nhảy tới tab đó thay vì nhân đôi. Mở từ ngoài luôn vào pane 0 (pane chính);
   opts.pane=1 chỉ có nghĩa khi đang split (link bấm trong pane 1 ở lại pane 1). */
export function wsOpen(node, opts = {}) {
  if (!node || node.kind !== 'note') return;
  const p = (opts.pane === 1 && splitOn()) ? 1 : 0;
  const list = WS.tabs[p];
  saveScroll(p);
  if (opts.newTab || WS.active[p] < 0) {
    const dup = list.findIndex(t => t.note === node.id);
    if (dup >= 0) WS.active[p] = dup;
    else { list.push({ note: node.id, hist: [], scroll: 0 }); WS.active[p] = list.length - 1; }
  } else {
    const t = list[WS.active[p]];
    if (t.note !== node.id) {
      // note đã mở ở tab khác cùng pane → NHẢY tới tab đó (không nhân đôi, không đè tab hiện tại)
      const dup = list.findIndex((x, k) => k !== WS.active[p] && x.note === node.id);
      if (dup >= 0) WS.active[p] = dup;
      else {
        t.hist.push(t.note);
        if (t.hist.length > HIST_MAX) t.hist.shift();
        t.note = node.id; t.scroll = 0;
      }
    }
  }
  persistWS();
  const was = showReader();
  syncSplit();
  renderTabbar(0); renderTabbar(1);
  renderPane(p, opts);
  // panel vừa bung từ trạng thái ẩn mà đang split → pane còn lại render nốt cho đủ
  const q = 1 - p;
  if (!was && splitOn() && WS.active[q] >= 0) renderPane(q, { fly: false });
}

export function wsSwitch(p, i) {
  if (i < 0 || i >= WS.tabs[p].length || i === WS.active[p]) return;
  saveScroll(p);
  WS.active[p] = i;
  persistWS();
  renderTabbar(p);
  renderPane(p, { fly: false });   // chuyển tab = đọc tiếp, camera đứng yên
}

export function wsCloseTab(p, i) {
  const list = WS.tabs[p], a = WS.active[p];
  if (i < 0 || i >= list.length) return;
  saveScroll(p);
  const closingActive = i === a;
  list.splice(i, 1);
  WS.active[p] = list.length ? (i < a ? a - 1 : Math.min(a, list.length - 1)) : -1;
  let merged = false;
  if (!WS.tabs[0].length && WS.tabs[1].length) {   // pane 0 trống → pane 1 thành pane chính
    WS.tabs[0] = WS.tabs[1]; WS.tabs[1] = [];
    WS.active[0] = WS.active[1]; WS.active[1] = -1;
    merged = true;
  }
  persistWS();
  syncSplit();
  renderTabbar(0); renderTabbar(1);
  if (!WS.tabs[0].length) { closeReader(); return; }          // hết tab → đóng panel
  if (merged) renderPane(0, { fly: false });
  else if (closingActive && WS.active[p] >= 0) renderPane(p, { fly: false });
}

/* ⧉ tách tab active sang pane bên cạnh (pane 1 mở khi có tab; ⧉ ở pane 1 = gộp về).
   Pane kia đã mở sẵn note này thì nhảy tới tab đó — không nhân đôi. */
export function wsSplit(p) {
  const list = WS.tabs[p], i = WS.active[p];
  if (i < 0) return;
  if (p === 0 && list.length === 1 && !WS.tabs[1].length) return;  // tách xong pane chính trống — vô nghĩa
  saveScroll(0); saveScroll(1);
  const q = 1 - p;
  const [t] = list.splice(i, 1);
  const dup = WS.tabs[q].findIndex(x => x.note === t.note);
  if (dup >= 0) WS.active[q] = dup;
  else { WS.tabs[q].push(t); WS.active[q] = WS.tabs[q].length - 1; }
  WS.active[p] = list.length ? Math.min(i, list.length - 1) : -1;
  if (!WS.tabs[0].length) {                        // pane 0 không được trống — hoán vai
    WS.tabs[0] = WS.tabs[1]; WS.tabs[1] = [];
    WS.active[0] = WS.active[1]; WS.active[1] = -1;
  }
  persistWS();
  syncSplit();
  renderTabbar(0); renderTabbar(1);
  renderPane(0, { fly: false });
  if (splitOn()) renderPane(1, { fly: false });
}

/* ← quay lại per-tab (model ở đây vì đổi note trong tab = đổi nhãn tab + persist) */
export function wsBack(p) {
  const t = tabAt(p);
  if (!t || !t.hist.length) return;
  t.note = t.hist.pop();
  t.scroll = 0;
  persistWS();
  renderTabbar(p);
  renderPane(p);
}

/* ---------- ghim note + lịch sử đọc ---------- */
export function isPinned(id) { return pins.includes(id); }
export function togglePin(id) {
  const i = pins.indexOf(id);
  if (i >= 0) pins.splice(i, 1); else pins.unshift(id);
  saveJSON(PINS_KEY, pins);
  renderSbSections();
}
export function pushRecent(id) {
  const ts = Date.now() / 1000;
  const i = recent.findIndex(r => r.id === id);
  if (i === 0) { recent[0].ts = ts; }
  else {
    if (i > 0) recent.splice(i, 1);
    recent.unshift({ id, ts });
    if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
  }
  saveJSON(RECENT_KEY, recent);
  renderSbSections();
}
export function recentNotes(limit) {
  const m = noteMap(), out = [];
  for (const r of recent) {
    const n = m.get(r.id);
    if (n) out.push({ node: n, ts: r.ts });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- 2 section sidebar: 📌 Ghim + 🕘 Gần đây (trống thì tự ẩn) ---------- */
function sbRow(n, extra) {
  return `<div class="sbr" role="button" tabindex="0" data-note="${esc(n.id)}" title="${esc(n.name)}">` +
    `<span class="dot" style="background:${n.color}"></span><span class="n">${esc(n.stem)}</span>${extra || ''}</div>`;
}
export function renderSbSections() {
  if (!S.all || !$('sb-pins')) return;             // gọi sớm từ buildTree lúc boot — chưa init xong
  const m = noteMap();
  const pn = pins.map(id => m.get(id)).filter(Boolean);
  const pbox = $('sb-pins');
  pbox.classList.toggle('has', pn.length > 0);
  pbox.querySelector('.c').textContent = pn.length ? String(pn.length) : '';
  pbox.querySelector('.sb-list').innerHTML =
    pn.map(n => sbRow(n, '<span class="ux" title="Bỏ ghim">✕</span>')).join('');
  const rc = recentNotes(RECENT_SHOW);
  const rbox = $('sb-recent');
  rbox.classList.toggle('has', rc.length > 0);
  rbox.querySelector('.c').textContent = recent.length ? String(recent.length) : '';
  rbox.querySelector('.sb-list').innerHTML =
    rc.map(r => sbRow(r.node, `<span class="t">${ago(r.ts)}</span>`)).join('');
}

/* ---------- init ---------- */
export function initWorkspace() {
  pins = loadJSON(PINS_KEY, []).filter(x => typeof x === 'string');
  recent = loadJSON(RECENT_KEY, []).filter(r => r && typeof r.id === 'string' && typeof r.ts === 'number');
  const sbs = loadJSON(SB_SECT_KEY, null);
  if (Array.isArray(sbs)) sbOpen = new Set(sbs.filter(x => typeof x === 'string'));

  // khôi phục workspace — chỉ giữ note còn tồn tại trong graph, KHÔNG tự bung panel
  const d = loadJSON(WS_KEY, null);
  if (d && Array.isArray(d.t)) {
    const ok = new Set(S.all.nodes.filter(n => n.kind === 'note').map(n => n.id));
    WS.tabs = [0, 1].map(p => (Array.isArray(d.t[p]) ? d.t[p] : [])
      .filter(id => ok.has(id)).map(id => ({ note: id, hist: [], scroll: 0 })));
    if (!WS.tabs[0].length && WS.tabs[1].length) { WS.tabs[0] = WS.tabs[1]; WS.tabs[1] = []; }
    WS.active = [0, 1].map(p => WS.tabs[p].length
      ? Math.max(0, Math.min((Array.isArray(d.a) ? d.a[p] : 0) | 0, WS.tabs[p].length - 1)) : -1);
  }

  // tabbar mỗi pane: click chuyển tab / ✕ đóng, middle-click đóng, Enter/Space như click
  [0, 1].forEach(p => {
    const R = paneRefs(p);
    R.tabsWrap.addEventListener('click', ev => {
      const tab = ev.target.closest('.tab');
      if (!tab) return;
      ev.target.closest('.tx') ? wsCloseTab(p, +tab.dataset.i) : wsSwitch(p, +tab.dataset.i);
    });
    R.tabsWrap.addEventListener('auxclick', ev => {
      const tab = ev.target.closest('.tab');
      if (tab && ev.button === 1) { ev.preventDefault(); wsCloseTab(p, +tab.dataset.i); }
    });
    R.tabsWrap.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const tab = ev.target.closest('.tab');
      if (tab) { ev.preventDefault(); wsSwitch(p, +tab.dataset.i); }
    });
    R.plus.onclick = () => openSwitcher({ newTab: true });
  });

  // 2 section sidebar: gập/mở persist; click note mở Reader (Ctrl/middle-click tab mới);
  // ✕ trên hàng ghim = bỏ ghim; ✕ header Gần đây = xoá lịch sử
  [['pins', 'sb-pins'], ['recent', 'sb-recent']].forEach(([key, id]) => {
    const box = $(id);
    box.classList.toggle('closed', !sbOpen.has(key));
    const h = box.querySelector('.sb-h');
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.setAttribute('aria-expanded', String(sbOpen.has(key)));
    h.onclick = ev => {
      if (ev.target.closest('.clr')) return;
      const open = !box.classList.toggle('closed');
      h.setAttribute('aria-expanded', String(open));
      open ? sbOpen.add(key) : sbOpen.delete(key);
      saveJSON(SB_SECT_KEY, [...sbOpen]);
    };
    h.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); h.click(); } };
    const list = box.querySelector('.sb-list');
    const act = (ev, forceNew) => {
      const row = ev.target.closest('.sbr');
      if (!row) return;
      if (ev.target.closest('.ux')) { togglePin(row.dataset.note); syncPin(0); syncPin(1); return; }
      const m = noteMap(), n = m.get(row.dataset.note);
      if (n) wsOpen(n, { newTab: forceNew || ev.ctrlKey || ev.metaKey });
    };
    list.addEventListener('click', ev => act(ev, false));
    list.addEventListener('auxclick', ev => { if (ev.button === 1) { ev.preventDefault(); act(ev, true); } });
    list.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(ev, false); } });
  });
  const clr = $('sb-recent').querySelector('.clr');
  clr.onclick = () => { recent = []; saveJSON(RECENT_KEY, recent); renderSbSections(); };
  renderSbSections();
}
