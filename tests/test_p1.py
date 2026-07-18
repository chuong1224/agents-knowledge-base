# -*- coding: utf-8 -*-
"""Test P1 fixes cho KB Graph 3D — scratch trong %TEMP%, khong dung log that."""
import json, os, sys, time
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault

from _scratch import SCRATCH, G3D, VAULT
LOG = os.path.join(SCRATCH, "act_test.jsonl")
os.environ["GRAPH3D_ACTIVITY_FILE"] = LOG
sys.path.insert(0, G3D)

import log_activity as LA
import serve as SV

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

# ---- P1.1: trich path tu field cau truc ----
def _find_nested_note():
    """Tim 1 note THAT nam trong folder con (path co chu HOA) — test tung hardcode
    'Vault Operation/KB Graph 3D/KB Graph 3D.md' va GAY khi vault tai cau truc
    folder-per-note (16/07): duong dan note that phai do dong, khong dong cung."""
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
        for fn in sorted(files):
            if not fn.lower().endswith(".md"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), VAULT).replace("\\", "/")
            if "/" in rel and rel != rel.lower():
                return rel
    return None

REL = _find_nested_note()
check("P1.0 vault co it nhat 1 note trong folder con", REL is not None, REL)

read_payload = {
    "tool_name": "Read",
    "tool_input": {"file_path": VAULT + r"\Index.md"},
    "tool_response": {"file": {"content":
        "noi dung co nhac " + VAULT + "\\" + (REL or "").replace("/", "\\") + " trong bai"}},
}
p = LA._paths_from_payload("read", read_payload)
check("P1.1a Read dung file_path, KHONG quet tool_response", p == [VAULT + r"\Index.md"], p)

search_payload = {
    "tool_name": "Grep",
    "tool_input": {"pattern": "graph3d", "glob": "**/*.md"},
    "tool_response": "Found 2 files\nIndex.md\n%s\nkhong-ton-tai-dau.md\n*.md" % REL,
}
p = LA._paths_from_payload("search", search_payload)
check("P1.1b search bat path TUONG DOI ton tai, loai junk",
      p == ["Index.md", REL], p)

# ---- P1.5: normalize case theo dia ----
orig_bump = LA._bump_cumulative
LA._bump_cumulative = lambda *a, **k: None   # khong dung store heat that
try:
    open(LOG, "w").close()
    n = LA.append_events("read", [(REL or "").lower().replace("/", "\\")])
    line = json.loads(open(LOG, encoding="utf-8").read().strip())
    check("P1.5 rel ghi log dung case that tren dia",
          n == 1 and line["file"] == REL, line.get("file"))
finally:
    LA._bump_cumulative = orig_bump

# ---- P1.4: cursor khong nuot dong ghi do ----
with open(LOG, "wb") as f:
    f.write(b'{"ts": 1, "file": "a.md", "type": "read"}\n'
            b'{"ts": 2, "file": "b.md", "type": "read"}\n'
            b'{"ts": 3, "fi')                     # dong thu 3 dang ghi do
evs, end = SV._read_source(LOG, 0)
check("P1.4a chi tra 2 dong hoan chinh", [e["file"] for e in evs] == ["a.md", "b.md"], evs)
with open(LOG, "ab") as f:
    f.write(b'le": "c.md", "type": "read"}\n')    # writer ghi not
evs2, end2 = SV._read_source(LOG, end)
check("P1.4b phan ghi do duoc doc TRON o poll sau",
      len(evs2) == 1 and evs2[0]["file"] == "c.md", evs2)

# ---- P1.3: cursor rieng tung nguon ----
now = time.time()
with open(LOG, "wb") as f:
    for i, ts in enumerate([now - 3600, now - 2, now - 1]):   # 1 event cu + 2 event moi
        f.write((json.dumps({"ts": ts, "type": "read", "file": "n%d.md" % i}) + "\n").encode())
curs, evs, forced = SV.read_activity_all({}, replay=False)     # nguon "moi xuat hien giua phien"
check("P1.3a nguon moi giua phien: chi event <=90s",
      [e["file"] for e in evs] == ["n1.md", "n2.md"], [e.get("file") for e in evs])
check("P1.3b khong forced khi chi moi nguon", forced is False, forced)
with open(LOG, "ab") as f:
    f.write((json.dumps({"ts": now, "type": "read", "file": "n3.md"}) + "\n").encode())
curs2, evs2, forced2 = SV.read_activity_all(curs, replay=False)
check("P1.3c poll ke chi thay event MOI", [e["file"] for e in evs2] == ["n3.md"], evs2)
check("P1.3d poll khong co gi moi -> rong",
      SV.read_activity_all(curs2, replay=False)[1] == [], None)
k0 = list(curs2.keys())[0]
curs3, evs3, forced3 = SV.read_activity_all({k0: 10 ** 9}, replay=False)   # file "co lai" (rotate)
check("P1.3e rotate -> forced=True + tail <=15", forced3 is True and 0 < len(evs3) <= 15,
      (forced3, len(evs3)))
curs4, evs4, forced4 = SV.read_activity_all({}, replay=True)               # boot replay
check("P1.3f boot replay tail (4 event, khong ts-filter)", len(evs4) == 4, len(evs4))

os.remove(LOG)
try: os.remove(LOG + ".lock")
except OSError: pass
print("\nTONG KET:", ("FAIL %d muc" % len(fails)) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
