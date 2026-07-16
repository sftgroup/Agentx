import paramiko

host_f = '43.156.78.59'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_f, username='ubuntu', password='Asdf1234!', timeout=10)

def run(cmd):
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out)
    if err and 'curl' not in cmd: print("ERR:", err[-200:])
    return out

print("=== HTTP Test ===")
result = run("curl -I http://localhost:8080/ 2>&1 | head -5")
print(f"Result: {result}")

print("\n=== Full log ===")
run("tail -10 /tmp/n8080.log 2>/dev/null")

print("\n=== PM2 on gateway ===")
host_g = '101.33.109.117'
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(host_g, username='ubuntu', password='Asdf1234!', timeout=10)
stdin, stdout, stderr = c2.exec_command("pm2 list && curl -s http://localhost:3090/api/v1/health")
print(stdout.read().decode())
c2.close()

c.close()
