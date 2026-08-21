@echo off
cd /d %~dp0
node server.js > server.start.log 2> server.start.err.log
