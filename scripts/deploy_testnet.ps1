<#
.SYNOPSIS
    Deploys VeriCEMS contracts to a public EVM testnet (Arbitrum Sepolia) using Foundry keystore.
.DESCRIPTION
    Reads RPC_URL, CHAIN_ID, DEPLOYER_ACCOUNT, and PASSWORD_FILE from .env.
    Enforces AGENTS.md safety rules: forbids mainnet, checks funding before deploying,
    never logs or prints private keys.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\.."
$ForgeExe = Join-Path $RepoRoot ".venv\Scripts\forge.exe"
$CastExe = Join-Path $RepoRoot ".venv\Scripts\cast.exe"
$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"

# 1. Load .env if present
$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$' } | ForEach-Object {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

$RpcUrl = if ($env:RPC_URL) { $env:RPC_URL } else { "https://sepolia-rollup.arbitrum.io/rpc" }
$ChainId = if ($env:CHAIN_ID) { [int]$env:CHAIN_ID } else { 421614 }
$Account = if ($env:DEPLOYER_ACCOUNT) { $env:DEPLOYER_ACCOUNT } else { "vericems-deployer" }
$PasswordFile = if ($env:PASSWORD_FILE) { Join-Path $RepoRoot $env:PASSWORD_FILE } else { Join-Path $RepoRoot ".keystore_password" }

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "VeriCEMS Testnet Deployment" -ForegroundColor Cyan
Write-Host "Target RPC: $RpcUrl"
Write-Host "Chain ID:   $ChainId"
Write-Host "Account:    $Account"
Write-Host "========================================="

# 2. Mainnet check
$forbiddenChainIds = @(1, 10, 56, 100, 137, 324, 1101, 8453, 42161, 43114, 59144)
if ($forbiddenChainIds -contains $ChainId) {
    Write-Error "Deployment ABORTED: Chain ID $ChainId is a protected mainnet per AGENTS.md!"
    exit 1
}

if (-not (Test-Path $PasswordFile)) {
    Write-Error "Password file not found at: $PasswordFile"
    exit 1
}

# 3. Retrieve deployer address and check balance
$DeployerAddress = (& $CastExe wallet address --account $Account --password-file $PasswordFile).Trim()
Write-Host "Deployer Address: $DeployerAddress" -ForegroundColor Green

$balanceWeiStr = (& $CastExe balance $DeployerAddress --rpc-url $RpcUrl).Trim()
$balanceEth = [double]$balanceWeiStr / 1e18
Write-Host "Deployer Balance: $balanceEth ETH ($balanceWeiStr wei)"

if ([double]$balanceWeiStr -le 0) {
    Write-Host ""
    Write-Host "STOP CONDITION TRIGGERED: Deployer wallet is unfunded!" -ForegroundColor Red
    Write-Host "Please fund $DeployerAddress using an Arbitrum Sepolia faucet:" -ForegroundColor Yellow
    Write-Host "  - Alchemy Faucet:  https://www.alchemy.com/faucets/arbitrum-sepolia"
    Write-Host "  - QuickNode:       https://faucet.quicknode.com/arbitrum/sepolia"
    Write-Host "  - Chainlink:       https://faucets.chain.link/arbitrum-sepolia"
    exit 2
}

# 4. Run Forge Deploy Script
$env:VERICEMS_PROFILE = "testnet"
$env:VERICEMS_ADMIN = $DeployerAddress
$env:VERICEMS_TREASURY = $DeployerAddress
$env:VERICEMS_DEPLOYMENT_OUT = Join-Path $RepoRoot "deployments\testnet.json"

Push-Location (Join-Path $RepoRoot "contracts")
try {
    Write-Host "Broadcasting deployment transactions to testnet..." -ForegroundColor Cyan
    & $ForgeExe script script/Deploy.s.sol:Deploy `
        --rpc-url $RpcUrl `
        --account $Account `
        --password-file $PasswordFile `
        --broadcast `
        --slow `
        -vv
} finally {
    Pop-Location
}

# 5. Extract Evidence
& $PythonExe (Join-Path $RepoRoot "scripts\extract_deployment_evidence.py") $ChainId

Write-Host "Deployment completed. Artifacts recorded in deployments/testnet.json." -ForegroundColor Green
