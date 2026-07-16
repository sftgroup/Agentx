import paramiko
import base64
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

# Upload updated .env.production
with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\frontend\.env.production', 'r') as f:
    env = f.read()
b64 = base64.b64encode(env.encode()).decode()

stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /home/ubuntu/agentx-platform/.env.production && echo 'env updated' && wc -c /home/ubuntu/agentx-platform/.env.production"
)
print(stdout.read().decode().strip())

# Verify the A2A address in .env
stdin, stdout, stderr = c.exec_command(
    "grep A2A_PROTOCOL /home/ubuntu/agentx-platform/.env.production"
)
print(stdout.read().decode().strip())

# Check balance after deploy
stdin, stdout, stderr = c.exec_command(
    "export PATH=$HOME/.foundry/bin:$PATH && cast balance 0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103 --rpc-url http://43.156.99.215:18545 2>&1"
)
print(f"OxaChain balance: {stdout.read().decode().strip()}")

c.close()
print("\nNow building...")
