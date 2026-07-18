# -*- coding: utf-8 -*-
"""Test Reader (giai doan 1 Vault Cockpit) — vault_file la hang rao DUY NHAT cua
/note + /asset (server bat dau phuc vu noi dung vault): traversal, dot-folder,
duoi file, MIME. Scratch trong %TEMP%."""
import os, sys
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault

from _scratch import SCRATCH, G3D, VAULT
os.environ.setdefault("GRAPH3D_ACTIVITY_FILE", os.path.join(SCRATCH, "act_reader.jsonl"))
sys.path.insert(0, G3D)

import serve as SV

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

# Mot note that trong vault lam mau (CLAUDE.md goc vault luon ton tai)
check("R note that resolve duoc", SV.vault_file("CLAUDE.md", exts={".md"}) is not None)

# Traversal + duong cam — moi ca PHAI None
for bad in [
    "../secrets.txt",                      # thoat vault bang ..
    "a/../../b.md",                        # .. giau giua duong
    "..\\..\\Windows\\win.ini",            # backslash + ..
    "C:/Windows/win.ini",                  # duong tuyet doi co o dia
    "/etc/passwd",                         # duong tuyet doi kieu POSIX
    ".obsidian/app.json",                  # dot-folder: config Obsidian
    ".graph3d/serve.py",                   # dot-folder: chinh code server
    ".claude/settings.json",               # dot-folder: hook agent
    "",                                    # rong
]:
    check("R chan %r" % bad, SV.vault_file(bad) is None)

# Loc duoi: /note chi nhan .md
check("R exts loc duoi khac .md", SV.vault_file("CLAUDE.md", exts={".png"}) is None)

# MIME cho /asset: cac duoi anh pho bien phai co, duoi la fallback octet-stream
for ext, want in [(".jpg", "image/jpeg"), (".webp", "image/webp"), (".pdf", "application/pdf")]:
    check("R MIME %s" % ext, SV.MIME.get(ext) == want, SV.MIME.get(ext))

# Khong hoi quy: cac ham loi serve van nguyen (endpoint moi khong duoc pha contract cu)
for fn in ("read_activity_all", "read_all_events", "build_chains", "_restart_sources_sane"):
    check("R serve.%s con nguyen" % fn, hasattr(SV, fn))

print("\nTONG KET:", ("FAIL %d muc" % len(fails)) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
