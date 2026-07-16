import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.225.164', username='ubuntu', password='Asdf1234!', timeout=30)

print("=== Build ===")
stdin, stdout, stderr = c.exec_command(
    "cd /home/ubuntu/agentx-platform && NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build 2>&1 | tail -20",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
ec = stdout.channel.recv_exit_status()
print(out[-600:])
if err: print("E:", err[-200:])

# Check actual build result
stdin2, stdout2, stderr2 = c.exec_command(
    "ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null && echo 'BUILD_OK' || echo 'BUILD_FAILED'"
)
print(stdout2.read().decode().strip())

build_ok = False
if 'BUILD_OK' in stdout2.read().decode() if hasattr(stdout2, 'read') else False:
    build_ok = True

# If failed, show errors
stdin3, stdout3, stderr3 = c.exec_command("ls /home/ubuntu/agentx-platform/.next/BUILD_ID 2>/dev/null")
build_id = stdout3.read().decode().strip()
if build_id:
    print("BUILD SUCCESS!")
    
    # Start
    print("\n=== Start ===")
    c.exec_command("fuser -k 3000/tcp 2>/dev/null; sleep 2", timeout=10)
    c.exec_command(
        "cd /home/ubuntu/agentx-platform && nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 & disown",
        timeout=5
    )
    time.sleep(6)
    
    stdin4, stdout4, stderr4 = c.exec_command("ss -tlnp | grep 3000 && echo '---' && curl -sI http://localhost:3000/ 2>&1 | head -5")
    print(stdout4.read().decode())
    print("\n✅ http://43.156.225.164:3000")
else:
    print("BUILD FAILED")
    stdin3, stdout3, stderr3 = c.exec_command(
        "cd /home/ubuntu/agentx-platform && ./node_modules/.bin/next build 2>&1 | grep -E 'error|Error|Module|Failed' | tail -10",
        timeout=120
    )
    print(stdout3.read().decode())

c.close()
