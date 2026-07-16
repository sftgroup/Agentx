import paramiko
import time

host_f = '43.156.78.59'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_f, username='ubuntu', password='Asdf1234!', timeout=10)

def run(cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    stdout.channel.recv_exit_status()
    if out: print(out[-600:])
    if err: print("ERR:", err[-300:])

# Kill everything
run("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next' 2>/dev/null; sleep 2; echo done")

# Check if old .next build has the compiled chat page
print("\n=== Checking old build ===")
run("find ~/agentx-platform/.next -name '*chat*' -o -name '*agentId*' 2>/dev/null | head -10")
run("ls ~/agentx-platform/.next/server/app/user/chat/ 2>/dev/null")

# Check if we can just start the old build  
print("\n=== Attempting to start old build ===")
run("cd ~/agentx-platform && nohup npx next start -p 8080 > /tmp/ns.log 2>&1 &")
time.sleep(4)
run("ss -tlnp | grep 8080")
run("cat /tmp/ns.log 2>/dev/null | head -10")

c.close()
