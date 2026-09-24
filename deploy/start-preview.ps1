$configPath = Join-Path $env:USERPROFILE '.config\shudong\deploy.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$sshKey = $config.identityFile
$knownHosts = $config.knownHostsFile
Write-Host 'Keep this window open. Visit http://127.0.0.1:3180 to use the server privately.'
& ssh -F NUL -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$knownHosts" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -N -L 127.0.0.1:3180:127.0.0.1:3080 $config.host
