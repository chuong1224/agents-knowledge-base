/* vault-switcher.js — W180: chọn một vault root bất kỳ từ UI chính.

   Server giữ active vault bất biến trong một process. POST /vault-pick mở native
   folder dialog, lưu lựa chọn ngoài vault rồi exit 4; supervisor relaunch cùng port.
   Client chờ đúng vault_id + boot_id mới trước khi reload, không đoán theo thời gian. */
import { S, $ } from './state.js';
import { tr } from './i18n.js';

let vaultState = null;

function applyState(d) {
  if (!d) return;
  vaultState = d;
  S.vaultId = d.id || S.vaultId;
  S.vaultName = d.name || S.vaultName;
  S.vaultPath = d.path || '';
  S.vaultLocked = !!d.locked;
  S.vaultWarning = d.warning || '';
  // State v1.58.x chưa có namespace thuộc app vault lịch sử. Nếu user mở lần đầu
  // bằng `--vault <folder ngoài>`, giữ key cũ lại cho app vault thay vì rò sang ngoài.
  S.vaultMigrateLegacy = !d.app_vault || d.path === d.app_vault;
}

export async function loadVaultState() {
  try {
    const r = await fetch('/vault-state', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    applyState(d);
    return d;
  } catch (e) {
    console.warn('vault-state:', e);
    return null;
  }
}

function syncButton(message, cls) {
  const b = $('vault-switch');
  if (!b) return;
  const label = $('vault-label');
  if (label) label.textContent = message || S.vaultName || tr('vault.unknown');
  b.classList.toggle('warn', cls === 'warn' || !!S.vaultWarning);
  b.classList.toggle('busy', cls === 'busy');
  b.classList.toggle('err', cls === 'err');
  b.disabled = S.vaultLocked || cls === 'busy';
  const tip = S.vaultLocked ? tr('vault.locked')
    : S.vaultWarning ? tr('vault.fallback')
    : tr('vault.tip', { vault: S.vaultName, path: S.vaultPath });
  b.title = tip;
  b.setAttribute('aria-label', tip);
}

function showPickerWait(mode, vault) {
  const wait = $('vault-pick-wait');
  if (!wait) return;
  const switching = mode === 'switching';
  const title = $('vault-pick-title');
  const hint = $('vault-pick-hint');
  if (title) title.textContent = switching
    ? tr('vault.picker.switching', { vault: vault || '' })
    : tr('vault.picker.open');
  if (hint) hint.textContent = switching
    ? tr('vault.picker.switching.hint')
    : tr('vault.picker.hint');
  wait.hidden = false;
  document.documentElement.classList.add('vault-picker-open');
}

function hidePickerWait() {
  const wait = $('vault-pick-wait');
  if (wait) wait.hidden = true;
  document.documentElement.classList.remove('vault-picker-open');
}

async function waitForVault(targetId, oldBoot) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      const r = await fetch('/health?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) continue;
      const h = await r.json();
      if (h.vault_id === targetId && h.boot_id && h.boot_id !== oldBoot) {
        location.reload();
        return;
      }
    } catch (e) { /* expected while old server releases the port */ }
  }
  hidePickerWait();
  syncButton(tr('vault.reload'), 'err');
  const b = $('vault-switch');
  if (b) {
    b.disabled = false;
    b.onclick = () => location.reload();
    b.title = tr('vault.timeout');
    b.setAttribute('aria-label', tr('vault.timeout'));
  }
}

export async function pickVault() {
  if (S.vaultLocked) return;
  syncButton(tr('vault.picking'), 'busy');
  showPickerWait('picking');
  // Bảo đảm lớp báo đã được paint trước khi POST giữ request trong suốt thời gian
  // native dialog mở; nếu dialog bị OS đặt sai z-order, user vẫn biết nó đang tồn tại.
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    const r = await fetch('/vault-pick', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    if (d.cancelled || !d.changed) {
      hidePickerWait();
      syncButton();
      return;
    }
    syncButton(tr('vault.switching', { vault: d.vault || '' }), 'busy');
    showPickerWait('switching', d.vault || '');
    await waitForVault(d.vault_id, d.boot_id || (vaultState && vaultState.boot_id));
  } catch (e) {
    hidePickerWait();
    syncButton(tr('vault.failed'), 'err');
    const b = $('vault-switch');
    if (b) {
      b.disabled = false;
      b.title = tr('vault.error', { e: String(e) });
      b.setAttribute('aria-label', tr('vault.error', { e: String(e) }));
    }
  }
}

export function initVaultSwitcher() {
  const b = $('vault-switch');
  if (!b) return;
  syncButton();
  b.onclick = pickVault;
}
