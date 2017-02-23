@echo off
setlocal enabledelayedexpansion

echo %~n0: Started %date% %time%

IF EXIST "%DEPLOYMENT_SOURCE%\package.json" (
    pushd "%DEPLOYMENT_SOURCE%"
    echo %date% %time% NPM Installing: %DEPLOYMENT_SOURCE%\package.json
    npm install --production --progress=false --cache-min=432000
    npm install --save json-loader --progress=false --cache-min=432000
    IF !ERRORLEVEL! NEQ 0 goto error
    popd
    @echo off
)

IF EXIST "%DEPLOYMENT_SOURCE%\.deploy\package.json" (
    pushd "%DEPLOYMENT_SOURCE%\.deploy"
    echo %date% %time% NPM Installing: %DEPLOYMENT_SOURCE%\.deploy\package.json
    npm install --production --progress=false --cache-min=432000
    IF !ERRORLEVEL! NEQ 0 goto error
    popd
    @echo off
)

echo %~n0: Completed %date% %time%
goto end

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