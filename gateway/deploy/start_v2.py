import paramiko

transport = paramiko.Transport(('43.156.78.59', 22))
transport.connect(username='ubuntu', password='Asdf1234!')
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\deploy_a2a_v2.sh', '/tmp/deploy_a2a_v2.sh')
sftp.close()
transport.close()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=15)

# Check OxaChain balance
stdin, stdout, stderr = c.exec_command(
    "export PATH=$HOME/.foundry/bin:$PATH && "
    "cast balance 0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103 --rpc-url http://43.156.99.215:18545 2>&1",
    timeout=15
)
ox_bal = stdout.read().decode().strip()
print(f"OxaChain L1 balance: {ox_bal} wei")

# Start deploy
stdin, stdout, stderr = c.exec_command(
    "chmod +x /tmp/deploy_a2a_v2.sh && nohup bash /tmp/deploy_a2a_v2.sh &>/dev/null & echo 'PID='$!",
    timeout=10
)
print(stdout.read().decode().strip())
c.close()
