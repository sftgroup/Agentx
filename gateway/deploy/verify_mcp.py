import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

# Test tools/list
import json
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\''
)
data = json.loads(stdout.read().decode())
tools = data.get('result', {}).get('tools', [])
print(f"MCP tools/list: {len(tools)} tools")
for t in tools[:5]:
    print(f"  - {t['name']}")
print(f"  - ... ({len(tools)-5} more)")

# Test tools/call
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agentx_gateway_health","arguments":{}}}\''
)
data = json.loads(stdout.read().decode())
content = data.get('result', {}).get('content', [])
if content:
    print(f"\nMCP tools/call (health): {content[0].get('text', '')[:200]}")
else:
    print(f"\nMCP tools/call result: {data}")

# Test initialize
stdin, stdout, stderr = c.exec_command(
    'curl -s -X POST http://localhost:3090/mcp -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":3,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}\''
)
data = json.loads(stdout.read().decode())
print(f"\nMCP initialize: server={data.get('result',{}).get('serverInfo',{}).get('name')}")

c.close()
