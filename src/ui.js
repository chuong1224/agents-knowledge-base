/* ui.js — panel điều khiển: chip/lọc, section gập/mở + persist, demo hiệu ứng,
   refreshData khi vault đổi. (Card thông tin cũ đã thay bằng reader.js — giai đoạn 1.) */
import { S, byId, adjacency, tagOn, tagOff, extOn, $, esc, deAccent, GROUP_ORDER,
         vaultStoreGet, vaultStoreSet, vaultStoreRemove } from './state.js';
import { tr } from './i18n.js';
import { applyFilters, refreshAllNodes, updateStats, applyNodeState, physics, pauseRotate, setNeon, linkAux, setCluster } from './graph.js';
import { pulses, agentFlow, endAgentFlow } from './effects.js';
import { pollChains, addFeedEvent } from './activity.js';
import { pollHeat, setHeatScope } from './heat.js';
import { pollInsight } from './insight.js';
import { pollIntegrity } from './integrity.js';
import { openReader } from './reader.js';
import { openFileActions } from './file-actions.js';
import { buildTree } from './finder.js';

const EXT_ON_STORAGE_KEY = 'kbgraph3d.extOn.v1';
const TAG_OFF_STORAGE_KEY = 'kbgraph3d.tagOff.v1';      // 🏷 tag ĐÃ TẮT (lưu phía tắt — xem ghi chú dưới)
const GROUP_STORAGE_KEY = 'kbgraph3d.group.v1';         // nhóm màu đang spotlight (legend)
const CLUSTER_STORAGE_KEY = 'kbgraph3d.clusterOn.v1';   // V1: 🧲 gom cụm nhóm màu

export function restoreClusterFromStorage() {
  // Gọi SAU buildUI (sw() đã gắn handler) — .click() để switch/aria/force đồng bộ một đường
  try {
    if (localStorage.getItem(CLUSTER_STORAGE_KEY) === 'on' && !$('sw-cluster').classList.contains('on'))
      $('sw-cluster').click();
  } catch (e) {}
}

export function saveExtOnToStorage() {
  try { vaultStoreSet(EXT_ON_STORAGE_KEY, JSON.stringify([...extOn])); } catch (e) {}
}

export function restoreExtOnFromStorage() {
  try {
    const raw = vaultStoreGet(EXT_ON_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const known = new Set(S.all.nodes.filter(n => n.kind === 'file').map(n => n.ext));
    extOn.clear();
    arr.forEach(ext => { if (typeof ext === 'string' && known.has(ext)) extOn.add(ext); });
  } catch (e) {}
}

/* ---------- 🏷 tag hiển thị: nhớ lựa chọn qua phiên ----------
   Mặc định tag là HIỆN HẾT (ngược với đuôi file), nên KHÔNG lưu tagOn mà lưu phía
   TẮT (`tagOff`): tag mới sinh trong vault vẫn hiện như cũ, tag user đã tắt thì ở yên
   trạng thái tắt. Không prune theo node hiện có — tag biến mất tạm (đang sửa note)
   quay lại vẫn giữ đúng trạng thái. Từ W180, key thật có suffix vault id qua
   `vaultStore*()` để hai vault cùng có tag trùng tên không dùng chung filter. */
export function saveTagOffToStorage() {
  try { vaultStoreSet(TAG_OFF_STORAGE_KEY, JSON.stringify([...tagOff])); } catch (e) {}
}
export function restoreTagOffFromStorage() {
  try {
    const raw = vaultStoreGet(TAG_OFF_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    tagOff.clear();
    arr.forEach(id => { if (typeof id === 'string') { tagOff.add(id); tagOn.delete(id); } });
  } catch (e) {}
}
function setTagOn(id, on) {
  if (on) { tagOn.add(id); tagOff.delete(id); } else { tagOn.delete(id); tagOff.add(id); }
}

/* Lọc nhóm màu (legend) cũng nhớ — validate ngay lúc restore để không dim cả graph
   vì một nhóm đã biến mất khỏi vault (buildUI chỉ dọn cờ, không vẽ lại node). */
function saveGroupToStorage() {
  try {
    if (S.selectedGroup) vaultStoreSet(GROUP_STORAGE_KEY, S.selectedGroup);
    else vaultStoreRemove(GROUP_STORAGE_KEY);
  } catch (e) {}
}
export function restoreGroupFromStorage() {
  try {
    const g = vaultStoreGet(GROUP_STORAGE_KEY);
    if (g && S.all.nodes.some(n => n.kind === 'note' && n.group === g)) S.selectedGroup = g;
  } catch (e) {}
}

/* ---------- Ư2.1: section panel gập/mở được + nhớ trạng thái ----------
   Panel từ "trang settings dài" thành dashboard: mặc định chỉ mở Tìm note + phần SỐNG
   (Chuỗi truy xuất, Hoạt động Agent), settings gập lại; trạng thái nhớ per-user
   (cùng pattern extOn). Header gắn handler 1 LẦN trong boot — không đi qua buildUI()
   nên không dính gotcha chồng listener P0.3. */
const SECT_OPEN_STORAGE_KEY = 'kbgraph3d.sectOpen.v1';
const SECT_DEFAULT_OPEN = ['search', 'chains', 'agent', 'cockpit', 'work', 'insight'];
// Section sinh sau khi người dùng đã có sectOpen trong localStorage sẽ bị gập oan
// (bản lưu cũ không biết nó). Mở đúng MỘT lần rồi đánh dấu đã giới thiệu — sau đó
// tôn trọng lựa chọn của người dùng, kể cả khi họ gập lại.
const SECT_INTRO = ['work', 'insight'];
const SECT_INTRO_KEY = 'kbgraph3d.sectIntro.v1';
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
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(SECT_INTRO_KEY) || '[]'));
    const fresh = SECT_INTRO.filter(id => !seen.has(id));
    if (fresh.length) {
      fresh.forEach(id => { sectOpenSet.add(id); seen.add(id); });
      localStorage.setItem(SECT_INTRO_KEY, JSON.stringify([...seen]));
    }
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
      if (open && id === 'insight') { pollInsight(); pollIntegrity(); }  // 🩺 không poll nền: mở section là đo
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
        setTagOn(t.id, !tagOn.has(t.id));
        el.classList.toggle('on'); el.classList.toggle('off');
        saveTagOffToStorage();
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
  if (S.selectedGroup && !groups.has(S.selectedGroup)) { S.selectedGroup = null; saveGroupToStorage(); }   // nhóm đang lọc biến mất khỏi vault → bỏ lọc
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
      saveGroupToStorage();
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
  $('tag-all').onclick = () => {
    S.all.nodes.filter(n => n.kind === 'tag').forEach(n => setTagOn(n.id, true));
    tagOff.clear();                    // "Tất cả" = xoá sạch ký ức tắt, kể cả tag không còn trong vault
    saveTagOffToStorage(); buildTagChips(); applyFilters();
  };
  $('tag-none').onclick = () => {
    S.all.nodes.filter(n => n.kind === 'tag').forEach(n => setTagOn(n.id, false));
    saveTagOffToStorage(); buildTagChips(); applyFilters();
  };
  $('ext-all').onclick = () => { S.all.nodes.filter(n => n.kind === 'file').forEach(n => extOn.add(n.ext)); saveExtOnToStorage(); buildExtChips(); applyFilters(); };
  $('ext-none').onclick = () => { extOn.clear(); saveExtOnToStorage(); buildExtChips(); applyFilters(); };

  const dl = $('notes-dl'); dl.innerHTML = '';
  S.all.nodes.filter(n => n.kind === 'note' || n.kind === 'file').forEach(n => {
    const o = document.createElement('option');
    o.value = n.kind === 'file' ? n.name : n.stem;
    o.label = n.id;
    dl.appendChild(o);
  });
  const openSearchResult = () => { // gán đè bên dưới — buildUI() chạy lại không được chồng listener
    const miss = $('search-miss');
    miss.classList.remove('show');
    const qRaw = $('search').value.trim();
    if (!qRaw) return;
    const q = deAccent(qRaw);                    // Ư3.2: khớp không cần gõ dấu
    const pool = S.all.nodes.filter(n => n.kind === 'note' || n.kind === 'file');
    const searchable = n => deAccent([n.stem || '', n.name || '', n.id || '', n.ext || ''].join(' '));
    const node = pool.find(n => deAccent(n.kind === 'file' ? n.name : n.stem) === q) ||
      pool.find(n => searchable(n).includes(q));
    if (node && node.kind === 'file') openFileActions(node);
    else if (node) { pulses.push({ node, t0: performance.now(), dur: 2600, color: '#ffffff' }); openReader(node); }
    else miss.classList.add('show');             // Ư3.2: không match phải NÓI, không im lặng
  };
  $('search').onchange = openSearchResult;
  $('search').oninput = () => $('search-miss').classList.remove('show');
  $('search').onkeydown = ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); openSearchResult(); }
    else if (ev.key === 'Escape') { $('search').value = ''; $('search-miss').classList.remove('show'); }
  };

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
  // U2: 🪐 khoá 🧲 — chặn cả chuột lẫn Enter/Space (keydown gọi el.click() nên
  // pointer-events:none trong CSS không đủ); bọc NGOÀI handler sw() để chặn TRƯỚC toggle class
  const swClusterRaw = $('sw-cluster').onclick;
  $('sw-cluster').onclick = () => { if (S.mode !== 'uni') swClusterRaw(); };
  sw('sw-ambient', on => { S.ambientOn = on; });
  sw('sw-heat', on => { S.heatMode = on; if (on) pollHeat(); refreshAllNodes(); });
  $('heat-window').onclick = () => setHeatScope('window');
  $('heat-all').onclick = () => setHeatScope('all');
  $('sl-neon').oninput = e => setNeon(e.target.value / 100);

  // U2: physics() tự toggle class .on cho CẢ 3 nút (một nguồn sự thật); 🪐 khoá switch 🧲
  // trong lúc bật (orbitPull với groupPull tranh tâm cụm) — cờ clusterOn user giữ nguyên
  const syncClusterLock = () => {
    const el = $('sw-cluster'), lock = S.mode === 'uni';
    el.classList.toggle('disabled', lock);
    el.setAttribute('aria-disabled', lock);
    el.title = lock ? tr('fx.cluster.uni') : '';
  };
  const preset = mode => { physics(mode); syncClusterLock(); };
  $('ph-bung').onclick = () => preset('bung');
  $('ph-calm').onclick = () => preset('calm');
  $('ph-uni').onclick = () => preset('uni');
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
    // Tag MỚI mặc định hiện — TRỪ khi user đã tắt riêng nó trước đây (tagOff) hoặc đang
    // "Ẩn hết" (không tag nào bật): bung tag mới lúc đó là phá đúng lựa chọn vừa lưu.
    const hideNewTag = tagOn.size === 0 && tagOff.size > 0;
    fresh.nodes.forEach(n => {
      const old = pos.get(n.id);
      if (old) Object.assign(n, { x: old.x, y: old.y, z: old.z, vx: old.vx, vy: old.vy, vz: old.vz, fx: old.fx, fy: old.fy, fz: old.fz });
      if (n.kind === 'tag' && !pos.has(n.id)) setTagOn(n.id, !(hideNewTag || tagOff.has(n.id)));
    });
    saveTagOffToStorage();
    // V5: node MỚI (chưa có trong S.all cũ) không có x/y/z → thư viện khởi tạo gần gốc
    // toạ độ rồi bay xuyên không gian tìm chỗ (giật mắt khi agent đang tạo nhiều note).
    // Có ≥1 hàng xóm CŨ đã có vị trí → sinh ngay tại trọng tâm hàng xóm + jitter ±8
    // (phá đối xứng kẻo nhiều node mới chồng đúng một điểm); link ở đây là id chuỗi thô
    // từ server (chưa qua graphData nên chưa thành object). Không hàng xóm cũ → để
    // thư viện tự lo như trước. Đường êm V4a tự áp vì applyFilters() bên dưới.
    // U2: 🪐 bật thì BỎ QUA heuristic này — uniRefresh trong applyFilters gán node mới
    // sinh NGAY TẠI toạ độ mục tiêu tính từ cây (mạnh hơn: phủ cả node không hàng xóm).
    if (S.mode !== 'uni') {
      const fid = new Map(fresh.nodes.map(n => [n.id, n]));
      const spawn = new Map();             // node mới → tổng toạ độ hàng xóm cũ có vị trí
      const acc = (novo, o) => {
        if (o.x === undefined) return;     // hàng xóm cũ nhưng chưa từng hiện (file đang ẩn)
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
    }
    S.all = fresh;
    buildUI();
    applyFilters();
  } catch (e) {}
}

/* ---------- nút ⟳ nạp lại giao diện (W64) ----------
   Cửa sổ app (`--app=`, W58) không có thanh địa chỉ ⇒ không có nút reload của trình
   duyệt. Phím tắt vẫn chạy, nhưng lối bấm được thì phải có.

   Đây KHÔNG chỉ là tiện nghi: khi source đổi, server tự restart và activity.js gọi
   `refreshData()` — thứ đó chỉ nạp lại DỮ LIỆU. Mã UI (`index.html` + `src/*`) vẫn là
   bản đang chạy trong tab cho tới khi tải lại trang, nên người dùng có thể ngồi trên
   bản cũ mà không biết. `activity.js` bật class `hot` đúng lúc đó để nút tự mời.

   `location.reload()` là đủ, KHÔNG cần chiêu phá cache: serve.py trả `no-store` cho cả
   `/` lẫn `/src/*`, nên lần tải lại nào cũng đọc thẳng từ đĩa. */
export function initReload() {
  const b = $('reload-b');
  if (!b) return;
  b.onclick = () => location.reload();
}
