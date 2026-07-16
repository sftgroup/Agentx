import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

# Kill everything
c.exec_command("pkill -f 'npm install' 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 2; echo 'killed'", timeout=10)

# Check what's left
stdin, stdout, stderr = c.exec_command("ps aux | grep -v grep | grep -E 'next|npm' | head -3 || echo 'none'")
print("After kill:", stdout.read().decode()[:200])

# Now do npm install cleanly
print("\n=== npm install --legacy-peer-deps ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && npm install --legacy-peer-deps 2>&1 | tail -8",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("ERR:", err[-300:])

# Verify next exists
stdin, stdout, stderr = c.exec_command("ls /home/ubuntu/agentx-platform/node_modules/next/package.json && echo 'NEXT_OK'")
print(stdout.read().decode())

c.close()
