$ErrorActionPreference = 'Stop'
function Test-QbankServerProcess {
    param([string]$TaskProcessName, [string]$TaskCommandLine, [string]$TaskServerPath)
    if ($TaskProcessName -ne 'node.exe') { return $false }
    $taskNormalizedCommand = $TaskCommandLine.Replace('/', '\')
    $taskNormalizedPath = $TaskServerPath.Replace('/', '\')
    $taskPattern = '(^|[\s"])' + [regex]::Escape($taskNormalizedPath) + '($|[\s"])'
    return [regex]::IsMatch($taskNormalizedCommand, $taskPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}
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
$taskHealth = $null
try { $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 2 } catch { }
if ($taskHealth -and $taskHealth.service -eq 'ocs-workbuddy-qbank') {
    $taskExpectedVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
    if ($taskHealth.version -eq $taskExpectedVersion) {
        Start-Process 'http://127.0.0.1:8765/'
        Write-Host 'Service is already running: http://127.0.0.1:8765/'
        exit 0
    }
    $taskListenerIds = @(Get-NetTCPConnection -LocalPort 8765 -State Listen | Where-Object LocalAddress -eq '127.0.0.1' | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($taskListenerIds.Count -ne 1) { throw 'Cannot identify the old service. Close its original terminal and try again.' }
    $taskOldProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $taskListenerIds[0])
    $taskServerPath = Join-Path $PSScriptRoot 'server.mjs'
    if (-not (Test-QbankServerProcess $taskOldProcess.Name $taskOldProcess.CommandLine $taskServerPath)) {
        throw 'The old service belongs to a different folder or cannot be verified. Close its original terminal and try again.'
    }
    $taskState = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/state' -Headers @{ 'X-Local-UI' = '1' } -TimeoutSec 2
    if ($taskState.active -gt 0) { throw 'A question is being processed. Wait for it to finish, then run start.cmd again.' }
    Write-Host ('Restarting local question bank {0} -> {1}...' -f $taskHealth.version, $taskExpectedVersion)
    Stop-Process -Id $taskOldProcess.ProcessId -ErrorAction Stop
    for ($taskWait = 0; $taskWait -lt 20; $taskWait++) {
        if (-not (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 100
    }
}
& $taskNodePath (Join-Path $PSScriptRoot 'server.mjs') --open
exit $LASTEXITCODE
