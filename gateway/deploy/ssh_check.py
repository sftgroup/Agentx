import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('43.156.78.59', username='ubuntu', password='Asdf1234!', timeout=15)

# Check SSH keys and git config
stdin, stdout, stderr = c.exec_command(
    "ls -la ~/.ssh/ 2>/dev/null; echo '===GIT==='; git config --global -l 2>/dev/null; "
    "echo '===SSH_TEST==='; ssh -T git@github.com 2>&1 | head -3"
)
print(stdout.read().decode())

c.close()
