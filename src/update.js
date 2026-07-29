/* update.js — báo có bản mới trên repo + changelog ngắn + cập nhật tại chỗ (W69).

   Vì sao tồn tại: người clone repo về rồi chạy KHÔNG có đường nào biết đã có bản mới.

   Luật của module này — đừng nới ra khi sửa:
   - Không gọi `/update?refresh=1` khi người dùng CHƯA đồng ý. Server cũng chặn lần
     nữa, nhưng client không được là bên phá lời hứa "chạy hoàn toàn local".
   - Mọi lỗi mạng đều IM LẶNG: badge không hiện, không toast đỏ, không log ầm ĩ.
     Mất mạng không phải là app hỏng. */
import { $, esc, focusInto, restoreFocus } from './state.js';
import { tr } from './i18n.js';

let ST = null;

async function get(url) {
  const r = await fetch(url, { cache: 'no-store' });
  return r.json();
}

function paintBadge() {
  const b = $('update-badge');
  if (!b) return;
  const n = (ST && ST.consent && ST.behind) || 0;
  b.hidden = !n;
  if (n) b.textContent = tr('upd.behind', { n });
}

function render() {
  const body = $('upd-body'), sum = $('upd-sum'), note = $('upd-note'), pull = $('upd-pull');
  if (!ST) return;
  sum.innerHTML = tr('upd.sum', { local: esc(ST.local || '?'), latest: esc(ST.latest || '?') });

  /* Nút đổi ý — nhãn là HÀNH ĐỘNG sắp làm, không phải trạng thái hiện tại. Đây là lối
     duy nhất luôn có mặt để bật/tắt: badge chỉ hiện khi đang thiếu bản, còn dải hỏi thì
     hỏi đúng một lần. Thiếu nó thì trả lời xong là khoá cứng lựa chọn — lỗ của v1.50.x. */
  // Hai nhánh tường minh chứ không nhét ba ngôi VÀO TRONG lời gọi dịch: bộ gác i18n
  // chỉ nhận ra khoá khi nó là chuỗi đứng ngay sau dấu mở ngoặc, nên kiểu kia làm cả
  // hai khoá bị coi là "khoá chết" dù đang dùng thật.
  $('upd-consent').textContent = ST.consent ? tr('upd.consent.off') : tr('upd.consent.on');

  body.innerHTML = !ST.consent
    ? `<div class="dash-empty">${tr('upd.disabled')}</div>`
    : ((ST.versions || []).map(v =>
        `<div class="upd-row"><span class="v">${esc(v.tag)}</span>` +
        `<span class="s">${esc(v.summary || tr('upd.nosummary'))}</span></div>`).join('')
       || `<div class="dash-empty">${tr('upd.uptodate')}</div>`);

  /* Nút cập nhật chỉ sáng khi server nói CHẮC CHẮN an toàn (là clone, có origin,
     không detached, tree sạch). Không đủ điều kiện thì nói rõ VÌ SAO và đưa lệnh tay
     — im lặng vô hiệu hoá một cái nút là kiểu tệ nhất. */
  pull.disabled = !ST.can_pull;
  /* Khoá ghép động PHẢI dùng template literal. Bộ gác test_i18n dò lời gọi hàm dịch
     có đối số là chuỗi nháy đơn, nên kiểu nối chuỗi sẽ bị nó đọc thành một khoá cụt
     (phần trước dấu +) rồi báo "khoá không có trong từ điển". Cùng cách mà
     integrity.js và onboarding.js đang làm cho khoá động của chúng.
     Lưu ý cho người sửa sau: đừng viết ví dụ cú pháp đó ra trong comment — bộ dò đọc
     cả comment, và chính dòng này đã làm test đỏ một lần vì lý do đó. */
  const why = `upd.cant.${ST.pull_reason || 'not_a_repo'}`;
  note.innerHTML = ST.can_pull
    ? tr('upd.repo', { repo: esc(ST.repo || '') })
    : tr(why, { repo: esc(ST.repo || '') });
}

export async function pollUpdate(refresh) {
  try {
    ST = await get('/update' + (refresh ? '?refresh=1' : ''));
  } catch (e) { return; }              // offline: giữ nguyên trạng thái, không kêu
  if (!ST.asked) $('upd-ask').classList.add('show');
  paintBadge();
}

export async function openUpdate() {
  $('update').classList.add('show');
  focusInto($('upd-box'), '#upd-x');
  if (!ST) await pollUpdate(false);   // lượt boot có thể đã hỏng (offline) — đừng mở panel rỗng
  render();
}

export function closeUpdate() { $('update').classList.remove('show'); restoreFocus(); }

export async function toggleConsent() {
  await answer(!(ST && ST.consent));
  render();                                    // panel đang mở -> phản hồi ngay tại chỗ
}

async function answer(yes) {
  $('upd-ask').classList.remove('show');
  try {
    /* PHẢI là POST: route nằm ở do_POST và có hàng rào Origin. Bản đầu gọi bằng GET —
       dải hỏi ẩn đi, người dùng tưởng đã trả lời xong, mà server không ghi nhận gì cả
       (lần sau mở lại vẫn hỏi). Không test tĩnh nào bắt được, chỉ bấm thật mới lộ. */
    const r = await fetch('/update-consent?value=' + (yes ? 'on' : 'off'), { method: 'POST' });
    ST = await r.json();
  } catch (e) { return; }
  paintBadge();
}

async function doPull() {
  const btn = $('upd-pull'), note = $('upd-note');
  btn.disabled = true;
  note.textContent = tr('upd.pulling');
  let res;
  try {
    res = await (await fetch('/update-pull', { method: 'POST' })).json();
  } catch (e) {
    note.textContent = tr(`upd.cant.git_failed`, { repo: '' });
    return;
  }
  if (res.ok) {
    /* Kéo xong thì serve.py tự thấy nguồn đổi và khởi động lại; nút ⟳ (W64) sẽ nháy
       lên mời nạp lại. KHÔNG tự reload ở đây — cùng lý do như W64: không cướp tab,
       ghim, bộ lọc và vị trí camera của người dùng. */
    note.textContent = tr('upd.pulled');
  } else {
    note.textContent = tr(`upd.cant.${res.reason || 'pull_failed'}`, { repo: '' });
    btn.disabled = false;
  }
}

export function initUpdate() {
  /* Cả badge lẫn SỐ VERSION đều mở panel. Số version là lối vào luôn có mặt — badge
     chỉ xuất hiện khi đang thiếu bản, nên nếu chỉ có badge thì người đã tắt kiểm tra
     (hoặc đang ở bản mới nhất) không còn cửa nào để đổi ý. */
  for (const id of ['update-badge', 'app-ver']) {
    const b = $(id);
    if (!b) continue;
    b.onclick = openUpdate;
    b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openUpdate(); } };
  }
  $('upd-consent').onclick = toggleConsent;
  $('upd-ask-y').onclick = () => answer(true);
  $('upd-ask-n').onclick = () => answer(false);
  $('upd-x').onclick = closeUpdate;
  $('upd-pull').onclick = doPull;
  $('update').onclick = ev => { if (ev.target === $('update')) closeUpdate(); };
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('update').classList.contains('show')) {
      ev.stopPropagation();
      closeUpdate();
    }
  }, true);
}
