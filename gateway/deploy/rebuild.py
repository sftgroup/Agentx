import paramiko
import base64, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

# Verify env
stdin, stdout, stderr = c.exec_command("grep A2A /home/ubuntu/agentx-platform/.env.production")
print("ENV:", stdout.read().decode().strip())

# Clean previous
stdin, stdout, stderr = c.exec_command("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; pkill -f 'next build' 2>/dev/null; sleep 2; echo cleaned")
print(stdout.read().decode().strip())

# Build (env-only change, should be fast incremental)
print("\n=== Building... ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -15",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
ec = stdout.channel.recv_exit_status()
print(out)
if err: print("ERR:", err[-200:])
print(f"Exit: {ec}")

if ec != 0:
    print("FAILED")
    c.close()
    exit(1)

# Start
print("\n=== Starting ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-final2.log 2>&1 &",
    timeout=5
)
time.sleep(5)
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 8080")
print("PORT:", stdout.read().decode().strip())
stdin, stdout, stderr = c.exec_command("tail -2 /tmp/fe-final2.log")
print("LOG:", stdout.read().decode().strip())

c.close()
print("\nDONE")
