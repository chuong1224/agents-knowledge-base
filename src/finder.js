/* finder.js — giai đoạn 2 Vault Cockpit (Finder): cây folder vault + quick switcher
   Ctrl+P. Cây dựng HOÀN TOÀN client-side từ field folder của /graph-data (không cần
   endpoint mới) và ĐỘC LẬP với bộ lọc tag/đuôi trên graph — tree = điều hướng,
   filter = hiển thị (2 ngữ nghĩa, tinh thần Ư4.1). Switcher: khớp tên + #tag tức thì
   trên client (deAccent), nhóm "Nội dung" từ /search (debounce 250ms, ≥2 ký tự);
   từ giai đoạn 4: nhóm "Đọc gần đây" khi ô trống + Ctrl/middle-click mở TAB MỚI
   (cây lẫn switcher; nút ＋ tabbar mở switcher ở chế độ tab mới).
   Top-level chỉ ĐỊNH NGHĨA (không gọi chéo module lúc eval) — an toàn vòng import. */
import { S, $, esc, deAccent } from './state.js';
import { openReader } from './reader.js';
import { recentNotes, renderSbSections } from './workspace.js';

const TREE_OPEN_KEY = 'kbgraph3d.treeOpen.v1';
const SIDEBAR_KEY = 'kbgraph3d.sidebarOpen.v1';
const SB_W_KEY = 'kbgraph3d.sidebarW.v1';
const SB_W_DEF = 280, SB_W_MIN = 200;
let treeOpen = new Set();      // path folder đang mở (persist localStorage)
let _restored = false;
let _byId = new Map();         // id -> node, dựng lại mỗi buildTree/openSwitcher

const viCmp = (a, b) => a.localeCompare(b, 'vi');
function assetUrl(node) { return '/asset?path=' + encodeURIComponent(node.id); }

function saveTreeOpen() {
  try { localStorage.setItem(TREE_OPEN_KEY, JSON.stringify([...treeOpen])); } catch (e) {}
}
function restoreTreeOpen() {
  try {
    const arr = JSON.parse(localStorage.getItem(TREE_OPEN_KEY) || '[]');
    if (Array.isArray(arr)) treeOpen = new Set(arr.filter(x => typeof x === 'string'));
  } catch (e) {}
}

/* ---------- cây folder vault ---------- */
function treeModel() {
  // Gom node note/file theo field folder thành cây lồng nhau; n = số note đệ quy.
  const root = { dirs: new Map(), notes: [], files: [], n: 0 };
  _byId = new Map();
  S.all.nodes.forEach(nd => {
    _byId.set(nd.id, nd);
    if (nd.kind !== 'note' && nd.kind !== 'file') return;
    const parts = (!nd.folder || nd.folder === '/') ? [] : nd.folder.split('/');
    let cur = root;
    parts.forEach(p => {
      if (!cur.dirs.has(p)) cur.dirs.set(p, { dirs: new Map(), notes: [], files: [], n: 0 });
      cur = cur.dirs.get(p);
    });
    (nd.kind === 'note' ? cur.notes : cur.files).push(nd);
  });
  const count = dir => {
    let n = dir.notes.length;
    dir.dirs.forEach(d => { n += count(d); });
    dir.n = n;
    return n;
  };
  count(root);
  return root;
}
function renderDir(dir, path, depth, out) {
  const pad = 6 + depth * 13;
  [...dir.dirs.keys()].sort(viCmp).forEach(name => {
    const sub = dir.dirs.get(name);
    const p = path ? path + '/' + name : name;
    const open = treeOpen.has(p);
    out.push(`<div class="tr dir" role="button" tabindex="0" data-dir="${esc(p)}"` +
      ` aria-expanded="${open}" style="padding-left:${pad}px">` +
      `<span class="tw">${open ? '▾' : '▸'}</span><span class="n">${esc(name)}</span>` +
      `<span class="c">${sub.n}</span></div>`);
    if (open) renderDir(sub, p, depth + 1, out);
  });
  dir.notes.slice().sort((a, b) => viCmp(a.stem, b.stem)).forEach(n =>
    out.push(`<div class="tr note" role="button" tabindex="0" data-note="${esc(n.id)}"` +
      ` style="padding-left:${pad}px" title="${esc(n.name)}">` +
      `<span class="dot" style="background:${n.color}"></span><span class="n">${esc(n.stem)}</span></div>`));
  dir.files.slice().sort((a, b) => viCmp(a.name, b.name)).forEach(f =>
    out.push(`<div class="tr file" role="button" tabindex="0" data-file="${esc(f.id)}"` +
      ` style="padding-left:${pad}px" title="${esc(f.id)} — mở tab mới">` +
      `<span class="tw">📎</span><span class="n">${esc(f.name)}</span></div>`));
}
export function buildTree() {
  if (!_restored) { restoreTreeOpen(); _restored = true; }
  const out = [];
  renderDir(treeModel(), '', 0, out);
  $('tree').innerHTML = out.join('') || '<div class="bl-empty">Vault trống.</div>';
  renderSbSections();   // section Ghim/Gần đây rebuild cùng nhịp (tên/màu note có thể đổi)
}
function onTreeActivate(row, newTab) {
  if (row.dataset.dir) {
    const p = row.dataset.dir;
    treeOpen.has(p) ? treeOpen.delete(p) : treeOpen.add(p);
    saveTreeOpen();
    buildTree();
    const again = $('tree').querySelector(`.tr.dir[data-dir="${CSS.escape(p)}"]`);
    if (again) again.focus();                 // rebuild xong trả focus — Tab không mất chỗ
  } else if (row.dataset.note) {
    const n = _byId.get(row.dataset.note);
    if (n) openReader(n, { newTab });
  } else if (row.dataset.file) {
    const f = _byId.get(row.dataset.file);
    if (f) window.open(assetUrl(f), '_blank', 'noopener');
  }
}

/* ---------- quick switcher Ctrl+P ---------- */
let _qsSel = 0;                        // index dòng đang chọn (↑↓)
let _qsTimer = 0;                      // debounce fetch /search
let _qsSeq = 0;                        // chống response về trễ đè kết quả mới
let _qsContent = { q: '', rows: [] };  // kết quả /search của query gần nhất
let _qsNewTab = false;                 // mở từ nút ＋ tabbar → mọi lựa chọn thành tab mới

function qsRows() { return [...$('qs-results').querySelectorAll('.qs-row[data-note]')]; }
function qsSelect(i) {
  const rows = qsRows();
  if (!rows.length) { _qsSel = 0; return; }
  _qsSel = Math.max(0, Math.min(i, rows.length - 1));
  rows.forEach((r, k) => r.classList.toggle('sel', k === _qsSel));
  rows[_qsSel].scrollIntoView({ block: 'nearest' });
}
function qsNoteRow(n, extra) {
  return `<div class="qs-row" data-note="${esc(n.id)}" title="${esc(n.name)}">` +
    `<span class="dot" style="background:${n.color}"></span>` +
    `<span class="n">${esc(n.stem)}</span>${extra || ''}<span class="f">${esc(n.folder)}</span></div>`;
}
function qsContentRow(r) {
  const n = _byId.get(r.path);
  if (!n || n.kind !== 'note') return '';
  return `<div class="qs-row two" data-note="${esc(n.id)}" title="${esc(n.name)}">` +
    `<div class="l1"><span class="dot" style="background:${n.color}"></span>` +
    `<span class="n">${esc(n.stem)}</span><span class="hits">${r.hits}×</span>` +
    `<span class="f">${esc(n.folder)}</span></div>` +
    `<div class="snip">${esc(r.snippet)}</div></div>`;
}
function qsRender() {
  const qRaw = $('qs-input').value.trim();
  const notes = S.all.nodes.filter(n => n.kind === 'note');
  let html = '';
  if (!qRaw) {
    const rc = recentNotes(6);          // giai đoạn 4: mở switcher trống = quay lại chỗ vừa đọc
    if (rc.length) html = '<div class="qs-h">Đọc gần đây</div>' + rc.map(r => qsNoteRow(r.node)).join('');
    const top = notes.slice().sort((a, b) => b.degree - a.degree).slice(0, 8);
    html += '<div class="qs-h">Note nhiều liên kết</div>' + top.map(n => qsNoteRow(n)).join('');
  } else if (qRaw.startsWith('#')) {
    // Duyệt theo tag: #q khớp không dấu với bất kỳ tag nào của note
    const q = deAccent(qRaw.slice(1));
    const hit = notes.filter(n => n.tags.some(t => deAccent(t).includes(q)))
      .sort((a, b) => viCmp(a.stem, b.stem)).slice(0, 30);
    html = `<div class="qs-h">Duyệt tag · ${hit.length} note</div>` +
      (hit.map(n => qsNoteRow(n,
        `<span class="tagb">#${esc(n.tags.find(t => deAccent(t).includes(q)) || '')}</span>`)).join('') ||
        '<div class="qs-miss">Không có tag nào khớp.</div>');
  } else {
    const q = deAccent(qRaw);
    const starts = [], incl = [];
    notes.forEach(n => {
      const s = deAccent(n.stem), t = deAccent(n.name);
      if (s.startsWith(q) || t.startsWith(q)) starts.push(n);
      else if (s.includes(q) || t.includes(q)) incl.push(n);
    });
    const named = starts.sort((a, b) => viCmp(a.stem, b.stem))
      .concat(incl.sort((a, b) => viCmp(a.stem, b.stem))).slice(0, 8);
    html = '<div class="qs-h">Tên note</div>' +
      (named.map(n => qsNoteRow(n)).join('') || '<div class="qs-miss">Không note nào khớp tên.</div>');
    if (qRaw.length >= 2) {
      html += '<div class="qs-h">Nội dung</div>';
      if (_qsContent.q === qRaw) {
        html += _qsContent.rows.map(qsContentRow).join('') ||
          '<div class="qs-miss">Không khớp nội dung note nào.</div>';
      } else {
        html += '<div class="qs-miss">Đang tìm…</div>';
      }
    }
  }
  $('qs-results').innerHTML = html;
  qsSelect(0);
}
function qsFetch(qRaw) {
  clearTimeout(_qsTimer);
  if (qRaw.length < 2 || qRaw.startsWith('#')) return;
  _qsTimer = setTimeout(async () => {
    const seq = ++_qsSeq;
    try {
      const res = await fetch('/search?q=' + encodeURIComponent(qRaw) + '&limit=10',
        { cache: 'no-store' });
      const d = await res.json();
      if (seq !== _qsSeq || $('qs-input').value.trim() !== qRaw) return;  // đã gõ tiếp
      _qsContent = { q: qRaw, rows: d.results || [] };
      qsRender();
    } catch (e) {}
  }, 250);
}
function qsOpenSel(newTab) {
  const rows = qsRows();
  const row = rows[_qsSel] || rows[0];
  if (!row) return;
  const n = _byId.get(row.dataset.note);
  const force = _qsNewTab;
  closeSwitcher();
  if (n && n.kind === 'note') openReader(n, { newTab: newTab || force });
}
export function openSwitcher(opts) {
  _byId = new Map(S.all.nodes.map(n => [n.id, n]));
  _qsContent = { q: '', rows: [] };
  _qsNewTab = !!(opts && opts.newTab);
  $('qs').classList.add('show');
  const inp = $('qs-input');
  inp.value = '';
  qsRender();
  inp.focus();
}
export function closeSwitcher() { $('qs').classList.remove('show'); _qsNewTab = false; }

/* ---------- sidebar trái (nhà của cây vault) ---------- */
function applySidebar(open) {
  // --rail-w trên :root là MỘT nguồn sự thật cho layout trái: sidebar/toggle/Reader/hint cùng dời
  document.documentElement.classList.toggle('rail-hidden', !open);
  $('sidebar-toggle').setAttribute('aria-expanded', String(open));
}
function initSidebar() {
  let open = true;
  try { open = localStorage.getItem(SIDEBAR_KEY) !== 'off'; } catch (e) {}
  applySidebar(open);
  $('sidebar-toggle').onclick = () => {
    open = !open;
    try { localStorage.setItem(SIDEBAR_KEY, open ? 'on' : 'off'); } catch (e) {}
    applySidebar(open);
  };
  initSbResize();
}

/* ---------- kéo co giãn bề rộng sidebar ---------- */
const sbMax = () => Math.min(480, Math.round(innerWidth * 0.4));
function setSbW(px, save) {
  // Chỉ set --sb-w; --rail-w là calc() derived trong CSS → Reader/hint/toggle tự dời
  const w = Math.max(SB_W_MIN, Math.min(sbMax(), Math.round(px)));
  document.documentElement.style.setProperty('--sb-w', w + 'px');
  $('sb-resize').setAttribute('aria-valuenow', String(w));
  if (save) { try { localStorage.setItem(SB_W_KEY, String(w)); } catch (e) {} }
  return w;
}
function initSbResize() {
  const h = $('sb-resize');
  h.setAttribute('aria-valuemin', String(SB_W_MIN));
  h.setAttribute('aria-valuemax', String(sbMax()));
  let w0 = SB_W_DEF;
  try { w0 = parseInt(localStorage.getItem(SB_W_KEY), 10) || SB_W_DEF; } catch (e) {}
  setSbW(w0);
  h.onpointerdown = ev => {
    ev.preventDefault();
    try { h.setPointerCapture(ev.pointerId); } catch (e) {}   // pointerId stale/synthetic không được làm gãy kéo
    h.classList.add('active');
    document.documentElement.classList.add('sb-dragging');   // tắt transition khi kéo
    const x0 = ev.clientX, start = $('sidebar').getBoundingClientRect().width;
    h.onpointermove = e => setSbW(start + (e.clientX - x0));
    h.onpointerup = h.onpointercancel = () => {
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      h.classList.remove('active');
      document.documentElement.classList.remove('sb-dragging');
      setSbW($('sidebar').getBoundingClientRect().width, true);   // chốt + persist
    };
  };
  h.ondblclick = () => setSbW(SB_W_DEF, true);
  h.onkeydown = ev => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    setSbW($('sidebar').getBoundingClientRect().width + (ev.key === 'ArrowRight' ? 16 : -16), true);
  };
}

export function initFinder() {
  initSidebar();
  // Cây: uỷ quyền click + Enter/Space cho mọi hàng (chuẩn Ư5.2); Ctrl/middle-click note = tab mới
  $('tree').addEventListener('click', ev => {
    const row = ev.target.closest('.tr');
    if (row) onTreeActivate(row, ev.ctrlKey || ev.metaKey);
  });
  $('tree').addEventListener('auxclick', ev => {
    if (ev.button !== 1) return;
    const row = ev.target.closest('.tr');
    if (row && row.dataset.note) { ev.preventDefault(); onTreeActivate(row, true); }
  });
  $('tree').addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = ev.target.closest('.tr');
    if (row) { ev.preventDefault(); onTreeActivate(row, ev.ctrlKey || ev.metaKey); }
  });
  // Switcher: Ctrl+P bật/tắt (chặn hộp thoại In); Esc bắt ở capture để không
  // rơi xuống handler Esc của Reader (đóng nhầm cả hai).
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      $('qs').classList.contains('show') ? closeSwitcher() : openSwitcher();
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('qs').classList.contains('show')) {
      ev.stopPropagation();
      closeSwitcher();
    }
  }, true);
  $('qs').onclick = ev => { if (ev.target === $('qs')) closeSwitcher(); };  // click nền mờ = đóng
  $('qs-results').onclick = ev => {
    const row = ev.target.closest('.qs-row[data-note]');
    if (!row) return;
    _qsSel = qsRows().indexOf(row);
    qsOpenSel(ev.ctrlKey || ev.metaKey);
  };
  $('qs-results').addEventListener('auxclick', ev => {
    if (ev.button !== 1) return;
    const row = ev.target.closest('.qs-row[data-note]');
    if (!row) return;
    ev.preventDefault();
    _qsSel = qsRows().indexOf(row);
    qsOpenSel(true);
  });
  const inp = $('qs-input');
  inp.oninput = () => {
    const q = inp.value.trim();
    if (_qsContent.q !== q) _qsContent = { q: '', rows: [] };
    qsRender();
    qsFetch(q);
  };
  inp.onkeydown = ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); qsSelect(_qsSel + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); qsSelect(_qsSel - 1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); qsOpenSel(ev.ctrlKey || ev.metaKey); }
  };
}
