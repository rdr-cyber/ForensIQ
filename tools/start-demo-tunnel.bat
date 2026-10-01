@echo off
REM ============================================================
REM  Jocky one-command demo tunnel (temporary public URL)
REM
REM  Prereqs: JockyFastAPI + JockyWeb services running
REM  (tools\install-jocky-services.bat) - ports 8000 + 3000 up.
REM  Effect: quick cloudflared tunnel on :3000, prints the URL.
REM  URL changes every restart; close the minimized tunnel
REM  window to take the demo offline. Port 8000 is never exposed.
REM
REM  NOTE: %~dp0.. must not contain spaces (true for the standard
REM  checkout path; the nested quoting below relies on it).
REM ============================================================
setlocal
set "LOG=%~dp0..\cloudflared-quick.log"

curl -s -m 3 -o nul http://localhost:3000/login
if errorlevel 1 (
  echo JockyWeb not reachable on :3000 - run tools\install-jocky-services.bat first.
  exit /b 1
)
curl -s -m 3 -o nul http://127.0.0.1:8000/health
if errorlevel 1 (
  echo JockyFastAPI not reachable on :8000 - run tools\install-jocky-services.bat first.
  exit /b 1
)

rem kill only quick tunnels (their command line contains --url; the
rem agent service runs with --token-file and is NEVER matched)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.CommandLine -match '--url' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
ping -n 2 127.0.0.1 >nul

if exist "%LOG%" del "%LOG%" >nul 2>&1
rem Start-Process detaches cleanly: a plain `start cmd /c` wrapper
rem inherits the caller's redirected stdout and can hold it open forever
set "ERRLOG=%TEMP%\jocky-tunnel-err.log"
powershell -NoProfile -Command "Start-Process cloudflared -ArgumentList 'tunnel','--url','http://localhost:3000' -WindowStyle Hidden -RedirectStandardOutput '%LOG%' -RedirectStandardError '%ERRLOG%'"
echo Tunnel starting, waiting for the URL...
rem ping-based sleep: `timeout /nobreak` hangs when stdin is redirected
ping -n 13 127.0.0.1 >nul

rem findstr can block forever on a log that cloudflared keeps open -
rem parse a closed COPY of it instead
set "SNAP=%TEMP%\jocky-tunnel-snapshot.log"
copy /y "%LOG%" "%SNAP%" >nul 2>&1
set "RAW="
for /f "tokens=*" %%U in ('findstr /r "trycloudflare\.com" "%SNAP%"') do set "RAW=%%U"
if not defined RAW (
  echo Tunnel did not come up - last log lines:
  powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 5" 2>nul
  exit /b 1
)
rem strip the log prefix and box-drawing pipes from the URL line
for /f "tokens=1" %%V in ("%RAW:*https://=%") do set "URL=https://%%V"

echo.
echo ============================================================
echo   JOCKY PUBLIC URL:
echo   %URL%
echo ============================================================
echo   Login: analyst2@forensiq.dev  (demo box has the password)
echo   URL changes on every restart. Close the minimized
echo   "Jocky quick tunnel" window to go offline.
echo ============================================================
endlocal
