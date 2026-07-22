#!/usr/bin/env python3
"""
Hybrid recommender system- API GATEWAY
==============================
Single entry point on port 8085 that proxies all 4 microservices.

Run from the folder that contains all 4 service files:
  python gateway.py

Docs: http://localhost:8085/docs
"""

import subprocess
import sys
import os
import time
import signal
import socket
import threading
from pathlib import Path
from contextlib import asynccontextmanager

# Windows' default console codepage (cp1252) can't encode the emoji used in
# this file's own print()s below- gateway.py sets UTF-8 env vars for the
# CHILD services it spawns, but that doesn't affect its own stdout. Without
# this, the process crashes on the first emoji print before any service
# even starts.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# ── AUTO-INSTALL ──────────────────────────────────────────────
for pkg in ["fastapi", "uvicorn", "httpx"]:
    try:
        __import__(pkg)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── SERVICE REGISTRY ─────────────────────────────────────────

SERVICES = {
    "feed": {
        "name": "Job Feed Recommender",
        "file": "feed_recommender.py",
        "port": 8002,
        "prefix": "/feed",
        "description": "Personalized job feed scoring (Profile 40%, Search 20%, Views 15%, Recency 5%, Popularity 10%)",
        "endpoints": [
            "POST /feed/score  - Score and rank jobs for a candidate",
            "GET  /feed/health - Health check",
        ],
    },
    "search": {
        "name": "ML Job Search",
        "file": "ml_search.py",
        "port": 8001,
        "prefix": "/search",
        "description": "5-level priority NLP job search",
        "endpoints": [
            "GET  /search/search?q=query - Search jobs",
            "GET  /search/health         - Health check",
            "POST /search/refresh        - Refresh job index",
            "GET  /search/logs/all       - View all logs",
        ],
    },
    "hybrid": {
        "name": "Hybrid Job Recommender + AI Job Matcher (merged)",
        "file": "hybrid_job_recommender.py",
        "port": 8003,
        "prefix": "/hybrid",
        "description": "Content + collaborative-filtering (PyTorch MF) + behavior hybrid job recommendations, merged in-process with the 4-factor Matcher (Skills 40%, Qualifications 25%, Experience 20%, Preferences 15%)- one process now serves both the /hybrid/* and /matcher/* prefixes (see route_matcher below).",
        "endpoints": [
            "POST /hybrid/score              - Ranked jobs for a candidate_id",
            "POST /hybrid/score/combined     - Matcher+hybrid blended feed",
            "POST /hybrid/refresh            - Retrain hybrid models from current DB state",
            "GET  /hybrid/health             - Hybrid health check",
            "POST /matcher/match             - Match candidate against ALL jobs",
            "POST /matcher/match/job/{job_id}- Match candidate against a specific job",
            "GET  /matcher/health            - Matcher health check",
            "GET  /matcher/stats             - Matcher cache statistics",
            "GET  /matcher/logs/{log_type}   - View matcher logs",
        ],
    },
}

GATEWAY_PORT  = int(os.environ.get("GATEWAY_PORT", "8085"))
QUICK_WAIT    = 60    # seconds for initial startup check
STARTUP_WAIT  = 300   # seconds for background watcher
POLL_INTERVAL = 2

# ── WORKING DIRECTORY ────────────────────────────────────────
# Always resolve relative to THIS file so the gateway can be
# launched from any directory and still find the service files.
SERVICES_DIR = Path(__file__).resolve().parent

# ── PROCESS MANAGER ──────────────────────────────────────────

processes: dict = {}
service_status: dict = {k: "starting" for k in SERVICES}
log_files: dict = {}   # key → Path of per-service log file


def _kill_port(port: int):
    """Kill whatever is already using a port (Windows + Unix)."""
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(["taskkill", "/PID", pid, "/F"],
                                   capture_output=True)
                    print(f"  🔫 Killed PID {pid} that was holding port {port}")
        except Exception:
            pass
    else:
        try:
            subprocess.run(["fuser", "-k", f"{port}/tcp"],
                           capture_output=True)
        except Exception:
            pass


def start_service(key: str, svc: dict):
    file_path = SERVICES_DIR / svc["file"]
    if not file_path.exists():
        print(f"  ️  '{svc['file']}' not found- {svc['name']} will NOT start")
        service_status[key] = "missing"
        return

    # Free the port if something is already on it- and always say so either
    # way, so the log makes clear whether the port was already free or had
    # to be freed, instead of only speaking up on the problem case.
    if _port_open(svc["port"]):
        print(f"  ️  Port {svc['port']} already in use- attempting to free it…")
        _kill_port(svc["port"])
        time.sleep(1)
        if _port_open(svc["port"]):
            print(f"  ❌ Port {svc['port']} still in use after kill attempt- {svc['name']} may fail to bind")
        else:
            print(f"  ✓ Port {svc['port']} freed")
    else:
        print(f"  ✓ Port {svc['port']} free")

    # Log file for this service (next to the service file). Truncated on
    # every start- these previously accumulated forever across restarts
    # (search_service.log alone reached 21MB in one dev session), which made
    # "check the log" mean scrolling past megabytes of unrelated old runs.
    log_path = SERVICES_DIR / f"{key}_service.log"
    log_files[key] = log_path
    log_fh = open(log_path, "w", encoding="utf-8")
    log_fh.write(f"===== RUN STARTED {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
    log_fh.flush()

    print(f"  Starting {svc['name']} (port {svc['port']})…")
    print(f"     Log: {log_path}")

    # Fix Windows cp1252 UnicodeEncodeError- emoji in print() crash child processes
    env = os.environ.copy()
    env["PYTHONUTF8"]        = "1"
    env["PYTHONIOENCODING"]  = "utf-8"

    proc = subprocess.Popen(
        [sys.executable, str(file_path)],
        cwd=str(SERVICES_DIR),
        stdout=log_fh,
        stderr=log_fh,
        env=env,
    )
    processes[key] = proc
    print(f"     PID {proc.pid}")


def stop_all():
    for key, proc in processes.items():
        if proc.poll() is None:
            print(f"  🛑 Stopping {SERVICES[key]['name']} (PID {proc.pid})…")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def _proc_alive(key: str) -> bool:
    proc = processes.get(key)
    return proc is not None and proc.poll() is None


def wait_for_one(key: str, port: int, timeout: int):
    deadline = time.time() + timeout
    while time.time() < deadline:
        # Check if the process crashed
        if not _proc_alive(key):
            service_status[key] = "crashed"
            _print_crash_log(key)
            return False
        if _port_open(port):
            service_status[key] = "up"
            return True
        time.sleep(POLL_INTERVAL)
    # Timed out but process still alive → still loading
    if _proc_alive(key):
        service_status[key] = "starting"
    else:
        service_status[key] = "crashed"
        _print_crash_log(key)
    return False


def _print_crash_log(key: str, tail_lines: int = 30):
    """Print the last N lines of a service log when it crashes."""
    log_path = log_files.get(key)
    if not log_path or not Path(log_path).exists():
        return
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        last = lines[-tail_lines:] if len(lines) > tail_lines else lines
        print(f"\n  ━━━ {SERVICES[key]['name']} crash log (last {len(last)} lines) ━━━")
        for line in last:
            print("  │ " + line.rstrip())
        print(f"  ━━━ full log: {log_path} ━━━\n")
    except Exception as e:
        print(f"  Could not read log: {e}")


def background_status_watcher():
    pending = {k for k, v in service_status.items() if v == "starting"}
    deadline = time.time() + STARTUP_WAIT

    while pending and time.time() < deadline:
        time.sleep(POLL_INTERVAL)
        for key in list(pending):
            if not _proc_alive(key):
                service_status[key] = "crashed"
                print(f"\n  ❌ {SERVICES[key]['name']} CRASHED")
                _print_crash_log(key)
                pending.discard(key)
                continue
            if _port_open(SERVICES[key]["port"]):
                service_status[key] = "up"
                print(f"\n   {SERVICES[key]['name']} is now UP on port {SERVICES[key]['port']} 🎉")
                pending.discard(key)

    for key in pending:
        if service_status[key] == "starting":
            service_status[key] = "timeout"
            print(f"\n  ⏰ {SERVICES[key]['name']} timed out- check log: {log_files.get(key)}")


# ── SIGNAL HANDLER ───────────────────────────────────────────

def signal_handler(sig, frame):
    print("\n\n🔴 Shutdown signal received…")
    stop_all()
    sys.exit(0)

signal.signal(signal.SIGINT,  signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ── HTTP CLIENT ──────────────────────────────────────────────

http_client: httpx.AsyncClient | None = None

# ── LIFESPAN ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=300.0)  # 5 minutes for AI processing

    print("\n" + "=" * 65)
    print("🌐  Hybrid recommender system- API GATEWAY")
    print(f"  Services folder: {SERVICES_DIR}")
    print("=" * 65)

    # Launch services in parallel
    threads = [
        threading.Thread(target=start_service, args=(k, s), daemon=True)
        for k, s in SERVICES.items()
    ]
    for t in threads: t.start()
    for t in threads: t.join()

    # Quick startup check (60 s)- also detects immediate crashes
    print(f"\n  ⏳ Startup check ({QUICK_WAIT}s)…")
    check_threads = [
        threading.Thread(
            target=wait_for_one,
            args=(k, s["port"], QUICK_WAIT),
            daemon=True,
        )
        for k, s in SERVICES.items()
        if k in processes
    ]
    for t in check_threads: t.start()
    for t in check_threads: t.join()

    print()
    for key, svc in SERVICES.items():
        st = service_status[key]
        icons = {
            "up":       ("", "ready"),
            "missing":  ("️ ", "file not found- skipped"),
            "crashed":  ("💥", f"CRASHED- check {log_files.get(key)}"),
            "starting": ("⏳", f"still loading… (background watcher active, up to {STARTUP_WAIT//60} min)"),
            "timeout":  ("⏰", "timed out"),
        }
        icon, note = icons.get(st, ("❓", st))
        print(f"  {icon}  {svc['name']:35s} :{svc['port']}  {note}")

    still_loading = [k for k, v in service_status.items() if v == "starting"]
    if still_loading:
        print(f"\n  ℹ️  Gateway is OPEN. Slow services announce when ready.")
        threading.Thread(target=background_status_watcher, daemon=True).start()

    print(f"\n  🌐 Gateway : http://localhost:{GATEWAY_PORT}")
    print(f"  📚 Docs    : http://localhost:{GATEWAY_PORT}/docs")
    print("=" * 65 + "\n")

    yield

    stop_all()
    # A shutdown-time failure here (observed: anyio backend lookup breaking
    # mid-interpreter-teardown) must not crash the whole shutdown sequence-
    # that turns a normal pm2 restart into a crash-then-recover cycle, which
    # is exactly what makes the CI health check flaky right after a deploy.
    # The process is exiting either way, so the socket gets cleaned up
    # regardless of whether this close call succeeds.
    try:
        await http_client.aclose()
    except Exception as e:
        print(f"  ️  http_client.aclose() failed during shutdown (non-fatal): {e}")

# ── APP ──────────────────────────────────────────────────────

app = FastAPI(
    title="Hybrid recommender system- API Gateway",
    description=(
        "Single entry point for all SimuHire microservices.\n\n"
        "| Prefix | Service |\n"
        "|--------|---------|\n"
        "| `/matcher` | AI Job Matcher |\n"
        "| `/search`  | ML Job Search |\n"
        "| `/feed`    | Job Feed Recommender |\n"
        "| `/hybrid`  | Hybrid Job Recommender |\n"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── PROXY ────────────────────────────────────────────────────

async def proxy(request: Request, target_port: int, strip_prefix: str | None) -> Response:
    """strip_prefix=None forwards the path unchanged -- used for /matcher, which
    (since the merge) lands on the same process as /hybrid and needs its own
    /matcher/... routes intact rather than stripped down to a bare path that
    would collide with /hybrid's own bare-path routes on that same port."""
    path = request.url.path
    if strip_prefix is not None and path.startswith(strip_prefix):
        path = path[len(strip_prefix):] or "/"

    url = f"http://127.0.0.1:{target_port}{path}"
    if request.url.query:
        url += f"?{request.url.query}"

    body    = await request.body()
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "content-length")}

    try:
        upstream = await http_client.request(
            method=request.method, url=url, headers=headers, content=body
        )
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            headers=dict(upstream.headers),
        )
    except httpx.ConnectError:
        key = next((k for k, s in SERVICES.items() if s["port"] == target_port), None)
        st  = service_status.get(key, "unknown")
        log = str(log_files.get(key, "")) if key else ""
        return JSONResponse(
            status_code=503,
            content={
                "error":          "Service unavailable",
                "service":        SERVICES[key]["name"] if key else str(target_port),
                "service_status": st,
                "detail": (
                    "Service is still loading- please wait and retry."
                    if st == "starting"
                    else f"Service is {st}. Check log: {log}"
                ),
            },
        )
    except Exception as exc:
        return JSONResponse(
            status_code=502, content={"error": "Bad gateway", "detail": str(exc)}
        )

# ── ROUTES ───────────────────────────────────────────────────

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

@app.api_route("/feed",               methods=METHODS)
@app.api_route("/feed/{path:path}",   methods=METHODS)
async def route_feed(request: Request, path: str = ""):
    return await proxy(request, 8002, "/feed")

@app.api_route("/matcher",             methods=METHODS)
@app.api_route("/matcher/{path:path}", methods=METHODS)
async def route_matcher(request: Request, path: str = ""):
    # Merged into the hybrid process (port 8003) -- forward the full
    # "/matcher/..." path unchanged (no prefix stripping) since the merged
    # app's own /matcher routes expect it, unlike /hybrid's bare paths below.
    return await proxy(request, 8003, None)

@app.api_route("/search",              methods=METHODS)
@app.api_route("/search/{path:path}",  methods=METHODS)
async def route_search(request: Request, path: str = ""):
    return await proxy(request, 8001, "/search")

@app.api_route("/hybrid",              methods=METHODS)
@app.api_route("/hybrid/{path:path}",  methods=METHODS)
async def route_hybrid(request: Request, path: str = ""):
    return await proxy(request, 8003, "/hybrid")

# ── GATEWAY ENDPOINTS ────────────────────────────────────────

@app.get("/", tags=["Gateway"])
async def root():
    return {
        "gateway": "Hybrid recommender system API Gateway",
        "version": "1.0.0",
        "port": GATEWAY_PORT,
        "docs": f"http://localhost:{GATEWAY_PORT}/docs",
        "services": {
            key: {
                "name":           svc["name"],
                "description":    svc["description"],
                "prefix":         svc["prefix"],
                "internal_port":  svc["port"],
                "current_status": service_status.get(key, "unknown"),
                "log_file":       str(log_files.get(key, "")),
                "endpoints":      svc["endpoints"],
            }
            for key, svc in SERVICES.items()
        },
    }


@app.get("/health", tags=["Gateway"])
async def gateway_health():
    statuses = {}
    for key, svc in SERVICES.items():
        live = _port_open(svc["port"])
        if live:
            service_status[key] = "up"
        statuses[key] = {
            "name":     svc["name"],
            "port":     svc["port"],
            "status":   "up" if live else service_status.get(key, "down"),
            "log_file": str(log_files.get(key, "")),
        }
    all_up = all(s["status"] == "up" for s in statuses.values())
    return {"gateway": "up", "all_services_up": all_up, "services": statuses}


@app.get("/logs/{service_key}", tags=["Gateway"])
async def view_service_log(service_key: str, lines: int = 50):
    """Read the last N lines of a service's startup log."""
    if service_key not in SERVICES:
        return JSONResponse(status_code=404, content={"error": f"Unknown service '{service_key}'"})
    log_path = log_files.get(service_key)
    if not log_path or not Path(log_path).exists():
        return {"service": service_key, "log": "No log file yet."}
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        last = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {
            "service":    service_key,
            "log_file":   str(log_path),
            "total_lines": len(all_lines),
            "showing":    len(last),
            "content":    "".join(last),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ── ENTRY POINT ──────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("🌐  Hybrid recommender system- API GATEWAY  v1.0.0")
    print("=" * 65)
    print(f"  Single port : http://localhost:{GATEWAY_PORT}")
    print(f"  Services dir: {SERVICES_DIR}")
    print()
    for key, svc in SERVICES.items():
        exists = "" if (SERVICES_DIR / svc["file"]).exists() else "❌ NOT FOUND"
        print(f"  /{key:<10} → {svc['name']} (:{svc['port']})  {exists}")
    print(f"\n  Docs: http://localhost:{GATEWAY_PORT}/docs")
    print("=" * 65 + "\n")

    # Free our own port too- a prior gateway run that didn't shut down cleanly
    # (or crashed after starting its sub-services) can leave a stale process
    # bound to GATEWAY_PORT, which makes every subsequent start fail with
    # "only one usage of each socket address" before the app even boots.
    #push
    if _port_open(GATEWAY_PORT):
        print(f"  ️  Port {GATEWAY_PORT} already in use- attempting to free it…")
        _kill_port(GATEWAY_PORT)
        time.sleep(1)

    uvicorn.run(app, host="0.0.0.0", port=GATEWAY_PORT)
