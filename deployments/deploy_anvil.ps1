param(
    [ValidateSet("demo", "real", "benchmark")]
    [string]$Profile = "demo",
    [string]$RpcUrl = "http://127.0.0.1:8545"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\.."
$ForgeExe = Join-Path $RepoRoot ".venv\Scripts\forge.exe"

$env:VERICEMS_PROFILE = $Profile
Push-Location (Join-Path $RepoRoot "contracts")
try {
    & $ForgeExe script script/Deploy.s.sol:Deploy --rpc-url $RpcUrl --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 -vv
} finally {
    Pop-Location
}
