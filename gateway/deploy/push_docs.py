import paramiko, base64, tarfile, os

HOST = '43.156.78.59'
PWD = 'Asdf1234!'

# Create tar of key docs + changed source files
root = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx'
tar_path = r'c:\Users\apply\Downloads\code\agentx_docs_push.tar.gz'

files_to_push = [
    'README.md',
    'INTEGRATION.md',
    'DEPLOYMENT.md',
    'MCP_SETUP.md',
    'memory/AGENTX_PROGRESS.md',
    'sdk/README.md',
    'sdk/package.json',
    'sdk/src/config/config.ts',
    'frontend/next.config.js',
    'frontend/.env.production',
    'frontend/app/a2a/page.tsx',
    'frontend/app/user/chat/[agentId]/page.tsx',
    'contracts/src/erc8004-extensions/A2AProtocolRegistry.sol',
]

print("Creating tar...")
with tarfile.open(tar_path, 'w:gz') as tar:
    for f in files_to_push:
        full = os.path.join(root, f)
        if os.path.exists(full):
            tar.add(full, arcname=f)
            print(f"  + {f}")
        else:
            print(f"  MISSING: {f}")

size_kb = os.path.getsize(tar_path) // 1024
print(f"\n{size_kb} KB")

# Upload
print("\nUploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tar_path, '/tmp/agentx_push.tar.gz')
s.close()
t.close()

# Push script
push_script = '''#!/bin/bash
set -e
cd /home/ubuntu/agentx-platform
# Extract updated files
tar xzf /tmp/agentx_push.tar.gz
echo "Files extracted"

# Check git
cd /home/ubuntu/workspace/agentx 2>/dev/null || cd /home/ubuntu/agentx-platform
if [ -d .git ]; then
    git add -A
    git diff --cached --stat
    git commit -m "docs: update to v0.6.2 — production 164 server, A2A v2 dual-chain, MCP setup guide" 2>&1 || echo "No changes to commit"
    git push origin main 2>&1 || echo "Push failed, check remote"
    echo "PUSH_DONE"
else
    echo "NO_GIT_REPO"
fi
'''

b64 = base64.b64encode(push_script.encode()).decode()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=15)

# First list git repos
stdin, stdout, stderr = c.exec_command("find /home/ubuntu -name '.git' -type d 2>/dev/null | head -10")
print("Git repos:", stdout.read().decode().strip())

# Also check what's in workspace
stdin, stdout, stderr = c.exec_command("ls /home/ubuntu/ 2>/dev/null")
print("Home:", stdout.read().decode().strip())

# Execute push
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/push.sh && chmod +x /tmp/push.sh && bash /tmp/push.sh 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print("\n=== Push Result ===")
print(out)
if err:
    print("ERR:", err[-500:])

c.close()
