"""Start the official Blender MCP add-on without changing user preferences."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'blender-mcp' / 'addon'))
from blender_mcp_addon.cli import cli_execute

raise SystemExit(cli_execute(['--host', '127.0.0.1', '--port', '9877']))
