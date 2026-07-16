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

# 3. Start background deploy
print("\n=== Starting deploy script ===")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=15)
stdin, stdout, stderr = c.exec_command(
    "rm -rf /home/ubuntu/agentx-platform && mkdir -p /home/ubuntu/agentx-platform && "
    "chmod +x /tmp/agentx_setup.sh && "
    "nohup bash /tmp/agentx_setup.sh > /tmp/agentx-deploy.log 2>&1 & "
    "echo 'PID='$!",
    timeout=10
)
print(stdout.read().decode().strip())
c.close()

print("\nDeploy running in background. Checking progress...")

# 4. Poll log every 30s
for attempt in range(20):
    time.sleep(30)
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(HOST, username='ubuntu', password=PWD, timeout=10)
        stdin, stdout, stderr = c.exec_command(
            "tail -8 /tmp/agentx-deploy.log 2>/dev/null; "
            "echo '---CHECK---'; "
            "ps aux | grep -E 'next (build|start)' | grep -v grep | head -2"
        )
        out = stdout.read().decode()
        print(f"\n[{attempt+1}] {out.strip()[:400]}")
        
        if 'DONE' in out:
            print("\n✅ Deploy completed!")
            c.close()
            break
        if 'FAILED' in out or 'error' in out.lower():
            print("\n⚠️ Check log for errors")
            c.close()
            break
            
        c.close()
    except Exception as e:
        print(f"  Poll error: {e}")
        continue

print("\n=== Verifying ===")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=10)
stdin, stdout, stderr = c.exec_command(
    "ss -tlnp | grep 3000; echo ---; curl -sI http://localhost:3000/ 2>&1 | head -3"
)
print(stdout.read().decode())
c.close()
