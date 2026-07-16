import paramiko
import tarfile
import os
import time

host = '43.156.78.59'

# Create tar of contracts
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\contracts'
tar_path = r'c:\Users\apply\Downloads\code\agentx_contracts.tar.gz'

print("=== Creating contracts tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'lib', 'out', 'cache', 'broadcast', '.git')]
        for f in files:
            if f.endswith('.json') and 'out' in root: continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"Size: {os.path.getsize(tar_path)}")

# Upload via SFTP
print("\n=== Uploading ===")
transport = paramiko.Transport((host, 22))
transport.connect(username='ubuntu', password='Asdf1234!')
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(tar_path, '/tmp/a2a_contracts.tar.gz')
sftp.close()
transport.close()

def run(cmd, desc=""):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username='ubuntu', password='Asdf1234!', timeout=300)
    print(f"[{desc}] > {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-800:])
    if err and 'Warning' not in err and 'warn' not in err.lower(): print("ERR:", err[-300:])
    c.close()
    return ec, out

# Extract
print("\n=== Extracting ===")
run("cd /tmp && rm -rf a2a_contracts && mkdir a2a_contracts && cd a2a_contracts && tar xzf /tmp/a2a_contracts.tar.gz && echo extracted")

# Check if git submodules (forge-std) are present
print("\n=== Checking deps ===")
run("ls /tmp/a2a_contracts/lib/forge-std/src/Script.sol 2>/dev/null && echo 'forge-std OK' || echo 'MISSING forge-std'")
run("ls /tmp/a2a_contracts/lib/openzeppelin-contracts/contracts/access/Ownable.sol 2>/dev/null && echo 'OZ OK' || echo 'MISSING OZ'")

# If deps missing, try to find them elsewhere
print("\n=== Finding existing contract deps ===")
run("find /home -name 'forge-std' -type d -maxdepth 5 2>/dev/null | head -5")
run("find /home -name 'Script.sol' -path '*/forge-std/*' -maxdepth 6 2>/dev/null | head -5")
