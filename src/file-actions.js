/* file-actions.js — một menu thao tác attachment dùng chung cho Reader, Finder và graph.
   Mọi mở app/file manager đều là POST cùng-origin; /asset vẫn là lối xem/tải thuần đọc. */
import { $, focusInto, restoreFocus } from './state.js';
import { tr } from './i18n.js';

let current = null;
let busy = false;
const ACTION_QUERY = { open: 'action=open', reveal: 'action=reveal' };
const PREVIEW_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
  'pdf', 'txt', 'md', 'mp4', 'webm', 'mp3', 'wav', 'ogg'
]);

function assetUrl(node) { return '/asset?path=' + encodeURIComponent(node.id); }

function setStatus(text, error = false) {
  const el = $('file-act-status');
  el.textContent = text || '';
  el.classList.toggle('err', error);
  el.hidden = !text;
}

function setBusy(on) {
  busy = on;
  $('file-act-open').disabled = on;
  $('file-act-reveal').disabled = on;
}

async function run(action) {
  if (busy || !current || !ACTION_QUERY[action]) return;
  setBusy(true);
  setStatus('…');
  try {
    const url = '/file-action?path=' + encodeURIComponent(current.id) + '&' + ACTION_QUERY[action];
    const res = await fetch(url, { method: 'POST', cache: 'no-store' });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
    const done = action === 'open' ? tr('file.done.open') : tr('file.done.reveal');
    setStatus(done);
  } catch (e) {
    setStatus(tr('file.error', { e: e && e.message ? e.message : String(e) }), true);
  } finally {
    setBusy(false);
  }
}

export function openFileActions(node) {
  if (!node || node.kind !== 'file') return;
  current = node;
  const name = node.name || node.id.split('/').pop();
  const preview = $('file-act-preview');
  const canPreview = PREVIEW_EXTS.has((node.ext || '').toLowerCase());
  $('file-act-title').textContent = name;
  $('file-act-path').textContent = node.id;
  preview.href = assetUrl(node);
  if (canPreview) {
    preview.dataset.i18n = 'file.preview';
    preview.textContent = tr('file.preview');
    preview.target = '_blank';
    preview.rel = 'noopener';
    preview.removeAttribute('download');
  } else {
    preview.dataset.i18n = 'file.download';
    preview.textContent = tr('file.download');
    preview.download = name;
    preview.removeAttribute('target');
    preview.removeAttribute('rel');
  }
  setStatus('');
  setBusy(false);
  $('file-act').classList.add('show');
  focusInto($('file-act-box'), '#file-act-open');
}

export function closeFileActions() {
  if (!$('file-act').classList.contains('show')) return;
  $('file-act').classList.remove('show');
  current = null;
  setStatus('');
  restoreFocus();
}

export function initFileActions() {
  $('file-act-open').onclick = () => run('open');
  $('file-act-reveal').onclick = () => run('reveal');
  $('file-act-close').onclick = closeFileActions;
  $('file-act').onclick = ev => { if (ev.target === $('file-act')) closeFileActions(); };
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('file-act').classList.contains('show')) {
      ev.stopPropagation();
      closeFileActions();
    }
  }, true);
}
