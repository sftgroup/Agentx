import paramiko
import os

host = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

key_dir = r'C:\Users\apply\AppData\Local\Temp\tmpxp9fg0pi'
with open(os.path.join(key_dir, 'id_rsa.pub')) as f:
    pubkey = f.read().strip()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

cmd = f'mkdir -p ~/.ssh && echo "{pubkey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
stdin, stdout, stderr = client.exec_command(cmd)
stdout.channel.recv_exit_status()

stdin, stdout, stderr = client.exec_command(
    'echo "===OS===" && cat /etc/os-release | head -4 && '
    'echo "===NODE===" && node -v 2>/dev/null || echo "NO_NODE" && '
    'echo "===NPM===" && npm -v 2>/dev/null || echo "NO_NPM" && '
    'echo "===PSQL===" && psql --version 2>/dev/null || echo "NO_PSQL" && '
    'echo "===REDIS===" && redis-cli --version 2>/dev/null || echo "NO_REDIS" && '
    'echo "===PM2===" && pm2 -v 2>/dev/null || echo "NO_PM2" && '
    'echo "===GIT===" && git --version 2>/dev/null || echo "NO_GIT" && '
    'echo "===DISK===" && df -h / | tail -1 && '
    'echo "===MEM===" && free -h | head -2 && '
    'echo "===PORTS===" && ss -tlnp 2>/dev/null | head -20 && '
    'echo "===DOCKER===" && docker --version 2>/dev/null || echo "NO_DOCKER" && '
    'echo "===UFW===" && sudo ufw status 2>/dev/null || echo "NO_UFW"'
)
out = stdout.read().decode()
err = stderr.read().decode()

client.close()

print(out)
if err:
    print("STDERR:", err)
