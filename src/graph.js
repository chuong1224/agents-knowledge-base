/* graph.js — dựng ForceGraph3D + node/link + lọc hiển thị + physics + camera.
   Top-level chỉ ĐỊNH NGHĨA (không gọi chéo module lúc eval) — an toàn với vòng import. */
import * as THREE from 'three';
import { S, byId, adjacency, tagOn, extOn, $, esc, idOf, linkKey } from './state.js';
import { glowSprite, glowTexture, textSprite } from './sprites.js';
import { pulses, hotLinks, visitFx } from './effects.js';
import { heatActive, heatNorm } from './heat.js';
import { openReader } from './reader.js';

/* ---------- node 3D object (theo kind) ---------- */
export function nodeObject(node) {
  const group = new THREE.Group();
  let r, core;
  if (node.kind === 'tag') {
    r = node.__r = 2.2 + Math.min(Math.sqrt(node.degree || 0), 4) * 0.7;
    core = new THREE.Mesh(new THREE.OctahedronGeometry(r * 1.25),
      new THREE.MeshBasicMaterial({ color: node.color, transparent: true, wireframe: false }));
  } else if (node.kind === 'file') {
    r = node.__r = 2.1 + Math.min(node.degree || 0, 3) * 0.3;
    core = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12),
      new THREE.MeshBasicMaterial({ color: node.color, transparent: true }));
  } else {
    r = node.__r = (node.hub ? 3.4 : 2.1) + Math.sqrt(node.degree || 0) * 1.05;
    core = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20),
      new THREE.MeshBasicMaterial({ color: node.color, transparent: true }));
  }
  const glow = glowSprite(glowTexture(node.color));
  const gs = node.__gs = Math.min(r, 5.5) * (node.kind === 'note' ? 4.6 : 3.4);
  glow.scale.set(gs, gs, 1);
  group.add(glow); group.add(core);
  node.__core = core; node.__glow = glow; node.__label = null;
  if (node.kind !== 'file') {
    const stem = node.stem.length > 30 ? node.stem.slice(0, 29) + '…' : node.stem;
    const label = textSprite(stem, node.color, node.hub);
    label.position.set(0, -(r + 6), 0);
    group.add(label);
    node.__label = label;
  }
  applyNodeState(node);
  return group;
}
export function nodeActive(n) {
  if (!S.selectedGroup) return true;
  return n.kind === 'note' && n.group === S.selectedGroup;
}
export function glowOp(n) {
  const base = n.kind === 'note' ? (n.hub ? 0.42 : 0.5) : n.kind === 'tag' ? 0.38 : 0.34;
  return base * (0.35 + S.neon * 1.1);
}
export function applyNodeState(n) {
  if (!n.__core) return;
  const on = nodeActive(n);
  const ha = heatActive();
  const hn = ha ? heatNorm(n) : 0;
  const vf = on ? visitFx(n) : null;               // agent đang xử lý / vừa rời node này
  const sc = (1 + hn * 1.7) * (vf ? 1 + vf.k * (0.3 + 0.14 * vf.breath) : 1);
  n.__core.scale.setScalar(sc);
  n.__glow.scale.set(n.__gs * sc, n.__gs * sc, 1);
  if (!on) {                                       // bị lọc ẩn
    n.__core.material.opacity = 0.07;
    n.__glow.material.opacity = 0.03;
  } else if (ha) {                                 // heatmap: nóng sáng rực, nguội chìm xuống
    n.__core.material.opacity = 0.2 + 0.8 * Math.max(hn, vf ? vf.k : 0);
    n.__glow.material.opacity = glowOp(n) * (0.45 + 0.55 * hn) + 0.6 * hn;
  } else {
    n.__core.material.opacity = 1;
    n.__glow.material.opacity = glowOp(n);
  }
  if (vf) {                                        // glow mang màu agent, "thở" khi đang xử lý
    n.__glow.material.color.set(vf.color);
    n.__glow.material.opacity = Math.min(0.95, n.__glow.material.opacity + vf.k * (0.4 + 0.2 * vf.breath));
  } else {
    n.__glow.material.color.set('#ffffff');
  }
  if (n.__label) n.__label.visible = S.labelsOn && on && (vf ? true : (!ha || hn > 0.15));
}
export function refreshAllNodes() { S.data.nodes.forEach(applyNodeState); refreshLinkStyles(); }
export function refreshLinkStyles() {
  S.Graph.linkColor(S.Graph.linkColor());
  S.Graph.linkWidth(S.Graph.linkWidth());
  S.Graph.linkDirectionalParticles(S.Graph.linkDirectionalParticles());
}

/* ---------- link accessors ---------- */
export const linkActive = l => nodeActive(l.source) && nodeActive(l.target);
export const linkHot = l => (hotLinks.get(linkKey(l)) || 0) > performance.now();
export const linkHovered = l => S.hoverNode && (l.source === S.hoverNode || l.target === S.hoverNode);
export const linkAux = l => (l.source.kind && l.source.kind !== 'note') || (l.target.kind && l.target.kind !== 'note');
export function linkColor(l) {
  if (!linkActive(l)) return 'rgba(110,101,151,0.05)';
  if (linkHot(l)) return '#ffffff';
  if (linkHovered(l)) return '#8fefff';
  return linkAux(l) ? 'rgba(140,128,196,0.48)' : 'rgba(150,138,205,0.52)';
}
export function linkWidth(l) {
  if (linkHot(l)) return 2.6;
  if (linkHovered(l)) return 1.8;
  return linkAux(l) ? 0.9 : 0.7;
}

/* ---------- lọc hiển thị (tag + đuôi file) ---------- */
export function visibleData() {
  const nodes = S.all.nodes.filter(n =>
    n.kind === 'note' ? true :
    n.kind === 'file' ? extOn.has(n.ext) :
    tagOn.has(n.id));
  const vis = new Set(nodes.map(n => n.id));
  const links = S.all.links.filter(l => vis.has(idOf(l.source)) && vis.has(idOf(l.target)));
  return { nodes, links };
}
export function applyFilters() {
  S.data = visibleData();
  indexData();
  softDecay();                        // V4a: reheat do lọc phải ÊM — node cũ đứng yên
  S.Graph.graphData(S.data);
  updateStats();
}
export function updateStats() {
  // Ư2.3: đang lọc → "hiện/tổng" (tổng nhỏ, màu faint); đủ → chỉ một con số.
  // "Hiện" = đang SÁNG trên graph: qua lọc tag/đuôi (gỡ khỏi data) VÀ qua lọc
  // nhóm màu (dim bằng nodeActive — node mờ 0.07 với người dùng là "ẩn").
  const cnt = (nodes, kind) => nodes.filter(n => n.kind === kind).length;
  const vis = kind => S.data.nodes.filter(n => n.kind === kind && nodeActive(n)).length;
  const nodeOf = x => (typeof x === 'object' && x !== null) ? x : byId.get(x);
  const linkVis = l => { const s = nodeOf(l.source), t = nodeOf(l.target); return s && t && nodeActive(s) && nodeActive(t); };
  const fmt = (v, tot) => v === tot ? String(tot) : v + '<i>/' + tot + '</i>';
  $('st-n').innerHTML = fmt(vis('note'), cnt(S.all.nodes, 'note'));
  $('st-l').innerHTML = fmt(S.data.links.filter(linkVis).length, S.all.links.length);
  $('st-f').innerHTML = fmt(vis('file'), cnt(S.all.nodes, 'file'));
  $('st-t').innerHTML = fmt(vis('tag'), cnt(S.all.nodes, 'tag'));
  $('st-gen').textContent = (S.all.meta && S.all.meta.generated) || '—';
}
export function indexData() {
  byId.clear(); adjacency.clear();
  S.data.nodes.forEach(n => { byId.set(n.id, n); adjacency.set(n, []); });
  S.data.links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source : byId.get(l.source);
    const t = typeof l.target === 'object' ? l.target : byId.get(l.target);
    if (s && t) { adjacency.get(s).push(l); adjacency.get(t).push(l); }
  });
}

/* ---------- Ư3.1: thả ghim node (kéo tay = ghim vĩnh viễn, trước đây không có đường gỡ) ---------- */
let _lastClick = { id: null, t: 0 };
export function unpinNode(n) {
  if (n.fx == null && n.fy == null && n.fz == null) return;   // node chưa ghim — không reheat vô cớ
  n.fx = n.fy = n.fz = null;
  pulses.push({ node: n, t0: performance.now(), dur: 900, color: '#ffffff', soft: true });   // nháy xác nhận
  restoreDecay();                     // V4: thả ghim = reheat ĐẦY có chủ đích
  S.Graph.d3ReheatSimulation();
}

/* ---------- physics ---------- */
const nodeKind = x => (x && x.kind) || (byId.get(x) || {}).kind || 'note';
const nodeDeg = x => ((x && typeof x === 'object') ? x : (byId.get(x) || {})).degree || 0;
export function physics(mode, first) {
  const bung = mode === 'bung';
  _bung = bung;
  // File node gần như không đẩy — kẻo 100+ ảnh nổ tung layout và văng ra xa
  // Note co giãn theo degree (V2): hệ số TÁI ĐỊNH TÂM quanh 1 (lá ~0.5, hub trần ×3) —
  // nếu mọi note cùng ≥1 (bản nháp 1+0.35√deg) là bơm phồng toàn cục, graph nổ ×2.4
  S.Graph.d3Force('charge').strength(n =>
    n.kind === 'file' ? -10
      : n.kind === 'tag' ? (bung ? -150 : -45)
      : (bung ? -150 : -45) * Math.min(Math.max(0.35 * Math.sqrt(n.degree || 0), 0.5), 3));
  S.Graph.d3Force('link').distance(l => {
    const base = bung ? 85 : 42;
    if (nodeKind(l.source) === 'file' || nodeKind(l.target) === 'file') return base * 0.28;
    if (nodeKind(l.source) === 'tag' || nodeKind(l.target) === 'tag') return base * 0.5;
    // V2: đo theo đầu degree NHỎ hơn — nan hoa lá→hub ngắn (lá quây quanh hub),
    // chỉ xương sống hub-hub mới dài ra; √min chứ không √sum kẻo link lá bị hub kéo dài
    const k = 0.45 + 0.28 * Math.sqrt(Math.min(nodeDeg(l.source), nodeDeg(l.target)));
    return base * Math.min(Math.max(k, 0.7), 2.4);
  });
  restoreDecay();                     // V4b: Calm đặc (velocityDecay 0.55) / Bung 0.4; huỷ soft window nếu đang treo
  if (!first) S.Graph.d3ReheatSimulation();
  $('ph-bung').classList.toggle('on', bung);
  $('ph-calm').classList.toggle('on', !bung);
}

/* ---------- V4a: reheat-êm khi LỌC ----------
   Bật/tắt chip lọc → graphData() làm lib reheat alpha ĐẦY → cả layout nổ lại dù chỉ
   thêm/bớt vài node. Chữa: quanh reheat-do-lọc tạm đặt alphaDecay 0.09 + velocityDecay
   0.55 — alpha tắt trong ~40 tick, node cũ gần như đứng yên, node mới vẫn kịp tìm chỗ
   theo link force — rồi trả về mặc định. Đếm lùi theo TICK ENGINE (onEngineTick, đăng
   ký trong initGraph) chứ KHÔNG setTimeout wall-clock: tab/pane ẩn rAF đứng nhưng đồng
   hồ vẫn chạy (gotcha #9) — restore bắn trước khi engine kịp tick nào là soft window
   thành vô nghĩa. Đổi preset / thả ghim / toggle 🧲 vẫn reheat ĐẦY có chủ đích — các
   đường đó gọi restoreDecay() trước khi reheat. */
const ALPHA_DECAY = 0.0228;            // mặc định d3
const SOFT_ALPHA_DECAY = 0.09;
const SOFT_V_DECAY = 0.55;
const SOFT_TICKS = 150;                // ~2.5s ở 60fps — quá đủ cho alpha 0.09 tắt hẳn
let _bung = true;                      // physics() cập nhật — restore đúng velocityDecay preset
let _softLeft = 0;                     // onEngineTick đếm lùi, 0 = không trong soft window
export function restoreDecay() {
  _softLeft = 0;
  S.Graph.d3AlphaDecay(ALPHA_DECAY);
  S.Graph.d3VelocityDecay(_bung ? 0.4 : SOFT_V_DECAY);
}
function softDecay() {
  S.Graph.d3AlphaDecay(SOFT_ALPHA_DECAY);
  S.Graph.d3VelocityDecay(SOFT_V_DECAY);
  _softLeft = SOFT_TICKS;
}
export const softTick = () => { if (_softLeft && !--_softLeft) restoreDecay(); };

/* ---------- V1: 🧲 gom cụm theo nhóm màu (toggle, mặc định TẮT) ----------
   Mỗi tick kéo nhẹ note về trọng tâm nhóm màu của mình — nhóm tách thành "lục địa".
   Nhóm Khác thả tự do; node ghim (fx) không cần xử lý riêng — position bị fix nên lực vô hại.
   Lực tính trên node đang HIỂN THỊ (initialize nhận nodes của S.data — spotlight dim
   không phân biệt); chồng lên cả Bung lẫn Calm, KHÔNG phải preset thứ 3.
   V1.1: hub Index / MOC thả-tự-do vẫn bị link kéo hỗn loạn khi cụm co lại (treo lơ lửng
   giữa cụm mình và vùng giữa). Census 2 lượt mỗi khi data đổi: hub có nhóm "kết màu"
   áp đảo (≥2/3 hàng xóm có màu VÀ số đó ≥ nửa tổng hàng xóm note) được NEO về trọng tâm
   nhóm đó — hub làm tâm "lục địa", charge degree (V2) đẩy lá ra vành quanh nó.
   Lượt 2 cho hub-của-hub (Index - Vault Operation…): hàng xóm hub đã neo ở lượt 1 cũng
   tính là "kết màu". Không đạt ngưỡng = cầu nối thật (Index gốc, Index - JXM, Index -
   Skills…) → tự do giữa các lục địa như V1. Hub KHÔNG đóng góp vào trọng tâm (trọng tâm
   chỉ tính từ lá).
   V1.2: lá bám hub — V1.1 hub vẫn ngoài RÌA vì lá túm quanh trọng-tâm-ẢO còn hub bị link
   chéo níu ngoài mép blob (probe: Ngoại Trang lá→trọng-tâm 79, hub→trọng-tâm 124, lá→hub
   lệch 69–192). Fix gốc: lá có link tới hub đã neo CÙNG nhóm → tâm hút = CHÍNH HUB thay
   vì trọng tâm (nhiều hub thoả: chọn hub nhiều lá nhất, tie-break theo id — deterministic);
   "cách đều" TỰ nảy sinh: mọi lá hút về một điểm, charge hub đẩy ngược → vỏ đều quanh hub,
   hub ở giữa theo cấu trúc. Lá không link hub neo / nhóm không có hub neo → trọng tâm như
   V1 (fallback). Hub vẫn neo về trọng tâm nhóm (V1.1) — thành lực "giữ bầy", tự tắt dần
   khi hub ≈ tâm bầy; hút hub↔lá là spring tương hỗ hội tụ, không phải khuếch đại. */
const CLUSTER_FREE = new Set(['Index / MOC', 'Khác']);
const CLUSTER_HUB = 'Index / MOC';
const CLUSTER_K = 0.14;
const CLUSTER_HUB_K = 0.21;            // mạnh hơn K lá ×1.5 — probe: 0.14 hub còn đứng ngoài vành lá
const groupPull = (() => {
  let ns = [], anchors = new Map();    // V1.1: hub → nhóm được neo
  let leafHub = new Map();             // V1.2: lá → hub cùng nhóm nó bám (thay trọng tâm)
  const census = () => {
    anchors = new Map();
    const id2n = new Map(ns.map(n => [n.id, n]));
    const nb = new Map();              // hub → hàng xóm note (mọi nhóm)
    for (const l of ((S.data && S.data.links) || [])) {
      const s = typeof l.source === 'object' ? l.source : id2n.get(l.source);
      const t = typeof l.target === 'object' ? l.target : id2n.get(l.target);
      if (!s || !t || s.kind !== 'note' || t.kind !== 'note') continue;
      if (s.group === CLUSTER_HUB) { let a = nb.get(s); if (!a) nb.set(s, a = []); a.push(t); }
      if (t.group === CLUSTER_HUB) { let a = nb.get(t); if (!a) nb.set(t, a = []); a.push(s); }
    }
    for (let pass = 0; pass < 2; pass++) {
      const add = [];
      for (const [h, arr] of nb) {
        if (anchors.has(h)) continue;
        const cnt = new Map();
        for (const o of arr) {
          const g = !CLUSTER_FREE.has(o.group) ? o.group : anchors.get(o);
          if (g) cnt.set(g, (cnt.get(g) || 0) + 1);
        }
        let dom = null, c = 0, tot = 0;
        for (const [g, k] of cnt) { tot += k; if (k > c) { c = k; dom = g; } }
        if (tot && 3 * c >= 2 * tot && 2 * tot >= arr.length) add.push([h, dom]);
      }
      add.forEach(([h, g]) => anchors.set(h, g));
    }
    leafHub = new Map();
    const childCnt = new Map();        // số lá cùng nhóm của mỗi hub neo — để chọn hub khi lá link nhiều hub
    for (const [h, g] of anchors)
      childCnt.set(h, (nb.get(h) || []).filter(o => o.group === g).length);
    for (const [h, g] of anchors)
      for (const o of nb.get(h)) {
        if (o.group !== g) continue;
        const cur = leafHub.get(o);
        if (!cur || childCnt.get(h) > childCnt.get(cur) ||
            (childCnt.get(h) === childCnt.get(cur) && String(h.id) < String(cur.id)))
          leafHub.set(o, h);
      }
  };
  const f = alpha => {
    const cent = new Map();                        // nhóm → tổng toạ độ + số note (chỉ lá)
    for (const n of ns) {
      if (n.kind !== 'note' || CLUSTER_FREE.has(n.group) || n.x === undefined) continue;
      let c = cent.get(n.group);
      if (!c) cent.set(n.group, c = { x: 0, y: 0, z: 0, k: 0 });
      c.x += n.x; c.y += n.y; c.z += n.z; c.k++;
    }
    const K = CLUSTER_K * alpha;
    for (const n of ns) {
      if (n.kind !== 'note' || CLUSTER_FREE.has(n.group)) continue;
      const hb = leafHub.get(n);                   // V1.2: lá có hub cùng nhóm → bám CHÍNH HUB
      if (hb && hb.x !== undefined) {
        n.vx -= (n.x - hb.x) * K;
        n.vy -= (n.y - hb.y) * K;
        n.vz -= (n.z - hb.z) * K;
        continue;
      }
      const c = cent.get(n.group);
      if (!c || c.k < 2) continue;                 // nhóm 1 note: trọng tâm = chính nó, khỏi kéo
      n.vx -= (n.x - c.x / c.k) * K;
      n.vy -= (n.y - c.y / c.k) * K;
      n.vz -= (n.z - c.z / c.k) * K;
    }
    const KH = CLUSTER_HUB_K * alpha;              // V1.1: hub được neo đuổi theo tâm nhóm lá
    for (const [n, g] of anchors) {
      if (n.x === undefined) continue;
      const c = cent.get(g);
      if (!c || c.k < 2) continue;
      n.vx -= (n.x - c.x / c.k) * KH;
      n.vy -= (n.y - c.y / c.k) * KH;
      n.vz -= (n.z - c.z / c.k) * KH;
    }
  };
  f.initialize = arr => { ns = arr; census(); };
  return f;
})();
export function setCluster(on) {
  S.clusterOn = on;
  if (!S.Graph) return;
  S.Graph.d3Force('groupPull', on ? groupPull : null);   // null = gỡ force khỏi simulation
  restoreDecay();                     // V4: toggle 🧲 đổi cả bố cục = reheat ĐẦY có chủ đích
  S.Graph.d3ReheatSimulation();
}

/* ---------- V3: chống chồng node (collide, luôn bật) ----------
   Bundle không có d3.forceCollide — tự viết pattern orphanPull, ngữ nghĩa theo forceCollide
   gốc: cặp node chạm (dist < r1+r2+pad, r = __r bán kính lõi) bị dịch vận tốc dọc trục nối,
   chia theo r² (node to "nặng" hơn — ít bị đẩy), KHÔNG nhân alpha — nhân alpha là cuối phiên
   lắng lực teo dần, cặp chạm không được gỡ hết. Node ghim (fx) position bị fix nên chỉ node
   tự do bị đẩy ra — kéo node thả đè lên node khác sẽ tự tách. Baseline khi thêm lực: layout
   lắng đã ≈0 cặp chạm (charge degree lo phần lớn) — đây là LƯỚI AN TOÀN cứng cho kéo-ghim,
   vùng nén khi 🧲 bật và vault phình to sau này. O(n²) ~430 node ≈ 92k cặp/tick đo THỰC TẾ
   ~6ms (object node dictionary-mode, property access đắt — không phải phép toán) → GATE
   alpha > 0.03: chỉ chạy pha nóng ~150 tick đầu mỗi reheat (lúc node còn bay, chồng mới
   sinh), pha lắng charge tự giữ khoảng cách, tick về 0 chi phí; kéo node cũng reheat nên
   thả-đè vẫn được tách. Vault phình to mới cần grid hash — đừng tối ưu sớm. */
const COLLIDE_PAD = 2;
const COLLIDE_K = 0.4;
const COLLIDE_ALPHA_MIN = 0.03;
export const collide = (() => {
  let ns = [];
  const f = alpha => {
    if (alpha <= COLLIDE_ALPHA_MIN) return;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      if (a.x === undefined) continue;
      const ra = a.__r || 3;
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        if (b.x === undefined) continue;
        const rb = b.__r || 3;
        const R = ra + rb + COLLIDE_PAD;
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        if (!d2) {                                 // trùng toạ độ tuyệt đối — jiggle như d3
          dx = (Math.random() - 0.5) * 1e-3;
          dy = (Math.random() - 0.5) * 1e-3;
          dz = (Math.random() - 0.5) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);
        const l = (R - d) / d * COLLIDE_K;
        const wa = rb * rb / (ra * ra + rb * rb);
        a.vx += dx * l * wa; a.vy += dy * l * wa; a.vz += dz * l * wa;
        const wb = 1 - wa;
        b.vx -= dx * l * wb; b.vy -= dy * l * wb; b.vz -= dz * l * wb;
      }
    }
  };
  f.initialize = arr => ns = arr;
  return f;
})();

/* ---------- camera ---------- */
export function flyTo(node, ms) {
  const d = 150 + (node.__r || 3) * 10;
  const len = Math.hypot(node.x, node.y, node.z) || 1;
  const k = 1 + d / len;
  S.Graph.cameraPosition({ x: node.x * k, y: node.y * k, z: node.z * k }, node, ms);
  pauseRotate();
}
let rotateTimer = null;
export function pauseRotate() {
  if (!$('sw-rotate').classList.contains('on')) return;
  S.Graph.controls().autoRotate = false;
  clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    if ($('sw-rotate').classList.contains('on')) {
      S.Graph.controls().autoRotate = true;
    }
  }, 9000);
}

/* ---------- Ư1.1: follow guard — camera không giật khỏi tay người dùng ----------
   Mọi cú bay TỰ ĐỘNG theo agent phải qua followFlyTo: (a) user vừa xoay/zoom/kéo canvas
   → follow nhường quyền camera FOLLOW_IDLE ms (cùng tinh thần pauseRotate); (b) node đến
   ĐÃ nằm trong khung nhìn → khỏi bay (hết cảnh camera không bao giờ đứng yên khi hop dày).
   Bay do NGƯỜI DÙNG chủ động (click feed/chuỗi/heatrow/search/reader) vẫn gọi thẳng flyTo. */
const FOLLOW_IDLE = 8000;
let lastUserCam = -1e9;                          // -∞: follow hoạt động ngay từ lúc mở trang
const _pV = new THREE.Vector3();
export function nodeOnScreen(n) {
  if (!S.Graph || n.x === undefined) return false;
  const cam = S.Graph.camera();
  _pV.set(n.x, n.y, n.z).applyMatrix4(cam.matrixWorldInverse);
  if (_pV.z > -1) return false;                  // sau lưng / sát mặt camera — NDC sẽ là toạ độ ảo
  _pV.applyMatrix4(cam.projectionMatrix);        // → NDC (applyMatrix4 đã chia phối cảnh w)
  return Math.abs(_pV.x) < 0.92 && Math.abs(_pV.y) < 0.92;
}
export function followFlyTo(node, ms) {
  if (!$('sw-follow').classList.contains('on')) return;
  if (performance.now() - lastUserCam < FOLLOW_IDLE) return;
  if (nodeOnScreen(node)) return;
  flyTo(node, ms);
}

/* ---------- không gian: sao + bloom ---------- */
export function addStars() {
  // Sao rất kín đáo trên nền đen vũ trụ: chỉ tạo chiều sâu, không được cạnh tranh với node/vệt agent
  const N = 850, pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 4200;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x2b2547, size: 0.85, sizeAttenuation: true, transparent: true, opacity: 0.16 }));
  S.Graph.scene().add(stars);
}
export async function addBloom() {
  try {
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    S.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.15 + S.neon * 1.1, 0.4, 0.3);
    S.Graph.postProcessingComposer().addPass(S.bloomPass);
  } catch (e) { console.warn('Bloom tắt:', e); }
}
export function setNeon(v) {
  S.neon = v;
  if (S.bloomPass) S.bloomPass.strength = 0.15 + S.neon * 1.1;
  S.data.nodes.forEach(applyNodeState);
}

/* ---------- khởi tạo Graph (gọi từ boot, sau khi S.all/S.data sẵn sàng) ---------- */
export function initGraph() {
  S.Graph = ForceGraph3D({ controlType: 'orbit' })($('graph'))
    .backgroundColor('#020208')
    .showNavInfo(false)
    .nodeThreeObject(nodeObject)
    .nodeLabel(n => n.kind === 'file'
      ? `<div class="tt-title">📎 ${esc(n.name)}</div><div class="tt-tags">${esc(n.folder)} · ${n.degree} liên kết</div>`
      : n.kind === 'tag'
      ? `<div class="tt-title">${esc(n.name)}</div><div class="tt-tags">${n.degree} note</div>`
      : `<div class="tt-title">${esc(n.name)}</div>` +
        (n.summary ? `<div class="tt-sum">${esc(n.summary)}</div>` : '') +
        (n.tags.length ? `<div class="tt-tags">#${n.tags.map(esc).join(' · #')}</div>` : ''))
    .linkColor(linkColor)
    .linkWidth(linkWidth)
    .linkOpacity(0.85)
    .linkDirectionalParticles(l => S.particlesOn && linkActive(l) && !linkAux(l) ? 2 : 0)
    .linkDirectionalParticleSpeed(0.0038)
    .linkDirectionalParticleWidth(l => linkHot(l) ? 3.2 : 1.3)
    .linkDirectionalParticleColor(l => linkHot(l) ? '#ffffff' : ((l.source && l.source.color) || '#04d9ff'))
    .onNodeClick(n => {
      // Ư3.1: click đúp (≤400ms, cùng node) = thả ghim node đã kéo tay — kéo là cách DUY NHẤT tạo ghim
      const now = performance.now();
      if (_lastClick.id === n.id && now - _lastClick.t < 400) { _lastClick = { id: null, t: 0 }; unpinNode(n); return; }
      _lastClick = { id: n.id, t: now };
      if (n.kind === 'note') openReader(n); else flyTo(n, 1000);
    })
    .onNodeHover(n => { S.hoverNode = n || null; refreshLinkStyles(); document.body.style.cursor = n ? 'pointer' : 'default'; })
    .onNodeDragEnd(n => { n.fx = n.x; n.fy = n.y; n.fz = n.z; })
    .graphData(S.data);

  // File mồ côi (degree 0, không dây neo) chỉ chịu lực đẩy -> trôi mãi ra rìa.
  // Lực hút nhẹ về tâm giữ chúng lơ lửng bên trong không gian graph.
  const orphanPull = (() => {
    let ns = [];
    const f = alpha => {
      for (const n of ns) if (n.kind === 'file' && !n.degree) {
        n.vx -= n.x * 0.04 * alpha; n.vy -= n.y * 0.04 * alpha; n.vz -= n.z * 0.04 * alpha;
      }
    };
    f.initialize = arr => ns = arr;
    return f;
  })();
  S.Graph.d3Force('orphanPull', orphanPull);
  S.Graph.d3Force('collide', collide);            // V3: chống chồng node — luôn bật
  S.Graph.onEngineTick(softTick);                 // V4a: đồng hồ đếm lùi soft window theo tick engine

  S.Graph.controls().autoRotate = true;
  S.Graph.controls().autoRotateSpeed = 0.45;
  // Ư1.1: thao tác chuột/chạm/lăn trên canvas → follow nhường quyền camera (xem followFlyTo)
  ['pointerdown', 'wheel'].forEach(evt =>
    $('graph').addEventListener(evt, () => { lastUserCam = performance.now(); }, { passive: true }));
  setTimeout(() => S.Graph.zoomToFit(1200, 70), 1600);

  S.trailGroup = new THREE.Group();               // lớp vệt đường đi agent (v1.7)
  S.Graph.scene().add(S.trailGroup);
}
