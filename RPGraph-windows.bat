@echo off
setlocal EnableExtensions

cd /d "%~dp0"

call :ensure_node24
if errorlevel 1 exit /b %errorlevel%

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo npm was not found after installing Node.js.
  echo Restart Windows, then start this file again.
  echo.
  pause
  exit /b 1
)

:menu
cls
echo ======================================
echo  RPgraph Studio - Windows Starter
echo ======================================
echo.
echo 1^) Start app ^(Normal / Offline^)
echo 2^) Start app ^(Development / Live Reload^)
echo 3^) Build production app only
echo 4^) Install dependencies
echo 5^) Reset generated files
echo 6^) Reset local app data ^(delete RPGraph saves/settings^)
echo 7^) Exit
echo.
set /p "choice=Selection: "

if "%choice%"=="1" goto start_normal
if "%choice%"=="2" goto start_dev
if "%choice%"=="3" goto build_app
if "%choice%"=="4" goto install_dependencies
if "%choice%"=="5" goto reset_generated_files
if "%choice%"=="6" goto reset_local_app_data
if "%choice%"=="7" exit /b 0

echo.
echo Invalid selection.
goto pause_and_menu

:ensure_dependencies
node scripts\dependency-state.mjs check >nul 2>&1
if not errorlevel 1 exit /b 0

echo.
choice /C YN /N /M "Dependencies are missing or outdated. Install them now with npm ci? [Y/N] "
if errorlevel 2 (
  echo.
  echo Start canceled: please run option 4 first.
  exit /b 1
)

echo.
call :run_clean_install
exit /b %errorlevel%

:run_clean_install
call npm ci
if errorlevel 1 exit /b %errorlevel%
node scripts\dependency-state.mjs record
exit /b %errorlevel%

:start_normal
call :ensure_dependencies
if errorlevel 1 goto pause_and_menu
echo.
echo Building the local app and starting RPgraph Studio ...
call npm run build
if errorlevel 1 goto pause_and_menu
call npm run desktop:windows
goto pause_and_menu

:start_dev
call :ensure_dependencies
if errorlevel 1 goto pause_and_menu
echo.
echo Starting RPgraph Studio in development mode with a localhost server ...
call npm run desktop:windows:dev
goto pause_and_menu

:build_app
call :ensure_dependencies
if errorlevel 1 goto pause_and_menu
echo.
echo Building the production app ...
call npm run build
goto pause_and_menu

:install_dependencies
echo.
echo Installing dependencies exactly as pinned in package-lock.json ...
call :run_clean_install
goto pause_and_menu

:reset_generated_files
echo.
echo Reset removes generated files only:
echo   - dist ^(build output^)
echo   - node_modules ^(installed packages, optional^)
echo Source code and Git history remain untouched.
echo.
choice /C YN /N /M "Remove the dist build output? [Y/N] "
if errorlevel 2 goto ask_remove_modules
if exist "dist\" rmdir /s /q "dist"
echo dist has been removed.

:ask_remove_modules
choice /C YN /N /M "Remove node_modules too? npm ci will be required afterward. [Y/N] "
if errorlevel 2 goto pause_and_menu
if exist "node_modules\" rmdir /s /q "node_modules"
echo node_modules has been removed.
goto pause_and_menu

:reset_local_app_data
set "RPGRAPH_USER_DATA=%APPDATA%\RPgraph Studio"
echo.
echo This deletes the local RPGraph app data folder:
echo   "%RPGRAPH_USER_DATA%"
echo.
echo This includes locally stored workflows, RP saves, storybooks, settings,
echo window state, and cached browser data for RPGraph Studio.
echo.
echo Close RPGraph Studio before continuing.
echo.
choice /C YN /N /M "Delete local app data now? [Y/N] "
if errorlevel 2 goto pause_and_menu
if exist "%RPGRAPH_USER_DATA%\" (
  rmdir /s /q "%RPGRAPH_USER_DATA%"
  echo Local app data has been removed.
) else (
  echo Local app data folder was not found.
)
goto pause_and_menu

:pause_and_menu
echo.
pause
goto menu

:ensure_node24
set "NODE_MAJOR=0"
where node >nul 2>&1
if not errorlevel 1 for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% GEQ 24 exit /b 0

echo.
if %NODE_MAJOR% EQU 0 (
  echo Node.js was not found. RPgraph Studio requires Node.js 24 or newer.
) else (
  echo RPgraph Studio requires Node.js 24 or newer.
  echo Current version:
  node --version
)
echo.
choice /C YN /N /M "Download and install Node.js 24 LTS now? [Y/N] "
if errorlevel 2 (
  echo.
  echo Start canceled: Node.js 24 or newer is required.
  exit /b 1
)

where winget >nul 2>&1
if errorlevel 1 (
  echo.
  echo Windows Package Manager ^(winget^) was not found.
  echo Install Node.js 24 manually from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Downloading and installing Node.js 24 LTS ...
winget install --id OpenJS.NodeJS.LTS --exact --source winget --force --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo.
  echo Node.js installation failed. Review the winget message above and try again.
  echo.
  pause
  exit /b 1
)

set "PATH=%ProgramFiles%\nodejs;%PATH%"
set "NODE_MAJOR=0"
where node >nul 2>&1
if not errorlevel 1 for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 24 (
  echo.
  echo Node.js was installed, but this window cannot find Node.js 24 yet.
  echo Restart Windows, then start this file again.
  echo.
  pause
  exit /b 1
)

echo.
node --version installed successfully.
exit /b 0
