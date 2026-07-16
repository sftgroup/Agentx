import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command(
    "ss -tlnp 2>/dev/null | grep -E '3000|3090|5432'"
)
print("PORTS:", stdout.read().decode().strip())

stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3090/api/v1/health 2>&1")
print("GW HEALTH:", stdout.read().decode().strip())

stdin, stdout, stderr = c.exec_command("curl -sI http://localhost:3000/ 2>&1 | head -2")
print("FE HTTP:", stdout.read().decode().strip())

c.close()
