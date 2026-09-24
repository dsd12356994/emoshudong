param([ValidateRange(1024, 65535)][int]$LocalPort = 3181)

$configPath = Join-Path $env:USERPROFILE '.config\shudong\deploy.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$sshKey = $config.identityFile
$knownHosts = $config.knownHostsFile
Write-Host "Keep this window open. Visit http://127.0.0.1:$LocalPort to preview the cloud server."
& ssh -F NUL -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$knownHosts" -o ExitOnForwardFailure=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N -L "127.0.0.1:${LocalPort}:127.0.0.1:3080" $config.host
