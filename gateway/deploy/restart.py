import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=15)

# Kill old
stdin, stdout, stderr = c.exec_command("fuser -k 8080/tcp 2>/dev/null; pkill -f 'next start' 2>/dev/null; sleep 2; echo cleaned")
print(stdout.read().decode().strip())

# Start
print("Starting...")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && nohup npx next start -p 8080 > /tmp/fe-final2.log 2>&1 &",
    timeout=5
)
time.sleep(5)

# Verify
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 8080")
print("PORT:", stdout.read().decode().strip())
stdin, stdout, stderr = c.exec_command("tail -2 /tmp/fe-final2.log")
print("LOG:", stdout.read().decode().strip())
stdin, stdout, stderr = c.exec_command("curl -sI http://localhost:8080/ 2>&1 | head -3")
print("HTTP:", stdout.read().decode().strip())

c.close()
print("\n✅ Done")
