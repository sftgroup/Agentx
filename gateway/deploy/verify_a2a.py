import paramiko, base64
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=10)

script = 'export PATH=$HOME/.foundry/bin:$PATH; cast call 0xeA90077ff0B01c7D43472f42ae5bC89d06760D5f "getUserTasks(address)(uint256[])" 0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103 --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>&1; echo "---"; cast call 0xeA90077ff0B01c7D43472f42ae5bC89d06760D5f "getAllSkills()(tuple(uint256,string,string,string,string,string[],uint256,bool,uint256)[])" --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>&1 | head -3'
b64 = base64.b64encode(script.encode()).decode()
stdin, stdout, stderr = c.exec_command(f'echo "{b64}"|base64 -d|bash 2>&1')
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-500:])
c.close()
