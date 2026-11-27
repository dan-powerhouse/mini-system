"""Run an exact Edge entry point under pinned Deno on an isolated test machine."""
from contextlib import contextmanager
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request

from smoke import BASE, check

FUNCTIONS = Path(__file__).resolve().parents[2] / 'supabase' / 'functions'
ADAPTER_URL = 'http://127.0.0.1:8000'


@contextmanager
def local_adapter(name, public, service):
    version = subprocess.check_output(['deno', '--version'], text=True).splitlines()[0]
    check(version.split()[1] == '2.9.6', 'Use Deno 2.9.6')
    # Refuse a live listener on 8000. SO_REUSEADDR (as Deno uses) tolerates the
    # TIME_WAIT left by the previous adapter run, which is not a conflict.
    with socket.socket() as port:
        port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        port.bind(('0.0.0.0', 8000))
    settings = {
        'SUPABASE_URL': BASE,
        'SUPABASE_SERVICE_ROLE_KEY': service,
        'SUPABASE_ANON_KEY': public,
        'MCP_ALLOWED_HOSTS': '127.0.0.1:54321',
        'MCP_ALLOWED_ORIGINS': '',
    }
    workdir = FUNCTIONS / 'mcp' if name == 'mcp' else FUNCTIONS
    entrypoint = 'index.ts' if name == 'mcp' else f'{name}/index.ts'
    # The application entry points listen on port 8000. Run on an isolated
    # disposable machine and never publish this port to external clients.
    with subprocess.Popen(
        ['deno', 'run', '--frozen', '--allow-net=127.0.0.1:54321,0.0.0.0:8000',
         # Optional current-key settings are readable (unset) so the real lookup path runs.
        '--allow-env=' + ','.join([*settings, 'REGISTRY_PUBLISHABLE_KEY', 'REGISTRY_SECRET_KEY', 'EXCHANGE_CLEANUP_SECRET']), entrypoint],
        cwd=workdir, env={**os.environ, **settings},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ) as child:
        try:
            probe = urllib.request.Request(
                ADAPTER_URL, method='POST' if name == 'mcp' else 'GET',
                headers={'Host': '127.0.0.1:54321'},
            )
            expected = 405 if name == 'import' else 401
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                check(child.poll() is None, f'{name} adapter exited during startup')
                try:
                    with urllib.request.urlopen(probe, timeout=1):
                        pass
                except urllib.error.HTTPError as error:
                    with error:
                        if error.code == expected:
                            break
                except (urllib.error.URLError, TimeoutError):
                    pass
                time.sleep(0.2)
            else:
                raise RuntimeError(f'{name} adapter did not become ready')
            yield
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
