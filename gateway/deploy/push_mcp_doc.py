import paramiko, base64

with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\MCP_SETUP.md', 'r', encoding='utf-8') as f:
    mcp_doc = f.read()

b1 = base64.b64encode(mcp_doc.encode()).decode()

push = f'''#!/bin/bash
set -e
cd /tmp
rm -rf agentx-mcp-doc
git clone git@github.com:sftgroup/Agentx.git agentx-mcp-doc
cd agentx-mcp-doc
echo '{b1}' | base64 -d > MCP_SETUP.md
git add MCP_SETUP.md
git diff --cached --stat
git commit -m "docs: MCP_SETUP rewrite — AgentX platform MCP Server usage for Claude Desktop, Cursor, any MCP client" 2>&1
git push origin main 2>&1
echo "PUSH_OK"
'''

pb = base64.b64encode(push.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)
stdin, stdout, stderr = c.exec_command(f"echo '{pb}' | base64 -d | bash 2>&1")
print(stdout.read().decode())
c.close()
