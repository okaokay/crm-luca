# 🏢 CRM Immobiliare

Un sistema CRM completo e moderno per agenzie immobiliari, ispirato a Gestim ma completamente originale. Sviluppato con tecnologie all'avanguardia per offrire una soluzione scalabile, sicura e conforme al GDPR.

## 🚀 Caratteristiche Principali

### 📊 Dashboard & Analytics
- Dashboard interattiva con KPI in tempo reale
- Grafici e statistiche avanzate
- Report personalizzabili
- Monitoraggio performance agenti

### 🏠 Gestione Immobili
- CRUD completo per immobili
- Upload multiplo immagini
- Geolocalizzazione con mappe interattive
- Gestione planimetrie e virtual tour
- Sistema di categorizzazione avanzato

### 👥 Gestione Contatti
- Anagrafica clienti completa
- Segmentazione automatica
- Storico interazioni
- Gestione consensi GDPR
- Tag personalizzabili

### 🔍 Sistema di Matching
- Algoritmo intelligente domanda/offerta
- Matching automatico immobili-richieste
- Notifiche in tempo reale
- Scoring di compatibilità

### 📅 Agenda & Appuntamenti
- Calendario integrato
- Sincronizzazione Google Calendar
- Promemoria automatici
- Gestione disponibilità agenti

### 📧 Marketing & Comunicazioni
- Campagne email automatizzate
- SMS e WhatsApp marketing
- Template personalizzabili
- Tracking aperture e click

### 🌐 Pubblicazione Portali
- Integrazione con portali immobiliari italiani
- Pubblicazione automatica annunci
- Sincronizzazione dati
- Gestione feed XML

### 🔐 Sicurezza & Compliance
- Autenticazione JWT
- Controllo accessi basato su ruoli
- Audit log completo
- Conformità GDPR
- Backup automatici

## 🛠️ Stack Tecnologico

### Backend
- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Cache**: Redis
- **Queue**: BullMQ
- **Storage**: MinIO (S3-compatible)
- **Auth**: JWT + Passport

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod
- **HTTP Client**: Axios + React Query
- **Maps**: Leaflet
- **Charts**: Recharts

### Mobile
- **Framework**: React Native (Expo)
- **Navigation**: React Navigation
- **State**: Zustand (shared)

### DevOps
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Winston + ELK Stack

## 📁 Struttura del Progetto

```
immobiliare-crm/
├── packages/
│   ├── backend/           # API NestJS
│   │   ├── src/
│   │   │   ├── modules/   # Moduli business
│   │   │   ├── database/  # Configurazione DB
│   │   │   ├── config/    # Configurazioni
│   │   │   └── common/    # Utilities condivise
│   │   ├── prisma/        # Schema e migrazioni
│   │   └── test/          # Test suite
│   ├── frontend/          # App React
│   │   ├── src/
│   │   │   ├── components/# Componenti UI
│   │   │   ├── pages/     # Pagine applicazione
│   │   │   ├── store/     # State management
│   │   │   ├── services/  # API services
│   │   │   └── utils/     # Utilities
│   │   └── public/        # Asset statici
│   └── mobile/            # App React Native
│       ├── src/
│       └── app.json
├── scripts/               # Script di utilità
├── docs/                  # Documentazione
├── docker-compose.yml     # Setup sviluppo
└── README.md
```

## 🚀 Quick Start

### Prerequisiti
- Node.js 18+
- Docker & Docker Compose
- Git

### 1. Clone del Repository
```bash
git clone https://github.com/your-org/immobiliare-crm.git
cd immobiliare-crm
```

### 2. Installazione Dipendenze
```bash
npm install
```

### 3. Setup Ambiente di Sviluppo
```bash
# Copia file di configurazione
cp packages/backend/.env.example packages/backend/.env

# Prepara DB/Redis/MinIO per sviluppo locale (backend/frontend locali)
npm run dev:local:ready
```

### 4. Avvio Applicazione
```bash
# Modalità A - LOCAL (backend + frontend locali)
npm run dev
# oppure
npm run dev:local

# Modalità B - FULL DOCKER (tutto in container)
npm run dev:docker

# Solo backend
npm run dev:backend

# Solo frontend
npm run dev:frontend

# App mobile
npm run dev:mobile
```

### 5. Accesso all'Applicazione
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Documentazione API**: http://localhost:3001/api/docs
- **Database Studio**: http://localhost:5555

## Modalità di esecuzione (Dual Mode)

### 1) Local mode (sviluppo rapido, comando principale `npm run dev`)
- Backend e frontend girano in locale.
- PostgreSQL/Redis/MinIO possono essere locali nativi oppure avviati con Docker.
- Setup consigliato:
```bash
npm run dev:local:ready
npm run dev
```

Comandi utili:
```bash
npm run dev:local:infra:up
npm run dev:local:infra:down
npm run dev:local:infra:logs
```

### 2) Full Docker mode
- Tutto gira in container (frontend, backend, postgres, redis, minio).
```bash
npm run dev:docker
```

Log e stop:
```bash
npm run dev:docker:logs
npm run dev:docker:down
```

### 3) Vercel mode (frontend + backend separati, stesso repo)
- Deploy backend con root `packages/backend`.
- Deploy frontend con root `packages/frontend`.
- Guida completa: [docs/dual-runtime-docker-vercel.md](docs/dual-runtime-docker-vercel.md)

## 📚 Documentazione API


La documentazione completa delle API è disponibile tramite Swagger UI all'indirizzo:
http://localhost:3001/api/docs

### Endpoints Principali

#### Autenticazione
- `POST /api/auth/login` - Login utente
- `POST /api/auth/register` - Registrazione
- `POST /api/auth/refresh` - Refresh token

#### Immobili
- `GET /api/properties` - Lista immobili
- `POST /api/properties` - Crea immobile
- `GET /api/properties/:id` - Dettaglio immobile
- `PUT /api/properties/:id` - Aggiorna immobile
- `DELETE /api/properties/:id` - Elimina immobile

#### Contatti
- `GET /api/contacts` - Lista contatti
- `POST /api/contacts` - Crea contatto
- `GET /api/contacts/:id` - Dettaglio contatto
- `PUT /api/contacts/:id` - Aggiorna contatto

#### Matching
- `GET /api/matching/properties/:requestId` - Trova immobili compatibili
- `GET /api/matching/requests/:propertyId` - Trova richieste compatibili

## 🧪 Testing

### Backend
```bash
# Unit tests
npm run test:backend

# E2E tests
npm run test:backend:e2e

# Coverage
npm run test:backend:cov
```

### Frontend
```bash
# Unit tests
npm run test:frontend

# Coverage
npm run test:frontend:cov
```

## 🚀 Deployment

### Sviluppo
```bash
# Build applicazioni
npm run build

# Deploy con Docker
docker-compose -f docker-compose.prod.yml up -d
```

### Produzione
1. Configura variabili d'ambiente
2. Setup database PostgreSQL
3. Configura Redis
4. Setup storage S3/MinIO
5. Deploy con Docker Swarm o Kubernetes

### Variabili d'Ambiente

#### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/immobiliare_crm

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO/S3
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Portali Immobiliari
IMMOBILIARE_API_KEY=your-api-key
IDEALISTA_API_KEY=your-api-key
WIKICASA_API_KEY=your-api-key
```

## 🔧 Configurazione

### Database
Il sistema utilizza PostgreSQL con Prisma ORM. Lo schema è definito in `packages/backend/prisma/schema.prisma`.

### Cache & Queue
Redis viene utilizzato per:
- Cache delle query frequenti
- Sessioni utente
- Code per job asincroni (invio email, pubblicazione portali)

### Storage File
MinIO (compatibile S3) per:
- Immagini immobili
- Documenti
- Avatar utenti
- Backup

## 📱 App Mobile

L'app mobile React Native offre funzionalità essenziali:
- Login e autenticazione
- Visualizzazione agenda
- Lista immobili
- Dettagli contatti
- Notifiche push

```bash
# Sviluppo
cd packages/mobile
npm run start

# Build Android
npm run build:android

# Build iOS
npm run build:ios
```

## 🤝 Contribuire

1. Fork del repository
2. Crea branch feature (`git checkout -b feature/amazing-feature`)
3. Commit modifiche (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Apri Pull Request

### Linee Guida
- Segui le convenzioni di codice esistenti
- Scrivi test per le nuove funzionalità
- Aggiorna la documentazione
- Usa commit semantici

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🆘 Supporto

- **Documentazione**: [Wiki del progetto](https://github.com/your-org/immobiliare-crm/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/immobiliare-crm/issues)
- **Discussioni**: [GitHub Discussions](https://github.com/your-org/immobiliare-crm/discussions)

## 🗺️ Roadmap

### v1.0 (MVP) ✅
- [x] Autenticazione e autorizzazione
- [x] CRUD immobili e contatti
- [x] Dashboard base
- [x] Sistema matching
- [x] App mobile base

### v1.1 (Q2 2024)
- [ ] Integrazione portali immobiliari
- [ ] Campagne marketing avanzate
- [ ] Reportistica avanzata
- [ ] API pubbliche

### v1.2 (Q3 2024)
- [ ] AI per valutazione immobili
- [ ] Chatbot integrato
- [ ] App mobile completa
- [ ] Integrazione CRM esterni

### v2.0 (Q4 2024)
- [ ] Multi-tenancy
- [ ] Marketplace immobiliare
- [ ] Blockchain per contratti
- [ ] VR/AR per visite virtuali

## 👥 Team

- **Lead Developer**: [Nome] - Architettura e Backend
- **Frontend Developer**: [Nome] - UI/UX e React
- **Mobile Developer**: [Nome] - React Native
- **DevOps Engineer**: [Nome] - Infrastruttura e Deploy

## 📊 Metriche

- **Copertura Test**: 95%+
- **Performance**: < 2s caricamento pagine
- **Uptime**: 99.9%
- **Sicurezza**: OWASP Top 10 compliant

---

**Made with ❤️ for Real Estate Agencies** 

