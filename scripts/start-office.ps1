param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$entry=Join-Path $projectRoot 'src\server.ts'
$settings=Get-Content -LiteralPath (Join-Path $projectRoot 'office.config.json') -Raw | ConvertFrom-Json
$localSettingsPath=Join-Path $projectRoot 'office.config.local.json'
if(Test-Path -LiteralPath $localSettingsPath){$localSettings=Get-Content -LiteralPath $localSettingsPath -Raw | ConvertFrom-Json;if($localSettings.port){$settings.port=$localSettings.port}}
$url="http://127.0.0.1:$($settings.port)"
$runtimeDirectory=Join-Path $env:LOCALAPPDATA 'OpenbotOfficeDashboard'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pidFile=Join-Path $runtimeDirectory 'office.pid'
$running=$false
if(Test-Path -LiteralPath $pidFile){
 $officeProcessId=[int](Get-Content -LiteralPath $pidFile -Raw)
 $existing=Get-CimInstance Win32_Process -Filter "ProcessId = $officeProcessId"
 $running=$null -ne $existing -and $existing.CommandLine.Contains($entry)
}
if(-not $running){
 Push-Location -LiteralPath $projectRoot
 try{
  if(-not(Test-Path -LiteralPath 'node_modules')){& npm.cmd ci;if($LASTEXITCODE -ne 0){throw 'Dependency installation failed.'}}
  if(-not(Test-Path -LiteralPath 'dist\index.html')){& npm.cmd run build;if($LASTEXITCODE -ne 0){throw 'Dashboard build failed.'}}
  $nodePath=(Get-Command node.exe).Source
  $started=Start-Process -FilePath $nodePath -ArgumentList ('"'+$entry+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'office-output.log') -RedirectStandardError (Join-Path $runtimeDirectory 'office-error.log')
  $started.Id | Set-Content -LiteralPath $pidFile
 }finally{Pop-Location}
}
$ready=$false
for($attempt=0;$attempt -lt 30;$attempt++){
 try{$null=Invoke-RestMethod -Uri ($url+'/api/state') -TimeoutSec 1;$ready=$true;break}catch{Start-Sleep -Milliseconds 200}
}
if(-not $ready -or ($started -and $started.HasExited)){throw 'The office could not start, or the port is already occupied. Check the local office-error.log file.'}
Write-Output "Office ready: $url"
if(-not $NoBrowser){Start-Process $url}
