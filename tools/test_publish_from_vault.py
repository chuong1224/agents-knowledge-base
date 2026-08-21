#!/usr/bin/env python3
"""Regression tests for the public-repo denylist gate (W70, W185)."""
import contextlib
import importlib.util
import io
import os
import sys
import tempfile
from pathlib import Path
from unittest import mock
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "publish_from_vault.py"
spec = importlib.util.spec_from_file_location("publish_from_vault", SCRIPT)
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
fails = []


def check(label, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + label + ((" -> " + str(detail)) if detail else ""))
    if not ok:
        fails.append(label)


with tempfile.TemporaryDirectory(prefix="graph3d-publish-test-") as td:
    base = Path(td)
    repo = base / "repo"
    repo.mkdir()
    old_repo = P.REPO
    P.REPO = str(repo)
    try:
        # A common word must not be used alone as a denylist term. A specific phrase
        # remains safe to match case-insensitively without flagging ordinary prose.
        term = "Atlas - Internal Workspace"
        (repo / "benign.txt").write_text("open an atlas in the workspace\n", encoding="utf-8")
        check("cụm riêng không báo oan từ thường", P.scan([term]) == [])

        (repo / "exact.txt").write_text("private root: ATLAS - INTERNAL WORKSPACE\n", encoding="utf-8")
        hits = P.scan([term])
        check("khác hoa thường vẫn bị chặn",
              len(hits) == 1 and hits[0].startswith("exact.txt:1:"), hits)
        (repo / "exact.txt").unlink()

        # The path is public metadata too. A denylisted hostname or org name must be
        # blocked even when the file contents are clean, including for binary files.
        named = repo / "exports" / "atlas - internal workspace-report.txt"
        named.parent.mkdir()
        named.write_text("clean contents\n", encoding="utf-8")
        hits = P.scan([term])
        check("tên/đường dẫn khác hoa thường vẫn bị chặn",
              len(hits) == 1 and hits[0].startswith(str(Path("exports") / "[DENYLISTED]-report.txt")), hits)
        check("hit từ đường dẫn không làm lộ chuỗi cấm",
              all(term.casefold() not in hit.casefold() for hit in hits), hits)
        named.unlink()

        # Binary assets are not public text and previously produced random byte matches.
        (repo / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00atlas - internal workspace\x00")
        check("binary bị bỏ qua", P.scan([term]) == [])

        named_binary = repo / "atlas - internal workspace-image.png"
        named_binary.write_bytes(b"\x89PNG\r\n\x1a\n\x00clean binary payload\x00")
        hits = P.scan([term])
        check("tên file nhị phân vẫn bị chặn",
              len(hits) == 1 and hits[0].startswith("[DENYLISTED]-image.png"), hits)
        named_binary.unlink()

        # Post-commit audit must reuse the publisher scanner, without copying anything.
        src = base / "private" 
        src.mkdir()
        (src / "serve.py").write_text("# sentinel\n", encoding="utf-8")
        (src / "publish_denylist.txt").write_text("Needle\n", encoding="utf-8")
        untouched = repo / "untouched.txt"
        untouched.write_text("clean\n", encoding="utf-8")
        out = io.StringIO()
        try:
            with mock.patch.object(sys, "argv", [str(SCRIPT), "--src", str(src), "--scan-only"]), \
                    mock.patch.object(P, "app_lists", side_effect=AssertionError("scan-only copied files")), \
                    contextlib.redirect_stdout(out):
                P.main()
            scan_only_ok = "scan CLEAN" in out.getvalue()
        except (SystemExit, AssertionError) as exc:
            scan_only_ok = False
            out.write("%r" % (exc,))
        check("--scan-only dùng cùng scanner và không copy", scan_only_ok, out.getvalue().strip())
        check("--scan-only giữ nguyên working tree", untouched.read_text(encoding="utf-8") == "clean\n")
    finally:
        P.REPO = old_repo

print("\nTỔNG KẾT:", ("FAIL %d mục" % len(fails)) if fails else "ALL PASS")
raise SystemExit(1 if fails else 0)
