import os

root = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
docs = ['README.md', 'INTEGRATION.md', 'DEPLOYMENT.md', 'MCP_SETUP.md', 'sdk/README.md', 'memory/AGENTX_PROGRESS.md']

for d in docs:
    full = os.path.join(root, d)
    if os.path.exists(full):
        with open(full, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        has_oxa = 'OxaChain' in content or '0xbf5F' in content
        has_19505 = '19505' in content
        ok = "OK" if (has_oxa and has_19505) else "MISSING L1"
        print(f"  {ok:12s} {d}")
    else:
        print(f"  MISSING     {d}")
