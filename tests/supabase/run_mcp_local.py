#!/usr/bin/env python3
"""Run MCP HTTP suites against the exact adapter and disposable local Supabase."""
import argparse
from pathlib import Path
import subprocess
import sys

from local_adapter import local_adapter
from smoke import local_keys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.parse_args()

    results = []
    with local_adapter('mcp', *local_keys()):
        for filename, flags in [
            ('mcp_read_smoke.py', ['--direct-deno']),
            ('golden_path.py', []),
            ('registry_workflows.py', []),
            ('oauth_mcp.py', []),
        ]:
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name(filename)), '--confirm-disposable', *flags]
            )
            results.append(result.returncode)
    return int(any(results))


if __name__ == '__main__':
    sys.exit(main())
