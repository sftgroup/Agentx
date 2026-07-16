import paramiko
import time

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
    if err: print("ERR:", err[-300:])

print("Waiting for Next.js to compile...")
time.sleep(5)

# Check log
print("=== Log (last 15 lines) ===")
run("tail -15 /tmp/n8080.log 2>/dev/null")

# Check if port is listening
print("\n=== Port 8080 ===")
run("ss -tlnp | grep 8080")

# Try HTTP
print("\n=== HTTP Test ===")
run("curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/ 2>&1")

c.close()
