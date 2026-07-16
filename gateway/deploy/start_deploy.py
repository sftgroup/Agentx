import paramiko

transport = paramiko.Transport(('43.156.78.59', 22))
transport.connect(username='ubuntu', password='Asdf1234!')
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\deploy_a2a_bg.sh', '/tmp/deploy_a2a_bg.sh')
sftp.close()
transport.close()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=15)

# First test cast abi-encode
stdin, stdout, stderr = c.exec_command(
    "export PATH=$HOME/.foundry/bin:$PATH && "
    "cast abi-encode 'constructor(address)' 0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F 2>&1",
    timeout=15
)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print(f"cast abi-encode test: {out}")
if err: print(f"err: {err}")

# Start deploy in background
print("\n=== Starting background deploy ===")
stdin, stdout, stderr = c.exec_command(
    "chmod +x /tmp/deploy_a2a_bg.sh && nohup bash /tmp/deploy_a2a_bg.sh &>/dev/null & echo 'PID='$!",
    timeout=10
)
print(stdout.read().decode().strip())

c.close()
print("\nDeploy running in background on server...")
print("Will check results in a moment")
