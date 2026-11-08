"""Use the official server's transport from the project-local checkout.

This adapter allows the current shell session to use the same official backend
before a host restart discovers its stdio tools. It does not implement a new protocol.
"""
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
os.environ['BLENDER_MCP_HOST'] = '127.0.0.1'
os.environ['BLENDER_MCP_PORT'] = '9877'
source = ROOT / 'tools/blender-mcp/mcp/blmcp/tools_helpers/connection.py'
spec = importlib.util.spec_from_file_location('official_blender_connection', source)
connection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connection)
connection._TIMEOUT = 3600
code = Path(sys.argv[1]).read_text(encoding='utf-8')
response = connection.send_code(code, strict_json=False)
print(json.dumps(response, indent=2))
if response.get('status') != 'ok':
    sys.exit(1)
