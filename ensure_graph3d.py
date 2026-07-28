# -*- coding: utf-8 -*-
"""Điểm vào IDEMPOTENT cho KB Graph 3D — MỌI launcher muốn MỞ UI (Start-Graph3D.bat,
agent mở graph) gọi cái NÀY thay cho serve.py. Diệt tận gốc lỗi "nhiều server / zombie
phục vụ snapshot cũ":

  - Đã có server CÙNG version đang khỏe  -> dùng lại, chỉ mở trình duyệt.
  - Có server CŨ version / zombie giữ port -> supervisor giết & thay bằng bản mới.
  - Chưa có gì                             -> spawn supervisor NGẦM (nền), chờ tới khi khỏe.

Agent chỉ GHI hoạt động thì KHÔNG gọi cái này — dùng log_activity.py (offline) hoặc
GET /ping (khi server đang chạy). Tuyệt đối không agent nào tự chạy serve.py.

Hai cờ onboarding cho người CHƯA có vault (W13 — logic ở onboarding.py):
  --demo              mở cockpit trên vault demo bundled (port riêng 8322, không đụng
                      server đang chạy trên vault thật)
  --init-starter DIR  dựng vault đầu tiên tại DIR từ starter-vault/ rồi thoát

Cờ --app (W58): mở bằng CỬA SỔ APP của Edge/Chrome (không thanh địa chỉ, không lẫn
giữa 20 tab khác) — shortcut do install_launcher.py tạo chạy đúng dòng này.
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from activity_paths import local_data_dir, source_version   # noqa: E402
import onboarding as onb                     # noqa: E402  (W13 — demo / starter vault)
import run_graph3d as sup                    # noqa: E402  (health/port_pid/kill_pid/flags)


def bind_console():
    """pythonw.exe — shortcut dùng nó để click không loé cửa sổ CMD đen — KHÔNG có
    console: `sys.stdout is None`, và print() đầu tiên nổ AttributeError giữa chừng,
    lặng thinh. Trói stdout vào file log: vừa cứu print, vừa cho người dùng CHỖ XEM
    khi app không chịu mở (port bị chiếm, python hỏng…). Trả file để caller đóng."""
    if sys.stdout is not None:
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:                    # noqa: BLE001
            pass
        return None
    path = os.path.join(local_data_dir(), "launcher.log")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        f = open(path, "a", encoding="utf-8", errors="replace", buffering=1)
    except OSError:
        f = open(os.devnull, "w")
    f.write("\n=== %s ===\n" % time.strftime("%Y-%m-%d %H:%M:%S"))
    sys.stdout = sys.stderr = f
    return f


def browser_exe():
    """Edge/Chrome để mở chế độ app. KHÔNG dùng --user-data-dir riêng: app lưu mọi
    tuỳ chọn trong localStorage của origin 127.0.0.1:8321, profile riêng = mất sạch
    ghim/lịch sử/bộ lọc đã chọn."""
    cands = []
    for var in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if base:
            cands.append(os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
            cands.append(os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"))
    for p in cands:
        if os.path.isfile(p):
            return p
    for name in ("msedge", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


def open_app_window(url):
    """Cửa sổ app riêng. False = không mở được -> caller lùi về trình duyệt mặc định."""
    exe = browser_exe()
    if not exe:
        return False
    try:
        subprocess.Popen([exe, "--app=" + url], close_fds=True,
                         creationflags=sup.DETACHED | sup.NO_WINDOW)
        return True
    except Exception as exc:                 # noqa: BLE001
        print("KB Graph 3D: mo cua so app that bai (%s)" % exc)
        return False


def open_ui(url, app_mode):
    if app_mode:
        if open_app_window(url):
            return
        print("KB Graph 3D: khong thay Edge/Chrome -> mo trinh duyet mac dinh")
    webbrowser.open(url)


def init_starter(target):
    """--init-starter: chép starter-vault/ vào DIR. In từng file cho người dùng thấy
    mình vừa nhận được cái gì, rồi chỉ luôn bước kế (mở cockpit trên vault mới)."""
    try:
        res = onb.install_starter(target)
    except onb.OnboardingError as exc:
        print("KB Graph 3D: %s" % exc)
        return 2
    print("KB Graph 3D: da tao vault dau tien tai %s" % res["target"])
    for rel in res["created"]:
        print("  + " + rel)
    for rel in res["skipped"]:
        print("  . %s (da co san, giu nguyen)" % rel)
    print("Buoc ke: chep .graph3d vao vault do roi chay")
    print("  python \"%s\"" % os.path.join(res["target"], ".graph3d", "ensure_graph3d.py"))
    return 0


def run_demo(port, open_browser, app_mode=False):
    """--demo: mirror app sang demo/vault/.graph3d rồi gọi LẠI chính ensure ở bản sao đó.

    Vì "vault = thư mục cha của .graph3d", chỉ cần đặt bản sao app cạnh vault demo là
    server phục vụ đúng vault demo — KHÔNG phải kéo thêm đường truyền --vault xuyên qua
    supervisor/serve (việc đó là mục riêng trong roadmap repo public).
    """
    demo = onb.demo_vault_dir()
    if not os.path.isdir(demo):
        print("KB Graph 3D: ban cai nay khong kem vault demo (%s)" % demo)
        print("  -> demo di kem repo public; hoac tro toi vault khac bang GRAPH3D_DEMO_DIR")
        return 2
    app = os.path.join(demo, ".graph3d")
    try:
        res = onb.mirror_app(app, HERE)
    except onb.OnboardingError as exc:
        print("KB Graph 3D: %s" % exc)
        return 2
    # flush: tiến trình con in thẳng ra console, không flush thì dòng này rơi SAU nó
    print("KB Graph 3D: vault demo %s (%d note) — app dong bo %d file"
          % (demo, onb.count_notes(demo), res["copied"]), flush=True)
    cmd = [sys.executable, os.path.join(app, "ensure_graph3d.py"), "--port", str(port)]
    if not open_browser:
        cmd.append("--no-open")
    if app_mode:
        cmd.append("--app")
    # env cách ly: log/journal/heat của demo KHÔNG rơi vào thư mục demo (tên file mang
    # tên máy — đã 2 lần suýt lọt lên repo public), và feed demo không trộn vault thật.
    return subprocess.call(cmd, cwd=app, env=onb.demo_env())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=None,
                    help="mac dinh 8321, rieng --demo mac dinh %d" % onb.DEMO_PORT)
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--demo", action="store_true",
                    help="mo cockpit tren vault demo bundled (khong can vault cua ban)")
    ap.add_argument("--init-starter", metavar="DIR",
                    help="tao vault dau tien tai DIR tu starter-vault/ roi thoat")
    ap.add_argument("--app", action="store_true",
                    help="mo bang cua so app cua Edge/Chrome thay vi tab trinh duyet")
    args = ap.parse_args()
    log = bind_console()

    if args.init_starter:
        sys.exit(init_starter(args.init_starter))
    if args.demo:
        sys.exit(run_demo(args.port or onb.DEMO_PORT, not args.no_open, args.app))
    args.port = args.port or 8321

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
        open_ui(url, args.app)
    if log is not None:
        log.close()


if __name__ == "__main__":
    main()
