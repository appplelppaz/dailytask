@echo off
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.local\bin\uv.exe" (
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  ) else (
    echo 初回セットアップ中です。数分お待ちください...
    powershell -NoProfile -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  )
)
uv run --no-project --python 3.12 --with requests --with beautifulsoup4 --with pandas --with openpyxl python creema_pv.py compare --category 83
pause
