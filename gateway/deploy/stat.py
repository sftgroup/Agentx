import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command("tail -8 /tmp/agentx-deploy.log 2>/dev/null")
print("LOG:", stdout.read().decode()[:500])

stdin, stdout, stderr = c.exec_command("ps aux | grep -v grep | grep -E 'next|npm' | head -3")
print("PROC:", stdout.read().decode()[:300])

stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 3000 || echo NO_PORT")
print("PORT:", stdout.read().decode()[:200])

stdin, stdout, stderr = c.exec_command("ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo BUILD_OK || echo NO_BUILD")
print("BUILD:", stdout.read().decode()[:200])

c.close()
