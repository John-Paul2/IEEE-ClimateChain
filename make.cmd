@echo off
setlocal
set "REPO_ROOT=%~dp0"
if exist "%REPO_ROOT%.venv\Scripts\python.exe" (
    set "PY=%REPO_ROOT%.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

if "%~1"=="" goto :help
if /I "%~1"=="benchmark" (
    "%PY%" -m ml.benchmark.run_benchmark %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="test" (
    "%PY%" -m pytest -q %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="deploy-testnet" (
    powershell -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\deploy_testnet.ps1"
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="train" (
    "%PY%" -m ml.train %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="demo" (
    "%PY%" -m backend.vericems.server %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="setup" (
    "%PY%" -m pip install --upgrade pip
    "%PY%" -m pip install -r "%REPO_ROOT%requirements.txt"
    if exist "%REPO_ROOT%.venv\Scripts\forge.exe" (
        "%REPO_ROOT%.venv\Scripts\forge.exe" build --root "%REPO_ROOT%contracts"
    ) else (
        where forge >nul 2>nul && forge build --root "%REPO_ROOT%contracts"
    )
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="lint" (
    "%PY%" -m py_compile ml/train.py ml/benchmark/run_benchmark.py
    if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
    "%PY%" scripts\honesty_lint.py
    exit /b %ERRORLEVEL%
)

:help
echo Usage: make [benchmark^|test^|train^|setup^|lint^|demo^|deploy-testnet]
exit /b 1
