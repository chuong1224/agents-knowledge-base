#!/usr/bin/env python3
"""Publish helper — sync code from the maintainer's private working copy into this repo.

Usage:
    python tools/publish_from_vault.py --src "path/to/YourVault/.graph3d"

Steps:
1. Copies the whitelisted code files/dirs from --src into the repo root.
   Runtime data (logs, heat stores, backups) and private ops files are never copied.
2. Scans the whole repo tree against a DENYLIST of private strings (hostnames,
   org names, ...) and FAILS if any is found, so nothing private can be committed
   by accident. The denylist itself lives OUTSIDE this repo:
   `<src>/publish_denylist.txt`, one term per line (never published).
3. Prints `git status` — review, commit and push manually.
"""
import argparse
import importlib.util
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files that only make sense in this repo, not in the app itself.
EXTRA_TOP = [".gitattributes"]
EXTRA_DIRS = ["tests"]
SKIP_DIR_NAMES = {"__pycache__"}
SKIP_SUFFIXES = (".jsonl", ".lock")
SKIP_CONTAINS = (".bak-",)
SCAN_SKIP_DIRS = {".git"}


def app_lists(src):
    """What to copy, read from the app's own single source of truth
    (`activity_paths.APP_TOP` / `APP_DIRS` in --src) instead of a hand-kept list here.

    A hand-kept list is why a new module was silently skipped once: this script printed
    "Copy OK" while the file never left the working copy. The app also machine-checks
    that list (selfcheck contract "every root .py is declared"), so it cannot go stale.
    """
    path = os.path.join(src, "activity_paths.py")
    spec = importlib.util.spec_from_file_location("_src_activity_paths", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, "APP_TOP") or not hasattr(mod, "APP_DIRS"):
        sys.exit("--src is too old: activity_paths.py has no APP_TOP/APP_DIRS "
                 "(the single list of app files). Update the working copy first.")
    return list(mod.APP_TOP) + EXTRA_TOP, list(mod.APP_DIRS) + EXTRA_DIRS


def copy_tree(src_dir, dst_dir):
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIR_NAMES]
        rel = os.path.relpath(root, src_dir)
        out = os.path.join(dst_dir, rel) if rel != "." else dst_dir
        os.makedirs(out, exist_ok=True)
        for f in files:
            if f.endswith(SKIP_SUFFIXES) or any(s in f for s in SKIP_CONTAINS):
                continue
            shutil.copyfile(os.path.join(root, f), os.path.join(out, f))


def load_denylist(src):
    path = os.path.join(src, "publish_denylist.txt")
    if not os.path.isfile(path):
        sys.exit("DENYLIST MISSING: %s\nRefusing to publish without a private-string denylist." % path)
    with open(path, "r", encoding="utf-8") as fh:
        terms = [t.strip() for t in fh if t.strip() and not t.startswith("#")]
    if not terms:
        sys.exit("DENYLIST EMPTY: %s" % path)
    return terms


def scan(terms):
    # Denylisted terms are deliberately not echoed in hits, so they never leak into logs.
    hits = []
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in SCAN_SKIP_DIRS]
        for f in files:
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    for i, line in enumerate(fh, 1):
                        for t in terms:
                            if t in line:
                                hits.append("%s:%d: contains a denylisted term" % (os.path.relpath(path, REPO), i))
            except OSError:
                pass
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="path to the private .graph3d working copy")
    a = ap.parse_args()
    src = os.path.abspath(a.src)
    if not os.path.isfile(os.path.join(src, "serve.py")):
        sys.exit("--src does not look like a .graph3d copy (serve.py missing): %s" % src)

    terms = load_denylist(src)
    top_files, dirs = app_lists(src)

    for f in top_files:
        shutil.copyfile(os.path.join(src, f), os.path.join(REPO, f))
    for d in dirs:
        dst = os.path.join(REPO, d)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        copy_tree(os.path.join(src, d), dst)

    hits = scan(terms)
    if hits:
        print("PRIVATE STRINGS FOUND — publish blocked:")
        print("\n".join(hits))
        sys.exit(1)

    print("Copy OK, denylist scan CLEAN. Review and commit:")
    subprocess.run(["git", "-C", REPO, "status", "--short"], check=False)


if __name__ == "__main__":
    main()
