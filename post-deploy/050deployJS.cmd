@echo off

echo Starting Deploy.js: %date% %time%

node .deploy/deploy.js

IF %ERRORLEVEL% NEQ 0 goto error

echo Finished Deploy.js: %date% %time%

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