/* onboarding.js — empty-state cho vault TRỐNG (W13).

   Vault chưa có note nào thì graph là một không gian rỗng: user mới tải app về sẽ
   tưởng app hỏng rồi bỏ đi (nhận xét 19/07/2026). Module này thay khoảng
   rỗng đó bằng BA LỐI ĐI — xem demo · tạo vault đầu tiên tại đây · tự làm.

   Module CHỈ trình bày: "có trống không / lối nào sẵn có" do .graph3d/onboarding.py
   trả qua /onboarding, hai hành động là POST /demo-start và POST /starter-init.
   Đừng đoán ở frontend (vd tự suy "chắc có starter-vault") — bản cài không kèm
   starter/demo thì card đó hiện lý do + lệnh chạy tay thay vì nút bấm chết. */
import { S, $, esc } from './state.js';
import { refreshData } from './ui.js';

let DB = null;
let busy = false;

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
  $('onb-sum').innerHTML = `<b>${esc(d.vault)}</b> — 0 note`;

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
    // 2. KHỞI TẠO: 9 note dạy khái niệm BẰNG chính app, và là vault thật của user
    card(st.available ? {
      id: 'onb-starter', icon: '🌱', title: 'Tạo vault đầu tiên ngay đây',
      desc: `Chép <b>${st.notes}</b> note hướng dẫn vào chính vault này — đọc ngay trong app, ` +
        'sửa được, xoá được. Đây là vault của bạn, không phải bản mẫu đọc cho vui.',
      path: d.vault_path,
      action: '🌱 Tạo tại đây',
    } : {
      icon: '🌱', title: 'Tạo vault đầu tiên',
      desc: 'Bản cài này không kèm <code>starter-vault/</code>. Có repo rồi thì chạy:',
      cmd: d.cmd.starter,
    }),
    // 3. THÓI QUEN: đúng 3 bước, không cần cài gì thêm
    card({
      icon: '📖', title: 'Tự làm — 1 phút',
      desc: '① Tạo file <code>Note đầu tiên.md</code> trong thư mục vault.<br>' +
        '② Trong note, viết <code>[[Tên note khác]]</code> để nối — mỗi liên kết là một cạnh trên graph.<br>' +
        '③ Quay lại đây, bấm <b>Quét lại</b>.',
      action: '↻ Quét lại',
      id: 'onb-rescan',
    }),
  ];
  $('onb-cards').innerHTML = cards.join('');
  status('');

  if ($('onb-demo')) $('onb-demo').onclick = startDemo;
  if ($('onb-starter')) $('onb-starter').onclick = installStarter;
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
    setTimeout(closeOnboarding, 1200);
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

export function closeOnboarding() { $('onb').classList.remove('show'); }

export async function openOnboarding() {
  $('onb').classList.add('show');
  if (!DB) {
    try {
      const r = await fetch('/onboarding', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      DB = await r.json();
    } catch (e) {
      status('Không đọc được trạng thái onboarding: ' + esc(String(e)), 'warn');
      return;
    }
  }
  render();
}

/* Gọi ở boot(): vault có note thì KHÔNG làm gì cả (không tải /onboarding, không
   dựng DOM) — empty-state chỉ tồn tại đúng lúc nó có nghĩa. */
export function initOnboarding() {
  $('onb-x').onclick = closeOnboarding;
  $('onb').onclick = ev => { if (ev.target === $('onb')) closeOnboarding(); };
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('onb').classList.contains('show')) {
      ev.stopPropagation();
      closeOnboarding();
    }
  }, true);
  if (!S.all.meta.notes) openOnboarding();
}
