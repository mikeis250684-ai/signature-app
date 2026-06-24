@echo off
chcp 65001 >nul
echo ============================================
echo   מערכת חתימה דיגיטלית — התקנה מהירה
echo ============================================
echo.

:: בדיקת Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js לא מותקן.
    echo     הורד מ: https://nodejs.org  (בחר LTS)
    echo     אחרי ההתקנה הרץ שוב את הקובץ הזה.
    pause
    exit /b 1
)

echo [v] Node.js מותקן:
node --version

:: בדיקת git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git לא מותקן.
    echo     הורד מ: https://git-scm.com
    pause
    exit /b 1
)

echo [v] Git מותקן
echo.

:: שיבוט הפרויקט
if not exist "signature-app" (
    echo [*] מוריד את הפרויקט מ-GitHub...
    git clone https://github.com/mikeis250684-ai/signature-app.git
    if %errorlevel% neq 0 (
        echo [!] שגיאה בהורדה מ-GitHub
        pause
        exit /b 1
    )
) else (
    echo [v] תיקיית הפרויקט כבר קיימת — מעדכן...
    cd signature-app
    git pull
    cd ..
)

cd signature-app

:: התקנת תלויות
echo.
echo [*] מתקין חבילות (npm install)...
npm install
if %errorlevel% neq 0 (
    echo [!] שגיאה בהתקנת חבילות
    pause
    exit /b 1
)

:: יצירת .env אם לא קיים
if not exist ".env" (
    echo.
    echo ============================================
    echo   הגדרת משתני סביבה
    echo ============================================
    echo   (את הערכים תמצא ב-Render Dashboard)
    echo.

    set /p SUPABASE_URL="Supabase URL (https://xxx.supabase.co): "
    set /p SUPABASE_KEY="Supabase Service Key (eyJ...): "
    set /p RESEND_KEY="Resend API Key (re_...): "
    set /p ADMIN_PASS="סיסמת כניסה לפאנל: "
    set /p ADMIN_MAIL="מייל לקבלת התראות: "

    (
        echo SUPABASE_URL=%SUPABASE_URL%
        echo SUPABASE_SERVICE_KEY=%SUPABASE_KEY%
        echo RESEND_API_KEY=%RESEND_KEY%
        echo ADMIN_PASSWORD=%ADMIN_PASS%
        echo ADMIN_EMAIL=%ADMIN_MAIL%
        echo APP_URL=http://localhost:3000
        echo PORT=3000
    ) > .env

    echo.
    echo [v] קובץ .env נוצר
)

echo.
echo ============================================
echo   ההתקנה הושלמה!
echo ============================================
echo.
echo   להפעלה: node server/index.js
echo   כתובת:  http://localhost:3000/admin.html
echo.
set /p START="להפעיל עכשיו? (y/n): "
if /i "%START%"=="y" (
    echo.
    echo [*] מפעיל שרת...
    node server/index.js
)

pause
