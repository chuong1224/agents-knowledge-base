#!/usr/bin/env python3
"""One-command demo — run the cockpit on the bundled 120-note demo vault.

    git clone https://github.com/chuong1224/agents-knowledge-base
    cd agents-knowledge-base
    python try_demo.py            # extra args go to ensure_graph3d.py, e.g. --port 9000

No vault needed, nothing installed outside this folder. When you're ready for a
vault of your own, see starter-vault/ and the README.
"""
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(REPO, "demo", "vault", ".graph3d")

TOP_FILES = ["Start-Graph3D.bat", "activity_paths.py", "build_graph_data.py",
             "ensure_graph3d.py", "log_activity.py", "run_graph3d.py",
             "serve.py", "index.html"]
DIRS = ["src", "vendor"]


def main():
    os.makedirs(APP, exist_ok=True)
    for f in TOP_FILES:
        shutil.copyfile(os.path.join(REPO, f), os.path.join(APP, f))
    for d in DIRS:
        dst = os.path.join(APP, d)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(os.path.join(REPO, d), dst,
                        ignore=shutil.ignore_patterns("__pycache__"))
    print("Demo vault ready (120 notes) — starting the cockpit...")
    sys.exit(subprocess.call(
        [sys.executable, os.path.join(APP, "ensure_graph3d.py")] + sys.argv[1:],
        cwd=APP))


if __name__ == "__main__":
    main()
