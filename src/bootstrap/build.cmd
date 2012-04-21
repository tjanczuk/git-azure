@echo off

SET THIS=%~dp0

csc.exe /out:%THIS%\download.exe %THIS%\download.cs
if %ERRORLEVEL% NEQ 0 (
    echo Error building download.exe. Make sure csc.exe from .NET Framework is on the PATH.
    exit /b -1
)

cspack.exe %THIS%\bootstrap.csdef /out:%THIS%\bootstrap.cspkg /roleFiles:bootstrap;%THIS%\files.txt
if %ERRORLEVEL% NEQ 0 (
    echo Error building bootstrap.cspkg. Make sure cspack.exe from Windows Azure SDK is on the PATH.
    exit /b -1
)

exit /b 0