@echo off
chcp 65001 >nul
set "PACKAGE_DIR=%~dp0"
"%PACKAGE_DIR%payload\runtime\node.exe" "%PACKAGE_DIR%installer.mjs" status
set "STATUS=%ERRORLEVEL%"
pause
exit /b %STATUS%
