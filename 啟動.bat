@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 旅費記帳已啟動： http://localhost:5173  （關閉此視窗即停止）
start "" http://localhost:5173
python -m http.server 5173 --bind 127.0.0.1
