"""Call the official MCP server via stdio; supports --list or tool + JSON args."""
import asyncio
import json
import os
from pathlib import Path
import sys
from datetime import timedelta

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]

async def main():
    env = dict(os.environ, BLENDER_MCP_HOST='127.0.0.1', BLENDER_MCP_PORT='9877')
    params = StdioServerParameters(command=sys.executable, args=['-m', 'blmcp'], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=3600)) as session:
            await session.initialize()
            if sys.argv[1] == '--list':
                response = await session.list_tools()
            else:
                args = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8')) if len(sys.argv) > 2 else {}
                response = await session.call_tool(sys.argv[1], args)
            print(response.model_dump_json(indent=2))

asyncio.run(main())
