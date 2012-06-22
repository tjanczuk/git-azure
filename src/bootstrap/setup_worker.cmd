@echo off

echo %DATE% %TIME% Entering setup_worker.cmd

SET NODE_URL=http://nodejs.org/dist/v0.7.8/node-v0.7.8.msi
SET GIT_URL=http://msysgit.googlecode.com/files/PortableGit-1.7.11-preview20120620.7z
SET SSH_URL=http://www.freesshd.com/freeSSHd.exe

SET THIS=%~dp0
SET POST_SETUP=%THIS%\repo\.git-azure\src\bootstrap\post_setup.cmd
SET POST_SETUP_1=%THIS%\repo\post_setup.cmd
SET GITPATH=%THIS%\git\
SET GIT=%THIS%\git\bin\git.exe

echo %DATE% %TIME% Granting permissions for all users to the deployment directory...
icacls %THIS% /grant "Users":(OI)(CI)F
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR Granting permission
   exit /b -9
)
echo %DATE% %TIME% Permissions granted

if exist %THIS%\node.msi if exist %THIS%\Git-1.7.9-preview20120201.exe if exist %THIS%\freesshd.exe goto install_node

echo %DATE% %TIME% Downloading prerequisities...
%THIS%\download.exe 300 %NODE_URL% %THIS%\node.msi %GIT_URL% %THIS%\PortableGit-1.7.11-preview20120620.7z %SSH_URL% %THIS%\freesshd.exe
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR downloading prerequisities
   exit /b -1
)
echo %DATE% %TIME% Prerequisities downloaded

:install_node

if exist "%programfiles(x86)%\nodejs\node.exe" goto install_git

echo %DATE% %TIME% Installing node.js...
msiexec /i %THIS%\node.msi /q
echo %ERRORLEVEL%
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 1603 (
   echo %DATE% %TIME% ERROR installing node.js %ERRORLEVEL%
   exit /b -2
)
rem echo %DATE% %TIME% Node.js installed

:install_git

if exist %GIT% goto install_ssh

echo %DATE% %TIME% Installing GIT...
%THIS%\7za.exe x PortableGit-1.7.11-preview20120620.7z -y -o"%GITPATH%"
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR installing GIT
   exit /b -3
)

md "%GITPATH%\.ssh"
copy %THIS%\id_rsa %GITPATH%\.ssh\id_rsa
copy %THIS%\id_rsa.pub %GITPATH%\.ssh\id_rsa.pub
copy %THIS%\known_hosts %GITPATH%\.ssh\known_hosts
set PATH=%GITPATH%;%PATH%;

if NOT EXIST %GIT% (
   echo %DATE% %TIME% ERROR Unable to find GIT at %GIT%
   exit /b -4
)
echo %DATE% %TIME% GIT installed

:install_ssh

if exist "%programfiles(x86)%\freesshd\rsakey.cfg" goto add_ssh_user

echo %DATE% %TIME% Installing FreeSSHd...
%THIS%\freesshd.exe /verysilent /noicon /suppressmsgboxes
if %ERRORLEVEL% NEQ 0 (
    echo %DATE% %TIME% ERROR installing FreeSSHd
    exit /b -7
)

:wait_for_ssh_install

set RETRY=.
if exist "%programfiles(x86)%\freesshd\rsakey.cfg" (
    echo %DATE% %TIME% FreeSSHd installed
    goto add_ssh_user
)
if "%RETRY%" EQU "........" (
    echo %DATE% %TIME% ERROR installing FreeSSHd
    exit /b -7
)
set RETRY=%RETRY%.
timeout 3 /nobreak
goto wait_for_ssh_install

:add_ssh_user

copy /y %THIS%\freesshdservice.ini "%programfiles(x86)%\freesshd\freesshdservice.ini"
if %ERRORLEVEL% NEQ 0 (
    echo %DATE% %TIME% ERROR adding user %MANAGEMENT_USERNAME% to SSH users
    exit /b -10
)

echo Name=%MANAGEMENT_USERNAME% >> "%programfiles(x86)%\freesshd\freesshdservice.ini"
if %ERRORLEVEL% NEQ 0 (
    echo %DATE% %TIME% ERROR adding user %MANAGEMENT_USERNAME% to SSH users
    exit /b -13
)

net stop freesshdservice
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 2 (
    echo %DATE% %TIME% ERROR stopping freesshdservice to update configuration
    exit /b -11
)
net start freesshdservice
if %ERRORLEVEL% NEQ 0 (
    echo %DATE% %TIME% ERROR restarting freesshdservice to update configuration
    exit /b -12
)
echo %DATE% %TIME% Added user %MANAGEMENT_USERNAME% to SSH users

:firewall

echo %DATE% %TIME% Opening up port 22 for SSH in the firewall...
netsh advfirewall firewall add rule name="SSH" dir=in protocol=TCP localport=22 action=allow profile=public
if %ERRORLEVEL% NEQ 0 (
    echo %DATE% %TIME% ERROR opening port 22 for SSH in the firewall
    exit /b -9
)
echo %DATE% %TIME% Port 22 opened in the firewall

:sync

if exist %THIS%\repo\.git goto pull_only

echo %DATE% %TIME% Cloning branch %REMOTE_BRANCH% from repo %REMOTE_URL%...
%GIT% clone -b %REMOTE_BRANCH% %REMOTE_URL% %THIS%\repo
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR Unable to clone branch %REMOTE_BRANCH% from repo %REMOTE_URL%
   exit /b -5
)
echo %DATE% %TIME% Repo cloned

echo %DATE% %TIME% Updating submodules...
pushd %THIS%\repo
%GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Updating submodules
   exit /b -6
)
popd
echo %DATE% %TIME% Submodules updated

goto post_setup

:pull_only

call %THIS%\sync_repo.cmd
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

:post_setup

if NOT EXIST %POST_SETUP% goto post_setup_1

echo %DATE% %TIME% Running post setup from %POST_SETUP%...
call %POST_SETUP%
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR The post setup failed with %ERRORLEVEL%
   exit /b -8
)
echo %DATE% %TIME% Post setup finished

:post_setup_1

if not exist %POST_SETUP_1% goto end

echo %DATE% %TIME% Running post setup 1 from %POST_SETUP_1%...
call %POST_SETUP_1%
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR The post setup failed with %ERRORLEVEL%
   exit /b -8
)
echo %DATE% %TIME% Post setup 1 finished

:end

echo %DATE% %TIME% Exiting setup_worker.cmd (success)

exit /b 0