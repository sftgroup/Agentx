import paramiko
import time
import os
import tarfile

host_w = '101.33.109.117'  # gateway - has swap + Ubuntu (fast npm)
host_fe = '43.156.78.59'   # frontend - target
password = 'Asdf1234!'

# Step 1: Create a lightweight tar with ONLY the source files (no data files)
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe_src.tar.gz'

print("=== Creating lightweight source tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.tsbuildinfo'): continue
            if f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"Size: {os.path.getsize(tar_path)} bytes")

# Step 2: Upload via SCP to gateway server
print("\n=== Uploading to gateway server ===")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_w, username='ubuntu', password=password, timeout=10)

sftp = c.open_sftp()
sftp.put(tar_path, '/tmp/fe_src.tar.gz')
sftp.close()

def run(client, cmd, desc=""):
    print(f"[{desc}] > {cmd[:120]}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out and len(out) > 0: print(out[-500:])
    if err and 'deprecated' not in err.lower() and 'warn' not in err.lower(): 
        print("ERR:", err[-300:])
    return ec, out, err

# Extract
run(c, "cd /tmp && rm -rf fe_build && mkdir fe_build && cd fe_build && tar xzf /tmp/fe_src.tar.gz && echo extracted")

# Install npm (fast on Ubuntu)
print("\n=== npm install ===")
ec, out, err = run(c, "cd /tmp/fe_build && npm install 2>&1 | tail -10", "npm install")

# Build
print("\n=== next build ===")
ec, out, err = run(c, "cd /tmp/fe_build && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -30", "build")

# Check
ec, out, err = run(c, "test -f /tmp/fe_build/.next/BUILD_ID && echo BUILD_OK && cat /tmp/fe_build/.next/BUILD_ID || echo BUILD_FAILED")
if 'BUILD_FAILED' in out:
    run(c, "tail -30 /tmp/fe_build/.next/trace 2>/dev/null; echo '---'; df -h /tmp")
    c.close()
    sys.exit(1)

# Pack .next
print("\n=== Packing .next ===")
run(c, "cd /tmp/fe_build && tar czf /tmp/fe_next.tar.gz .next .env.local .env.production 2>&1", "pack")

# SCP to frontend server
print("\n=== SCP to frontend ===")
ec, out, err = run(c, f"sshpass -p '{password}' scp -o StrictHostKeyChecking=no /tmp/fe_next.tar.gz ubuntu@{host_fe}:/tmp/fe_next.tar.gz 2>&1", "scp")
if ec != 0:
    print("Trying apt install sshpass...")
    run(c, "sudo apt-get install -y sshpass 2>&1 | tail -3")
    run(c, f"sshpass -p '{password}' scp -o StrictHostKeyChecking=no /tmp/fe_next.tar.gz ubuntu@{host_fe}:/tmp/fe_next.tar.gz 2>&1")

# Deploy on frontend
print("\n=== Deploy on frontend server ===")
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(host_fe, username='ubuntu', password=password, timeout=10)

run(c2, "fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 2; echo cleaned")
run(c2, "cd /tmp && rm -rf /tmp/fe_deploy && mkdir fe_deploy && cd fe_deploy && tar xzf /tmp/fe_next.tar.gz && echo extracted")
run(c2, "rm -rf /home/ubuntu/agentx-platform/.next && cp -r /tmp/fe_deploy/.next /home/ubuntu/agentx-platform/ && echo '.next copied'")
run(c2, "cp /tmp/fe_deploy/.env.local /home/ubuntu/agentx-platform/ 2>/dev/null && echo 'env copied'")
run(c2, "cp /tmp/fe_deploy/.env.production /home/ubuntu/agentx-platform/ 2>/dev/null && echo 'env-prod copied'")

# Start
print("\n=== Starting ===")
run(c2, "cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/next-run.log 2>&1 &")
time.sleep(5)
ec, out, err = run(c2, "ss -tlnp | grep 8080")
run(c2, "tail -5 /tmp/next-run.log")

c.close()
c2.close()
print("\n=== DONE ===")
