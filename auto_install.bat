@echo off
echo Warming up Jenga pizza's oven.......

start powershell.exe -NoExit -Command "cd ./jenga_project; npm i; npm run start_oven"

timeout /t 4

start http://localhost:3000
echo Jenga Pizza is now open and ready to serve!