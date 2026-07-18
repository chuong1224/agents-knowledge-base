/* ui.js — panel điều khiển: chip/lọc, section gập/mở + persist, demo hiệu ứng,
   refreshData khi vault đổi. (Card thông tin cũ đã thay bằng reader.js — giai đoạn 1.) */
import { S, byId, adjacency, tagOn, extOn, $, esc, deAccent, GROUP_ORDER } from './state.js';
import { applyFilters, refreshAllNodes, updateStats, applyNodeState, physics, pauseRotate, setNeon, linkAux, setCluster } from './graph.js';
import { pulses, agentFlow, endAgentFlow } from './effects.js';
import { pollChains, addFeedEvent } from './activity.js';
import { pollHeat, setHeatScope } from './heat.js';
import { openReader } from './reader.js';
import { buildTree } from './finder.js';

const EXT_ON_STORAGE_KEY = 'kbgraph3d.extOn.v1';
const CLUSTER_STORAGE_KEY = 'kbgraph3d.clusterOn.v1';   // V1: 🧲 gom cụm nhóm màu

export function restoreClusterFromStorage() {
  // Gọi SAU buildUI (sw() đã gắn handler) — .click() để switch/aria/force đồng bộ một đường
  try {
    if (localStorage.getItem(CLUSTER_STORAGE_KEY) === 'on' && !$('sw-cluster').classList.contains('on'))
      $('sw-cluster').click();
  } catch (e) {}
}

export function saveExtOnToStorage() {
  try { localStorage.setItem(EXT_ON_STORAGE_KEY, JSON.stringify([...extOn])); } catch (e) {}
}

export function restoreExtOnFromStorage() {
  try {
    const raw = localStorage.getItem(EXT_ON_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const known = new Set(S.all.nodes.filter(n => n.kind === 'file').map(n => n.ext));
    extOn.clear();
    arr.forEach(ext => { if (typeof ext === 'string' && known.has(ext)) extOn.add(ext); });
  } catch (e) {}
}

/* ---------- Ư2.1: section panel gập/mở được + nhớ trạng thái ----------
   Panel từ "trang settings dài" thành dashboard: mặc định chỉ mở Tìm note + phần SỐNG
   (Chuỗi truy xuất, Hoạt động Agent), settings gập lại; trạng thái nhớ per-user
   (cùng pattern extOn). Header gắn handler 1 LẦN trong boot — không đi qua buildUI()
   nên không dính gotcha chồng listener P0.3. */
const SECT_OPEN_STORAGE_KEY = 'kbgraph3d.sectOpen.v1';
const SECT_DEFAULT_OPEN = ['search', 'chains', 'agent', 'cockpit'];
let sectOpenSet = new Set(SECT_DEFAULT_OPEN);
export function sectOpen(id) { return sectOpenSet.has(id); }
function saveSectOpen() {
  try { localStorage.setItem(SECT_OPEN_STORAGE_KEY, JSON.stringify([...sectOpenSet])); } catch (e) {}
}
function restoreSectOpen() {
  try {
    const raw = localStorage.getItem(SECT_OPEN_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) sectOpenSet = new Set(arr.filter(x => typeof x === 'string'));
  } catch (e) {}
}
export function initSections() {
  restoreSectOpen();
  document.querySelectorAll('#panel .sect[data-sect]').forEach(el => {
    const id = el.dataset.sect;
    el.classList.toggle('closed', !sectOpenSet.has(id));
    const h = el.querySelector('h2');
    if (!h) return;
    h.onclick = ev => {
      if (ev.target.closest('.mini')) return;        // nút trong header (Tất cả/Ẩn hết/↻) không toggle
      const open = !el.classList.toggle('closed');
      h.setAttribute('aria-expanded', String(open));
      if (open) sectOpenSet.add(id); else sectOpenSet.delete(id);
      saveSectOpen();
      if (open && id === 'chains') pollChains();     // mở lại → dữ liệu tươi ngay (poll nền nghỉ lúc gập)
      if (open && id === 'heat') pollHeat();
    };
    // Ư5.2: header gập/mở dùng được bằng phím như click
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.setAttribute('aria-expanded', String(!el.classList.contains('closed')));
    h.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); h.click(); } };
  });
}

/* ---------- demo ---------- */
export function initDemo() {
  $('btn-demo').onclick = () => {
    // Demo flow: đi một ĐƯỜNG 5 node nối tiếp (ưu tiên node kề cho giống phiên thật,
    // hết node kề thì nhảy xa — vệt vẫn nối, đúng bản chất chuỗi truy xuất)
    const btn = $('btn-demo');
    if (btn.disabled) return;   // demo đang chạy — bấm chồng làm 2 lượt chèn lẫn cùng queue 'Demo'
    const pool = S.data.nodes.filter(n => n.kind === 'note').sort((a, b) => b.degree - a.degree).slice(0, 20);
    if (!pool.length) return;
    btn.disabled = true;
    const types = ['search', 'read', 'read', 'edit', 'read'];
    const path = [pool[Math.floor(Math.random() * Math.min(8, pool.length))]];
    for (let i = 1; i < types.length; i++) {
      const prev = path[i - 1];
      const nbs = (adjacency.get(prev) || []).filter(l => !linkAux(l))
        .map(l => l.source === prev ? l.target : l.source)
        .filter(n => n.kind === 'note' && !path.includes(n));
      path.push(nbs.length ? nbs[Math.floor(Math.random() * nbs.length)]
                           : pool[Math.floor(Math.random() * pool.length)]);
    }
    path.forEach((n, i) => setTimeout(() => {
      agentFlow('Demo', n, types[i], false, { ts: Date.now() / 1000, type: types[i], file: n.id });
      addFeedEvent({ type: types[i], ts: Date.now() / 1000, file: n.id }, n);
    }, i * 1150));
    setTimeout(() => { endAgentFlow('Demo'); btn.disabled = false; }, types.length * 1150 + 2000);
  };
}

/* ---------- UI ---------- */
export function chip(label, color, on, onClick) {
  const el = document.createElement('span');
  el.className = 'chip' + (on ? ' on' : ' off');
  el.style.color = color;
  el.innerHTML = `<span class="dot" style="background:${color}"></span>${esc(label)}`;
  el.onclick = onClick;
  // Ư5.2: chip focus + bấm được bằng phím (Enter/Space)
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(); } };
  return el;
}
function buildTagChips() {
  const wrap = $('tagchips'); wrap.innerHTML = '';
  S.all.nodes.filter(n => n.kind === 'tag')
    .sort((a, b) => b.degree - a.degree)
    .forEach(t => {
      const el = chip(`${t.name} · ${t.degree}`, t.color, tagOn.has(t.id), () => {
        tagOn.has(t.id) ? tagOn.delete(t.id) : tagOn.add(t.id);
        el.classList.toggle('on'); el.classList.toggle('off');
        applyFilters();
      });
      wrap.appendChild(el);
    });
}
function buildExtChips() {
  const wrap = $('extchips'); wrap.innerHTML = '';
  const counts = new Map();
  S.all.nodes.filter(n => n.kind === 'file').forEach(n => counts.set(n.ext, (counts.get(n.ext) || 0) + 1));
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([ext, c]) => {
    const color = S.all.nodes.find(n => n.kind === 'file' && n.ext === ext).color;
    const el = chip(`.${ext} · ${c}`, color, extOn.has(ext), () => {
      extOn.has(ext) ? extOn.delete(ext) : extOn.add(ext);
      el.classList.toggle('on'); el.classList.toggle('off');
      saveExtOnToStorage();
      applyFilters();
    });
    wrap.appendChild(el);
  });
}
export function buildUI() {
  const groups = new Map();
  S.all.nodes.filter(n => n.kind === 'note').forEach(n => groups.set(n.group, (groups.get(n.group) || 0) + 1));
  const legend = $('legend'); legend.innerHTML = '';
  if (S.selectedGroup && !groups.has(S.selectedGroup)) S.selectedGroup = null;   // nhóm đang lọc biến mất khỏi vault → bỏ lọc
  // Ư4.2 + Ư4.3: MỘT nguồn sự thật cho trạng thái chip — on/off theo selectedGroup,
  // chạy cả lúc BUILD (refreshData 45s hết desync "UI nói một đằng graph làm một nẻo")
  // lẫn lúc click; chip bị loại mang cặp on/off mờ 45% y hệt chip tag/đuôi.
  const syncLegend = () => [...legend.children].forEach(c => {
    const on = !S.selectedGroup || c.dataset.group === S.selectedGroup;
    c.classList.toggle('on', on);
    c.classList.toggle('off', !on);
  });
  GROUP_ORDER.filter(g => groups.has(g)).forEach(g => {
    const color = S.all.nodes.find(n => n.group === g).color;
    const el = chip(`${g} · ${groups.get(g)}`, color, true, () => {
      S.selectedGroup = S.selectedGroup === g ? null : g;
      syncLegend();
      refreshAllNodes();
      updateStats();       // lọc nhóm màu cũng phải nhảy số "hiện/tổng" như lọc tag/đuôi
    });
    el.dataset.group = g;
    legend.appendChild(el);
  });
  syncLegend();

  buildTagChips();
  buildExtChips();
  buildTree();     // cây vault (Finder) — rebuild cùng nhịp refreshData khi vault đổi
  $('tag-all').onclick = () => { S.all.nodes.filter(n => n.kind === 'tag').forEach(n => tagOn.add(n.id)); buildTagChips(); applyFilters(); };
  $('tag-none').onclick = () => { tagOn.clear(); buildTagChips(); applyFilters(); };
  $('ext-all').onclick = () => { S.all.nodes.filter(n => n.kind === 'file').forEach(n => extOn.add(n.ext)); saveExtOnToStorage(); buildExtChips(); applyFilters(); };
  $('ext-none').onclick = () => { extOn.clear(); saveExtOnToStorage(); buildExtChips(); applyFilters(); };

  const dl = $('notes-dl'); dl.innerHTML = '';
  S.all.nodes.filter(n => n.kind === 'note').forEach(n => { const o = document.createElement('option'); o.value = n.stem; dl.appendChild(o); });
  $('search').onchange = () => {   // gán đè, KHÔNG addEventListener — buildUI() chạy lại (refreshData) không được chồng listener
    const miss = $('search-miss');
    miss.classList.remove('show');
    const qRaw = $('search').value.trim();
    if (!qRaw) return;
    const q = deAccent(qRaw);                    // Ư3.2: khớp không cần gõ dấu
    const pool = S.data.nodes.filter(n => n.kind === 'note');
    const node = pool.find(n => deAccent(n.stem) === q) || pool.find(n => deAccent(n.stem).includes(q));
    if (node) { pulses.push({ node, t0: performance.now(), dur: 2600, color: '#ffffff' }); openReader(node); }
    else miss.classList.add('show');             // Ư3.2: không match phải NÓI, không im lặng
  };
  $('search').oninput = () => $('search-miss').classList.remove('show');
  $('search').onkeydown = ev => { if (ev.key === 'Escape') { $('search').value = ''; $('search-miss').classList.remove('show'); } };

  const sw = (id, fn) => {
    const el = $(id);
    el.onclick = () => { el.classList.toggle('on'); el.setAttribute('aria-checked', el.classList.contains('on')); fn(el.classList.contains('on')); };
    // Ư5.2: switch là div tự chế — cấp role/aria + Enter/Space để dùng được bằng phím
    el.setAttribute('role', 'switch');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-checked', el.classList.contains('on'));
    el.setAttribute('aria-label', (el.parentElement.textContent || '').trim());
    el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } };
  };
  sw('sw-rotate', on => { S.Graph.controls().autoRotate = on; });
  sw('sw-follow', () => {});
  sw('sw-labels', on => { S.labelsOn = on; S.data.nodes.forEach(applyNodeState); });
  sw('sw-particles', () => { S.particlesOn = $('sw-particles').classList.contains('on'); S.Graph.linkDirectionalParticles(S.Graph.linkDirectionalParticles()); });
  sw('sw-trails', on => { S.trailsOn = on; if (S.trailGroup) S.trailGroup.visible = on; });
  sw('sw-cluster', on => {
    setCluster(on);
    try { localStorage.setItem(CLUSTER_STORAGE_KEY, on ? 'on' : 'off'); } catch (e) {}
  });
  sw('sw-ambient', on => { S.ambientOn = on; });
  sw('sw-heat', on => { S.heatMode = on; if (on) pollHeat(); refreshAllNodes(); });
  $('heat-window').onclick = () => setHeatScope('window');
  $('heat-all').onclick = () => setHeatScope('all');
  $('sl-neon').oninput = e => setNeon(e.target.value / 100);

  $('ph-bung').onclick = () => {
    physics('bung');
    $('ph-bung').classList.add('on'); $('ph-calm').classList.remove('on');
  };
  $('ph-calm').onclick = () => {
    physics('calm');
    $('ph-calm').classList.add('on'); $('ph-bung').classList.remove('on');
  };
  $('ph-fit').onclick = () => {
    S.Graph.zoomToFit(1000, 70); pauseRotate();
  };
  $('ph-unpin').onclick = () => {
    // Ư3.1: gỡ mọi ghim tay trên TOÀN vault (all — node đang bị lọc ẩn cũng gỡ), reheat 1 lần
    let k = 0;
    S.all.nodes.forEach(n => { if (n.fx != null || n.fy != null || n.fz != null) { n.fx = n.fy = n.fz = null; k++; } });
    if (k) S.Graph.d3ReheatSimulation();
  };
  $('panel-toggle').onclick = () => {
    const hidden = $('panel').classList.toggle('hidden');
    if (!hidden) { pollChains(); pollHeat(); }   // mở lại panel → dữ liệu tươi ngay (poll nền đã nghỉ lúc ẩn)
  };
}

/* ---------- auto refresh khi vault đổi ---------- */
export async function refreshData() {
  try {
    const fresh = await (await fetch('/graph-data')).json();
    const key = m => JSON.stringify({ ...m, generated: 0 });
    if (key(fresh.meta) === key(S.all.meta)) {
      S.all.meta = fresh.meta;
      $('st-gen').textContent = fresh.meta.generated || '—';
      return;
    }
    const pos = new Map(S.all.nodes.map(n => [n.id, n]));
    fresh.nodes.forEach(n => {
      const old = pos.get(n.id);
      if (old) Object.assign(n, { x: old.x, y: old.y, z: old.z, vx: old.vx, vy: old.vy, vz: old.vz, fx: old.fx, fy: old.fy, fz: old.fz });
      if (n.kind === 'tag' && !pos.has(n.id)) tagOn.add(n.id); // tag mới: mặc định hiện
    });
    // V5: node MỚI (chưa có trong S.all cũ) không có x/y/z → thư viện khởi tạo gần gốc
    // toạ độ rồi bay xuyên không gian tìm chỗ (giật mắt khi agent đang tạo nhiều note).
    // Có ≥1 hàng xóm CŨ đã có vị trí → sinh ngay tại trọng tâm hàng xóm + jitter ±8
    // (phá đối xứng kẻo nhiều node mới chồng đúng một điểm); link ở đây là id chuỗi thô
    // từ server (chưa qua graphData nên chưa thành object). Không hàng xóm cũ → để
    // thư viện tự lo như trước. Đường êm V4a tự áp vì applyFilters() bên dưới.
    const fid = new Map(fresh.nodes.map(n => [n.id, n]));
    const spawn = new Map();               // node mới → tổng toạ độ hàng xóm cũ có vị trí
    const acc = (novo, o) => {
      if (o.x === undefined) return;       // hàng xóm cũ nhưng chưa từng hiện (file đang ẩn)
      let c = spawn.get(novo);
      if (!c) spawn.set(novo, c = { x: 0, y: 0, z: 0, k: 0 });
      c.x += o.x; c.y += o.y; c.z += o.z; c.k++;
    };
    for (const l of fresh.links) {
      const s = fid.get(l.source), t = fid.get(l.target);
      if (!s || !t) continue;
      if (!pos.has(s.id) && pos.has(t.id)) acc(s, t);
      if (!pos.has(t.id) && pos.has(s.id)) acc(t, s);
    }
    for (const [n, c] of spawn) {
      n.x = c.x / c.k + (Math.random() * 16 - 8);
      n.y = c.y / c.k + (Math.random() * 16 - 8);
      n.z = c.z / c.k + (Math.random() * 16 - 8);
    }
    S.all = fresh;
    buildUI();
    applyFilters();
  } catch (e) {}
}
