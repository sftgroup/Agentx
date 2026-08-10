#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
cd /tmp/a2a_build
ln -sf erc8004-interfaces src/interfaces

# 私钥从环境变量读取（source gateway/deploy/.env.deploy），禁止硬编码入库
PK="${AGENTX_DEPLOY_PRIVATE_KEY:?AGENTX_DEPLOY_PRIVATE_KEY 未设置，请先 source gateway/deploy/.env.deploy}"
SEP_IR=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F

echo "===== SEPOLIA ====="
# Use forge create directly with constructor args
ARGS_HEX=$(cast abi-encode 'constructor(address)' $SEP_IR)
echo "constructor args: $ARGS_HEX"

forge create \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key $PK \
  --legacy \
  src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry \
  --constructor-args $ARGS_HEX \
  2>&1

echo ""
echo "===== OXACHAIN L1 ====="
OX_IR=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
OX_ARGS_HEX=$(cast abi-encode 'constructor(address)' $OX_IR)

forge create \
  --rpc-url http://43.156.99.215:18545 \
  --private-key $PK \
  --legacy \
  src/erc8004-extensions/A2AProtocolRegistry.sol:A2AProtocolRegistry \
  --constructor-args $OX_ARGS_HEX \
  2>&1
