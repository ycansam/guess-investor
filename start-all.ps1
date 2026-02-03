# Start All Services - Guess Investor
# Abre una terminal dividida en 3 paneles en VS Code

Write-Host "🚀 Iniciando Guess Investor en terminal dividida..." -ForegroundColor Cyan

# Usa VS Code CLI para abrir terminales divididas
code --command "workbench.action.terminal.new"
Start-Sleep -Milliseconds 500
code --command "workbench.action.terminal.sendSequence" --args '{"text":"cd \"d:\\Documentos\\App Projects\\guess-investor\\backend\" && npm run dev\n"}'

Start-Sleep -Milliseconds 300
code --command "workbench.action.terminal.split"
Start-Sleep -Milliseconds 500
code --command "workbench.action.terminal.sendSequence" --args '{"text":"cd \"d:\\Documentos\\App Projects\\guess-investor\\code\" && npm start\n"}'

Start-Sleep -Milliseconds 300
code --command "workbench.action.terminal.split"
Start-Sleep -Milliseconds 500
code --command "workbench.action.terminal.sendSequence" --args '{"text":"cd \"d:\\Documentos\\App Projects\\guess-investor\\code\" && npm run python:watch\n"}'

Write-Host "✅ Terminal dividida en 3 paneles!" -ForegroundColor Green
