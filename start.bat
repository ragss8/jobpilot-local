@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env (
  echo Copy .env.example to .env and fill it in first.
  exit /b 1
)
call npm run db:up
start "Aangan API" cmd /k npm run server
call npm run dev
