$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node.exe -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNode) { $taskNode.Source } else { $null }
if (-not $taskNodePath) {
    $taskCandidates = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    )
    $taskNodePath = $taskCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $taskNodePath) { throw 'Node.js 20 or newer is required. Install Node.js, then run start.cmd again.' }
$taskMajor = [int]((& $taskNodePath -p 'process.versions.node.split(".")[0]') | Out-String).Trim()
if ($taskMajor -lt 20) { throw 'Node.js 20 or newer is required.' }
try {
    $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 2
    if ($taskHealth.service -eq 'ocs-workbuddy-qbank') {
        Start-Process 'http://127.0.0.1:8765/'
        Write-Host 'Service is already running: http://127.0.0.1:8765/'
        exit 0
    }
} catch { }
& $taskNodePath (Join-Path $PSScriptRoot 'server.mjs') --open
exit $LASTEXITCODE
