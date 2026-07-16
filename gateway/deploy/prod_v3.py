import paramiko
import tarfile
import os
import time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

# 1. Create tar
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend'
tar_path = r'c:\Users\apply\Downloads\code\agentx_fe_prod.tar.gz'
sh_path  = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\prod_setup.sh'

print("=== Creating tar ===")
count = 0
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.tsbuildinfo') or f == 'pnpm-lock.yaml': continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1
print(f"{count} files, {os.path.getsize(tar_path)//1024} KB")

# 2. Upload both files via SFTP
print("\n=== Uploading ===")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
sftp = paramiko.SFTPClient.from_transport(t)
sftp.put(tar_path, '/tmp/agentx_fe.tar.gz')
sftp.put(sh_path, '/tmp/agentx_setup.sh')
sftp.close()
t.close()

# 3. Start deploy via exec_command (don't read stdout for nohup)
print("\n=== Triggering deploy ===")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=10)

# Use channel directly to avoid read timeout on nohup
channel = c.get_transport().open_session()
channel.exec_command(
    "rm -rf /home/ubuntu/agentx-platform && mkdir -p /home/ubuntu/agentx-platform && "
    "chmod +x /tmp/agentx_setup.sh && "
    "nohup bash /tmp/agentx_setup.sh > /tmp/agentx-deploy.log 2>&1 & disown; echo 'OK'"
)
time.sleep(2)
# Read what we can
try:
    out = channel.recv(1024).decode()
    print(f"Trigger: {out.strip()}")
except:
    print("Trigger: launched (no output)")
channel.close()
c.close()

print("\n=== Deploy running. Polling... ===")

# 4. Poll log every 30s
for attempt in range(25):
    time.sleep(30)
    try:
        c2 = paramiko.SSHClient()
        c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c2.connect(HOST, username='ubuntu', password=PWD, timeout=10)
        stdin, stdout, stderr = c2.exec_command(
            "tail -10 /tmp/agentx-deploy.log 2>/dev/null"
        )
        out = stdout.read().decode().strip()
        # Show last meaningful line
        lines = [l for l in out.split('\n') if l.strip()]
        if lines:
            print(f"[{attempt+1}] {lines[-1][:200]}")
        
        if 'DONE' in out:
            print("\n✅ DEPLOY COMPLETE!")
            c2.close()
            break
        if '=== next build ===' in out and attempt > 0:
            # Build just started
            if 'Compiled' in out or 'Static' in out:
                print(f"  Build output seen...")
        
        c2.close()
    except Exception as e:
        print(f"[{attempt+1}] Poll error: {e}")
        continue
else:
    print("\nTimeout waiting for deploy. Check log manually.")

# 5. Verify
print("\n=== Verification ===")
c3 = paramiko.SSHClient()
c3.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c3.connect(HOST, username='ubuntu', password=PWD, timeout=10)
stdin, stdout, stderr = c3.exec_command(
    "echo 'Port:'; ss -tlnp | grep 3000; echo 'HTTP:'; curl -sI http://localhost:3000/ 2>&1 | head -3"
)
print(stdout.read().decode())
c3.close()
