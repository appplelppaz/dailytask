@echo off
cd /d "%~dp0"
title 競合商品 検索キーワード分析

rem --- uv (Python と部品を自動で用意するツール) が無ければ入れる。初回だけ数分かかります ---
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

rem --- Streamlit の初回メールアドレス質問を省略する ---
if not exist "%USERPROFILE%\.streamlit" mkdir "%USERPROFILE%\.streamlit"
if not exist "%USERPROFILE%\.streamlit\credentials.toml" (
  > "%USERPROFILE%\.streamlit\credentials.toml" echo [general]
  >> "%USERPROFILE%\.streamlit\credentials.toml" echo email = ""
)

echo ブラウザで画面が開きます。使い終わったらこの黒い画面を閉じてください。
uv run --python 3.12 streamlit run app.py
if errorlevel 1 pause
