@echo off
chcp 65001 >nul
title ផ្សាយបន្តផ្ទាល់ទៅកាន់ GitHub និង Render (Deploy to GitHub & Render)
color 0A

echo ==============================================================================
echo       គណៈកម្មការរៀបចំការបោះឆ្នោតខេត្តតាកែវ (PEC21)
echo   ការបញ្ជូនកូដថ្មីទៅកាន់ GitHub (soeunchim/pec21) និង Render (pec21.onrender.com)
echo ==============================================================================
echo.
echo [1/3] កំពុងចម្លងឯកសារថ្មីៗទាំងអស់...
robocopy "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\public" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\Deploy_To_GitHub\public" /MIR /NFL /NDL /NJH /NJS
robocopy "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\public" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\public" /MIR /NFL /NDL /NJH /NJS
copy /y "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\server.js" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\Deploy_To_GitHub\server.js" >nul
copy /y "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\server.js" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\server.js" >nul
copy /y "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\package.json" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\package.json" >nul
copy /y "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\Web_App_កចប_2026\package.json" "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git\Deploy_To_GitHub\package.json" >nul

echo.
echo [2/3] កំពុង Commit ទិន្នន័យ...
cd /d "D:\I_ការងារបោះឆ្នោត\កម្មវិធីបូកស្រង់នៃការប្រឡង\pec21_git"
"C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" add .
"C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" commit -m "Update official tabulation and exam results tables"

echo.
echo [3/3] កំពុង Push ទៅកាន់ GitHub...
"C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" push origin main

echo.
echo ==============================================================================
echo  ជោគជ័យ! Render នឹងធ្វើការ Auto-deploy ទៅកាន់ pec21.onrender.com ដោយស្វ័យប្រវត្តិ
echo ==============================================================================
pause
