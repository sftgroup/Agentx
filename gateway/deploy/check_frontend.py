import paramiko

# Check if same server has different IPs, and find frontend
host = '101.33.109.117'
user = 'ubuntu'
password = 'Asdf1234!'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

def run(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out)
    if err: print("E:", err[:200])
    return out

# Check network interfaces
print("=== Network Interfaces ===")
run("ip addr show 2>/dev/null | grep -E 'inet ' | head -10")
run("hostname -I 2>/dev/null")

# Check if port 8080 is open on this server
print("\n=== Port 8080? ===")
run("ss -tlnp | grep 8080 || echo 'Port 8080 not open on this server'")

# Check archive directory for any agentx frontend
print("\n=== Archive contents ===")
run("ls ~/archive/ 2>/dev/null")

# Check smart-menu (might host the frontend)
print("\n=== Smart-menu check ===")
run("ls ~/smart-menu/ 2>/dev/null | head -20")

client.close()

print("\n\n=== Need to update frontend on 43.156.78.59 ===")
print("The frontend server is at 43.156.78.59:8080")
print("Gateway is running at 101.33.109.117:3090")
