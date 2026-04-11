# Script PowerShell per avviare CRM Immobiliare con Docker
# Compatibile con Windows PowerShell e PowerShell Core

param(
    [switch]$Production,
    [switch]$Development,
    [switch]$Stop,
    [switch]$Restart,
    [switch]$Logs,
    [switch]$Status
)

# Colori per output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

function Test-Docker {
    try {
        docker --version | Out-Null
        docker-compose --version | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Test-DockerRunning {
    try {
        docker info | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Show-Header {
    Write-Host ""
    Write-Host "🏢 CRM Immobiliare - Docker Manager" -ForegroundColor $Green
    Write-Host "===================================" -ForegroundColor $Green
    Write-Host ""
}

function Show-Help {
    Write-Host "Utilizzo:"
    Write-Host "  .\scripts\start-docker.ps1 [OPZIONI]"
    Write-Host ""
    Write-Host "Opzioni:"
    Write-Host "  -Development    Avvia in modalità sviluppo (solo servizi di supporto)"
    Write-Host "  -Production     Avvia in modalità produzione (tutti i servizi)"
    Write-Host "  -Stop           Ferma tutti i servizi"
    Write-Host "  -Restart        Riavvia tutti i servizi"
    Write-Host "  -Logs           Mostra i log dei servizi"
    Write-Host "  -Status         Mostra lo stato dei servizi"
    Write-Host ""
    Write-Host "Esempi:"
    Write-Host "  .\scripts\start-docker.ps1 -Development"
    Write-Host "  .\scripts\start-docker.ps1 -Production"
    Write-Host "  .\scripts\start-docker.ps1 -Stop"
    Write-Host ""
}

function Start-Development {
    Write-Status "Avvio servizi di sviluppo (PostgreSQL, Redis, MinIO)..."
    
    try {
        docker-compose up -d postgres redis minio
        
        Write-Status "Attesa avvio servizi..."
        Start-Sleep -Seconds 10
        
        Write-Success "Servizi di sviluppo avviati!"
        Write-Host ""
        Write-Host "🔗 Servizi disponibili:"
        Write-Host "  • PostgreSQL: localhost:5432"
        Write-Host "  • Redis: localhost:6379"
        Write-Host "  • MinIO: http://localhost:9001 (minioadmin/minioadmin123)"
        Write-Host ""
        Write-Host "📋 Prossimi passi:"
        Write-Host "  1. Configura il file .env nel backend"
        Write-Host "  2. Esegui le migrazioni: cd packages\backend && npx prisma migrate dev"
        Write-Host "  3. Popola il database: npx prisma db seed"
        Write-Host "  4. Avvia l'applicazione: npm run dev"
        Write-Host ""
    }
    catch {
        Write-Error "Errore durante l'avvio dei servizi: $_"
        exit 1
    }
}

function Start-Production {
    Write-Status "Avvio completo in modalità produzione..."
    
    # Verifica se esistono i Dockerfile
    if (-not (Test-Path "packages\backend\Dockerfile")) {
        Write-Error "Dockerfile backend non trovato. Assicurati di essere nella directory root del progetto."
        exit 1
    }
    
    if (-not (Test-Path "packages\frontend\Dockerfile")) {
        Write-Error "Dockerfile frontend non trovato. Assicurati di essere nella directory root del progetto."
        exit 1
    }
    
    try {
        Write-Status "Build e avvio di tutti i servizi..."
        docker-compose -f docker-compose.prod.yml up -d --build
        
        Write-Status "Attesa avvio servizi..."
        Start-Sleep -Seconds 30
        
        Write-Success "Applicazione avviata in modalità produzione!"
        Write-Host ""
        Write-Host "🔗 Applicazione disponibile:"
        Write-Host "  • Frontend: http://localhost:3000"
        Write-Host "  • Backend API: http://localhost:3001"
        Write-Host "  • Documentazione API: http://localhost:3001/api/docs"
        Write-Host "  • MinIO Console: http://localhost:9001"
        Write-Host ""
        Write-Host "🔑 Credenziali demo:"
        Write-Host "  • Email: admin@agenziademo.it"
        Write-Host "  • Password: demo123"
        Write-Host ""
    }
    catch {
        Write-Error "Errore durante l'avvio: $_"
        exit 1
    }
}

function Stop-Services {
    Write-Status "Arresto di tutti i servizi..."
    
    try {
        docker-compose down
        docker-compose -f docker-compose.prod.yml down
        
        Write-Success "Tutti i servizi sono stati fermati."
    }
    catch {
        Write-Error "Errore durante l'arresto: $_"
    }
}

function Restart-Services {
    Write-Status "Riavvio servizi..."
    
    Stop-Services
    Start-Sleep -Seconds 5
    
    if ($Production) {
        Start-Production
    } else {
        Start-Development
    }
}

function Show-Logs {
    Write-Status "Visualizzazione log dei servizi..."
    
    try {
        if (Test-Path "docker-compose.prod.yml") {
            docker-compose -f docker-compose.prod.yml logs -f
        } else {
            docker-compose logs -f
        }
    }
    catch {
        Write-Error "Errore nella visualizzazione dei log: $_"
    }
}

function Show-Status {
    Write-Status "Stato dei servizi Docker:"
    Write-Host ""
    
    try {
        docker-compose ps
        Write-Host ""
        docker-compose -f docker-compose.prod.yml ps
    }
    catch {
        Write-Error "Errore nel recupero dello stato: $_"
    }
}

# Main script
Show-Header

# Verifica prerequisiti
if (-not (Test-Docker)) {
    Write-Error "Docker o Docker Compose non trovati. Installa Docker Desktop."
    exit 1
}

if (-not (Test-DockerRunning)) {
    Write-Error "Docker non è in esecuzione. Avvia Docker Desktop e riprova."
    exit 1
}

# Gestione parametri
if ($Stop) {
    Stop-Services
}
elseif ($Restart) {
    Restart-Services
}
elseif ($Logs) {
    Show-Logs
}
elseif ($Status) {
    Show-Status
}
elseif ($Production) {
    Start-Production
}
elseif ($Development) {
    Start-Development
}
else {
    Show-Help
} 