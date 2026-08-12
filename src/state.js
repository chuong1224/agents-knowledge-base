/* state.js — state chia sẻ giữa các module + hằng số + util nhỏ.
   Quy ước: biến bị GÁN LẠI từ nhiều module nằm trong S (ES module không cho
   gán vào binding import); collection (Map/Set) gán 1 lần thì export thẳng. */

export const COLORS = { read: '#04d9ff', search: '#f9f871', edit: '#ff2e97' };
export const ICONS  = { read: '👁', search: '🔎', edit: '✏️' };
export const GROUP_ORDER = ['Index / MOC','Vault Operation','Research','Ngoại Trang','Server Nhàn Rỗi','Hoài Niệm','Tra Cứu','Personal','JXM Khác','Skill','Khác'];

export const S = {
  Graph: null,                 // instance ForceGraph3D (window.__G trỏ vào đây)
  all: null,                   // toàn bộ nodes/links từ /graph-data
  data: null,                  // phần đang hiển thị (sau lọc tag/đuôi)
  vaultName: 'Knowledge Base',
  vaultId: 'app',              // W180: namespace state nội dung theo active vault
  vaultPath: '',
  vaultLocked: false,
  vaultWarning: '',
  vaultMigrateLegacy: true,     // chỉ app vault được nhận state v1.58.x chưa có suffix
  selectedGroup: null,         // lọc nhóm màu (spotlight — dim, không gỡ)
  hoverNode: null,
  labelsOn: true,
  particlesOn: true,
  neon: 0.32,                  // "Độ rực neon" 0..1 — điều khiển bloom + glow
  bloomPass: null,
  trailGroup: null,            // lớp vệt đường đi agent (v1.7)
  trailsOn: true,
  ambientOn: true,             // Ư6.2: sao băng nền khi nhàn rỗi
  heatMode: false,             // heatmap tần suất đang bật
  clusterOn: false,            // V1: 🧲 gom cụm theo nhóm màu (lực groupPull, mặc định TẮT)
  mode: 'bung',                // preset bố cục đang chạy: 'bung' | 'calm' | 'uni' (U2 — 🪐 Vũ Trụ)
  universe: null,              // kết quả buildUniverse khi 🪐 bật (targets/cây/bán kính — probe U3 dùng)
};

export const byId = new Map(), adjacency = new Map();
export const tagOn = new Set();          // tag đang hiển thị (mặc định: tất cả)
export const tagOff = new Set();         // tag người dùng đã TẮT — persist (mặc định tag MỚI vẫn hiện)
export const extOn = new Set();          // đuôi file đang hiển thị (mặc định: ẨN hết, như graph 2D)

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Ư3.2: so khớp không phụ thuộc dấu tiếng Việt ("hoai niem" phải ra "Hoài Niệm"; đ không có dạng NFD nên thay riêng)
export const deAccent = s => String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
export const idOf = x => (typeof x === 'object' && x !== null) ? x.id : x;
export const linkKey = l => (typeof l.source === 'object' ? l.source.id : l.source) + '|' + (typeof l.target === 'object' ? l.target.id : l.target);
export const vaultKey = base => `${base}.${S.vaultId || 'app'}`;
export function vaultStoreGet(base) {
  const scoped = vaultKey(base);
  let value = localStorage.getItem(scoped);
  if (value == null && S.vaultMigrateLegacy) {
    // One-shot upgrade: v1.58.x state had no vault namespace. First active vault
    // receives it, then the legacy key is removed so later vaults cannot inherit it.
    value = localStorage.getItem(base);
    if (value != null) {
      localStorage.setItem(scoped, value);
      localStorage.removeItem(base);
    }
  }
  return value;
}
export const vaultStoreSet = (base, value) => localStorage.setItem(vaultKey(base), value);
export const vaultStoreRemove = base => localStorage.removeItem(vaultKey(base));

/* --- W43: thứ tự focus cho overlay ---------------------------------------------
   Mọi overlay của app nằm CUỐI body, nên bàn phím phải đi qua toàn bộ sidebar +
   panel (24–28 control vô nghĩa lúc đó) mới tới được thứ duy nhất đang mở. Hai hàm
   này đưa focus vào trong khi mở và TRẢ LẠI chỗ cũ khi đóng — trả lại mới là phần
   hay quên: đóng modal mà focus rơi về <body> thì lần Tab kế bắt đầu lại từ đầu trang. */
let focusReturn = null;

export function focusInto(box, sel) {
  focusReturn = document.activeElement;
  const el = box.querySelector(sel || 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (el) el.focus();
  // Overlay nào nút đóng là <span> (không nhận focus) thì focus() im lặng không làm gì
  // và người dùng vẫn kẹt ngoài hộp — lùi về chính hộp: mở tabindex="-1" cho nó nhận
  // focus theo lệnh (vẫn KHÔNG chen vào thứ tự Tab), Tab kế đi tiếp vào bên trong.
  if (!box.contains(document.activeElement)) {
    box.setAttribute('tabindex', '-1');
    box.focus();
  }
}

export function restoreFocus() {
  const el = focusReturn;
  focusReturn = null;
  if (el && document.contains(el)) el.focus();
}
