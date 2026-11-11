@echo off
title VISINT - Gestion commerciale
cd /d "%~dp0backend"
echo ============================================================
echo   VISINT COMMUNICATION - Gestion commerciale
echo ============================================================
echo.
echo  Preparation de l'environnement (version stable de Python)...
echo  La premiere fois, un telechargement peut etre necessaire.
echo  Merci de patienter 1 a 3 minutes.
echo.
py install 3.12
echo.
echo  Installation des composants de l'application...
py -3.12 -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo  ** Un probleme est survenu pendant l'installation. **
  echo  Envoyez une capture de cette fenetre a votre assistant.
  echo.
  pause
  exit /b
)
echo.
echo  Demarrage de l'application...
echo  Votre navigateur va s'ouvrir automatiquement dans quelques secondes.
echo.
echo  ** NE FERMEZ PAS CETTE FENETRE tant que vous utilisez l'appli **
echo  Pour arreter l'application : fermez simplement cette fenetre.
echo.
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:8000
py -3.12 -m uvicorn app:app --port 8000
pause
