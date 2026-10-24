@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3 -m venv .venv
  if errorlevel 1 python -m venv .venv
)
set PYTHONPATH=%CD%
.venv\Scripts\python.exe scripts\ensure_env.py
.venv\Scripts\python.exe -m trainer_studio
