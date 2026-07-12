@echo off
chcp 65001 >nul
set "PACKAGE_DIR=%~dp0"
set /p "CONFIRM=输入 y 确认卸载："
if /I not "%CONFIRM%"=="y" exit /b 0
"%PACKAGE_DIR%payload\runtime\node.exe" "%PACKAGE_DIR%installer.mjs" uninstall
set "STATUS=%ERRORLEVEL%"
pause
exit /b %STATUS%
