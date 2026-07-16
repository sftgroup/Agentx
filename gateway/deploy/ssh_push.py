import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=15)

push = '''#!/bin/bash
set -e
cd /tmp/agentx-push
git remote set-url origin git@github.com:sftgroup/Agentx.git
git push origin main 2>&1
echo "PUSH_OK"
'''

import base64
b64 = base64.b64encode(push.encode()).decode()
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d | bash 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-300:])
c.close()
