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
echo Creema「シューズ・靴」人気上位25%%のPVを記録します。約3時間かかります。
echo 途中で閉じても、もう一度実行すれば続きから再開します。
uv run --no-project --python 3.12 --with requests --with beautifulsoup4 --with pandas --with openpyxl python creema_pv.py record --category 83 --top-percent 25
pause
