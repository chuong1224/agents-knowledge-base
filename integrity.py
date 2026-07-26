# -*- coding: utf-8 -*-
"""KB Graph 3D — đèn báo TOÀN VẸN vault ngay trong app (W11 / backlog #14).

Bộ ba câu hỏi về vault, mỗi cái một module:
  `/dashboard` → "agent đã làm gì hôm nay"
  `/insight`   → "vault có đang được dùng đủ khắp không" (insight.py)
  `/integrity` → **"vault có đang GÃY chỗ nào không"** — module này.

Sáu check cơ học, chia hai họ:
  CẤU TRÚC (không cần nguồn luật — vault nào cũng chạy được)
    1 link    wikilink `[[Note]]` trỏ tới note/file không tồn tại
    2 embed   nhúng `![[file]]` trỏ tới file không tồn tại
    3 anchor  `[[Note#Heading]]` mà Note không có heading đó
    4 orphan  ảnh/video trong vault không note nào nhắc tới
  CONTRACT (đọc luật từ `vault-rules.json` — thiếu nguồn luật thì tắt êm)
    5 frontmatter  note thiếu trường BẮT BUỘC (`policy.mandatory_frontmatter`)
    6 digest       file nhị phân trong `attachments/` chưa "mở nilon"
                   (thiếu tên trong `file_digest` — §VI Q18, `policy.binary_digest_ext`)

KHÔNG thay thế gate `verify_vault_integrity.py` của skill `obsidian-vault-update`:
gate vẫn là chuẩn NGHIỆM THU (nó còn bắt "CN remnant dính chữ" mà module này cố ý
không làm). Đây là ĐÈN BÁO: mở app là thấy, không phải chạy tay, không phải đợi
audit 08:00.

Quan hệ số liệu với gate — chốt để hai bên không cãi nhau:
  * Tiêu chí BỎ QUA note lấy NGUYÊN của gate: tên file bắt đầu `_`, hoặc frontmatter
    có `gate_ignore: true` (dò trên TRỌN khối frontmatter — bản vá 2026-07-25).
  * 4 check cấu trúc: app là TẬP CON của gate — app chỉ báo cái gate cũng báo.
    App nới hơn gate đúng hai chỗ, cả hai đều theo hướng ÍT báo oan hơn:
    (a) so khớp tên không phân biệt hoa/thường; (b) ảnh được nhắc bằng `[[x.png]]`
    hay `![](attachments/x.png)` vẫn tính là "có người dùng" (gate chỉ đếm `![[…]]`).
    ⇒ **app im lặng KHÔNG thay cho gate PASS.**
  * 2 check contract: gate (bản laptop) chưa có — luật lấy thẳng từ nguồn chân lý,
    nên khi bản gate hợp nhất xong hai bên vẫn cùng một luật gốc.
  * Phạm vi: app đo đúng phạm vi graph (bỏ mọi dot-folder + `EXCLUDED_DIRS` của
    scanner) — gate walk thêm `.graph3d/README.md`… nên TỔNG note hai bên lệch vài
    file. Con số phạm vi luôn đi kèm trong `vault` của báo cáo.

Không chép luật (CLAUDE.md — quy tắc đếm được có nguồn sinh duy nhất): trường
frontmatter bắt buộc + đuôi file phải "mở nilon" đọc thẳng `vault-rules.json`, và
frontmatter parse bằng chính `parse_frontmatter` của `vault_rules.py` trong vault
(cùng parser mà audit dùng — hết cảnh mỗi bên một regex). Vault khác/bản public
không có hai file đó: 4 check cấu trúc vẫn chạy, 2 check contract báo "thiếu nguồn
luật" thay vì đoán bừa.

Chạy tay:
  python .graph3d/integrity.py            # tóm tắt console (exit 1 nếu có lỗi)
  python .graph3d/integrity.py --json     # đổ nguyên JSON (debug)
  python .graph3d/integrity.py --list 100 # nới trần danh sách mỗi check

Hồ sơ đợt + định nghĩa từng check: note vault "Đèn Báo Toàn Vẹn Vault — KB Graph 3D".
"""
import argparse
import importlib.util
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VAULT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_graph_data  # noqa: E402  (EXCLUDED_DIRS + đuôi media: CÙNG luật phạm vi với scanner graph)

# Nguồn chân lý quy tắc đếm được (H1). Vault khác đặt chỗ khác: GRAPH3D_VAULT_RULES.
RULES_DIR = os.environ.get("GRAPH3D_VAULT_RULES") or os.path.join(
    VAULT, "Vault Operation", "Quy Tắc & Vận Hành", "Nguồn Chân Lý Quy Tắc Vault",
    "attachments")

# Regex lấy NGUYÊN của gate verify_vault_integrity.py — sửa một bên phải sửa cả hai.
EMBED_RE = re.compile(r"!\[\[([^\]]+)\]\]")            # ![[target]]
WIKILINK_RE = re.compile(r"(?<!\!)\[\[([^\]]+)\]\]")   # [[target]] (không phải embed)
HEADING_RE = re.compile(r"^#{1,6}\s+(.*?)\s*$")
FRONTMATTER_RE = re.compile(r"\A﻿?---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)
GATE_IGNORE_RE = re.compile(r"(?mi)^\s*gate_ignore:\s*true\b")

MEDIA_EXTS = build_graph_data.IMG_EXTS | build_graph_data.VIDEO_EXTS
ATTACH_DIR = "attachments"
LIST_N = 40          # trần danh sách mỗi check (UI/console hiện đầu danh sách, `total` là số thật)

CHECKS = [
    ("link", "Wikilink gãy", "structure",
     "[[Note]] trỏ tới note/file không tồn tại trong vault",
     "Sửa tên đích, hoặc tạo note đích. Đích là file thật (.py/.pdf…) thì phải tồn tại đúng tên."),
    ("embed", "Nhúng gãy", "structure",
     "![[file]] nhúng một file không tồn tại",
     "Ảnh/file đính kèm đã đổi tên hay chưa chép vào attachments/ của note."),
    ("anchor", "Anchor lệch heading", "structure",
     "[[Note#Heading]] mà Note không có heading khớp CHÍNH XÁC (kể cả emoji/dấu câu)",
     "Heading đích vừa bị sửa chữ → cập nhật anchor ở note nguồn."),
    ("orphan", "Ảnh/video mồ côi", "structure",
     "file media trong vault không note nào nhắc tới",
     "Nhúng vào note đúng chỗ, hoặc xoá nếu là rác của lần import cũ."),
    ("frontmatter", "Thiếu trường frontmatter", "contract",
     "note thiếu trường BẮT BUỘC theo vault-rules.json (policy.mandatory_frontmatter)",
     "Bổ sung trường còn thiếu — aliases/summary là 'bìa' để agent triage, thiếu là bị bỏ sót."),
    ("digest", "File nhị phân chưa mở nilon", "contract",
     "file .xlsx/.pdf… trong attachments/ nhưng tên chưa có trong frontmatter file_digest",
     "Tóm tắt nội dung file vào thân note rồi khai tên file vào file_digest (§VI Q18)."),
]


# --------------------------------------------------------------------- tiện ích

def _rel(path, vault=VAULT):
    try:
        return os.path.relpath(path, vault).replace("\\", "/")
    except ValueError:                                   # ổ đĩa khác
        return path.replace("\\", "/")


def frontmatter_block(text):
    """NGUYÊN khối YAML đầu file (giữa 2 dòng `---`), '' nếu không có.

    Quét TRỌN khối chứ không cắt `text[:500]` như gate bản cũ — note có aliases/summary
    dài đẩy `gate_ignore: true` ra ngoài cửa sổ 500 ký tự từng gây 39 báo oan (vá 2026-07-25).
    """
    m = FRONTMATTER_RE.match(text)
    return m.group(1) if m else ""


def is_ignored(stem, text):
    """Note được MIỄN báo lỗi (vẫn dùng để phân giải link/ảnh) — tiêu chí của gate."""
    return stem.startswith("_") or GATE_IGNORE_RE.search(frontmatter_block(text)) is not None


def split_target(t):
    """'Note#Heading|alias' → ('Note', 'Heading'); mirror split_target của gate."""
    t = t.split("|", 1)[0].strip()
    if "#" in t:
        base, anchor = t.split("#", 1)
        return base.strip(), anchor.strip()
    return t, None


def _empty(val):
    """Trường frontmatter coi như THIẾU: vắng mặt, rỗng, hoặc list toàn chuỗi rỗng."""
    if val is None:
        return True
    if isinstance(val, (list, tuple, set)):
        return not [x for x in val if str(x).strip()]
    return not str(val).strip()


# ------------------------------------------------------------------------ I/O

def vault_signature(vault):
    """(rel, mtime_ns, size) của mọi file trong phạm vi — khoá cache + danh sách để đọc.

    Phạm vi = ĐÚNG phạm vi scanner graph (dot-folder + EXCLUDED_DIRS bị loại) nên
    không bao giờ có chuyện đèn báo lỗi ở file mà graph/Reader không biết tới.
    """
    out = []
    for root, dirs, fnames in os.walk(vault):
        dirs[:] = [d for d in dirs
                   if not d.startswith(".") and d not in build_graph_data.EXCLUDED_DIRS]
        for fn in fnames:
            full = os.path.join(root, fn)
            try:
                st = os.stat(full)
            except OSError:
                continue
            out.append((_rel(full, vault), st.st_mtime_ns, st.st_size))
    out.sort()
    return tuple(out)


def scan_vault(vault, sig=None):
    """Đọc vault → dữ liệu thô cho build_integrity (I/O tách hẳn khỏi phép tính).

    `notes[rel]` = {stem, text, headings, ignored}; `files[rel]` = đuôi (mọi file
    không phải .md — kể cả file rác: gate cũng cho chúng vào bảng basename nên
    `[[attachments/x.py]]` không bị báo gãy oan).
    """
    sig = vault_signature(vault) if sig is None else sig
    notes, files = {}, {}
    for rel, _mt, _sz in sig:
        if not rel.lower().endswith(".md"):
            files[rel] = os.path.splitext(rel)[1].lower().lstrip(".")
            continue
        try:
            with open(os.path.join(vault, rel), "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError:
            continue
        stem = os.path.splitext(os.path.basename(rel))[0]
        heads = set()
        for line in text.splitlines():
            hm = HEADING_RE.match(line)
            if hm:
                heads.add(hm.group(1).strip().lower())
        notes[rel] = {"stem": stem, "text": text, "headings": heads,
                      "ignored": is_ignored(stem, text)}
    return {"vault": vault, "notes": notes, "files": files}


def load_rules(rules_dir=None):
    """Nạp nguồn chân lý: policy trong `vault-rules.json` + parser của `vault_rules.py`.

    KHÔNG chép luật vào module này — vault không có nguồn luật thì trả rules rỗng
    kèm lý do, hai check contract tự tắt (UI hiện "thiếu nguồn luật", không đoán bừa).
    Đọc mỗi lần gọi (file nhỏ) — sửa vault-rules.json là lần đo sau ăn ngay.
    """
    rules_dir = rules_dir or RULES_DIR
    js = os.path.join(rules_dir, "vault-rules.json")
    py = os.path.join(rules_dir, "vault_rules.py")
    info = {"loaded": False, "path": _rel(js), "reason": ""}
    if not os.path.isfile(js):
        info["reason"] = "không thấy vault-rules.json"
        return {}, info
    try:
        with open(js, encoding="utf-8") as f:
            policy = (json.load(f) or {}).get("policy", {})
    except (OSError, ValueError) as exc:
        info["reason"] = "vault-rules.json đọc không được: %s" % exc
        return {}, info
    if not os.path.isfile(py):
        info["reason"] = "không thấy vault_rules.py (cần parser frontmatter dùng chung)"
        return {}, info
    try:
        spec = importlib.util.spec_from_file_location("kb_vault_rules", py)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        parse_fm = mod.parse_frontmatter
    except Exception as exc:                              # noqa: BLE001
        info["reason"] = "vault_rules.py nạp lỗi: %s" % exc
        return {}, info
    info.update(loaded=True,
                mandatory=list(policy.get("mandatory_frontmatter") or []),
                digest_ext=sorted(e.lower() for e in (policy.get("binary_digest_ext") or [])))
    return {"mandatory_frontmatter": info["mandatory"],
            "binary_digest_ext": info["digest_ext"],
            "parse_frontmatter": parse_fm}, info


# ------------------------------------------------------------------ phép tính

def build_integrity(scan, rules=None, rules_info=None, now=None, list_n=LIST_N):
    """Ảnh chụp toàn vẹn vault — HÀM THUẦN (không đọc đĩa, `now` truyền vào → test được).

    scan       — kết quả scan_vault()
    rules      — {} hoặc {mandatory_frontmatter, binary_digest_ext, parse_frontmatter}
    rules_info — mô tả nguồn luật để UI giải thích khi check contract tắt
    """
    now = float(now if now is not None else time.time())
    notes, files = scan["notes"], scan["files"]
    rules = rules or {}
    mandatory = list(rules.get("mandatory_frontmatter") or [])
    digest_ext = {("." + e.lstrip(".")).lower() for e in (rules.get("binary_digest_ext") or [])}
    parse_fm = rules.get("parse_frontmatter")
    has_rules = bool(parse_fm and (mandatory or digest_ext))

    # Bảng tra: stem note (thường hoá) và basename MỌI file — gate so khớp theo
    # basename chứ không theo path, giữ nguyên để hai bên cùng một phép so.
    note_stems, base_files, headings = {}, {}, {}
    for rel, n in notes.items():
        low = n["stem"].lower()
        note_stems.setdefault(low, []).append(rel)
        headings.setdefault(low, set()).update(n["headings"])
        base_files.setdefault(os.path.basename(rel).lower(), []).append(rel)
    for rel in files:
        base_files.setdefault(os.path.basename(rel).lower(), []).append(rel)

    hits = {cid: [] for cid, _l, _f, _d, _h in CHECKS}
    referenced = set()          # basename mọi đích link — dùng tìm media mồ côi
    checked = ignored = 0

    for rel in sorted(notes):
        n = notes[rel]
        active = not n["ignored"]
        checked += 1 if active else 0
        ignored += 0 if active else 1

        for i, line in enumerate(n["text"].splitlines(), 1):
            for m in EMBED_RE.finditer(line):
                base, _anchor = split_target(m.group(1))
                b = os.path.basename(base).lower()
                if not b:
                    continue
                referenced.add(b)
                if active and b not in base_files and b not in note_stems:
                    hits["embed"].append({"file": rel, "line": i, "target": m.group(1),
                                          "detail": "không có file tên %s" % os.path.basename(base)})
            for m in WIKILINK_RE.finditer(line):
                base, anchor = split_target(m.group(1))
                if not base:
                    continue
                b = os.path.basename(base).lower()
                # Nới hơn gate CÓ CHỦ Ý: ảnh được nhắc bằng [[x.png]] vẫn tính là có
                # người dùng → không báo mồ côi oan (gate chỉ đếm dạng ![[…]]).
                referenced.add(b)
                if not active:
                    continue
                stem = b[:-3] if b.endswith(".md") else b
                if stem in note_stems:
                    if anchor and not anchor.startswith("^") \
                            and anchor.lower() not in headings.get(stem, set()):
                        hits["anchor"].append({"file": rel, "line": i, "target": m.group(1),
                                               "detail": "note đích không có heading “%s”" % anchor})
                elif b not in base_files:
                    hits["link"].append({"file": rel, "line": i, "target": m.group(1),
                                         "detail": "không có note/file tên %s" % os.path.basename(base)})
            for m in build_graph_data.MDLINK_RE.finditer(line):
                tgt = m.group(1).strip()
                tgt = re.sub(r'\s+"[^"]*"$', "", tgt).strip("<>").strip()
                if not tgt or tgt.startswith("#") or build_graph_data.SCHEME_RE.match(tgt):
                    continue        # anchor nội bộ / URL ngoài
                referenced.add(os.path.basename(tgt.split("#")[0]).lower())

        if active and parse_fm and mandatory:
            fm = parse_fm(n["text"])
            miss = [k for k in mandatory if _empty(fm.get(k))]
            if miss:
                hits["frontmatter"].append({"file": rel, "line": 1, "target": "",
                                            "missing": miss,
                                            "detail": "thiếu " + ", ".join(miss)})

    # --- media mồ côi: file ảnh/video không basename nào nhắc tới ---
    for rel, ext in sorted(files.items()):
        if ext in MEDIA_EXTS and os.path.basename(rel).lower() not in referenced:
            hits["orphan"].append({"file": rel, "line": None, "target": "",
                                   "detail": "không note nào nhắc tới file này"})

    # --- "mở nilon": file nhị phân trong attachments/ phải có tên trong file_digest ---
    if parse_fm and digest_ext:
        notes_by_folder = {}
        for rel in notes:
            notes_by_folder.setdefault(os.path.dirname(rel), []).append(rel)
        binary_by_folder = {}
        for rel in files:
            d = os.path.dirname(rel)
            if os.path.basename(d).lower() != ATTACH_DIR:
                continue
            if os.path.splitext(rel)[1].lower() in digest_ext:
                binary_by_folder.setdefault(os.path.dirname(d), []).append(rel)
        for folder, bins in sorted(binary_by_folder.items()):
            owner = _owner_note(folder, notes_by_folder, notes)
            if owner is None or notes[owner]["ignored"]:
                continue      # folder không xác định được chủ (không phải folder-per-note)
            declared = parse_fm(notes[owner]["text"]).get("file_digest")
            declared = [str(x).strip().lower() for x in (declared or [])] \
                if isinstance(declared, (list, tuple)) else [str(declared or "").strip().lower()]
            miss = [os.path.basename(b) for b in sorted(bins)
                    if os.path.basename(b).lower() not in declared]
            if miss:
                hits["digest"].append({"file": owner, "line": 1, "target": "",
                                       "missing": miss,
                                       "detail": "chưa khai trong file_digest: " + ", ".join(miss)})

    checks = []
    for cid, label, family, desc, fix in CHECKS:
        avail = family == "structure" or has_rules
        checks.append({"id": cid, "label": label, "family": family, "desc": desc,
                       "fix": fix, "available": avail,
                       "total": len(hits[cid]) if avail else 0,
                       "list": hits[cid][:list_n] if avail else []})
    problems = sum(c["total"] for c in checks)
    media = sum(1 for ext in files.values() if ext in MEDIA_EXTS)
    return {
        "generated": now,
        "ok": problems == 0,
        "problems": problems,
        "vault": {"notes": len(notes), "checked": checked, "ignored": ignored,
                  "files": len(files), "media": media},
        "rules": rules_info or {"loaded": False, "reason": "chưa nạp nguồn luật"},
        "checks": checks,
        "limit": list_n,
    }


def _owner_note(folder, notes_by_folder, notes):
    """Note "chủ" của một folder-per-note: note trùng tên folder, hoặc note DUY NHẤT.

    Folder có nhiều note mà không note nào trùng tên folder → trả None: thà bỏ qua
    còn hơn quy trách nhiệm file_digest cho nhầm note (báo oan là mất niềm tin vào đèn).
    """
    cands = notes_by_folder.get(folder, [])
    if not cands:
        return None
    base = os.path.basename(folder).lower()
    for rel in cands:
        if notes[rel]["stem"].lower() == base:
            return rel
    return cands[0] if len(cands) == 1 else None


# --------------------------------------------------------------------- cửa vào

_cache = {"key": None, "data": None}


def collect(vault=VAULT, rules_dir=None, list_n=LIST_N, use_cache=True, now=None):
    """Đo toàn vẹn vault (I/O + phép tính). Cache theo (chữ ký file, mtime nguồn luật)
    — mở section/overlay liên tiếp không quét lại; sửa note là lần sau đo lại ngay."""
    sig = vault_signature(vault)
    rules_dir = rules_dir or RULES_DIR
    rsig = tuple(sorted(
        (os.path.basename(p), os.path.getmtime(p))
        for p in (os.path.join(rules_dir, "vault-rules.json"),
                  os.path.join(rules_dir, "vault_rules.py"))
        if os.path.isfile(p)))
    key = (vault, sig, rsig, list_n)
    if use_cache and _cache["key"] == key:
        return _cache["data"]
    rules, info = load_rules(rules_dir)
    data = build_integrity(scan_vault(vault, sig), rules=rules, rules_info=info,
                           now=now, list_n=list_n)
    _cache.update(key=key, data=data)
    return data


def print_summary(rep, out=print):
    v = rep["vault"]
    out("== TOÀN VẸN VAULT — %s ==" % time.strftime("%Y-%m-%d %H:%M",
                                                    time.localtime(rep["generated"])))
    out("Phạm vi: %d note (%d được kiểm, %d miễn theo gate_ignore/_) · %d file · %d media"
        % (v["notes"], v["checked"], v["ignored"], v["files"], v["media"]))
    if not rep["rules"].get("loaded"):
        out("⚠ check contract TẮT — %s (%s)"
            % (rep["rules"].get("reason", "?"), rep["rules"].get("path", "?")))
    for c in rep["checks"]:
        if not c["available"]:
            out("  —  %-28s (tắt: thiếu nguồn luật)" % c["label"])
            continue
        out("  %s %-28s %d" % ("🔴" if c["total"] else "🟢", c["label"], c["total"]))
        for it in c["list"][:8]:
            loc = "%s:%s" % (it["file"], it["line"]) if it.get("line") else it["file"]
            out("      %s — %s" % (loc, it["detail"]))
        if c["total"] > 8:
            out("      … còn %d mục" % (c["total"] - 8))
    out("TỔNG: %d vấn đề" % rep["problems"])


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                                      # noqa: BLE001
        pass                        # console cp1252 không in được tiếng Việt
    ap = argparse.ArgumentParser(description="Kiểm tra toàn vẹn vault (KB Graph 3D)")
    ap.add_argument("--vault", default=VAULT, help="gốc vault (mặc định: cha của .graph3d)")
    ap.add_argument("--list", type=int, default=LIST_N, dest="list_n",
                    help="trần số mục liệt kê mỗi check (mặc định %d)" % LIST_N)
    ap.add_argument("--json", action="store_true", help="đổ nguyên JSON thay vì tóm tắt")
    args = ap.parse_args(argv)
    rep = collect(vault=os.path.abspath(args.vault), list_n=args.list_n, use_cache=False)
    if args.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
    else:
        print_summary(rep)
    return 1 if rep["problems"] else 0        # exit code kiểu gate — script dùng lại được


if __name__ == "__main__":
    sys.exit(main())
