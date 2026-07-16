import paramiko

host = '43.156.78.59'
user = 'ubuntu'
password = 'Asdf1234!'

print(f"Trying to connect to frontend server {host}...")

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=10)
    
    def run(cmd):
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode()
        err = stderr.read().decode()
        stdout.channel.recv_exit_status()
        if out: print(out)
        if err: print("E:", err[:300])
        return out
    
    print("=== Connected! ===")
    
    # Find AgentX frontend
    print("\n=== Finding frontend ===")
    run("ls ~/ 2>/dev/null")
    run("find /home -name 'next.config.js' -maxdepth 5 2>/dev/null | head -5")
    run("pm2 list 2>/dev/null")
    run("ss -tlnp | grep -E '8080|3000' 2>/dev/null")
    
    client.close()
except Exception as e:
    print(f"Connection failed: {e}")
    print("Will try with different credentials or check reachability...")
