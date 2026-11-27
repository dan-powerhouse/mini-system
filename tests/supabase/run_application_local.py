#!/usr/bin/env python3
"""Run all application HTTP groups on an already running disposable local Supabase stack."""
import argparse
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.parse_args()
    directory = Path(__file__).resolve().parent
    failed = []
    for script in ('smoke.py', 'run_mcp_local.py', 'exchange_workflows.py'):
        print(f'Running {script}', flush=True)
        result = subprocess.run(
            [sys.executable, str(directory / script), '--confirm-disposable'],
            cwd=directory.parents[1],
        )
        if result.returncode:
            failed.append(script)
    if failed:
        print('Failed application groups: ' + ', '.join(failed), file=sys.stderr)
    return int(bool(failed))


if __name__ == '__main__':
    sys.exit(main())
