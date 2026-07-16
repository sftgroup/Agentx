import paramiko
import time
import tarfile
import os

# Step 1: Tar the frontend source (excluding node_modules/.next) and upload to gateway server
gateway_host = '101.33.109.117'
frontend_host = '43.156.78.59'
password = 'Asdf1234!'
ubuntu = 'ubuntu'

local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe.tar.gz'

print("=== Creating tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    count = 0
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1
print(f"{count} files, {os.path.getsize(tar_path)} bytes")

# Step 2: Upload to gateway server
c1 = paramiko.SSHClient()
c1.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c1.connect(gateway_host, username=ubuntu, password=password, timeout=10)

sftp = c1.open_sftp()
print("\n=== Uploading to gateway server ===")
sftp.put(tar_path, '/tmp/agentx_fe.tar.gz')
sftp.close()

def run(client, cmd, desc=""):
    print(f"[{desc}] > {cmd[:100]}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out and len(out) > 0: print(out[-400:])
    if err and 'warn' not in err.lower() and 'deprecated' not in err.lower(): print("ERR:", err[-300:])
    return ec, out, err

# Extract
print("\n=== Extracting ===")
run(c1, "cd /tmp && rm -rf agentx_fe && mkdir agentx_fe && cd agentx_fe && tar xzf /tmp/agentx_fe.tar.gz && echo extracted")

# Install dependencies
print("\n=== npm install ===")
run(c1, "cd /tmp/agentx_fe && npm install 2>&1 | tail -5", "install")

# Build
print("\n=== Building ===")
run(c1, "cd /tmp/agentx_fe && npx next build 2>&1 | tail -20", "build")

# Check build
print("\n=== Verify build ===")
run(c1, "ls /tmp/agentx_fe/.next/BUILD_ID 2>/dev/null && echo 'BUILD OK' || echo 'BUILD FAILED'")
run(c1, "ls /tmp/agentx_fe/.next/ | head -10")

# If build succeeded, tar .next and node_modules and upload to frontend server
ec, out, err = run(c1, "test -f /tmp/agentx_fe/.next/BUILD_ID && echo FOUND")
if 'FOUND' not in out:
    print("BUILD FAILED - checking error log")
    run(c1, "cat /tmp/agentx_fe/.next/trace 2>/dev/null || echo 'no trace'")
    c1.close()
    exit(1)

# Pack build output
print("\n=== Packing build ===")
run(c1, "cd /tmp/agentx_fe && tar czf /tmp/agentx_fe_build.tar.gz .next node_modules package.json ecosystem.config.js next.config.js .env.local .env.production 2>&1", "pack")

# Upload to frontend server via scp from gateway
print("\n=== SCP to frontend server ===")
# Generate the scp command
run(c1, f"sshpass -p '{password}' scp -o StrictHostKeyChecking=no /tmp/agentx_fe_build.tar.gz ubuntu@{frontend_host}:/tmp/")

# Deploy on frontend server
print("\n=== Deploy on frontend ===")
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(frontend_host, username=ubuntu, password=password, timeout=10)

run(c2, "fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1; echo done")
run(c2, "cd /tmp && rm -rf /tmp/agentx_deploy && mkdir /tmp/agentx_deploy && cd /tmp/agentx_deploy && tar xzf /tmp/agentx_fe_build.tar.gz && echo extracted")
run(c2, "rm -rf /home/ubuntu/agentx-platform/.next && cp -r /tmp/agentx_deploy/.next /home/ubuntu/agentx-platform/")

# Update node_modules if needed
# Copy just the updated sdk
run(c2, "cp -r /tmp/agentx_deploy/node_modules/@agentxv2 /home/ubuntu/agentx-platform/node_modules/ 2>/dev/null || echo 'SKIP node_modules'")

# Copy new env files
run(c2, "cp /tmp/agentx_deploy/.env.local /home/ubuntu/agentx-platform/ 2>/dev/null && echo env-copied || echo NOPE")
run(c2, "cp /tmp/agentx_deploy/.env.production /home/ubuntu/agentx-platform/ 2>/dev/null && echo env-prod-copied || echo NOPE")

# Start
print("\n=== Starting frontend ===")
run(c2, "cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/next-final.log 2>&1 &")
time.sleep(5)
run(c2, "ss -tlnp | grep 8080")
run(c2, "curl -sI http://localhost:8080/ 2>&1 | head -3")
run(c2, "tail -5 /tmp/next-final.log")

c1.close()
c2.close()
print("\n=== ALL DONE ===")
