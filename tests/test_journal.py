# -*- coding: utf-8 -*-
"""Test journal dong bo log 2 may (v1.25.0) — van de 16/07/2026: activity.jsonl
per-may ngoai OneDrive nen laptop khong thay event may cty. Kiem: path per-may,
ghi journal tai flush (seed backfill + rotate), serve.read_all_events gop moi may
+ inject host + dedup, realtime /activity KHONG doc journal. Scratch rieng."""
import json, os, sys, time
sys.dont_write_bytecode = True
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import tempfile
JDIR = os.path.join(tempfile.gettempdir(), "graph3d-selfcheck", "journal_test")
os.environ["GRAPH3D_JOURNAL_DIR"] = JDIR          # TRUOC khi import _scratch (setdefault)
from _scratch import SCRATCH, G3D, VAULT
LOG = os.path.join(SCRATCH, "act_journal.jsonl")
os.environ["GRAPH3D_ACTIVITY_FILE"] = LOG
sys.path.insert(0, G3D)

import shutil
if os.path.isdir(JDIR):
    shutil.rmtree(JDIR)
os.makedirs(JDIR, exist_ok=True)
for f in (LOG, LOG + ".heat-pending.jsonl", LOG + ".lock"):
    try: os.remove(f)
    except OSError: pass

import activity_paths as AP
import log_activity as LA
import serve as SV

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

def ev(ts, f, t="read", ag="Claude"):
    return {"ts": ts, "type": t, "file": f, "agent": ag}

def jlines(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f.read().strip().splitlines() if l.strip()]

# ---- J1: path per-may + env override + parse host tu ten file ----
HOST = AP.host_name()
JP = AP.vault_journal_path()
check("J1a journal nam trong GRAPH3D_JOURNAL_DIR", os.path.dirname(JP) == os.path.normpath(JDIR), JP)
check("J1b ten file activity-<HOST>.jsonl", os.path.basename(JP) == "activity-%s.jsonl" % HOST, JP)
check("J1c journal_host parse nguoc", AP.journal_host(JP) == HOST, AP.journal_host(JP))
check("J1d journal_host ten may co dau -", AP.journal_host("activity-CPU-12-A.jsonl") == "CPU-12-A")

# ---- J2: seed backfill lan dau — journal chua co thi chep log local vao truoc ----
now = time.time()
with open(LOG, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(ev(now - 100, "Cu.md")) + "\n")
LA._journal_append([ev(now, "Moi.md")])
rows = jlines(JP)
check("J2a seed: log cu + event flush deu co mat",
      [r["file"] for r in rows] == ["Cu.md", "Moi.md"], [r.get("file") for r in rows])

# ---- J3: journal da ton tai -> chi append, khong seed lai ----
LA._journal_append([ev(now + 1, "Them.md")])
rows = jlines(JP)
check("J3 append khong seed lai (khong nhan doi Cu.md)",
      [r["file"] for r in rows] == ["Cu.md", "Moi.md", "Them.md"], [r.get("file") for r in rows])

# ---- J4: rotate giu tail khi vuot JOURNAL_MAX_BYTES ----
big = "".join(json.dumps(ev(now + i, "n%05d.md" % i)) + "\n" for i in range(25000))
with open(JP, "w", encoding="utf-8", newline="\n") as f:
    f.write(big)
check("J4a du lieu mo phong vuot nguong", os.path.getsize(JP) > LA.JOURNAL_MAX_BYTES)
LA._journal_append([ev(now + 99999, "cuoi.md")])
rows = jlines(JP)
check("J4b rotate giu <= KEEP_LINES dong, dong cuoi con nguyen",
      len(rows) <= LA.JOURNAL_KEEP_LINES and rows[-1]["file"] == "cuoi.md",
      (len(rows), rows[-1].get("file") if rows else None))

# ---- J5: flush pending -> ghi CA store heat lan journal (mot diem flush) ----
os.remove(JP)
open(LOG, "w").close()
applied = []
orig_apply, orig_lock = LA._apply_events_to_store, LA._cum_locked
LA._apply_events_to_store = lambda evs, now: applied.extend(evs)
LA._cum_locked = lambda work: work()               # khong dung store/lock that trong vault
try:
    with open(LA.PENDING_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(ev(now, "Flush.md")) + "\n")
    LA._flush_pending_into_store(now)
    check("J5a flush van cong store heat", [e["file"] for e in applied] == ["Flush.md"], applied)
    check("J5b flush ghi journal cung lo", os.path.exists(JP)
          and [r["file"] for r in jlines(JP)] == ["Flush.md"],
          jlines(JP) if os.path.exists(JP) else None)
    check("J5c pending da xoa", not os.path.exists(LA.PENDING_FILE))
finally:
    LA._apply_events_to_store, LA._cum_locked = orig_apply, orig_lock

# ---- J6: serve.read_all_events gop moi may + inject host + dedup ----
t0 = time.time() - 50
with open(LOG, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(ev(t0, "Local.md")) + "\n")
with open(JP, "w", encoding="utf-8", newline="\n") as f:          # journal may MINH: ban trung
    f.write(json.dumps(ev(t0, "Local.md")) + "\n")
with open(os.path.join(JDIR, "activity-CPUTEST.jsonl"), "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(ev(t0 + 1, "Remote.md")) + "\n" + json.dumps(ev(t0 + 2, "Remote2.md")) + "\n")
evs = SV.read_all_events()
files = [e["file"] for e in evs]
check("J6a gop du local + 2 event may khac, dedup ban trung",
      files == ["Local.md", "Remote.md", "Remote2.md"], files)
loc = next((e for e in evs if e["file"] == "Local.md"), {})
rem = next((e for e in evs if e["file"] == "Remote.md"), {})
check("J6b event may khac mang host tu ten file", rem.get("host") == "CPUTEST", rem)
check("J6c event may minh KHONG mang host (ban local thang)", "host" not in loc, loc)
# timeline/dashboard di qua read_all_events -> tu dong thay ca 2 may
dd = SV.build_dashboard(evs)
check("J6d dashboard dem du 3 luot tu 2 may", dd["total"] == 3, dd["total"])

# ---- J7: realtime /activity KHONG doc journal (hieu ung live chi tu log local) ----
curs, live, _ = SV.read_activity_all({}, replay=True)
check("J7a realtime chi thay log local", [e.get("file") for e in live] == ["Local.md"],
      [e.get("file") for e in live])
check("J7b cursor khong tro vao journal", all("activity-" not in os.path.basename(k) for k in curs),
      list(curs))

# ---- J8: .gitignore loai journal khoi repo code ----
gi = open(os.path.join(G3D, ".gitignore"), encoding="utf-8").read()
check("J8 .gitignore co activity-*.jsonl", "activity-*.jsonl" in gi)

shutil.rmtree(JDIR, ignore_errors=True)
for f in (LOG, LOG + ".lock"):
    try: os.remove(f)
    except OSError: pass
print("\nTONG KET:", ("FAIL %d muc" % len(fails)) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
