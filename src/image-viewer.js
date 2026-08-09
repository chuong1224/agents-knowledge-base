/* image-viewer.js — lightbox ảnh trong Reader (W139–W143).
   Reader chỉ uỷ quyền click; module này sở hữu state ảnh, layout 80%, zoom/pan,
   context menu, clipboard fallback, focus trap và cleanup. */
import { $ } from './state.js';
import { tr } from './i18n.js';
import { MIN_SCALE, MAX_SCALE, fitScale, clampPan, clampScale, zoomAround } from './image-viewer-math.js';

const state = {
  open: false, opener: null, src: '', naturalWidth: 1, naturalHeight: 1,
  scale: 1, panX: 0, panY: 0, mode: 'actual', dragging: false,
};
const MAX_COPY_PIXELS = 5_000_000;   // canvas/Clipboard ảnh quá lớn có thể treo browser → link an toàn
const COPY_TIMEOUT_MS = 3_000;
const E = {};
let statusTimer = null;
let drag = null;

function refs() {
  if (E.root) return E;
  E.root = $('imgv'); E.box = $('imgv-box'); E.head = $('imgv-head');
  E.title = $('imgv-title'); E.scale = $('imgv-scale'); E.stage = $('imgv-stage');
  E.img = $('imgv-image'); E.menu = $('imgv-menu'); E.status = $('imgv-status');
  E.minus = $('imgv-minus'); E.plus = $('imgv-plus'); E.fit = $('imgv-fit');
  E.actual = $('imgv-actual'); E.close = $('imgv-close');
  E.copyImage = $('imgv-copy-image'); E.copyLink = $('imgv-copy-link');
  E.openOriginal = $('imgv-open-original'); E.download = $('imgv-download');
  return E;
}

export function isImageViewerOpen() { return state.open; }

export function decorateViewerImages(root) {
  root.querySelectorAll('img').forEach(img => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', tr('iv.open.aria', { name: img.alt || filename(imageUrl(img)) }));
  });
}

function imageUrl(img) { return img.currentSrc || img.src || ''; }

function filename(url) {
  try {
    const u = new URL(url, location.href);
    return decodeURIComponent(u.pathname.split('/').pop() || 'image');
  } catch (e) { return 'image'; }
}

function setStatus(message, tone = 'ok', hold = 2600) {
  clearTimeout(statusTimer);
  E.status.textContent = message;
  E.status.className = 'show ' + tone;
  statusTimer = setTimeout(() => { E.status.className = ''; }, hold);
}

function stageSize() {
  return { width: Math.max(1, E.stage.clientWidth), height: Math.max(1, E.stage.clientHeight) };
}

function clampCurrent() {
  const v = stageSize();
  const p = clampPan(state.panX, state.panY, state.naturalWidth, state.naturalHeight,
                     state.scale, v.width, v.height);
  state.panX = p.x; state.panY = p.y;
}

function syncTransform() {
  clampCurrent();
  E.img.style.transform = `translate(-50%, -50%) translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.scale})`;
  E.scale.textContent = Math.round(state.scale * 100) + '%';
  const v = stageSize();
  const pannable = state.naturalWidth * state.scale > v.width + 1 ||
                   state.naturalHeight * state.scale > v.height + 1;
  E.stage.classList.toggle('pannable', pannable);
  E.stage.classList.toggle('dragging', state.dragging);
}

function applyFit() {
  const v = stageSize();
  state.scale = fitScale(state.naturalWidth, state.naturalHeight, v.width, v.height);
  state.panX = 0; state.panY = 0; state.mode = state.scale < 0.9999 ? 'fit' : 'actual';
  syncTransform();
}

function applyActual() {
  state.scale = 1; state.panX = 0; state.panY = 0; state.mode = 'actual';
  syncTransform();
}

function zoomTo(target, clientX, clientY) {
  const r = E.stage.getBoundingClientRect();
  const x = Number.isFinite(clientX) ? clientX - r.left : r.width / 2;
  const y = Number.isFinite(clientY) ? clientY - r.top : r.height / 2;
  const next = zoomAround(state, target, x, y, state.naturalWidth, state.naturalHeight,
                          r.width, r.height);
  Object.assign(state, next, { mode: 'manual' });
  syncTransform();
}

function layoutBox(reset = false) {
  if (!state.open || !state.naturalWidth || !state.naturalHeight) return;
  const maxW = Math.max(240, innerWidth * 0.8);
  const maxH = Math.max(220, innerHeight * 0.8);
  const toolbarW = Math.min(460, maxW);
  E.box.style.width = Math.min(maxW, Math.max(toolbarW, state.naturalWidth)) + 'px';
  E.box.style.height = 'auto';
  E.stage.style.height = '0px';
  const cs = getComputedStyle(E.box);
  const borderW = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const borderH = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const boxW = Math.min(maxW, Math.max(toolbarW, state.naturalWidth + borderW));
  E.box.style.width = boxW + 'px';
  const headH = E.head.getBoundingClientRect().height;
  const stageH = Math.max(72, Math.min(state.naturalHeight, Math.max(72, maxH - headH - borderH)));
  E.stage.style.height = stageH + 'px';
  E.box.style.height = Math.min(maxH, headH + stageH + borderH) + 'px';
  if (reset || state.mode === 'fit') applyFit();
  else if (state.mode === 'actual') applyActual();
  else syncTransform();
}

function focusable() {
  return [...E.box.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(n => !n.hidden && n.offsetParent !== null);
}

function hideMenu(restoreFocus = false) {
  E.menu.hidden = true;
  if (restoreFocus && state.open) E.stage.focus({ preventScroll: true });
}

function showMenu(clientX, clientY) {
  E.menu.hidden = false;
  E.menu.style.left = '0px'; E.menu.style.top = '0px';
  const r = E.menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(clientX, innerWidth - r.width - 8));
  const top = Math.max(8, Math.min(clientY, innerHeight - r.height - 8));
  E.menu.style.left = left + 'px'; E.menu.style.top = top + 'px';
  E.menu.querySelector('button').focus({ preventScroll: true });
}

function closeViewer() {
  if (!state.open) return;
  hideMenu();
  clearTimeout(statusTimer);
  E.root.classList.remove('show');
  E.root.setAttribute('aria-hidden', 'true');
  $('reader').removeAttribute('inert');
  $('reader').removeAttribute('aria-hidden');
  document.documentElement.classList.remove('imgv-open');
  E.img.removeAttribute('src');
  E.img.onload = null; E.img.onerror = null;
  const opener = state.opener;
  Object.assign(state, { open: false, opener: null, src: '', naturalWidth: 1, naturalHeight: 1,
    scale: 1, panX: 0, panY: 0, mode: 'actual', dragging: false });
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

function openViewer(img) {
  refs();
  const src = imageUrl(img);
  if (!src) return;
  state.open = true; state.opener = img; state.src = src;
  state.scale = 1; state.panX = 0; state.panY = 0; state.mode = 'actual';
  E.title.textContent = img.alt || tr('iv.title');
  clearTimeout(statusTimer); E.status.hidden = true; E.status.textContent = '';
  E.status.className = '';
  E.root.classList.add('show');
  E.root.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('imgv-open');
  E.img.onload = () => {
    state.naturalWidth = Math.max(1, E.img.naturalWidth);
    state.naturalHeight = Math.max(1, E.img.naturalHeight);
    requestAnimationFrame(() => layoutBox(true));
  };
  E.img.onerror = () => setStatus(tr('iv.status.loaderr'), 'bad', 5000);
  E.img.alt = img.alt || '';
  E.img.src = src;
  E.stage.focus({ preventScroll: true });
  $('reader').setAttribute('inert', '');
  $('reader').setAttribute('aria-hidden', 'true');
}

function legacyCopyText(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    ok ? resolve() : reject(new Error('copy unavailable'));
  });
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await withTimeout(navigator.clipboard.writeText(text), 1_000);
      return;
    } catch (e) {
      // Một số browser cập nhật clipboard nhưng không resolve Promise khi user gesture
      // đã qua bước fetch; execCommand là đường hoàn tất trạng thái có giới hạn thời gian.
    }
  }
  return legacyCopyText(text);
}

async function copyLink(fallback = false, src = state.src) {
  hideMenu();
  try {
    await copyText(src);
    if (state.open && state.src === src)
      setStatus(fallback ? tr('iv.status.fallback') : tr('iv.status.copied.link'), fallback ? 'warn' : 'ok');
    return true;
  } catch (e) {
    if (state.open && state.src === src) setStatus(tr('iv.status.copyerr'), 'bad', 4500);
    return false;
  }
}

function unsupportedImageCopy(type, url, pixels = state.naturalWidth * state.naturalHeight) {
  const ext = filename(url).split('.').pop().toLowerCase();
  return pixels > MAX_COPY_PIXELS ||
    type === 'image/gif' || type === 'image/svg+xml' || ext === 'gif' || ext === 'svg' ||
    !navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem ||
    (ClipboardItem.supports && !ClipboardItem.supports('image/png'));
}

async function pngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    out => out ? resolve(out) : reject(new Error('png conversion failed')), 'image/png'));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('clipboard timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function copyImage() {
  hideMenu();
  setStatus(tr('iv.status.copying'), 'wait', 8000);
  const src = state.src;
  const pixels = state.naturalWidth * state.naturalHeight;
  try {
    // Kích thước tự nhiên và phần mở rộng đã có từ lúc mở lightbox: chặn sớm
    // ảnh quá lớn/GIF/SVG để không tải hoặc giải mã một payload chắc chắn phải fallback.
    if (unsupportedImageCopy('', src, pixels)) return copyLink(true, src);
    // Gọi clipboard.write ngay trong user gesture; dữ liệu PNG được chuẩn bị bằng Promise.
    // Chrome cho phép Promise-valued ClipboardItem và giữ quyền copy qua bước fetch/convert.
    const out = fetch(src, { cache: 'no-store' }).then(async res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (unsupportedImageCopy(blob.type, src, pixels)) throw new Error('unsupported image');
      return pngBlob(blob);
    });
    await withTimeout(navigator.clipboard.write([new ClipboardItem({ 'image/png': out })]), COPY_TIMEOUT_MS);
    if (state.open && state.src === src) setStatus(tr('iv.status.copied.image'));
  } catch (e) {
    await copyLink(true, src);                    // CORS / quyền / MIME: không báo thành công giả
  }
}

function openOriginal() {
  hideMenu();
  window.open(state.src, '_blank', 'noopener,noreferrer');
}

function downloadOriginal() {
  hideMenu();
  const a = document.createElement('a');
  a.href = state.src; a.download = filename(state.src); a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

function onKeydown(ev) {
  if (!state.open) return;
  if (ev.key === 'Escape') {
    ev.preventDefault(); ev.stopPropagation();
    if (!E.menu.hidden) hideMenu(true); else closeViewer();
    return;
  }
  if (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) {
    ev.preventDefault(); ev.stopPropagation();
    const r = E.stage.getBoundingClientRect();
    showMenu(r.left + r.width / 2, r.top + r.height / 2);
    return;
  }
  if (ev.key === 'Tab') {
    const nodes = focusable();
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    return;
  }
  if (ev.target.closest && ev.target.closest('button')) return;
  if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); zoomTo(state.scale * 1.2); }
  else if (ev.key === '-') { ev.preventDefault(); zoomTo(state.scale / 1.2); }
  else if (ev.key === '0') { ev.preventDefault(); applyActual(); }
  else if (ev.key.toLowerCase() === 'f') { ev.preventDefault(); applyFit(); }
}

export function initImageViewer(reader) {
  refs();
  reader.addEventListener('click', ev => {
    const img = ev.target.closest('.rd-content img');
    if (!img) return;
    ev.preventDefault(); ev.stopPropagation();
    openViewer(img);
  });
  reader.addEventListener('keydown', ev => {
    const img = ev.target.closest && ev.target.closest('.rd-content img');
    if (!img || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault(); ev.stopPropagation(); openViewer(img);
  });
  E.root.addEventListener('click', ev => { if (ev.target === E.root) closeViewer(); });
  E.box.addEventListener('click', ev => { if (!ev.target.closest('#imgv-menu')) hideMenu(); });
  E.stage.addEventListener('wheel', ev => {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0015);
    zoomTo(clampScale(state.scale * factor, MIN_SCALE, MAX_SCALE), ev.clientX, ev.clientY);
  }, { passive: false });
  E.stage.addEventListener('contextmenu', ev => {
    if (ev.shiftKey) return;
    ev.preventDefault(); showMenu(ev.clientX, ev.clientY);
  });
  E.stage.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || !E.stage.classList.contains('pannable')) return;
    ev.preventDefault(); hideMenu(); state.dragging = true;
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, panX: state.panX, panY: state.panY };
    E.stage.setPointerCapture(ev.pointerId); syncTransform();
  });
  E.stage.addEventListener('pointermove', ev => {
    if (!drag || drag.id !== ev.pointerId) return;
    state.panX = drag.panX + ev.clientX - drag.x;
    state.panY = drag.panY + ev.clientY - drag.y;
    syncTransform();
  });
  const endDrag = ev => {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null; state.dragging = false; syncTransform();
  };
  E.stage.addEventListener('pointerup', endDrag);
  E.stage.addEventListener('pointercancel', endDrag);
  E.minus.onclick = () => zoomTo(state.scale / 1.2);
  E.plus.onclick = () => zoomTo(state.scale * 1.2);
  E.fit.onclick = applyFit; E.actual.onclick = applyActual; E.close.onclick = closeViewer;
  E.copyImage.onclick = copyImage; E.copyLink.onclick = () => copyLink(false);
  E.openOriginal.onclick = openOriginal; E.download.onclick = downloadOriginal;
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', () => layoutBox(false));
}
