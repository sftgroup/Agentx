import paramiko

# User's Sepolia private keys
pks = [
    '0x9ff7f5511067c86fdd8c1dee11799e4778e4b1e86e5093d53eae8d4af356a424',
    '0x23632a1517bc5c41a8f21d9e2818231f7878335d2d22e41274fc5ad067ab631b',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)

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
