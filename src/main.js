/* main.js — điểm vào: error handler toàn cục + boot() + vòng poll.
   index.html chỉ còn markup + importmap + <script type="module" src="/src/main.js">. */
import { S, $, tagOn } from './state.js';
import { initGraph, physics, addStars, addBloom, visibleData, indexData, updateStats,
         nodeOnScreen, followFlyTo } from './graph.js';
import { fxLoop, scheduleAmbient, agentTrails, agentFlow, replayFlow,
         updateTrails, updateWarps, spawnWarp, warps } from './effects.js';
import { pollActivity, pollChains } from './activity.js';
import { pollHeat } from './heat.js';
import { buildUI, initSections, initDemo, restoreExtOnFromStorage, restoreClusterFromStorage, sectOpen, refreshData } from './ui.js';
import { initReader, openReader, closeReader } from './reader.js';
import { initFinder, openSwitcher, closeSwitcher, buildTree } from './finder.js';
import { initCockpit, openTimeline, closeTimeline, openDashboard, closeDashboard } from './cockpit.js';
import { initWorkspace, WS, wsOpen, wsSwitch, wsCloseTab, wsSplit, wsBack,
         togglePin, pushRecent, renderSbSections } from './workspace.js';

// Mọi uncaught error phải hiện ra console — lỗi trong rAF/setTimeout chết câm rất khó lần
window.addEventListener('error', e => console.error('lỗi trang:', e.message, '@', (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => console.error('promise reject:', e.reason));

/* ---------- boot ---------- */
async function boot() {
  const res = await fetch('/graph-data');
  S.all = await res.json();
  S.vaultName = S.all.meta.vaultName || S.vaultName;
  S.all.nodes.filter(n => n.kind === 'tag').forEach(n => tagOn.add(n.id)); // tag: mặc định hiện
  restoreExtOnFromStorage();             // đuôi file: nhớ lần bật cuối (localStorage)
  S.data = visibleData();
  indexData();

  initGraph();                           // ForceGraph3D + orphanPull + controls + trailGroup
  window.__G = S.Graph; // debug hook: truy cập Graph từ DevTools console
  window.__fx = { nodeOnScreen, followFlyTo, agentTrails, agentFlow, replayFlow, buildUI, updateTrails, updateWarps, spawnWarp, warps, openReader, closeReader, openSwitcher, closeSwitcher, buildTree, openTimeline, closeTimeline, openDashboard, closeDashboard, WS, wsOpen, wsSwitch, wsCloseTab, wsSplit, wsBack, togglePin, pushRecent, renderSbSections }; // debug hook nghiệm thu (Ư1/Ư4/Ư6/Reader/Finder/Cockpit/Workspace — tab ẩn không có rAF, phải gọi tay)

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
  initSections();                 // Ư2.1: gập/mở section + nhớ trạng thái localStorage
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
  pollActivity();
  setInterval(() => { if (!document.hidden) pollActivity(); }, 800);
  setInterval(() => { if (!document.hidden) refreshData(); }, 45000);
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
