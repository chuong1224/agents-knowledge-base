# -*- coding: utf-8 -*-
"""W180 — Vault Switcher: config, picker contract and live active-vault routing."""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.dont_write_bytecode = True
from _scratch import G3D, SCRATCH

CASE = os.path.join(SCRATCH, "vault_switcher")
shutil.rmtree(CASE, ignore_errors=True)
os.makedirs(CASE)
CONFIG = os.path.join(CASE, "local", "vaults.json")
os.environ["GRAPH3D_VAULT_CONFIG"] = CONFIG
sys.path.insert(0, G3D)
import vault_switcher as VS

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)


app = os.path.join(CASE, "appvault", ".graph3d")
external = os.path.join(CASE, "Vault A")
other = os.path.join(CASE, "Vault B")
empty = os.path.join(CASE, "Empty Vault")
os.makedirs(app)
os.makedirs(external)
os.makedirs(other)
os.makedirs(empty)
with open(os.path.join(external, "Only External.md"), "w", encoding="utf-8") as f:
    f.write("---\ntitle: Only External\n---\n# Only External\n")
with open(os.path.join(external, "Unsafe.svg"), "w", encoding="utf-8") as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg"><script>top.pwned=1</script></svg>')
with open(os.path.join(other, "Only Other.md"), "w", encoding="utf-8") as f:
    f.write("---\ntitle: Only Other\n---\n# Only Other\n")

# A selected folder is data, never a trusted Python source. If serve.py imported this
# historical Work Map engine from the active vault, merely opening /work would create
# the sentinel (arbitrary code execution).
work_dir = os.path.join(external, "Vault Operation", "Work Map", "attachments")
os.makedirs(work_dir)
sentinel = os.path.join(CASE, "UNTRUSTED-WORK-PY-RAN")
with open(os.path.join(work_dir, "work.py"), "w", encoding="utf-8") as f:
    f.write("from pathlib import Path\nPath(%r).write_text('bad')\n" % sentinel)
with open(os.path.join(work_dir, "work.json"), "w", encoding="utf-8") as f:
    json.dump({"agents": [], "gates": [], "groups": [], "items": []}, f)

# The public clone is intentionally not installed inside the maintainer's vault, so it
# has no trusted app-vault Work Map engine. Inject a harmless engine explicitly: the
# behavior under test is that this trusted source is used while external/work.py is not.
trusted_engine = os.path.join(CASE, "trusted_work.py")
with open(trusted_engine, "w", encoding="utf-8") as f:
    f.write("def export_data(cfg):\n    return {'items': cfg.get('items', [])}\n")

# 1. Pure validation + identity
check("1 empty folder la vault hop le", VS.validate_vault(empty) == os.path.realpath(empty))
check("1 hai root co vault_id khac nhau", VS.vault_id(external) != VS.vault_id(other))
try:
    VS.validate_vault(os.path.join(CASE, "missing"))
    missing_code = ""
except VS.VaultSwitchError as exc:
    missing_code = exc.code
check("1 folder mat tra code not_found", missing_code == "not_found", missing_code)

# 2. Config lives outside vault and restores selection
saved = VS.save_selection(external)
check("2 config ghi active vault", saved["vault"] == os.path.realpath(external), saved)
check("2 config nam ngoai vault", not os.path.realpath(CONFIG).startswith(os.path.realpath(external) + os.sep), CONFIG)
ctx = VS.resolve_active_vault(app)
check("2 resolve doc vault UI da luu", ctx["path"] == os.path.realpath(external), ctx)
check("2 vault UI khong bi locked", ctx["locked"] is False, ctx)

# 3. Stale saved path falls back, explicit path is strict
with open(CONFIG, "w", encoding="utf-8") as f:
    json.dump({"version": 1, "vault": os.path.join(CASE, "gone")}, f)
ctx = VS.resolve_active_vault(app)
check("3 saved path mat fallback app vault", VS.same_vault(ctx["path"], os.path.dirname(app)), ctx)
check("3 fallback co warning not_found", ctx["warning"] == "not_found", ctx)
try:
    VS.resolve_active_vault(app, explicit=os.path.join(CASE, "gone"))
    explicit_code = ""
except VS.VaultSwitchError as exc:
    explicit_code = exc.code
check("3 --vault path mat fail cung", explicit_code == "not_found", explicit_code)

# 4. Native picker wrapper: runner injected, so test never opens a real dialog
class Result:
    returncode = 0
    stderr = ""
    stdout = external
def fake_runner(argv, **kwargs):
    check("4 picker goi PowerShell STA", "-STA" in argv, argv)
    check("4 picker truyen initial qua env", kwargs["env"].get("GRAPH3D_PICK_INITIAL") == other)
    return Result()
picked = VS.choose_folder(other, runner=fake_runner, platform="nt")
check("4 picker tra root da validate", picked == os.path.realpath(external), picked)
Result.stdout = ""
check("4 cancel tra None", VS.choose_folder(other, runner=fake_runner, platform="nt") is None)

# Restore valid config for the live process.
VS.save_selection(external)

def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port

def get_json(url):
    with urllib.request.urlopen(url, timeout=8) as r:
        return r.status, json.loads(r.read().decode("utf-8"))

# 5. Live server routes ALL read surfaces to external active vault.
port = free_port()
env = os.environ.copy()
env[VS.VAULT_ENV] = external
env[VS.LOCKED_ENV] = "0"
env["GRAPH3D_WORKMAP_ENGINE"] = trusted_engine
env["PYTHONDONTWRITEBYTECODE"] = "1"
proc = subprocess.Popen([sys.executable, os.path.join(G3D, "serve.py"),
                         "--port", str(port), "--no-open"],
                        cwd=G3D, env=env, stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL)
base = "http://127.0.0.1:%d" % port
try:
    health = None
    for _ in range(50):
        try:
            _, health = get_json(base + "/health")
            break
        except Exception:
            time.sleep(0.15)
    check("5 live server bao health", bool(health), proc.poll())
    check("5 health dung vault_id", health and health.get("vault_id") == VS.vault_id(external), health)
    _, graph = get_json(base + "/graph-data")
    notes = [n["id"] for n in graph["nodes"] if n["kind"] == "note"]
    check("5 graph chi co note vault ngoai", notes == ["Only External.md"], notes)
    _, state = get_json(base + "/vault-state")
    check("5 vault-state cho phep switch", state["path"] == os.path.realpath(external) and not state["locked"], state)
    bad_host = urllib.request.Request(base + "/vault-state", headers={"Host": "evil.example:%d" % port})
    try:
        urllib.request.urlopen(bad_host, timeout=5)
        bad_host_status = 200
    except urllib.error.HTTPError as exc:
        bad_host_status = exc.code
    check("5 DNS rebinding host khong doc duoc vault-state", bad_host_status == 403, bad_host_status)
    _, integ = get_json(base + "/integrity")
    check("5 integrity do active vault", integ["vault"]["notes"] == 1, integ.get("vault"))
    _, ins = get_json(base + "/insight")
    check("5 insight do active vault", ins["vault"]["notes"] == 1, ins.get("vault"))
    work_status, work = get_json(base + "/work")
    check("5 Work Map dung engine app tin cay", work_status == 200 and work.get("items") == [], work)
    check("5 khong import work.py cua vault duoc chon", not os.path.exists(sentinel), sentinel)
    with urllib.request.urlopen(base + "/asset?path=Unsafe.svg", timeout=5) as asset:
        asset_csp = asset.headers.get("Content-Security-Policy", "")
        asset_nosniff = asset.headers.get("X-Content-Type-Options", "")
    check("5 asset vault ngoai bi sandbox khong script", "sandbox" in asset_csp and
          "allow-scripts" not in asset_csp, asset_csp)
    check("5 asset co nosniff", asset_nosniff == "nosniff", asset_nosniff)
    try:
        urllib.request.urlopen(base + "/ping?type=read&file=Only%20External.md", timeout=5)
        ping_status = 200
    except urllib.error.HTTPError as exc:
        ping_status = exc.code
    check("5 logger khong provenance bi chan o vault ngoai", ping_status == 409, ping_status)
finally:
    try:
        urllib.request.urlopen(base + "/shutdown", timeout=3).read()
    except Exception:
        pass
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()

# 6. Full switch: POST -> save config -> serve exit 4 -> supervisor relaunch -> B.
VS.save_selection(external)
port = free_port()
env = os.environ.copy()
env["GRAPH3D_TESTING"] = "1"
env["GRAPH3D_PICK_TEST_RESULT"] = other
env["GRAPH3D_VAULT_CONFIG"] = CONFIG
env["PYTHONDONTWRITEBYTECODE"] = "1"
sup = subprocess.Popen([sys.executable, os.path.join(G3D, "run_graph3d.py"),
                        "--port", str(port)], cwd=G3D, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = "http://127.0.0.1:%d" % port
try:
    first = None
    for _ in range(70):
        try:
            _, first = get_json(base + "/health")
            if first.get("vault_id") == VS.vault_id(external):
                break
        except Exception:
            pass
        time.sleep(0.15)
    check("6 supervisor mo vault A tu config", first and first.get("vault_id") == VS.vault_id(external), first)
    req = urllib.request.Request(base + "/vault-pick", data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        switched = json.loads(r.read().decode("utf-8"))
    check("6 POST tra target vault B", switched.get("changed") and
          switched.get("vault_id") == VS.vault_id(other), switched)
    second = None
    for _ in range(100):
        try:
            _, second = get_json(base + "/health")
            if (second.get("vault_id") == VS.vault_id(other) and
                    second.get("boot_id") != first.get("boot_id")):
                break
        except Exception:
            pass
        time.sleep(0.15)
    check("6 supervisor relaunch dung vault B + boot moi",
          second and second.get("vault_id") == VS.vault_id(other) and
          second.get("boot_id") != first.get("boot_id"), second)
    _, graph = get_json(base + "/graph-data")
    notes = [n["id"] for n in graph["nodes"] if n["kind"] == "note"]
    check("6 graph sau switch chi con vault B", notes == ["Only Other.md"], notes)
finally:
    try:
        urllib.request.urlopen(base + "/shutdown", timeout=3).read()
    except Exception:
        pass
    try:
        sup.wait(timeout=10)
    except subprocess.TimeoutExpired:
        sup.kill()

shutil.rmtree(CASE, ignore_errors=True)
print("\nTONG KET test_vault_switcher: %s" %
      (("FAIL %d: %s" % (len(fails), ", ".join(fails))) if fails else "ALL PASS"))
sys.exit(1 if fails else 0)
