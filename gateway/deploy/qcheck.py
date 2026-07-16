import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command(
    "tail -10 /tmp/agentx-deploy.log 2>/dev/null; "
    "echo '===PORT==='; ss -tlnp | grep 3000 || echo NONE; "
    "echo '===BUILD==='; ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null || echo NO_BUILD_ID; "
    "echo '===PROC==='; ps aux | grep -E 'next|npm' | grep -v grep | head -3"
)
print(stdout.read().decode())
c.close()
