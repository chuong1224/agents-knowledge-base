# -*- coding: utf-8 -*-
"""Test P2.2 — xac minh danh tinh PID truoc khi taskkill. CHAM (~15s, spawn process that) — selfcheck chi chay khi --slow. Scratch trong %TEMP%."""
import os, subprocess, sys, time
sys.dont_write_bytecode = True   # khong sinh __pycache__ trong vault

from _scratch import SCRATCH, G3D
sys.path.insert(0, G3D)
import run_graph3d as RG

fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (("  ->  " + repr(info)) if not cond else ""))
    if not cond:
        fails.append(name)

def alive(p):
    return p.poll() is None

# t1: doc duoc cmdline cua chinh minh
cmd = RG._pid_cmdline(os.getpid())
check("t1 _pid_cmdline doc duoc (chua 'python')", cmd is not None and "python" in cmd.lower(), cmd)

# t2: process LA (khong phai graph3d) -> TU CHOI kill, van song
foreign = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
try:
    time.sleep(0.5)
    r = RG.kill_pid(foreign.pid)
    time.sleep(0.5)
    check("t2a kill_pid tu choi process la (return False)", r is False, r)
    check("t2b process la VAN SONG", alive(foreign))
finally:
    foreign.kill()

# t3: process cmdline chua serve.py -> BI giet nhu truoc
fake = os.path.join(SCRATCH, "serve.py")
open(fake, "w").write("import time; time.sleep(120)\n")
zombie = subprocess.Popen([sys.executable, fake])
try:
    time.sleep(0.5)
    r = RG.kill_pid(zombie.pid)
    time.sleep(1.2)
    check("t3a kill_pid chap nhan zombie serve.py (return True)", r is True, r)
    check("t3b zombie DA CHET", not alive(zombie))
finally:
    if alive(zombie):
        zombie.kill()
    os.remove(fake)

# t4: pid rong -> True (khong co gi de giet, di tiep)
check("t4 kill_pid(None) = True", RG.kill_pid(None) is True)

# t5: TICH HOP — app la giu port, supervisor phai bo cuoc exit 2, app song
PORT = 8397
holder = subprocess.Popen([sys.executable, "-c",
    "import socket, time; s = socket.socket(); s.bind(('127.0.0.1', %d)); s.listen(1); time.sleep(120)" % PORT])
try:
    time.sleep(1.0)
    run = subprocess.run([sys.executable, os.path.join(G3D, "run_graph3d.py"), "--port", str(PORT)],
                         capture_output=True, text=True, timeout=60)
    check("t5a supervisor bo cuoc voi exit code 2", run.returncode == 2, run.returncode)
    check("t5b co thong diep 'process KHAC'", "process KHAC" in run.stdout, run.stdout[-300:])
    check("t5c app la VAN SONG sau khi supervisor bo cuoc", alive(holder))
finally:
    holder.kill()

print("\nTONG KET:", ("FAIL %d muc" % len(fails)) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
