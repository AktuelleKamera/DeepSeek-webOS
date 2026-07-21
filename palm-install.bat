@ECHO OFF
REM palm-install.bat - 一键安装 IPK 到 webOS TouchPad
REM 用法: palm-install.bat [ipk文件路径]

SET NOVACOM="C:\Program Files\Palm, Inc\novacom.exe"
SET PWD=webos20090606
SET APP_ID=com.deepseek.webos

REM 默认 IPK 路径
IF "%1"=="" (
    SET IPK=bin\%APP_ID%_1.0.0_all.ipk
) ELSE (
    SET IPK=%1
)

IF "%IPK%"=="--list" (
    ECHO 列出设备...
    %NOVACOM% -l
    EXIT /B 0
)

IF NOT EXIST %IPK% (
    ECHO 错误: 找不到文件 %IPK%
    ECHO 请先运行 build.bat 编译
    EXIT /B 1
)

ECHO [1/5] 认证...
%NOVACOM% -c login -r %PWD% -w
IF ERRORLEVEL 1 (
    ECHO 错误: 认证失败，请检查 USB 连接
    EXIT /B 1
)

ECHO [2/5] 发送 IPK 到设备...
%NOVACOM% put "file:///tmp/deepseek.ipk" < %IPK%
IF ERRORLEVEL 1 (
    ECHO 错误: 发送失败
    EXIT /B 1
)

ECHO [3/5] 安装...
> "%TEMP%\ds_install.txt" ECHO ipkg-cl remove %APP_ID% 2^>nul
>> "%TEMP%\ds_install.txt" ECHO ipkg-cl install /tmp/deepseek.ipk
>> "%TEMP%\ds_install.txt" ECHO rm -rf "/media/cryptofs/apps/usr/palm/applications/%APP_ID%"
>> "%TEMP%\ds_install.txt" ECHO cp -r "/usr/palm/applications/%APP_ID%" "/media/cryptofs/apps/usr/palm/applications/"
>> "%TEMP%\ds_install.txt" ECHO echo INSTALL_DONE

TYPE "%TEMP%\ds_install.txt" | %NOVACOM% open tty://

ECHO [4/5] 刷新应用列表...
> "%TEMP%\ds_scan.txt" ECHO luna-send -n 1 palm://com.palm.applicationManager/rescan '{}'
>> "%TEMP%\ds_scan.txt" ECHO exit
TYPE "%TEMP%\ds_scan.txt" | %NOVACOM% open tty://

ECHO [5/5] 启动应用...
> "%TEMP%\ds_launch.txt" ECHO luna-send -n 1 palm://com.palm.applicationManager/launch '{"id":"%APP_ID%"}'
>> "%TEMP%\ds_launch.txt" ECHO exit
TYPE "%TEMP%\ds_launch.txt" | %NOVACOM% open tty://

ECHO.
ECHO 完成！应用已安装并启动。
