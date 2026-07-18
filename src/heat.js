/* heat.js — heatmap tần suất truy xuất (/heat): trạng thái + poll + render top-list */
import { S, byId, $, esc } from './state.js';
import { flyTo, refreshAllNodes } from './graph.js';
import { agentHit } from './effects.js';

let heatMax = 0, heatCounts = {}, heatTop = [];
let heatScope = 'window', lastHeat = {};   /* 'window' = log cuộn ngắn hạn · 'all' = tích luỹ dài hạn (vault) */
let lastHeatSig = null;                    /* chữ ký top-list — data không đổi thì khỏi rebuild DOM mỗi 4s */
export function heatActive() { return S.heatMode && heatMax > 0; }
export function heatNorm(n) { return heatActive() ? Math.min(1, Math.sqrt((n.__heat || 0) / heatMax)) : 0; }
function applyHeat(h) {
  lastHeat = h || {};
  heatCounts = (h && h.counts) || {};
  heatMax = (h && h.max) || 0;
  heatTop = (h && h.top) || [];
  if (S.data && S.data.nodes) S.data.nodes.forEach(n => n.__heat = heatCounts[n.id] || 0);
  renderHeatStats();
  renderHeatTop();
  if (S.heatMode) refreshAllNodes();
}
export async function pollHeat() {
  try { const r = await fetch('/heat?scope=' + heatScope, { cache: 'no-store' }); applyHeat(await r.json()); } catch (e) {}
}
export function setHeatScope(s) {
  heatScope = s;
  $('heat-window').classList.toggle('on', s === 'window');
  $('heat-all').classList.toggle('on', s === 'all');
  pollHeat();
}
function renderHeatStats() {
  const el = $('heat-stats'); if (!el) return;
  const h = lastHeat || {}, tot = h.total || 0, dis = h.distinct || 0;
  if (h.scope === 'all') {
    const since = h.since ? new Date(h.since * 1000).toLocaleDateString('vi-VN') : '—';
    const mc = (h.machines || []).length;
    el.textContent = `Tích luỹ · ${tot} lượt · ${dis} note · từ ${since}` + (mc > 1 ? ` · ${mc} máy` : '');
  } else {
    el.textContent = `Gần đây (log cuộn) · ${tot} lượt · ${dis} note`;
  }
}
function renderHeatTop() {
  const wrap = $('heat-top'); if (!wrap) return;
  const sig = heatScope + '#' + heatTop.map(t => t.file + ':' + t.n).join('|');
  if (sig === lastHeatSig) return;
  lastHeatSig = sig;
  if (!heatTop.length) { wrap.innerHTML = '<div id="heat-empty">Chưa có dữ liệu truy xuất.</div>'; return; }
  const mx = heatTop[0].n || 1;
  wrap.innerHTML = heatTop.map(t => {
    const node = byId.get(t.file);
    const stem = node ? node.stem : (t.file || '').split('/').pop().replace(/\.md$/i, '');
    const w = Math.round(100 * t.n / mx);
    const col = node ? node.color : '#6e6597';
    return `<div class="heatrow" data-file="${esc(t.file)}" title="${esc(stem)} · ${t.n} lượt"><span class="hn">${esc(stem)}</span><span class="hbar"><span style="width:${w}%;background:${col}"></span></span><span class="hc">${t.n}</span></div>`;
  }).join('');
  wrap.querySelectorAll('.heatrow').forEach(el => {
    el.onclick = () => { const n = byId.get(el.dataset.file); if (n) { flyTo(n, 900); agentHit(n, 'read', true); } };
  });
}
