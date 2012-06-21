@echo off

setlocal

SET THIS=%~dp0
SET GIT=%programfiles(x86)%\Git\cmd\git.cmd

pushd %THIS%\repo

echo %DATE% %TIME% Resetting the repo...
call %GIT% reset --hard
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Unable to reset the repository
   exit /b -13
)
echo %DATE% %TIME% Repo reset

echo %DATE% %TIME% Pulling the repo...
call %GIT% pull origin %REMOTE_BRANCH%
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Unable to pull the repository
   exit /b -14
)
echo %DATE% %TIME% Latest repository bits pulled

echo %DATE% %TIME% Updating submodules...
call %GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Updating submodules
   exit /b -15
)
echo %DATE% %TIME% Submodules updated

popd

endlocal

exit /b 0