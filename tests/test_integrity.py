# -*- coding: utf-8 -*-
"""Test den bao toan ven vault (W11 + W41) — integrity.scan_vault + build_integrity + collect:

  - 4 check cau truc: wikilink gay, nhung gay, anchor lech heading, anh mo coi
  - 5 check contract: thieu truong frontmatter bat buoc, file nhi phan chua "mo nilon",
    tag ngoai vocabulary, index sai tag, title != ten file != H1 (W41)
  - ngoai le title (policy.title_rule.exceptions) PIN gia tri: note trong danh sach van
    bi bat neu title troi tiep; ngoai le khai cho note khong con ton tai cung bi bao
  - thieu LE mot khoa policy -> chi check do tat, cac check contract khac van chay
  - tieu chi BO QUA note lay cua gate: ten file bat dau '_' HOAC gate_ignore: true
    (gate_ignore nam CUOI khoi frontmatter dai van phai bat duoc — bug 39 bao oan 25/07)
  - app NOI hon gate co chu y: hoa/thuong khong phan biet; anh duoc nhac bang
    [[x.png]] hay ![](attachments/x.png) van tinh la co nguoi dung
  - pham vi = pham vi scanner graph: node_modules/.trash/dot-folder khong bi quet
  - thieu nguon luat (vault-rules.json) -> 2 check contract TAT em, cau truc van chay
  - parse frontmatter dung parser cua vault_rules.py: tags dang YAML list nhieu dong
    KHONG bi bao thieu (bug regex chi bat 'tags: [...]' inline, audit 26/07)
  - cache theo chu ky mtime: goi 2 lan tra CUNG object, sua note thi do lai
"""
import json, os, shutil, sys
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # console cp1252
except Exception:
    pass

from _scratch import SCRATCH, G3D, VAULT
os.environ.setdefault("GRAPH3D_ACTIVITY_FILE", os.path.join(SCRATCH, "act_integrity.jsonl"))
sys.path.insert(0, G3D)

import integrity as ITG

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


VAULT_DIR = os.path.join(SCRATCH, "itg-vault")
RULES_DIR = os.path.join(SCRATCH, "itg-rules")
EMPTY_RULES = os.path.join(SCRATCH, "itg-rules-empty")
PARTIAL_RULES = os.path.join(SCRATCH, "itg-rules-partial")   # co frontmatter, thieu index/title

# Parser frontmatter dung chung: lay ban THAT trong vault neu co (test luon ca tuong
# thich voi nguon chan ly), khong co (ban public clone ra ngoai vault) thi stub toi thieu.
STUB_RULES_PY = '''# -*- coding: utf-8 -*-
import re
def parse_frontmatter(text):
    if not text.startswith("---"):
        return {}
    end = text.find("\\n---", 3)
    if end == -1:
        return {}
    data, key = {}, None
    for raw in text[3:end].splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("  - ") or line.startswith("- "):
            if key:
                data.setdefault(key, [])
                if isinstance(data[key], list):
                    data[key].append(line.split("- ", 1)[1].strip().strip("\\"'"))
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            data[key] = [v.strip().strip("\\"'") for v in val[1:-1].split(",") if v.strip()]
        elif val == "":
            data[key] = []
        else:
            data[key] = val.strip("\\"'")
    return data
'''

RULES_JSON = {
    "policy": {
        "mandatory_frontmatter": ["title", "aliases", "summary", "tags"],
        "binary_digest_ext": [".xlsx", ".pdf"],
        "tag_vocabulary": {
            "jxm": [{"tag": "JXM"}, {"tag": "hoai-niem"}],
            "area": [{"tag": "index"}],
        },
        "index_rule": {"name_prefix": "Index", "type_field": "index",
                       "tag": "index", "only_tag": True},
        "title_rule": {
            "require_h1": True,
            "exceptions": [
                {"file": "Ngoai Le", "title": "Ngoai Le — Ban Day Du"},
                {"file": "Ngoai Le Troi", "title": "Ngoai Le Troi — Ban Khai"},
                {"file": "Ba Chan", "title": "Ba Chan — Title Khai", "h1": "H1 Khai Rieng"},
                {"file": "Khong Con Nua", "title": "Khong Con Nua — Note da bi xoa"},
            ],
        },
    }
}
# Bo luat "mot nua": du de chay frontmatter/digest/tag nhung KHONG khai index_rule/title_rule
PARTIAL_JSON = {"policy": {k: v for k, v in RULES_JSON["policy"].items()
                           if k not in ("index_rule", "title_rule")}}


def w(rel, text):
    p = os.path.join(VAULT_DIR, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return p


def blob(rel, data=b"xx"):
    p = os.path.join(VAULT_DIR, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)


def fm(title, aliases=True, summary=True, tags="[JXM]", extra="", h1=None):
    """Note test. `h1=None` → H1 trung title (ca sach); chuoi khac → H1 lech; False → khong H1."""
    L = ["---", "title: " + title]
    if aliases:
        L.append('aliases: ["%s"]' % title[:3])
    if summary:
        L.append('summary: "note test %s"' % title)
    if tags is not None:
        L.append("tags: " + tags if tags.startswith("[") else "tags:\n" + tags)
    if extra:
        L.append(extra)
    L += ["---", ""]
    if h1 is not False:
        L += ["# " + (title if h1 is None else h1), ""]
    return "\n".join(L)


def build_fake_vault():
    shutil.rmtree(VAULT_DIR, ignore_errors=True)
    os.makedirs(EMPTY_RULES, exist_ok=True)
    shutil.rmtree(RULES_DIR, ignore_errors=True)
    os.makedirs(RULES_DIR)
    with open(os.path.join(RULES_DIR, "vault-rules.json"), "w", encoding="utf-8") as f:
        json.dump(RULES_JSON, f)
    real_py = os.path.join(ITG.RULES_DIR, "vault_rules.py")
    if os.path.isfile(real_py):
        shutil.copyfile(real_py, os.path.join(RULES_DIR, "vault_rules.py"))
    else:
        print("SKIP dung parser THAT — khong thay vault_rules.py, dung stub")
        with open(os.path.join(RULES_DIR, "vault_rules.py"), "w", encoding="utf-8",
                  newline="\n") as f:
            f.write(STUB_RULES_PY)
    shutil.rmtree(PARTIAL_RULES, ignore_errors=True)
    os.makedirs(PARTIAL_RULES)
    with open(os.path.join(PARTIAL_RULES, "vault-rules.json"), "w", encoding="utf-8") as f:
        json.dump(PARTIAL_JSON, f)
    shutil.copyfile(os.path.join(RULES_DIR, "vault_rules.py"),
                    os.path.join(PARTIAL_RULES, "vault_rules.py"))

    # Alpha: sach — link + anchor dung, nhung anh co that
    w("Work/Alpha/Alpha.md", fm("Alpha") +
      "Xem [[Beta]] va [[Beta#Heading co that]].\n\n![[a.png]]\n")
    blob("Work/Alpha/attachments/a.png")

    # Beta: 1 wikilink gay + 1 anchor gay; attachments co .xlsx ma KHONG khai file_digest
    w("Work/Beta/Beta.md", fm("Beta") +
      "## Heading co that\n\nLink hong [[Khong Ton Tai]].\n"
      "Anchor hong [[Alpha#Khong co heading nay]].\n"
      "Hoa thuong van khop: [[alpha]].\n")
    blob("Work/Beta/attachments/orphan.png")          # khong ai nhac -> mo coi
    blob("Work/Beta/attachments/data.xlsx")           # chua "mo nilon"

    # Gamma: thieu aliases + summary; 1 nhung gay
    w("Work/Gamma/Gamma.md", fm("Gamma", aliases=False, summary=False) +
      "![[mat-tieu.png]]\n")

    # Delta: gate_ignore CUOI khoi frontmatter dai -> mien bao loi
    w("Work/Delta/Delta.md",
      "---\ntitle: Delta\n" + 'aliases: ["%s"]\n' % ("x" * 600) +
      'summary: "%s"\ntags: [JXM]\ngate_ignore: true\n---\n\n' % ("y" * 600) +
      "# Delta\n\n[[Khong Ton Tai 2]]\n")

    # _Meta: ten bat dau '_' -> mien bao loi (khong can frontmatter)
    w("Work/_Meta/_Meta.md", "# _Meta\n\n[[Khong Ton Tai 3]]\n")

    # Eps: tags dang YAML list nhieu dong + file_digest day du + 2 kieu nhac anh
    w("Work/Eps/Eps.md",
      "---\ntitle: Eps\naliases: [\"Ep\"]\nsummary: \"note test Eps\"\ntags:\n  - JXM\n"
      "  - hoai-niem\nfile_digest: [\"so-lieu.xlsx\"]\n---\n\n# Eps\n\n"
      "Anh nhac kieu wikilink: [[wiki.png]]\n"
      "Anh nhac kieu markdown: ![](attachments/md.png)\n")
    blob("Work/Eps/attachments/so-lieu.xlsx")
    blob("Work/Eps/attachments/wiki.png")
    blob("Work/Eps/attachments/md.png")

    # --- W41: 3 check contract con lai ---
    # Theta: tag ngoai vocabulary
    w("Work/Theta/Theta.md", fm("Theta", tags="[JXM, tag-tu-che]"))
    # Index - Work: file index nhung deo them tag content
    w("Work/Index - Work/Index - Work.md", fm("Index - Work", tags="[index, JXM]"))
    # Iota: note thuong muon tag `index`
    w("Work/Iota/Iota.md", fm("Iota", tags="[JXM, index]"))
    # Kappa: title != ten file · Lambda: H1 != title · Mu: khong co H1
    w("Work/Kappa/Kappa.md", fm("Kappa Doi Ten Roi"))
    w("Work/Lambda/Lambda.md", fm("Lambda", h1="Lambda Nhung Khac"))
    w("Work/Mu/Mu.md", fm("Mu", h1=False) + "Than note khong co H1.\n")
    # Ngoai le khai trong nguon luat: title dai hon ten file -> SACH
    w("Work/Ngoai Le/Ngoai Le.md", fm("Ngoai Le — Ban Day Du"))
    # Ngoai le van bi bat khi title TROI TIEP khoi gia tri da pin
    w("Work/Ngoai Le Troi/Ngoai Le Troi.md", fm("Ngoai Le Troi — Da Troi Tiep"))
    # Ngoai le pin ca H1 rieng (ca CLAUDE.md ngoai doi that) -> SACH
    w("Work/Ba Chan/Ba Chan.md", fm("Ba Chan — Title Khai", h1="H1 Khai Rieng"))

    # Ngoai pham vi scanner: khong duoc quet (loi trong day PHAI im)
    w("node_modules/junk.md", "# junk\n\n[[Khong Ton Tai 4]]\n")
    w(".trash/rac.md", "# rac\n\n[[Khong Ton Tai 5]]\n")


def by_id(rep):
    return {c["id"]: c for c in rep["checks"]}


build_fake_vault()
rep = ITG.collect(vault=VAULT_DIR, rules_dir=RULES_DIR, use_cache=False)
C = by_id(rep)

# --- pham vi + tieu chi bo qua ---
check("1 dem dung so note trong pham vi (bo node_modules/.trash)", rep["vault"]["notes"] == 15,
      rep["vault"])
check("1 mien 2 note (_Meta + gate_ignore Delta), kiem 13",
      (rep["vault"]["ignored"], rep["vault"]["checked"]) == (2, 13), rep["vault"])

# --- check cau truc ---
check("2 wikilink gay = 1 (Beta -> Khong Ton Tai)", C["link"]["total"] == 1,
      C["link"]["list"])
check("2 wikilink gay chi ra dung file + so dong",
      C["link"]["list"] and C["link"]["list"][0]["file"] == "Work/Beta/Beta.md"
      and C["link"]["list"][0]["line"] > 0, C["link"]["list"])
check("2 note mien KHONG bi bao (Delta gate_ignore + _Meta)",
      all("Delta" not in i["file"] and "_Meta" not in i["file"] for i in C["link"]["list"]),
      C["link"]["list"])
check("2 anchor lech = 1 (Alpha#Khong co heading nay)", C["anchor"]["total"] == 1,
      C["anchor"]["list"])
check("2 nhung gay = 1 (Gamma -> mat-tieu.png)", C["embed"]["total"] == 1,
      C["embed"]["list"])
check("2 anh mo coi = 1 (chi orphan.png)",
      C["orphan"]["total"] == 1 and C["orphan"]["list"][0]["file"].endswith("orphan.png"),
      C["orphan"]["list"])
check("2 anh nhac kieu [[x.png]] / markdown KHONG bi coi la mo coi",
      all("wiki.png" not in i["file"] and "md.png" not in i["file"]
          for i in C["orphan"]["list"]), C["orphan"]["list"])

# --- check contract ---
check("3 thieu truong frontmatter = 1 (Gamma thieu aliases+summary)",
      C["frontmatter"]["total"] == 1
      and set(C["frontmatter"]["list"][0]["missing"]) == {"aliases", "summary"},
      C["frontmatter"]["list"])
check("3 tags dang YAML list nhieu dong KHONG bi bao thieu",
      all("Eps" not in i["file"] for i in C["frontmatter"]["list"]), C["frontmatter"]["list"])
check("3 file nhi phan chua mo nilon = 1 (Beta/data.xlsx)",
      C["digest"]["total"] == 1 and C["digest"]["list"][0]["file"] == "Work/Beta/Beta.md",
      C["digest"]["list"])
check("3 note da khai file_digest thi sach (Eps)",
      all("Eps" not in i["file"] for i in C["digest"]["list"]), C["digest"]["list"])
check("3 nguon luat bao da nap", rep["rules"]["loaded"] is True, rep["rules"])

# --- W41: tag vocabulary · index 1 tag · title = ten file = H1 ---
check("3b tag ngoai vocabulary = 1 (Theta: tag-tu-che)",
      C["tag"]["total"] == 1 and C["tag"]["list"][0]["missing"] == ["tag-tu-che"],
      C["tag"]["list"])
check("3b tag trong vocabulary KHONG bi bao (JXM, hoai-niem, index)",
      all("Eps" not in i["file"] and "Alpha" not in i["file"] for i in C["tag"]["list"]),
      C["tag"]["list"])
check("3b index sai tag = 2 (index thua tag content + note thuong muon tag index)",
      C["index_tag"]["total"] == 2,
      [(i["file"], i["detail"]) for i in C["index_tag"]["list"]])
check("3b index sai tag chi dung 2 thu pham",
      {os.path.basename(i["file"]) for i in C["index_tag"]["list"]}
      == {"Index - Work.md", "Iota.md"},
      [i["file"] for i in C["index_tag"]["list"]])
T = {os.path.basename(i["file"]): i["detail"] for i in C["title"]["list"]}
check("3b title lech = 5 (title!=file · H1!=title · thieu H1 · ngoai le troi · ngoai le mo coi)",
      C["title"]["total"] == 5, T)
check("3b bat title != ten file (Kappa)", "title" in T.get("Kappa.md", ""), T)
check("3b bat H1 != title (Lambda)", "H1" in T.get("Lambda.md", ""), T)
check("3b bat note khong co H1 (Mu)", "H1" in T.get("Mu.md", ""), T)
check("3b ngoai le da khai thi SACH (Ngoai Le + Ba Chan pin ca H1 rieng)",
      "Ngoai Le.md" not in T and "Ba Chan.md" not in T, T)
check("3b ngoai le KHONG phai mien kiem: title troi tiep van bi bat",
      "Ngoai Le Troi.md" in T and "ngoai le" in T["Ngoai Le Troi.md"].lower(), T)
check("3b ngoai le khai cho note khong con ton tai bi bao",
      any("Khong Con Nua" in i["detail"] for i in C["title"]["list"]),
      [i["detail"] for i in C["title"]["list"]])
check("3b tong so van de = 14", rep["problems"] == 14,
      {c["id"]: c["total"] for c in rep["checks"]})

# --- thieu nguon luat: contract TAT em, cau truc van chay ---
rep2 = ITG.collect(vault=VAULT_DIR, rules_dir=EMPTY_RULES, use_cache=False)
C2 = by_id(rep2)
check("4 thieu vault-rules.json -> ca 5 check contract available=False",
      not any(C2[k]["available"]
              for k in ("frontmatter", "digest", "tag", "index_tag", "title")), rep2["rules"])
check("4 check cau truc VAN chay khi thieu nguon luat",
      all(C2[k]["available"] for k in ("link", "embed", "anchor", "orphan")))
check("4 problems chi con phan cau truc = 4", rep2["problems"] == 4,
      {c["id"]: c["total"] for c in rep2["checks"]})
check("4 rules.reason noi ro vi sao tat", bool(rep2["rules"].get("reason")), rep2["rules"])

# --- thieu LE mot khoa policy: chi check do tat ---
rep3 = ITG.collect(vault=VAULT_DIR, rules_dir=PARTIAL_RULES, use_cache=False)
C3 = by_id(rep3)
check("4b thieu index_rule/title_rule -> dung 2 check do tat",
      not C3["index_tag"]["available"] and not C3["title"]["available"], rep3["rules"])
check("4b cac check contract khac VAN chay (frontmatter/digest/tag)",
      all(C3[k]["available"] for k in ("frontmatter", "digest", "tag")), rep3["rules"])

# --- cache theo chu ky mtime ---
a = ITG.collect(vault=VAULT_DIR, rules_dir=RULES_DIR)
b = ITG.collect(vault=VAULT_DIR, rules_dir=RULES_DIR)
check("5 goi 2 lan lien tiep tra CUNG object (cache chu ky)", a is b)
w("Work/Zeta/Zeta.md", fm("Zeta") + "[[Cung Khong Ton Tai]]\n")
c = ITG.collect(vault=VAULT_DIR, rules_dir=RULES_DIR)
check("5 them note gay -> cache tu het han, dem lai", c is not a and by_id(c)["link"]["total"] == 2,
      by_id(c)["link"]["list"])

# --- ham thuan + tien ich ---
check("6 is_ignored bat gate_ignore o CUOI khoi frontmatter dai",
      ITG.is_ignored("X", "---\ntitle: X\nsummary: \"%s\"\ngate_ignore: true\n---\n\n# X\n"
                     % ("z" * 900)))
check("6 is_ignored KHONG an nham dong gate_ignore trong THAN note",
      not ITG.is_ignored("X", "---\ntitle: X\n---\n\n# X\n\ngate_ignore: true\n"))
check("6 split_target tach alias + anchor",
      ITG.split_target("Note#Heading|alias") == ("Note", "Heading"))
check("6 _title_problems im khi note THIEU han title (check frontmatter da bao roi)",
      ITG._title_problems({"stem": "X", "h1": None}, "", None, True) == [])
check("6 _title_problems: khop du bo ba thi rong",
      ITG._title_problems({"stem": "X", "h1": "X"}, "X", None, True) == [])
check("6 build_integrity la ham thuan (now truyen vao)",
      ITG.build_integrity(ITG.scan_vault(VAULT_DIR), now=123.0)["generated"] == 123.0)

print("\nKET QUA: " + ("FAIL %d muc: %s" % (len(fails), ", ".join(fails)) if fails else "ALL PASS"))
sys.exit(1 if fails else 0)
