import paramiko, base64

HOST = '43.156.225.164'
PWD = 'Asdf1234!'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=15)

# Setup script
setup = '''#!/bin/bash
set -e
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql --no-pager 2>&1 | head -3

# Allow local TCP connections
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/*/main/postgresql.conf 2>/dev/null || true
sudo bash -c "echo 'host all all 127.0.0.1/32 md5' >> /etc/postgresql/*/main/pg_hba.conf" 2>/dev/null || true
sudo systemctl restart postgresql

# Create user + DB
sudo -u postgres psql -c "CREATE USER agentx WITH PASSWORD 'AgentX2024!Gateway' CREATEDB;" 2>&1
sudo -u postgres psql -c "CREATE DATABASE agentx_gateway OWNER agentx;" 2>&1
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE agentx_gateway TO agentx;" 2>&1
echo "PG_SETUP_DONE"
'''
b64 = base64.b64encode(setup.encode()).decode()
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/pg_setup.sh && chmod +x /tmp/pg_setup.sh && bash /tmp/pg_setup.sh 2>&1"
)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err: print("E:", err[-500:])
c.close()
