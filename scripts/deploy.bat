@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Agent Company Deployment Script
echo ==========================================

set "APP_NAME=agentcompany"
for %%I in ("%~dp0..") do set "APP_DIR=%%~fI"
set "ENV_FILE=%APP_DIR%\.env.production"
set "COMPOSE_FILE=%APP_DIR%\docker-compose.prod.yml"
set "PORT=3000"

if not exist "%ENV_FILE%" (
    echo [WARN] .env.production not found.
    if exist "%APP_DIR%\.env.example" (
        copy "%APP_DIR%\.env.example" "%ENV_FILE%" >nul
        echo [INFO] Created .env.production from .env.example
        echo [ERROR] Please edit .env.production with your production values
        exit /b 1
    ) else (
        echo [ERROR] .env.example not found. Please create .env.production manually.
        exit /b 1
    )
)

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed. Please install Docker first.
    exit /b 1
)

docker compose version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

echo [INFO] Building Docker image...
docker build -t "%APP_NAME%:latest" "%APP_DIR%"
if %errorlevel% neq 0 exit /b %errorlevel%

echo [INFO] Running database migrations...
docker run --rm --env-file "%ENV_FILE%" "%APP_NAME%:latest" prisma migrate deploy
if %errorlevel% neq 0 exit /b %errorlevel%

echo [INFO] Starting containers...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up -d --remove-orphans
if %errorlevel% neq 0 exit /b %errorlevel%

echo [INFO] Waiting for application to be ready...
set "RETRY_COUNT=0"

:wait_loop
if %RETRY_COUNT% GEQ 30 (
    echo.
    echo [ERROR] Application failed to start within timeout
    docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" logs
    exit /b 1
)

curl -s -f "http://localhost:%PORT%/api/health" >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [INFO] Application is ready!
) else (
    set /a RETRY_COUNT+=1
    <nul set /p "=."
    timeout /t 2 /nobreak >nul
    goto wait_loop
)

echo.
echo [INFO] Deployment complete!
echo.
echo ==========================================
echo Application URLs:
echo   - Main App: http://localhost:%PORT%
echo   - Health Check: http://localhost:%PORT%/api/health
echo   - Extended Health: http://localhost:%PORT%/api/health/extended
echo ==========================================
echo.
echo Useful commands:
echo   - View logs: docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" logs -f
echo   - Stop: docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" down
echo   - Restart: docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" restart
echo.

endlocal
