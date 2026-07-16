import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command("tail -15 /tmp/agentx-deploy.log 2>/dev/null; echo '---PROCESS---'; ps aux | grep -E 'next|npm|node' | grep -v grep | head -5")
print(stdout.read().decode())
c.close()
