@echo off
setlocal enabledelayedexpansion

echo %~n0: Started %date% %time%

FOR /D %%i IN (*.*) DO (
    @echo %date% %time% - Current: %%i
    IF EXIST "%DEPLOYMENT_SOURCE%\%%i\package.json" (
        pushd "%DEPLOYMENT_SOURCE%\%%i"
        echo %date% %time% NPM Installing: %DEPLOYMENT_SOURCE%\%%i\package.json
        npm install --production --progress=false --cache-min=432000
        npm install --save json-loader --progress=false --cache-min=432000
        IF !ERRORLEVEL! NEQ 0 goto error
        popd
        @echo off
      )
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