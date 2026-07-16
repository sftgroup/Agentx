import paramiko
import time
import os
import tarfile

host_fe = '43.156.78.59'
password = 'Asdf1234!'

local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe_src.tar.gz'

# Recreate tar
print("=== Creating tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.tsbuildinfo'): continue
            if f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"Size: {os.path.getsize(tar_path)}")

# Upload via SFTP
c = paramiko.Transport((host_fe, 22))
c.connect(username='ubuntu', password=password)
sftp = paramiko.SFTPClient.from_transport(c)

print("=== Uploading tar ===")
sftp.put(tar_path, '/tmp/fe_src.tar.gz')
sftp.close()
c.close()

# Now run SSH commands
def run(cmd):
    c2 = paramiko.SSHClient()
    c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c2.connect(host_fe, username='ubuntu', password=password, timeout=15)
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = c2.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out and len(out) > 0: print(out[-600:])
    if err and 'deprecat' not in err.lower() and 'warn' not in err.lower(): print("ERR:", err[-300:])
    c2.close()
    return ec, out

# Extract source over existing agentx-platform
print("\n=== Extracting source files ===")
run("cd /tmp && rm -rf fe_src && mkdir fe_src && cd fe_src && tar xzf /tmp/fe_src.tar.gz && echo extracted")

# Copy source files to agentx-platform (overwrite changed files only)
run("cp -r /tmp/fe_src/app/* /home/ubuntu/agentx-platform/app/ && cp -r /tmp/fe_src/components/* /home/ubuntu/agentx-platform/components/ && cp -r /tmp/fe_src/hooks/* /home/ubuntu/agentx-platform/hooks/ && cp /tmp/fe_src/.env.local /home/ubuntu/agentx-platform/ && cp /tmp/fe_src/.env.production /home/ubuntu/agentx-platform/ && cp /tmp/fe_src/package.json /home/ubuntu/agentx-platform/ && echo 'source copied'")

# Remove old build
print("\n=== Cleaning ===")
run("rm -rf /home/ubuntu/agentx-platform/.next && echo cleaned")

# Install new SDK
print("\n=== Install SDK ===")
run("cd /home/ubuntu/agentx-platform && npm install @agentxv2/sdk@0.6.1 2>&1 | tail -5")

# Kill old server
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 2; echo done")

# Build
print("\n=== Building ===")
ec, out = run("cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -30")
print(f"BUILD EXIT CODE: {ec}")

# Check
ec, out = run("ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo BUILD_OK || echo BUILD_FAILED")
if 'FAILED' in out:
    print("BUILD FAILED - aborting")
    exit(1)

# Start
print("\n=== Starting ===")
run("cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-final.log 2>&1 &")
time.sleep(6)
run("ss -tlnp | grep 8080")
run("tail -5 /tmp/fe-final.log")

print("\n=== DONE! ===")
