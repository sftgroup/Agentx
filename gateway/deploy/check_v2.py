import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)
stdin, stdout, stderr = c.exec_command('cat /tmp/a2a_deploy2.log 2>/dev/null || echo "NO V2 LOG"; echo "---"; ps aux | grep forge | grep -v grep')
out = stdout.read().decode()
print(out)
c.close()
