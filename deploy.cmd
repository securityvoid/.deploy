@if "%SCM_TRACE_LEVEL%" NEQ "4" @echo off
@echo Started: %date% %time%

:: ----------------------
:: KUDU Deployment Script
:: Version: 1.0.12
:: ----------------------

:: Prerequisites
:: -------------

:: Verify node.js installed
where node 2>nul >nul
IF %ERRORLEVEL% NEQ 0 (
  echo Missing node.js executable, please install node.js, if already installed make sure it can be reached from current environment.
  goto error
)

:: Setup
:: -----

setlocal enabledelayedexpansion

SET ARTIFACTS=%~dp0%..\artifacts

IF NOT DEFINED DEPLOYMENT_SOURCE (
  SET DEPLOYMENT_SOURCE=%~dp0%.
)
echo "Deployment Source: %DEPLOYMENT_SOURCE%"

IF NOT DEFINED DEPLOY_DIST_FOLDER (
    SET DEPLOY_DIST_FOLDER=dist
)

IF NOT DEFINED DEPLOYMENT_DIST (
    SET DEPLOYMENT_DIST=%DEPLOYMENT_SOURCE%\%DEPLOY_DIST_FOLDER%
) ELSE (
    ECHO "Deployement Dist already set"
)
echo "Deployment Dist: %DEPLOYMENT_DIST%"

IF NOT DEFINED DEPLOYMENT_TARGET (
  SET DEPLOYMENT_TARGET=%ARTIFACTS%\wwwroot
)
echo "Deployment Target: %DEPLOYMENT_TARGET%"

IF NOT DEFINED NEXT_MANIFEST_PATH (
  SET NEXT_MANIFEST_PATH=%ARTIFACTS%\manifest

  IF NOT DEFINED PREVIOUS_MANIFEST_PATH (
    SET PREVIOUS_MANIFEST_PATH=%ARTIFACTS%\manifest
  )
)

IF NOT DEFINED KUDU_SYNC_CMD (
  :: Install kudu sync
  echo Installing Kudu Sync
  call npm install kudusync -g --silent
  IF !ERRORLEVEL! NEQ 0 goto error

  :: Locally just running "kuduSync" would also work
  SET KUDU_SYNC_CMD=%appdata%\npm\kuduSync.cmd
)

for /F "tokens=5 delims=.\" %%a in ("%PREVIOUS_MANIFEST_PATH%") do SET PREVIOUS_SCM_COMMIT_ID=%%a

::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:: Pre-Deployment
:: ----------
@echo "Initiating Pre-Deployment: %date% %time%"
:: .deploy initial install if node_modules doesn't exist.
IF NOT EXIST "%DEPLOYMENT_SOURCE%\.deploy\node_modules" (
    echo "NPM Install: %DEPLOYMENT_SOURCE%\.deploy\package.json"
    pushd "%DEPLOYMENT_SOURCE%\.deploy\"
    call npm install --production --progress=false --cache-min=432000
    popd
) ELSE (
   echo "%DEPLOYMENT_SOURCE%\.deploy\node_modules already exists"
)

::Initial install if node_modules doesn't exist.
IF EXIST "%DEPLOYMENT_SOURCE%\package.json" (
 echo "Main package.json exists."
    IF NOT EXIST "%DEPLOYMENT_SOURCE%\node_modules" (
        echo "NPM Install: %DEPLOYMENT_SOURCE%\package.json"
        pushd "%DEPLOYMENT_SOURCE%"
        call npm install --production --progress=false --cache-min=432000
        call npm install --save json-loader --progress=false --cache-min=432000
        popd
    ) ELSE (
        echo "Main node_modules exists"
    )
) ELSE (
 echo "No main package.json."
)

@echo "Previous Commit: %PREVIOUS_SCM_COMMIT_ID%  Current Commit: %SCM_COMMIT_ID%"
:: Only do npm install if there was a change in package.json
for /F %%f in ('git.exe diff --name-only %PREVIOUS_SCM_COMMIT_ID% %SCM_COMMIT_ID% ^| grep package.json') do (
    SET PACKAGEJSON=%%~f
    SET PKGFOLDER=!DEPLOYMENT_SOURCE!\!PACKAGEJSON:package.json=!
    echo "NPM Install: !PKGFOLDER!package.json"
    pushd "!PKGFOLDER!"
    call npm install --production --progress=false --cache-min=432000
    call npm install --save json-loader --progress=false --cache-min=432000
    IF !ERRORLEVEL! NEQ 0 goto error
    popd
)

:: Clean-up Dist before we start.
IF EXIST "%DEPLOYMENT_DIST" (
    echo."Removing %DEPLOYMENT_TARGET%\%DEPLOY_DIST_FOLDER%"
    call del /f/s/q "%DEPLOYMENT_DIST%" > nul
    call rmdir /s/q "%DEPLOYMENT_DIST%"
    IF !ERRORLEVEL! NEQ 0 goto error
)

::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:: Deployment
:: ----------

@echo "Initiating Deployment: %date% %time%"

:: 1. Build Script
node %DEPLOYMENT_SOURCE%\.deploy\deploy.js
IF !ERRORLEVEL! NEQ 0 goto error

:: 2. KuduSync
IF /I "%IN_PLACE_DEPLOYMENT%" NEQ "1" (
  call :ExecuteCmd "%KUDU_SYNC_CMD%" -v 50 -f "%DEPLOYMENT_DIST%" -t "%DEPLOYMENT_TARGET%" -n "%NEXT_MANIFEST_PATH%" -p "%PREVIOUS_MANIFEST_PATH%" -i ".git;.hg;.deployment;deploy.cmd"
  IF !ERRORLEVEL! NEQ 0 goto error
)

::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
goto end

:: Execute command routine that will echo out when error
:ExecuteCmd
setlocal
set _CMD_=%*
call %_CMD_%
if "%ERRORLEVEL%" NEQ "0" echo Failed exitCode=%ERRORLEVEL%, command=%_CMD_%
exit /b %ERRORLEVEL%

:error
endlocal
echo An error has occurred during web site deployment.
call :exitSetErrorLevel
call :exitFromFunction 2>nul

:exitSetErrorLevel
exit /b 1

:exitFromFunction
()

:end
endlocal
echo Finished successfully.
