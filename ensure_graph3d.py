# -*- coding: utf-8 -*-
"""Điểm vào IDEMPOTENT cho KB Graph 3D — MỌI launcher muốn MỞ UI (Start-Graph3D.bat,
agent mở graph) gọi cái NÀY thay cho serve.py. Diệt tận gốc lỗi "nhiều server / zombie
phục vụ snapshot cũ":

  - Đã có server CÙNG version đang khỏe  -> dùng lại, chỉ mở trình duyệt.
  - Có server CŨ version / zombie giữ port -> supervisor giết & thay bằng bản mới.
  - Chưa có gì                             -> spawn supervisor NGẦM (nền), chờ tới khi khỏe.

Agent chỉ GHI hoạt động thì KHÔNG gọi cái này — dùng log_activity.py (offline) hoặc
GET /ping (khi server đang chạy). Tuyệt đối không agent nào tự chạy serve.py.
"""
import argparse
import os
import subprocess
import sys
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from activity_paths import source_version   # noqa: E402
import run_graph3d as sup                    # noqa: E402  (health/port_pid/kill_pid/flags)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8321)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    want = source_version(HERE)
    url = "http://127.0.0.1:%d" % args.port
    h = sup.health(args.port)

    # want=None = KHÔNG ĐỌC ĐƯỢC version (file bị khóa tạm — OneDrive), không phải version
    # lệch: server đang khỏe thì dùng lại, không được lấy đó làm cớ khởi động lại.
    if h and (want is None or h.get("version") == want):
        print("KB Graph 3D: dung lai server co san (pid=%s version=%s) %s"
              % (h.get("pid"), h.get("version"), url))
    else:
        if h:
            print("KB Graph 3D: server CU (version %s != %s) -> khoi dong lai"
                  % (h.get("version"), want))
        # Spawn supervisor NGẦM (sống độc lập với tiến trình ensure này).
        flags = sup.DETACHED | sup.NO_WINDOW
        subprocess.Popen(
            [sys.executable, os.path.join(HERE, "run_graph3d.py"), "--port", str(args.port)],
            cwd=HERE, creationflags=flags, close_fds=True,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ok = None
        for _ in range(40):                 # chờ tối đa ~10s
            ok = sup.health(args.port, 0.5)
            if ok and (not want or ok.get("version") == want):
                break
            time.sleep(0.25)
        if ok:
            print("KB Graph 3D: da khoi dong (pid=%s version=%s) %s"
                  % (ok.get("pid"), ok.get("version"), url))
        else:
            pid = sup.port_pid(args.port)
            if pid:
                # P2.2: supervisor không kill process lạ — báo rõ để người dùng tự xử
                # (supervisor chạy ngầm, output bị nuốt — ensure phải nói thay)
                print("KB Graph 3D: CANH BAO - port %d dang bi process KHAC giu (pid=%s)"
                      % (args.port, pid))
                print("  -> tat process do, hoac chay: python ensure_graph3d.py --port <port khac>")
            else:
                print("KB Graph 3D: CANH BAO - server chua bao khoe sau ~10s, kiem tra thu cong")

    if not args.no_open:
        webbrowser.open(url)


if __name__ == "__main__":
    main()
