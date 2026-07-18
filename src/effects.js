/* effects.js — pulse + hot link + toàn bộ máy hiệu ứng agent:
   hàng đợi hop điện ảnh 3 pha (NẠP → LAO ĐI → VA CHẠM), vệt đường đi, comet,
   spark/warp/burst, trạng thái visit (dwell) và sao băng nền khi nhàn rỗi. */
import * as THREE from 'three';
import { S, byId, adjacency, linkKey, COLORS } from './state.js';
import { glowSprite, glowTexture, ringTexture, streakTexture } from './sprites.js';
import { applyNodeState, refreshLinkStyles, followFlyTo, linkAux, glowOp } from './graph.js';
import { heatActive } from './heat.js';
import { agentColor } from './activity.js';

export const pulses = [];                       // {node, t0, dur, color}
export const hotLinks = new Map();              // "sourceId|targetId" -> expiry ms (key ổn định — link object bị thay mới sau refreshData)

/* ---------- hiệu ứng pulse + hot link ---------- */
export function fxLoop(now) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i], k = (performance.now() - p.t0) / p.dur;
    const n = p.node;
    if (k >= 1) {
      pulses.splice(i, 1);
      if (n.__glow) {
        n.__glow.material.color.set('#ffffff');
        n.__core.material.color.set(n.color);
        applyNodeState(n);            // trả trạng thái tĩnh (heat-aware: scale + độ sáng)
      }
      continue;
    }
    if (!n.__glow) continue;
    const wave = Math.sin(k * Math.PI * 3) * (1 - k);
    if (p.soft) {
      // flash kích hoạt của flow: chỉ nháy màu thao tác ở core — glow để dành cho màu agent
      n.__core.material.color.set(k < 0.55 ? p.color : n.color);
    } else {
      const s = n.__gs * (1 + wave * 1.6 + 0.8 * (1 - k));
      n.__glow.scale.set(s, s, 1);
      n.__glow.material.color.set(p.color);
      n.__glow.material.opacity = Math.min(0.85, glowOp(n) + 0.4);
      n.__core.material.color.set(k < 0.4 ? '#ffffff' : n.color);
    }
  }
  let expired = false;
  hotLinks.forEach((exp, l) => { if (exp < performance.now()) { hotLinks.delete(l); expired = true; } });
  if (expired) refreshLinkStyles();
  // try/catch: 1 frame lỗi không được giết cả vòng lặp hiệu ứng (rAF không tự hồi)
  try {
  const fnow = performance.now();
  updateVisits();
  updateTrails(fnow);
  updateSparks(fnow);
  updateWarps(fnow);
  updateBursts(fnow);
  } catch (e) { console.error('fxLoop:', e); }
  requestAnimationFrame(fxLoop);
}

export function agentHit(node, type, demo) {
  const color = COLORS[type] || COLORS.read;
  pulses.push({ node, t0: performance.now(), dur: 2600, color });
  const links = adjacency.get(node) || [];
  links.forEach((l, i) => {
    hotLinks.set(linkKey(l), performance.now() + 3200);
    if (!linkAux(l)) for (let k = 0; k < 3; k++) setTimeout(() => S.Graph.emitParticle(l), i * 60 + k * 300);
  });
  refreshLinkStyles();
  if (!demo) followFlyTo(node, 1300);
}

/* ---------- v1.7: vệt đường đi + trạng thái xử lý theo agent ----------
   Vệt là lớp đồ hoạ RIÊNG (bezier giữa vị trí 2 node liên tiếp của cùng agent),
   không phụ thuộc link graph — vì 2 node liên tiếp trong chuỗi truy xuất
   thường không có wikilink với nhau. Neo theo node ID, bám toạ độ mỗi frame
   nên sống sót qua applyFilters()/refreshData(). */
const TRAIL_MAX = 10, TRAIL_PTS = 64;           // 10 đoạn / agent; 64 điểm / đoạn — dải Points dày đặc thay line mảnh (beam siêu tốc mượt + dày)
const TRAIL_TTL = 150000, TRAIL_FADE = 25000;   // vệt sống 2.5 phút, mờ dần ở 25s cuối
const VISIT_CAP = 120000, VISIT_FADE = 3500;    // trần giữ sáng 120s, rời node mờ dần 3.5s
export const agentTrails = new Map();           // agent -> {name, color, currentId, pendingArrival, segs[], dots[]}
const nodeVisit = new Map();                    // nodeId -> {agent, color, since, lastSeen, leftAt}
const sparks = [], bursts = [];
export const warps = [];                        // tia sao xuyên không (star streak) — export cho debug hook __fx

function getTrail(name) {
  name = name || 'Claude';
  let tr = agentTrails.get(name);
  if (!tr) {
    tr = { name, color: agentColor(name), currentId: null, visualId: null, queue: [], hopActive: false, endRequested: false, segs: [], dots: [] };
    // Ư6.1: màu beam pha LAO ĐI = trắng 70% + màu agent 30% — bloom vẫn ăn thành lightspeed streak
    // nhưng 2 agent bay song song vẫn nhận ra ai là ai đúng lúc rực nhất (tính 1 lần, không lerp mỗi frame)
    tr.hotColor = new THREE.Color(tr.color).lerp(new THREE.Color(1, 1, 1), 0.7);
    agentTrails.set(name, tr);
  }
  return tr;
}
export function agentFlow(agentName, node, type, replay, ev) {
  agentName = agentName || 'Claude';
  const now = performance.now();
  const tr = getTrail(agentName);
  tr.endRequested = false;                         // có event mới → huỷ lệnh tắt đang chờ
  if (tr.currentId === node.id) {
    const v = nodeVisit.get(node.id);
    if (v && v.agent === agentName) v.lastSeen = now;    // vẫn node này — nối dài dwell
    return;
  }
  tr.currentId = node.id;
  if (!tr.visualId) {
    // node đầu chuyến đi: thắp ngay + vòng sóng khởi hành (chỉ node, không lan liên kết)
    tr.visualId = node.id;
    nodeVisit.set(node.id, { agent: agentName, color: tr.color, since: now, lastSeen: now, leftAt: null });
    burstFX(node, tr.color, false);
    pulses.push({ node, t0: now, dur: 900, color: COLORS[type] || COLORS.read, soft: true });
    if (!replay) followFlyTo(node, 1300);
    return;
  }
  // xếp hàng: mỗi hop chơi TRỌN chuỗi hiệu ứng (mờ → bay → nổ → thắp) rồi mới tới hop kế —
  // event dồn lô từ poll 800ms nhờ vậy thành dây chuyền tuần tự, không phóng đồng loạt
  tr.queue.push({ nodeId: node.id, type, ts: ev.ts || (Date.now() / 1000), replay: !!replay });
  if (tr.queue.length > 500) tr.queue.splice(1, tr.queue.length - 500);   // giới hạn 500 để tránh tràn bộ nhớ
  pumpQueue(tr);
}
function pumpQueue(tr) {
  if (tr.hopActive || !tr.queue.length) return;
  const hop = tr.queue.shift();
  const fromId = tr.visualId;
  if (!fromId || fromId === hop.nodeId) { tr.visualId = hop.nodeId; pumpQueue(tr); return; }
  // tính speedK dựa trên gap thời gian thực giữa 2 events liên tiếp
  let speedK = 1;
  if (hop.ts && tr.queue.length > 0 && tr.queue[0].ts) {
    const gapSec = Math.max(0.05, tr.queue[0].ts - hop.ts);  // gap tối thiểu 50ms
    const baseMs = 340 + 520;  // charge + travel ở speedK=1
    const targetMs = gapSec * 1000 * 0.85;  // 85% của gap để animation hoàn thành trước event kế
    speedK = Math.max(1, Math.min(15, baseMs / targetMs));  // clamp 1..15
  } else if (tr.queue.length > 3) {
    speedK = 1 + Math.min(2.5, tr.queue.length * 0.5);  // fallback: queue dài → nhanh hơn
  }
  tr.hopActive = true;
  try {
    addTrailSeg(tr, fromId, hop.nodeId, speedK, () => arriveHop(tr, hop));
  } catch (e) {
    // dây chuyền KHÔNG ĐƯỢC kẹt: lỗi tạo sao chổi thì vẫn thắp node đến và đi tiếp
    console.error('flow hop:', e);
    arriveHop(tr, hop);
  }
}
function arriveHop(tr, hop) {
  const now = performance.now();
  tr.visualId = hop.nodeId;
  tr.hopActive = false;
  nodeVisit.set(hop.nodeId, { agent: tr.name, color: tr.color, since: now, lastSeen: now, leftAt: null });
  const n = byId.get(hop.nodeId);
  if (n) {
    burstFX(n, tr.color, true);                    // chớp trắng + 3 vòng sóng xung kích + tia lửa văng
    pulses.push({ node: n, t0: now, dur: 900, color: COLORS[hop.type] || COLORS.read, soft: true });
    followFlyTo(n, 1100);
  }
  if (tr.endRequested && !tr.queue.length) {
    const v = nodeVisit.get(hop.nodeId);
    if (v && v.agent === tr.name) v.leftAt = now + 1600;   // nán lại một nhịp rồi mới tắt
    tr.currentId = null; tr.visualId = null; tr.endRequested = false;
    return;
  }
  // delay tối thiểu giữa các hop — animation duration đã scale theo gap thời gian thực.
  // Ư1.3: hop REPLAY cap 600ms — gap thật trong chuỗi lên tới CHAIN_GAP=60s, không trần thì
  // replay đứng im 6s giữa 2 hop; nhịp LIVE giữ nguyên không trần (contract pacing P4.3).
  let nextGap = (tr.queue.length > 0 && hop.ts && tr.queue[0].ts)
    ? Math.max(10, (tr.queue[0].ts - hop.ts) * 1000 * 0.1) : (tr.queue.length > 3 ? 30 : 80);
  if (hop.replay) nextGap = Math.min(600, nextGap);
  setTimeout(() => pumpQueue(tr), nextGap);
}
export function endAgentFlow(agentName) {
  const tr = agentTrails.get(agentName || 'Claude');
  if (!tr) return;
  if (tr.hopActive || tr.queue.length) { tr.endRequested = true; return; }
  const headId = tr.visualId || tr.currentId;
  if (headId) {
    const v = nodeVisit.get(headId);
    if (v && v.agent === tr.name && !v.leftAt) v.leftAt = performance.now();
  }
  tr.currentId = null; tr.visualId = null;
}
export function replayFlow(agentName, events) {
  // đổ hết vào hàng đợi — dây chuyền tự chơi trọn với nhịp riêng rồi tắt
  (events || []).forEach(e => { const n = byId.get(e.file); if (n) agentFlow(agentName, n, e.type || 'read', true, e); });
  endAgentFlow(agentName);
}
function addTrailSeg(tr, fromId, toId, speedK, onArrive) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_PTS * 3), 3));
  geo.setDrawRange(0, 2);                        // vệt tự vẽ dần theo đầu sao chổi
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: tr.color, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  line.frustumCulled = false;
  S.trailGroup.add(line);
  // THÂN vệt = dải Points 48 điểm chồng lấp (1 draw call) — đây mới là "độ dày", line chỉ là lõi sắc
  const body = new THREE.Points(geo, new THREE.PointsMaterial({
    color: tr.color, size: 4.5, sizeAttenuation: true, map: glowTexture('#ffffff'),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  body.frustumCulled = false;
  S.trailGroup.add(body);
  const a = byId.get(fromId), b = byId.get(toId);
  const len = (a && b && a.x !== undefined && b.x !== undefined)
    ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 80;
  const swirl = [];                              // hạt dữ liệu xoáy trôn ốc bị hút vào lõi lúc NẠP
  for (let i = 0; i < 16; i++) {
    const sp = glowSprite(glowTexture(tr.color), { opacity: 0 });
    const sc = 1.4 + Math.random() * 1.6;
    sp.scale.set(sc, sc, 1); sp.visible = false;
    S.trailGroup.add(sp);
    let nx = Math.random() - 0.5, ny = Math.random() - 0.5, nz = Math.random() - 0.5;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ux = -nz, uy = 0, uz = nx, ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; ul = 1; } ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    swirl.push({ sp, r0: 10 + Math.random() * 18, phi: Math.random() * Math.PI * 2,
      om: (2.5 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1), ux, uy, uz, vx, vy, vz });
  }
  tr.segs.push({
    fromId, toId, born: performance.now(), line, body, swirl, onArrive, comet: mkComet(tr.color),
    state: 'charge', chargeMs: 340 / (speedK || 1), tTravel: 0,
    travelMs: Math.min(520, 180 + len * 0.95) / (speedK || 1), lastSpark: 0,   // nhảy siêu tốc — snap về đích
    k1: (0.09 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),  // cung ngang nhẹ — jump gần thẳng
    k2: (0.05 + Math.random() * 0.09) * (Math.random() < 0.5 ? -1 : 1)   // vồng dọc nhẹ — vẫn giữ chiều sâu 3D
  });
  while (tr.segs.length > TRAIL_MAX) killSeg(tr.segs.shift());
  if (!tr.dots.length) for (let i = 0; i < 3; i++) {
    const sp = glowSprite(glowTexture('#ffffff'));
    sp.scale.set(3.2, 3.2, 1);
    S.trailGroup.add(sp); tr.dots.push(sp);
  }
}
function mkComet(color) {
  const mk = (tex, s) => {
    const sp = glowSprite(tex);
    sp.scale.set(s, s, 1); sp.visible = false;
    S.trailGroup.add(sp); return sp;
  };
  // Đầu đạn siêu tốc: quầng agent khổng lồ → lõi trắng nóng → tim xanh-trắng chói, đuôi motion-blur 5 lớp
  return {
    halo:  mk(glowTexture(color), 34),
    outer: mk(glowTexture(color), 18),
    inner: mk(glowTexture('#ffffff'), 7),
    core:  mk(glowTexture('#d6ffff'), 3.4),
    ghosts: [mk(glowTexture(color), 15), mk(glowTexture(color), 12),
             mk(glowTexture(color), 9),  mk(glowTexture(color), 7), mk(glowTexture(color), 5)] };
}
function killSwirl(s) {
  (s.swirl || []).forEach(w => { S.trailGroup.remove(w.sp); w.sp.material.dispose(); });
  s.swirl = [];
}
function killComet(s) {
  if (!s.comet) return;
  [s.comet.halo, s.comet.outer, s.comet.inner, s.comet.core]
    .concat(s.comet.ghosts).forEach(sp => { S.trailGroup.remove(sp); sp.material.dispose(); });
  s.comet = null;
}
function killSeg(s) {
  if (s.state !== 'done' && s.onArrive) { const f = s.onArrive; s.onArrive = null; f(); }
  killSwirl(s); killComet(s);
  S.trailGroup.remove(s.body); s.body.material.dispose();
  S.trailGroup.remove(s.line); s.line.geometry.dispose(); s.line.material.dispose();  // geometry dùng chung line+body
}
function writeCurve(s, a, b) {
  const pos = s.line.geometry.attributes.position;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  let nx = -dz, nz = dx, nl = Math.hypot(nx, nz);  // vuông góc hướng đi — cung tách khỏi link thẳng
  if (nl < 1e-4) { nx = 1; nz = 0; nl = 1; }
  const off = len * s.k1 / nl, lift = len * s.k2;
  const cx = (a.x + b.x) / 2 + nx * off, cy = (a.y + b.y) / 2 + lift, cz = (a.z + b.z) / 2 + nz * off;
  for (let i = 0; i < TRAIL_PTS; i++) {
    const t = i / (TRAIL_PTS - 1), u = 1 - t;
    pos.setXYZ(i,
      u * u * a.x + 2 * u * t * cx + t * t * b.x,
      u * u * a.y + 2 * u * t * cy + t * t * b.y,
      u * u * a.z + 2 * u * t * cz + t * t * b.z);
  }
  pos.needsUpdate = true;
}
function burstFX(node, color, big) {
  const mk = (delay, max, dur, tex) => {
    const sp = glowSprite(tex || ringTexture(color), { opacity: 0 });
    sp.visible = false; sp.scale.set(0.1, 0.1, 1);
    S.trailGroup.add(sp);
    bursts.push({ node, sp, t0: performance.now() + delay, dur, max });
  };
  const r = node.__r || 3;
  if (big) {
    mk(0, r * 9 + 22, 220, glowTexture('#ffffff'));  // chớp trắng chói khoảnh khắc thoát siêu tốc
    mk(0, r * 5 + 44, 300, glowTexture('#ffffff'));  // sóng xung kích trắng lan CỰC NHANH
    mk(0, 30 + r * 4, 720);
    mk(120, 20 + r * 3, 560);                    // vòng 2 trễ 120ms
    mk(260, 13 + r * 2, 460);                    // vòng 3 trễ 260ms — nhịp dây chuyền
    for (let i = 0; i < 26; i++) spawnSpark(node.x, node.y, node.z, color, 34);
  } else {
    mk(0, 11 + r * 1.7, 520);
  }
}
function updateBursts(now) {
  if (!bursts.length) return;
  const cam = S.Graph.camera().position;
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i], k = (now - b.t0) / b.dur;
    if (k < 0) continue;
    if (k >= 1) { S.trailGroup.remove(b.sp); b.sp.material.dispose(); bursts.splice(i, 1); continue; }
    const n = byId.get(b.node.id) || b.node;
    const e = 1 - Math.pow(1 - k, 2);
    const sc = b.max * e * camScale(cam, n);       // sóng nổ thấy được ở mọi mức zoom
    b.sp.visible = true;
    b.sp.position.set(n.x || 0, n.y || 0, n.z || 0);
    b.sp.scale.set(sc, sc, 1);
    b.sp.material.opacity = 0.9 * (1 - k);
  }
}
let sparkPrev = 0;
function spawnSpark(x, y, z, color, speed) {
  const sp = glowSprite(glowTexture(color));
  const sc = 1.2 + Math.random() * 1.4;
  sp.scale.set(sc, sc, 1); sp.position.set(x, y, z);
  S.trailGroup.add(sp);
  const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), v = speed * (0.5 + Math.random());
  sparks.push({ sp, t0: performance.now(), dur: 380 + Math.random() * 360,
    vx: v * Math.sin(ph) * Math.cos(th), vy: v * Math.sin(ph) * Math.sin(th), vz: v * Math.cos(ph) });
  if (sparks.length > 130) killSpark(0);
}
function killSpark(i) { const s = sparks[i]; S.trailGroup.remove(s.sp); s.sp.material.dispose(); sparks.splice(i, 1); }
function updateSparks(now) {
  const dt = Math.min(0.05, (now - sparkPrev) / 1000); sparkPrev = now;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i], k = (now - s.t0) / s.dur;
    if (k >= 1) { killSpark(i); continue; }
    s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
    s.sp.material.opacity = 0.8 * (1 - k);
  }
}
/* ---------- chớp nhảy siêu không gian ---------- */
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3();
function screenDir(a, b) {                                  // góc hướng a→b sau khi chiếu lên màn hình
  const cam = S.Graph.camera();
  _pA.set(a.x, a.y, a.z).project(cam); _pB.set(b.x, b.y, b.z).project(cam);
  return Math.atan2(_pB.y - _pA.y, _pB.x - _pA.x);
}
export function spawnWarp(x, y, z, a, b, color, opts) {
  // opts (Ư6.2): { op, dur, len0 } — sao băng nền là bản MỜ/chậm/dài hơn của cùng hiệu ứng
  const ang = screenDir(a, b);
  const sp = glowSprite(streakTexture(color), { opacity: 0, rotation: ang });
  sp.position.set(x + (Math.random() - 0.5) * 9, y + (Math.random() - 0.5) * 9, z + (Math.random() - 0.5) * 9);
  const len0 = (opts && opts.len0) || 10 + Math.random() * 16;
  sp.scale.set(len0, 2.4, 1);
  S.trailGroup.add(sp);
  warps.push({ sp, t0: performance.now(), dur: (opts && opts.dur) || 240 + Math.random() * 220, len0,
    op: (opts && opts.op) || 0.9 });
  if (warps.length > 70) killWarp(0);
}
function killWarp(i) { const w = warps[i]; S.trailGroup.remove(w.sp); w.sp.material.dispose(); warps.splice(i, 1); }
export function updateWarps(now) {
  if (!warps.length) return;
  const cam = S.Graph.camera().position;
  for (let i = warps.length - 1; i >= 0; i--) {
    const w = warps[i], k = (now - w.t0) / w.dur;
    if (k >= 1) { killWarp(i); continue; }
    const kCam = camScale(cam, w.sp.position);
    w.sp.scale.set((w.len0 + 70 * k) * kCam, 2.4 * kCam, 1);   // kéo dài dần như sao xuyên không
    w.sp.material.opacity = (w.op || 0.9) * (1 - k) * (k < 0.14 ? k / 0.14 : 1);
  }
}
/* ---------- Ư6.2: sao băng nền — chút "sự sống" khi không có agent nào chạy ---------- */
export function scheduleAmbient() {
  setTimeout(() => {
    try {
      const busy = [...agentTrails.values()].some(t => t.hopActive || t.queue.length);
      if (S.ambientOn && S.trailsOn && !document.hidden && !busy && S.trailGroup && S.Graph) {
        // điểm ngẫu nhiên trên vỏ cầu quanh graph, bay theo hướng ngẫu nhiên — mờ 0.35, không chói
        const r = 250 + Math.random() * 350, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph);
        const d = { x: x + (Math.random() - 0.5) * 260, y: y + (Math.random() - 0.5) * 260, z: z + (Math.random() - 0.5) * 260 };
        spawnWarp(x, y, z, { x, y, z }, d, '#d9d2ee', { op: 0.35, dur: 900 + Math.random() * 500, len0: 22 + Math.random() * 18 });
      }
    } catch (e) { console.error('ambient:', e); }
    scheduleAmbient();                      // chuỗi setTimeout thay vì interval — nhịp ngẫu nhiên thật
  }, 40000 + Math.random() * 50000);
}

function launchFX(a, b, color) {
  // BẬT NHẢY: chớp trắng lớn tại node nguồn + chùm tia sao kéo về hướng đích + tia lửa văng
  burstFX(a, color, false);
  const flash = glowSprite(glowTexture('#ffffff'), { opacity: 0 });
  flash.visible = false; flash.scale.set(0.1, 0.1, 1); flash.position.set(a.x, a.y, a.z);
  S.trailGroup.add(flash);
  bursts.push({ node: a, sp: flash, t0: performance.now(), dur: 250, max: (a.__r || 3) * 8 + 32 });
  const target = b || a;
  for (let i = 0; i < 12; i++) spawnWarp(a.x, a.y, a.z, a, target, color);
  for (let i = 0; i < 12; i++) spawnSpark(a.x, a.y, a.z, color, 24);
}
function camScale(cam, p) {
  // hiệu ứng chủ chốt phải nhìn thấy được ở MỌI mức zoom — phóng theo khoảng cách camera
  const d = Math.hypot(cam.x - (p.x || 0), cam.y - (p.y || 0), cam.z - (p.z || 0));
  return Math.min(2.8, Math.max(1, d / 350));
}
export function updateTrails(now) {
  if (!S.trailGroup) return;
  const cam = S.Graph.camera().position;
  agentTrails.forEach(tr => {
    for (let i = tr.segs.length - 1; i >= 0; i--)
      if (now - tr.segs[i].born > TRAIL_TTL) { killSeg(tr.segs[i]); tr.segs.splice(i, 1); }
    // chuyển pha chạy cả khi vệt đang tắt — node đến vẫn phải được thắp đúng lúc
    tr.segs.forEach(s => {
      // Deadline tuyệt đối per-hop: treo ở BẤT KỲ pha nào quá (charge+travel)+4s → ép done,
      // thắp node đến, nhả hàng đợi — lưới an toàn tổng quát thay vì đoán từng nguyên nhân kẹt
      if (s.state !== 'done' && now - s.born > s.chargeMs + s.travelMs + 4000) {
        s.state = 'done';
        s.line.geometry.setDrawRange(0, TRAIL_PTS);
        killSwirl(s); killComet(s);
        if (s.onArrive) { const f = s.onArrive; s.onArrive = null; f(); }
      }
      if (s.state === 'charge' && now - s.born >= s.chargeMs) {
        s.state = 'travel'; s.tTravel = now;       // TÁCH BỆ — BẬT NHẢY SIÊU KHÔNG GIAN
        killSwirl(s);
        const a = byId.get(s.fromId), b = byId.get(s.toId);
        if (a) {
          launchFX(a, b, tr.color);                // chớp nhảy + chùm tia sao kéo dài
          const pv = nodeVisit.get(s.fromId);
          if (pv && pv.agent === tr.name && !pv.leftAt) pv.leftAt = now;  // nguồn cạn năng lượng → mờ dần
        }
      }
      if (s.state === 'travel' && now - s.tTravel >= s.travelMs) {
        s.state = 'done';
        s.line.geometry.setDrawRange(0, TRAIL_PTS);
        killComet(s);
        if (s.onArrive) { const f = s.onArrive; s.onArrive = null; f(); }
      }
    });
    // watchdog chống kẹt hàng đợi: hopActive mà không còn đoạn nào đang nạp/bay → mở khoá bơm tiếp
    if (tr.hopActive && !tr.segs.some(s => s.state !== 'done')) { tr.hopActive = false; pumpQueue(tr); }
    if (!tr.segs.length || !S.trailsOn) { tr.dots.forEach(d => d.visible = false); return; }
    const last = tr.segs.length - 1;
    tr.segs.forEach((s, i) => {
      const a = byId.get(s.fromId), b = byId.get(s.toId);
      if (!a || !b || a.x === undefined || b.x === undefined) {
        s.line.visible = false; s.body.visible = false;
        s.swirl.forEach(w => w.sp.visible = false);
        if (s.comet) [s.comet.outer, s.comet.inner].concat(s.comet.ghosts).forEach(sp => sp.visible = false);
        return;
      }
      // Đoạn 'done' mà 2 node đứng yên: khỏi tính lại 64 điểm bezier + upload GPU mỗi frame
      const moved = s._ax !== a.x || s._ay !== a.y || s._az !== a.z ||
                    s._bx !== b.x || s._by !== b.y || s._bz !== b.z;
      if (s.state !== 'done' || moved) {
        writeCurve(s, a, b);
        s._ax = a.x; s._ay = a.y; s._az = a.z; s._bx = b.x; s._by = b.y; s._bz = b.z;
      }
      const pos = s.line.geometry.attributes.position;
      if (s.state === 'charge') {
        // pha NẠP HYPERSPACE: năng lượng dồn về node nguồn, xoáy hút vào, lõi rung mạnh dần trước khi bật nhảy
        s.line.visible = false; s.body.visible = false;
        const q = Math.min(1, (now - s.born) / s.chargeMs), qe = q * q;   // dồn nhanh về cuối
        const kCam = camScale(cam, a);
        const jitter = 1 + 0.26 * Math.sin(now / 20) + 0.14 * qe;         // rung tần số cao khi sắp nhảy
        const core = (7 + 22 * qe) * jitter * kCam;
        s.comet.halo.visible = s.comet.outer.visible = s.comet.inner.visible = s.comet.core.visible = true;
        [['halo', 1.9], ['outer', 1], ['inner', 0.42], ['core', 0.22]].forEach(([k, m]) => {
          s.comet[k].position.set(a.x, a.y, a.z); s.comet[k].scale.set(core * m, core * m, 1);
          s.comet[k].material.opacity = 0.5 + 0.5 * q;
        });
        s.comet.ghosts.forEach(g => g.visible = false);
        s.swirl.forEach(w => {
          const r = w.r0 * (1 - qe) * kCam + 2;
          const ang = w.phi + now / 1000 * w.om * (1 + 2 * q);           // xoáy nhanh dần khi bị hút vào lõi
          const co = Math.cos(ang), si = Math.sin(ang);
          w.sp.visible = true;
          w.sp.position.set(
            a.x + (w.ux * co + w.vx * si) * r,
            a.y + (w.uy * co + w.vy * si) * r,
            a.z + (w.uz * co + w.vz * si) * r);
          w.sp.material.opacity = 0.35 + 0.55 * q;
        });
        if (now - s.lastSpark > 55) { s.lastSpark = now; spawnSpark(a.x, a.y, a.z, tr.color, 7); }
      } else if (s.state === 'travel') {
        // pha LAO ĐI: nhảy siêu tốc — đầu đạn trắng nóng + quầng agent, beam trắng rực tự vẽ, đuôi bóng ma 5 lớp
        s.line.visible = true; s.body.visible = true;
        const p = Math.min(1, (now - s.tTravel) / s.travelMs);
        const e = Math.pow(p, 2.3);                // gia tốc bùng nổ — snap về đích
        const idx = Math.min(TRAIL_PTS - 1, Math.floor(e * (TRAIL_PTS - 1)));
        s.line.geometry.setDrawRange(0, Math.max(2, idx + 1));
        s.line.material.opacity = 1;
        s.body.material.opacity = 1;
        s.body.material.size = 7.5;                // beam dày hơn nhiều
        s.body.material.color.copy(tr.hotColor);   // Ư6.1: trắng nóng pha 30% màu agent — vẫn lightspeed, vẫn biết ai là ai
        const cx = pos.getX(idx), cy = pos.getY(idx), cz = pos.getZ(idx);
        const kCam = camScale(cam, { x: cx, y: cy, z: cz });
        const flick = (1 + 0.28 * Math.sin(now / 24)) * kCam;
        s.comet.halo.visible = s.comet.outer.visible = s.comet.inner.visible = s.comet.core.visible = true;
        [['halo', 30], ['outer', 17], ['inner', 7], ['core', 3.4]].forEach(([k, base]) => {
          s.comet[k].position.set(cx, cy, cz); s.comet[k].scale.set(base * flick, base * flick, 1);
          s.comet[k].material.opacity = 1;
        });
        s.comet.ghosts.forEach((g, gi) => {
          const pd = Math.max(0, (now - s.tTravel - 34 * (gi + 1)) / s.travelMs);
          const gidx = Math.min(TRAIL_PTS - 1, Math.floor(Math.pow(pd, 2.3) * (TRAIL_PTS - 1)));
          g.visible = p > 0.05;
          g.position.set(pos.getX(gidx), pos.getY(gidx), pos.getZ(gidx));
          const gs = (16 - gi * 2.4) * kCam;
          g.scale.set(gs, gs, 1);
          g.material.opacity = 0.5 - gi * 0.08;
        });
        // tia sao siêu tốc bắn ra từ đầu đạn — cảm giác xuyên không (star streaks)
        if (now - s.lastSpark > 15) {
          s.lastSpark = now;
          spawnSpark(cx, cy, cz, tr.color, 16);
          if (a && b) spawnWarp(cx, cy, cz, a, b, tr.color);
        }
      } else {
        // pha ĐUÔI: dải năng lượng nối trọn node đi → node đến, nhạt dần theo tuổi
        s.line.visible = true; s.body.visible = true;
        s.body.material.color.set(tr.color);       // trả màu agent sau khi beam trắng lao qua
        const timeK = Math.max(0, Math.min(1, (TRAIL_TTL - (now - s.born)) / TRAIL_FADE));
        // Ư6.3: heatmap đang bật → vệt TĨNH nhường vai chính (nửa opacity); vệt đang bay giữ nguyên
        const heatK = heatActive() ? 0.5 : 1;
        const fade = Math.pow(0.8, last - i) * timeK * heatK;
        s.line.material.opacity = 0.9 * fade;
        s.body.material.opacity = 0.6 * fade;
        s.body.material.size = 4.2;
      }
    });
    const s0 = tr.segs[last];
    const posAttr = (s0.state === 'done' && s0.line.visible) ? s0.line.geometry.attributes.position : null;
    tr.dots.forEach((sp, di) => {                  // hạt trắng chạy dọc đoạn mới nhất — tín hiệu hướng đi
      if (!posAttr) { sp.visible = false; return; }
      const t = (now / 1500 + di / tr.dots.length) % 1;
      const idx = Math.min(TRAIL_PTS - 1, Math.floor(t * TRAIL_PTS));
      sp.visible = true;
      sp.position.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      sp.material.opacity = 0.25 + 0.65 * Math.sin(Math.PI * t);
    });
  });
}
export function visitFx(n) {
  const v = nodeVisit.get(n.id);
  if (!v) return null;
  const now = performance.now();
  let k = 1;
  if (v.leftAt) {
    k = 1 - (now - v.leftAt) / VISIT_FADE;
    if (k <= 0) return null;
  }
  // k clamp 1: leftAt có thể đặt ở TƯƠNG LAI ("nán lại một nhịp rồi tắt" cuối dây chuyền)
  return { color: v.color, k: Math.min(1, k), breath: v.leftAt ? 0 : 0.5 + 0.5 * Math.sin((now - v.since) / 330) };
}
function updateVisits() {
  if (!nodeVisit.size) return;
  const now = performance.now();
  nodeVisit.forEach((v, id) => {
    if (!v.leftAt && now - v.lastSeen > VISIT_CAP) v.leftAt = now;   // agent im lặng quá trần → coi như đã rời
    const n = byId.get(id);
    if (v.leftAt && now - v.leftAt > VISIT_FADE) {
      nodeVisit.delete(id);
      const tr = agentTrails.get(v.agent);
      if (tr && tr.currentId === id) tr.currentId = null;            // chuyến đi kế tiếp bắt đầu mới, không nối
      if (tr && tr.visualId === id && !tr.hopActive && !tr.queue.length) tr.visualId = null;
    }
    if (n) applyNodeState(n);   // breathing chạy qua applyNodeState — heat/filter không đè được
  });
}
