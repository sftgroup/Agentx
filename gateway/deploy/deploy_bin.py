import paramiko
import base64

pk = '0x872c3190b82d17b29bb046c9c55a7f7390c7f74bd6d592ba8d211f20f896f28e'
SEP_IR = '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F'
OX_IR  = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'
SEP_RPC  = 'https://ethereum-sepolia-rpc.publicnode.com'
OX_RPC   = 'http://43.156.99.215:18545'

# Use forge create with the address directly via --constructor-args-path
# Write the encoded bytes to a file
SEP_ARGS_BIN = bytes.fromhex('000000000000000000000000'+SEP_IR[2:].lower())
OX_ARGS_BIN  = bytes.fromhex('000000000000000000000000'+OX_IR[2:].lower())

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=30)

def run(cmd):
    print(f"> {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    ec = stdout.channel.recv_exit_status()
    if out: print(out[-400:])
    if err: print("STDERR:", err[-400:])
    return ec, out, err

# Ensure symlink
run("export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build/src && ln -sf erc8004-interfaces interfaces")

# Write constructor args as binary files via base64
import base64
sep_b64 = base64.b64encode(SEP_ARGS_BIN).decode()
ox_b64  = base64.b64encode(OX_ARGS_BIN).decode()

run(f"echo '{sep_b64}' | base64 -d > /tmp/sep_args.bin && xxd /tmp/sep_args.bin")
run(f"echo '{ox_b64}' | base64 -d > /tmp/ox_args.bin && xxd /tmp/ox_args.bin")

# Deploy Sepolia
print("\n========== SEPOLIA ==========")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {SEP_RPC} --private-key {pk} --legacy "
    f"--constructor-args-path /tmp/sep_args.bin 2>&1"
)
for line in (out + err).split('\n'):
    if any(w in line for w in ['Deployed to', 'Transaction', 'Error', 'Block', 'Gas']):
        print(f"  {line.strip()}")

# Deploy OxaChain
print("\n========== OXACHAIN L1 ==========")
ec, out, err = run(
    f"export PATH=$HOME/.foundry/bin:$PATH && cd /tmp/a2a_build && "
    f"forge create src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry "
    f"--rpc-url {OX_RPC} --private-key {pk} --legacy "
    f"--constructor-args-path /tmp/ox_args.bin 2>&1"
)
for line in (out + err).split('\n'):
    if any(w in line for w in ['Deployed to', 'Transaction', 'Error', 'Block', 'Gas']):
        print(f"  {line.strip()}")

c.close()
