# Gera o instalador e publica na VPS. Os apps já instalados se atualizam sozinhos.
# Uso: .\publicar.ps1   (lembre de subir o "version" no package.json antes)
#      .\publicar.ps1 -SemBuild   envia o que já está no dist\, sem gerar de novo
param([switch]$SemBuild)
$ErrorActionPreference = 'Stop'
$Vps  = 'root@2.24.68.127'
$Dest = '/root/tela/downloads/hub-rpg/'
$Url  = 'https://2-24-68-127.sslip.io/downloads/hub-rpg/latest.yml'

# O VS Code define esta variável, e com ela o Electron não sobe como app
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

if (-not $SemBuild) {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'O build falhou.' }
}

$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$exe = "dist\Hub-RPG-Setup-$v.exe"
if (-not (Test-Path $exe)) { throw "Não achei $exe" }
if (-not (Select-String -Path dist\latest.yml -Pattern "version: $v" -Quiet)) { throw "O dist\latest.yml não é da versão $v" }

# O latest.yml vai por último: os apps só enxergam a versão nova quando o .exe já está lá
scp $exe "$exe.blockmap" "${Vps}:$Dest"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o instalador.' }
scp dist\latest.yml "${Vps}:$Dest"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o latest.yml.' }

# -join: o curl.exe devolve uma linha por item, e o -notmatch numa lista filtra em vez de testar
$publicado = (curl.exe -s $Url) -join "`n"
if ($publicado -notmatch "version: $([regex]::Escape($v))") { throw "Enviado, mas $Url não mostra a versão $v" }

Write-Host "Hub-RPG v$v publicado." -ForegroundColor Green
