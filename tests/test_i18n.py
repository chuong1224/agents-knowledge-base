# -*- coding: utf-8 -*-
"""Test tang song ngu VI/EN (W43) — kiem TINH tren ma nguon, khong can trinh duyet:

  - hai ngon ngu co CUNG tap khoa (thieu mot ben = man hinh nua Viet nua Anh)
  - moi khoa dung trong markup (data-i18n / -html / -title / -ph / -aria) deu co trong tu dien
  - moi loi goi tr('khoa') trong src/*.js deu co trong tu dien
  - moi cho thay {bien} trong ban VI cung phai co trong ban EN (dich sot bien = mat so lieu)
  - src/*.js KHONG con chuoi tieng Viet lam giao dien (tru i18n.js va comment)
  - ham dich ten `tr` chu khong phai `t`: `t` trung bien cuc bo o nhieu module
"""
import glob, io, os, re, sys
sys.dont_write_bytecode = True
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from _scratch import G3D

SRC = os.path.join(G3D, "src")
I18N = os.path.join(SRC, "i18n.js")
INDEX = os.path.join(G3D, "index.html")

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def parse_dict(text):
    """Doc DICT tu i18n.js — khong chay JS: cat tung khoi ngon ngu roi bat 'khoa': tai dau dong."""
    out = {}
    for lang in ("vi", "en"):
        m = re.search(r"(?m)^  %s: \{$" % lang, text)
        if not m:
            return {}
        rest = text[m.end():]
        end = re.search(r"(?m)^  \},?$", rest)
        block = rest[:end.start()] if end else rest
        out[lang] = set(re.findall(r"(?m)^\s*'([^']+)':", block))
    return out


src_i18n = read(I18N)
DICT = parse_dict(src_i18n)
check("1 doc duoc DICT ca 2 ngon ngu", set(DICT) == {"vi", "en"} and len(DICT.get("vi", ())) > 50,
      {k: len(v) for k, v in DICT.items()})

vi, en = DICT.get("vi", set()), DICT.get("en", set())
check("2 hai ngon ngu cung tap khoa (%d khoa)" % len(vi), vi == en,
      {"chi co VI": sorted(vi - en)[:12], "chi co EN": sorted(en - vi)[:12]})

# --- khoa dung trong markup ---
html = read(INDEX)
used_html = set()
for attr in ("data-i18n", "data-i18n-html", "data-i18n-title", "data-i18n-ph", "data-i18n-aria"):
    used_html |= set(re.findall(attr + r'="([^"]+)"', html))
check("3 markup dung >=40 khoa", len(used_html) >= 40, len(used_html))
check("3 moi khoa trong markup deu co trong tu dien", used_html <= vi, sorted(used_html - vi))

# --- khoa dung trong JS ---
used_js = set()
for p in sorted(glob.glob(os.path.join(SRC, "*.js"))):
    if os.path.basename(p) == "i18n.js":
        continue
    used_js |= set(re.findall(r"(?<![\w.$])tr\('([^']+)'", read(p)))
check("4 JS goi >=60 khoa", len(used_js) >= 60, len(used_js))
check("4 moi khoa JS goi deu co trong tu dien", used_js <= vi, sorted(used_js - vi))

# --- bien {x} phai khop giua 2 ban dich ---
def vars_of(block, key):
    m = re.search(r"(?m)^\s*'%s': (.+?),?$" % re.escape(key), block)
    return set(re.findall(r"\{(\w+)\}", m.group(1))) if m else set()

mvi = re.search(r"(?m)^  vi: \{$", src_i18n)
men = re.search(r"(?m)^  en: \{$", src_i18n)
blk_vi = src_i18n[mvi.end():men.start()]
blk_en = src_i18n[men.end():]
mismatch = []
for k in sorted(vi & en):
    a, b = vars_of(blk_vi, k), vars_of(blk_en, k)
    if a != b:
        mismatch.append((k, sorted(a), sorted(b)))
check("5 bien {x} khop giua VI va EN", not mismatch, mismatch[:6])

# --- khong con chuoi giao dien tieng Viet trong src/*.js ---
VI_CHARS = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)

def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"(?m)//.*$", "", t)

# Chuoi la DU LIEU cua vault (taxonomy nhom mau) hoac la CODE (bang chu cai) — co y KHONG dich:
#   GROUP_ORDER/CLUSTER_FREE = ten nhom mau do chinh vault dat, dich la noi doi ve noi dung
#   deAccent = phep bo dau tieng Viet, chu 'đ' o day la thuat toan chu khong phai chu tren man hinh
DATA_OK = ("GROUP_ORDER", "CLUSTER_FREE", "'Index / MOC'", "'Khác'", "deAccent = ")
left = []
for p in sorted(glob.glob(os.path.join(SRC, "*.js"))):
    name = os.path.basename(p)
    if name == "i18n.js":
        continue
    body = strip_comments(read(p))
    for i, line in enumerate(body.splitlines(), 1):
        if not VI_CHARS.search(line) or not re.search(r"['\"`]", line):
            continue
        if any(tok in line for tok in DATA_OK):
            continue
        left.append("%s:%d %s" % (name, i, line.strip()[:60]))
check("6 src/*.js het chuoi giao dien tieng Viet", not left, left[:8])

# --- ten ham dich ---
check("7 ham dich ten tr() (t trung bien cuc bo)",
      "export function tr(" in src_i18n and "export function t(" not in src_i18n)
check("7 khong file nao con import { t }",
      not any("import { t }" in read(p) for p in glob.glob(os.path.join(SRC, "*.js"))))

# --- lua chon ngon ngu ---
check("8 co nut doi ngon ngu + luu localStorage",
      "initLangSwitch" in src_i18n and "kbgraph3d.lang.v1" in src_i18n)
check("8 markup co cho gan nut", 'id="lang-sw"' in html)

# --- 9: moi dong tu dien phai la chuoi JS DONG KIN ---
# Bug that (26/07): 3 ban dich EN co dau nhay don chua escape ("the note's …") -> i18n.js
# vo cu phap -> MOI module import no chet theo, trang trang. Lop 1 selfcheck chi kiem
# src/* "khong rong + LF", khong parse JS, nen khong bat duoc. Kiem ngay tai day.
def literal_ok(val):
    """val la phan sau 'khoa': — phai la '…' hoac "…" dong kin, khong con ky tu la o duoi."""
    val = val.strip().rstrip(",").strip()
    if len(val) < 2 or val[0] not in "\"'":
        return False
    q, i = val[0], 1
    while i < len(val):
        c = val[i]
        if c == "\\":
            i += 2
            continue
        if c == q:
            return i == len(val) - 1
        i += 1
    return False

broken = []
for blk, lang in ((blk_vi, "vi"), (blk_en, "en")):
    for line in blk.splitlines():
        s = line.strip()
        m = re.match(r"^('[^']+'|\"[^\"]+\"): (.+)$", s)
        if m and not literal_ok(m.group(2)):
            broken.append("%s %s" % (lang, s[:90]))
check("9 moi dong tu dien la chuoi JS dong kin", not broken, broken[:5])

print("\nTONG KET test_i18n: %s" % (("FAIL %d: %s" % (len(fails), ", ".join(fails))) if fails else "ALL PASS"))
sys.exit(1 if fails else 0)
