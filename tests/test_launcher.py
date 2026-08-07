# -*- coding: utf-8 -*-
"""Test loi vao he dieu hanh (W58/W61) — install_launcher.py + ensure --app:

  - shortcut_spec: chay pythonw(python).exe voi ensure_graph3d.py, co --app, KHONG
    bao gio serve.py (luat "moi launcher goi ensure"); --port chi hien khi khac 8321
  - icon .ico sinh tai cho: header ICONDIR dung, du entry, offset/size nam trong file
  - install/read: .lnk tao that (COM WScript.Shell), doc lai ra dung target/args/hotkey
    — day la cho duy nhat bat duoc loi escape duong dan co dau cach + gach noi
  - uninstall: xoa .lnk cua minh, KHONG dung vao .lnk trung ten cua nguoi khac
  - ensure.browser_exe: tra None hoac duong dan CO THAT (khong doan bua)
  - ensure.bind_console: pythonw co sys.stdout None -> print() phai chay duoc va roi
    vao launcher.log (bug that neu quen: shortcut chay im lang, khong dau vet)
  - pythonw: uu tien ban cai trong Registry truoc base_prefix; bo entry stale; canh
    bao ca runtime generation-* do tooling quan ly chu khong chi venv/uv

Windows-only (shortcut .lnk): may khac -> in SKIP va PASS, de selfcheck ban public
tren Linux khong do oan.
"""
import os, re, struct, sys
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # console cp1252
except Exception:
    pass

from _scratch import SCRATCH, G3D
os.environ.setdefault("GRAPH3D_ACTIVITY_FILE", os.path.join(SCRATCH, "act_launcher.jsonl"))
ROOT = os.path.join(SCRATCH, "launcher")
# Icon + log launcher phai roi vao SCRATCH, khong dung %LOCALAPPDATA% that cua may.
os.environ["GRAPH3D_ICON_DIR"] = os.path.join(ROOT, "icon")
os.environ["LOCALAPPDATA"] = os.path.join(ROOT, "localappdata")
sys.path.insert(0, G3D)

import ensure_graph3d as ENS
import install_launcher as IL

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


class FakeWinreg:
    """Registry toi thieu de test thu tu chon ma khong phu thuoc Python cua may."""
    HKEY_CURRENT_USER = "HKCU"
    HKEY_LOCAL_MACHINE = "HKLM"
    KEY_READ = 1
    KEY_WOW64_64KEY = 256
    KEY_WOW64_32KEY = 512

    def __init__(self, entries):
        self.entries = entries

    def OpenKey(self, hive, path, _reserved=0, _access=0):
        base = r"SOFTWARE\Python\PythonCore"
        if path == base and self.entries.get(hive):
            return (hive, "root")
        suffix = r"\InstallPath"
        if path.startswith(base + "\\") and path.endswith(suffix):
            tag = path[len(base) + 1:-len(suffix)]
            if tag in self.entries.get(hive, {}):
                return (hive, tag)
        raise OSError("missing key")

    def EnumKey(self, key, index):
        tags = sorted(self.entries.get(key[0], {}))
        if index >= len(tags):
            raise OSError("end")
        return tags[index]

    def QueryValueEx(self, key, name):
        if name != "WindowedExecutablePath":
            raise OSError("missing value")
        return self.entries[key[0]][key[1]], 1

    @staticmethod
    def CloseKey(_key):
        pass


def test_registry_pythonw():
    store_real = (r"C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_"
                  r"3.13.3824.0_x64__qbz5n2kfra8p0\pythonw3.13.exe")
    store_alias = os.path.join(
        r"C:\Users\Tester\AppData\Local\Microsoft\WindowsApps",
        r"PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\pythonw.exe")
    got = IL.store_pythonw_alias(
        store_real,
        isfile=lambda p: os.path.normcase(p) == os.path.normcase(store_alias),
        localappdata=r"C:\Users\Tester\AppData\Local")
    check("Store Python dung app-exec alias on dinh thay duong co so build", got == store_alias, got)

    fake = FakeWinreg({
        "HKCU": {"3.12": r"C:\Python312\pythonw.exe",
                 "3.13": r"C:\stale\pythonw.exe"},
        "HKLM": {"3.14": r"C:\Python314\pythonw.exe"},
    })
    got = IL.registered_pythonw_exe(
        fake, isfile=lambda p: "stale" not in p.lower())
    check("registry bo entry stale + uu tien HKCU truoc HKLM", got == r"C:\Python312\pythonw.exe", got)

    machine_only = FakeWinreg({"HKCU": {}, "HKLM": {
        "3.11": r"C:\Python311\pythonw.exe",
        "3.13": r"C:\Python313\pythonw.exe"}})
    got = IL.registered_pythonw_exe(machine_only, isfile=lambda _p: True)
    check("registry chon version moi nhat trong cung hive", got == r"C:\Python313\pythonw.exe", got)

    old = IL.registered_pythonw_exe
    forced_registry = os.path.abspath(__file__)
    try:
        IL.registered_pythonw_exe = lambda: forced_registry
        check("pythonw_exe uu tien registry truoc base_prefix",
              IL.pythonw_exe() == forced_registry, IL.pythonw_exe())
    finally:
        IL.registered_pythonw_exe = old

    check("canh bao runtime generation do tooling quan ly",
          IL.managed_python_path(r"C:\Tooling\runtime\python\generation-42\pythonw.exe"))
    check("canh bao venv van con",
          IL.managed_python_path(r"C:\tool\venv\Scripts\pythonw.exe"))
    check("khong canh bao Python cai chuan",
          not IL.managed_python_path(r"C:\Program Files\Python313\pythonw.exe"))

    live = IL.registered_pythonw_exe()
    check("registry that: None hoac file con ton tai", live is None or os.path.isfile(live), live)


def test_spec():
    spec = IL.shortcut_spec()
    exe = os.path.basename(spec["target"]).lower()
    check("spec chay python(w)[version].exe",
          re.match(r"^pythonw?(?:\d+(?:\.\d+)*)?\.exe$", exe) is not None,
          spec["target"])
    check("spec goi ensure_graph3d.py", "ensure_graph3d.py" in spec["args"], spec["args"])
    check("spec KHONG goi serve.py", "serve.py" not in spec["args"], spec["args"])
    check("spec co --app", "--app" in spec["args"], spec["args"])
    check("spec khong kem --port khi cong mac dinh", "--port" not in spec["args"], spec["args"])
    check("spec workdir la thu muc app", os.path.isfile(os.path.join(spec["workdir"], "ensure_graph3d.py")))
    alt = IL.shortcut_spec(port=8399)
    check("spec cong khac co --port 8399", "--port 8399" in alt["args"], alt["args"])
    plain = IL.shortcut_spec(app_mode=False)
    check("spec --no-app bo co --app", "--app" not in plain["args"], plain["args"])

    # Python cua VENV bi xoa/doi thuong xuyen -> shortcut tro vao do la shortcut chet
    # yeu. Chi kiem duoc khi test dang CHAY trong venv (may CI/khong venv thi bo qua).
    if getattr(sys, "base_prefix", sys.prefix) != sys.prefix:
        check("spec tranh python cua venv dang chay",
              not os.path.normcase(spec["target"]).startswith(os.path.normcase(sys.prefix)),
              spec["target"])
    else:
        print("SKIP spec tranh venv — dang chay bang python he thong")
    forced = IL.shortcut_spec(python=os.path.abspath(__file__))   # file co that = duoc nhan
    check("spec --python chi dinh tay duoc ton trong",
          forced["target"] == os.path.abspath(__file__), forced["target"])
    check("spec --python tro file KHONG co that thi bo qua",
          IL.shortcut_spec(python=os.path.join(ROOT, "khong-co.exe"))["target"] == spec["target"])


def test_icon():
    path = IL.write_icon(os.path.join(ROOT, "icon"), sizes=(16, 32))
    with open(path, "rb") as f:
        raw = f.read()
    rsv, typ, cnt = struct.unpack("<HHH", raw[:6])
    check("ico header 0/1/n", (rsv, typ) == (0, 1) and cnt == 2, (rsv, typ, cnt))
    ok, dims = True, []
    for i in range(cnt):
        w, h, _c, _r, _p, _bpp, size, off = struct.unpack("<BBBBHHII", raw[6 + 16 * i:22 + 16 * i])
        dims.append(w)
        if off + size > len(raw) or size <= 0 or w != h:
            ok = False
        # BITMAPINFOHEADER: height = 2 * width (anh XOR + mask AND)
        hdr = struct.unpack("<Iii", raw[off:off + 12])
        if hdr[0] != 40 or hdr[1] != w or hdr[2] != 2 * w:
            ok = False
    check("ico moi anh: entry tro dung, BITMAPINFOHEADER hop le", ok, dims)
    check("ico dung kich thuoc da yeu cau", dims == [16, 32], dims)
    check("ico icon_dir theo GRAPH3D_ICON_DIR",
          os.path.normcase(IL.icon_dir()) == os.path.normcase(os.path.join(ROOT, "icon")),
          IL.icon_dir())

    # Cache icon cua Explorer bam theo DUONG DAN -> ten phai mang hash noi dung, khong
    # duoc co dinh (bug "icon to giay trang" 28/07: ghi de cung ten = van ve ban cu).
    d = os.path.join(ROOT, "icon")
    check("ten icon mang hash noi dung", re.match(r"graph3d-[0-9a-f]{8}\.ico$",
                                                  os.path.basename(path)) is not None,
          os.path.basename(path))
    check("cung noi dung -> cung ten (khong de rac moi lan cai)",
          IL.write_icon(d, sizes=(16, 32)) == path)
    other = IL.write_icon(d, sizes=(16, 32, 48))
    check("khac noi dung -> khac ten", other != path, (path, other))
    check("ban cu bi don, chi con dung 1 icon", IL.icon_files(d) == [other], IL.icon_files(d))
    stale = os.path.join(d, "graph3d.ico")         # ten co dinh cua v1.48.0/.1
    open(stale, "wb").write(b"x")
    IL.write_icon(d, sizes=(16, 32, 48))
    check("icon ten co dinh cua ban cu cung bi don", not os.path.isfile(stale))


def test_shortcut_roundtrip():
    dest = os.path.join(ROOT, "lnk")
    res = IL.install(name="KB Graph 3D TEST", hotkey="CTRL+ALT+F9", dest_dir=dest)
    paths = [p for _l, p in res["paths"]]
    check("install tao dung 1 .lnk trong --dir", len(paths) == 1 and os.path.isfile(paths[0]), paths)
    info = IL.read_shortcut(paths[0])
    check("lnk tro dung file icon vua sinh (khong phai ten co dinh)",
          res["icon"] and os.path.isfile(res["icon"])
          and os.path.basename(res["icon"]) in (info.get("icon") or ""),
          (res["icon"], info.get("icon")))
    check("lnk doc lai: target khop", os.path.normcase(info["target"]) ==
          os.path.normcase(res["spec"]["target"]), info)
    check("lnk doc lai: args giu nguyen duong dan co dau cach",
          "ensure_graph3d.py" in info["args"] and G3D.split(os.sep)[-1] in info["args"], info["args"])
    check("lnk doc lai: hotkey da gan", (info.get("hotkey") or "").upper().endswith("F9"), info)
    check("lnk doc lai: workdir la thu muc app",
          os.path.normcase(info["workdir"].rstrip("\\")) == os.path.normcase(G3D), info["workdir"])

    # .lnk trung ten NHUNG cua nguoi khac -> uninstall phai giu lai
    other = os.path.join(dest, "KB Graph 3D TEST.lnk")
    IL.write_shortcut(other, {"target": os.path.join(os.environ.get("WINDIR", r"C:\Windows"),
                                                     "system32", "notepad.exe"),
                              "args": "", "workdir": ROOT, "desc": "khong phai cua app", "icon": ""})
    res2 = IL.uninstall(name="KB Graph 3D TEST", dest_dir=dest)
    check("uninstall KHONG xoa .lnk cua nguoi khac",
          res2["removed"] == [] and res2["kept"] == [other], res2)

    IL.install(name="KB Graph 3D TEST", dest_dir=dest)
    res3 = IL.uninstall(name="KB Graph 3D TEST", dest_dir=dest)
    check("uninstall xoa .lnk cua minh",
          res3["removed"] == [other] and not os.path.isfile(other), res3)


def test_favicon():
    # Cua so app (--app) lay icon tu FAVICON cua trang. Chromium BO QUA favicon dang
    # data: URI -> cua so roi ve icon Edge/Chrome (bug bao 28/07). Phai la file that
    # do server sinh, va dung CHUNG nguon ve voi icon shortcut.
    idx = open(os.path.join(G3D, "index.html"), encoding="utf-8").read()
    link = re.search(r"<link[^>]+rel=[\"']icon[\"'][^>]*>", idx)
    check("index.html co the <link rel=icon>", link is not None)
    if link:
        check("favicon KHONG dung data: URI", "data:" not in link.group(0), link.group(0)[:90])
        check("favicon tro /favicon.ico", "/favicon.ico" in link.group(0), link.group(0)[:90])
    sv = open(os.path.join(G3D, "serve.py"), encoding="utf-8").read()
    check("serve.py phuc vu /favicon.ico bang icon that",
          "def favicon_bytes" in sv and "install_launcher.icon_bytes" in sv
          and "favicon_bytes()" in sv)
    raw = IL.icon_bytes((16, 32))
    check("icon_bytes tra ICO hop le", raw[:4] == b"\x00\x00\x01\x00" and len(raw) > 100, raw[:8])
    import activity_paths as AP
    check("install_launcher nam trong _VERSION_FILES (doi icon -> server restart)",
          "install_launcher.py" in AP._VERSION_FILES, AP._VERSION_FILES)


def test_refresh_shell():
    # Icon cache bam theo DUONG DAN .ico: ghi de cung ten = Explorer van ve ban cu
    # (icon "to giay trang" bao 28/07) -> install PHAI bao shell vut cache.
    check("refresh_shell chay duoc, khong nem", IL.refresh_shell() in (True, False))
    src = open(os.path.join(G3D, "install_launcher.py"), encoding="utf-8").read()
    body = src[src.index("def install("):src.index("def uninstall(")]
    check("install() co goi refresh_shell", "refresh_shell()" in body)


def test_ensure_app():
    exe = ENS.browser_exe()
    check("browser_exe: None hoac file CO THAT", exe is None or os.path.isfile(exe), exe)

    # pythonw: sys.stdout is None -> print() nổ AttributeError nếu không trói vào log
    real = sys.stdout
    sys.stdout = None
    try:
        f = ENS.bind_console()
        print("thu ghi mot dong")
    finally:
        opened = sys.stdout
        sys.stdout = real
        if f is not None:
            f.close()
    log = os.path.join(os.environ["LOCALAPPDATA"], "claude-graph3d", "launcher.log")
    check("bind_console tra file khi khong co console", opened is f and f is not None)
    check("bind_console ghi vao launcher.log", os.path.isfile(log), log)
    if os.path.isfile(log):
        with open(log, encoding="utf-8") as fh:
            txt = fh.read()
        check("launcher.log co dong vua in", "thu ghi mot dong" in txt, txt[-120:])


if __name__ == "__main__":
    if os.name != "nt":
        print("SKIP test_launcher — shortcut .lnk chi co tren Windows")
        sys.exit(0)
    os.makedirs(ROOT, exist_ok=True)
    test_registry_pythonw()
    test_spec()
    test_icon()
    test_shortcut_roundtrip()
    test_favicon()
    test_refresh_shell()
    test_ensure_app()
    print("\nTONG KET test_launcher: %s" % (("FAIL %d: %s" % (len(fails), ", ".join(fails)))
                                            if fails else "ALL PASS"))
    sys.exit(1 if fails else 0)
