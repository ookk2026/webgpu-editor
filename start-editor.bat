@echo off
cd /d "%~dp0\apps\editor"
..\..\node_modules\.bin\vite.cmd --host 0.0.0.0 --port 5173
pause
