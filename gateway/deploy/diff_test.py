import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)

# Check what was modified on test server directly
cmds = [
    "echo '=== A2A page ===' && grep 'A2A_REGISTRY\\|A2A_PROTOCOL' /home/ubuntu/agentx-platform/app/a2a/page.tsx 2>/dev/null | head -5",
    "echo '=== next.config ===' && head -10 /home/ubuntu/agentx-platform/next.config.js 2>/dev/null",
    "echo '=== SDK config (if exists) ===' && grep -r 'a2aProtocolRegistry' /home/ubuntu/agentx-platform/node_modules/@agentxv2/sdk/dist/ 2>/dev/null | head -5",
    "echo '=== gateway src ===' && ls /tmp/a2a_build/src/erc8004-extensions/ 2>/dev/null",
]

for cmd in cmds:
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode().strip()
    if out: print(out)
    err = stderr.read().decode().strip()
    if err: print("E:", err[:200])

c.close()
