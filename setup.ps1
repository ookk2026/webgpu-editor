# WebGPU Editor 项目初始化脚本
$ErrorActionPreference = "Stop"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "WebGPU Editor 项目初始化" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js 已安装: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 错误: 未检测到 Node.js" -ForegroundColor Red
    Write-Host "请先安装 Node.js 18+ https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# 检查 npm
try {
    $npmVersion = npm --version
    Write-Host "✓ npm 已安装: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 错误: npm 未找到" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[1/4] 安装 pnpm..." -ForegroundColor Blue
npm install -g pnpm

Write-Host ""
Write-Host "[2/4] 安装项目依赖..." -ForegroundColor Blue
Set-Location $PSScriptRoot
pnpm install

Write-Host ""
Write-Host "[3/4] 构建核心包..." -ForegroundColor Blue
pnpm build:core

Write-Host ""
Write-Host "===================================" -ForegroundColor Green
Write-Host "初始化完成！" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host ""
Write-Host "可用命令:" -ForegroundColor Cyan
Write-Host "  pnpm dev:editor  - 启动编辑器 (http://localhost:5173)" -ForegroundColor White
Write-Host "  pnpm dev:player  - 启动播放器 (http://localhost:5174)" -ForegroundColor White
Write-Host "  pnpm build       - 构建生产版本" -ForegroundColor White
Write-Host ""

# 询问是否启动
$start = Read-Host "是否立即启动编辑器? (Y/n)"
if ($start -eq '' -or $start -eq 'Y' -or $start -eq 'y') {
    Start-Process "http://localhost:5173"
    pnpm dev:editor
}
