import paramiko
import tarfile
import os
import time

host = '43.156.78.59'
pk = '0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e'

# SEP and L1 IdentityRegistry addresses
SEP_IR = '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F'
OX_IR  = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'

# RPC URLs
SEP_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
OX_RPC  = 'http://43.156.99.215:18545'

# Tar contracts source (exclude lib since it's empty)
local_dir = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\contracts'
tar_path = r'c:\Users\apply\Downloads\code\agentx_contracts.tar.gz'

print("=== Creating contracts tar ===")
with tarfile.open(tar_path, 'w:gz') as tar:
    count = 0
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'lib', 'out', 'cache', 'broadcast', '.git', '__pycache__')]
        for f in files:
            if f.endswith('.json') and ('out' in root or 'broadcast' in root or 'cache' in root): continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local_dir).replace('\\', '/')
            tar.add(full, arcname=arc)
            count += 1
print(f"{count} files, {os.path.getsize(tar_path)} bytes")

# Upload via SFTP
print("\n=== Uploading ===")
transport = paramiko.Transport((host, 22))
transport.connect(username='ubuntu', password='Asdf1234!')
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(tar_path, '/tmp/a2a_contracts.tar.gz')
sftp.close()
transport.close()

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username='ubuntu', password='Asdf1234!', timeout=30)
    return c

def run(client, cmd, desc=""):
    print(f"\n[{desc}] > {cmd[:130]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-800:])
    if err and 'warn' not in err.lower() and 'deprecated' not in err.lower(): print("STDERR:", err[-300:])
    return ec, out, err

c = ssh()

# Extract
run(c, "cd /tmp && rm -rf a2a_build && mkdir a2a_build && cd a2a_build && tar xzf /tmp/a2a_contracts.tar.gz && echo 'OK'")

# Install forge dependencies
print("\n=== Installing forge deps ===")
run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge install foundry-rs/forge-std --no-commit 2>&1 | tail -5", "forge-std")
run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit 2>&1 | tail -5", "oz")

# Verify deps
run(c, "ls /tmp/a2a_build/lib/forge-std/src/Script.sol && ls /tmp/a2a_build/lib/openzeppelin-contracts/contracts/access/Ownable.sol && echo 'DEPS OK'")

# Fix remappings
print("\n=== Configuring remappings ===")
foundry_toml = """[profile.default]
solc = "0.8.20"
via_ir = true
optimizer = true
optimizer_runs = 200
evm_version = "paris"
remappings = [
    "@openzeppelin/=lib/openzeppelin-contracts/",
    "forge-std/=lib/forge-std/src/"
]
"""
import base64
b64 = base64.b64encode(foundry_toml.encode()).decode()
run(c, f"echo '{b64}' | base64 -d > /tmp/a2a_build/foundry.toml && cat /tmp/a2a_build/foundry.toml")

# Build
print("\n=== FORGE BUILD ===")
ec, out, err = run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge build 2>&1 | tail -20", "build")
if ec != 0:
    print("BUILD FAILED!")
    run(c, "export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && forge build 2>&1 | tail -40")
    exit(1)

# Deploy to Sepolia
print("\n=========================================")
print("  DEPLOYING TO SEPOLIA (11155111)")
print("=========================================")
ec, out, err = run(c,
    f"export PATH=$HOME/.foundry/bin:$PATH && "
    f"cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {SEP_RPC} "
    f"--private-key {pk} "
    f"--constructor-args {SEP_IR} "
    f"--legacy "
    f"2>&1",
    "deploy SEP"
)

# Parse deployed address
sep_address = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        sep_address = line.split(':')[-1].strip()
        print(f"\n>>> SEPOLIA A2A: {sep_address}")

# Deploy to OxaChain L1
print("\n=========================================")
print("  DEPLOYING TO OXACHAIN L1 (19505)")
print("=========================================")
ec, out, err = run(c,
    f"export PATH=$HOME/.foundry/bin:$PATH && "
    f"cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {OX_RPC} "
    f"--private-key {pk} "
    f"--constructor-args {OX_IR} "
    f"--legacy "
    f"2>&1",
    "deploy OX"
)

ox_address = ""
for line in (out + err).split('\n'):
    if 'Deployed to' in line:
        ox_address = line.split(':')[-1].strip()
        print(f"\n>>> OXACHAIN A2A: {ox_address}")

# Verify on Sepolia Blockscout
if sep_address:
    print("\n=== Verifying on Sepolia Blockscout ===")
    run(c,
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cd /tmp/a2a_build && "
        f"forge verify-contract {sep_address} src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
        f"--verifier blockscout "
        f"--verifier-url 'https://eth-sepolia.blockscout.com/api/' "
        f"--constructor-args $(cast abi-encode 'constructor(address)' {SEP_IR}) "
        f"--compiler-version v0.8.20+commit.a1b79de6 "
        f"--num-of-optimizations 200 "
        f"--evm-version paris "
        f"2>&1 | tail -10",
        "verify SEP"
    )

# Verify on OxaChain Explorer
if ox_address:
    print("\n=== Verifying on OxaChain Explorer ===")
    run(c,
        f"export PATH=$HOME/.foundry/bin:$PATH && "
        f"cd /tmp/a2a_build && "
        f"forge verify-contract {ox_address} src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
        f"--verifier blockscout "
        f"--verifier-url '{OX_RPC.replace(':18545',':18400')}/api/' "
        f"--constructor-args $(cast abi-encode 'constructor(address)' {OX_IR}) "
        f"--compiler-version v0.8.20+commit.a1b79de6 "
        f"--num-of-optimizations 200 "
        f"--evm-version paris "
        f"2>&1 | tail -10",
        "verify OX"
    )

c.close()

print("\n============================================")
print("  DEPLOYMENT COMPLETE")
print("============================================")
print(f"  Sepolia A2A:     {sep_address}")
print(f"  OxaChain L1 A2A: {ox_address}")
print("============================================")

# Save addresses to update later
if sep_address or ox_address:
    with open(r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway\deploy\a2a_addresses.txt', 'w') as f:
        f.write(f"SEPOLIA_A2A={sep_address}\n")
        f.write(f"OXACHAIN_A2A={ox_address}\n")
    print("Addresses saved to a2a_addresses.txt")
