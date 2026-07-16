import paramiko
import base64

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

# Upload .env.production
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\.env.production', 'r') as f:
    env = f.read()
b64 = base64.b64encode(env.encode()).decode()
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/.env.production && echo 'env ok' && grep A2A /home/ubuntu/agentx-platform/.env.production"
)
print(stdout.read().decode())

# Kill old + build + start
print("\n=== Building ===")
stdin, stdout, stderr = c.exec_command(
    "fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 1; "
    "cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -15",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
ec = stdout.channel.recv_exit_status()
print(out)
if err: print("ERR:", err[-300:])
print(f"Build exit: {ec}")

if ec != 0:
    print("BUILD FAILED")
    c.close()
    exit(1)

# Start
print("\n=== Starting ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-a2av2.log 2>&1 &",
    timeout=5
)
import time; time.sleep(5)

stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 8080")
print(stdout.read().decode())
stdin, stdout, stderr = c.exec_command("tail -2 /tmp/fe-a2av2.log")
print(stdout.read().decode())

c.close()
print("\n=== DONE ===")
