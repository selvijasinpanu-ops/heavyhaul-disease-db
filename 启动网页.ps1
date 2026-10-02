$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "未找到 pnpm，请先安装 Node.js 和 pnpm。"
}

pnpm start
