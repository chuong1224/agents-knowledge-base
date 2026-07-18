# -*- coding: utf-8 -*-
"""Quét vault Obsidian -> dữ liệu graph JSON cho KB Graph 3D.

Node  = note .md (kind=note) + file đính kèm (kind=file, lọc theo đuôi ở UI)
        + tag frontmatter (kind=tag, lọc từng tag ở UI).
Link  = wikilink/embed [[...]] giữa note-note và note-file, + note-tag.
Màu   = theo controlled tag vocabulary (TAG_COLORS, 10 nhóm + Khác) — trùng bảng
        màu Synthwave Neon của graph 2D trong Obsidian (xem skill obsidian-vault-config).
"""
import json
import os
import re
import sys
import time

# Thứ tự = ưu tiên tô màu; so khớp trên tag ĐÃ lowercase (jxm viết thường).
# 3 tag rộng của mảng JXM (outgame/su-kien-10-nam/jxm) xếp CUỐI, gộp chung
# một nhóm "JXM Khác" — sub-tag cụ thể match trước.
TAG_COLORS = [
    ("index",           "#c0c0c0", "Index / MOC"),
    ("ngoai-trang",     "#ff2e97", "Ngoại Trang"),
    ("server-nhan-roi", "#04d9ff", "Server Nhàn Rỗi"),
    ("hoai-niem",       "#ff9e2c", "Hoài Niệm"),
    ("tra-cuu",         "#f9f871", "Tra Cứu"),
    ("vault-operation", "#ff4757", "Vault Operation"),
    ("research",        "#2bd96b", "Research"),
    ("skill",           "#b14aed", "Skill"),
    ("personal",        "#ff8fd8", "Personal"),
    ("outgame",         "#6c8ebf", "JXM Khác"),
    ("su-kien-10-nam",  "#6c8ebf", "JXM Khác"),
    ("jxm",             "#6c8ebf", "JXM Khác"),
]
HUB_COLOR = "#f0e9ff"       # node Index/MOC — hub sáng nổi bật
DEFAULT_COLOR = "#8b7fc0"   # note chưa gắn tag chuẩn
TAG_NODE_COLOR = "#b3a7d9"  # tag ngoài vocabulary chuẩn

IMG_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"}
VIDEO_EXTS = {"mp4", "webm", "mov"}


def _file_color(ext):
    if ext in IMG_EXTS:
        return "#7a6fae"
    if ext in VIDEO_EXTS:
        return "#e0885a"
    return "#6e8ba3"


WIKILINK_RE = re.compile(r"\[\[([^\[\]]+?)\]\]")
# Markdown link [label](target) — Obsidian cũng tạo cạnh graph từ dạng này
MDLINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:")  # http:, file:, obsidian:…
EXCLUDED_DIRS = {".trash", "_config_backup", "node_modules"}


def _split_inline_list(s):
    """Tách 'a, "b, c", d' TÔN TRỌNG ngoặc kép/đơn — tag chứa dấu phẩy không bị vỡ
    thành 2 tag giả (review P5.6)."""
    out, buf, q = [], "", None
    for ch in s:
        if q:
            if ch == q:
                q = None
            else:
                buf += ch
        elif ch in "\"'":
            q = ch
        elif ch == ",":
            out.append(buf.strip().strip("#"))
            buf = ""
        else:
            buf += ch
    out.append(buf.strip().strip("#"))
    return [t for t in out if t]


def _parse_frontmatter(text):
    """Trả về dict {title, summary, tags[]} từ khối --- đầu tiên (YAML subset)."""
    meta = {"title": None, "summary": None, "tags": []}
    if not text.startswith("---"):
        return meta
    end = text.find("\n---", 3)
    if end == -1:
        return meta
    block = text[3:end]
    current_list = None
    for raw in block.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        m = re.match(r"^(\w[\w-]*):\s*(.*)$", line)
        if m:
            key, val = m.group(1).lower(), m.group(2).strip()
            current_list = None
            if key == "tags":
                if val.startswith("[") and val.endswith("]"):
                    meta["tags"] = _split_inline_list(val[1:-1])
                elif val:
                    meta["tags"] = [val.strip("'\"#")]
                else:
                    current_list = "tags"
            elif key in ("title", "summary"):
                meta[key] = val.strip("'\"") or None
        elif current_list and re.match(r"^\s*-\s+", line):
            item = re.sub(r"^\s*-\s+", "", line).strip().strip("'\"#")
            if item:
                meta[current_list].append(item)
    return meta


def _node_color_group(name, tags):
    lowered = {t.lower() for t in tags}
    if "index" in name.lower():
        return HUB_COLOR, "Index / MOC"
    for tag, color, label in TAG_COLORS:
        if tag in lowered:
            return color, label
    return DEFAULT_COLOR, "Khác"


def build(vault):
    vault = os.path.abspath(vault)
    notes = {}      # rel -> info
    attach = {}     # rel -> ext (mọi file không phải .md)
    by_base = {}    # basename note (lower, no ext) -> [rels] (trùng stem giữ HẾT, resolver chọn)
    file_by_base = {}  # basename file (lower, có ext) -> rel

    for root, dirs, fnames in os.walk(vault):
        dirs[:] = [d for d in dirs
                   if not d.startswith(".") and d not in EXCLUDED_DIRS]
        for fn in fnames:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, vault).replace("\\", "/")
            if fn.lower().endswith(".md"):
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        text = f.read()
                except OSError:
                    continue
                stem = os.path.splitext(fn)[0]
                notes[rel] = {"stem": stem, "meta": _parse_frontmatter(text), "text": text}
                by_base.setdefault(stem.lower(), []).append(rel)
            else:
                ext = os.path.splitext(fn)[1].lower().lstrip(".")
                if not ext or ext in ("pyc", "tmp", "bak"):
                    continue
                attach[rel] = ext
                file_by_base.setdefault(fn.lower(), rel)

    links, seen = [], set()
    deg = {rel: 0 for rel in notes}       # bậc note-note (quyết định size node note)
    xdeg = {}                             # bậc của file/tag (cho tooltip)

    def add_link(src, tgt):
        if (src, tgt) in seen:
            return False
        seen.add((src, tgt))
        links.append({"source": src, "target": tgt})
        return True

    def resolve_file(note_rel, target):
        """Ưu tiên như Obsidian: (1) đường dẫn tương đối theo folder note,
        (2) đường dẫn tính từ gốc vault, (3) basename toàn vault (first-win)."""
        folder = os.path.dirname(note_rel)
        cand = os.path.normpath(os.path.join(folder, target)).replace("\\", "/")
        if cand in attach:
            return cand
        cand = os.path.normpath(target).replace("\\", "/")
        if cand in attach:
            return cand
        return file_by_base.get(os.path.basename(target).lower())

    def resolve_note(note_rel, target, note_base):
        """Resolve đích wikilink note như Obsidian: (1) target có PATH tường minh →
        khớp đúng rel; (2) trùng stem nhiều folder → ưu tiên CÙNG folder note nguồn,
        rồi path NÔNG/NGẮN nhất (chuẩn 'shortest') — hết phụ thuộc thứ tự os.walk
        first-win vốn không xác định (review P5.5)."""
        norm = os.path.normpath(target).replace("\\", "/")
        if "/" in norm:
            cand = norm if norm.lower().endswith(".md") else norm + ".md"
            if cand in notes:
                return cand
        cands = by_base.get(note_base.lower())
        if not cands:
            return None
        if len(cands) == 1:
            return cands[0]
        folder = os.path.dirname(note_rel)
        same = [c for c in cands if os.path.dirname(c) == folder]
        pool = same or cands
        return min(pool, key=lambda c: (c.count("/"), len(c), c))

    def process_target(rel, target):
        """Tạo cạnh note→note hoặc note→file từ 1 đích link (wikilink/markdown)."""
        base = os.path.basename(target)
        note_base = base[:-3] if base.lower().endswith(".md") else base
        tgt = resolve_note(rel, target, note_base)
        if tgt:
            if tgt != rel and add_link(rel, tgt):
                deg[rel] += 1
                deg[tgt] += 1
            return
        ftgt = resolve_file(rel, target)
        if ftgt and add_link(rel, ftgt):
            xdeg[ftgt] = xdeg.get(ftgt, 0) + 1

    from urllib.parse import unquote
    for rel, info in notes.items():
        text = info["text"]
        for m in WIKILINK_RE.finditer(text):
            target = m.group(1).split("#")[0].split("|")[0].strip()
            if target:
                process_target(rel, target)
        for m in MDLINK_RE.finditer(text):
            target = m.group(1).strip()
            target = re.sub(r'\s+"[^"]*"$', "", target).strip("<>").strip()  # bỏ "title"
            if not target or target.startswith("#") or SCHEME_RE.match(target):
                continue  # anchor nội bộ / URL ngoài (http, file, obsidian…)
            target = unquote(target).split("#")[0].strip()
            if target:
                process_target(rel, target)

    # Obsidian coi tag không phân biệt hoa/thường (#JXM == #jxm) -> merge theo lowercase
    tag_count, tag_display = {}, {}
    for rel, info in notes.items():
        for t in info["meta"]["tags"]:
            low = t.lower()
            tag_display.setdefault(low, t)
            if add_link(rel, "#" + low):
                tag_count[low] = tag_count.get(low, 0) + 1

    nodes = []
    for rel, info in notes.items():
        meta = info["meta"]
        color, group = _node_color_group(info["stem"], meta["tags"])
        nodes.append({
            "id": rel, "kind": "note",
            "name": meta["title"] or info["stem"],
            "stem": info["stem"],
            "folder": os.path.dirname(rel) or "/",
            "tags": meta["tags"],
            "summary": meta["summary"] or "",
            "color": color, "group": group,
            "degree": deg[rel],
            "hub": group == "Index / MOC",
        })
    for rel, ext in attach.items():
        linked = xdeg.get(rel, 0)
        nodes.append({
            "id": rel, "kind": "file",
            "name": os.path.basename(rel),
            "stem": os.path.basename(rel),
            "folder": os.path.dirname(rel) or "/",
            "ext": ext, "tags": [], "summary": "",
            # Mồ côi (không note nào link) tô xám để phân biệt ngay bằng mắt
            "color": _file_color(ext) if linked else "#57506e",
            "group": "File",
            "degree": linked, "hub": False,
        })
    tag_color_map = {t: c for t, c, _ in TAG_COLORS}
    for t, cnt in sorted(tag_count.items()):
        disp = "#" + tag_display[t]
        nodes.append({
            "id": "#" + t, "kind": "tag",
            "name": disp, "stem": disp,
            "folder": "", "tags": [], "summary": "",
            "color": tag_color_map.get(t, TAG_NODE_COLOR),
            "group": "Tag", "degree": cnt, "hub": False,
        })

    n_notes = len(notes)
    return {
        "meta": {"vaultName": os.path.basename(vault),
                 "notes": n_notes, "links": len(links),
                 "files": len(attach), "tags": len(tag_count),
                 "generated": time.strftime("%H:%M:%S")},
        "nodes": nodes,
        "links": links,
    }


if __name__ == "__main__":
    vault_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data = build(vault_dir)
    out = json.dumps(data, ensure_ascii=False, indent=1)
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(out)
        print("Wrote %s %s" % (sys.argv[2], data["meta"]))
    else:
        sys.stdout.buffer.write(out.encode("utf-8"))
