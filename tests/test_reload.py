# -*- coding: utf-8 -*-
"""Test nut ⟳ nap lai giao dien (W64) — kiem TINH tren ma nguon, khong can trinh duyet.

Vi sao co bo nay: tu W58 app mo bang cua so app Edge/Chrome (`--app=`) nen KHONG con
thanh dia chi ⇒ khong con nut reload cua trinh duyet. Nut nay la loi thoat duy nhat bam
duoc, va no con la CHO BAO "server da nap ma moi" — mat mot trong hai deu am tham.

Ba dieu de vo nhat, moi dieu mot may gac:
  - nut roi ra khoi dong version  -> rot xuong vung #sidebar (top 64px) la bi an mat
    click. Bai hoc W43, do bang elementFromPoint chu khong phai element.click().
  - nhanh boot_id doi quen bat .hot -> nguoi dung ngoi tren ban cu ma khong biet, vi
    refreshData() chi nap lai DU LIEU chu khong nap lai ma UI.
  - pollActivity roi khoi __fx -> khong con nghiem thu duoc nhanh do khi tab bi an
    (tab an => vong poll gan nhu dung, gotcha #9): chinh bay nay da lam lan nghiem thu
    dau tuong nham la code hong.
"""
import io, os, re, sys
sys.dont_write_bytecode = True
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from _scratch import G3D

SRC = os.path.join(G3D, "src")
INDEX = os.path.join(G3D, "index.html")

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


html = read(INDEX)
ui = read(os.path.join(SRC, "ui.js"))
main = read(os.path.join(SRC, "main.js"))
act = read(os.path.join(SRC, "activity.js"))
css = read(os.path.join(SRC, "style.css"))
i18n = read(os.path.join(SRC, "i18n.js"))

# --- 1: nut ton tai, dung mot lan ---
check("1 index.html co dung 1 nut #reload-b", html.count('id="reload-b"') == 1,
      html.count('id="reload-b"'))

# --- 2: nut nam CUNG DONG version (trong div.sub) ---
# Khong doi cho: dong duoi la vung #sidebar (top 64px) — nut roi xuong do la bi an mat
# click du CSS van ve ra nut. Do bang cach cat dung khoi div.sub roi tim nut trong do.
m = re.search(r'<div class="sub">(.*?)</div>', html, re.S)
check("2 nut nam trong div.sub (cung dong voi so version)",
      bool(m) and 'id="reload-b"' in m.group(1))

# --- 3: nut co khoa dich cho ca title lan aria ---
btn = re.search(r'<button[^>]*id="reload-b"[^>]*>', html)
btn = btn.group(0) if btn else ""
check("3 nut co data-i18n-title=reload.tip", 'data-i18n-title="reload.tip"' in btn, btn)
check("3 nut co data-i18n-aria=reload.aria", 'data-i18n-aria="reload.aria"' in btn, btn)

# --- 4: 3 khoa co du o CA HAI ngon ngu ---
# test_i18n gac "khoa dung phai co that" va "khong khoa chet"; day gac dung 3 khoa nay
# ton tai o ca vi lan en — thieu ben nao la nut noi nua Viet nua Anh.
parts = i18n.split("\n  en: {")
vi_block = parts[0]
en_block = parts[1] if len(parts) > 1 else ""
for k in ("reload.tip", "reload.tip.new", "reload.aria"):
    check("4 khoa %s co ca vi lan en" % k,
          ("'%s'" % k) in vi_block and ("'%s'" % k) in en_block)

# --- 5: hanh vi bam = nap lai trang ---
check("5 ui.js export initReload", "export function initReload" in ui)
check("5 initReload goi location.reload()", "location.reload()" in ui)

# --- 6: main.js that su NOI nut vao (khai ma khong goi = nut chet) ---
imported = re.search(r"import \{(.*?)\} from '\./ui\.js'", main, re.S)
check("6 main.js import initReload", bool(imported) and "initReload" in imported.group(1))
check("6 main.js goi initReload()", "initReload();" in main)

# --- 7: nhanh boot_id doi phai bat .hot + doi tooltip ---
# Cat dung khoi lenh cua nhanh do roi soi ben trong: de o ngoai nhanh la nut sang den
# ca khi khong co ban moi.
br = re.search(r"if \(data\.boot_id && serverBoot(.*?)\n    \}", act, re.S)
body = br.group(1) if br else ""
check("7 tim thay nhanh boot_id doi trong activity.js", bool(body))
check("7 nhanh do bat class hot cho #reload-b",
      "'reload-b'" in body and "classList.add('hot')" in body, body[:120])
check("7 nhanh do doi tooltip sang reload.tip.new", "reload.tip.new" in body, body[:120])

# --- 8: KHONG duoc tu location.reload() trong activity.js ---
# Tu reload khong hoi se cuop mat tab dang doc / ghim / bo loc / vi tri camera giua chung.
# Nut moi, nguoi dung bam.
check("8 activity.js khong tu goi location.reload()", "location.reload()" not in act)

# --- 9: CSS co nut va trang thai hot ---
check("9 style.css co rule #reload-b", "#reload-b {" in css)
check("9 style.css co rule #reload-b.hot", "#reload-b.hot" in css)

# --- 10: pollActivity nam trong __fx de nghiem thu duoc khi tab bi an ---
fx = re.search(r"window\.__fx\s*=\s*\{(.*?)\};", main, re.S)
check("10 pollActivity co trong __fx (nghiem thu tab an)",
      bool(fx) and "pollActivity" in fx.group(1))

print("\nTONG KET test_reload: %s" % (("FAIL %d: %s" % (len(fails), ", ".join(fails))) if fails else "ALL PASS"))
sys.exit(1 if fails else 0)
