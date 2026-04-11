#!/bin/bash

# Script di setup automatico per CRM Immobiliare
# Questo script configura l'ambiente di sviluppo completo

set -e

echo "🏢 CRM Immobiliare - Setup Automatico"
echo "====================================="

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funzione per stampare messaggi colorati
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verifica prerequisiti
check_prerequisites() {
    print_status "Verifica prerequisiti..."
    
    # Verifica Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js non trovato. Installa Node.js 18+ da https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js versione 18+ richiesta. Versione attuale: $(node -v)"
        exit 1
    fi
    
    # Verifica npm
    if ! command -v npm &> /dev/null; then
        print_error "npm non trovato. Installa npm."
        exit 1
    fi
    
    # Verifica Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker non trovato. Installa Docker da https://docker.com/"
        exit 1
    fi
    
    # Verifica Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose non trovato. Installa Docker Compose."
        exit 1
    fi
    
    print_success "Tutti i prerequisiti sono soddisfatti"
}

# Installazione dipendenze
install_dependencies() {
    print_status "Installazione dipendenze..."
    
    # Root dependencies
    print_status "Installazione dipendenze root..."
    npm install
    
    # Backend dependencies
    print_status "Installazione dipendenze backend..."
    cd packages/backend
    npm install
    cd ../..
    
    # Frontend dependencies
    print_status "Installazione dipendenze frontend..."
    cd packages/frontend
    npm install
    cd ../..
    
    print_success "Dipendenze installate con successo"
}

# Setup ambiente
setup_environment() {
    print_status "Configurazione ambiente..."
    
    # Copia file .env per backend
    if [ ! -f "packages/backend/.env" ]; then
        print_status "Creazione file .env per backend..."
        cp packages/backend/.env.example packages/backend/.env
        print_success "File .env creato. Modifica le configurazioni se necessario."
    else
        print_warning "File .env già esistente, saltato."
    fi
}

# Avvio servizi Docker
start_docker_services() {
    print_status "Avvio servizi Docker..."
    
    # Verifica se Docker è in esecuzione
    if ! docker info &> /dev/null; then
        print_error "Docker non è in esecuzione. Avvia Docker e riprova."
        exit 1
    fi
    
    # Avvia servizi
    docker-compose up -d postgres redis minio
    
    print_status "Attesa avvio servizi..."
    sleep 10
    
    print_success "Servizi Docker avviati"
}

# Setup database
setup_database() {
    print_status "Configurazione database..."
    
    cd packages/backend
    
    # Genera client Prisma
    print_status "Generazione client Prisma..."
    npx prisma generate
    
    # Esegui migrazioni
    print_status "Esecuzione migrazioni database..."
    npx prisma migrate dev --name init
    
    # Popola database con dati demo
    print_status "Popolamento database con dati demo..."
    npx prisma db seed
    
    cd ../..
    
    print_success "Database configurato con successo"
}

# Verifica installazione
verify_installation() {
    print_status "Verifica installazione..."
    
    # Test connessione database
    cd packages/backend
    if npx prisma db pull &> /dev/null; then
        print_success "Connessione database OK"
    else
        print_error "Errore connessione database"
        return 1
    fi
    cd ../..
    
    print_success "Installazione verificata con successo"
}

# Mostra informazioni finali
show_final_info() {
    echo ""
    echo "🎉 Setup completato con successo!"
    echo ""
    echo "📋 Prossimi passi:"
    echo "1. Avvia l'applicazione: npm run dev"
    echo "2. Apri il browser su: http://localhost:3000"
    echo "3. Accedi con le credenziali demo:"
    echo "   • Email: admin@agenziademo.it"
    echo "   • Password: demo123"
    echo ""
    echo "🔗 Link utili:"
    echo "• Frontend: http://localhost:3000"
    echo "• API Backend: http://localhost:3001"
    echo "• Documentazione API: http://localhost:3001/api/docs"
    echo "• Database Studio: npx prisma studio (dalla cartella backend)"
    echo "• MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)"
    echo ""
    echo "📚 Documentazione completa nel README.md"
    echo ""
}

# Gestione errori
handle_error() {
    print_error "Setup fallito. Controlla i log sopra per dettagli."
    echo ""
    echo "🔧 Risoluzione problemi comuni:"
    echo "• Verifica che Docker sia in esecuzione"
    echo "• Controlla che le porte 3000, 3001, 5432, 6379, 9000, 9001 siano libere"
    echo "• Verifica le credenziali del database nel file .env"
    echo ""
    exit 1
}

# Trap per gestire errori
trap 'handle_error' ERR

# Esecuzione setup
main() {
    echo ""
    check_prerequisites
    echo ""
    install_dependencies
    echo ""
    setup_environment
    echo ""
    start_docker_services
    echo ""
    setup_database
    echo ""
    verify_installation
    echo ""
    show_final_info
}

# Esegui setup
main "$@" 