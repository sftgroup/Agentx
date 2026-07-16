#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
cd /tmp/a2a_build
ln -sf erc8004-interfaces src/interfaces 2>/dev/null

PK=0x9ff7f5511067c86fdd8c1dee11799e4778e4b1e86e5093d53eae8d4af356a424
LOG=/tmp/a2a_deploy2.log

{
echo "===== $(date) SEPOLIA ====="
cat > .env << ENVEOF
IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
PRIVATE_KEY=$PK
ENVEOF

forge script script/DeployA2A.s.sol:DeployA2A \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast --legacy \
  2>&1

echo ""
echo "===== $(date) OXACHAIN L1 ====="
cat > .env << ENVEOF
IDENTITY_REGISTRY=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
PRIVATE_KEY=$PK
ENVEOF

forge script script/DeployA2A.s.sol:DeployA2A \
  --rpc-url http://43.156.99.215:18545 \
  --broadcast --legacy \
  2>&1

echo "===== DONE $(date) ====="
} > $LOG 2>&1

echo "Background deploy started. PID=$!"
