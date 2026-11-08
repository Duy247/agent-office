$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$entry=Join-Path $projectRoot 'src\server.ts'
$pidFile=Join-Path $env:LOCALAPPDATA 'OpenbotOfficeDashboard\office.pid'
if(Test-Path -LiteralPath $pidFile){
 $officeProcessId=[int](Get-Content -LiteralPath $pidFile -Raw)
 $existing=Get-CimInstance Win32_Process -Filter "ProcessId = $officeProcessId"
 if($null -ne $existing -and $existing.CommandLine.Contains($entry)){Stop-Process -Id $officeProcessId}
 Remove-Item -LiteralPath $pidFile
}
Write-Output 'Office dashboard stopped. Openbot continues running.'
