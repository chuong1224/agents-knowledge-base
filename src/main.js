/* main.js — điểm vào: error handler toàn cục + boot() + vòng poll.
   index.html chỉ còn markup + importmap + <script type="module" src="/src/main.js">. */
import { S, $, tagOn } from './state.js';
import { applyI18n, initLangSwitch } from './i18n.js';
import { initGraph, physics, addStars, addBloom, visibleData, indexData, updateStats,
         nodeOnScreen, followFlyTo } from './graph.js';
import { fxLoop, scheduleAmbient, agentTrails, agentFlow, replayFlow,
         updateTrails, updateWarps, spawnWarp, warps } from './effects.js';
import { pollActivity, pollChains } from './activity.js';
import { pollHeat } from './heat.js';
import { buildUI, initSections, initDemo, restoreExtOnFromStorage, restoreTagOffFromStorage,
         restoreGroupFromStorage, restoreClusterFromStorage, sectOpen, refreshData,
         initReload } from './ui.js';
import { initReader, openReader, closeReader } from './reader.js';
import { initFinder, openSwitcher, closeSwitcher, buildTree } from './finder.js';
import { initCockpit, openTimeline, closeTimeline, openDashboard, closeDashboard } from './cockpit.js';
import { initWorkMap, openWorkMap, closeWorkMap, pollWorkCount } from './work.js';
import { initInsight, openInsight, closeInsight, pollInsight } from './insight.js';
import { initIntegrity, openIntegrity, closeIntegrity, pollIntegrity } from './integrity.js';
import { initOnboarding, openOnboarding, closeOnboarding, syncOnbFab } from './onboarding.js';
import { initWorkspace, WS, wsOpen, wsSwitch, wsCloseTab, wsSplit, wsBack,
         togglePin, pushRecent, renderSbSections } from './workspace.js';

// Mọi uncaught error phải hiện ra console — lỗi trong rAF/setTimeout chết câm rất khó lần
window.addEventListener('error', e => console.error('page error:', e.message, '@', (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => console.error('promise reject:', e.reason));

/* ---------- boot ---------- */
async function boot() {
  const res = await fetch('/graph-data');
  S.all = await res.json();
  S.vaultName = S.all.meta.vaultName || S.vaultName;
  S.all.nodes.filter(n => n.kind === 'tag').forEach(n => tagOn.add(n.id)); // tag: mặc định hiện
  restoreTagOffFromStorage();            // …rồi tắt lại đúng tag user đã tắt phiên trước
  restoreGroupFromStorage();             // lọc nhóm màu (legend) — trước visibleData/initGraph
  restoreExtOnFromStorage();             // đuôi file: nhớ lần bật cuối (localStorage)
  S.data = visibleData();
  indexData();

  initGraph();                           // ForceGraph3D + orphanPull + controls + trailGroup
  window.__G = S.Graph; // debug hook: truy cập Graph từ DevTools console
  window.__fx = { nodeOnScreen, followFlyTo, agentTrails, agentFlow, replayFlow, buildUI, updateTrails, updateWarps, spawnWarp, warps, openReader, closeReader, openSwitcher, closeSwitcher, buildTree, openTimeline, closeTimeline, openDashboard, closeDashboard, openWorkMap, closeWorkMap, openInsight, closeInsight, pollInsight, openIntegrity, closeIntegrity, pollIntegrity, openOnboarding, closeOnboarding, WS, wsOpen, wsSwitch, wsCloseTab, wsSplit, wsBack, togglePin, pushRecent, renderSbSections, pollActivity }; // debug hook nghiệm thu (Ư1/Ư4/Ư6/Reader/Finder/Cockpit/Workspace/Insight — tab ẩn không có rAF, phải gọi tay; pollActivity thêm ở W64 để nghiệm thu nhánh boot_id đổi mà không cần tab hiện)

  // W43: dich markup tinh TRUOC khi cac module doc/dung UI — chay mot lan, khong ton kem
  applyI18n();
  initLangSwitch();
  initReload();                   // W64: nút ⟳ — cửa sổ app không có nút reload của trình duyệt

  physics('bung', true);
  addStars();
  await addBloom();
  initWorkspace();                // giai đoạn 4 Vault Cockpit: tabs/pane + ghim + lịch sử đọc
  buildUI();                      // (buildTree bên trong render cả section Ghim/Gần đây)
  restoreClusterFromStorage();    // V1: 🧲 gom cụm nhóm màu — nhớ lần bật cuối (mặc định TẮT)
  initDemo();
  initReader();                   // giai đoạn 1 Vault Cockpit: panel đọc note
  initFinder();                   // giai đoạn 2 Vault Cockpit: cây vault + quick switcher Ctrl+P
  initCockpit();                  // giai đoạn 3 Vault Cockpit: thanh tua ngày + dashboard hiệu quả
  initWorkMap();                    // Work Map: cây việc đang mở (/work — registry sống trong vault)
  pollWorkCount();                // số tóm tắt cho section panel (không mở overlay)
  initInsight();                  // 🩺 Sức khoẻ vault (/insight — W10)
  initIntegrity();                // 🧪 Toàn vẹn vault (/integrity — W11), cùng section 🩺
  initSections();                 // Ư2.1: gập/mở section + nhớ trạng thái localStorage
  initOnboarding();               // 🌱 Vault TRỐNG / cài sai chỗ (W13 + W42): mời 3 lối đi
  // Ư3.3: chú giải ký hiệu chuỗi — đóng 1 lần là nhớ vĩnh viễn
  try { if (localStorage.getItem('kbgraph3d.chainHelp.v1') === 'off') $('chain-help').style.display = 'none'; } catch (e) {}
  $('chain-help-x').onclick = () => {
    $('chain-help').style.display = 'none';
    try { localStorage.setItem('kbgraph3d.chainHelp.v1', 'off'); } catch (e) {}
  };
  // Ư5.3: hệ điều hành đặt "giảm chuyển động" → tắt mặc định 2 nguồn chuyển động liên tục
  // (tự xoay + vệt agent) bằng chính click switch — người dùng vẫn bật lại tay được.
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if ($('sw-rotate').classList.contains('on')) $('sw-rotate').click();
    if ($('sw-trails').classList.contains('on')) $('sw-trails').click();
    if ($('sw-ambient').classList.contains('on')) $('sw-ambient').click();   // sao băng nền cũng là chuyển động
  }
  scheduleAmbient();               // Ư6.2: sao băng nền 40–90s/lần khi nhàn rỗi
  updateStats();
  requestAnimationFrame(fxLoop);
  // Poll có điều kiện: tab ẩn nghỉ hết; chains chỉ khi panel MỞ + section chuỗi MỞ (Ư2.1);
  // heat khi (panel + section heat) mở HOẶC heatMode bật (node highlight cần data kể cả lúc panel ẩn).
  const panelOpen = () => !$('panel').classList.contains('hidden');
  const heatWanted = () => S.heatMode || (panelOpen() && sectOpen('heat'));
  // 🩺 chỉ số ở thang ngày/tuần: đo MỘT lần lúc boot (nếu section đang mở), sau đó
  // chỉ khi mở section / mở overlay / bấm ↻ — không có vòng poll nền.
  if (panelOpen() && sectOpen('insight')) { pollInsight(); pollIntegrity(); }
  pollActivity();
  setInterval(() => { if (!document.hidden) pollActivity(); }, 800);
  // Vault đổi từ ngoài app (user tự tạo note đầu tiên) → nút mời 🌱 tự biến mất
  setInterval(async () => { if (!document.hidden) { await refreshData(); syncOnbFab(); } }, 45000);
  pollChains();
  setInterval(() => { if (!document.hidden && panelOpen() && sectOpen('chains')) pollChains(); }, 4000);
  $('ch-refresh').onclick = pollChains;
  pollHeat();
  setInterval(() => { if (!document.hidden && heatWanted()) pollHeat(); }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { pollActivity(); if (panelOpen()) { pollChains(); pollHeat(); } }
  });
  window.addEventListener('resize', () =>
    S.Graph.width(innerWidth).height(innerHeight));
}

boot().catch(e => {
  $('err').style.display = 'grid';
  $('err-msg').textContent = String(e);
});
