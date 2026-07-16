import paramiko, base64

HOST = '43.156.78.59'
PWD = 'Asdf1234!'

push_script = '''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-release
git clone git@github.com:sftgroup/Agentx.git agentx-release

# Create platform-tools.ts from embedded content
cd agentx-release
'''
# Read the platform-tools file and embed it
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\sdk\src\agent-loop\platform-tools.ts', 'r', encoding='utf-8') as f:
    platform_tools_content = f.read()

# Read the updated index.ts
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\sdk\src\agent-loop\index.ts', 'r', encoding='utf-8') as f:
    agent_loop_index = f.read()

# Read package.json
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\sdk\package.json', 'r', encoding='utf-8') as f:
    pkg_json = f.read()

import base64 as b64
b1 = b64.b64encode(platform_tools_content.encode()).decode()
b2 = b64.b64encode(agent_loop_index.encode()).decode()
b3 = b64.b64encode(pkg_json.encode()).decode()

push_script += f'''
echo '{b1}' | base64 -d > sdk/src/agent-loop/platform-tools.ts
echo '{b2}' | base64 -d > sdk/src/agent-loop/index.ts
echo '{b3}' | base64 -d > sdk/package.json

git add -A
git diff --cached --stat
git commit -m "feat: platform-tools — Agent directly calls AgentX contracts via LLM tools

Exposes ALL 7 AgentX platform modules as OpenAI function-calling tools:
- IdentityRegistry (register/get/list/exists/count)
- SubscriptionManager (plan/check/subscribe/cancel/release/fee)
- A2AProtocol (create/get/complete task, card, user tasks)
- ReputationRegistry (rate/get/reviews)
- ConfigurationRegistry (get/list/set)
- MultiEndpointRegistry (list/active/best-mcp)
- Gateway API (chat/tenant/usage/keys/models)

Functions: buildPlatformTools(), executePlatformTool(), wrapPlatformToolsAsSkills()
Usage: mix platform tools with agent skills in AgentLoop for full platform access.
" 2>&1

git push origin main 2>&1
echo "PUSH_OK"

git tag -a v0.6.3 -m "v0.6.3 — Platform Tools: Agent LLM-callable contract wrappers
- 7 modules as 28 built-in OpenAI function-calling tools
- buildPlatformTools() / executePlatformTool() / wrapPlatformToolsAsSkills()
- AgentLoop can now directly register agents, manage subscriptions, create A2A tasks, 
  rate agents, configure settings, and interact with Gateway — all via LLM function calling
" 2>&1

git push origin v0.6.3 2>&1
echo "TAG_OK"
'''

push_b64 = b64.b64encode(push_script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

stdin, stdout, stderr = c.exec_command(
    f"echo '{push_b64}' | base64 -d | bash 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-500:])
c.close()
