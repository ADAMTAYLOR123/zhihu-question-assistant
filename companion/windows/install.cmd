@echo off
chcp 65001 >nul
set "PACKAGE_DIR=%~dp0"
"%PACKAGE_DIR%payload\runtime\node.exe" "%PACKAGE_DIR%installer.mjs" install
set "STATUS=%ERRORLEVEL%"
echo.
if "%STATUS%"=="0" echo 安装完成，请按说明加载 Chrome 扩展。
pause
exit /b %STATUS%
