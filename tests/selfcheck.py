# -*- coding: utf-8 -*-
"""Selfcheck .graph3d (G1.2) — luat G1.3: sua .graph3d/* xong PHAI chay selfcheck, PASS moi duoc ghi nghiem thu.

3 lop, ca bo < 30s:
  1. Compile — syntax moi file .py goc (danh sach doc tu activity_paths.APP_PY, khong
     chep tay) + tests/*.py; index.html phai ket thuc </html>;
     src/* (ES modules giai doan 0) khong rong + LF + ket thuc \n + index tro /src/main.js
     (cung logic voi _restart_sources_sane trong serve.py).
  2. Contract grep — ma hoa cac bug DA SUA (muc 2a..2k, < 1s): moi contract la mot bug
     tung xay ra, FAIL nghia la co nguoi vua dua bug do quay lai. 2a..2i tu review
     2026-07-10; 2j/2k tu 2 su co publish doi 7+8 (danh sach file .py chep tay bi sot).
  3. Unit — test_p1/p3/p4/p5 + test_reader (guard /note + /asset, giai doan 1 Vault
     Cockpit) + test_finder (/search fold + AND + loai dot-folder, giai doan 2)
     + test_cockpit (/timeline + /dashboard theo ngay local, giai doan 3)
     + test_journal (journal dong bo log 2 may qua vault, v1.25.0)
     + test_insight (tang insight suc khoe vault /insight + note bao cao, W10)
     + test_integrity (den bao toan ven vault /integrity — link/nhung/anchor gay,
       anh mo coi, frontmatter, "mo nilon"; W11)
     + test_onboarding (vault trong: state/install_starter/mirror_app, W13)
     + test_i18n (song ngu VI/EN: 2 ngon ngu cung tap khoa, khoa dung deu co that,
       bien {x} khop, src/*.js het chuoi giao dien tieng Viet; W43)
     + test_launcher (loi vao he dieu hanh: shortcut .lnk goi ensure --app, icon .ico,
       uninstall khong dung .lnk nguoi khac, bind_console cho pythonw; W58);
     test_p2 (~15s, spawn process that + chiem port 8397) chi chay khi --slow.

Chay:  python .graph3d/tests/selfcheck.py [--slow]
Exit:  0 = ALL PASS; 1 = co FAIL.
"""
import glob
import json, os, re, subprocess, sys, time

sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault
from _scratch import SCRATCH, G3D, VAULT

TESTS = os.path.dirname(os.path.abspath(__file__))
# File CHI co trong ban private (backup git nam ngoai OneDrive — khong publish).
# Thieu file NAY thi bo qua; thieu bat ky file nao KHAC van la FAIL (bug that).
PRIVATE_ONLY = {"backup_graph3d.py"}
# Nguoc lai: script CHI co o ban public (repo clone) — khong thuoc app, khong mirror,
# khong publish tu vault. Co mat cung khong sao, khong can khai trong APP_PY.
REPO_ONLY = {"try_demo.py"}


def _declared_py():
    """Danh sach .py goc KHONG chep tay nua (W13): doc tu activity_paths.APP_PY —
    nguon DUY NHAT dung chung voi mirror demo va whitelist publish. activity_paths
    hong syntax -> fallback glob de lop 1 con bao duoc dung loi compile."""
    try:
        sys.path.insert(0, G3D)
        import activity_paths as ap
        return sorted(set(ap.APP_PY) | PRIVATE_ONLY), ap
    except Exception:                                    # noqa: BLE001
        return sorted(os.path.basename(p) for p in glob.glob(os.path.join(G3D, "*.py"))), None


PY_MAIN, AP = _declared_py()
# Module serve.py import luc nap NHUNG co y khong nam _VERSION_FILES: no co duong
# reload rieng (importlib.reload theo mtime — gotcha #8), khai vao day se restart thua.
RELOADABLE = {"build_graph_data.py"}
INDEX = os.path.join(G3D, "index.html")
SRC = os.path.join(G3D, "src")


def src_files():
    return sorted(p for p in glob.glob(os.path.join(SRC, "*")) if os.path.isfile(p))


def ui_sources():
    """(ten, noi dung) cua MOI file UI: index.html + src/* — contract quet ca bo."""
    out = [("index.html", read(INDEX))]
    out += [("src/" + os.path.basename(p), read(p)) for p in src_files()]
    return out

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def py_main():
    """[(ten, path)] cac file .py goc CO MAT. File trong PRIVATE_ONLY vang mat thi
    bo qua (ban public khong co); file khac vang mat -> FAIL ngay."""
    out = []
    for name in PY_MAIN:
        p = os.path.join(G3D, name)
        if os.path.isfile(p):
            out.append((name, p))
        elif name not in PRIVATE_ONLY:
            check("0 thieu file goc " + name, False, p)
    return out


# ---- Lop 1: compile ----
def lop1_compile():
    py_files = py_main()
    py_files += [("tests/" + os.path.basename(p), p)
                 for p in sorted(glob.glob(os.path.join(TESTS, "*.py")))]
    for name, p in py_files:
        try:
            compile(read(p), p, "exec")
            ok, info = True, ""
        except SyntaxError as e:
            ok, info = False, e
        check("1 compile " + name, ok, info)
    check("1 index.html ket thuc </html>", read(INDEX).rstrip().endswith("</html>"))
    # Giai doan 0 Vault Cockpit: UI tach ES modules — kiem cung logic _restart_sources_sane
    srcs = src_files()
    check("1 src/ co main.js + style.css",
          any(p.endswith("main.js") for p in srcs) and any(p.endswith("style.css") for p in srcs),
          [os.path.basename(p) for p in srcs])
    bad = []
    for p in srcs:
        with open(p, "rb") as f:
            raw = f.read()
        if not raw or not raw.endswith(b"\n") or b"\r\n" in raw:
            bad.append(os.path.basename(p))
    check("1 src/* khong rong + LF + ket thuc \\n", not bad, bad)
    check("1 index.html tro /src/main.js", 'src="/src/main.js"' in read(INDEX))


# ---- Lop 2: contract grep ----
def lop2_contract():
    # 2a — bug P0.1: bat set GRAPH3D_ACTIVITY_FILE -> vo hieu va MSIX (server khong thay log Cowork)
    bat = read(os.path.join(G3D, "Start-Graph3D.bat"))
    bad = [l.strip() for l in bat.splitlines()
           if re.match(r'\s*set\s+"?GRAPH3D_ACTIVITY_FILE', l, re.I)]
    check("2a bat KHONG set GRAPH3D_ACTIVITY_FILE", not bad, bad)

    # 2b — bug P0.6: matcher hook thieu tool -> event khong duoc ghi
    os.environ.setdefault("GRAPH3D_ACTIVITY_FILE", os.path.join(SCRATCH, "act_selfcheck.jsonl"))
    sys.path.insert(0, G3D)
    tools = None
    try:
        import log_activity as LA
        tools = set(LA.TYPE_BY_TOOL)
    except Exception as e:
        check("2b import log_activity de doc TYPE_BY_TOOL", False, e)
    hook_cfg = os.path.join(VAULT, ".claude", "settings.json")
    if tools is not None and not os.path.isfile(hook_cfg):
        # Ban public (clone ra ngoai vault) khong co hook settings — kiem nay vo nghia
        # o do; bo qua co bao, KHONG FAIL (bug that trong vault van bi bat nhu cu).
        print("SKIP 2b matcher hook — khong tim thay " + hook_cfg + " (khong chay trong vault)")
        tools = None
    if tools is not None:
        cfg = json.loads(read(hook_cfg))
        matched = set()
        for ent in cfg.get("hooks", {}).get("PostToolUse", []):
            cmds = " ".join(h.get("command", "") for h in ent.get("hooks", []))
            if "log_activity" in cmds:
                matched |= set((ent.get("matcher") or "").split("|"))
        thieu = sorted(tools - matched)
        check("2b matcher hook bao trum TYPE_BY_TOOL", not thieu, thieu)

    # 2c — P0.5 nhan chung 'Claude' + P2.1 xoa Solar (490 dong dead code).
    # Tu giai doan 0: UI = index.html + src/* — quet ca bo, keo bug lach qua module.
    ui = ui_sources()
    cc = [n for n, txt in ui if "Claude Code" in txt]
    check("2c UI (index+src) khong con literal 'Claude Code'", not cc, cc)
    sol = sorted({m for _, txt in ui for m in re.findall(r"(?i)solar\w*", txt)})
    check("2c UI (index+src) sach dinh danh solar", not sol, sol[:5])

    # 2d — P5.2: dead state started_at/log_path da xoa khoi /health.
    # Match KEY co quote (bug goc la key JSON trong response) — ten ham hop le
    # active_activity_log_path chua chuoi con "log_path" nen khong duoc match tho.
    sv = read(os.path.join(G3D, "serve.py"))
    dead = [t for t in ("started_at", "log_path")
            if re.search(r"[\"']%s[\"']" % t, sv)]
    check("2d serve.py khong con key started_at/log_path", not dead, dead)

    # 2e — P0.4: check vendor phai la PREFIX thu muc (prefix + os.sep), khong substring
    check("2e serve.py co vendor_root = prefix + os.sep",
          re.search(r"vendor_root\s*=.*os\.sep", sv) is not None)

    # 2f — P4.1: parse_jsonl MOT ban duy nhat (3 ban tung phan ky)
    defs = {n: read(p).count("def parse_jsonl") for n, p in py_main()}
    check("2f def parse_jsonl duy nhat, nam trong activity_paths.py",
          defs["activity_paths.py"] == 1 and sum(defs.values()) == 1, defs)

    # 2g — P4.5: khong hardcode hash package MSIX, phai glob Claude_*
    hard = [n for n, p in py_main() if "Claude_pzs8sxrjxfjjc" in read(p)]
    check("2g khong hardcode Claude_pzs8sxrjxfjjc + co glob Claude_*",
          not hard and '"Claude_*"' in read(os.path.join(G3D, "activity_paths.py")), hard)

    # 2h — P2.2: kill phai xac minh danh tinh PID truoc khi taskkill
    check("2h run_graph3d.py co def _pid_cmdline",
          "def _pid_cmdline" in read(os.path.join(G3D, "run_graph3d.py")))

    # 2i — bai hoc da-stream 10/07: badge version duy nhat, version moi = badge hien hanh + 1.
    # Quet ca src/* de khong ai nhet version string thu 2 vao module.
    badges = [b for _, txt in ui for b in re.findall(r"\bv\d+\.\d+\.\d+\b", txt)]
    check("2i badge version xuat hien dung 1 lan (index+src)", len(badges) == 1, badges)

    # 2j — bug doi 7 repo public: whitelist publish (TOP_FILES) liet ke CUNG tung file .py
    # nen them insight.py la SOT, va sot thi im lang (publish bao OK, file moi khong len).
    # Cung lop voi try_demo.py sot insight/integrity -> demo chet luc serve import.
    # Tu W13 chi con MOT danh sach: activity_paths.APP_PY. Contract nay bat quen khai.
    # Huong kiem: moi file CO MAT phai duoc khai (do la bug can bat). Chieu nguoc lai —
    # file da khai ma vang mat — do py_main() lo san ("0 thieu file goc"), va PRIVATE_ONLY
    # duoc mien o day de ban public khong FAIL oan.
    if AP is None:
        check("2j nap duoc activity_paths de doc APP_PY", False, "import that bai")
    else:
        found = {os.path.basename(p) for p in glob.glob(os.path.join(G3D, "*.py"))} - REPO_ONLY
        undeclared = sorted(found - (set(AP.APP_PY) | PRIVATE_ONLY))
        check("2j moi .py goc duoc khai trong APP_PY", not undeclared, undeclared)

    # 2k — bug doi 8: integrity.py khong nam _VERSION_FILES -> sua module xong server
    # VAN phuc vu ban cu, lang thinh (source_version khong hash file do). Luat: moi
    # module local serve.py import luc nap phai co trong _VERSION_FILES (tru RELOADABLE).
    if AP is not None:
        mods = set(re.findall(r"(?m)^(?:import|from)\s+(\w+)", sv))
        local = {m + ".py" for m in mods if os.path.isfile(os.path.join(G3D, m + ".py"))}
        thieu = sorted(local - set(AP._VERSION_FILES) - RELOADABLE)
        check("2k module serve.py import deu nam trong _VERSION_FILES", not thieu, thieu)


# ---- Lop 3: unit ----
def lop3_unit(slow):
    files = ["test_p1.py", "test_p3.py", "test_p4.py", "test_p5.py", "test_reader.py",
             "test_finder.py", "test_cockpit.py", "test_journal.py", "test_insight.py",
             "test_integrity.py", "test_onboarding.py", "test_i18n.py",
             "test_launcher.py", "test_reload.py", "test_update.py"]
    if slow:
        files.append("test_p2.py")
    for name in files:
        t0 = time.perf_counter()
        r = subprocess.run([sys.executable, os.path.join(TESTS, name)],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=120, cwd=TESTS)
        dt = time.perf_counter() - t0
        check("3 %s (%.1fs)" % (name, dt), r.returncode == 0)
        if r.returncode != 0:
            for l in (r.stdout + r.stderr).strip().splitlines()[-12:]:
                print("      | " + l)
    if not slow:
        print("   (bo qua test_p2 cham ~15s — them --slow khi dung den kill/port policy)")


if __name__ == "__main__":
    slow = "--slow" in sys.argv[1:]
    t0 = time.perf_counter()
    print("== Lop 1: compile ==")
    lop1_compile()
    print("== Lop 2: contract ==")
    lop2_contract()
    print("== Lop 3: unit ==")
    lop3_unit(slow)
    dt = time.perf_counter() - t0
    print("\nTONG KET selfcheck (%.1fs): %s" % (
        dt, ("FAIL %d muc: %s" % (len(fails), ", ".join(fails))) if fails else "ALL PASS"))
    sys.exit(1 if fails else 0)
