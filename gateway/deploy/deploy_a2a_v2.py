import paramiko
import tarfile
import os
import time
import base64

host = '43.156.78.59'
pk = '0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e'
SEP_IR = '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F'
OX_IR  = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'
SEP_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
OX_RPC  = 'http://43.156.99.215:18545'

local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\contracts'
tar_path = r'c:\Users\apply\Downloads\code\agentx_contracts.tar.gz'

print("=== Creating tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'lib', 'out', 'cache', 'broadcast', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.json') and 'out' in root: continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"{os.path.getsize(tar_path)} bytes")

# Upload
transport = paramiko.Transport((host, 22))
transport.connect(username='ubuntu', password='Asdf1234!')
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(tar_path, '/tmp/a2a_contracts.tar.gz')
sftp.close()
transport.close()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username='ubuntu', password='Asdf1234!', timeout=30)

def run(ssh_client, cmd, desc=""):
    print(f"\n[{desc}] > {cmd[:130]}")
    stdin, stdout, stderr = ssh_client.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-600:])
    if err: print("STDERR:", err[-300:])
    return ec, out, err

# Step 1: Extract
run(c, "cd /tmp && rm -rf a2a_build && mkdir a2a_build && cd a2a_build && tar xzf /tmp/a2a_contracts.tar.gz && echo OK")

# Step 2: Init git + install forge deps
print("\n=== Git init + install deps ===")
run(c, "cd /tmp/a2a_build && git init && git add . && git commit -m init 2>&1 | tail -3", "git init")
run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge install foundry-rs/forge-std 2>&1 | tail -5", "forge-std")
run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 2>&1 | tail -5", "oz")

# Verify deps
print("\n=== Verify deps ===")
ec, out, err = run(c, "ls /tmp/a2a_build/lib/forge-std/src/Script.sol && ls /tmp/a2a_build/lib/openzeppelin-contracts/contracts/access/Ownable.sol && echo DEPS_OK")
if ec != 0:
    run(c, "ls -la /tmp/a2a_build/lib/ 2>&1", "check lib")
    exit(1)

# Step 3: Write foundry.toml
toml = """[profile.default]
solc = "0.8.24"
via_ir = true
optimizer = true
optimizer_runs = 200
evm_version = "paris"
remappings = [
    "@openzeppelin/=lib/openzeppelin-contracts/",
    "forge-std/=lib/forge-std/src/"
]
"""
b64 = base64.b64encode(toml.encode()).decode()
run(c, f"echo '{b64}' | base64 -d > /tmp/a2a_build/foundry.toml && echo written")

# Step 4: Build
print("\n=== FORGE BUILD ===")
ec, out, err = run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge build 2>&1 | tail -15", "build")
if ec != 0:
    print("Trying with auto-detect solc...")
    run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge build 2>&1 | tail -20")
    exit(1)

# Step 5: Deploy Sepolia
print("\n=========================================")
print("  SEPOLIA DEPLOY")
print("=========================================")
ec, out, err = run(c,
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {SEP_RPC} --private-key {pk} --constructor-args {SEP_IR} --legacy 2>&1",
    "deploy Sepolia")

sep_addr = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        sep_addr = line.split(':')[-1].strip()
        print(f"\n>>> SEPOLIA A2A deployed to: {sep_addr}")

# Step 6: Deploy OxaChain
print("\n=========================================")
print("  OXACHAIN L1 DEPLOY")
print("=========================================")
ec, out, err = run(c,
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {OX_RPC} --private-key {pk} --constructor-args {OX_IR} --legacy 2>&1",
    "deploy OxaChain")

ox_addr = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        ox_addr = line.split(':')[-1].strip()
        print(f"\n>>> OXACHAIN A2A deployed to: {ox_addr}")

# Step 7: Verify Sepolia
if sep_addr:
    print("\n=== Verifying Sepolia ===")
    run(c,
        f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
        f"forge verify-contract {sep_addr} src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
        f"--verifier blockscout --verifier-url 'https://eth-sepolia.blockscout.com/api/' "
        f"--constructor-args $(cast abi-encode 'constructor(address)' {SEP_IR}) 2>&1 | tail -10",
        "verify")

# Step 8: Verify OxaChain
if ox_addr:
    print("\n=== Verifying OxaChain ===")
    run(c,
        f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
        f"forge verify-contract {ox_addr} src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
        f"--verifier blockscout --verifier-url 'http://43.156.99.215:18400/api/' "
        f"--constructor-args $(cast abi-encode 'constructor(address)' {OX_IR}) 2>&1 | tail -10",
        "verify")

c.close()

print("\n============================================")
print(f"  Sepolia A2A:     {sep_addr}")
print(f"  OxaChain L1 A2A: {ox_addr}")
print("============================================")

if sep_addr or ox_addr:
    with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\a2a_addresses.txt', 'w') as f:
        f.write(f"SEPOLIA_A2A={sep_addr}\n")
        f.write(f"OXACHAIN_A2A={ox_addr}\n")
