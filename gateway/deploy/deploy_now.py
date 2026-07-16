import paramiko

pk = 'REMOVED_PRIVATE_KEY'
SEP_ARGS = '0x000000000000000000000000e94ad380d3f8d08a7590eda0c84f354a93f96e5f'
OX_ARGS  = '0x000000000000000000000000bf5f9db266c8c97e3334466c88597eb758afe212'
SEP_RPC  = 'https://ethereum-sepolia-rpc.publicnode.com'
OX_RPC   = 'http://43.156.99.215:18545'
FMT = 'src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='REMOVED_CREDENTIAL', timeout=30)

def run(cmd):
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-500:])
    if err: print("STDERR:", err[-400:])
    return ec, out, err

# Ensure symlink
run("export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces")

# Deploy Sepolia
print("\n========== SEPOLIA ==========")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create {FMT} --rpc-url {SEP_RPC} --private-key {pk} --legacy "
    f"--constructor-args {SEP_ARGS} 2>&1"
)
for line in (out + err).split('\n'):
    if any(w in line for w in ['Deployed to', 'Transaction', 'Error', 'Block', 'Gas']):
        print(f"  {line.strip()}")

# Deploy OxaChain
print("\n========== OXACHAIN L1 ==========")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create {FMT} --rpc-url {OX_RPC} --private-key {pk} --legacy "
    f"--constructor-args {OX_ARGS} 2>&1"
)
for line in (out + err).split('\n'):
    if any(w in line for w in ['Deployed to', 'Transaction', 'Error', 'Block', 'Gas']):
        print(f"  {line.strip()}")

c.close()
