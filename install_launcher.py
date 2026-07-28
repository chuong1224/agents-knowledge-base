# -*- coding: utf-8 -*-
"""Cài LỐI VÀO KB Graph 3D ở tầng hệ điều hành — shortcut Start Menu / Desktop (tuỳ chọn
phím tắt) chạy `pythonw ensure_graph3d.py --app`.

Vì sao có file này: cửa vào cũ (`Start-Graph3D.bat`) NẰM TRONG vault, nên muốn mở app
phải đi Obsidian → note → click link `file:///…` — và vì mỗi máy một ổ đĩa nên note phải
treo HAI link, người dùng phải tự chọn đúng link của máy mình. Đường dẫn vault là thuộc
tính của MÁY, không phải của note: dời nó vào shortcut thì bước "chọn link theo máy" biến
mất, và app mở được mà không cần Obsidian.

  python .graph3d/install_launcher.py                      # Start Menu + Desktop
  python .graph3d/install_launcher.py --hotkey "CTRL+ALT+G"
  python .graph3d/install_launcher.py --status
  python .graph3d/install_launcher.py --uninstall

Windows-only: tạo .lnk qua COM WScript.Shell gọi bằng PowerShell — không cần thư viện
ngoài (giữ luật "chạy local, không internet, không pip install" của app).

Shortcut LUÔN trỏ điểm vào idempotent `ensure_graph3d.py`, không bao giờ trỏ thẳng
server (luật: mọi launcher đi qua ensure) — test_launcher.py gác điều này.
"""
import argparse
import json
import math
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from activity_paths import local_data_dir   # noqa: E402

APP_NAME = "KB Graph 3D"
ENSURE = "ensure_graph3d.py"

# Truyền tham số cho PowerShell bằng BIẾN MÔI TRƯỜNG, không nội suy vào chuỗi lệnh:
# đường dẫn vault thường có dấu cách, gạch nối, có khi cả dấu nháy (thư mục OneDrive
# đồng bộ từ tổ chức là ca kinh điển) — mọi kiểu escape thủ công đều sẽ hỏng ở đâu đó.
_PS_WRITE = """
$ErrorActionPreference = 'Stop'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:G3D_LNK)
$s.TargetPath = $env:G3D_TARGET
$s.Arguments = $env:G3D_ARGS
$s.WorkingDirectory = $env:G3D_WORKDIR
$s.Description = $env:G3D_DESC
if ($env:G3D_ICON) { $s.IconLocation = $env:G3D_ICON }
if ($env:G3D_HOTKEY) { $s.Hotkey = $env:G3D_HOTKEY }
$s.Save()
"""

_PS_READ = """
$ErrorActionPreference = 'Stop'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:G3D_LNK)
@{ target = $s.TargetPath; args = $s.Arguments; workdir = $s.WorkingDirectory;
   icon = $s.IconLocation; hotkey = $s.Hotkey } | ConvertTo-Json -Compress
"""

_PS_FOLDERS = """
$ErrorActionPreference = 'Stop'
@{ desktop = [Environment]::GetFolderPath('Desktop')
   programs = [Environment]::GetFolderPath('Programs') } | ConvertTo-Json -Compress
"""


class LauncherError(Exception):
    pass


def _powershell(script, extra_env=None):
    env = dict(os.environ)
    env.update(extra_env or {})
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=30, env=env)
    except Exception as exc:                       # noqa: BLE001
        raise LauncherError("khong goi duoc PowerShell: %s" % exc)
    if r.returncode != 0:
        raise LauncherError((r.stderr or r.stdout or "PowerShell exit %d" % r.returncode).strip())
    return r.stdout.strip()


# ---------------------------------------------------------------- đường dẫn

def pythonw_exe(override=None):
    """Python để nhét vào shortcut. Hai điều kiện:

    1. Ưu tiên `pythonw.exe` — python KHÔNG cửa sổ console, nhờ nó click shortcut không
       loé lên một khung CMD đen rồi biến mất.
    2. TRÁNH python của VENV. Người cài rất hay đang đứng trong venv của một dự án khác
       (agent, tooling…); venv là thứ bị xoá/dời/tái tạo thường xuyên, shortcut trỏ vào
       đó là shortcut chết yểu — mà app chỉ dùng stdlib nên chẳng cần venv nào cả.
       Trong venv thì lùi về python GỐC sinh ra nó (sys.base_prefix).

    Chỉ định tay: --python <đường dẫn> hoặc env GRAPH3D_PYTHONW."""
    for cand in (override, os.environ.get("GRAPH3D_PYTHONW", "").strip()):
        if cand and os.path.isfile(cand):
            return cand
    roots = []
    in_venv = bool(getattr(sys, "base_prefix", sys.prefix) != sys.prefix)
    if in_venv:
        roots.append(sys.base_prefix)
    if sys.executable:
        roots.append(os.path.dirname(sys.executable))
    for root in roots:
        for name in ("pythonw.exe", "python.exe"):
            p = os.path.join(root, name)
            if os.path.isfile(p):
                return p
    return sys.executable or "pythonw.exe"


def icon_path():
    """Icon sinh tại chỗ vào thư mục dữ liệu local — KHÔNG commit file nhị phân vào
    vault/repo. Env GRAPH3D_ICON_DIR để test không đụng %LOCALAPPDATA% thật."""
    d = os.environ.get("GRAPH3D_ICON_DIR", "").strip() or local_data_dir()
    return os.path.join(os.path.normpath(d), "graph3d.ico")


def shell_folders():
    """Desktop + Start Menu\\Programs hỏi THẲNG Windows: OneDrive hay Known Folder
    Redirection dời Desktop đi chỗ khác thì %USERPROFILE%\\Desktop là đường CHẾT."""
    try:
        got = json.loads(_powershell(_PS_FOLDERS))
        out = {k: got.get(k) for k in ("desktop", "programs")}
        if all(out.values()):
            return out
    except Exception:                              # noqa: BLE001
        pass
    home = os.environ.get("USERPROFILE", os.path.expanduser("~"))
    appdata = os.environ.get("APPDATA", os.path.join(home, "AppData", "Roaming"))
    return {"desktop": os.path.join(home, "Desktop"),
            "programs": os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs")}


def shortcut_spec(port=8321, app_mode=True, name=APP_NAME, python=None):
    """Mô tả shortcut sẽ tạo — tách khỏi việc GHI để test soi được nội dung mà không
    phải đẻ file .lnk thật."""
    args = ['"%s"' % os.path.join(HERE, ENSURE)]
    if app_mode:
        args.append("--app")
    if port != 8321:
        args += ["--port", str(port)]
    return {"target": pythonw_exe(python),
            "args": " ".join(args),
            "workdir": HERE,
            "desc": "%s — cockpit vault (local, port %d)" % (name, port),
            "icon": icon_path()}


def shortcut_paths(name=APP_NAME, desktop=True, start_menu=True, dest_dir=None):
    """[(nhãn, đường dẫn .lnk)] theo lựa chọn. dest_dir = ghi đè cả hai (test / người
    dùng muốn tự đặt chỗ)."""
    if dest_dir:
        return [("thu muc chi dinh", os.path.join(os.path.normpath(dest_dir), name + ".lnk"))]
    f = shell_folders()
    out = []
    if start_menu:
        out.append(("Start Menu", os.path.join(f["programs"], name + ".lnk")))
    if desktop:
        out.append(("Desktop", os.path.join(f["desktop"], name + ".lnk")))
    return out


# ---------------------------------------------------------------- .lnk

def write_shortcut(path, spec, hotkey=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _powershell(_PS_WRITE, {
        "G3D_LNK": path, "G3D_TARGET": spec["target"], "G3D_ARGS": spec["args"],
        "G3D_WORKDIR": spec["workdir"], "G3D_DESC": spec["desc"],
        "G3D_ICON": spec.get("icon") if os.path.isfile(spec.get("icon") or "") else "",
        "G3D_HOTKEY": hotkey or ""})
    return path


def read_shortcut(path):
    return json.loads(_powershell(_PS_READ, {"G3D_LNK": path}))


# ---------------------------------------------------------------- icon

# Node + link của icon: một mảnh graph neon — cùng bảng màu synthwave với app.
_NODES = ((0.00, -0.10, (0.22, 0.95, 1.00), 0.19),
          (-0.45, 0.30, (1.00, 0.31, 0.85), 0.12),
          (0.44, 0.26, (1.00, 0.84, 0.35), 0.11),
          (0.26, -0.55, (0.62, 0.45, 1.00), 0.10))


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _lit(base, color, k):
    """Chồng một lớp phát sáng theo kiểu SCREEN chứ không cộng thẳng: cộng thì chỗ
    node giao link bão hoà thành khối TRẮNG (nhìn rõ nhất ở 16/32px — icon mất hết
    màu), screen thì càng sáng càng giữ đúng sắc neon."""
    return tuple(c + col * k - c * col * k for c, col in zip(base, color))


def _pixel(x, y):
    """Màu (r,g,b,a) 0..1 tại điểm (x,y) trong hình vuông [-1,1]."""
    d = math.hypot(x, y)
    if d > 1.0:
        return (0.0, 0.0, 0.0, 0.0)
    a = 1.0 if d < 0.965 else max(0.0, (1.0 - d) / 0.035)
    t = min(1.0, d) ** 2
    c = (0.09 * (1 - t) + 0.02 * t, 0.05 * (1 - t) + 0.01 * t, 0.18 * (1 - t) + 0.05 * t)
    c = _lit(c, (0.16, 0.85, 1.0), math.exp(-((d - 0.93) / 0.05) ** 2))   # viền neon
    hx, hy = _NODES[0][0], _NODES[0][1]
    for nx, ny, _c, _rad in _NODES[1:]:            # link toả từ node trung tâm
        c = _lit(c, (0.55, 0.36, 1.0),
                 0.85 * math.exp(-(_seg_dist(x, y, hx, hy, nx, ny) / 0.045) ** 2))
    for nx, ny, col, rad in _NODES:
        dd = math.hypot(x - nx, y - ny)
        c = _lit(c, col, 1.0 if dd < rad * 0.5 else math.exp(-((dd - rad * 0.5) / (rad * 0.8)) ** 2))
    return (min(1.0, c[0]), min(1.0, c[1]), min(1.0, c[2]), a)


def _bmp(size, ss=3):
    """Một ảnh trong .ico: BITMAPINFOHEADER + pixel BGRA bottom-up + AND mask rỗng.
    Dùng BMP chứ không PNG-in-ICO để không phụ thuộc Windows đời nào; khử răng cưa
    bằng supersample ss×ss."""
    rows = []
    n = ss * ss
    for py in range(size - 1, -1, -1):             # bottom-up
        row = bytearray()
        for px in range(size):
            sr = sg = sb = sa = 0.0
            for j in range(ss):
                y = ((py + (j + 0.5) / ss) / size) * 2 - 1
                for i in range(ss):
                    x = ((px + (i + 0.5) / ss) / size) * 2 - 1
                    r, g, b, a = _pixel(x, y)
                    sr, sg, sb, sa = sr + r * a, sg + g * a, sb + b * a, sa + a
            al = sa / n
            # premultiplied trung bình -> tách lại, tránh viền đen quanh mép mềm
            k = (1.0 / sa) if sa > 1e-6 else 0.0
            row += bytes((int(sb * k * 255 + 0.5), int(sg * k * 255 + 0.5),
                          int(sr * k * 255 + 0.5), int(al * 255 + 0.5)))
        rows.append(bytes(row))
    pix = b"".join(rows)
    mask = b"\x00" * (((size + 31) // 32) * 4 * size)
    hdr = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                      len(pix) + len(mask), 0, 0, 0, 0)
    return hdr + pix + mask


def write_icon(path, sizes=(16, 32, 48, 64, 128)):
    imgs = [(s, _bmp(s)) for s in sizes]
    entries, data = b"", b""
    offset = 6 + 16 * len(imgs)
    for s, blob in imgs:
        dim = 0 if s >= 256 else s
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
        data += blob
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(imgs)) + entries + data)
    return path


# ---------------------------------------------------------------- lệnh

def install(name=APP_NAME, desktop=True, start_menu=True, hotkey=None, port=8321,
            app_mode=True, dest_dir=None, python=None):
    paths = shortcut_paths(name, desktop, start_menu, dest_dir)
    if not paths:
        raise LauncherError("khong chon dich nao (--no-desktop lan --no-start-menu?)")
    icon = icon_path()
    try:
        write_icon(icon)
    except Exception as exc:                       # noqa: BLE001
        print("  ! khong tao duoc icon (%s) — shortcut dung icon mac dinh" % exc)
    spec = shortcut_spec(port, app_mode, name, python)
    made = []
    for label, p in paths:
        # Hotkey chỉ gán cho MỘT shortcut: hai .lnk cùng hotkey thì Windows chọn bừa.
        write_shortcut(p, spec, hotkey if (hotkey and not made) else None)
        made.append((label, p))
    return {"paths": made, "spec": spec, "icon": icon if os.path.isfile(icon) else None,
            "hotkey": hotkey}


def uninstall(name=APP_NAME, dest_dir=None):
    removed, kept = [], []
    for _label, p in shortcut_paths(name, True, True, dest_dir):
        if not os.path.isfile(p):
            continue
        # Chỉ xoá shortcut CỦA MÌNH: trùng tên nhưng trỏ chỗ khác thì để yên.
        try:
            info = read_shortcut(p)
            mine = ENSURE in (info.get("args") or "")
        except Exception:                          # noqa: BLE001
            mine = False
        if mine:
            os.remove(p)
            removed.append(p)
        else:
            kept.append(p)
    icon = icon_path()
    if os.path.isfile(icon):
        try:
            os.remove(icon)
        except OSError:
            pass
    return {"removed": removed, "kept": kept}


def status(name=APP_NAME, dest_dir=None):
    out = []
    for label, p in shortcut_paths(name, True, True, dest_dir):
        if not os.path.isfile(p):
            out.append({"label": label, "path": p, "exists": False})
            continue
        try:
            info = read_shortcut(p)
        except Exception as exc:                   # noqa: BLE001
            info = {"error": str(exc)}
        info.update({"label": label, "path": p, "exists": True})
        out.append(info)
    return out


def main():
    ap = argparse.ArgumentParser(description="Cai shortcut mo KB Graph 3D (Windows)")
    ap.add_argument("--name", default=APP_NAME, help="ten shortcut (mac dinh: %s)" % APP_NAME)
    ap.add_argument("--port", type=int, default=8321)
    ap.add_argument("--hotkey", default=None,
                    help='phim tat, vd "CTRL+ALT+G" (chi gan cho shortcut dau tien)')
    ap.add_argument("--no-desktop", action="store_true")
    ap.add_argument("--no-start-menu", action="store_true")
    ap.add_argument("--no-app", action="store_true",
                    help="mo bang tab trinh duyet thuong thay vi cua so app rieng")
    ap.add_argument("--dir", dest="dest_dir", default=None,
                    help="tao .lnk vao thu muc chi dinh thay vi Desktop/Start Menu")
    ap.add_argument("--python", default=None,
                    help="chi dinh python chay app (mac dinh: pythonw ngoai venv)")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--status", action="store_true")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                              # noqa: BLE001
        pass

    if os.name != "nt":
        print("install_launcher.py: chi chay tren Windows (shortcut .lnk).")
        return 2

    try:
        if args.status:
            for row in status(args.name, args.dest_dir):
                if not row["exists"]:
                    print("  - %s: CHUA CAI (%s)" % (row["label"], row["path"]))
                else:
                    print("  + %s: %s" % (row["label"], row["path"]))
                    print("      %s %s" % (row.get("target"), row.get("args")))
                    if row.get("hotkey"):
                        print("      phim tat: %s" % row["hotkey"])
            return 0
        if args.uninstall:
            res = uninstall(args.name, args.dest_dir)
            for p in res["removed"]:
                print("  - da xoa %s" % p)
            for p in res["kept"]:
                print("  . giu nguyen %s (khong phai shortcut cua KB Graph 3D)" % p)
            if not res["removed"] and not res["kept"]:
                print("  (khong co gi de go)")
            return 0
        res = install(args.name, not args.no_desktop, not args.no_start_menu,
                      args.hotkey, args.port, not args.no_app, args.dest_dir, args.python)
    except LauncherError as exc:
        print("install_launcher.py: %s" % exc)
        return 2

    print("KB Graph 3D: da tao shortcut")
    for label, p in res["paths"]:
        print("  + %s: %s" % (label, p))
    print("  chay: %s %s" % (res["spec"]["target"], res["spec"]["args"]))
    low = res["spec"]["target"].lower()
    if os.sep + "venv" + os.sep in low or os.sep + "uv" + os.sep in low:
        print("  ! python nay do cong cu khac quan ly (venv/uv) — go no la shortcut chet.")
        print("    Muon chac: --python \"<duong dan pythonw.exe cai chuan>\"")
    if res["hotkey"]:
        print("  phim tat: %s (Windows chi nhan hotkey cua .lnk o Desktop/Start Menu)" % res["hotkey"])
    print("  Ghim Taskbar: chuot phai vao shortcut -> Pin to taskbar")
    print("  Go bo: python install_launcher.py --uninstall")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
