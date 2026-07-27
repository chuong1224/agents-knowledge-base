/* onboarding.js — empty-state cho vault TRỐNG (W13).

   Vault chưa có note nào thì graph là một không gian rỗng: user mới tải app về sẽ
   tưởng app hỏng rồi bỏ đi (nhận xét 19/07/2026). Module này thay khoảng
   rỗng đó bằng BA LỐI ĐI — xem demo · tạo vault đầu tiên tại đây · tự làm.

   Module CHỈ trình bày: "có trống không / lối nào sẵn có" do .graph3d/onboarding.py
   trả qua /onboarding, hai hành động là POST /demo-start và POST /starter-init.
   Đừng đoán ở frontend (vd tự suy "chắc có starter-vault") — bản cài không kèm
   starter/demo thì card đó hiện lý do + lệnh chạy tay thay vì nút bấm chết. */
import { S, $, esc, byId, focusInto, restoreFocus } from './state.js';
import { tr } from './i18n.js';
import { refreshData } from './ui.js';
import { wsOpen } from './workspace.js';

let DB = null;
let busy = false;

/* Cờ "đây đúng là vault của tôi" — cảnh báo cài-sai-chỗ suy từ TÊN thư mục app nên
   phải tắt vĩnh viễn được (ai cố tình đổi tên thư mục thì đó là việc của họ). */
const OK_KEY = 'kbgraph3d.onbInstallOk.v1';
const installAck = () => { try { return localStorage.getItem(OK_KEY) === '1'; } catch (e) { return false; } };
const ackInstall = () => { try { localStorage.setItem(OK_KEY, '1'); } catch (e) {} };

/* Có gì cần mời/cảnh báo không: vault trống, hoặc app không nằm trong vault. */
function needed() {
  if (!S.all.meta.notes) return 'empty';
  if (DB && !DB.installed && !installAck()) return 'misplaced';
  return '';
}

/* Lỗi từ server: dịch theo `code` nếu có khoá, không thì hiện nguyên văn thông điệp
   (thà tiếng Việt còn hơn nuốt mất lý do). */
function errText(res, fallback) {
  const key = res && res.code ? `onb.e.${res.code}` : '';
  const s = key ? tr(key) : '';
  return (s && s !== key) ? s : ((res && res.error) || fallback);
}

function status(html, cls) {
  $('onb-status').className = cls || '';
  $('onb-status').innerHTML = html || '';
}

/* Khối lệnh copy-1-chạm — dùng cho card không bấm được (bản cài thiếu demo/starter). */
function cmdBlock(cmd) {
  return `<code class="onb-cmd" title="${tr('onb.copy')}">${esc(cmd)}</code>`;
}

function card(o) {
  const btn = o.cmd
    ? cmdBlock(o.cmd)
    : `<button class="btn" id="${o.id}"${o.disabled ? ' disabled' : ''}>${esc(o.action)}</button>`;
  return `<div class="onb-card">
      <div class="onb-ic">${o.icon}</div>
      <div class="onb-t">${esc(o.title)}</div>
      <div class="onb-d">${o.desc}</div>
      ${o.path ? `<div class="onb-path" title="${esc(o.path)}">→ ${esc(shortPath(o.path))}</div>` : ''}
      <div class="onb-a">${btn}</div>
    </div>`;
}

/* Đường dẫn vault đầy đủ có thể dài cả dòng (temp/OneDrive) và làm ngộp card, nhưng
   nút này GHI FILE nên không được che chỗ ghi: hiện 2 đoạn cuối (phần user nhận ra),
   full path nằm ở title. */
function shortPath(p) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  const tail = parts.slice(-2).join('\\');
  return parts.length > 2 ? '…\\' + tail : p;
}

function render() {
  const d = DB;
  const demo = d.demo, st = d.starter;
  const misplaced = !d.installed && !installAck();
  $('onb-sum').innerHTML = tr('onb.sum', { vault: `<b>${esc(d.vault)}</b>`, n: d.notes });
  $('onb-head').querySelector('h3').textContent = d.empty
    ? tr('onb.head.empty')
    : tr('onb.head.misplaced');

  // Cảnh báo cài sai chỗ: nói rõ app đang coi thư mục NÀO là vault, vì đó chính là
  // thứ user không nhìn thấy (app đọc thư mục CHA của chính nó).
  $('onb-note').innerHTML = misplaced
    ? tr('onb.warn', { app: esc(d.app_dir), full: esc(d.vault_path), short: esc(shortPath(d.vault_path)), n: d.notes }) +
      `<div class="onb-a">${cmdBlock(d.cmd.install)}</div>` +
      `<button class="btn" id="onb-ack">${tr('onb.ack')}</button>`
    : '';
  // 'block' tường minh, KHÔNG phải '': xoá inline style là trả về rule mặc định
  // `#onb-note{display:none}` → khung có nội dung mà vô hình (họ hàng bẫy CSS 11/07).
  $('onb-note').style.display = misplaced ? 'block' : 'none';

  const cards = [
    // 1. CẢM NHẬN: thấy app sống động trước khi phải tự gõ chữ nào
    card(demo.available ? {
      id: 'onb-demo', icon: '🌌', title: tr('onb.demo.title'),
      desc: tr('onb.demo.desc', { n: `<b>${demo.notes}</b>`, port: `<b>${demo.port}</b>` }),
      action: tr('onb.demo.action'),
    } : {
      icon: '🌌', title: tr('onb.demo.title'),
      desc: tr('onb.demo.missing'),
      cmd: d.cmd.demo,
    }),
  ];
  // 2. KHỞI TẠO: 9 note dạy khái niệm BẰNG chính app, và là vault thật của user.
  //    CHỈ mời khi vault đang trống — và nếu app cài sai chỗ thì KHÔNG cho bấm: ghi 9
  //    note vào thư mục cha của bản clone là đúng thứ user không hề muốn (audit W42).
  if (d.empty) {
    cards.push(card(!st.available ? {
      icon: '🌱', title: tr('onb.starter.title2'),
      desc: tr('onb.starter.missing'),
      cmd: d.cmd.starter,
    } : misplaced ? {
      icon: '🌱', title: tr('onb.starter.title2'), disabled: true,
      desc: tr('onb.starter.blocked', { n: `<b>${st.notes}</b>` }),
      action: tr('onb.starter.action'),
    } : {
      id: 'onb-starter', icon: '🌱', title: tr('onb.starter.title'),
      desc: tr('onb.starter.desc', { n: `<b>${st.notes}</b>` }),
      path: d.vault_path,
      action: tr('onb.starter.action'),
    }));
  }
  // 3. THÓI QUEN: đúng 3 bước, không cần cài gì thêm
  cards.push(card({
    icon: '📖', title: tr('onb.self.title'),
    desc: tr('onb.self.desc'),
    action: tr('onb.self.action'),
    id: 'onb-rescan',
  }));
  $('onb-cards').innerHTML = cards.join('');
  status('');

  if ($('onb-demo')) $('onb-demo').onclick = startDemo;
  if ($('onb-starter')) $('onb-starter').onclick = installStarter;
  if ($('onb-ack')) $('onb-ack').onclick = () => {   // tắt cảnh báo vĩnh viễn + dựng lại thẻ
    ackInstall();
    if (!S.all.meta.notes) render(); else closeOnboarding();
    syncOnbFab();
  };
  $('onb-rescan').onclick = rescan;
  $('onb-box').querySelectorAll('.onb-cmd').forEach(el => {
    el.onclick = () => {
      navigator.clipboard?.writeText(el.textContent).then(
        () => status(tr('onb.copied'), 'ok'),
        () => {});
    };
  });
}

/* Quét lại vault: user vừa tự tạo note bên ngoài → thấy ngay, khỏi F5. */
async function rescan() {
  if (busy) return;
  busy = true;
  status(tr('onb.rescan.run'));
  try {
    await refreshData();
    const n = S.all.meta.notes;
    if (n > 0) { status(tr('onb.rescan.found', { n }), 'ok'); setTimeout(closeOnboarding, 900); }
    else status(tr('onb.rescan.none'), 'warn');
  } finally { busy = false; }
}

async function installStarter() {
  if (busy) return;
  busy = true;
  status(tr('onb.install.run'));
  try {
    const r = await fetch('/starter-init', { method: 'POST' });
    const res = await r.json();
    if (!r.ok) { status(tr('onb.install.err', { e: esc(errText(res, 'HTTP ' + r.status)) }), 'warn'); return; }
    status(tr('onb.install.done', { n: `<b>${res.notes}</b>` }), 'ok');
    await refreshData();
    syncOnbFab();
    // Đừng bỏ rơi người mới ở đây: cài xong mà chỉ đóng overlay thì họ nhìn 9 node và
    // không biết bước kế (audit W42). MỞ luôn note cửa vào — server chọn note đó, phía
    // này không đoán; node id = đường dẫn tương đối nên tra thẳng byId.
    const node = res.entry && byId.get(res.entry);
    closeOnboarding();
    if (node) wsOpen(node);
    else status(tr('onb.install.done2', { n: `<b>${res.notes}</b>` }), 'ok');
  } catch (e) {
    status(tr('onb.install.err', { e: esc(String(e)) }), 'warn');
  } finally { busy = false; }
}

async function startDemo() {
  if (busy) return;
  busy = true;
  // Server chép app sang demo/vault/.graph3d rồi khởi động supervisor ở port khác —
  // mất vài giây, và nó CHỜ /health khỏe mới trả về nên UI khỏi phải tự dò
  // (fetch sang port khác là cross-origin, trình duyệt chặn).
  status(tr('onb.demo.run'));
  try {
    const r = await fetch('/demo-start', { method: 'POST' });
    const res = await r.json();
    if (!r.ok) { status(tr('onb.demo.err', { e: esc(errText(res, 'HTTP ' + r.status)) }), 'warn'); return; }
    status(tr('onb.demo.ok', { n: res.notes, port: res.port }), 'ok');
    location.href = res.url;
  } catch (e) {
    status(tr('onb.demo.err', { e: esc(String(e)) }), 'warn');
  } finally { busy = false; }
}

export function closeOnboarding() { $('onb').classList.remove('show'); restoreFocus(); syncOnbFab(); }

/* Nút 🌱 đáy màn hình: LỐI QUAY LẠI. Đóng overlay bằng ✕ trước đây là mất hẳn đường
   vào (audit W42: 0 affordance mở lại, chỉ F5 — mà không chỗ nào nói vậy). Nút chỉ
   tồn tại đúng lúc còn việc để mời: vault trống, hoặc app cài sai chỗ chưa xác nhận. */
export function syncOnbFab() {
  const b = $('onb-fab');
  if (!b) return;
  const why = needed();
  // 'block' tường minh (xem ghi chú ở #onb-note): mặc định CSS của nút là display:none
  b.style.display = why && !$('onb').classList.contains('show') ? 'block' : 'none';
  b.title = why === 'empty' ? tr('onb.fab.empty') : tr('onb.fab.misplaced');
  b.textContent = why === 'empty' ? '🌱' : '⚠';
}

async function load() {
  if (DB) return true;
  try {
    const r = await fetch('/onboarding', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    return true;
  } catch (e) {
    status(tr('onb.state.err', { e: esc(String(e)) }), 'warn');
    return false;
  }
}

export async function openOnboarding() {
  $('onb').classList.add('show');
  syncOnbFab();
  if (!(await load())) return;
  render();
  // Overlay nằm cuối body nên bàn phím phải đi qua ~28 control vô nghĩa mới tới đây
  // (audit W42) — đưa focus vào thẳng nút HÀNH ĐỘNG đầu tiên, Esc vẫn đóng như mọi
  // modal khác. Cố ý bỏ qua nút trong khung cảnh báo: nút đó là "tôi biết rồi, tắt đi",
  // focus vào nó thì gõ Enter một cái là dập cảnh báo trước khi kịp đọc.
  const first = $('onb-cards').querySelector('button:not([disabled])');
  if (first) first.focus();
}

/* Gọi ở boot(). Vault trống → mời ngay. Vault CÓ note → vẫn hỏi /onboarding một lần
   (rẻ: số note lấy từ cache graph, số note demo/starter có cache theo mtime) để bắt ca
   "app chưa được cài vào vault" — ca này vault không trống nên bản đầu (26/07/2026)
   hoàn toàn không thấy, mà nó lại là bước sai phổ biến nhất của người mới. */
export async function initOnboarding() {
  $('onb-x').onclick = closeOnboarding;
  $('onb-fab').onclick = () => openOnboarding();
  $('onb').onclick = ev => { if (ev.target === $('onb')) closeOnboarding(); };
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('onb').classList.contains('show')) {
      ev.stopPropagation();
      closeOnboarding();
    }
  }, true);
  if (!S.all.meta.notes) { openOnboarding(); return; }
  if (await load()) {
    if (needed()) openOnboarding(); else syncOnbFab();
  }
}
