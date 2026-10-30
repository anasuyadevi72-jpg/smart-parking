# Set Java and Android SDK environment paths
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\delgr\AppData\Local\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host ">>> Preparing web assets in www/..." -ForegroundColor Cyan
npm run build

Write-Host ">>> Syncing with Capacitor Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host ">>> Building Android APK..." -ForegroundColor Cyan
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

Write-Host ">>> Copying APK to project root..." -ForegroundColor Cyan
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "ParkHash-Mobile.apk" -Force

Write-Host ">>> SUCCESS: APK ready at ParkHash-Mobile.apk" -ForegroundColor Green
