import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

print("=== Restarting Gateway ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-gateway && "
    "nohup node dist/index.js > /tmp/gw.log 2>&1 & disown; "
    "sleep 3; echo 'started'",
    timeout=10
)
print(stdout.read().decode().strip())

time.sleep(2)

print("\n=== Port Status ===")
stdin, stdout, stderr = c.exec_command(
    "ss -tlnp | awk '/3000|3090|5432/ && !/awk/'"
)
print(stdout.read().decode())

print("\n=== Gateway Health ===")
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3090/api/v1/health 2>&1")
print(stdout.read().decode())

c.close()
