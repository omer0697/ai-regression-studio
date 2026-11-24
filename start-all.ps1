# AI Regression Studio — Tek Komutla Tüm Servisleri Başlatma (SQLite + Worker + Web)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:JAVA_HOME = "C:\Program Files\JetBrains\IntelliJ IDEA 2026.1\jbr"
$env:MAVEN_OPTS = "-Duser.language=en -Duser.country=US"
$mvn = "C:\Users\omer\.m2\wrapper\dists\apache-maven-3.9.9\8e74001100ff70d6af083c5511fcc5ec49282d7017cde82c3698eee8fdf86698\bin\mvn.cmd"

Write-Host "1/3 Browser Worker (http://localhost:9100) baslatiliyor..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; `$env:WORKER_API_BASE_URL='http://localhost:8080'; `$env:WORKER_INTERNAL_TOKEN='ars-dev-internal-token'; `$env:WORKER_CREDENTIALS_FILE='apps/browser-worker/fixtures/credentials.example.json'; node apps/browser-worker/dist/index.js"

Write-Host "2/3 Spring Boot API [SQLite + Filesystem] (http://localhost:8080) baslatiliyor..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\api'; `$env:JAVA_HOME='$env:JAVA_HOME'; `$env:MAVEN_OPTS='$env:MAVEN_OPTS'; `$env:SPRING_PROFILES_ACTIVE='sqlite'; `$env:ARS_STORAGE_MODE='filesystem'; `$env:ARS_WORKER_BASE_URL='http://localhost:9100'; `$env:ARS_INTERNAL_TOKEN='ars-dev-internal-token'; & '$mvn' spring-boot:run"

Write-Host "3/3 Next.js Web Arayuzu (http://localhost:3000) baslatiliyor..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev:web"

Write-Host "Tum servisler baslatildi! Tarayicidan http://localhost:3000/studio adresini acabilirsiniz (Giris: admin / admin123!)." -ForegroundColor Green
