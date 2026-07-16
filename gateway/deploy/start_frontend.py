import paramiko

host_f = '43.156.78.59'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host_f, username='ubuntu', password='Asdf1234!', timeout=10)

ch = c.get_transport().open_session()
ch.exec_command("cd ~/agentx-platform && NODE_OPTIONS='--max-old-space-size=512' nohup npx next dev -p 8080 -H 0.0.0.0 > /tmp/n8080.log 2>&1 &")
ch.recv_exit_status()
print("Started next dev")
c.close()
