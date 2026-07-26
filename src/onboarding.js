/* onboarding.js — empty-state cho vault TRỐNG (W13).

   Vault chưa có note nào thì graph là một không gian rỗng: user mới tải app về sẽ
   tưởng app hỏng rồi bỏ đi (nhận xét 19/07/2026). Module này thay khoảng
   rỗng đó bằng BA LỐI ĐI — xem demo · tạo vault đầu tiên tại đây · tự làm.

   Module CHỈ trình bày: "có trống không / lối nào sẵn có" do .graph3d/onboarding.py
   trả qua /onboarding, hai hành động là POST /demo-start và POST /starter-init.
   Đừng đoán ở frontend (vd tự suy "chắc có starter-vault") — bản cài không kèm
   starter/demo thì card đó hiện lý do + lệnh chạy tay thay vì nút bấm chết. */
import { S, $, esc, byId } from './state.js';
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

function status(html, cls) {
  $('onb-status').className = cls || '';
  $('onb-status').innerHTML = html || '';
}

/* Khối lệnh copy-1-chạm — dùng cho card không bấm được (bản cài thiếu demo/starter). */
function cmdBlock(cmd) {
  return `<code class="onb-cmd" title="Click để copy">${esc(cmd)}</code>`;
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
  $('onb-sum').innerHTML = `<b>${esc(d.vault)}</b> — ${d.notes} note`;
  $('onb-head').querySelector('h3').textContent = d.empty
    ? '🌱 Vault này chưa có note nào'
    : '⚠ App có vẻ chưa được cài vào vault';

  // Cảnh báo cài sai chỗ: nói rõ app đang coi thư mục NÀO là vault, vì đó chính là
  // thứ user không nhìn thấy (app đọc thư mục CHA của chính nó).
  $('onb-note').innerHTML = misplaced
    ? `Thư mục app đang tên <code>${esc(d.app_dir)}</code> chứ không phải <code>.graph3d</code>, ` +
      `nên app đang coi <code title="${esc(d.vault_path)}">${esc(shortPath(d.vault_path))}</code> ` +
      `là vault — thấy <b>${d.notes}</b> note. Cách cài đúng là clone THÀNH <code>.graph3d</code> bên trong vault:` +
      `<div class="onb-a">${cmdBlock(d.cmd.install)}</div>` +
      `<button class="btn" id="onb-ack">✅ Đây đúng là vault của tôi</button>`
    : '';
  // 'block' tường minh, KHÔNG phải '': xoá inline style là trả về rule mặc định
  // `#onb-note{display:none}` → khung có nội dung mà vô hình (họ hàng bẫy CSS 11/07).
  $('onb-note').style.display = misplaced ? 'block' : 'none';

  const cards = [
    // 1. CẢM NHẬN: thấy app sống động trước khi phải tự gõ chữ nào
    card(demo.available ? {
      id: 'onb-demo', icon: '🌌', title: 'Xem thử vault demo',
      desc: `<b>${demo.notes}</b> note dựng sẵn (nhiều nhóm màu, index, đủ liên kết) — ` +
        `mở ở cổng <b>${demo.port}</b> nên vault của bạn không bị đụng tới.`,
      action: '🌌 Mở demo',
    } : {
      icon: '🌌', title: 'Xem thử vault demo',
      desc: 'Bản cài này không kèm vault demo (demo đi cùng repo public). ' +
        'Có repo rồi thì chạy:',
      cmd: d.cmd.demo,
    }),
  ];
  // 2. KHỞI TẠO: 9 note dạy khái niệm BẰNG chính app, và là vault thật của user.
  //    CHỈ mời khi vault đang trống — và nếu app cài sai chỗ thì KHÔNG cho bấm: ghi 9
  //    note vào thư mục cha của bản clone là đúng thứ user không hề muốn (audit W42).
  if (d.empty) {
    cards.push(card(!st.available ? {
      icon: '🌱', title: 'Tạo vault đầu tiên',
      desc: 'Bản cài này không kèm <code>starter-vault/</code>. Có repo rồi thì chạy:',
      cmd: d.cmd.starter,
    } : misplaced ? {
      icon: '🌱', title: 'Tạo vault đầu tiên', disabled: true,
      desc: `Sẽ ghi <b>${st.notes}</b> note vào thư mục ở trên — mà thư mục đó có vẻ ` +
        'không phải vault của bạn. <b>Cài đúng chỗ trước</b> (hoặc xác nhận ở khung trên) rồi quay lại.',
      action: '🌱 Tạo tại đây',
    } : {
      id: 'onb-starter', icon: '🌱', title: 'Tạo vault đầu tiên ngay đây',
      desc: `Chép <b>${st.notes}</b> note hướng dẫn vào chính vault này — đọc ngay trong app, ` +
        'sửa được, xoá được. Đây là vault của bạn, không phải bản mẫu đọc cho vui.',
      path: d.vault_path,
      action: '🌱 Tạo tại đây',
    }));
  }
  // 3. THÓI QUEN: đúng 3 bước, không cần cài gì thêm
  cards.push(card({
    icon: '📖', title: 'Tự làm — 1 phút',
    desc: '① Tạo file <code>Note đầu tiên.md</code> trong thư mục vault.<br>' +
      '② Trong note, viết <code>[[Tên note khác]]</code> để nối — mỗi liên kết là một cạnh trên graph.<br>' +
      '③ Quay lại đây, bấm <b>Quét lại</b>.',
    action: '↻ Quét lại',
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
        () => status('Đã copy lệnh — dán vào terminal ở thư mục vault.', 'ok'),
        () => {});
    };
  });
}

/* Quét lại vault: user vừa tự tạo note bên ngoài → thấy ngay, khỏi F5. */
async function rescan() {
  if (busy) return;
  busy = true;
  status('Đang quét lại vault…');
  try {
    await refreshData();
    const n = S.all.meta.notes;
    if (n > 0) { status(`Thấy ${n} note — chào mừng!`, 'ok'); setTimeout(closeOnboarding, 900); }
    else status('Vẫn chưa có note .md nào trong vault.', 'warn');
  } finally { busy = false; }
}

async function installStarter() {
  if (busy) return;
  busy = true;
  status('Đang chép starter vault…');
  try {
    const r = await fetch('/starter-init', { method: 'POST' });
    const res = await r.json();
    if (!r.ok) { status('Không tạo được: ' + esc(res.error || ('HTTP ' + r.status)), 'warn'); return; }
    status(`Đã tạo <b>${res.notes}</b> note. Đang nạp graph…`, 'ok');
    await refreshData();
    syncOnbFab();
    // Đừng bỏ rơi người mới ở đây: cài xong mà chỉ đóng overlay thì họ nhìn 9 node và
    // không biết bước kế (audit W42). MỞ luôn note cửa vào — server chọn note đó, phía
    // này không đoán; node id = đường dẫn tương đối nên tra thẳng byId.
    const node = res.entry && byId.get(res.entry);
    closeOnboarding();
    if (node) wsOpen(node);
    else status(`Đã tạo <b>${res.notes}</b> note — mở một node để bắt đầu đọc.`, 'ok');
  } catch (e) {
    status('Không tạo được: ' + esc(String(e)), 'warn');
  } finally { busy = false; }
}

async function startDemo() {
  if (busy) return;
  busy = true;
  // Server chép app sang demo/vault/.graph3d rồi khởi động supervisor ở port khác —
  // mất vài giây, và nó CHỜ /health khỏe mới trả về nên UI khỏi phải tự dò
  // (fetch sang port khác là cross-origin, trình duyệt chặn).
  status('Đang dựng server demo (vài giây)…');
  try {
    const r = await fetch('/demo-start', { method: 'POST' });
    const res = await r.json();
    if (!r.ok) { status('Không mở được demo: ' + esc(res.error || ('HTTP ' + r.status)), 'warn'); return; }
    status(`Demo ${res.notes} note đã chạy ở cổng ${res.port} — đang chuyển…`, 'ok');
    location.href = res.url;
  } catch (e) {
    status('Không mở được demo: ' + esc(String(e)), 'warn');
  } finally { busy = false; }
}

export function closeOnboarding() { $('onb').classList.remove('show'); syncOnbFab(); }

/* Nút 🌱 đáy màn hình: LỐI QUAY LẠI. Đóng overlay bằng ✕ trước đây là mất hẳn đường
   vào (audit W42: 0 affordance mở lại, chỉ F5 — mà không chỗ nào nói vậy). Nút chỉ
   tồn tại đúng lúc còn việc để mời: vault trống, hoặc app cài sai chỗ chưa xác nhận. */
export function syncOnbFab() {
  const b = $('onb-fab');
  if (!b) return;
  const why = needed();
  // 'block' tường minh (xem ghi chú ở #onb-note): mặc định CSS của nút là display:none
  b.style.display = why && !$('onb').classList.contains('show') ? 'block' : 'none';
  b.title = why === 'empty'
    ? 'Vault đang trống — mở lại 3 cách bắt đầu'
    : 'App có vẻ chưa được cài vào vault — xem lại';
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
    status('Không đọc được trạng thái onboarding: ' + esc(String(e)), 'warn');
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
