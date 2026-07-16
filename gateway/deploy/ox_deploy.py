import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)

# 1. Check balance
print("=== Checking OxaChain balance ===")
stdin, stdout, stderr = c.exec_command(
    "export PATH=$HOME/.foundry/bin:$PATH && "
    "cast balance 0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103 --rpc-url http://43.156.99.215:18545 2>&1"
)
bal = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print(f"Balance: {bal} wei")
if err: print(f"Error: {err}")

if bal == '0':
    print("BALANCE STILL 0 - aborting")
    c.close()
    exit(1)

# 2. Start deploy in background
print("\n=== Starting OxaChain L1 A2A deploy ===")
stdin, stdout, stderr = c.exec_command(
    "chmod +x /tmp/deploy_a2a_v2.sh && nohup bash /tmp/deploy_a2a_v2.sh &>/dev/null & echo 'PID='$!",
    timeout=10
)
print(stdout.read().decode().strip())

c.close()
print("\nDeploy running on server... will check results shortly")
