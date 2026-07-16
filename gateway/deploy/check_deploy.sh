#!/bin/bash
export PATH=$HOME/.foundry/bin:$PATH
echo "=== checking deployment ==="
# Check broadcast file
BROADCAST="/tmp/a2a_build/broadcast/DeployA2A.s.sol/11155111/run-latest.json"
if [ -f "$BROADCAST" ]; then
    echo "Found broadcast file"
    cat "$BROADCAST" | head -30
else
    echo "NO broadcast file"
fi

echo ""
echo "=== logs ==="
ls -la /tmp/a2a_build/broadcast/DeployA2A.s.sol/11155111/ 2>/dev/null
cat /tmp/sep_deploy.log 2>/dev/null | tail -20 || echo "no log file"

echo ""
echo "=== A2A address on Sepolia ==="
cast call 0xEdb0022c250B38e281B3EF1418037889fC5C6092 "getAllSkills()(tuple(uint256,string,string,string,string,string[],uint256,bool,uint256)[])" --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>&1 | head -3
