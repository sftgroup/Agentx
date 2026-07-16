import paramiko

# User's Sepolia private keys
pks = [
    'REMOVED_PRIVATE_KEY',
    'REMOVED_PRIVATE_KEY',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='REMOVED_CREDENTIAL', timeout=10)

for i, pk in enumerate(pks):
    print(f"\n=== PK {i+1} ===")
    stdin, stdout, stderr = c.exec_command(
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cast w a {pk} 2>&1"
    )
    addr = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err:
        print(f"  Error: {err}")
        continue
    print(f"  Address: {addr}")
    
    stdin, stdout, stderr = c.exec_command(
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cast balance {addr} --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>&1"
    )
    bal = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  Sepolia wei: {bal}")

c.close()
