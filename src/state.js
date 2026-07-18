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
};

export const byId = new Map(), adjacency = new Map();
export const tagOn = new Set();          // tag đang hiển thị (mặc định: tất cả)
export const extOn = new Set();          // đuôi file đang hiển thị (mặc định: ẨN hết, như graph 2D)

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Ư3.2: so khớp không phụ thuộc dấu tiếng Việt ("hoai niem" phải ra "Hoài Niệm"; đ không có dạng NFD nên thay riêng)
export const deAccent = s => String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
export const idOf = x => (typeof x === 'object' && x !== null) ? x.id : x;
export const linkKey = l => (typeof l.source === 'object' ? l.source.id : l.source) + '|' + (typeof l.target === 'object' ? l.target.id : l.target);
