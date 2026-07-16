import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=10)

stdin, stdout, stderr = c.exec_command("tail -15 /tmp/gw.log 2>/dev/null || echo NO_GW_LOG")
print("GW LOG:", stdout.read().decode()[:500])

stdin, stdout, stderr = c.exec_command(
    "ps aux 2>/dev/null | awk '/agentx-gateway/ || /node.*dist.index.js/ || /3000/ || /3090/' | awk '!/(awk|grep)/' | head -5"
)
print("PROCS:", stdout.read().decode()[:300])

stdin, stdout, stderr = c.exec_command("ls /home/ubuntu/agentx-gateway/dist/index.js 2>/dev/null && echo DIST_OK || echo NO_DIST")
print("DIST:", stdout.read().decode()[:100])

c.close()
