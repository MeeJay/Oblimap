Set-Location 'D:\Obliview'
$output = & 'C:\Program Files\nodejs\npx.cmd' tsc --project client/tsconfig.json --noEmit 2>&1
$output | Out-File 'D:\Obliview\ts_out.txt' -Encoding utf8
Write-Host "Exit code: $LASTEXITCODE"
