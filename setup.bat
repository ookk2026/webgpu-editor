@echo off
chcp 65001 >nul
echo ===================================
echo WebGPU Editor 项目初始化脚本
echo ===================================
echo.

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 访问 https://nodejs.org/ 下载 LTS 版本
    pause
    exit /b 1
)

echo [1/4] 安装 pnpm...
npm install -g pnpm

echo [2/4] 安装项目依赖...
cd /d "%~dp0"
pnpm install

echo [3/4] 构建核心包...
pnpm build:core

echo [4/4] 启动开发服务器...
echo.
echo ===================================
echo 启动完成！请访问：
echo   编辑器: http://localhost:5173
echo   播放器: http://localhost:5174
echo ===================================
echo.

start http://localhost:5173
pnpm dev:editor

pause
