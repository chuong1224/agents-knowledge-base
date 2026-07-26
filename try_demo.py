#!/usr/bin/env python3
"""One-command demo — run the cockpit on the bundled 120-note demo vault.

    git clone https://github.com/chuong1224/agents-knowledge-base
    cd agents-knowledge-base
    python try_demo.py            # extra args go through, e.g. --port 9000

No vault needed, nothing installed outside this folder. When you're ready for a vault
of your own, see `starter-vault/` and the README — or just open the app on an empty
folder: it offers the demo, a starter vault and a 1-minute guide right in the UI.

Thin wrapper on purpose: the work happens in `ensure_graph3d.py --demo`, which mirrors
the app into `demo/vault/.graph3d` (file list from `activity_paths.APP_TOP` — the app's
own single source of truth) and serves that vault on its own port, 8322 by default, so
a server you already run on your real vault is left alone.

This script used to keep its own copy of the file list and went stale when the app
gained new modules — the demo then died on import with nothing to warn you.
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.abspath(__file__))


def main():
    sys.exit(subprocess.call(
        [sys.executable, os.path.join(REPO, "ensure_graph3d.py"), "--demo"] + sys.argv[1:],
        cwd=REPO))


if __name__ == "__main__":
    main()
