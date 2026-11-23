param([string]$SshAlias = 'nest_home_deploy')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
function Invoke-Checked {
  param([string]$Program, [string[]]$Arguments)
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program 执行失败，退出码 $LASTEXITCODE" }
}
# 使用调用者本人的 SSH 别名和密钥，不复制私钥，不修改宿主机 Nginx。
Invoke-Checked 'pnpm.cmd' @('site:build')
New-Item -ItemType Directory -Force .cache/website-delivery | Out-Null
Invoke-Checked 'tar.exe' @('-czf', '.cache/website-delivery/site.tgz', '-C', 'website-dist', '.')
$manifest = Get-Content -Raw -Encoding UTF8 website/public/releases.json | ConvertFrom-Json
$record = $manifest.releases | Where-Object platform -eq 'windows' | Select-Object -First 1
if (-not $record -or $record.file -notmatch '^Daywish-[A-Za-z0-9.-]+\.exe$') { throw '缺少有效的 Windows 版本信息' }
$package = Join-Path 'release' $record.file
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $package).Hash.ToLowerInvariant() -ne $record.sha256) { throw '本地安装包校验不符' }
$recordPath = '.cache/website-delivery/record.json'
$record | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $recordPath
# Windows PowerShell UTF8 会带 BOM；Python 用 utf-8-sig 读取版本记录。
$upload = & ssh -o BatchMode=yes $SshAlias 'mkdir -p /srv/daywish/incoming && mktemp -d /srv/daywish/incoming/bootstrap.XXXXXXXX'
if ($LASTEXITCODE -ne 0 -or $upload -notmatch '^/srv/daywish/incoming/bootstrap\.[A-Za-z0-9]+$') { throw '无法建立服务器上传目录' }
Invoke-Checked 'scp' @('ops/deploy.py', 'ops/bootstrap.sh', 'ops/compose.yml', 'ops/nginx-site.conf', "${SshAlias}:$upload/")
Invoke-Checked 'scp' @('.cache/website-delivery/site.tgz', "${SshAlias}:$upload/site.tgz")
Invoke-Checked 'scp' @($recordPath, "${SshAlias}:$upload/record.json")
Invoke-Checked 'scp' @($package, "${SshAlias}:$upload/package.bin")
Invoke-Checked 'ssh' @('-o', 'BatchMode=yes', $SshAlias, "bash '$upload/bootstrap.sh'")
Invoke-Checked 'curl.exe' @('--fail', '--silent', '--show-error', 'https://daywish.alvis.org.cn/healthz')
Write-Output '部署完成：https://daywish.alvis.org.cn'
