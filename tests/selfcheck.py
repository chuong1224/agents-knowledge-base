# -*- coding: utf-8 -*-
"""Selfcheck .graph3d (G1.2) — luat G1.3: sua .graph3d/* xong PHAI chay selfcheck, PASS moi duoc ghi nghiem thu.

3 lop, ca bo < 30s:
  1. Compile — syntax 6 file .py goc + tests/*.py; index.html phai ket thuc </html>;
     src/* (ES modules giai doan 0) khong rong + LF + ket thuc \n + index tro /src/main.js
     (cung logic voi _restart_sources_sane trong serve.py).
  2. Contract grep — ma hoa cac bug DA SUA trong review 2026-07-10 (muc 2a..2i, < 1s):
     moi contract la mot bug tung xay ra, FAIL nghia la co nguoi vua dua bug do quay lai.
  3. Unit — test_p1/p3/p4/p5 + test_reader (guard /note + /asset, giai doan 1 Vault
     Cockpit) + test_finder (/search fold + AND + loai dot-folder, giai doan 2)
     + test_cockpit (/timeline + /dashboard theo ngay local, giai doan 3)
     + test_journal (journal dong bo log 2 may qua vault, v1.25.0);
     test_p2 (~15s, spawn process that + chiem port 8397) chi chay khi --slow.

Chay:  python .graph3d/tests/selfcheck.py [--slow]
Exit:  0 = ALL PASS; 1 = co FAIL.
"""
import glob
import json, os, re, subprocess, sys, time

sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault
from _scratch import SCRATCH, G3D, VAULT

TESTS = os.path.dirname(os.path.abspath(__file__))
PY_MAIN = ["activity_paths.py", "backup_graph3d.py", "build_graph_data.py",
           "ensure_graph3d.py", "log_activity.py", "run_graph3d.py", "serve.py"]
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


# ---- Lop 1: compile ----
def lop1_compile():
    py_files = [(n, os.path.join(G3D, n)) for n in PY_MAIN]
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
    if tools is not None:
        cfg = json.loads(read(os.path.join(VAULT, ".claude", "settings.json")))
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
    defs = {n: read(os.path.join(G3D, n)).count("def parse_jsonl") for n in PY_MAIN}
    check("2f def parse_jsonl duy nhat, nam trong activity_paths.py",
          defs["activity_paths.py"] == 1 and sum(defs.values()) == 1, defs)

    # 2g — P4.5: khong hardcode hash package MSIX, phai glob Claude_*
    hard = [n for n in PY_MAIN if "Claude_pzs8sxrjxfjjc" in read(os.path.join(G3D, n))]
    check("2g khong hardcode Claude_pzs8sxrjxfjjc + co glob Claude_*",
          not hard and '"Claude_*"' in read(os.path.join(G3D, "activity_paths.py")), hard)

    # 2h — P2.2: kill phai xac minh danh tinh PID truoc khi taskkill
    check("2h run_graph3d.py co def _pid_cmdline",
          "def _pid_cmdline" in read(os.path.join(G3D, "run_graph3d.py")))

    # 2i — bai hoc da-stream 10/07: badge version duy nhat, version moi = badge hien hanh + 1.
    # Quet ca src/* de khong ai nhet version string thu 2 vao module.
    badges = [b for _, txt in ui for b in re.findall(r"\bv\d+\.\d+\.\d+\b", txt)]
    check("2i badge version xuat hien dung 1 lan (index+src)", len(badges) == 1, badges)


# ---- Lop 3: unit ----
def lop3_unit(slow):
    files = ["test_p1.py", "test_p3.py", "test_p4.py", "test_p5.py", "test_reader.py",
             "test_finder.py", "test_cockpit.py", "test_journal.py"]
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
