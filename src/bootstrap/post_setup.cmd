REM This script is called by setup_worker.cmd when a new Windows Azure Worker Role instance is created.
REM It should be used to install additional software or configure the machine. 
REM When this script is called, node.js and GIT are already installed on the system, 
REM and the user repository is cloned in %~dp0\repo
REM Make sure to return a non-zero exit code on failure.

exit /b 0