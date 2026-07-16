#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
cd /tmp/a2a_build
ln -sf erc8004-interfaces src/interfaces

PK=0x9ff7f5511067c86fdd8c1dee11799e4778e4b1e86e5093d53eae8d4af356a424
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
