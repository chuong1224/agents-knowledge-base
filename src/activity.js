/* activity.js — poll /activity + feed sự kiện + màu/legend agent + chuỗi truy xuất (/chains) */
import { S, byId, $, esc, ICONS } from './state.js';
import { flyTo } from './graph.js';
import { agentHit, agentFlow, replayFlow, agentTrails } from './effects.js';
import { refreshData, chip } from './ui.js';

/* ---------- agent activity ---------- */
let activityCursors = null; /* null = lần poll đầu replay tail; sau đó = {path: offset} per-nguồn — opaque, server cấp */
let serverBoot = null;      /* boot_id server gửi về — đổi = server vừa restart */
export async function pollActivity() {
  if (pollActivity._busy) return;   // fetch chậm hơn nhịp 800ms → không bắn chồng (2 request cùng cursor = event nhân đôi)
  pollActivity._busy = true;
  try {
    const replay = !activityCursors;
    let url = '/activity?cursor=' + encodeURIComponent(JSON.stringify(activityCursors || {}));
    if (replay) url += '&replay=1';
    const r = await fetch(url, { cache: 'no-store' });
    const data = await r.json();
    /* Server vừa khởi động lại (đổi boot_id) -> tự resync, KHÔNG cần Ctrl+F5:
       reset cursor để tick sau replay tail sạch + nạp lại graph phòng khi note đổi. */
    if (data.boot_id && serverBoot && data.boot_id !== serverBoot) {
      serverBoot = data.boot_id;
      activityCursors = null;
      refreshData();
      $('agent-dot').classList.add('live');
      return;
    }
    serverBoot = data.boot_id || serverBoot;
    activityCursors = (data.cursor && typeof data.cursor === 'object') ? data.cursor : {};
    /* Server ép replay (nguồn rotate / mồi lại cursor) -> hiện feed nhưng KHÔNG bắn lại hiệu ứng */
    const srvReplay = replay || !!data.replay;
    $('agent-dot').classList.add('live');
    if (data.events && data.events.length) {
      const ags = new Set(knownAgents);
      data.events.forEach(ev => { if (ev.agent) ags.add(ev.agent); });
      if (ags.size !== knownAgents.length) buildAgentLegend([...ags]);
    }
    (data.events || []).forEach(ev => {
      ev.file = (ev.file || '').replace(/\\/g, '/');   // normalize backslash → forward slash
      const node = byId.get(ev.file);
      addFeedEvent(ev, node);
      if (node && !srvReplay && agentVisible(ev.agent)) agentFlow(ev.agent, node, ev.type, false, ev);
    });
  } catch (e) { $('agent-dot').classList.remove('live'); }
  finally { pollActivity._busy = false; }
}
export function addFeedEvent(ev, node) {
  if (ev.agent && !agentVisible(ev.agent)) return;   // agent đang bị ẩn
  const feed = $('feed');
  const empty = feed.querySelector('.empty'); if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'ev ' + (ev.type || 'read');
  const t = new Date((ev.ts || 0) * 1000).toTimeString().slice(0, 8);
  const stem = node ? node.stem : (ev.file || '').split('/').pop().replace(/\.md$/i, '');
  const miss = node ? '' : ' title="Node chưa có trên graph — vẫn hiện thao tác"';
  el.innerHTML = `<span class="t">${t}</span><span>${ICONS[ev.type] || ''}</span><span class="n"${miss}>${esc(stem || ev.file)}</span>${ev.agent ? agentBadge(ev.agent) : ''}`;
  el.onclick = () => { if (node) { flyTo(node, 1000); agentHit(node, ev.type, true); } };
  feed.prepend(el);
  while (feed.children.length > 80) feed.lastChild.remove();
}
/* ---------- agents + chuỗi truy xuất (đo hiệu quả retrieval) ---------- */
const AGENT_PALETTE = ['#04d9ff', '#ff9e2c', '#b14aed', '#2bd96b', '#f9f871', '#ff2e97', '#57b8ff', '#ff6ad5'];
const agentColorMap = new Map();
export function agentColor(name) {
  name = name || 'Claude';
  if (!agentColorMap.has(name)) {
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    let idx = h % AGENT_PALETTE.length, tries = 0;
    const used = new Set(agentColorMap.values());
    while (used.has(AGENT_PALETTE[idx]) && tries < AGENT_PALETTE.length) { idx = (idx + 1) % AGENT_PALETTE.length; tries++; }
    agentColorMap.set(name, AGENT_PALETTE[idx]);
  }
  return agentColorMap.get(name);
}
const agentHidden = new Set();
export function agentVisible(name) { return !agentHidden.has(name || 'Claude'); }
export function agentBadge(name) {
  const c = agentColor(name || 'Claude');
  return `<span class="agentbadge" style="color:${c}"><span class="adot"></span>${esc(name || 'Claude')}</span>`;
}
export function fmtDur(s) {
  s = Math.max(0, s || 0);
  if (s < 60) return (Math.round(s * 10) / 10) + 's';
  const m = Math.floor(s / 60), r = Math.round(s - m * 60);
  return m + 'm' + (r ? (' ' + r + 's') : '');
}
let knownAgents = [];
export function buildAgentLegend(agents) {
  if (agents && agents.length) {
    const set = new Set(knownAgents); agents.forEach(a => set.add(a));
    knownAgents = [...set];
  }
  const wrap = $('agent-legend'); if (!wrap) return;
  wrap.innerHTML = '';
  knownAgents.forEach(a => {
    // dùng chung chip() — legend agent hưởng luôn a11y Ư5.2, hết bản dựng chip thứ 2 lệch dần
    const el = chip(a, agentColor(a), agentVisible(a), () => {
      if (agentHidden.has(a)) agentHidden.delete(a); else agentHidden.add(a);
      buildAgentLegend(); renderChains(lastChains);
    });
    wrap.appendChild(el);
  });
}
let lastChains = [];
const openChains = new Set();    /* key chuỗi ĐANG mở — do người dùng chủ động bật/tắt */
let lastChainSig = null;         /* chữ ký data+filter: trùng thì KHÔNG render lại (khỏi gập/giật) */
function chainKey(c) { return (c.agent || '') + '|' + Math.round(c.start || 0); }
export async function pollChains() {
  try {
    const r = await fetch('/chains?limit=30', { cache: 'no-store' });
    const d = await r.json();
    if (d.agents) buildAgentLegend(d.agents);
    lastChains = d.chains || [];
    renderChains(lastChains);
  } catch (e) {}
}
function renderChains(chains) {
  const wrap = $('chains'); if (!wrap) return;
  /* Chỉ render lại khi DATA hoặc BỘ LỌC đổi → giữ nguyên chuỗi người dùng đang mở
     (poll 4s trước đây wipe innerHTML nên chuỗi tự gập lại — đã sửa). */
  const sig = JSON.stringify((chains || []).map(c => [c.agent, Math.round(c.start || 0), Math.round(c.end || 0), c.count]))
    + '#' + [...agentHidden].sort().join(',');
  if (sig === lastChainSig) return;
  lastChainSig = sig;
  const vis = (chains || []).filter(c => agentVisible(c.agent));
  $('chain-stats').textContent = vis.length
    ? `${vis.length} chuỗi · ${knownAgents.length} agent · tổng ${fmtDur(vis.reduce((s, c) => s + (c.span || 0), 0))}`
    : '';
  if (!vis.length) {
    wrap.innerHTML = '<div class="empty" style="color:var(--faint);font-size:11.5px;text-align:center;padding:12px 6px">Chưa có chuỗi truy xuất.</div>';
    return;
  }
  wrap.innerHTML = '';
  vis.forEach(c => {
    const t = new Date((c.start || 0) * 1000).toTimeString().slice(0, 5);
    const rr = c.rereads > 0 ? ` <span class="rr" title="đọc lặp — có thể là dấu hiệu cấu trúc chưa tối ưu">⟳${c.rereads}</span>` : '';
    const re = c.reedits > 0 ? ` <span class="re" title="sửa lặp trên cùng file — workflow chỉnh sửa">✎${c.reedits}</span>` : '';
    const box = document.createElement('div'); box.className = 'chain';
    if (openChains.has(chainKey(c))) box.classList.add('open');   /* khôi phục trạng thái mở qua các lần render */
    box.innerHTML =
      `<div class="chd">${agentBadge(c.agent)}<span class="meta">${t} · 📄${c.distinct}${c.count !== c.distinct ? '/' + c.count : ''}${rr}${re}</span><span class="sp">${fmtDur(c.span)}</span><button class="chplay" title="Phát lại chuỗi này trên graph">▶</button></div>` +
      `<div class="body">` +
      c.events.map(e => {
        const stem = (byId.get(e.file) || {}).stem || (e.file || '').split('/').pop().replace(/\.md$/i, '');
        return `<div class="cnote ${e.type || 'read'}" data-file="${esc(e.file)}"><span>${ICONS[e.type] || ''}</span><span class="n">${esc(stem)}</span><span class="cdw">${fmtDur(e.dwell)}</span></div>`;
      }).join('') +
      `</div>`;
    /* Ư1.2: header CHỈ mở/gập (disclosure) — replay tách ra nút ▶ riêng,
       người chỉ muốn đọc danh sách note không còn bị ép xem phim + bay camera */
    box.querySelector('.chd').onclick = () => {
      const k = chainKey(c);
      if (openChains.has(k)) { openChains.delete(k); box.classList.remove('open'); }
      else { openChains.add(k); box.classList.add('open'); }
    };
    box.querySelector('.chplay').onclick = ev => {
      ev.stopPropagation();                     // không toggle disclosure
      const tr = agentTrails.get(c.agent);
      if (tr && (tr.hopActive || tr.queue.length)) return;   // flow cùng agent đang chơi — không chèn lẫn queue
      const first = c.events.map(e => byId.get(e.file)).find(Boolean);
      if (first) flyTo(first, 1000);            // user bấm ▶ = chủ động muốn XEM — bay thẳng, không qua guard
      replayFlow(c.agent, c.events);
    };
    box.querySelectorAll('.cnote').forEach(el => {
      el.onclick = (ev) => { ev.stopPropagation(); const n = byId.get(el.dataset.file); if (n) { flyTo(n, 900); agentHit(n, 'read', true); } };
    });
    wrap.appendChild(box);
  });
}
