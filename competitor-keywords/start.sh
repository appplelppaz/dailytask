#!/bin/sh
# Mac / Linux 用の起動スクリプト(Windows は start.bat)
cd "$(dirname "$0")"
command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
exec uv run --python 3.12 streamlit run app.py
