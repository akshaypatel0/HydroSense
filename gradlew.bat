@echo off
if exist "%~dp0android\gradlew.bat" (
    cd /d "%~dp0android"
    call gradlew.bat %*
) else (
    echo Error: Android project or gradlew.bat not found in "%~dp0android"
    exit /b 1
)
