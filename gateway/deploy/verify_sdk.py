import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)

# Check port
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 8080")
print("PORT:", stdout.read().decode().strip())

# Check SDK version
stdin, stdout, stderr = c.exec_command(
    "cat /home/ubuntu/agentx-platform/node_modules/@agentxv2/sdk/package.json | python3 -c \"import sys,json; print(json.load(sys.stdin)['version'])\""
)
print("SDK:", stdout.read().decode().strip())

# HTTP check
stdin, stdout, stderr = c.exec_command("curl -sI http://localhost:8080/ 2>&1 | head -2")
print("HTTP:", stdout.read().decode().strip())

c.close()
