import paramiko
import subprocess, sys

pk = '0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e'
sep_ir = '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F'
ox_ir = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'
sep_rpc = 'https://ethereum-sepolia-rpc.publicnode.com'
ox_rpc = 'http://43.156.99.215:18545'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd):
    print(f"> {cmd[:130]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-400:])
    if err: print("STDERR:", err[-400:])
    return ec, out, err

# Ensure symlink exists
run("cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces && echo LINK_OK")

# Deploy Sepolia
print("\n=== SEPOLIA ===")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {sep_rpc} --private-key {pk} --legacy "
    f'--constructor-args $(cast abi-encode "constructor(address)" {sep_ir}) '
    f"2>&1"
)
sep_addr = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        sep_addr = line.split(':')[-1].strip()
        print(f"\n*** SEPOLIA A2A: {sep_addr}")

# Deploy OxaChain
print("\n=== OXACHAIN L1 ===")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {ox_rpc} --private-key {pk} --legacy "
    f'--constructor-args $(cast abi-encode "constructor(address)" {ox_ir}) '
    f"2>&1"
)
ox_addr = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        ox_addr = line.split(':')[-1].strip()
        print(f"\n*** OXACHAIN A2A: {ox_addr}")

c.close()

print("\n============================================")
print(f"SEPOLIA_A2A={sep_addr}")
print(f"OXACHAIN_A2A={ox_addr}")
print("============================================")

if sep_addr:
    with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\a2a_addresses.txt', 'w') as f:
        f.write(f"SEPOLIA_A2A={sep_addr}\n")
        f.write(f"OXACHAIN_A2A={ox_addr}\n")
