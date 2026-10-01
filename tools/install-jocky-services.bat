@echo off
REM ============================================================
REM  Jocky (SIH26148) service installer
REM  Registers FastAPI (:8000) and Next.js prod (:3000) as
REM  auto-start Windows services via NSSM, with crash restart.
REM  Run from an ELEVATED prompt. Idempotent: re-running
REM  reconfigures the same two services.
REM
REM  NOTE: the public URL is served by the existing "Cloudflared
REM  agent" service (remotely-managed tunnel) - it is NOT touched
REM  here. These services only provide the origin.
REM ============================================================
setlocal

set "PROJECT=C:\Users\rajde\OneDrive\Desktop\SIH26148"
set "SVCDIR=C:\ProgramData\JockyServices"
set "PY=%PROJECT%\.venv\Scripts\python.exe"
set "NODE=C:\Program Files\nodejs\node.exe"

if not exist "%SVCDIR%" mkdir "%SVCDIR%"

rem Locate NSSM installed by winget: exact path first (elevation-safe),
rem then wildcard discovery as fallback
set "NSSM_SRC="
set "NSSM_EXACT=%LOCALAPPDATA%\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
if exist "%NSSM_EXACT%" set "NSSM_SRC=%NSSM_EXACT%"
if not defined NSSM_SRC for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\NSSM.NSSM_*") do (
  if exist "%%D\win64\nssm.exe" set "NSSM_SRC=%%D\win64\nssm.exe"
)
if not defined NSSM_SRC (
  echo ERROR: nssm.exe not found under %LOCALAPPDATA%\Microsoft\WinGet\Packages
  echo Install it with: winget install --id NSSM.NSSM
  exit /b 1
)
copy /y "%NSSM_SRC%" "%SVCDIR%\nssm.exe" >nul
set "NSSM=%SVCDIR%\nssm.exe"
echo Using NSSM: %NSSM%

rem Free the ports from any manually-started copies
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000 "') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000 "') do taskkill /F /PID %%P >nul 2>&1

echo.
echo === Registering JockyFastAPI (uvicorn on 127.0.0.1:8000) ===
rem stop + force-kill first so remove() never hits "marked for deletion"
%NSSM% stop JockyFastAPI >nul 2>&1
timeout /t 2 /nobreak >nul
%NSSM% kill JockyFastAPI >nul 2>&1
timeout /t 2 /nobreak >nul
%NSSM% remove JockyFastAPI confirm >nul 2>&1
%NSSM% install JockyFastAPI "%PY%" -m uvicorn service.main:app --host 127.0.0.1 --port 8000
%NSSM% set JockyFastAPI AppDirectory "%PROJECT%"
%NSSM% set JockyFastAPI AppStdout "%PROJECT%\service\uvicorn-service.log"
%NSSM% set JockyFastAPI AppStderr "%PROJECT%\service\uvicorn-service.log"
%NSSM% set JockyFastAPI AppRotateFiles 1
%NSSM% set JockyFastAPI AppRotateOnline 1
%NSSM% set JockyFastAPI AppRotateBytes 5242880
%NSSM% set JockyFastAPI AppExit Default Restart
%NSSM% set JockyFastAPI AppRestartDelay 5000
%NSSM% set JockyFastAPI AppThrottle 2000
%NSSM% set JockyFastAPI Start SERVICE_AUTO_START
%NSSM% set JockyFastAPI DisplayName "Jocky FastAPI (uvicorn :8000)"
%NSSM% set JockyFastAPI Description "Jocky forensic interpreter service (SIH26148)"

echo.
echo === Registering JockyWeb (Next.js prod on :3000) ===
%NSSM% stop JockyWeb >nul 2>&1
timeout /t 2 /nobreak >nul
%NSSM% kill JockyWeb >nul 2>&1
timeout /t 2 /nobreak >nul
%NSSM% remove JockyWeb confirm >nul 2>&1
%NSSM% install JockyWeb "%NODE%" node_modules\next\dist\bin\next start --port 3000
%NSSM% set JockyWeb AppDirectory "%PROJECT%\web"
%NSSM% set JockyWeb AppStdout "%PROJECT%\web\next-service.log"
%NSSM% set JockyWeb AppStderr "%PROJECT%\web\next-service.log"
%NSSM% set JockyWeb AppRotateFiles 1
%NSSM% set JockyWeb AppRotateOnline 1
%NSSM% set JockyWeb AppRotateBytes 5242880
%NSSM% set JockyWeb AppExit Default Restart
%NSSM% set JockyWeb AppRestartDelay 5000
%NSSM% set JockyWeb AppThrottle 2000
%NSSM% set JockyWeb AppEnvironmentExtra FORENSIQ_SERVICE_URL=http://127.0.0.1:8000 NODE_ENV=production
%NSSM% set JockyWeb DependOnService JockyFastAPI
%NSSM% set JockyWeb Start SERVICE_AUTO_START
%NSSM% set JockyWeb DisplayName "Jocky Web (Next.js :3000)"
%NSSM% set JockyWeb Description "Jocky web origin for the Cloudflare tunnel (SIH26148)"

echo.
echo === Starting services ===
%NSSM% start JockyFastAPI
timeout /t 4 /nobreak >nul
%NSSM% start JockyWeb
timeout /t 5 /nobreak >nul

echo.
echo === Status ===
sc query JockyFastAPI | findstr "STATE"
sc query JockyWeb | findstr "STATE"
netstat -ano | findstr "LISTENING" | findstr ":8000 :3000"

echo.
echo Done. FastAPI: http://127.0.0.1:8000/health  Web: http://localhost:3000
endlocal
