#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
cd /tmp/a2a_build
ln -sf erc8004-interfaces src/interfaces

# 私钥从环境变量读取（source gateway/deploy/.env.deploy），禁止硬编码入库
PK="${AGENTX_DEPLOY_PRIVATE_KEY:?AGENTX_DEPLOY_PRIVATE_KEY 未设置，请先 source gateway/deploy/.env.deploy}"
SEP_IR=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F

echo "===== DEPLOYING SEPOLIA ====="
cat > .env << ENVEOF
IDENTITY_REGISTRY=$SEP_IR
PRIVATE_KEY=$PK
ENVEOF

forge script script/DeployA2A.s.sol:DeployA2A \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast --legacy \
  2>&1
