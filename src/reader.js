/* reader.js — giai đoạn 1 Vault Cockpit: đọc note ngay trong graph. Từ giai đoạn 4
   (Workspace) Reader có 2 pane × nhiều tab: model tab/ghim/lịch sử nằm ở
   workspace.js, file này chỉ lo DOM MỘT pane — fetch /note (markdown thô) → render
   bằng markdown-it (vendor UMD, global `markdownit`) + inline rule wikilink tự viết;
   ảnh đi qua /asset; backlinks tính thẳng từ S.all.links. API openReader(node, opts)
   giữ nguyên chữ ký cho graph/ui/finder — uỷ quyền wsOpen (opts.newTab mở tab mới).
   Resolve wikilink MIRROR build_graph_data.py: path tường minh → khớp id; trùng stem
   → ưu tiên cùng folder rồi path nông/ngắn nhất — link trong reader trỏ đúng node
   mà graph đã tạo cạnh, một ngữ nghĩa duy nhất.
   Top-level chỉ ĐỊNH NGHĨA (không gọi chéo module lúc eval) — an toàn vòng import. */
import { S, $, esc, idOf } from './state.js';
import { tr, locale } from './i18n.js';
import { flyTo } from './graph.js';
import { pulses } from './effects.js';
import { WS, wsOpen, wsBack, wsSplit, tabAt, isPinned, togglePin, pushRecent } from './workspace.js';
import { initImageViewer, isImageViewerOpen, decorateViewerImages } from './image-viewer.js';
import { openFileActions } from './file-actions.js';

const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov']);
const READER_W_KEY = 'kbgraph3d.readerW.v1';
const READER_W_DEF = { single: 520, split: 1046 };
const READER_W_MIN = { single: 300, split: 600 };
const READER_W_VAR = { single: '--reader-w', split: '--reader-split-w' };
const readerWidths = { ...READER_W_DEF };

let _md = null;          // instance markdown-it (tạo lười — vendor load trước module)
let _maps = null;        // index resolve, dựng lại mỗi lần render (vault có thể vừa refresh)
const _refs = [null, null];   // cache DOM refs mỗi pane

export function paneRefs(p) {
  if (_refs[p]) return _refs[p];
  const el = document.querySelector(`#reader .pane[data-pane="${p}"]`);
  const q = sel => el.querySelector(sel);
  return _refs[p] = {
    el, tabsWrap: q('.tabs'), plus: q('.tb-plus'), back: q('.rd-back'),
    title: q('.rd-title'), meta: q('.rd-meta'), obsidian: q('.rd-obsidian'),
    pin: q('.rd-pin'), split: q('.rd-split'), x: q('.rd-x'), body: q('.rd-body'),
    tags: q('.rd-tags'), content: q('.rd-content'), backlinks: q('.rd-backlinks'),
    token: null,         // chống response fetch về trễ đè nội dung tab đã đổi
  };
}
export function saveScroll(p) {
  const t = tabAt(p);
  if (t && _refs[p]) t.scroll = _refs[p].body.scrollTop;
}
export function syncPin(p) {
  const t = tabAt(p), R = paneRefs(p);
  const on = !!(t && isPinned(t.note));
  R.pin.textContent = on ? '★' : '☆';
  R.pin.classList.toggle('on', on);
  R.pin.title = on ? tr('rd.unpin') : tr('rd.pin');
}

/* ---------- resolve target (mirror resolve_note/resolve_file của scanner) ---------- */
function normPath(p) {
  const out = [];
  String(p).replace(/\\/g, '/').split('/').forEach(seg => {
    if (!seg || seg === '.') return;
    if (seg === '..') out.pop(); else out.push(seg);
  });
  return out.join('/');
}
function buildMaps() {
  const allById = new Map(), noteByStem = new Map(), fileByName = new Map();
  S.all.nodes.forEach(n => {
    allById.set(n.id, n);
    if (n.kind === 'note') {
      const k = n.stem.toLowerCase();
      if (!noteByStem.has(k)) noteByStem.set(k, []);
      noteByStem.get(k).push(n);
    } else if (n.kind === 'file') {
      const b = n.name.toLowerCase();
      if (!fileByName.has(b)) fileByName.set(b, n);   // first-win như scanner
    }
  });
  return { allById, noteByStem, fileByName };
}
function resolveNote(target, folder) {
  const norm = normPath(target);
  if (!norm) return null;
  if (norm.includes('/')) {
    const cand = /\.md$/i.test(norm) ? norm : norm + '.md';
    const hit = _maps.allById.get(cand);
    if (hit && hit.kind === 'note') return hit;
  }
  const base = norm.split('/').pop().replace(/\.md$/i, '');
  const cands = _maps.noteByStem.get(base.toLowerCase());
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return cands[0];
  const same = cands.filter(n => n.folder === folder);
  const pool = same.length ? same : cands;
  return pool.slice().sort((a, b) =>
    (a.id.split('/').length - b.id.split('/').length) ||
    (a.id.length - b.id.length) || (a.id < b.id ? -1 : 1))[0];
}
function resolveFile(target, folder) {
  const t = normPath(target);
  if (!t) return null;
  for (const c of [normPath((folder && folder !== '/' ? folder + '/' : '') + t), t]) {
    const n = _maps.allById.get(c);
    if (n && n.kind === 'file') return n;
  }
  return _maps.fileByName.get(t.split('/').pop().toLowerCase()) || null;
}

/* ---------- markdown-it + rule wikilink / ảnh / link thường ---------- */
function assetUrl(node) { return '/asset?path=' + encodeURIComponent(node.id); }
function fileAnchor(node, label) {
  return `<a class="wl file" href="#" data-file="${esc(node.id)}">📎 ${esc(label)}</a>`;
}
function renderWikilink(meta, env) {
  const inner = meta.inner.trim();
  const pipe = inner.indexOf('|');
  const left = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  const label = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
  const target = left.split('#')[0].trim();
  const disp = label || left || inner;
  if (!target) return `<span class="wl miss">${esc(disp)}</span>`;   // [[#anchor nội bộ]]
  if (meta.embed) {
    const f = resolveFile(target, env.folder);
    if (f && IMG_EXTS.has(f.ext)) return `<img src="${assetUrl(f)}" alt="${esc(disp)}" loading="lazy">`;
    if (f && VIDEO_EXTS.has(f.ext)) return `<video controls preload="metadata" src="${assetUrl(f)}"></video>`;
    if (f) return fileAnchor(f, disp);
  }
  const n = resolveNote(target, env.folder);
  if (n) return `<a class="wl" href="#" data-note="${esc(n.id)}">${meta.embed ? '📄 ' : ''}${esc(disp)}</a>`;
  const f = resolveFile(target, env.folder);
  if (f) return meta.embed && IMG_EXTS.has(f.ext)
    ? `<img src="${assetUrl(f)}" alt="${esc(disp)}" loading="lazy">` : fileAnchor(f, disp);
  return `<span class="wl miss" title="${tr('rd.wl.miss')}">${esc(disp)}</span>`;
}
function wikilinkRule(md) {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src, pos = state.pos;
    const embed = src.startsWith('![[', pos);
    if (!embed && !src.startsWith('[[', pos)) return false;
    const start = pos + (embed ? 3 : 2);
    const end = src.indexOf(']]', start);
    if (end < 0) return false;
    const inner = src.slice(start, end);
    if (!inner || inner.includes('\n') || inner.includes('[[')) return false;
    if (!silent) state.push('wikilink', '', 0).meta = { inner, embed };
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx, opts, env) => renderWikilink(tokens[idx].meta, env || {});
}
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/;   // http:, obsidian:, file:… — như scanner
function mediaRules(md) {
  const defImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    let src = t.attrGet('src') || '';
    if (src && !SCHEME_RE.test(src)) {
      try { src = decodeURIComponent(src); } catch (e) {}
      const f = resolveFile(src.split('#')[0], (env || {}).folder);
      if (f) t.attrSet('src', assetUrl(f));
    }
    t.attrSet('loading', 'lazy');
    return (defImage || self.renderToken.bind(self))(tokens, idx, opts, env, self);
  };
  const defLink = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const href = t.attrGet('href') || '';
    if (SCHEME_RE.test(href)) {
      t.attrSet('target', '_blank'); t.attrSet('rel', 'noopener');
    } else if (href && !href.startsWith('#')) {
      let dec = href;
      try { dec = decodeURIComponent(href); } catch (e) {}
      dec = dec.split('#')[0];
      const n = resolveNote(dec, (env || {}).folder);
      if (n) { t.attrSet('href', '#'); t.attrJoin('class', 'wl'); t.attrSet('data-note', n.id); }
      else {
        const f = resolveFile(dec, (env || {}).folder);
        if (f) { t.attrSet('href', '#'); t.attrJoin('class', 'wl file'); t.attrSet('data-file', f.id); }
      }
    }
    return defLink(tokens, idx, opts, env, self);
  };
}
function mdRenderer() {
  if (_md) return _md;
  _md = window.markdownit({ html: false, linkify: true });
  wikilinkRule(_md);
  mediaRules(_md);
  return _md;
}

/* ---------- hậu kỳ DOM: callout Obsidian + task list (vault dùng dày đặc) ---------- */
function decorateCallouts(root) {
  root.querySelectorAll('blockquote > p:first-child').forEach(p => {
    const t = p.firstChild;
    if (!t || t.nodeType !== 3) return;
    const m = t.textContent.match(/^\[!(\w+)\][+-]?\s*/);
    if (!m) return;
    t.textContent = t.textContent.slice(m[0].length);
    const bq = p.parentElement;
    bq.classList.add('callout', 'co-' + m[1].toLowerCase());
    const head = document.createElement('div');
    head.className = 'co-head';
    head.textContent = m[1].toUpperCase();
    bq.insertBefore(head, p);
  });
}
function decorateTasks(root) {
  root.querySelectorAll('li').forEach(li => {
    const t = (li.firstChild && li.firstChild.nodeType === 3) ? li.firstChild
      : (li.firstElementChild && li.firstElementChild.tagName === 'P' ? li.firstElementChild.firstChild : null);
    if (!t || t.nodeType !== 3) return;
    const m = t.textContent.match(/^\[( |x|X)\]\s+/);
    if (!m) return;
    t.textContent = t.textContent.slice(m[0].length);
    li.classList.add('task', m[1] === ' ' ? 'todo' : 'done');
  });
}

/* ---------- backlinks từ chính graph data ---------- */
function renderBacklinks(node, R) {
  const seen = new Set(), rows = [];
  S.all.links.forEach(l => {
    if (idOf(l.target) !== node.id) return;
    const src = typeof l.source === 'object' ? l.source : _maps.allById.get(l.source);
    if (!src || src.kind !== 'note' || src.id === node.id || seen.has(src.id)) return;
    seen.add(src.id);
    rows.push(src);
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (!rows.length) { R.backlinks.innerHTML = `<h4>🔗 Backlinks</h4><div class="bl-empty">${tr('rd.bl.empty')}</div>`; return; }
  R.backlinks.innerHTML = `<h4>${tr('rd.bl.count', { n: rows.length })}</h4>` + rows.map(n =>
    `<div class="bl-row" data-note="${esc(n.id)}"><span class="dot" style="background:${n.color}"></span><span class="n">${esc(n.name)}</span></div>`
  ).join('');
}

/* ---------- render tab active của MỘT pane ---------- */
export async function renderPane(p, opts = {}) {
  const t = tabAt(p);
  if (!t) return;
  const R = paneRefs(p);
  _maps = buildMaps();
  const node = _maps.allById.get(t.note);
  if (!node || node.kind !== 'note') {              // note vừa bị xoá/đổi tên khỏi vault
    R.title.textContent = t.note.split('/').pop().replace(/\.md$/, '');
    R.meta.textContent = '';
    R.tags.innerHTML = '';
    R.content.innerHTML = `<div class="bl-empty">${tr('rd.gone')}</div>`;
    R.backlinks.innerHTML = '';
    return;
  }
  R.back.style.visibility = t.hist.length ? 'visible' : 'hidden';
  R.title.textContent = node.name;
  R.tags.innerHTML = node.tags.map(tg => `<span class="tag">#${esc(tg)}</span>`).join('');
  R.obsidian.href = `obsidian://open?vault=${encodeURIComponent(S.vaultName)}&file=${encodeURIComponent(node.id.replace(/\.md$/, ''))}`;
  syncPin(p);
  R.meta.textContent = tr('rd.meta', { folder: node.folder, n: node.degree });
  R.content.innerHTML = `<div class="bl-empty">${tr('rd.loading')}</div>`;
  if (opts.fly !== false) {
    flyTo(node, 1100);
    pulses.push({ node, t0: performance.now(), dur: 1800, color: '#ffffff', soft: true });
  }
  const token = R.token = {};
  let d;
  try {
    const res = await fetch('/note?path=' + encodeURIComponent(node.id), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch (e) {
    if (R.token === token) {
      R.content.innerHTML = `<div class="bl-empty">${tr('rd.readerr', { e: esc(e.message) })}</div>`;
      R.backlinks.innerHTML = '';
    }
    return;
  }
  if (R.token !== token || tabAt(p) !== t || t.note !== node.id) return;  // đã nhảy sang note/tab khác
  const when = new Date(d.mtime * 1000).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
  R.meta.textContent = tr('rd.meta.edited', { folder: node.folder, n: node.degree, when });
  const text = d.text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '');   // frontmatter đã hiện ở header
  R.content.innerHTML = mdRenderer().render(text, { folder: node.folder });
  decorateCallouts(R.content);
  decorateTasks(R.content);
  decorateViewerImages(R.content);
  renderBacklinks(node, R);
  R.body.scrollTop = t.scroll || 0;                 // quay lại tab = đúng chỗ đang đọc
  pushRecent(node.id);                              // lịch sử đọc (giai đoạn 4)
}

/* ---------- mở / đóng / init ---------- */
export function openReader(node, opts = {}) { wsOpen(node, opts); }
export function closeReader() { $('reader').classList.remove('show'); }   // model tabs GIỮ NGUYÊN — mở lại còn nguyên workspace

/* ---------- kéo co giãn ngang Reader ---------- */
function readerMode() { return $('reader').classList.contains('split') ? 'split' : 'single'; }
function readerMax(mode) {
  const readerStyle = getComputedStyle($('reader'));
  // --rail-w là chuỗi calc(...) nên parseFloat trực tiếp cho NaN; left đã được CSS
  // resolve thành pixel và luôn bằng 12px + rail, kể cả khi Reader đang display:none.
  const rail = Math.max(0, (parseFloat(readerStyle.left) || 12) - 12);
  const rightGap = parseFloat(readerStyle.getPropertyValue('--reader-right-gap')) || 356;
  return Math.max(READER_W_MIN[mode], Math.round(innerWidth - rail - rightGap));
}
function persistReaderWidths() {
  try { localStorage.setItem(READER_W_KEY, JSON.stringify(readerWidths)); } catch (e) {}
}
function applyReaderWidth(mode, px, save = false) {
  const w = Math.max(READER_W_MIN[mode], Math.round(px));
  readerWidths[mode] = w;
  $('reader').style.setProperty(READER_W_VAR[mode], w + 'px');
  if (save) persistReaderWidths();
  syncReaderResizeAria();
  return w;
}
function setReaderWidth(px, save = false) {
  const mode = readerMode();
  return applyReaderWidth(mode, Math.min(readerMax(mode), px), save);
}
function syncReaderResizeAria() {
  const h = $('rd-resize'), mode = readerMode();
  const actual = $('reader').getBoundingClientRect().width || Math.min(readerWidths[mode], readerMax(mode));
  h.setAttribute('aria-valuemin', String(READER_W_MIN[mode]));
  h.setAttribute('aria-valuemax', String(readerMax(mode)));
  h.setAttribute('aria-valuenow', String(Math.round(actual)));
}
function initReaderResize() {
  const h = $('rd-resize');
  try {
    const saved = JSON.parse(localStorage.getItem(READER_W_KEY) || '{}');
    for (const mode of ['single', 'split'])
      if (Number.isFinite(saved[mode])) readerWidths[mode] = Math.max(READER_W_MIN[mode], saved[mode]);
  } catch (e) {}
  applyReaderWidth('single', readerWidths.single);
  applyReaderWidth('split', readerWidths.split);

  h.onpointerdown = ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    try { h.setPointerCapture(ev.pointerId); } catch (e) {}
    h.classList.add('active');
    document.documentElement.classList.add('rd-dragging');
    const x0 = ev.clientX, start = $('reader').getBoundingClientRect().width;
    h.onpointermove = e => setReaderWidth(start + (e.clientX - x0));
    h.onpointerup = h.onpointercancel = () => {
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      h.classList.remove('active');
      document.documentElement.classList.remove('rd-dragging');
      setReaderWidth($('reader').getBoundingClientRect().width, true);
    };
  };
  h.ondblclick = () => applyReaderWidth(readerMode(), READER_W_DEF[readerMode()], true);
  h.onkeydown = ev => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    setReaderWidth($('reader').getBoundingClientRect().width + (ev.key === 'ArrowRight' ? 16 : -16), true);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncReaderResizeAria).observe($('reader'));
  new MutationObserver(syncReaderResizeAria).observe($('panel'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', syncReaderResizeAria);
  $('sb-resize').addEventListener('pointerup', syncReaderResizeAria);
}

export function initReader() {
  initReaderResize();
  [0, 1].forEach(p => {
    const R = paneRefs(p);
    R.x.onclick = closeReader;
    R.back.onclick = () => wsBack(p);
    R.split.onclick = () => wsSplit(p);
    R.pin.onclick = () => {
      const t = tabAt(p);
      if (!t) return;
      togglePin(t.note);
      syncPin(0);
      if (WS.tabs[1].length) syncPin(1);            // 2 pane có thể cùng mở 1 note
    };
  });
  // MỘT handler uỷ quyền cho mọi điều hướng trong panel: wikilink, link .md thường,
  // hàng backlink — mở trong pane chứa link; Ctrl/middle-click = tab mới (giai đoạn 4)
  const navigate = (ev, forceNew) => {
    const el = ev.target.closest('[data-note], [data-file]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.file) {
      const f = _maps && _maps.allById.get(el.dataset.file);
      if (f && f.kind === 'file') openFileActions(f);
      return;
    }
    const paneEl = ev.target.closest('.pane');
    const n = _maps && _maps.allById.get(el.dataset.note);
    if (n && n.kind === 'note')
      wsOpen(n, { pane: paneEl ? +paneEl.dataset.pane : 0, newTab: forceNew || ev.ctrlKey || ev.metaKey });
  };
  $('reader').addEventListener('click', ev => navigate(ev, false));
  $('reader').addEventListener('auxclick', ev => { if (ev.button === 1) navigate(ev, true); });
  initImageViewer($('reader'));
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (isImageViewerOpen()) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;   // Esc trong ô tìm kiếm giữ nghĩa cũ
    if ($('reader').classList.contains('show')) closeReader();
  });
}
