# -*- coding: utf-8 -*-
"""Tiện ích dùng chung cho KB Graph 3D — đường dẫn log + version code.

serve.py / log_activity.py / ensure_graph3d.py / run_graph3d.py đều import.
"""
import glob
import hashlib
import json
import os
import socket
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_jsonl(text):
    """Các dòng JSONL → list dict (dòng hỏng/dở bỏ qua). Bộ parse DUY NHẤT dùng chung
    serve.py + log_activity.py — trước đây 3 bản chép tay lệch nhau dần (review P4.1)."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def local_data_dir():
    """Thư mục dữ liệu local của app — NGOÀI OneDrive (%LOCALAPPDATA%): log realtime,
    icon + log của launcher. Thứ gì ghi liên tục hoặc mang tính máy-này thì để đây,
    thứ gì cần máy KHÁC đọc được thì vào vault (journal/heat per-máy)."""
    base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    return os.path.join(base, "claude-graph3d")


def activity_log_path():
    env = os.environ.get("GRAPH3D_ACTIVITY_FILE", "").strip()
    if env:
        return os.path.normpath(env)
    return os.path.join(local_data_dir(), "activity.jsonl")


# Claude Desktop (Cowork) là app đóng gói MSIX: Windows ẢO HÓA mọi ghi vào %LOCALAPPDATA%
# sang LocalCache riêng của package. Hook chạy DƯỚI Cowork ghi activity.jsonl vào đó, còn
# serve.py chạy bằng python thường (NGOÀI sandbox) lại đọc đường "thật" (trống) → graph
# không thấy hoạt động Cowork. READER phải soi thêm đường LocalCache này — QUÉT GLOB
# Packages/Claude_*/ thay vì hardcode publisher hash: Anthropic đổi tên gói, lớp vá
# vẫn sống (review P4.2). Glob quét folder Packages hơi tốn nên cache 30s.
_cand_cache = {"ts": 0.0, "paths": None}


def activity_log_candidates():
    """Mọi file activity.jsonl có thể tồn tại — để READER (serve.py) không bỏ sót nguồn:
      1) đường chuẩn %LOCALAPPDATA%/claude-graph3d (Claude Code CLI ghi thẳng)
      2) LocalCache của MỌI package Claude_* (Cowork/Claude Desktop ghi qua ảo hóa MSIX)
    Nếu đã đặt GRAPH3D_ACTIVITY_FILE (override tường minh) thì CHỈ dùng đúng đường đó."""
    env = os.environ.get("GRAPH3D_ACTIVITY_FILE", "").strip()
    if env:
        return [os.path.normpath(env)]
    now = time.time()
    if _cand_cache["paths"] is not None and now - _cand_cache["ts"] < 30:
        return list(_cand_cache["paths"])
    base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    cands = [os.path.join(local_data_dir(), "activity.jsonl")]
    cands.extend(sorted(glob.glob(os.path.join(
        base, "Packages", "Claude_*", "LocalCache", "Local",
        "claude-graph3d", "activity.jsonl"))))
    seen, out = set(), []
    for p in cands:
        n = os.path.normcase(os.path.normpath(p))
        if n not in seen:
            seen.add(n)
            out.append(p)
    _cand_cache["ts"], _cand_cache["paths"] = now, out
    return list(out)


def active_activity_log_path():
    """File activity 'đang sống' = tồn tại + mtime MỚI NHẤT trong các ứng viên (tự bám
    nguồn đang ghi: Cowork qua LocalCache hoặc CLI qua đường chuẩn). Dùng cho realtime
    /activity để GIỮ nguyên mô hình byte-cursor trên MỘT file. Fallback: đường chuẩn."""
    best, best_m = None, -1.0
    for p in activity_log_candidates():
        try:
            m = os.path.getmtime(p)
        except OSError:
            continue
        if m > best_m:
            best, best_m = p, m
    return best or activity_log_path()


def host_name():
    return (os.environ.get("COMPUTERNAME") or socket.gethostname() or "unknown").strip() or "unknown"


def cumulative_heat_dir():
    """Thư mục chứa store heat tích luỹ. Env GRAPH3D_HEAT_DIR là override cho TEST và
    cho server DEMO (W13) — file runtime mang TÊN MÁY không được rơi vào working tree
    repo public; mirror pattern GRAPH3D_JOURNAL_DIR."""
    env = os.environ.get("GRAPH3D_HEAT_DIR", "").strip()
    return os.path.normpath(env) if env else HERE


def cumulative_heat_path():
    """Store heat TÍCH LUỸ dài hạn — TRONG vault (sync OneDrive), PER-MÁY để tránh
    conflict đa máy (giống graph-<HOST>.json của graph 2D). Dùng phân tích lâu dài."""
    return os.path.join(cumulative_heat_dir(), "heat_cumulative-%s.json" % host_name())


def cumulative_heat_files():
    """Mọi file cumulative của mọi máy (để server gộp khi xem scope=all)."""
    return sorted(glob.glob(os.path.join(cumulative_heat_dir(), "heat_cumulative-*.json")))


def vault_journal_dir():
    """Thư mục chứa journal event per-máy. Env GRAPH3D_JOURNAL_DIR là override
    cho TEST (không ghi vào vault thật) — mirror pattern GRAPH3D_ACTIVITY_FILE."""
    env = os.environ.get("GRAPH3D_JOURNAL_DIR", "").strip()
    return os.path.normpath(env) if env else HERE


def vault_journal_path():
    """Journal event TRONG vault (sync OneDrive), PER-MÁY — mỗi máy CHỈ ghi file
    của mình nên không bao giờ conflict (pattern heat_cumulative-<HOST>.json).
    Khác activity.jsonl (%LOCALAPPDATA%, realtime, ngoài OneDrive): journal ghi
    theo LÔ ≤60s cùng nhịp flush heat — để máy KHÁC đọc được lịch sử event
    (chuỗi/timeline/dashboard nhìn thấy cả 2 máy — vấn đề 16/07/2026)."""
    return os.path.join(vault_journal_dir(), "activity-%s.jsonl" % host_name())


def vault_journal_files():
    """Journal của MỌI máy (reader serve.py gộp)."""
    return sorted(glob.glob(os.path.join(vault_journal_dir(), "activity-*.jsonl")))


def journal_host(path):
    """Tên máy từ tên file journal 'activity-<HOST>.jsonl'."""
    name = os.path.splitext(os.path.basename(path))[0]
    return name[len("activity-"):] or "unknown"


# DANH SÁCH DUY NHẤT mã nguồn của app — mọi nơi cần "app gồm những file nào" phải
# đọc từ đây, không chép tay: mirror bản demo (onboarding.mirror_app), whitelist
# publish sang repo public (tools/publish_from_vault.py), bộ test (selfcheck PY_MAIN).
# Bài học đợt 7+8 repo public: ba danh sách chép tay ⇒ thêm module .py mới là sót một
# chỗ, và sót thì im lặng (publish báo OK, demo chết lúc import). Selfcheck có contract
# đối chiếu danh sách này với *.py thật trong thư mục — quên khai là FAIL ngay.
# backup_graph3d.py KHÔNG nằm đây: file vận hành riêng bản private, không publish.
APP_PY = ("activity_paths.py", "build_graph_data.py", "ensure_graph3d.py",
          "insight.py", "install_launcher.py", "integrity.py", "log_activity.py",
          "onboarding.py", "run_graph3d.py", "serve.py")
APP_TOP = APP_PY + ("index.html", "Start-Graph3D.bat")
APP_DIRS = ("src", "vendor")

# Các file mà khi đổi thì SERVER phải khởi động lại (build_graph_data.py auto-reload
# nên KHÔNG nằm đây — tránh restart thừa). ensure/run so version này để biết server
# đang chạy có "cũ" so với code trên đĩa hay không → tự chữa.
# Từ giai đoạn 0 Vault Cockpit: UI tách thành ES modules trong src/ — hash phủ cả
# src/* để sửa module cũng kích tự-reload y như sửa index.html.
# ⚠ MỌI module serve.py import lúc nạp PHẢI có mặt ở đây (selfcheck contract 2k soi
# thẳng lệnh import trong serve.py) — thiếu thì sửa module xong server vẫn phục vụ
# bản cũ, lặng thinh (bug integrity.py, đợt 8 repo public).
_VERSION_FILES = ("serve.py", "index.html", "activity_paths.py", "log_activity.py",
                  "insight.py", "integrity.py", "onboarding.py")


def restart_py_files():
    """Chỉ phần .py của _VERSION_FILES — serve.py dùng để kiểm 'nguồn có đang ghi dở'
    trước khi tự restart. Derive chứ không chép: thêm module mới chỉ khai MỘT chỗ."""
    return tuple(n for n in _VERSION_FILES if n.endswith(".py"))


def _version_paths(here):
    out = [os.path.join(here, name) for name in _VERSION_FILES]
    out.extend(sorted(p for p in glob.glob(os.path.join(here, "src", "*"))
                      if os.path.isfile(p)))
    return out


def source_version(here=None):
    """Hash ngắn của mã nguồn cần-restart. Trả None nếu đọc lỗi (file bị khóa
    tạm thời do OneDrive…) — caller nên bỏ qua tick đó, không coi là 'đổi'."""
    here = here or os.path.dirname(os.path.abspath(__file__))
    h = hashlib.sha1()
    for path in _version_paths(here):
        try:
            with open(path, "rb") as f:
                h.update(os.path.basename(path).encode("utf-8"))
                h.update(f.read())
        except OSError:
            return None
        h.update(b"\0")
    return h.hexdigest()[:12]