import paramiko, base64
c=paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59',username='ubuntu',password='Asdf1234!',timeout=10)

script = '''#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
echo "=== Balances for 0x0918272f68C39483737eeB48F4Adb2C09CBD6A55 ==="
echo "Sepolia:"
cast balance 0x0918272f68C39483737eeB48F4Adb2C09CBD6A55 --rpc-url https://ethereum-sepolia-rpc.publicnode.com
echo "OxaChain:"
cast balance 0x0918272f68C39483737eeB48F4Adb2C09CBD6A55 --rpc-url http://43.156.99.215:18545
echo "=== pk2 ==="
cat ~/pk2.txt
echo "=== pk3 ==="
cat ~/pk3.txt
echo "=== pk2 balances ==="
PK2_ADDR=$(cat ~/signer2.json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['address'])")
echo "Addr: $PK2_ADDR"
cast balance $PK2_ADDR --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>/dev/null || echo "Sepolia: error"
echo "=== pk3 balances ==="
PK3_ADDR=$(cat ~/signer3.json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['address'])")
echo "Addr: $PK3_ADDR"
cast balance $PK3_ADDR --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>/dev/null || echo "Sepolia: error"
'''
b64=base64.b64encode(script.encode()).decode()
stdin,stdout,stderr=c.exec_command('echo "'+b64+'"|base64 -d|bash 2>&1')
out=stdout.read().decode(); err=stderr.read().decode()
print(out)
if err: print("E:",err[-500:])
c.close()
