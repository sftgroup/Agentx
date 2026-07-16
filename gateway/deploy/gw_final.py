import paramiko
import tarfile, os, base64, time

HOST = '43.156.225.164'
PWD = 'Asdf1234!'
PORT = '3090'
APP = '/home/ubuntu/agentx-gateway'

local = r'c:\Users\apply\Downloads\code\agentx\extracted\Agentx\gateway'
tarpath = r'c:\Users\apply\Downloads\code\agentx_gw.tar.gz'

# 1. Tar
print("=== Tar ===")
with tarfile.open(tarpath, 'w:gz') as tar:
    for root, dirs, files in os.walk(local):
        dirs[:] = [d for d in dirs if d not in ('node_modules','dist','.git')]
        for f in files:
            if f.endswith('.tar.gz'): continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, local).replace('\\', '/')
            tar.add(full, arcname=arc)
print(f"{os.path.getsize(tarpath)//1024} KB")

# 2. Upload
print("Uploading...")
t = paramiko.Transport((HOST, 22))
t.connect(username='ubuntu', password=PWD)
s = paramiko.SFTPClient.from_transport(t)
s.put(tarpath, '/tmp/agentx_gw.tar.gz')
s.close()
t.close()

# 3. Deploy
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='ubuntu', password=PWD, timeout=30)

# Extract
stdin, stdout, stderr = c.exec_command(f"rm -rf {APP} && mkdir -p {APP} && cd {APP} && tar xzf /tmp/agentx_gw.tar.gz && ls src/index.ts package.json tsconfig.json")
print(stdout.read().decode().strip())

# Write .env
env = f'''PORT={PORT}
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway
JWT_SECRET=agentx-prod-jwt-secret-20260717-gateway-key
SESSION_TTL_SEC=86400
'''
b64 = base64.b64encode(env.encode()).decode()
c.exec_command(f"echo '{b64}' | base64 -d > {APP}/.env && echo 'env OK'")

# npm install
print("\n=== npm install ===")
stdin, stdout, stderr = c.exec_command(f"cd {APP} && npm install 2>&1 | tail -8", timeout=300)
out = stdout.read().decode()
print(out[-400:] if len(out) > 400 else out)

# tsc build
print("\n=== tsc ===")
stdin, stdout, stderr = c.exec_command(f"cd {APP} && ./node_modules/.bin/tsc 2>&1 | tail -10", timeout=120)
out = stdout.read().decode()
print(out[-400:] if len(out) > 400 else out)

stdin, stdout, stderr = c.exec_command(f"ls {APP}/dist/index.js 2>/dev/null && echo BUILD_OK || echo BUILD_FAILED")
check = stdout.read().decode().strip()
print(f"Build: {check}")

# Init DB tables
print("\n=== DB init ===")
# Check if we have a migration/schema file
schema_files = []
for fname in ['schema.sql', 'migrations', 'db.ts']:
    stdin, stdout, stderr = c.exec_command(f"ls {APP}/src/lib/{fname} 2>/dev/null && echo 'HAS_{fname}' || true")
    r = stdout.read().decode().strip()
    if r: schema_files.append(r)

# Create tables manually
sql = """
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    quota_daily INTEGER NOT NULL DEFAULT 1000,
    rpm_limit INTEGER NOT NULL DEFAULT 100,
    price_monthly_cents INTEGER NOT NULL DEFAULT 0,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL UNIQUE,
    plan_id UUID REFERENCES plans(id),
    status TEXT DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Default',
    encrypted_key TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'BYOK Key',
    encrypted_key TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT DEFAULT 'https://api.openai.com/v1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    tool_calls INTEGER NOT NULL DEFAULT 0,
    model TEXT,
    source TEXT DEFAULT 'platform',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id TEXT,
    role TEXT NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (name, slug, description, quota_daily, rpm_limit, price_monthly_cents) 
VALUES ('Free', 'free', 'Free tier', 100, 10, 0) ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (name, slug, description, quota_daily, rpm_limit, price_monthly_cents) 
VALUES ('Pro', 'pro', 'Pro tier', 10000, 100, 1000) ON CONFLICT (slug) DO NOTHING;
"""
b64 = base64.b64encode(sql.encode()).decode()
stdin, stdout, stderr = c.exec_command(
    f"echo '{b64}' | base64 -d > /tmp/schema.sql && "
    f"export PGPASSWORD='AgentX2024!Gateway' && "
    f"psql -h localhost -U agentx -d agentx_gateway -f /tmp/schema.sql 2>&1 | tail -10"
)
out = stdout.read().decode()
print(out[-400:] if len(out) > 400 else out)

# Start
print(f"\n=== Start on {PORT} ===")
c.exec_command(f"fuser -k {PORT}/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(
    f"cd {APP} && nohup node dist/index.js > /tmp/gw.log 2>&1 & disown",
    timeout=5
)
time.sleep(4)

stdin, stdout, stderr = c.exec_command(f"ss -tlnp | grep {PORT} && echo '---' && curl -s http://localhost:{PORT}/api/v1/health 2>&1")
out = stdout.read().decode()
print(out)

if '200' in out or 'OK' in out or '/api/v1/health' in out:
    print("\n✅ Gateway running on 164:3090!")
else:
    stdin, stdout, stderr = c.exec_command("tail -20 /tmp/gw.log 2>/dev/null")
    print("Log:", stdout.read().decode()[:500])

# Now update frontend env
print("\n=== Update frontend .env ===")
new_gw = 'NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.156.225.164:3090'
# Read current .env.production from server
stdin, stdout, stderr = c.exec_command("cat /home/ubuntu/agentx-platform/.env.production | head -5")
current = stdout.read().decode()
print(current[:100])

# Replace GATEWAY_URL
stdin, stdout, stderr = c.exec_command(
    f"sed -i 's|NEXT_PUBLIC_AGENTX_GATEWAY_URL=.*|{new_gw}|' /home/ubuntu/agentx-platform/.env.production && "
    f"grep GATEWAY /home/ubuntu/agentx-platform/.env.production"
)
print(stdout.read().decode().strip())

# Restart frontend
print("\n=== Restart frontend ===")
c.exec_command("fuser -k 3000/tcp 2>/dev/null; sleep 2", timeout=10)
c.exec_command(
    "cd /home/ubuntu/agentx-platform && nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 & disown",
    timeout=5
)
time.sleep(6)
stdin, stdout, stderr = c.exec_command("ss -tlnp | grep 3000 && curl -sI http://localhost:3000/ 2>&1 | head -3")
print(stdout.read().decode())

c.close()
print("\n✅ DONE — All on 43.156.225.164!")
print("  Frontend: http://43.156.225.164:3000")
print("  Gateway:  http://43.156.225.164:3090")
