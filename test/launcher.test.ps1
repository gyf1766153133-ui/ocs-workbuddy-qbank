$ErrorActionPreference = 'Stop'
$taskLauncherPath = Join-Path $PSScriptRoot '..\launch.ps1'
$taskTokens = $null
$taskParseErrors = $null
$taskAst = [System.Management.Automation.Language.Parser]::ParseFile($taskLauncherPath, [ref]$taskTokens, [ref]$taskParseErrors)
if ($taskParseErrors.Count) { throw 'Launcher syntax error' }
$taskFunction = $taskAst.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-QbankServerProcess'}, $true)
if ($taskFunction.Count -ne 1) { throw 'Missing process identity check' }
Invoke-Expression $taskFunction[0].Extent.Text
$taskExpected = 'D:\Sample Folder\qbank\server.mjs'
if (-not (Test-QbankServerProcess 'node.exe' '"C:\node.exe" "D:\Sample Folder\qbank\server.mjs" --open' $taskExpected)) { throw 'Same-folder service rejected' }
if (Test-QbankServerProcess 'node.exe' 'node.exe "D:\Other Folder\qbank\server.mjs"' $taskExpected) { throw 'Different folder accepted' }
if (Test-QbankServerProcess 'node.exe' 'node.exe "D:\Sample Folder\qbank\server.mjs.other"' $taskExpected) { throw 'Path prefix accepted' }
if (Test-QbankServerProcess 'powershell.exe' 'powershell.exe "D:\Sample Folder\qbank\server.mjs"' $taskExpected) { throw 'Wrong executable accepted' }
Write-Host 'Launcher syntax and 4 process identity checks passed. No processes were started or stopped.'
