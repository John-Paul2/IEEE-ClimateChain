#!/usr/bin/env bash
set -euo pipefail

# VeriCEMS Testnet Deployment Script (scripts/deploy_testnet.sh)
# Deploys contracts to public L2 testnet (Arbitrum Sepolia) using Foundry keystore.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. Load .env if present
if [ -f "$REPO_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

RPC_URL="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
CHAIN_ID="${CHAIN_ID:-421614}"
DEPLOYER_ACCOUNT="${DEPLOYER_ACCOUNT:-vericems-deployer}"
PASSWORD_FILE="${PASSWORD_FILE:-.keystore_password}"

if [[ "$PASSWORD_FILE" != /* ]]; then
    PASSWORD_FILE="$REPO_ROOT/$PASSWORD_FILE"
fi

echo "========================================="
echo "VeriCEMS Testnet Deployment"
echo "Target RPC: $RPC_URL"
echo "Chain ID:   $CHAIN_ID"
echo "Account:    $DEPLOYER_ACCOUNT"
echo "========================================="

# 2. Mainnet check per AGENTS.md
case "$CHAIN_ID" in
    1|10|56|100|137|324|1101|8453|42161|43114|59144)
        echo "Error: Chain ID $CHAIN_ID is a protected mainnet per AGENTS.md!" >&2
        exit 1
        ;;
esac

if [ ! -f "$PASSWORD_FILE" ]; then
    echo "Error: Password file not found at: $PASSWORD_FILE" >&2
    exit 1
fi

FORGE_BIN="${REPO_ROOT}/.venv/Scripts/forge.exe"
CAST_BIN="${REPO_ROOT}/.venv/Scripts/cast.exe"
PYTHON_BIN="${REPO_ROOT}/.venv/Scripts/python.exe"

if [ ! -f "$FORGE_BIN" ]; then
    FORGE_BIN="forge"
fi
if [ ! -f "$CAST_BIN" ]; then
    CAST_BIN="cast"
fi
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

DEPLOYER_ADDRESS="$("$CAST_BIN" wallet address --account "$DEPLOYER_ACCOUNT" --password-file "$PASSWORD_FILE" | tr -d '\r\n')"
echo "Deployer Address: $DEPLOYER_ADDRESS"

BALANCE_WEI="$("$CAST_BIN" balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" | tr -d '\r\n')"
echo "Deployer Balance: $BALANCE_WEI wei"

if [ "$BALANCE_WEI" = "0" ] || [ -z "$BALANCE_WEI" ]; then
    echo ""
    echo "STOP CONDITION TRIGGERED: Deployer wallet is unfunded!"
    echo "Please fund $DEPLOYER_ADDRESS using an Arbitrum Sepolia faucet:"
    echo "  - Alchemy Faucet:  https://www.alchemy.com/faucets/arbitrum-sepolia"
    echo "  - QuickNode:       https://faucet.quicknode.com/arbitrum/sepolia"
    echo "  - Chainlink:       https://faucets.chain.link/arbitrum-sepolia"
    exit 2
fi

export VERICEMS_PROFILE="testnet"
export VERICEMS_ADMIN="$DEPLOYER_ADDRESS"
export VERICEMS_TREASURY="$DEPLOYER_ADDRESS"
export VERICEMS_DEPLOYMENT_OUT="$REPO_ROOT/deployments/testnet.json"

cd "$REPO_ROOT/contracts"
"$FORGE_BIN" script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --account "$DEPLOYER_ACCOUNT" \
    --password-file "$PASSWORD_FILE" \
    --broadcast \
    --slow \
    -vv

cd "$REPO_ROOT"
"$PYTHON_BIN" "$REPO_ROOT/scripts/extract_deployment_evidence.py" "$CHAIN_ID"
echo "Deployment completed. Artifacts recorded in deployments/testnet.json."
