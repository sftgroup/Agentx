import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command(
    "grep -B2 -A20 'Build error' /tmp/agentx-deploy.log 2>/dev/null | head -30; "
    "echo '===FILES==='; ls /home/ubuntu/agentx-platform/app/ 2>/dev/null | head -5; "
    "echo '===PKG==='; head -5 /home/ubuntu/agentx-platform/package.json 2>/dev/null"
)
print(stdout.read().decode())
c.close()
