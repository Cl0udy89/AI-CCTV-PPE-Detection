@echo off
echo ============================================
echo  AI CCTV PPE Detection -- Chapter 1 Start
echo ============================================

:: --- Backend ---
echo [1/2] Starting FastAPI backend on http://localhost:8000 ...
start "PPE Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to init
timeout /t 3 /nobreak >nul

:: --- Frontend ---
echo [2/2] Starting React frontend on http://localhost:3000 ...
start "PPE Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this launcher window.
pause >nul
