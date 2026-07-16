#!/bin/bash
# ERC8004 Platform 部署脚本
set -e

echo "🚀 Deploying ERC-8004 Platform..."

cd "$(dirname "$0")"

# 1. 安装依赖
echo "📦 Installing dependencies..."
npm install --silent

# 2. 构建
echo "🔨 Building..."
npm run build

# 3. 复制静态文件到 standalone
echo "📁 Copying static files to standalone..."
cp -r .next/static .next/standalone/.next/

# 4. 启动
PORT=${PORT:-8004}
echo "🚀 Starting server on port $PORT..."
PORT=$PORT nohup node .next/standalone/server.js > app.log 2>&1 &

echo "✅ Deployed! PID: $!"
echo "   Logs: tail -f app.log"
