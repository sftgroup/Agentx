import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd):
    print(f"> {cmd[:130]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-600:])
    if err: print("E:", err[-400:])
    return ec, out, err

# symlink
run("export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces")

# Sepolia - address as positional arg
print("\n===== SEPOLIA =====")
ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    "--rpc-url https://ethereum-sepolia-rpc.publicnode.com "
    "--private-key 0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e "
    "--legacy "
    "0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F 2>&1"
)

# OxaChain
print("\n===== OXACHAIN L1 =====")
ec, out, err = run(
    "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    "forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    "--rpc-url http://43.156.99.215:18545 "
    "--private-key 0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e "
    "--legacy "
    "0xbf5F9db266c8c97E3334466C88597Eb758AfE212 2>&1"
)

c.close()
