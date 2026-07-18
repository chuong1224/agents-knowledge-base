# -*- coding: utf-8 -*-
"""Test P4 fixes — parse_jsonl dung chung, build_heat qua aggregate, demojibake hits, glob MSIX. Scratch trong %TEMP%."""
import json, os, sys, time
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault

from _scratch import SCRATCH, G3D
LOG = os.path.join(SCRATCH, "act_p4.jsonl")
os.environ["GRAPH3D_ACTIVITY_FILE"] = LOG
sys.path.insert(0, G3D)

import activity_paths as AP
import log_activity as LA
import serve as SV

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

# t1: parse_jsonl la MOT ban duy nhat dung chung
check("t1a serve + log_activity dung CHUNG parse_jsonl cua activity_paths",
      SV.parse_jsonl is AP.parse_jsonl and LA.parse_jsonl is AP.parse_jsonl)
check("t1b parse_jsonl bo dong hong", AP.parse_jsonl('{"a":1}\nbroken\n\n{"b":2}') == [{"a": 1}, {"b": 2}])

# t2: build_heat dem qua aggregate_by_file (type la normalize -> read)
evs = [{"ts": 1, "file": "X.md", "type": "read", "agent": "A"},
       {"ts": 2, "file": "X.md", "type": "edit", "agent": "A"},
       {"ts": 3, "file": "Y.md", "type": "weird", "agent": "B"}]
h = SV.build_heat(evs)
check("t2a counts/max/total/distinct dung",
      h["counts"] == {"X.md": 2, "Y.md": 1} and h["max"] == 2 and h["total"] == 3 and h["distinct"] == 2, h)
top0 = h["top"][0]
check("t2b top[0] = X.md voi types day du 3 key",
      top0["file"] == "X.md" and top0["n"] == 2 and top0["types"] == {"read": 1, "search": 0, "edit": 1}, top0)
check("t2c type la 'weird' normalize ve read", h["top"][1]["types"]["read"] == 1, h["top"][1])

# t3: demojibake PHAI SUA -> ghi vet hits log
fixed_name = os.path.join(SCRATCH, "test—p4.md")   # co em-dash
open(fixed_name, "w").close()
orig = fixed_name.encode("utf-8").decode("cp1252")       # gia lap mojibake
hits = LA.LOG_FILE + ".demojibake-hits.log"
try: os.remove(hits)
except OSError: pass
r = LA._demojibake(orig)
check("t3a demojibake sua dung ten that", r == fixed_name, r)
hitlines = open(hits, encoding="utf-8").read().strip().splitlines() if os.path.exists(hits) else []
check("t3b hits log ghi 1 dong orig/fixed", len(hitlines) == 1 and json.loads(hitlines[0])["fixed"] == fixed_name)
check("t3c path hop le KHONG ghi hits", LA._demojibake(fixed_name) == fixed_name
      and len(open(hits, encoding="utf-8").read().strip().splitlines()) == 1)

# t4: candidates dung GLOB Claude_* thay hardcode + cache 30s
del os.environ["GRAPH3D_ACTIVITY_FILE"]
fake = os.path.join(SCRATCH, "fakelocal")
std = os.path.join(fake, "claude-graph3d")
msix = os.path.join(fake, "Packages", "Claude_ZZTESTHASH", "LocalCache", "Local", "claude-graph3d")
for d in (std, msix):
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "activity.jsonl"), "w").close()
os.environ["LOCALAPPDATA"] = fake
AP._cand_cache["paths"] = None                            # xoa cache
c = AP.activity_log_candidates()
norm = [os.path.normcase(p) for p in c]
check("t4a co duong chuan", os.path.normcase(os.path.join(std, "activity.jsonl")) in norm, c)
check("t4b glob bat package hash BAT KY (Claude_ZZTESTHASH)",
      os.path.normcase(os.path.join(msix, "activity.jsonl")) in norm, c)
c2 = AP.activity_log_candidates()
check("t4c cache tra cung ket qua", c2 == c)

for f in (LOG, fixed_name, hits, LOG + ".lock"):
    try: os.remove(f)
    except OSError: pass
import shutil; shutil.rmtree(fake, ignore_errors=True)
print("\nTONG KET:", ("FAIL %d muc" % len(fails)) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
