@echo off
echo Install Warming up Jenga pizza's oven.........

:: Second window - MNPCore with npm i and npm run dev
start powershell.exe -NoExit -Command "cd ./jenga_project; npm i; npm run dev"

timeout /t 4

start http://localhost:3000

echo Browser opened to localhost:3000