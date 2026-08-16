# -*- coding: utf-8 -*-
"""test_selfcheck.py — W222: nghiem thu chinh cai runner dang cham diem moi bo test.

Vi sao phai co: den 14/08/2026 lop 3 cua selfcheck chi doc returncode. Bo test nao bat
ImportError, khong tim thay `node`, hoac khong chay tren Windows thi in mot dong SKIP roi
exit 0 — runner dem PASS trong khi no KHONG do gi (W220 da va lo nay ben may gac tooling
cua vault, .graph3d thi chua). Xanh gia nguy hon do gia: do gia con thay ma cai.

Bay cua chinh bo nay: tren may Windows co san `node`, co venv, co .claude/settings.json
va co vault_rules.py thi CA 5 nhanh SKIP that trong tests/ deu khong chay. Nghia la neu
chi ngoi doi nhanh that, phep do se luon rong ma van xanh. Nen o day toy test duoc DUNG
LEN de ep du 4 nhan, va chay qua dung duong subprocess ma lop 3 dung (co ca chuyen
encoding output tren Windows).

Chay:  python test_selfcheck.py
Exit:  0 = ALL PASS · 1 = co FAIL
"""
import glob
import os
import subprocess
import sys

sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _scratch import SCRATCH, VAULT
import selfcheck as SC

fails = []


def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


def res(ok, output):
    return {"test": "toy", "ok": ok, "output": output}


# ---- A. Doc duoc dong khai bao ----
check("A1 bat [SKIP] o dau dong, tra dung ly do",
      SC.bo_qua(res(True, "linh tinh\n[SKIP] khong co node\nxong\n")) == ["khong co node"])
check("A2 nhieu muc bo qua thi dem du",
      len(SC.bo_qua(res(True, "[SKIP] mot\n[SKIP] hai\n[SKIP] ba\n"))) == 3)
check("A3 do tron thi rong", SC.bo_qua(res(True, "PASS a\nPASS b\nALL PASS\n")) == [])
# Ngoac vuong la co y: bo test in chu SKIP trong du lieu do choi khong duoc dem oan.
check("A4 chu SKIP tran KHONG duoc tinh (do la kieu cu, khong ai dem duoc)",
      SC.bo_qua(res(True, "SKIP dung parser THAT — kieu cu truoc W222\n")) == [])
check("A5 marker giua dong KHONG duoc tinh (tranh dem nham van xuoi)",
      SC.bo_qua(res(True, "ket qua la [SKIP] nam giua cau\n")) == [])
# Contract 2m gac chieu con lai: cam IN chu SKIP tran. Hai mau duoi duoc NOI luc chay,
# khong viet thang, de chinh file nay khong bi 2m bat oan — day cung la ly do 2m bam vao
# `print(` chu khong bat moi chuoi bat dau bang SKIP.
mau_cu = "print(" + '"' + "SKIP dung parser THAT" + '"' + ")"
mau_moi = 'print("[SKIP] dung parser THAT")'
check("A6 contract 2m bat kieu khai CU (in SKIP tran)", bool(SC.SKIP_TRAN_RE.search(mau_cu)))
check("A7 contract 2m KHONG bat kieu khai moi", not SC.SKIP_TRAN_RE.search(mau_moi))

# ---- B. Bon nhan, khong duoc nhap nhem ----
check("B1 xanh + do tron = PASS", SC.phan_loai(res(True, "ALL PASS\n")) == "PASS")
check("B2 xanh + co muc bo qua = PASS* (khong phai PASS)",
      SC.phan_loai(res(True, "[SKIP] khong co node\nALL PASS\n")) == "PASS*")
check("B3 do that = FAIL", SC.phan_loai(res(False, "FAIL 2 muc\n")) == "FAIL")
# W218 chieu 1: no ngay luc import.
check("B4 do vi thieu thu vien = THIEU-LIB, KHONG phai FAIL",
      SC.phan_loai(res(False, "ModuleNotFoundError: No module named 'yaml'\n")) == "THIEU-LIB")
# W218 chieu 2 — kieu nguy hiem hon: bat ImportError roi [SKIP] va exit 0.
check("B5 XANH GIA vi thieu thu vien = THIEU-LIB, KHONG phai PASS*",
      SC.phan_loai(res(True, "[SKIP] bo qua (No module named 'docx')\n")) == "THIEU-LIB")
check("B6 doc dung ten module thieu o ca hai chieu",
      SC.thieu_module(res(False, "No module named 'yaml.parser'\n")) == "yaml"
      and SC.thieu_module(res(True, "[SKIP] thieu (No module named 'docx')\n")) == "docx"
      and SC.thieu_module(res(True, "[SKIP] khong co node\n")) == "")

# ---- C. Lenh va phai tro dung interpreter DANG chay ----
lenh = SC.lenh_cai(["yaml", "docx", "openpyxl"])
check("C1 ten import khac ten goi pip -> lenh cai dung TEN GOI",
      all(x in lenh for x in ("PyYAML", "python-docx", "openpyxl"))
      and "yaml " not in lenh and "docx " not in lenh, lenh)
check("C2 lenh va tro dung interpreter dang chay test, khong phai `python` chung chung",
      sys.executable in lenh, lenh)

# ---- D. Di tron duong subprocess that cua lop 3 ----
# Khong mock: chinh doan encoding/capture nay la cho dong [SKIP] co the roi mat tren
# Windows, va do la thu mock khong bao gio bat duoc.
TOYS = {
    "toy_pass.py": "print('ALL PASS')\n",
    "toy_skip.py": "print('[SKIP] D. cu phap JS bang node — may nay khong co node')\n"
                   "print('cac case con lai chay that')\n",
    "toy_xanh_gia.py": "try:\n    import khong_he_ton_tai_w222\n"
                       "except ImportError as e:\n    print('[SKIP] bo qua (%s)' % e)\n",
    "toy_do.py": "print('hong that')\nraise SystemExit(1)\n",
    # Ly do bo qua THAT trong tests/ co em-dash. Con in theo locale (cp1252 tren Windows)
    # ma cha giai ma UTF-8 thi no ve tay cha thanh U+FFFD, roi cha in ra pipe cp1252 la
    # UnicodeEncodeError — giet ca lan selfcheck DUNG luc no dang bao "toi chua do gi".
    # Do that 16/08/2026 khi an `node` khoi PATH de ep nhanh SKIP that cua test_reader.
    "toy_dau.py": "print('[SKIP] R toan JS — may khong co node')\n",
}
TOY_DIR = os.path.join(SCRATCH, "w222-toy")
os.makedirs(TOY_DIR, exist_ok=True)
for ten, body in TOYS.items():
    with open(os.path.join(TOY_DIR, ten), "w", encoding="utf-8", newline="\n") as f:
        f.write(body)


def chay_nhu_lop3(ten):
    """Copy dung cach lop3_unit goi process con — doi mot chu la phep do het gia tri."""
    r = subprocess.run([sys.executable, os.path.join(TOY_DIR, ten)],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=120, cwd=TOY_DIR,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return {"test": ten, "ok": r.returncode == 0, "output": r.stdout + r.stderr}


d_pass, d_skip, d_gia, d_do = (chay_nhu_lop3(t) for t in
                               ("toy_pass.py", "toy_skip.py", "toy_xanh_gia.py", "toy_do.py"))
check("D1 bo do tron -> PASS", SC.phan_loai(d_pass) == "PASS", d_pass["output"])
check("D2 bo tu khai bo qua -> PASS* va doc lai duoc ly do",
      SC.phan_loai(d_skip) == "PASS*" and "khong co node" in " ".join(SC.bo_qua(d_skip)),
      d_skip["output"])
check("D3 exit 0 nhung thieu thu vien -> THIEU-LIB (day la ca 'xanh gia' cua W220)",
      SC.phan_loai(d_gia) == "THIEU-LIB"
      and SC.thieu_module(d_gia) == "khong_he_ton_tai_w222", d_gia["output"])
check("D4 do that -> FAIL", SC.phan_loai(d_do) == "FAIL", d_do["output"])
d_dau = chay_nhu_lop3("toy_dau.py")
check("D5 ly do co em-dash ve nguyen chu, khong hoa U+FFFD (lo crash 16/08/2026)",
      SC.bo_qua(d_dau) == ["R toan JS — may khong co node"], d_dau["output"])
# Ngoai ra cha phai in duoc no ra stdout cua CHINH minh du encoding la gi.
hiem = "bo qua � — thieu `node` ế"
enc = getattr(sys.stdout, "encoding", None) or "ascii"
try:
    SC.an_toan(hiem).encode(enc)
    in_duoc = True
except UnicodeEncodeError:
    in_duoc = False
check("D6 an_toan() cho ra chuoi stdout hien tai ma hoa duoc (%s)" % enc, in_duoc)
check("D7 an_toan() khong dung toi chuoi ASCII", SC.an_toan("plain ascii") == "plain ascii")

# ---- E. Ban than runner phai khai bao va dem, khong chi in ----
src_sc = SC.read(os.path.join(os.path.dirname(os.path.abspath(__file__)), "selfcheck.py"))
check("E1 selfcheck co so dem muc bo qua rieng (khong lan vao `fails`)",
      "skips = []" in src_sc and "skips.append" in src_sc)
check("E2 muc bo qua di vao TONG KET, khong nam mot minh o dong ghi chu",
      "BO QUA %d muc" in src_sc)
check("E3 THIEU-LIB chan, nhung KHONG bi goi ten la FAIL (W218)",
      'elif nhan == "FAIL":' in src_sc
      and "sys.exit(1 if (fails or thieu_lib) else 0)" in src_sc
      and "CHUA DO DUOC %d bo vi thieu thu vien" in src_sc)
check("E5 PASS* KHONG chan (may khong co node thi sua code cung khong het)",
      "skips.append" in src_sc and "or skips" not in src_sc)
# Chinh selfcheck cung phai dung marker cho nhanh 2b cua no.
check("E4 selfcheck khai bo qua cua chinh no bang marker chung",
      'an_toan("[SKIP] " + ly_do)' in src_sc)

# ---- F. Hai ban logic tach roi phai khong troi nhau ----
# Ban goc song ben may gac tooling cua vault. Tach roi la CO Y (ban public clone ra ngoai
# vault khong voi toi file kia), nen cho nay phai co mot phep do giu hai ban dung mot
# marker — dung cai bay ma contract 2f da tung phai chan cho parse_jsonl.
goc = glob.glob(os.path.join(VAULT, "*", "*", "*", "attachments", "tooling_selfcheck.py"))
if goc:
    src_goc = SC.read(goc[0])
    marker = r'r"^\[SKIP\][ \t]*(.*)$"'
    check("F1 hai may gac dung CUNG MOT marker [SKIP]",
          marker in src_sc and marker in src_goc, goc[0])
    check("F2 hai ban cung du bo ba ham phan loai",
          all(("def %s(" % h) in src_goc and ("def %s(" % h) in src_sc
              for h in ("bo_qua", "thieu_module", "phan_loai")))
    check("F3 hai ban cung co nhan PASS* (xanh nhung chua do het)",
          '"PASS*"' in src_sc and '"PASS*"' in src_goc)
else:
    # Ban public: file goc nam trong vault, khong publish. Dung dip nay tu dien lai quy uoc.
    print("[SKIP] F. doi chieu voi may gac tooling — khong thay tooling_selfcheck.py"
          " (dang chay ngoai vault)")

print("\nTONG KET test_selfcheck: %s" % (
    ("FAIL %d: %s" % (len(fails), ", ".join(fails))) if fails else "ALL PASS"))
sys.exit(1 if fails else 0)
