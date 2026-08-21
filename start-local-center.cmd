@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\server\index.js" (
  echo Building the local application...
  call npm run build
  if errorlevel 1 goto :error
)
node local-server\server.mjs
if errorlevel 1 goto :error
goto :end
:error
echo.
echo The local center server could not start.
pause
:end
endlocal
