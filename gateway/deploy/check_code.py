import os

root = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'

checks = {
    'SDK package.json': 'sdk/package.json',
    'SDK v0.6.2': ('sdk/package.json', '0.6.2'),
    'SDK Sepolia A2A': ('sdk/src/config/config.ts', '0x309C7447d89f3087A9924BB686d88df020F7e9cB'),
    'SDK OxaChain A2A': ('sdk/src/config/config.ts', '0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B'),
    'Frontend A2A page': 'frontend/app/a2a/page.tsx',
    'Frontend chat page': 'frontend/app/user/chat/[agentId]/page.tsx',
    'next.config ignoreBuildErrors': ('frontend/next.config.js', 'ignoreBuildErrors: true'),
    'Gateway src/index': 'gateway/src/index.ts',
    'Gateway routes/chat': 'gateway/src/routes/chat.ts',
    'Gateway middleware/auth': 'gateway/src/middleware/auth.ts',
    'A2A Solidity getUserTasks': ('contracts/src/erc8004-extensions/A2AProtocolRegistry.sol', 'getUserTasks'),
    'AgentLoop': 'sdk/src/agent-loop/index.ts',
    'LLM module': 'sdk/src/llm/index.ts',
    '.env.production GATEWAY': ('frontend/.env.production', '43.156.225.164:3090'),
    'PROGRESS.md': 'memory/AGENTX_PROGRESS.md',
    'README.md': 'README.md',
    'INTEGRATION.md': 'INTEGRATION.md',
}

all_ok = True
for name, path in checks.items():
    if isinstance(path, tuple):
        fname, keyword = path
    else:
        fname, keyword = path, None
    full = os.path.join(root, fname)
    if not os.path.exists(full):
        print(f'MISSING: {name}')
        all_ok = False
    elif keyword:
        with open(full, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        if keyword in content:
            print(f'OK: {name}')
        else:
            print(f'CONTENT MISSING: {name} - keyword not found')
            all_ok = False
    else:
        print(f'OK: {name}')

print()
print('CODEBASE COMPLETE' if all_ok else 'CODEBASE HAS ISSUES')
