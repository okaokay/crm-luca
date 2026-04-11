import React, { useState, useEffect } from 'react'
import { ContractModal } from './components/ContractModal'

// CSS per animazioni
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`

// Inietta CSS nel head
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = spinKeyframes
  document.head.appendChild(style)
}
import { 
  Home, 
  Building, 
  Users, 
  Calendar, 
  CheckSquare, 
  BarChart3, 
  Settings, 
  LogOut,
  Target,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Clock,
  AlertCircle,
  TrendingUp,
  PieChart,
  FileText
} from 'lucide-react'

// Importa il componente calendario
// import { AppointmentCalendar } from './components/AppointmentCalendar'

// Tipi TypeScript
interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  agency: {
    id: string
    name: string
  }
}

interface Property {
  id: string
  title: string
  description: string
  type: string
  contractType: string
  status: string
  address: string
  city: string
  province: string
  rooms: number
  bedrooms: number
  bathrooms: number
  surface: number
  salePrice?: number
  rentPrice?: number
  energyClass: string
  images: string[]
  reference: string
  notes: string
  createdAt: string
  // Campi aggiuntivi per pagina pubblica dettagliata
  floor?: number
  totalFloors?: number
  elevator?: boolean
  furnished?: boolean
  terrace?: number
  balcony?: number
  garden?: number
  garage?: boolean
  parkingSpaces?: number
  cellar?: boolean
  attic?: boolean
  condition?: string
  heating?: string
  airConditioning?: boolean
  alarm?: boolean
  internetFiber?: boolean
  petsAllowed?: boolean
  smokingAllowed?: boolean
  orientation?: string
  view?: string
  buildingYear?: number
  lastRenovation?: number
  condominium?: number
  propertyTax?: number
  cadastralCategory?: string
  cadastralClass?: string
  cadastralIncome?: number
  // Coordinate per mappa
  latitude?: number
  longitude?: number
  // Informazioni agente
  agentId?: string
  agentName?: string
  agentPhone?: string
  agentEmail?: string
}

interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  type: 'BUYER' | 'SELLER' | 'LANDLORD' | 'TENANT'
  category: 'CLIENT' | 'PROPRIETOR' // Nuova categorizzazione
  city: string
  address?: string
  budget?: number
  preferences?: string
  assignedAgent?: string
  source?: string
  notes: string
  tags: string[]
  isActive: boolean
  createdAt: string
}

interface Appointment {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  location: string
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  contactId: string
  propertyId?: string
  contactName?: string
  propertyTitle?: string
  notes?: string
  createdAt: string
}

interface Activity {
  id: string
  type: 'CALL' | 'EMAIL' | 'VIEWING' | 'MEETING' | 'FOLLOW_UP'
  title: string
  description: string
  completed: boolean
  completedAt?: string
  dueDate: string
  priority: number
  contactId: string
  propertyId?: string
  contactName?: string
  propertyTitle?: string
  createdAt: string
}

interface Agent {
  id: string
  name: string
  email: string
  phone: string
  role: 'AGENT' | 'SENIOR_AGENT' | 'TEAM_LEADER' | 'MANAGER'
  isActive: boolean
  commission: number
  specialization: string
  notes: string
  createdAt: string
}

interface Notification {
  id: string
  type: 'NEW_EVENT' | 'EVENT_UPDATE' | 'EVENT_CANCELLED' | 'EVENT_REMINDER'
  title: string
  message: string
  data: {
    eventId?: string
    eventTitle?: string
    assignedBy?: string
    updatedBy?: string
    deletedBy?: string
  }
  recipientId: string
  isRead: boolean
  createdAt: string
}

interface DashboardStats {
  totalProperties: number
  availableProperties: number
  reservedProperties: number
  soldProperties: number
  totalContacts: number
  activeContacts: number
  buyers: number
  sellers: number
  totalAppointments: number
  scheduledAppointments: number
  totalActivities: number
  pendingActivities: number
  completedActivities: number
  averagePropertyPrice: number
}

interface ContractTemplate {
  id: string
  name: string
  type: string
  description: string
  fields: string[]
  template: string
  createdAt: string
}

interface Contract {
  id: string
  templateId: string
  templateName: string
  propertyId?: string
  propertyTitle?: string
  contactId?: string
  contactName?: string
  agentId: string
  agentName: string
  status: 'DRAFT' | 'COMPLETED' | 'SIGNED' | 'ACTIVE' | 'EXPIRED'
  data: Record<string, string>
  generatedText?: string | null
  createdAt: string
  updatedAt: string
}

// App principale con routing
function App() {
  const [currentPage, setCurrentPage] = useState('login')
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null)
  
  // Gestione routing per pagine pubbliche
  useEffect(() => {
    const path = window.location.pathname
    
    if (path.startsWith('/public/property/')) {
      const propertyId = path.split('/').pop()
      if (propertyId) {
        setCurrentPropertyId(propertyId)
        setCurrentPage('public-property')
        return
      }
    }
    
    // Routing normale per CRM
    if (path === '/' || path === '/login') {
      setCurrentPage('login')
    } else if (path === '/dashboard') {
      setCurrentPage('dashboard')
    }
  }, [])
  
  // Gestione cambio URL per pagine pubbliche
  const navigateToPublicProperty = (propertyId: string) => {
    const publicUrl = `/public/property/${propertyId}`
    window.history.pushState({}, '', publicUrl)
    setCurrentPropertyId(propertyId)
    setCurrentPage('public-property')
  }
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<'SUPER_ADMIN' | 'AGENT' | null>(null)
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Dati dell'app
  const [properties, setProperties] = useState<Property[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [agents, setAgents] = useState<Agent[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractTemplates, setContractTemplates] = useState<ContractTemplate[]>([])

  // Fetch dati
  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [propertiesRes, contactsRes, appointmentsRes, activitiesRes, statsRes, agentsRes, contractsRes, templatesRes] = await Promise.all([
        fetch('/api/properties'),
        fetch('/api/contacts'),
        fetch('/api/appointments'),
        fetch('/api/activities'),
        fetch('/api/dashboard/stats'),
        fetch('/api/agents'),
        fetch('/api/contracts'),
        fetch('/api/contract-templates')
      ])
      
      const propertiesData = await propertiesRes.json()
      const contactsData = await contactsRes.json()
      const appointmentsData = await appointmentsRes.json()
      const activitiesData = await activitiesRes.json()
      const statsData = await statsRes.json()
      const agentsData = await agentsRes.json()
      const contractsData = await contractsRes.json()
      const templatesData = await templatesRes.json()
      
      if (propertiesData.success) {
        let properties = propertiesData.data || []
        
        // Filtra immobili per agenti normali
        if (userRole === 'AGENT' && user?.id) {
          properties = properties.filter((p: Property) => p.agentId === user.id)
        }
        
        setProperties(properties)
      }
      if (contactsData.success) setContacts(contactsData.data || [])
      
      // Filtra appuntamenti per agenti normali
      if (appointmentsData.success) {
        let appointments = appointmentsData.data || []
        if (userRole === 'AGENT' && user?.id) {
          appointments = appointments.filter((a: any) => 
            a.assignedAgents && a.assignedAgents.includes(user.id)
          )
        }
        setAppointments(appointments)
      }
      
      if (activitiesData.success) setActivities(activitiesData.data || [])
      if (statsData.success) setStats(statsData.data)
      if (agentsData.success) setAgents(agentsData.data || [])
      if (contractsData.success) setContracts(contractsData.data || [])
      if (templatesData.success) setContractTemplates(templatesData.data || [])

      // Fetch notifiche per l'utente corrente
      if (user?.id) {
        try {
          const notificationsResponse = await fetch(`/api/notifications?agentId=${user.id}`)
          const notificationsData = await notificationsResponse.json()
          if (notificationsData.success) {
            setNotifications(notificationsData.data)
          }

          // Fetch conteggio notifiche non lette
          const unreadResponse = await fetch(`/api/notifications/unread-count/${user.id}`)
          const unreadData = await unreadResponse.json()
          if (unreadData.success) {
            setUnreadNotifications(unreadData.count)
          }
        } catch (notificationError) {
          console.error('Errore nel caricamento notifiche:', notificationError)
        }
      }
    } catch (error) {
      console.error('Errore nel caricamento dati:', error)
    } finally {
      setDataLoading(false)
    }
  }

  // Gestione appuntamenti
  const handleCreateAppointment = async (appointmentData: Omit<Appointment, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentData)
      })
      
      const data = await response.json()
      if (data.success) {
        setAppointments([...appointments, data.data])
      }
    } catch (error) {
      console.error('Errore creazione appuntamento:', error)
    }
  }

  const handleUpdateAppointment = async (id: string, appointmentData: Partial<Appointment>) => {
    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentData)
      })
      
      const data = await response.json()
      if (data.success) {
        setAppointments(appointments.map(apt => apt.id === id ? { ...apt, ...appointmentData } : apt))
      }
    } catch (error) {
      console.error('Errore aggiornamento appuntamento:', error)
    }
  }

  const handleDeleteAppointment = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        setAppointments(appointments.filter(apt => apt.id !== id))
      }
    } catch (error) {
      console.error('Errore eliminazione appuntamento:', error)
    }
  }

  // Gestione contatti/clienti
  const handleCreateContact = async (contactData: Omit<Contact, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      })
      
      const data = await response.json()
      if (data.success) {
        await fetchData()
      }
    } catch (error) {
      console.error('Errore nella creazione contatto:', error)
    }
  }

  const handleUpdateContact = async (id: string, contactData: Partial<Contact>) => {
    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      })
      
      const data = await response.json()
      if (data.success) {
        await fetchData()
      }
    } catch (error) {
      console.error('Errore nell\'aggiornamento contatto:', error)
    }
  }

  // Gestione attività
  const handleCompleteActivity = async (id: string) => {
    try {
      const response = await fetch(`/api/activities/${id}/complete`, { method: 'PUT' })
      const data = await response.json()
      if (data.success) {
        setActivities(activities.map(act => 
          act.id === id ? { ...act, completed: true, completedAt: new Date().toISOString() } : act
        ))
      }
    } catch (error) {
      console.error('Errore completamento attività:', error)
    }
  }

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })
      
      const data = await response.json()
      
      if (data.success && data.data.user) {
        setUser(data.data.user)
        setUserRole(data.data.user.role)
        setCurrentPage('dashboard')
        await fetchData()
      } else {
        setLoginError(data.message || 'Errore di login')
      }
    } catch (error) {
      console.error('Errore login:', error)
      setLoginError('Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  // Logout
  const handleLogout = () => {
    setUser(null)
    setCurrentPage('login')
    setProperties([])
    setContacts([])
    setAppointments([])
    setActivities([])
    setStats(null)
  }

  // Pagina Login
  if (currentPage === 'login') {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{ 
          backgroundColor: 'white', 
          padding: '2rem', 
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ color: '#2563eb', fontSize: '1.5rem', fontWeight: 'bold' }}>
              🏢 CRM Immobiliare
            </h1>
            <p style={{ color: '#6b7280' }}>Accedi al tuo gestionale</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                defaultValue="demo@crm.it"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Password
              </label>
              <input
                name="password"
                type="password"
                defaultValue="password123"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem'
                }}
              />
            </div>

            {loginError && (
              <div style={{ 
                color: '#ef4444', 
                backgroundColor: '#fef2f2', 
                padding: '0.75rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>

          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            backgroundColor: '#f8fafc',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <strong>Credenziali demo:</strong><br />
            Email: demo@crm.it<br />
            Password: password123
          </div>
        </div>
      </div>
    )
  }

  // Layout principale - filtra navigazione in base al ruolo
  const allNavigation = [
    { name: 'Dashboard', page: 'dashboard', icon: Home },
    { name: 'Immobili', page: 'immobili', icon: Building },
    { name: 'Clienti', page: 'contatti', icon: Users },
    { name: 'Incrocio', page: 'incrocio', icon: Target },
    { name: 'Agenti', page: 'agenti', icon: Users, adminOnly: true },
    { name: 'Appuntamenti', page: 'appuntamenti', icon: Calendar },
    { name: 'Contratti', page: 'contratti', icon: FileText },
    { name: 'Attività', page: 'attivita', icon: CheckSquare },
    { name: 'Report', page: 'report', icon: BarChart3 },
    { name: 'Impostazioni', page: 'impostazioni', icon: Settings },
  ]
  
  const navigation = allNavigation.filter(item => 
    !item.adminOnly || userRole === 'SUPER_ADMIN'
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{ 
        width: '250px', 
        backgroundColor: '#1f2937', 
        color: 'white',
        padding: '1rem'
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
            🏢 CRM Immobiliare
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            {user?.agency.name}
          </p>
        </div>

        {/* Centro Notifiche */}
        {unreadNotifications > 0 && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🔔</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#92400e' }}>
                  {unreadNotifications} nuove notifiche
                </span>
              </div>
              <button
                onClick={() => setCurrentPage('notifiche')}
                style={{
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Vedi
              </button>
            </div>
          </div>
        )}

        <nav>
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.page
            return (
              <button
                key={item.name}
                onClick={() => setCurrentPage(item.page)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '0.75rem',
                  marginBottom: '0.25rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: isActive ? '#2563eb' : 'white',
                  backgroundColor: isActive ? '#374151' : 'transparent'
                }}
              >
                <Icon size={20} style={{ marginRight: '0.75rem' }} />
                {item.name}
              </button>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
          <div style={{ 
            padding: '0.75rem', 
            backgroundColor: '#374151', 
            borderRadius: '0.375rem',
            marginBottom: '1rem'
          }}>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            <LogOut size={20} style={{ marginRight: '0.75rem' }} />
            Esci
          </button>
        </div>
      </div>

      {/* Contenuto principale */}
      <div style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <main style={{ padding: '2rem' }}>
          {currentPage === 'dashboard' && <DashboardPage stats={stats} dataLoading={dataLoading} />}
          {currentPage === 'immobili' && <PropertiesPage 
            properties={properties} 
            dataLoading={dataLoading} 
            onRefreshData={fetchData}
            onViewProperty={(propertyId) => {
              setCurrentPropertyId(propertyId)
              setCurrentPage('property-detail')
            }}
          />}
          {currentPage === 'property-detail' && currentPropertyId && (
            <PropertyDetailPage 
              propertyId={currentPropertyId}
              onBack={() => {
                setCurrentPage('immobili')
                setCurrentPropertyId(null)
              }}
              onRefreshData={fetchData}
              navigateToPublicProperty={navigateToPublicProperty}
            />
          )}
          {currentPage === 'public-property' && currentPropertyId && (
            <PublicPropertyPage 
              propertyId={currentPropertyId}
              onBack={() => {
                setCurrentPage('immobili')
                setCurrentPropertyId(null)
              }}
            />
          )}
          {currentPage === 'contatti' && (
            <ClientsPage 
              contacts={contacts}
              properties={properties}
              dataLoading={dataLoading}
              onCreateContact={handleCreateContact}
              onUpdateContact={handleUpdateContact}
            />
          )}
          {currentPage === 'incrocio' && (
            <IncrocioPage 
              properties={properties}
              contacts={contacts}
              dataLoading={dataLoading}
              onNavigateToProperty={(propertyId) => {
                setCurrentPropertyId(propertyId)
                setCurrentPage('property-detail')
              }}
              onCreateContact={handleCreateContact}
            />
          )}
          {currentPage === 'agenti' && (
            <AgentsPage 
              agents={agents}
              dataLoading={dataLoading}
              onRefreshData={fetchData}
            />
          )}
          {currentPage === 'appuntamenti' && (
            <AppointmentsPage 
              appointments={appointments}
              dataLoading={dataLoading}
              onCreateAppointment={handleCreateAppointment}
              onUpdateAppointment={handleUpdateAppointment}
              onDeleteAppointment={handleDeleteAppointment}
              agents={agents}
            />
          )}
          {currentPage === 'contratti' && (
            <ContractsPage 
              contracts={contracts}
              contractTemplates={contractTemplates}
              properties={properties}
              contacts={contacts}
              agents={agents}
              dataLoading={dataLoading}
              onRefreshData={fetchData}
            />
          )}
          {currentPage === 'attivita' && (
            <ActivitiesPage 
              activities={activities}
              dataLoading={dataLoading}
              onCompleteActivity={handleCompleteActivity}
            />
          )}
          {currentPage === 'report' && <ReportPage stats={stats} properties={properties} contacts={contacts} />}
          {currentPage === 'notifiche' && (
            <NotificationsPage 
              notifications={notifications}
              onMarkAsRead={async (notificationId) => {
                try {
                  await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' })
                  // Aggiorna stato locale
                  setNotifications(notifications.map(n => 
                    n.id === notificationId ? { ...n, isRead: true } : n
                  ))
                  setUnreadNotifications(prev => Math.max(0, prev - 1))
                } catch (error) {
                  console.error('Errore aggiornamento notifica:', error)
                }
              }}
              onMarkAllAsRead={async () => {
                try {
                  await fetch(`/api/notifications/read-all/${user?.id}`, { method: 'PUT' })
                  // Aggiorna stato locale
                  setNotifications(notifications.map(n => ({ ...n, isRead: true })))
                  setUnreadNotifications(0)
                } catch (error) {
                  console.error('Errore aggiornamento notifiche:', error)
                }
              }}
              onDeleteNotification={async (notificationId) => {
                try {
                  await fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })
                  // Rimuovi dallo stato locale
                  const deletedNotification = notifications.find(n => n.id === notificationId)
                  setNotifications(notifications.filter(n => n.id !== notificationId))
                  if (deletedNotification && !deletedNotification.isRead) {
                    setUnreadNotifications(prev => Math.max(0, prev - 1))
                  }
                } catch (error) {
                  console.error('Errore eliminazione notifica:', error)
                }
              }}
            />
          )}
          {currentPage === 'impostazioni' && <PlaceholderPage title="⚙️ Impostazioni" icon={Settings} />}
        </main>
      </div>
    </div>
  )
}

// Dashboard
function DashboardPage({ stats, dataLoading }: { stats: DashboardStats | null, dataLoading: boolean }) {
  if (dataLoading) {
    return <div>Caricamento statistiche...</div>
  }

  if (!stats) {
    return <div>Errore nel caricamento delle statistiche</div>
  }

  const statCards = [
    { title: 'Immobili Totali', value: stats.totalProperties, color: '#3b82f6', icon: Building },
    { title: 'Immobili Disponibili', value: stats.availableProperties, color: '#10b981', icon: Building },
    { title: 'Contatti Totali', value: stats.totalContacts, color: '#8b5cf6', icon: Users },
    { title: 'Contatti Attivi', value: stats.activeContacts, color: '#06b6d4', icon: Users },
    { title: 'Appuntamenti', value: stats.totalAppointments, color: '#f59e0b', icon: Calendar },
    { title: 'Attività Pendenti', value: stats.pendingActivities, color: '#ef4444', icon: CheckSquare },
  ]

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          📊 Dashboard
        </h1>
        <p style={{ color: '#6b7280' }}>
          Panoramica delle attività del tuo CRM
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.title}
              style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: `2px solid ${card.color}20`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ 
                  backgroundColor: `${card.color}20`, 
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  marginRight: '0.75rem'
                }}>
                  <Icon size={24} style={{ color: card.color }} />
                </div>
                <h3 style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
                  {card.title}
                </h3>
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
                {card.value.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>

      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          📈 Statistiche Aggiuntive
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Prezzo Medio Immobili</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
              €{stats.averagePropertyPrice.toLocaleString()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Immobili Prenotati</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>
              {stats.reservedProperties}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Immobili Venduti</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7c3aed' }}>
              {stats.soldProperties}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Appuntamenti Programmati</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {stats.scheduledAppointments}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Lista Immobili con CRUD completo
function PropertiesPage({ 
  properties, 
  dataLoading,
  onRefreshData,
  onViewProperty
}: { 
  properties: Property[]
  dataLoading: boolean
  onRefreshData: () => void
  onViewProperty: (propertyId: string) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [showViewModal, setShowViewModal] = useState<Property | null>(null)

  if (dataLoading) {
    return <div>Caricamento immobili...</div>
  }

  // Gestione CRUD immobili
  const handleCreateProperty = async (propertyData: Omit<Property, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyData)
      })
      
      const data = await response.json()
      if (data.success) {
        setShowCreateModal(false)
        onRefreshData() // Ricarica i dati
        alert('Immobile creato con successo!')
      } else {
        alert('Errore nella creazione: ' + data.message)
      }
    } catch (error) {
      console.error('Errore creazione immobile:', error)
      alert('Errore di connessione')
    }
  }

  const handleUpdateProperty = async (id: string, propertyData: Partial<Property>) => {
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyData)
      })
      
      const data = await response.json()
      if (data.success) {
        setEditingProperty(null)
        onRefreshData()
        alert('Immobile aggiornato con successo!')
      } else {
        alert('Errore nell\'aggiornamento: ' + data.message)
      }
    } catch (error) {
      console.error('Errore aggiornamento immobile:', error)
      alert('Errore di connessione')
    }
  }

  const handleDeleteProperty = async (id: string, title: string) => {
    if (!confirm(`Sei sicuro di voler eliminare l'immobile "${title}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        onRefreshData()
        alert('Immobile eliminato con successo!')
      } else {
        alert('Errore nell\'eliminazione: ' + data.message)
      }
    } catch (error) {
      console.error('Errore eliminazione immobile:', error)
      alert('Errore di connessione')
    }
  }

  const filteredProperties = properties.filter(property => {
    const matchesSearch = property.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         property.city.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = !filterType || property.type === filterType
    const matchesStatus = !filterStatus || property.status === filterStatus
    return matchesSearch && matchesType && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return '#10b981'
      case 'RESERVED': return '#f59e0b'
      case 'SOLD': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'Disponibile'
      case 'RESERVED': return 'Prenotato'
      case 'SOLD': return 'Venduto'
      default: return status
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            🏠 Immobili ({properties.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci il tuo portafoglio immobiliare
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={20} style={{ marginRight: '0.5rem' }} />
          Nuovo Immobile
        </button>
      </div>

      {/* Filtri */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              <Search size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Cerca
            </label>
            <input
              type="text"
              placeholder="Cerca per titolo o città..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              <Filter size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Tipologia
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            >
              <option value="">Tutte le tipologie</option>
              <option value="APARTMENT">Appartamento</option>
              <option value="VILLA">Villa</option>
              <option value="HOUSE">Casa</option>
              <option value="COMMERCIAL">Commerciale</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Stato
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            >
              <option value="">Tutti gli stati</option>
              <option value="AVAILABLE">Disponibile</option>
              <option value="RESERVED">Prenotato</option>
              <option value="SOLD">Venduto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista immobili */}
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {filteredProperties.map((property) => (
          <div
            key={property.id}
            style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginRight: '1rem' }}>
                    {property.title}
                  </h3>
                  <span
                    style={{
                      backgroundColor: `${getStatusColor(property.status)}20`,
                      color: getStatusColor(property.status),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}
                  >
                    {getStatusText(property.status)}
                  </span>
                </div>

                <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
                  {property.description}
                </p>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      <MapPin size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Indirizzo
                    </p>
                    <p style={{ fontWeight: '500' }}>{property.address}, {property.city}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Tipologia</p>
                    <p style={{ fontWeight: '500' }}>{property.type}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Locali</p>
                    <p style={{ fontWeight: '500' }}>{property.rooms}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Superficie</p>
                    <p style={{ fontWeight: '500' }}>{property.surface} mq</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Prezzo</p>
                    <p style={{ fontWeight: 'bold', color: '#059669', fontSize: '1.125rem' }}>
                      €{(property.salePrice || property.rentPrice || 0).toLocaleString()}
                      {property.rentPrice && '/mese'}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Classe Energetica</p>
                    <p style={{ fontWeight: '500' }}>{property.energyClass}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => onViewProperty(property.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Eye size={16} style={{ marginRight: '0.5rem' }} />
                    Visualizza
                  </button>
                  <button
                    onClick={() => setEditingProperty(property)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Edit size={16} style={{ marginRight: '0.5rem' }} />
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDeleteProperty(property.id, property.title)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Trash2 size={16} style={{ marginRight: '0.5rem' }} />
                    Elimina
                  </button>
                </div>
              </div>

              {property.images && property.images.length > 0 && (
                <div style={{ marginLeft: '1.5rem' }}>
                  <img
                    src={property.images[0]}
                    alt={property.title}
                    style={{
                      width: '200px',
                      height: '150px',
                      objectFit: 'cover',
                      borderRadius: '0.375rem'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredProperties.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <Building size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            Nessun immobile trovato
          </h3>
          <p style={{ color: '#6b7280' }}>
            Prova a modificare i filtri di ricerca
          </p>
        </div>
      )}

      {/* Modal Creazione/Modifica Immobile */}
      {(showCreateModal || editingProperty) && (
        <PropertyModal
          property={editingProperty}
          onSave={(propertyData) => {
            if (editingProperty) {
              handleUpdateProperty(editingProperty.id, propertyData)
            } else {
              handleCreateProperty(propertyData)
            }
          }}
          onCancel={() => {
            setShowCreateModal(false)
            setEditingProperty(null)
          }}
        />
      )}

      {/* Modal Visualizzazione Immobile */}
      {showViewModal && (
        <PropertyViewModal
          property={showViewModal}
          onClose={() => setShowViewModal(null)}
          onEdit={() => {
            setEditingProperty(showViewModal)
            setShowViewModal(null)
          }}
        />
      )}
    </div>
  )
}

// ===== PAGINA INCROCIO - MATCHING INTELLIGENTE =====
function IncrocioPage({ 
  properties, 
  contacts, 
  dataLoading,
  onNavigateToProperty,
  onCreateContact 
}: { 
  properties: Property[], 
  contacts: Contact[], 
  dataLoading: boolean,
  onNavigateToProperty: (propertyId: string) => void,
  onCreateContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => void
}) {
  const [selectedClient, setSelectedClient] = useState<Contact | null>(null)
  const [matchingResults, setMatchingResults] = useState<Array<{ property: Property, score: number, reasons: string[] }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<'client' | 'manual'>('manual')
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  
  // Criteri di ricerca manuale
  const [manualCriteria, setManualCriteria] = useState({
    saleType: '', // VENDITA o AFFITTO
    minPrice: '',
    maxPrice: '',
    city: '',
    address: '',
    propertyType: '',
    minRooms: '',
    maxRooms: '',
    minBathrooms: '',
    hasElevator: false,
    hasBalcony: false,
    hasTerrace: false,
    hasGarden: false,
    hasParking: false,
    energyClass: '',
    floor: '',
    notes: ''
  })

  // Filtro clienti (solo quelli che cercano casa)
  const buyerClients = contacts.filter(contact => 
    contact.category === 'CLIENT' && 
    (contact.type === 'BUYER' || contact.type === 'TENANT') &&
    contact.isActive
  ).filter(client => 
    !searchTerm || 
    client.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Algoritmo di matching per criteri manuali
  const calculateManualMatch = (property: Property, criteria: typeof manualCriteria): { score: number, reasons: string[] } => {
    let score = 0
    const reasons: string[] = []

    // 1. Match tipo di transazione (PESO: 30%)
    if (criteria.saleType && property.contractType) {
      if (property.contractType === criteria.saleType) {
        score += 30
        reasons.push(`✅ Tipo transazione: ${criteria.saleType}`)
      } else {
        reasons.push(`❌ Tipo transazione non compatibile: ${property.contractType} vs ${criteria.saleType}`)
        return { score: 0, reasons }
      }
    }

    // 2. Match prezzo (PESO: 25%)
    if (criteria.minPrice || criteria.maxPrice) {
      const minPrice = criteria.minPrice ? parseFloat(criteria.minPrice) : 0
      const maxPrice = criteria.maxPrice ? parseFloat(criteria.maxPrice) : Infinity
      
      // Usa salePrice per vendita, rentPrice per affitto
      const propertyPrice = property.contractType === 'VENDITA' ? property.salePrice : property.rentPrice
      
      if (propertyPrice && propertyPrice >= minPrice && propertyPrice <= maxPrice) {
        score += 25
        reasons.push(`💰 Prezzo nel range: €${propertyPrice.toLocaleString()} (€${minPrice.toLocaleString()} - €${maxPrice.toLocaleString()})`)
      } else if (propertyPrice) {
        if (propertyPrice < minPrice) {
          reasons.push(`❌ Prezzo troppo basso: €${propertyPrice.toLocaleString()} < €${minPrice.toLocaleString()}`)
        } else {
          reasons.push(`❌ Prezzo troppo alto: €${propertyPrice.toLocaleString()} > €${maxPrice.toLocaleString()}`)
        }
      }
    }

    // 3. Match località (PESO: 20%)
    let locationScore = 0
    if (criteria.city && property.city) {
      if (property.city.toLowerCase().includes(criteria.city.toLowerCase()) ||
          criteria.city.toLowerCase().includes(property.city.toLowerCase())) {
        locationScore += 15
        reasons.push(`📍 Città compatibile: ${property.city}`)
      }
    }
    
    if (criteria.address && property.address) {
      if (property.address.toLowerCase().includes(criteria.address.toLowerCase()) ||
          criteria.address.toLowerCase().includes(property.address.toLowerCase())) {
        locationScore += 5
        reasons.push(`🗺️ Indirizzo compatibile: ${property.address}`)
      }
    }
    
    score += locationScore

    // 4. Match tipologia immobile (PESO: 15%)
    if (criteria.propertyType && property.type) {
      if (property.type.toLowerCase().includes(criteria.propertyType.toLowerCase()) ||
          criteria.propertyType.toLowerCase().includes(property.type.toLowerCase())) {
        score += 15
        reasons.push(`🏠 Tipologia compatibile: ${property.type}`)
      }
    }

    // 5. Match caratteristiche specifiche (PESO: 10%)
    let featuresScore = 0
    
    // Camere
    if (criteria.minRooms || criteria.maxRooms) {
      const minRooms = criteria.minRooms ? parseInt(criteria.minRooms) : 0
      const maxRooms = criteria.maxRooms ? parseInt(criteria.maxRooms) : Infinity
      
      if (property.bedrooms && property.bedrooms >= minRooms && property.bedrooms <= maxRooms) {
        featuresScore += 3
        reasons.push(`🛏️ Camere nel range: ${property.bedrooms} (${minRooms}-${maxRooms})`)
      }
    }
    
    // Bagni
    if (criteria.minBathrooms && property.bathrooms) {
      const minBaths = parseInt(criteria.minBathrooms)
      if (property.bathrooms >= minBaths) {
        featuresScore += 2
        reasons.push(`🚿 Bagni sufficienti: ${property.bathrooms} (min ${minBaths})`)
      }
    }
    
    // Caratteristiche booleane
    if (criteria.hasElevator && property.elevator) {
      featuresScore += 1
      reasons.push(`🛗 Ascensore presente`)
    }
    
    if (criteria.hasBalcony && property.balcony) {
      featuresScore += 1
      reasons.push(`🌿 Balcone presente`)
    }
    
    if (criteria.hasTerrace && property.terrace) {
      featuresScore += 1
      reasons.push(`🌿 Terrazzo presente`)
    }
    
    if (criteria.hasGarden && property.garden) {
      featuresScore += 1
      reasons.push(`🌳 Giardino presente`)
    }
    
    if (criteria.hasParking && property.garage) {
      featuresScore += 1
      reasons.push(`🚗 Parcheggio presente`)
    }
    
    score += Math.min(10, featuresScore)

    // 6. Match classe energetica
    if (criteria.energyClass && property.energyClass) {
      if (property.energyClass === criteria.energyClass) {
        score += 5
        reasons.push(`⚡ Classe energetica: ${property.energyClass}`)
      }
    }

    // 7. Match piano
    if (criteria.floor && property.floor) {
      if (property.floor.toString() === criteria.floor) {
        score += 5
        reasons.push(`🏢 Piano: ${property.floor}`)
      }
    }

    return { score: Math.min(100, score), reasons }
  }

  // Algoritmo di matching intelligente per clienti
  const calculateMatch = (property: Property, client: Contact): { score: number, reasons: string[] } => {
    let score = 0
    const reasons: string[] = []

    // 1. Match tipo di transazione (PESO: 30%)
    if (
      (client.type === 'BUYER' && property.saleType === 'VENDITA') ||
      (client.type === 'TENANT' && property.saleType === 'AFFITTO')
    ) {
      score += 30
      reasons.push(`✅ Tipo transazione: ${client.type === 'BUYER' ? 'Acquisto' : 'Affitto'}`)
    } else {
      reasons.push(`❌ Tipo transazione non compatibile`)
      return { score: 0, reasons } // Se il tipo non match, score = 0
    }

    // 2. Match budget (PESO: 25%)
    if (client.budget && property.price) {
      const clientBudget = parseFloat(client.budget.toString())
      const propertyPrice = property.price
      
      if (propertyPrice <= clientBudget) {
        const budgetRatio = propertyPrice / clientBudget
        if (budgetRatio >= 0.8) {
          score += 25
          reasons.push(`💰 Prezzo perfetto: €${propertyPrice.toLocaleString()} (budget €${clientBudget.toLocaleString()})`)
        } else if (budgetRatio >= 0.6) {
          score += 20
          reasons.push(`💰 Prezzo buono: €${propertyPrice.toLocaleString()} (budget €${clientBudget.toLocaleString()})`)
        } else {
          score += 10
          reasons.push(`💰 Prezzo conveniente: €${propertyPrice.toLocaleString()} (budget €${clientBudget.toLocaleString()})`)
        }
      } else {
        const exceedRatio = propertyPrice / clientBudget
        if (exceedRatio <= 1.1) {
          score += 5
          reasons.push(`💰 Prezzo leggermente sopra budget: €${propertyPrice.toLocaleString()} vs €${clientBudget.toLocaleString()}`)
        } else {
          reasons.push(`❌ Prezzo troppo alto: €${propertyPrice.toLocaleString()} vs budget €${clientBudget.toLocaleString()}`)
        }
      }
    }

    // 3. Match località (PESO: 20%)
    if (client.city && property.city) {
      if (client.city.toLowerCase() === property.city.toLowerCase()) {
        score += 20
        reasons.push(`📍 Città perfetta: ${property.city}`)
      } else if (
        client.city.toLowerCase().includes(property.city.toLowerCase()) ||
        property.city.toLowerCase().includes(client.city.toLowerCase())
      ) {
        score += 10
        reasons.push(`📍 Zona compatibile: ${property.city} (ricerca: ${client.city})`)
      }
    }

    // 4. Match tipologia immobile (PESO: 15%)
    if (client.preferences) {
      const preferences = client.preferences.toLowerCase()
      const propertyType = property.propertyType?.toLowerCase() || ''
      
      if (preferences.includes(propertyType) || propertyType.includes('appartamento')) {
        score += 15
        reasons.push(`🏠 Tipologia compatibile: ${property.propertyType}`)
      } else if (preferences.includes('qualsiasi') || preferences.includes('indifferente')) {
        score += 10
        reasons.push(`🏠 Cliente flessibile su tipologia`)
      }
    }

    // 5. Match caratteristiche specifiche (PESO: 10%)
    if (client.preferences) {
      const preferences = client.preferences.toLowerCase()
      
      // Camere
      if (preferences.includes('camera') || preferences.includes('stanza')) {
        if (property.rooms && property.rooms >= 2) {
          score += 3
          reasons.push(`🛏️ Camere sufficienti: ${property.rooms}`)
        }
      }
      
      // Bagni
      if (preferences.includes('bagno')) {
        if (property.bathrooms && property.bathrooms >= 2) {
          score += 2
          reasons.push(`🚿 Bagni multipli: ${property.bathrooms}`)
        }
      }
      
      // Ascensore
      if (preferences.includes('ascensore')) {
        if (property.hasElevator) {
          score += 3
          reasons.push(`🛗 Ascensore presente`)
        }
      }
      
      // Balcone/Terrazzo
      if (preferences.includes('balcone') || preferences.includes('terrazzo')) {
        if (property.hasBalcony || property.hasTerrace) {
          score += 2
          reasons.push(`🌿 Spazio esterno disponibile`)
        }
      }
    }

    return { score: Math.min(100, score), reasons }
  }

  // Esegui ricerca matching
  const performMatching = () => {
    if (searchMode === 'client' && !selectedClient) return
    if (searchMode === 'manual' && !manualCriteria.saleType) {
      alert('Seleziona almeno il tipo di transazione (Vendita/Affitto)')
      return
    }

    setIsSearching(true)
    
    // Simula un po' di delay per l'effetto di ricerca
    setTimeout(() => {
      let results
      
      if (searchMode === 'client' && selectedClient) {
        // Matching basato su cliente
        results = properties
          .filter(property => property.status === 'AVAILABLE')
          .map(property => ({
            property,
            ...calculateMatch(property, selectedClient)
          }))
      } else {
        // Matching basato su criteri manuali
        results = properties
          .filter(property => property.status === 'AVAILABLE')
          .map(property => ({
            property,
            ...calculateManualMatch(property, manualCriteria)
          }))
      }
      
      // Ordina per punteggio (senza filtro minimo)
      results = results.sort((a, b) => b.score - a.score)

      setMatchingResults(results)
      setIsSearching(false)
    }, 1000)
  }

  // Reset quando cambia cliente
  useEffect(() => {
    if (selectedClient) {
      setMatchingResults([])
    }
  }, [selectedClient])

  // Funzione per gestire la creazione di un nuovo cliente
  const handleCreateNewClient = (clientData: Omit<Contact, 'id' | 'createdAt'>) => {
    onCreateContact(clientData)
    setShowNewClientModal(false)
    // Opzionalmente, aggiorna la lista locale per riflettere immediatamente il nuovo cliente
    // (questo dipende da come viene gestito il refresh dei dati nel componente principale)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981' // Verde
    if (score >= 60) return '#f59e0b' // Arancione  
    return '#ef4444' // Rosso
  }

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Perfetto'
    if (score >= 80) return 'Ottimo'
    if (score >= 70) return 'Buono'
    if (score >= 60) return 'Discreto'
    return 'Basso'
  }

  if (dataLoading) {
    return <div>Caricamento sistema di matching...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1f2937' }}>
          🎯 Incrocio Intelligente
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>
          Trova gli immobili perfetti per le richieste dei tuoi clienti
        </p>
      </div>

      {/* Toggle Modalità Ricerca */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        marginBottom: '2rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '1rem'
      }}>
        <button
          onClick={() => {
            setSearchMode('manual')
            setMatchingResults([])
          }}
          style={{
            padding: '0.75rem 2rem',
            border: 'none',
            backgroundColor: searchMode === 'manual' ? '#3b82f6' : 'transparent',
            color: searchMode === 'manual' ? 'white' : '#6b7280',
            borderRadius: '0.5rem 0 0 0.5rem',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem'
          }}
        >
          🔍 Ricerca Manuale
        </button>
        <button
          onClick={() => {
            setSearchMode('client')
            setMatchingResults([])
          }}
          style={{
            padding: '0.75rem 2rem',
            border: 'none',
            backgroundColor: searchMode === 'client' ? '#3b82f6' : 'transparent',
            color: searchMode === 'client' ? 'white' : '#6b7280',
            borderRadius: '0 0.5rem 0.5rem 0',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem'
          }}
        >
          👤 Da Cliente
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        
        {/* Pannello Ricerca */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          height: 'fit-content'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
            {searchMode === 'manual' ? '🔍 Criteri di Ricerca' : '👤 Seleziona Cliente'}
          </h3>
          
          {searchMode === 'manual' ? (
            /* Form Ricerca Manuale */
            <div>
              {/* Tipo Transazione */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  🏠 Tipo Transazione *
                </label>
                <select
                  value={manualCriteria.saleType}
                  onChange={(e) => setManualCriteria({...manualCriteria, saleType: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Seleziona...</option>
                  <option value="VENDITA">Vendita</option>
                  <option value="AFFITTO">Affitto</option>
                </select>
              </div>

              {/* Range Prezzo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    💰 Prezzo Min (€)
                  </label>
                  <input
                    type="number"
                    placeholder="50.000"
                    value={manualCriteria.minPrice}
                    onChange={(e) => setManualCriteria({...manualCriteria, minPrice: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    💰 Prezzo Max (€)
                  </label>
                  <input
                    type="number"
                    placeholder="300.000"
                    value={manualCriteria.maxPrice}
                    onChange={(e) => setManualCriteria({...manualCriteria, maxPrice: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>

              {/* Località */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  📍 Città/Zona
                </label>
                <input
                  type="text"
                  placeholder="Roma, Milano, Napoli..."
                  value={manualCriteria.city}
                  onChange={(e) => setManualCriteria({...manualCriteria, city: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Via/Indirizzo */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  🗺️ Via/Indirizzo
                </label>
                <input
                  type="text"
                  placeholder="Via Roma, Centro, Parioli..."
                  value={manualCriteria.address}
                  onChange={(e) => setManualCriteria({...manualCriteria, address: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Tipologia */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  🏠 Tipologia
                </label>
                <select
                  value={manualCriteria.propertyType}
                  onChange={(e) => setManualCriteria({...manualCriteria, propertyType: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Qualsiasi</option>
                  <option value="Appartamento">Appartamento</option>
                  <option value="Villa">Villa</option>
                  <option value="Villetta">Villetta</option>
                  <option value="Attico">Attico</option>
                  <option value="Loft">Loft</option>
                  <option value="Ufficio">Ufficio</option>
                  <option value="Negozio">Negozio</option>
                </select>
              </div>
            </div>
          ) : (
            /* Ricerca per Cliente */
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Cerca cliente per nome o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Lista clienti */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {buyerClients.map(client => (
              <div
                key={client.id}
                onClick={() => setSelectedClient(client)}
                style={{
                  padding: '1rem',
                  border: selectedClient?.id === client.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  backgroundColor: selectedClient?.id === client.id ? '#eff6ff' : 'white',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: '500', color: '#1f2937' }}>
                  {client.firstName} {client.lastName}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {client.type === 'BUYER' ? '🏠 Acquirente' : '🏠 Inquilino'} • {client.city || 'Città non specificata'}
                </div>
                {client.budget && (
                  <div style={{ fontSize: '0.875rem', color: '#059669', marginTop: '0.25rem' }}>
                    💰 Budget: €{parseFloat(client.budget.toString()).toLocaleString()}
                  </div>
                )}
                {client.preferences && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    📝 {client.preferences.substring(0, 50)}...
                  </div>
                )}
              </div>
            ))}
            
              {buyerClients.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                <p>Nessun cliente trovato</p>
                <p style={{ fontSize: '0.875rem' }}>Prova a modificare i filtri di ricerca</p>
              </div>
            )}
              
              {/* Pulsante Nuovo Cliente */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  onClick={() => setShowNewClientModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Plus size={16} />
                  Nuovo Cliente
                </button>
              </div>
              </div>
            </div>
          )}

          {/* Controlli matching */}
          {((searchMode === 'client' && selectedClient) || (searchMode === 'manual' && manualCriteria.saleType)) && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={performMatching}
                disabled={isSearching}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: isSearching ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                {isSearching ? '🔍 Ricerca in corso...' : 
                 searchMode === 'manual' ? '🎯 Cerca Immobili' : '🎯 Trova Match'}
              </button>
            </div>
          )}
        </div>

        {/* Pannello Risultati */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
            🏠 Immobili Compatibili
          </h3>

          {((searchMode === 'client' && !selectedClient) || (searchMode === 'manual' && !manualCriteria.saleType)) && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <Target size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                {searchMode === 'manual' ? 'Inserisci i criteri di ricerca' : 'Seleziona un cliente per iniziare'}
              </p>
              <p style={{ fontSize: '0.875rem' }}>
                {searchMode === 'manual' ? 
                  'Specifica almeno il tipo di transazione per iniziare la ricerca' : 
                  'Il sistema analizzerà automaticamente gli immobili compatibili'
                }
              </p>
            </div>
          )}

          {((searchMode === 'client' && selectedClient) || (searchMode === 'manual' && manualCriteria.saleType)) && 
           matchingResults.length === 0 && !isSearching && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>Nessun immobile trovato</p>
              <p style={{ fontSize: '0.875rem' }}>
                {searchMode === 'manual' ? 'Prova a modificare i criteri di ricerca' : 'Verifica i criteri del cliente'}
              </p>
            </div>
          )}

          {isSearching && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '3px solid #e5e7eb', 
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem'
              }}></div>
              <p>Analisi in corso...</p>
            </div>
          )}

          {/* Risultati matching */}
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {matchingResults.map((result, index) => (
              <div
                key={result.property.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  overflow: 'hidden'
                }}
              >
                {/* Header immobile con score */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
                      {result.property.title}
                    </h4>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                      {result.property.city} • {result.property.type} • €{(result.property.salePrice || result.property.rentPrice || 0).toLocaleString()}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold', 
                      color: getScoreColor(result.score),
                      marginBottom: '0.25rem'
                    }}>
                      {result.score}%
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: getScoreColor(result.score),
                      fontWeight: '500'
                    }}>
                      {getScoreLabel(result.score)}
                    </div>
                  </div>
                </div>

                {/* Dettagli matching */}
                <div style={{ padding: '1rem' }}>
                  <h5 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#374151' }}>
                    Analisi Compatibilità:
                  </h5>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.875rem' }}>
                    {result.reasons.map((reason, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem', color: '#4b5563' }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                  
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => onNavigateToProperty(result.property.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}
                    >
                      👁️ Visualizza Immobile
                    </button>
                    {searchMode === 'client' && selectedClient ? (
                      <button
                        onClick={() => {
                          alert(`Contatta ${selectedClient.firstName} ${selectedClient.lastName} per l'immobile "${result.property.title}"`)
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        📞 Contatta Cliente
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          alert(`Immobile interessante trovato: "${result.property.title}"\n\nPuoi contattare i tuoi clienti interessati a:\n- ${manualCriteria.saleType}\n- Budget: €${manualCriteria.minPrice || '0'} - €${manualCriteria.maxPrice || '∞'}\n- Zona: ${manualCriteria.city || 'Qualsiasi'}`)
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        📋 Salva Ricerca
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Creazione Nuovo Cliente */}
      {showNewClientModal && (
        <ContactModal
          contact={null}
          category="CLIENT"
          onSave={handleCreateNewClient}
          onCancel={() => setShowNewClientModal(false)}
        />
      )}
    </div>
  )
}

// ===== MODAL VISUALIZZAZIONE CLIENTE =====
function ClientViewModal({ 
  contact, 
  suggestedProperties, 
  onClose, 
  onEdit 
}: { 
  contact: Contact, 
  suggestedProperties: Property[], 
  onClose: () => void, 
  onEdit: () => void 
}) {
  const getTypeText = (type: string) => {
    switch (type) {
      case 'BUYER': return 'Acquirente'
      case 'SELLER': return 'Venditore'
      case 'TENANT': return 'Inquilino'
      case 'LANDLORD': return 'Proprietario'
      default: return type
    }
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '0.75rem', 
        width: '100%', 
        maxWidth: '800px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
            👤 {contact.firstName} {contact.lastName}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Informazioni Cliente */}
          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
              📋 Informazioni Cliente
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  <Mail size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                  Email
                </p>
                <p style={{ fontWeight: '500' }}>{contact.email}</p>
              </div>
              
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  <Phone size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                  Telefono
                </p>
                <p style={{ fontWeight: '500' }}>{contact.phone || 'N/A'}</p>
              </div>
              
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  🏠 Tipologia
                </p>
                <span style={{ 
                  backgroundColor: '#eff6ff', 
                  color: '#1d4ed8', 
                  padding: '0.25rem 0.75rem', 
                  borderRadius: '9999px', 
                  fontSize: '0.875rem', 
                  fontWeight: '500' 
                }}>
                  {getTypeText(contact.type)}
                </span>
              </div>
              
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  <MapPin size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                  Città
                </p>
                <p style={{ fontWeight: '500' }}>{contact.city || 'N/A'}</p>
              </div>
              
              {contact.budget && (
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    💰 Budget
                  </p>
                  <p style={{ fontWeight: '500', color: '#059669' }}>
                    €{parseFloat(contact.budget.toString()).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {contact.preferences && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  📝 Preferenze
                </p>
                <p style={{ backgroundColor: '#f9fafb', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                  {contact.preferences}
                </p>
              </div>
            )}

            {contact.tags && contact.tags.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Tag</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {contact.tags.map((tag, index) => (
                    <span
                      key={index}
                      style={{
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Immobili Suggeriti */}
          {(contact.type === 'BUYER' || contact.type === 'TENANT') && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
                🏠 Immobili Suggeriti ({suggestedProperties.length})
              </h4>
              
              {suggestedProperties.length > 0 ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {suggestedProperties.map(property => (
                    <div
                      key={property.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        backgroundColor: '#fafafa'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h5 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
                          {property.title}
                        </h5>
                        <span style={{ 
                          fontSize: '1rem', 
                          fontWeight: 'bold', 
                          color: '#059669' 
                        }}>
                          €{(property.salePrice || property.rentPrice || 0).toLocaleString()}
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        📍 {property.city} • 🏠 {property.type} • 🛏️ {property.bedrooms} camere • 🚿 {property.bathrooms} bagni
                      </p>
                      
                      {property.description && (
                        <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                          {property.description.substring(0, 100)}...
                        </p>
                      )}
                      
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => {
                            // Qui potresti aprire i dettagli dell'immobile
                            alert(`Visualizza dettagli: ${property.title}`)
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            cursor: 'pointer'
                          }}
                        >
                          👁️ Dettagli
                        </button>
                        <button
                          onClick={() => {
                            alert(`Proponi immobile "${property.title}" a ${contact.firstName} ${contact.lastName}`)
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            cursor: 'pointer'
                          }}
                        >
                          📧 Proponi
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem', 
                  color: '#6b7280',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem'
                }}>
                  <p>Nessun immobile compatibile trovato</p>
                  <p style={{ fontSize: '0.875rem' }}>
                    Prova ad aggiornare il budget o le preferenze del cliente
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Azioni */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            paddingTop: '1rem', 
            borderTop: '1px solid #e5e7eb',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={() => {
                if (contact.phone) {
                  window.location.href = `tel:${contact.phone}`
                } else {
                  alert('Nessun numero di telefono disponibile')
                }
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Phone size={16} />
              Chiama
            </button>
            <button
              onClick={onEdit}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Edit size={16} />
              Modifica
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== PAGINA CLIENTI COMPLETA =====
function ClientsPage({ 
  contacts, 
  properties,
  dataLoading, 
  onCreateContact, 
  onUpdateContact 
}: { 
  contacts: Contact[], 
  properties: Property[],
  dataLoading: boolean,
  onCreateContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => void,
  onUpdateContact: (id: string, contact: Partial<Contact>) => void
}) {
  const [activeTab, setActiveTab] = useState<'CLIENT' | 'PROPRIETOR'>('CLIENT')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [showViewModal, setShowViewModal] = useState<Contact | null>(null)
  const [suggestedProperties, setSuggestedProperties] = useState<Property[]>([])

  if (dataLoading) {
    return <div>Caricamento clienti...</div>
  }

  const filteredContacts = contacts.filter(contact => {
    const matchesCategory = contact.category === activeTab
    const matchesSearch = contact.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contact.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contact.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = !filterType || contact.type === filterType
    return matchesCategory && matchesSearch && matchesType
  })

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BUYER': return '#3b82f6'
      case 'SELLER': return '#10b981'
      case 'TENANT': return '#f59e0b'
      case 'LANDLORD': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  const getTypeText = (type: string) => {
    switch (type) {
      case 'BUYER': return 'Acquirente'
      case 'SELLER': return 'Venditore'
      case 'TENANT': return 'Inquilino'
      case 'LANDLORD': return 'Proprietario'
      default: return type
    }
  }

  const getCategoryLabel = (category: string) => {
    return category === 'CLIENT' ? 'Clienti' : 'Proprietari'
  }

  const handleCreateNew = () => {
    setEditingContact(null)
    setShowModal(true)
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
    setShowModal(true)
  }

  const handleSave = (contactData: Omit<Contact, 'id' | 'createdAt'>) => {
    if (editingContact) {
      onUpdateContact(editingContact.id, contactData)
    } else {
      onCreateContact({
        ...contactData,
        category: activeTab
      })
    }
    setShowModal(false)
    setEditingContact(null)
  }

  const handleCancel = () => {
    setShowModal(false)
    setEditingContact(null)
  }

  const handleView = (contact: Contact) => {
    // Trova immobili suggeriti per il cliente
    const suggestions = findSuggestedProperties(contact)
    setSuggestedProperties(suggestions)
    setShowViewModal(contact)
  }

  // Funzione per trovare immobili compatibili con il cliente
  const findSuggestedProperties = (client: Contact): Property[] => {
    // Solo per clienti che cercano casa (BUYER o TENANT)
    if (client.type !== 'BUYER' && client.type !== 'TENANT') {
      return []
    }

    return properties
      .filter(property => property.status === 'AVAILABLE')
      .filter(property => {
        // Match tipo transazione
        const contractMatch = 
          (client.type === 'BUYER' && property.contractType === 'VENDITA') ||
          (client.type === 'TENANT' && property.contractType === 'AFFITTO')
        
        if (!contractMatch) return false

        // Match budget se specificato
        if (client.budget) {
          const clientBudget = parseFloat(client.budget.toString())
          const propertyPrice = property.contractType === 'VENDITA' ? property.salePrice : property.rentPrice
          
          // Includi solo immobili entro il budget + 20% di tolleranza
          if (propertyPrice) {
            const maxAcceptablePrice = clientBudget * 1.2
            if (propertyPrice > maxAcceptablePrice) {
              return false // Escludi se troppo caro
            }
          }
        }

        // Match città se specificata
        if (client.city && property.city) {
          const cityMatch = property.city.toLowerCase().includes(client.city.toLowerCase()) ||
                           client.city.toLowerCase().includes(property.city.toLowerCase())
          if (!cityMatch) return false
        }

        return true
      })
      .sort((a, b) => {
        // Ordina per rilevanza (prezzo più vicino al budget)
        if (client.budget) {
          const clientBudget = parseFloat(client.budget.toString())
          const priceA = a.contractType === 'VENDITA' ? a.salePrice || 0 : a.rentPrice || 0
          const priceB = b.contractType === 'VENDITA' ? b.salePrice || 0 : b.rentPrice || 0
          
          const diffA = Math.abs(priceA - clientBudget)
          const diffB = Math.abs(priceB - clientBudget)
          
          return diffA - diffB
        }
        return 0
      })
      .slice(0, 5) // Massimo 5 suggerimenti
  }

  const handleCall = (contact: Contact) => {
    if (contact.phone) {
      // Prova ad aprire l'app telefono
      window.location.href = `tel:${contact.phone}`
    } else {
      alert(`Nessun numero di telefono disponibile per ${contact.firstName} ${contact.lastName}`)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            👥 {getCategoryLabel(activeTab)} ({filteredContacts.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci {activeTab === 'CLIENT' ? 'i tuoi clienti e prospect' : 'i proprietari degli immobili'}
          </p>
        </div>
        <button
          onClick={() => {
            // Apri modal per nuovo cliente
            setEditingContact(null)
            setShowModal(true)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={20} style={{ marginRight: '0.5rem' }} />
          Nuovo {activeTab === 'CLIENT' ? 'Cliente' : 'Proprietario'}
        </button>
      </div>

      {/* Tabs Clienti/Proprietari */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid #e5e7eb', 
        marginBottom: '2rem' 
      }}>
        <button
          onClick={() => setActiveTab('CLIENT')}
          style={{
            padding: '1rem 2rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'CLIENT' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'CLIENT' ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem'
          }}
        >
          👤 Clienti ({contacts.filter(c => c.category === 'CLIENT').length})
        </button>
        <button
          onClick={() => setActiveTab('PROPRIETOR')}
          style={{
            padding: '1rem 2rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'PROPRIETOR' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'PROPRIETOR' ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem'
          }}
        >
          🏠 Proprietari ({contacts.filter(c => c.category === 'PROPRIETOR').length})
        </button>
      </div>

      {/* Filtri */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              <Search size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Cerca
            </label>
            <input
              type="text"
              placeholder="Cerca per nome o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              <Filter size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Tipologia
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            >
              <option value="">Tutti i tipi</option>
              {activeTab === 'CLIENT' ? (
                <>
                  <option value="BUYER">Acquirenti</option>
                  <option value="TENANT">Inquilini</option>
                </>
              ) : (
                <>
                  <option value="SELLER">Venditori</option>
                  <option value="LANDLORD">Proprietari</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Lista contatti */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredContacts.map((contact) => (
          <div
            key={contact.id}
            style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginRight: '1rem' }}>
                    {contact.firstName} {contact.lastName}
                  </h3>
                  <span
                    style={{
                      backgroundColor: `${getTypeColor(contact.type)}20`,
                      color: getTypeColor(contact.type),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}
                  >
                    {getTypeText(contact.type)}
                  </span>
                  {!contact.isActive && (
                    <span
                      style={{
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        marginLeft: '0.5rem'
                      }}
                    >
                      Inattivo
                    </span>
                  )}
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      <Mail size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Email
                    </p>
                    <p style={{ fontWeight: '500' }}>{contact.email}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      <Phone size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Telefono
                    </p>
                    <p style={{ fontWeight: '500' }}>{contact.phone}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      <MapPin size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Città
                    </p>
                    <p style={{ fontWeight: '500' }}>{contact.city}</p>
                  </div>
                </div>

                {contact.notes && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Note</p>
                    <p style={{ color: '#4b5563' }}>{contact.notes}</p>
                  </div>
                )}

                {contact.tags && contact.tags.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Tag</p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {contact.tags.map((tag, index) => (
                        <span
                          key={index}
                          style={{
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem'
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleView(contact)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Eye size={16} style={{ marginRight: '0.5rem' }} />
                    Visualizza
                  </button>
                  <button
                    onClick={() => handleEdit(contact)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Edit size={16} style={{ marginRight: '0.5rem' }} />
                    Modifica
                  </button>
                  <button
                    onClick={() => handleCall(contact)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Phone size={16} style={{ marginRight: '0.5rem' }} />
                    Chiama
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredContacts.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <Users size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            Nessun contatto trovato
          </h3>
          <p style={{ color: '#6b7280' }}>
            Prova a modificare i filtri di ricerca
          </p>
        </div>
      )}

      {/* Modal Creazione/Modifica Cliente/Proprietario */}
      {showModal && (
        <ContactModal
          contact={editingContact}
          category={activeTab}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* Modal Visualizzazione Cliente */}
      {showViewModal && (
        <ClientViewModal
          contact={showViewModal}
          suggestedProperties={suggestedProperties}
          onClose={() => {
            setShowViewModal(null)
            setSuggestedProperties([])
          }}
          onEdit={() => {
            setEditingContact(showViewModal)
            setShowViewModal(null)
            setSuggestedProperties([])
            setShowModal(true)
          }}
        />
      )}
    </div>
  )
}

// ===== SISTEMA CALENDARIO COMPLETO (Google Calendar Clone) =====

interface CalendarView {
  type: 'month' | 'week' | 'day' | 'agenda'
  date: Date
}

interface CalendarEvent extends Appointment {
  color?: string
  allDay?: boolean
  recurring?: {
    type: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    endDate?: string
  }
}

function AppointmentsPage({ 
  appointments, 
  dataLoading,
  onCreateAppointment,
  onUpdateAppointment,
  onDeleteAppointment,
  agents
}: { 
  appointments: Appointment[]
  dataLoading: boolean
  onCreateAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void
  onUpdateAppointment: (id: string, appointment: Partial<Appointment>) => void
  onDeleteAppointment: (id: string) => void
  agents: Agent[]
}) {
  const [view, setView] = useState<CalendarView>({ type: 'month', date: new Date() })
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null)

  if (dataLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div className="spin" style={{ width: '40px', height: '40px', fontSize: '2rem' }}>📅</div>
        <p>Caricamento calendario...</p>
      </div>
    )
  }

  const calendarEvents: CalendarEvent[] = appointments.map(apt => ({
    ...apt,
    color: apt.status === 'CONFIRMED' ? '#10b981' : 
           apt.status === 'COMPLETED' ? '#6b7280' :
           apt.status === 'CANCELLED' ? '#ef4444' : '#3b82f6',
    allDay: false
  }))

  // Navigazione calendario
  const navigateCalendar = (direction: 'prev' | 'next' | 'today') => {
    const newDate = new Date(view.date)
    
    if (direction === 'today') {
      setView({ ...view, date: new Date() })
      return
    }

    if (view.type === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    } else if (view.type === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else if (view.type === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    }
    
    setView({ ...view, date: newDate })
  }

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setShowEventModal(true)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setSelectedEvent(null)
    setShowEventModal(true)
  }

  const handleCreateEvent = (eventData: any) => {
    if (selectedEvent) {
      // Modifica evento esistente
      onUpdateAppointment(selectedEvent.id, eventData)
    } else {
      // Nuovo evento
      onCreateAppointment({
        ...eventData,
        startTime: selectedDate?.toISOString() || new Date().toISOString(),
        endTime: new Date((selectedDate?.getTime() || Date.now()) + 60 * 60 * 1000).toISOString()
      })
    }
    setShowEventModal(false)
    setSelectedEvent(null)
    setSelectedDate(null)
  }

  // Drag & Drop handlers
  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    setDraggedEvent(event)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (targetDate: Date, e: React.DragEvent) => {
    e.preventDefault()
    if (draggedEvent) {
      const timeDiff = new Date(draggedEvent.endTime).getTime() - new Date(draggedEvent.startTime).getTime()
      const newStartTime = new Date(targetDate)
      const newEndTime = new Date(newStartTime.getTime() + timeDiff)
      
      onUpdateAppointment(draggedEvent.id, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString()
      })
      
      setDraggedEvent(null)
    }
  }

  const formatViewTitle = () => {
    const date = view.date
    const options: Intl.DateTimeFormatOptions = 
      view.type === 'month' ? { month: 'long', year: 'numeric' } :
      view.type === 'week' ? { day: '2-digit', month: 'short', year: 'numeric' } :
      view.type === 'day' ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' } :
      { month: 'long', year: 'numeric' }
    
    return date.toLocaleDateString('it-IT', options)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>
      {/* Header Calendario - Stile Google Calendar */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '1rem 2rem', 
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        {/* Logo e Titolo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            fontSize: '1.5rem', 
            fontWeight: '600',
            color: '#1f2937'
          }}>
            📅 Calendario
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => navigateCalendar('today')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Oggi
            </button>
            <button
              onClick={() => navigateCalendar('prev')}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              ‹
            </button>
            <button
              onClick={() => navigateCalendar('next')}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              ›
            </button>
          </div>
          <h2 style={{ 
            fontSize: '1.375rem', 
            fontWeight: '400', 
            color: '#374151',
            margin: 0
          }}>
            {formatViewTitle()}
          </h2>
        </div>

        {/* Controlli Vista e Azioni */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Selettore Vista */}
          <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}>
            {(['month', 'week', 'day', 'agenda'] as const).map((viewType) => (
              <button
                key={viewType}
                onClick={() => setView({ ...view, type: viewType })}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: view.type === viewType ? '#3b82f6' : 'white',
                  color: view.type === viewType ? 'white' : '#374151',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  borderRadius: viewType === 'month' ? '0.375rem 0 0 0.375rem' :
                              viewType === 'agenda' ? '0 0.375rem 0.375rem 0' : '0'
                }}
              >
                {viewType === 'month' ? 'Mese' :
                 viewType === 'week' ? 'Settimana' :
                 viewType === 'day' ? 'Giorno' : 'Agenda'}
              </button>
            ))}
          </div>

          {/* Nuovo Evento */}
          <button
            onClick={() => handleDateClick(new Date())}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <Plus size={18} style={{ marginRight: '0.5rem' }} />
            Nuovo Evento
          </button>
        </div>
      </div>

      {/* Contenuto Calendario */}
      <div style={{ flex: 1, padding: '1rem', overflow: 'hidden' }}>
        {view.type === 'month' && (
          <CalendarMonthView 
            events={calendarEvents}
            currentDate={view.date}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}
        {view.type === 'week' && (
          <CalendarWeekView 
            events={calendarEvents}
            currentDate={view.date}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}
        {view.type === 'day' && (
          <CalendarDayView 
            events={calendarEvents}
            currentDate={view.date}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}
        {view.type === 'agenda' && (
          <CalendarAgendaView 
            events={calendarEvents}
            currentDate={view.date}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* Modal Evento */}
      {showEventModal && (
        <CalendarEventModal
          event={selectedEvent}
          selectedDate={selectedDate}
          onSave={handleCreateEvent}
          onDelete={selectedEvent ? () => onDeleteAppointment(selectedEvent.id) : undefined}
          onClose={() => {
            setShowEventModal(false)
            setSelectedEvent(null)
            setSelectedDate(null)
          }}
          agents={agents}
        />
      )}
    </div>
  )
}

// ===== COMPONENTI VISTE CALENDARIO =====

// Vista Mese - Clone Google Calendar
function CalendarMonthView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  onDragStart,
  onDrop
}: {
  events: CalendarEvent[]
  currentDate: Date
  onEventClick: (event: CalendarEvent) => void
  onDateClick: (date: Date) => void
  onDragStart: (event: CalendarEvent, e: React.DragEvent) => void
  onDrop: (date: Date, e: React.DragEvent) => void
}) {
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
  const startOfCalendar = new Date(startOfMonth)
  startOfCalendar.setDate(startOfCalendar.getDate() - startOfCalendar.getDay())
  
  const days = []
  const currentDay = new Date(startOfCalendar)
  
  // Genera 42 giorni (6 settimane)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(currentDay))
    currentDay.setDate(currentDay.getDate() + 1)
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
  const today = new Date()

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      return eventDate.toDateString() === date.toDateString()
    })
  }

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.5rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      height: '100%'
    }}>
      {/* Header giorni della settimana */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {dayNames.map(day => (
          <div
            key={day}
            style={{
              padding: '1rem',
              textAlign: 'center',
              fontWeight: '600',
              fontSize: '0.875rem',
              color: '#6b7280',
              borderRight: '1px solid #e5e7eb'
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Griglia calendario */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: 'repeat(6, 1fr)',
        height: 'calc(100% - 60px)'
      }}>
        {days.map((date, index) => {
          const dayEvents = getEventsForDate(date)
          const isCurrentMonthDay = isCurrentMonth(date)
          const isTodayDay = isToday(date)
          
          return (
            <div
              key={index}
              onClick={() => onDateClick(date)}
              onDrop={(e) => onDrop(date, e)}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: '1px solid #e5e7eb',
                padding: '0.5rem',
                cursor: 'pointer',
                backgroundColor: isTodayDay ? '#eff6ff' : 
                                isCurrentMonthDay ? 'white' : '#f9fafb',
                minHeight: '120px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
            >
              {/* Numero del giorno */}
              <div style={{
                fontSize: '0.875rem',
                fontWeight: isTodayDay ? '600' : '500',
                color: isTodayDay ? '#3b82f6' :
                       isCurrentMonthDay ? '#374151' : '#9ca3af',
                marginBottom: '0.25rem'
              }}>
                {date.getDate()}
              </div>

              {/* Eventi del giorno */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {dayEvents.slice(0, 3).map((event, eventIndex) => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={(e) => onDragStart(event, e)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                    style={{
                      backgroundColor: event.color + '20',
                      color: event.color,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      border: `1px solid ${event.color}30`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {new Date(event.startTime).toLocaleTimeString('it-IT', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })} {event.title}
                  </div>
                ))}
                
                {/* Indicatore eventi aggiuntivi */}
                {dayEvents.length > 3 && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    fontWeight: '500',
                    padding: '2px 6px'
                  }}>
                    +{dayEvents.length - 3} altri
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Vista Settimana - Clone Google Calendar
function CalendarWeekView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  onDragStart,
  onDrop
}: {
  events: CalendarEvent[]
  currentDate: Date
  onEventClick: (event: CalendarEvent) => void
  onDateClick: (date: Date) => void
  onDragStart: (event: CalendarEvent, e: React.DragEvent) => void
  onDrop: (date: Date, e: React.DragEvent) => void
}) {
  const startOfWeek = new Date(currentDate)
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
  
  const weekDays = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek)
    day.setDate(startOfWeek.getDate() + i)
    weekDays.push(day)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const today = new Date()

  const getEventsForDateTime = (date: Date, hour: number) => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime)
      return eventStart.toDateString() === date.toDateString() && 
             eventStart.getHours() === hour
    })
  }

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString()
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.5rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header giorni della settimana */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '80px repeat(7, 1fr)',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ padding: '1rem' }}></div>
        {weekDays.map((day, index) => (
          <div
            key={index}
            style={{
              padding: '1rem',
              textAlign: 'center',
              borderRight: '1px solid #e5e7eb',
              backgroundColor: isToday(day) ? '#eff6ff' : 'transparent'
            }}
          >
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280',
              marginBottom: '0.25rem' 
            }}>
              {day.toLocaleDateString('it-IT', { weekday: 'short' })}
            </div>
            <div style={{ 
              fontSize: '1.25rem', 
              fontWeight: isToday(day) ? '600' : '500',
              color: isToday(day) ? '#3b82f6' : '#374151'
            }}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Griglia oraria */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '80px repeat(7, 1fr)'
        }}>
          {hours.map(hour => (
            <React.Fragment key={hour}>
              {/* Colonna ore */}
              <div style={{
                padding: '0.5rem',
                textAlign: 'right',
                fontSize: '0.75rem',
                color: '#6b7280',
                borderRight: '1px solid #e5e7eb',
                borderBottom: '1px solid #f3f4f6',
                backgroundColor: '#f9fafb'
              }}>
                {hour.toString().padStart(2, '0')}:00
              </div>
              
              {/* Celle giorni */}
              {weekDays.map((day, dayIndex) => {
                const hourEvents = getEventsForDateTime(day, hour)
                const cellDate = new Date(day)
                cellDate.setHours(hour)
                
                return (
                  <div
                    key={`${hour}-${dayIndex}`}
                    onClick={() => onDateClick(cellDate)}
                    onDrop={(e) => onDrop(cellDate, e)}
                    onDragOver={(e) => e.preventDefault()}
                    style={{
                      borderRight: '1px solid #e5e7eb',
                      borderBottom: '1px solid #f3f4f6',
                      minHeight: '60px',
                      cursor: 'pointer',
                      position: 'relative',
                      backgroundColor: isToday(day) ? '#eff6ff10' : 'white'
                    }}
                  >
                    {hourEvents.map(event => (
                      <div
                        key={event.id}
                        draggable
                        onDragStart={(e) => onDragStart(event, e)}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick(event)
                        }}
                        style={{
                          backgroundColor: event.color,
                          color: 'white',
                          padding: '4px 8px',
                          margin: '2px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

// Vista Giorno - Clone Google Calendar
function CalendarDayView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  onDragStart,
  onDrop
}: {
  events: CalendarEvent[]
  currentDate: Date
  onEventClick: (event: CalendarEvent) => void
  onDateClick: (date: Date) => void
  onDragStart: (event: CalendarEvent, e: React.DragEvent) => void
  onDrop: (date: Date, e: React.DragEvent) => void
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const today = new Date()

  const getEventsForHour = (hour: number) => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime)
      return eventStart.toDateString() === currentDate.toDateString() && 
             eventStart.getHours() === hour
    })
  }

  const isToday = currentDate.toDateString() === today.toDateString()

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.5rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header giorno */}
      <div style={{ 
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: isToday ? '#eff6ff' : '#f9fafb',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '600',
          color: isToday ? '#3b82f6' : '#374151',
          margin: 0,
          marginBottom: '0.5rem'
        }}>
          {currentDate.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            day: '2-digit', 
            month: 'long',
            year: 'numeric'
          })}
        </h2>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {events.filter(e => new Date(e.startTime).toDateString() === currentDate.toDateString()).length} eventi programmati
        </p>
      </div>

      {/* Griglia oraria */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {hours.map(hour => {
            const hourEvents = getEventsForHour(hour)
            const cellDate = new Date(currentDate)
            cellDate.setHours(hour)
            
            return (
              <div
                key={hour}
                style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}
              >
                {/* Colonna ora */}
                <div style={{
                  width: '100px',
                  padding: '1rem',
                  textAlign: 'right',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  borderRight: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontWeight: '500'
                }}>
                  {hour.toString().padStart(2, '0')}:00
                </div>
                
                {/* Area eventi */}
                <div
                  onClick={() => onDateClick(cellDate)}
                  onDrop={(e) => onDrop(cellDate, e)}
                  onDragOver={(e) => e.preventDefault()}
                  style={{
                    flex: 1,
                    minHeight: '80px',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '0.5rem'
                  }}
                >
                  {hourEvents.map(event => (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) => onDragStart(event, e)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(event)
                      }}
                      style={{
                        backgroundColor: event.color,
                        color: 'white',
                        padding: '0.75rem 1rem',
                        margin: '0.25rem 0',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        {event.title}
                      </div>
                      <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                        {new Date(event.startTime).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })} - {new Date(event.endTime).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                      {event.location && (
                        <div style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '0.25rem' }}>
                          📍 {event.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Vista Agenda - Lista eventi
function CalendarAgendaView({
  events,
  currentDate,
  onEventClick
}: {
  events: CalendarEvent[]
  currentDate: Date
  onEventClick: (event: CalendarEvent) => void
}) {
  // Raggruppa eventi per giorno
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = new Date(event.startTime).toDateString()
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, CalendarEvent[]>)

  const sortedDates = Object.keys(eventsByDate).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  )

  const today = new Date()

  const isToday = (dateString: string) => {
    return new Date(dateString).toDateString() === today.toDateString()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return '✅'
      case 'COMPLETED': return '✔️'
      case 'CANCELLED': return '❌'
      default: return '📅'
    }
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.5rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      height: '100%'
    }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, marginBottom: '0.5rem' }}>
          📋 Agenda Eventi
        </h2>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {events.length} eventi totali • {sortedDates.length} giorni con eventi
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {sortedDates.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            color: '#6b7280'
          }}>
            <Calendar size={48} style={{ margin: '0 auto 1rem', color: '#d1d5db' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              Nessun evento programmato
            </h3>
            <p>Gli eventi che crei appariranno qui</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {sortedDates.map(dateKey => {
              const date = new Date(dateKey)
              const dayEvents = eventsByDate[dateKey].sort((a, b) => 
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              )
              
              return (
                <div key={dateKey}>
                  {/* Header giorno */}
                  <div style={{ 
                    padding: '1rem',
                    backgroundColor: isToday(dateKey) ? '#eff6ff' : '#f9fafb',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    border: isToday(dateKey) ? '1px solid #3b82f6' : '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ 
                      fontSize: '1.125rem', 
                      fontWeight: '600',
                      color: isToday(dateKey) ? '#3b82f6' : '#374151',
                      margin: 0,
                      marginBottom: '0.25rem'
                    }}>
                      {date.toLocaleDateString('it-IT', { 
                        weekday: 'long', 
                        day: '2-digit', 
                        month: 'long',
                        year: 'numeric'
                      })}
                    </h3>
                    <p style={{ 
                      color: '#6b7280', 
                      margin: 0,
                      fontSize: '0.875rem'
                    }}>
                      {dayEvents.length} {dayEvents.length === 1 ? 'evento' : 'eventi'}
                    </p>
                  </div>

                  {/* Lista eventi del giorno */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        style={{
                          backgroundColor: 'white',
                          border: `2px solid ${event.color}30`,
                          borderLeft: `4px solid ${event.color}`,
                          borderRadius: '0.5rem',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.25rem' }}>
                              {getStatusIcon(event.status)}
                            </span>
                            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                              {event.title}
                            </h4>
                          </div>
                          <span style={{
                            backgroundColor: event.color + '20',
                            color: event.color,
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            {event.status === 'SCHEDULED' ? 'Programmato' : 
                             event.status === 'CONFIRMED' ? 'Confermato' : 
                             event.status === 'COMPLETED' ? 'Completato' : 'Annullato'}
                          </span>
                        </div>

                        <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                          {event.description}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={16} style={{ color: '#6b7280' }} />
                            <span style={{ fontSize: '0.875rem' }}>
                              {new Date(event.startTime).toLocaleTimeString('it-IT', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })} - {new Date(event.endTime).toLocaleTimeString('it-IT', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                          
                          {event.location && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <MapPin size={16} style={{ color: '#6b7280' }} />
                              <span style={{ fontSize: '0.875rem' }}>{event.location}</span>
                            </div>
                          )}
                          
                          {event.contactName && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Users size={16} style={{ color: '#6b7280' }} />
                              <span style={{ fontSize: '0.875rem' }}>{event.contactName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== MODAL EVENTO - Clone Google Calendar =====
function CalendarEventModal({
  event,
  selectedDate,
  onSave,
  onDelete,
  onClose,
  agents
}: {
  event: CalendarEvent | null
  selectedDate: Date | null
  onSave: (eventData: any) => void
  onDelete?: () => void
  onClose: () => void
  agents: Agent[]
}) {
  const [formData, setFormData] = useState({
    title: event?.title || '',
    description: event?.description || '',
    startTime: event?.startTime || (selectedDate?.toISOString().slice(0, 16) || new Date().toISOString().slice(0, 16)),
    endTime: event?.endTime || (new Date((selectedDate?.getTime() || Date.now()) + 60 * 60 * 1000).toISOString().slice(0, 16)),
    location: event?.location || '',
    status: event?.status || 'SCHEDULED',
    contactId: event?.contactId || '',
    contactName: event?.contactName || '',
    propertyId: event?.propertyId || '',
    propertyTitle: event?.propertyTitle || '',
    notes: event?.notes || '',
    allDay: event?.allDay || false,
    color: event?.color || '#3b82f6',
    assignedAgents: event?.assignedAgents || [],
    selectedAgentId: event?.assignedAgents?.[0] || ''
  })

  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      alert('Il titolo è obbligatorio')
      return
    }

    if (!formData.selectedAgentId) {
      alert('Devi selezionare un agente per l\'evento')
      return
    }

    const eventData = {
      ...formData,
      assignedAgents: [formData.selectedAgentId], // Converti in array per compatibilità
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString()
    }

    onSave(eventData)
  }

  const handleDelete = () => {
    if (window.confirm('Sei sicuro di voler eliminare questo evento?')) {
      onDelete?.()
      onClose()
    }
  }

  const statusOptions = [
    { value: 'SCHEDULED', label: 'Programmato', color: '#3b82f6' },
    { value: 'CONFIRMED', label: 'Confermato', color: '#10b981' },
    { value: 'COMPLETED', label: 'Completato', color: '#6b7280' },
    { value: 'CANCELLED', label: 'Annullato', color: '#ef4444' }
  ]

  const colorOptions = [
    { value: '#3b82f6', label: 'Blu' },
    { value: '#10b981', label: 'Verde' },
    { value: '#f59e0b', label: 'Arancione' },
    { value: '#ef4444', label: 'Rosso' },
    { value: '#8b5cf6', label: 'Viola' },
    { value: '#06b6d4', label: 'Ciano' },
    { value: '#84cc16', label: 'Lime' },
    { value: '#f97316', label: 'Arancio scuro' }
  ]

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, color: '#1f2937' }}>
            {event ? '✏️ Modifica Evento' : '📅 Nuovo Evento'}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Titolo */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '0.5rem'
              }}>
                📝 Titolo *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Inserisci il titolo dell'evento"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            {/* Data e ora */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  🕐 Inizio
                </label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  🕑 Fine
                </label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Tutto il giorno */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="allDay"
                checked={formData.allDay}
                onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                style={{ transform: 'scale(1.2)' }}
              />
              <label htmlFor="allDay" style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                🌅 Tutto il giorno
              </label>
            </div>

            {/* Descrizione */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '0.5rem'
              }}>
                📄 Descrizione
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Aggiungi una descrizione..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Luogo */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '0.5rem'
              }}>
                📍 Luogo
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Inserisci l'indirizzo o il luogo"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Status e Colore */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  🏷️ Stato
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  🎨 Colore
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: color.value,
                        border: formData.color === color.value ? '3px solid #374151' : '2px solid #e5e7eb',
                        cursor: 'pointer'
                      }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Opzioni Avanzate */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {showAdvanced ? '▼' : '▶'} Opzioni Avanzate
              </button>
              
              {showAdvanced && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  backgroundColor: '#f9fafb', 
                  borderRadius: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  {/* Cliente */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      👤 Cliente
                    </label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="Nome del cliente"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Immobile */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      🏠 Immobile
                    </label>
                    <input
                      type="text"
                      value={formData.propertyTitle}
                      onChange={(e) => setFormData({ ...formData, propertyTitle: e.target.value })}
                      placeholder="Titolo dell'immobile"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Assegnazione Agente */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      👤 Assegna Agente *
                    </label>
                    <select
                      value={formData.selectedAgentId}
                      onChange={(e) => setFormData({ ...formData, selectedAgentId: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Seleziona un agente...</option>
                      {agents.filter(agent => agent.isActive).map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} - {agent.specialization || agent.role}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Seleziona l'agente responsabile per questo evento
                    </p>
                  </div>

                  {/* Note */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      📝 Note Private
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Note private per l'agente..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              {event && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  🗑️ Elimina
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Annulla
              </button>
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {event ? '💾 Salva Modifiche' : '📅 Crea Evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// Pagina Attività
function ActivitiesPage({ 
  activities, 
  dataLoading,
  onCompleteActivity
}: { 
  activities: Activity[]
  dataLoading: boolean
  onCompleteActivity: (id: string) => void
}) {
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'pending' | 'completed'>('all')
  const [filterType, setFilterType] = useState('')

  if (dataLoading) {
    return <div>Caricamento attività...</div>
  }

  const filteredActivities = activities.filter(activity => {
    const matchesCompleted = filterCompleted === 'all' || 
                            (filterCompleted === 'pending' && !activity.completed) ||
                            (filterCompleted === 'completed' && activity.completed)
    const matchesType = !filterType || activity.type === filterType
    return matchesCompleted && matchesType
  })

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'CALL': return '#3b82f6'
      case 'EMAIL': return '#10b981'
      case 'VIEWING': return '#f59e0b'
      case 'MEETING': return '#8b5cf6'
      case 'FOLLOW_UP': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getTypeText = (type: string) => {
    switch (type) {
      case 'CALL': return 'Chiamata'
      case 'EMAIL': return 'Email'
      case 'VIEWING': return 'Visita'
      case 'MEETING': return 'Incontro'
      case 'FOLLOW_UP': return 'Follow-up'
      default: return type
    }
  }

  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return '#ef4444'
    if (priority >= 3) return '#f59e0b'
    return '#10b981'
  }

  const getPriorityText = (priority: number) => {
    if (priority >= 4) return 'Alta'
    if (priority >= 3) return 'Media'
    return 'Bassa'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            ✅ Attività ({activities.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci le tue attività e follow-up
          </p>
        </div>
        <button
          onClick={() => {
            // Crea una nuova attività via API
            fetch('/api/activities', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'CALL',
                title: 'Nuova Attività',
                description: 'Inserisci i dettagli dell\'attività',
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                priority: 3,
                contactId: '1',
                contactName: 'Cliente Demo'
              })
            }).then(async (response) => {
              const data = await response.json()
              if (data.success) {
                window.location.reload() // Ricarica la pagina per vedere la nuova attività
              } else {
                alert('Errore nella creazione: ' + data.message)
              }
            }).catch((error) => {
              console.error('Errore creazione attività:', error)
              alert('Errore di connessione')
            })
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={20} style={{ marginRight: '0.5rem' }} />
          Nuova Attività
        </button>
      </div>

      {/* Filtri */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Stato
            </label>
            <select
              value={filterCompleted}
              onChange={(e) => setFilterCompleted(e.target.value as any)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            >
              <option value="all">Tutte</option>
              <option value="pending">Da completare</option>
              <option value="completed">Completate</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Tipo
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            >
              <option value="">Tutti i tipi</option>
              <option value="CALL">Chiamata</option>
              <option value="EMAIL">Email</option>
              <option value="VIEWING">Visita</option>
              <option value="MEETING">Incontro</option>
              <option value="FOLLOW_UP">Follow-up</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista attività */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredActivities.map((activity) => (
          <div
            key={activity.id}
            style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
              opacity: activity.completed ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 'bold', 
                    marginRight: '1rem',
                    textDecoration: activity.completed ? 'line-through' : 'none'
                  }}>
                    {activity.title}
                  </h3>
                  <span
                    style={{
                      backgroundColor: `${getTypeColor(activity.type)}20`,
                      color: getTypeColor(activity.type),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}
                  >
                    {getTypeText(activity.type)}
                  </span>
                  <span
                    style={{
                      backgroundColor: `${getPriorityColor(activity.priority)}20`,
                      color: getPriorityColor(activity.priority),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      marginLeft: '0.5rem'
                    }}
                  >
                    {getPriorityText(activity.priority)}
                  </span>
                  {activity.completed && (
                    <span
                      style={{
                        backgroundColor: '#10b98120',
                        color: '#10b981',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        marginLeft: '0.5rem'
                      }}
                    >
                      Completata
                    </span>
                  )}
                </div>

                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                  {activity.description}
                </p>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      <Clock size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Scadenza
                    </p>
                    <p style={{ fontWeight: '500' }}>
                      {new Date(activity.dueDate).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  {activity.contactName && (
                    <div>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                        <Users size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                        Cliente
                      </p>
                      <p style={{ fontWeight: '500' }}>{activity.contactName}</p>
                    </div>
                  )}
                  {activity.completedAt && (
                    <div>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                        Completata il
                      </p>
                      <p style={{ fontWeight: '500' }}>
                        {new Date(activity.completedAt).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!activity.completed && (
                    <button
                      onClick={() => onCompleteActivity(activity.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      <CheckSquare size={16} style={{ marginRight: '0.5rem' }} />
                      Completa
                    </button>
                  )}
                  <button
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Eye size={16} style={{ marginRight: '0.5rem' }} />
                    Visualizza
                  </button>
                  <button
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    <Edit size={16} style={{ marginRight: '0.5rem' }} />
                    Modifica
                  </button>
                </div>
              </div>

              <div style={{ marginLeft: '1rem' }}>
                <div style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  backgroundColor: activity.completed ? '#10b981' : 
                                   new Date(activity.dueDate) < new Date() ? '#ef4444' : '#f59e0b'
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredActivities.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <CheckSquare size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            Nessuna attività trovata
          </h3>
          <p style={{ color: '#6b7280' }}>
            Crea la tua prima attività per iniziare
          </p>
        </div>
      )}
    </div>
  )
}

// Pagina Report
function ReportPage({ stats, properties, contacts }: { 
  stats: DashboardStats | null
  properties: Property[]
  contacts: Contact[]
}) {
  if (!stats) {
    return <div>Caricamento report...</div>
  }

  // Dati per grafici semplificati
  const propertyTypeData = properties.reduce((acc, prop) => {
    acc[prop.type] = (acc[prop.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contactTypeData = contacts.reduce((acc, contact) => {
    acc[contact.type] = (acc[contact.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const propertyStatusData = properties.reduce((acc, prop) => {
    acc[prop.status] = (acc[prop.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          📊 Report e Analisi
        </h1>
        <p style={{ color: '#6b7280' }}>
          Analisi dettagliate delle performance del tuo CRM
        </p>
      </div>

      {/* Metriche principali */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <TrendingUp size={24} style={{ color: '#10b981', marginRight: '0.5rem' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Tasso di Conversione</h3>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
            {stats.totalProperties > 0 ? Math.round((stats.soldProperties / stats.totalProperties) * 100) : 0}%
          </p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Immobili venduti / Totali
          </p>
        </div>

        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <PieChart size={24} style={{ color: '#3b82f6', marginRight: '0.5rem' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Portfolio Value</h3>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
            €{Math.round(properties.reduce((sum, prop) => sum + (prop.salePrice || prop.rentPrice || 0), 0) / 1000)}K
          </p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Valore totale immobili
          </p>
        </div>

        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <BarChart3 size={24} style={{ color: '#f59e0b', marginRight: '0.5rem' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Efficienza Attività</h3>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
            {stats.totalActivities > 0 ? Math.round((stats.completedActivities / stats.totalActivities) * 100) : 0}%
          </p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Attività completate
          </p>
        </div>
      </div>

      {/* Grafici semplificati */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Distribuzione Tipologie Immobili */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Distribuzione Tipologie Immobili
          </h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(propertyTypeData).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem' }}>{type}</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ 
                    width: '100px', 
                    height: '8px', 
                    backgroundColor: '#e5e7eb', 
                    borderRadius: '4px',
                    marginRight: '0.5rem'
                  }}>
                    <div style={{ 
                      width: `${(count / properties.length) * 100}%`, 
                      height: '100%', 
                      backgroundColor: '#3b82f6', 
                      borderRadius: '4px'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stato Immobili */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Stato Immobili
          </h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(propertyStatusData).map(([status, count]) => {
              const color = status === 'AVAILABLE' ? '#10b981' : 
                           status === 'RESERVED' ? '#f59e0b' : '#ef4444'
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.875rem' }}>
                    {status === 'AVAILABLE' ? 'Disponibile' : 
                     status === 'RESERVED' ? 'Prenotato' : 'Venduto'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ 
                      width: '100px', 
                      height: '8px', 
                      backgroundColor: '#e5e7eb', 
                      borderRadius: '4px',
                      marginRight: '0.5rem'
                    }}>
                      <div style={{ 
                        width: `${(count / properties.length) * 100}%`, 
                        height: '100%', 
                        backgroundColor: color, 
                        borderRadius: '4px'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabella performance */}
      <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Performance Summary
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Immobili</h4>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              <p>• Totali: {stats.totalProperties}</p>
              <p>• Disponibili: {stats.availableProperties}</p>
              <p>• Prenotati: {stats.reservedProperties}</p>
              <p>• Venduti: {stats.soldProperties}</p>
              <p>• Prezzo medio: €{stats.averagePropertyPrice.toLocaleString()}</p>
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Contatti</h4>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              <p>• Totali: {stats.totalContacts}</p>
              <p>• Attivi: {stats.activeContacts}</p>
              <p>• Acquirenti: {stats.buyers}</p>
              <p>• Venditori: {stats.sellers}</p>
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Operatività</h4>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              <p>• Appuntamenti: {stats.totalAppointments}</p>
              <p>• Programmati: {stats.scheduledAppointments}</p>
              <p>• Attività totali: {stats.totalActivities}</p>
              <p>• Completate: {stats.completedActivities}</p>
              <p>• Pendenti: {stats.pendingActivities}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Placeholder page
function PlaceholderPage({ title, icon: Icon }: { title: string, icon: any }) {
  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        {title}
      </h1>
      <div style={{ 
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        textAlign: 'center'
      }}>
        <Icon size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
        <p>Funzionalità in sviluppo</p>
      </div>
    </div>
  )
}

// Pagina dettagliata per singolo immobile
function PropertyDetailPage({ 
  propertyId, 
  onBack, 
  onRefreshData,
  navigateToPublicProperty
}: {
  propertyId: string
  onBack: () => void
  onRefreshData: () => void
  navigateToPublicProperty: (propertyId: string) => void
}) {
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [uploadingImages, setUploadingImages] = useState(false)

  // Carica i dati dell'immobile
  useEffect(() => {
    const fetchProperty = async () => {
      try {
        const response = await fetch(`/api/properties/${propertyId}`)
        const data = await response.json()
        if (data.success) {
          setProperty(data.data)
        }
      } catch (error) {
        console.error('Errore caricamento immobile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProperty()
  }, [propertyId])

  // Gestione caricamento immagini
  const handleImageUpload = async (files: FileList) => {
    if (!property) return

    setUploadingImages(true)
    const formData = new FormData()
    
    Array.from(files).forEach((file) => {
      formData.append('images', file)
    })

    try {
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method: 'POST',
        body: formData
      })
      
      const data = await response.json()
      if (data.success) {
        setProperty({ ...property, images: [...(property.images || []), ...data.imageUrls] })
        alert('Immagini caricate con successo!')
      } else {
        alert('Errore nel caricamento: ' + data.message)
      }
    } catch (error) {
      console.error('Errore caricamento immagini:', error)
      alert('Errore di connessione')
    } finally {
      setUploadingImages(false)
    }
  }

  // Rimozione immagine
  const handleRemoveImage = async (imageIndex: number) => {
    if (!property || !property.images) return

    const imageUrl = property.images[imageIndex]
    
    try {
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      })
      
      const data = await response.json()
      if (data.success) {
        const newImages = property.images.filter((_, index) => index !== imageIndex)
        setProperty({ ...property, images: newImages })
      }
    } catch (error) {
      console.error('Errore rimozione immagine:', error)
    }
  }

  // Aggiornamento proprietà
  const handleUpdateProperty = async (updatedData: Partial<Property>) => {
    if (!property) return

    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      })
      
      const data = await response.json()
      if (data.success) {
        setProperty({ ...property, ...updatedData })
        setIsEditing(false)
        onRefreshData()
        alert('Immobile aggiornato con successo!')
      } else {
        alert('Errore nell\'aggiornamento: ' + data.message)
      }
    } catch (error) {
      console.error('Errore aggiornamento immobile:', error)
      alert('Errore di connessione')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>Caricamento dettagli immobile...</div>
      </div>
    )
  }

  if (!property) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Immobile non trovato</h2>
        <button onClick={onBack} style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
          Torna alla lista
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header con breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            ← Torna alla lista
          </button>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{property.title}</h1>
            <p style={{ color: '#6b7280', margin: '0.25rem 0 0 0' }}>
              {property.address}, {property.city} • Rif. {property.reference}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              const publicUrl = `${window.location.origin}/public/property/${propertyId}`
              navigator.clipboard.writeText(publicUrl).then(() => {
                alert('Link pubblico copiato negli appunti!\n' + publicUrl)
              }).catch(() => {
                alert('Link pubblico: ' + publicUrl)
              })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            🔗 Condividi Link
          </button>
          <button
            onClick={() => navigateToPublicProperty(propertyId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            👁️ Anteprima Pubblica
          </button>
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1.5rem',
              backgroundColor: isEditing ? '#6b7280' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            <Edit size={16} style={{ marginRight: '0.5rem' }} />
            {isEditing ? 'Annulla' : 'Modifica'}
          </button>
        </div>
      </div>

      {/* Tabs di navigazione */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid #e5e7eb', 
        marginBottom: '2rem',
        gap: '2rem'
      }}>
        {[
          { id: 'overview', label: 'Panoramica', icon: '🏠' },
          { id: 'images', label: 'Immagini', icon: '📷' },
          { id: 'details', label: 'Dettagli', icon: '📋' },
          { id: 'history', label: 'Cronologia', icon: '📈' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '1rem 0',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === tab.id ? '#2563eb' : '#6b7280',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? '600' : '400'
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenuto dei tabs */}
      {activeTab === 'overview' && (
        <PropertyOverviewTab 
          property={property} 
          isEditing={isEditing}
          onUpdate={handleUpdateProperty}
        />
      )}

      {activeTab === 'images' && (
        <PropertyImagesTab 
          property={property}
          onImageUpload={handleImageUpload}
          onRemoveImage={handleRemoveImage}
          uploadingImages={uploadingImages}
        />
      )}

      {activeTab === 'details' && (
        <PropertyDetailsTab 
          property={property}
          isEditing={isEditing}
          onUpdate={handleUpdateProperty}
        />
      )}

      {activeTab === 'history' && (
        <PropertyHistoryTab property={property} />
      )}
    </div>
  )
}

// Tab Panoramica
function PropertyOverviewTab({ 
  property, 
  isEditing, 
  onUpdate 
}: {
  property: Property
  isEditing: boolean
  onUpdate: (data: Partial<Property>) => void
}) {
  const [formData, setFormData] = useState({
    title: property.title,
    description: property.description,
    salePrice: property.salePrice,
    rentPrice: property.rentPrice,
    status: property.status
  })

  const handleSave = () => {
    onUpdate(formData)
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {/* Prezzo principale */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Prezzo</h3>
        {isEditing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Prezzo Vendita (€)
              </label>
              <input
                type="number"
                value={formData.salePrice || ''}
                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value ? parseInt(e.target.value) : undefined })}
                disabled={property.contractType === 'RENT'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: property.contractType === 'RENT' ? '#f9fafb' : 'white'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Prezzo Affitto (€/mese)
              </label>
              <input
                type="number"
                value={formData.rentPrice || ''}
                onChange={(e) => setFormData({ ...formData, rentPrice: e.target.value ? parseInt(e.target.value) : undefined })}
                disabled={property.contractType === 'SALE'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: property.contractType === 'SALE' ? '#f9fafb' : 'white'
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669' }}>
            {property.salePrice && `€${property.salePrice.toLocaleString()}`}
            {property.rentPrice && `€${property.rentPrice.toLocaleString()}/mese`}
          </div>
        )}
      </div>

      {/* Titolo e descrizione */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Informazioni principali
        </h3>
        
        {isEditing ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Titolo
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Descrizione
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Stato
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              >
                <option value="AVAILABLE">Disponibile</option>
                <option value="RESERVED">Prenotato</option>
                <option value="SOLD">Venduto</option>
              </select>
            </div>
            <button
              onClick={handleSave}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                justifySelf: 'start'
              }}
            >
              Salva modifiche
            </button>
          </div>
        ) : (
          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
              {property.title}
            </h4>
            <p style={{ lineHeight: '1.6', color: '#374151', marginBottom: '1rem' }}>
              {property.description}
            </p>
            <span style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: property.status === 'AVAILABLE' ? '#dcfce7' : property.status === 'RESERVED' ? '#fef3c7' : '#fee2e2',
              color: property.status === 'AVAILABLE' ? '#166534' : property.status === 'RESERVED' ? '#92400e' : '#991b1b'
            }}>
              {property.status === 'AVAILABLE' ? 'Disponibile' : property.status === 'RESERVED' ? 'Prenotato' : 'Venduto'}
            </span>
          </div>
        )}
      </div>

      {/* Caratteristiche principali */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Caratteristiche
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{property.rooms}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Locali</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{property.bedrooms}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Camere</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{property.bathrooms}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bagni</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{property.surface} mq</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Superficie</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{property.energyClass}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Classe Energetica</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tab Immagini
function PropertyImagesTab({ 
  property, 
  onImageUpload, 
  onRemoveImage, 
  uploadingImages 
}: {
  property: Property
  onImageUpload: (files: FileList) => void
  onRemoveImage: (index: number) => void
  uploadingImages: boolean
}) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageUpload(e.target.files)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {/* Upload area */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Carica nuove immagini
        </h3>
        <div style={{
          border: '2px dashed #d1d5db',
          borderRadius: '0.5rem',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploadingImages}
            style={{
              marginBottom: '1rem',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem'
            }}
          />
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {uploadingImages ? 'Caricamento in corso...' : 'Seleziona una o più immagini (JPG, PNG, max 5MB ciascuna)'}
          </p>
        </div>
      </div>

      {/* Galleria immagini */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Immagini attuali ({property.images?.length || 0})
        </h3>
        
        {property.images && property.images.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
            gap: '1rem' 
          }}>
            {property.images.map((image, index) => (
              <div key={index} style={{ position: 'relative' }}>
                <img
                  src={image}
                  alt={`${property.title} - Immagine ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: '0.375rem'
                  }}
                />
                <button
                  onClick={() => onRemoveImage(index)}
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    width: '2rem',
                    height: '2rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.9)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            borderRadius: '0.375rem'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
            <p>Nessuna immagine caricata</p>
            <p style={{ fontSize: '0.875rem' }}>Usa il form sopra per aggiungere le prime immagini</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Tab Dettagli
function PropertyDetailsTab({ 
  property, 
  isEditing, 
  onUpdate 
}: {
  property: Property
  isEditing: boolean
  onUpdate: (data: Partial<Property>) => void
}) {
  const [formData, setFormData] = useState({
    type: property.type,
    contractType: property.contractType,
    address: property.address,
    city: property.city,
    province: property.province,
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    surface: property.surface,
    energyClass: property.energyClass,
    notes: property.notes || ''
  })

  const handleSave = () => {
    onUpdate(formData)
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Dettagli Immobile
        </h3>

        {isEditing ? (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Tipologia e contratto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Tipologia
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="APARTMENT">Appartamento</option>
                  <option value="VILLA">Villa</option>
                  <option value="HOUSE">Casa</option>
                  <option value="COMMERCIAL">Commerciale</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Contratto
                </label>
                <select
                  value={formData.contractType}
                  onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="SALE">Vendita</option>
                  <option value="RENT">Affitto</option>
                </select>
              </div>
            </div>

            {/* Indirizzo */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Indirizzo
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Città
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Provincia
                </label>
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
            </div>

            {/* Caratteristiche */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Locali
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.rooms}
                  onChange={(e) => setFormData({ ...formData, rooms: parseInt(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Camere
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Bagni
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.bathrooms}
                  onChange={(e) => setFormData({ ...formData, bathrooms: parseInt(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Superficie (mq)
                </label>
                <input
                  type="number"
                  min="10"
                  value={formData.surface}
                  onChange={(e) => setFormData({ ...formData, surface: parseInt(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Classe Energetica
                </label>
                <select
                  value={formData.energyClass}
                  onChange={(e) => setFormData({ ...formData, energyClass: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="A+">A+</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                  <option value="F">F</option>
                  <option value="G">G</option>
                </select>
              </div>
            </div>

            {/* Note */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Note aggiuntive
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <button
              onClick={handleSave}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                justifySelf: 'start'
              }}
            >
              Salva modifiche
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Tipologia</h5>
                <p>{property.type === 'APARTMENT' ? 'Appartamento' : property.type === 'VILLA' ? 'Villa' : property.type === 'HOUSE' ? 'Casa' : 'Commerciale'}</p>
              </div>
              <div>
                <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Contratto</h5>
                <p>{property.contractType === 'SALE' ? 'Vendita' : 'Affitto'}</p>
              </div>
              <div>
                <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Indirizzo completo</h5>
                <p>{property.address}, {property.city} ({property.province})</p>
              </div>
            </div>

            {property.notes && (
              <div>
                <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Note</h5>
                <p style={{ lineHeight: '1.6', color: '#374151' }}>{property.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Pagina pubblica immobile (stile Cosmocasa) - COMPLETAMENTE INDIPENDENTE
function PublicPropertyPage({ 
  propertyId, 
  onBack 
}: {
  propertyId: string
  onBack?: () => void
}) {
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [showContactForm, setShowContactForm] = useState(false)

  // Carica i dati dell'immobile
  useEffect(() => {
    const fetchProperty = async () => {
      try {
        const response = await fetch(`/api/properties/${propertyId}`)
        const data = await response.json()
        if (data.success) {
          setProperty(data.data)
        }
      } catch (error) {
        console.error('Errore caricamento immobile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProperty()
  }, [propertyId])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>Caricamento...</div>
      </div>
    )
  }

  if (!property) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>Immobile non trovato</h2>
      </div>
    )
  }

  return (
    <div style={{ 
      backgroundColor: '#f8fafc', 
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header pubblico */}
      <div style={{ 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 0'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold',
              color: '#2563eb'
            }}>
              🏠 CRM Immobiliare
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                🇮🇹 Italiano
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                🖨️ Stampa
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  ← Torna al CRM
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          {/* Colonna sinistra - Contenuto principale */}
          <div>
            {/* Titolo e prezzo */}
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ 
                fontSize: '2rem', 
                fontWeight: 'bold', 
                margin: '0 0 0.5rem 0',
                color: '#1f2937'
              }}>
                {property.title}
              </h1>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <span style={{ color: '#6b7280' }}>📍 {property.address}, {property.city}</span>
                <span style={{ color: '#6b7280' }}>• Rif. {property.reference}</span>
              </div>
              <div style={{ 
                fontSize: '2.5rem', 
                fontWeight: 'bold', 
                color: '#059669',
                marginBottom: '0.5rem'
              }}>
                {property.salePrice && `€${property.salePrice.toLocaleString()}`}
                {property.rentPrice && `€${property.rentPrice.toLocaleString()}/mese`}
              </div>
              <div style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: property.contractType === 'SALE' ? '#dbeafe' : '#fef3c7',
                color: property.contractType === 'SALE' ? '#1d4ed8' : '#92400e'
              }}>
                {property.contractType === 'SALE' ? 'In Vendita' : 'In Affitto'}
              </div>
            </div>

            {/* Galleria immagini */}
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '0.5rem',
              overflow: 'hidden',
              marginBottom: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              {property.images && property.images.length > 0 && (
                <>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={property.images[activeImageIndex]}
                      alt={property.title}
                      style={{
                        width: '100%',
                        height: '400px',
                        objectFit: 'cover'
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '1rem',
                      left: '1rem',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}>
                      📷 {property.images.length} Immagini
                    </div>
                  </div>
                  
                  {property.images.length > 1 && (
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.5rem', 
                      padding: '1rem',
                      overflowX: 'auto'
                    }}>
                      {property.images.map((image, index) => (
                        <img
                          key={index}
                          src={image}
                          alt={`${property.title} - ${index + 1}`}
                          onClick={() => setActiveImageIndex(index)}
                          style={{
                            width: '80px',
                            height: '60px',
                            objectFit: 'cover',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            border: activeImageIndex === index ? '2px solid #2563eb' : '2px solid transparent',
                            flexShrink: 0
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Caratteristiche principali */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '1.5rem', 
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                gap: '1rem',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🏠</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{property.surface} mq</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Superficie</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🚪</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{property.rooms}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Locali</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛏️</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{property.bedrooms}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Camere</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🚿</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{property.bathrooms}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bagni</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚡</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{property.energyClass}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Classe Energetica</div>
                </div>
              </div>
            </div>

            {/* Descrizione */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '1.5rem', 
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                Descrizione
              </h3>
              <p style={{ lineHeight: '1.6', color: '#374151' }}>
                {property.description}
              </p>
            </div>

            {/* Dettagli tecnici completi */}
            <PublicPropertyDetails property={property} />
          </div>

          {/* Colonna destra - Sidebar */}
          <div>
            <PublicPropertySidebar 
              property={property}
              showContactForm={showContactForm}
              onToggleContactForm={() => setShowContactForm(!showContactForm)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Dettagli tecnici completi (stile Cosmocasa)
function PublicPropertyDetails({ property }: { property: Property }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      padding: '1.5rem', 
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>
        Dati Principali
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Colonna sinistra */}
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Rif.</strong><br />
            <span>{property.reference}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Tipologia</strong><br />
            <span>{property.type === 'APARTMENT' ? 'Appartamento' : property.type === 'VILLA' ? 'Villa' : property.type === 'HOUSE' ? 'Casa' : 'Commerciale'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Contratto</strong><br />
            <span>{property.contractType === 'SALE' ? 'In Vendita' : 'In Affitto'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Località</strong><br />
            <span>{property.city} ({property.province})</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Classe Energetica</strong><br />
            <span>{property.energyClass}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Vani</strong><br />
            <span>{property.rooms}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Metri Quadri Commerciali</strong><br />
            <span>{property.surface}</span>
          </div>
          {property.condition && (
            <div style={{ marginBottom: '1rem' }}>
              <strong>Condizioni</strong><br />
              <span>{property.condition}</span>
            </div>
          )}
        </div>

        {/* Colonna destra */}
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Piano</strong><br />
            <span>{property.floor || 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Numero di Livelli</strong><br />
            <span>{property.totalFloors || 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Posizione</strong><br />
            <span>{property.view || 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Vista</strong><br />
            <span>{property.orientation || 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Ascensore</strong><br />
            <span>{property.elevator ? '✓' : '✗'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Parcheggio (Posti auto)</strong><br />
            <span>{property.parkingSpaces ? `n. ${property.parkingSpaces}` : 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Tende da sole</strong><br />
            <span>{property.terrace ? '✓' : 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Terrazzo/i</strong><br />
            <span>{property.terrace ? `n. 1 mq ${property.terrace}` : 'N/A'}</span>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Vicinanza spiaggia</strong><br />
            <span>✓</span>
          </div>
        </div>
      </div>

      {/* Sezione Dettagli Economici */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Dettagli Economici
        </h4>
        <div style={{ marginBottom: '1rem' }}>
          <strong>Prezzo</strong><br />
          <span style={{ fontSize: '1.25rem', color: '#059669', fontWeight: 'bold' }}>
            {property.salePrice && `€ ${property.salePrice.toLocaleString()}`}
            {property.rentPrice && `€ ${property.rentPrice.toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* Caratteristiche interne ed esterne */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
              Caratteristiche interne
            </h4>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Bagni:</strong> n. {property.bathrooms}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Camere:</strong> n. {property.bedrooms}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Cucina:</strong> n. 1 {property.furnished ? 'Arredata' : 'Abitabile'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Disimpegno:</strong> n. 1
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Doppi vetri:</strong> {property.furnished ? '✓' : '✗'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Ingresso:</strong> n. 1
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Studio:</strong> {property.rooms > 3 ? '✓' : '✗'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Zona giorno:</strong> n. 1 Salone
            </div>
          </div>
          
          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
              Caratteristiche esterne
            </h4>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Ascensore:</strong> {property.elevator ? '✓' : '✗'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Parcheggio (Posti auto):</strong> {property.parkingSpaces ? `n. ${property.parkingSpaces}` : 'N/A'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Tende da sole:</strong> ✓
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Terrazzo/i:</strong> {property.terrace ? `n. 1 mq ${property.terrace}` : 'N/A'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Vicinanza spiaggia:</strong> ✓
            </div>
          </div>
        </div>
      </div>

      {/* Caratteristiche impianti */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Caratteristiche impianti
        </h4>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Citofono:</strong> {property.alarm ? '✓' : '✗'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Impianto di domotica:</strong> {property.internetFiber ? '✓' : '✗'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Impianto di riscaldamento:</strong> {property.heating || 'Radiatori'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Impianto elettrico:</strong> A norma
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Impianto fognario:</strong> Allacciato
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Impianto geotermico:</strong> {property.heating === 'geotermico' ? '✓' : '✗'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Porta blindata:</strong> {property.alarm ? '✓' : '✗'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Riscaldamento:</strong> {property.heating === 'centralizzato' ? 'Centralizzato' : 'Autonomo'}
        </div>
      </div>
    </div>
  )
}

// Sidebar con form contatto
function PublicPropertySidebar({ 
  property, 
  showContactForm, 
  onToggleContactForm 
}: {
  property: Property
  showContactForm: boolean
  onToggleContactForm: () => void
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Simula invio richiesta
    try {
      const response = await fetch('/api/contact-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          propertyId: property.id,
          propertyTitle: property.title
        })
      })
      
      if (response.ok) {
        alert('Richiesta inviata con successo! Ti contatteremo presto.')
        setFormData({ name: '', email: '', phone: '', message: '' })
        onToggleContactForm()
      } else {
        alert('Errore nell\'invio della richiesta. Riprova.')
      }
    } catch (error) {
      console.error('Errore invio richiesta:', error)
      alert('Errore di connessione. Riprova.')
    }
  }

  return (
    <div style={{ position: 'sticky', top: '2rem' }}>
      {/* Prezzo in evidenza */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '1.5rem', 
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
          Prezzo:
        </div>
        <div style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          color: '#059669',
          marginBottom: '0.5rem'
        }}>
          {property.salePrice && `€ ${property.salePrice.toLocaleString()}`}
          {property.rentPrice && `€ ${property.rentPrice.toLocaleString()}`}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Rif. {property.reference}
        </div>
      </div>

      {/* Bottone contatto principale */}
      <button
        onClick={onToggleContactForm}
        style={{
          width: '100%',
          padding: '1rem',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '1.125rem',
          fontWeight: '600',
          cursor: 'pointer',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem'
        }}
      >
        📅 Prenota una visita
      </button>
      
      {/* Form prenotazione visita rapida */}
      <VisitBookingForm property={property} />

      {/* Informazioni agenzia */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '1.5rem', 
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#2563eb' }}>
          CRM Immobiliare
        </h4>
        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📍</span>
          <span style={{ fontSize: '0.875rem' }}>Via Roma 123, Milano</span>
        </div>
        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📞</span>
          <span style={{ fontSize: '0.875rem' }}>02 1234567</span>
        </div>
        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📱</span>
          <span style={{ fontSize: '0.875rem' }}>342 1234567</span>
        </div>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>✉️</span>
          <span style={{ fontSize: '0.875rem' }}>info@crmimmobiliare.it</span>
        </div>
      </div>

      {/* Form di contatto */}
      {showContactForm && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
            Richiedi informazioni
          </h4>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            Compila e invia il modulo per richiedere un appuntamento o maggiori informazioni
          </p>
          
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Nominativo"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="tel"
                placeholder="Telefono"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                placeholder="Messaggio"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <input type="checkbox" required />
                <span>Ho letto e compreso l'informativa sulla Privacy Policy</span>
              </label>
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              📧 Invia messaggio
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// Form prenotazione visita (come nel link Cosmocasa)
function VisitBookingForm({ property }: { property: Property }) {
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [bookingData, setBookingData] = useState({
    availability: 'Prima possibile',
    timeSlot: 'Qualsiasi',
    name: '',
    email: '',
    phone: '',
    message: ''
  })

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/visit-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingData,
          propertyId: property.id,
          propertyTitle: property.title
        })
      })
      
      if (response.ok) {
        alert('Richiesta di visita inviata con successo! Ti contatteremo presto per confermare.')
        setBookingData({ availability: 'Prima possibile', timeSlot: 'Qualsiasi', name: '', email: '', phone: '', message: '' })
        setShowBookingForm(false)
      } else {
        alert('Errore nell\'invio della richiesta. Riprova.')
      }
    } catch (error) {
      console.error('Errore invio prenotazione:', error)
      alert('Errore di connessione. Riprova.')
    }
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      padding: '1.5rem', 
      borderRadius: '0.5rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Richiedi una visita
      </h4>
      
      <form onSubmit={handleBookingSubmit}>
        {/* Disponibilità */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Disponibilità
          </label>
          <select
            value={bookingData.availability}
            onChange={(e) => setBookingData({ ...bookingData, availability: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="Prima possibile">Prima possibile</option>
            <option value="Questa settimana">Questa settimana</option>
            <option value="Prossima settimana">Prossima settimana</option>
            <option value="Questo mese">Questo mese</option>
          </select>
        </div>

        {/* Fasce orarie */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Fasce orarie
          </label>
          <select
            value={bookingData.timeSlot}
            onChange={(e) => setBookingData({ ...bookingData, timeSlot: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="Qualsiasi">Qualsiasi</option>
            <option value="9-12">9-12</option>
            <option value="12-14">12-14</option>
            <option value="14-17">14-17</option>
            <option value="17-20">17-20</option>
          </select>
        </div>

        <p style={{ 
          fontSize: '0.75rem', 
          color: '#6b7280', 
          marginBottom: '1rem',
          fontStyle: 'italic'
        }}>
          <strong>Questa non è una prenotazione:</strong> le tue disponibilità saranno inviate all'agenzia che si occuperà di ricontattarti.
        </p>

        {/* Dati di contatto */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Nome e Cognome"
            value={bookingData.name}
            onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Email"
            value={bookingData.email}
            onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="tel"
            placeholder="Telefono"
            value={bookingData.phone}
            onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <textarea
            placeholder="Messaggio (opzionale)"
            value={bookingData.message}
            onChange={(e) => setBookingData({ ...bookingData, message: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <input type="checkbox" required />
            <span>Ho letto e compreso l'informativa sulla Privacy Policy</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setShowBookingForm(false)}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Chiudi
          </button>
          <button
            type="submit"
            style={{
              flex: 2,
              padding: '0.75rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            📅 Richiedi Visita
          </button>
        </div>
      </form>
    </div>
  )
}

// Tab Cronologia
function PropertyHistoryTab({ property }: { property: Property }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      padding: '2rem', 
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
        Cronologia Attività
      </h3>
      
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          padding: '1rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.375rem'
        }}>
          <div style={{ 
            width: '3rem', 
            height: '3rem', 
            backgroundColor: '#2563eb', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold'
          }}>
            📝
          </div>
          <div>
            <h4 style={{ fontWeight: '600', margin: 0 }}>Immobile creato</h4>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              {new Date(property.createdAt).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          padding: '1rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.375rem'
        }}>
          <div style={{ 
            width: '3rem', 
            height: '3rem', 
            backgroundColor: '#059669', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold'
          }}>
            💰
          </div>
          <div>
            <h4 style={{ fontWeight: '600', margin: 0 }}>Prezzo impostato</h4>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              {property.salePrice && `€${property.salePrice.toLocaleString()} (vendita)`}
              {property.rentPrice && `€${property.rentPrice.toLocaleString()}/mese (affitto)`}
            </p>
          </div>
        </div>

        <div style={{ 
          textAlign: 'center', 
          padding: '2rem',
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          borderRadius: '0.375rem',
          fontStyle: 'italic'
        }}>
          Altre attività verranno mostrate qui quando disponibili
        </div>
      </div>
    </div>
  )
}

// Modal per creare/modificare immobili
function PropertyModal({ 
  property, 
  onSave, 
  onCancel 
}: {
  property: Property | null
  onSave: (property: Omit<Property, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [uploadedImages, setUploadedImages] = useState<string[]>(property?.images || [])
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([])
  
  // Carica gli agenti disponibili
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('/api/agents?isActive=true')
        if (response.ok) {
          const agents = await response.json()
          setAvailableAgents(agents)
        }
      } catch (error) {
        console.error('Errore nel caricamento agenti:', error)
      }
    }
    
    fetchAgents()
  }, [])
  
  const [formData, setFormData] = useState({
    // Informazioni base
    title: property?.title || '',
    description: property?.description || '',
    type: property?.type || 'APARTMENT',
    contractType: property?.contractType || 'SALE',
    status: property?.status || 'AVAILABLE',
    reference: property?.reference || '',
    
    // Ubicazione
    address: property?.address || '',
    city: property?.city || '',
    province: property?.province || '',
    
    // Caratteristiche base
    rooms: property?.rooms || 1,
    bedrooms: property?.bedrooms || 1,
    bathrooms: property?.bathrooms || 1,
    surface: property?.surface || 50,
    
    // Prezzi
    salePrice: property?.salePrice || undefined,
    rentPrice: property?.rentPrice || undefined,
    
    // Dettagli strutturali
    floor: property?.floor || undefined,
    totalFloors: property?.totalFloors || undefined,
    elevator: property?.elevator || false,
    furnished: property?.furnished || false,
    
    // Spazi esterni
    terrace: property?.terrace || undefined,
    balcony: property?.balcony || undefined,
    garden: property?.garden || undefined,
    
    // Parcheggio e depositi
    garage: property?.garage || false,
    parkingSpaces: property?.parkingSpaces || undefined,
    cellar: property?.cellar || false,
    attic: property?.attic || false,
    
    // Condizioni e caratteristiche
    condition: property?.condition || 'Buono',
    buildingYear: property?.buildingYear || undefined,
    lastRenovation: property?.lastRenovation || undefined,
    
    // Orientamento e vista
    orientation: property?.orientation || '',
    view: property?.view || '',
    
    // Impianti
    heating: property?.heating || 'Autonomo',
    airConditioning: property?.airConditioning || false,
    alarm: property?.alarm || false,
    internetFiber: property?.internetFiber || false,
    
    // Regolamenti
    petsAllowed: property?.petsAllowed || false,
    smokingAllowed: property?.smokingAllowed || false,
    
    // Costi
    condominium: property?.condominium || undefined,
    propertyTax: property?.propertyTax || undefined,
    
    // Dati catastali
    cadastralCategory: property?.cadastralCategory || '',
    cadastralClass: property?.cadastralClass || '',
    cadastralIncome: property?.cadastralIncome || undefined,
    
    // Energia e ambiente
    energyClass: property?.energyClass || 'G',
    
    // Coordinate
    latitude: property?.latitude || undefined,
    longitude: property?.longitude || undefined,
    
    // Agente
    agentId: property?.agentId || '',
    agentName: property?.agentName || 'Mario Rossi',
    agentPhone: property?.agentPhone || '02 1234567',
    agentEmail: property?.agentEmail || 'info@crmimmobiliare.it',
    
    // Note
    notes: property?.notes || ''
  })

  // Gestione upload immagini
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // Limita a 10 immagini totali
    const remainingSlots = 10 - uploadedImages.length
    const filesToProcess = Array.from(files).slice(0, remainingSlots)

    filesToProcess.forEach((file) => {
      // Verifica dimensione file (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert(`Il file ${file.name} è troppo grande. Massimo 5MB per immagine.`)
        return
      }

      // Verifica tipo file
      if (!file.type.startsWith('image/')) {
        alert(`Il file ${file.name} non è un'immagine valida.`)
        return
      }

      // Converti in base64 per preview
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          setUploadedImages(prev => [...prev, event.target!.result as string])
        }
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    e.target.value = ''
  }

  // Rimozione immagine
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }
  
  // Gestione selezione agente
  const handleAgentSelection = (agentId: string) => {
    const selectedAgent = availableAgents.find(agent => agent.id === agentId)
    if (selectedAgent) {
      setFormData(prev => ({
        ...prev,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        agentPhone: selectedAgent.phone,
        agentEmail: selectedAgent.email
      }))
    } else {
      // Reset se nessun agente selezionato
      setFormData(prev => ({
        ...prev,
        agentId: '',
        agentName: '',
        agentPhone: '',
        agentEmail: ''
      }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validazioni base
    if (!formData.title.trim()) {
      alert('Il titolo è obbligatorio')
      return
    }
    if (!formData.address.trim()) {
      alert('L\'indirizzo è obbligatorio')
      return
    }
    if (!formData.city.trim()) {
      alert('La città è obbligatoria')
      return
    }
    if (!formData.agentId) {
      alert('Seleziona un agente responsabile per l\'immobile')
      return
    }

    onSave({
      ...formData,
      images: uploadedImages
    })
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {property ? 'Modifica Immobile' : 'Nuovo Immobile'}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem',
              borderRadius: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ paddingRight: '1rem' }}>
          <div style={{ display: 'grid', gap: '2rem' }}>
            {/* ===== SEZIONE 1: INFORMAZIONI GENERALI ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                📋 Informazioni Generali
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Titolo *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Riferimento
                    </label>
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Descrizione
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>

            {/* Tipologia e contratto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Tipologia
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="APARTMENT">Appartamento</option>
                  <option value="VILLA">Villa</option>
                  <option value="HOUSE">Casa</option>
                  <option value="COMMERCIAL">Commerciale</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Contratto
                </label>
                <select
                  value={formData.contractType}
                  onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="SALE">Vendita</option>
                  <option value="RENT">Affitto</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Stato
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="AVAILABLE">Disponibile</option>
                  <option value="RESERVED">Prenotato</option>
                  <option value="SOLD">Venduto</option>
                </select>
              </div>
            </div>

              </div>
            </div>

            {/* ===== SEZIONE 2: UBICAZIONE ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                📍 Ubicazione
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Indirizzo *
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Città *
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={formData.province}
                      onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                      maxLength={2}
                      placeholder="RM"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Piano
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.floor || ''}
                      onChange={(e) => setFormData({ ...formData, floor: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Piani Totali
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.totalFloors || ''}
                      onChange={(e) => setFormData({ ...formData, totalFloors: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="5"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.elevator}
                        onChange={(e) => setFormData({ ...formData, elevator: e.target.checked })}
                      />
                      Ascensore
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.furnished}
                        onChange={(e) => setFormData({ ...formData, furnished: e.target.checked })}
                      />
                      Arredato
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== SEZIONE 3: CARATTERISTICHE PRINCIPALI ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                🏠 Caratteristiche Principali
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Locali
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.rooms}
                      onChange={(e) => setFormData({ ...formData, rooms: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Camere
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.bedrooms}
                      onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Bagni
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.bathrooms}
                      onChange={(e) => setFormData({ ...formData, bathrooms: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Superficie (mq)
                    </label>
                    <input
                      type="number"
                      min="10"
                      value={formData.surface}
                      onChange={(e) => setFormData({ ...formData, surface: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Terrazzo (mq)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.terrace || ''}
                      onChange={(e) => setFormData({ ...formData, terrace: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="15"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Balcone (mq)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.balcony || ''}
                      onChange={(e) => setFormData({ ...formData, balcony: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="10"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Giardino (mq)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.garden || ''}
                      onChange={(e) => setFormData({ ...formData, garden: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="50"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.garage}
                        onChange={(e) => setFormData({ ...formData, garage: e.target.checked })}
                      />
                      Garage
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Posti Auto
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.parkingSpaces || ''}
                      onChange={(e) => setFormData({ ...formData, parkingSpaces: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="1"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.cellar}
                        onChange={(e) => setFormData({ ...formData, cellar: e.target.checked })}
                      />
                      Cantina
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Condizioni
                    </label>
                    <select
                      value={formData.condition}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    >
                      <option value="Nuovo">Nuovo</option>
                      <option value="Ottimo">Ottimo</option>
                      <option value="Buono">Buono</option>
                      <option value="Da ristrutturare">Da ristrutturare</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== SEZIONE 4: IMPIANTI E TECNOLOGIE ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                ⚡ Impianti e Tecnologie
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Riscaldamento
                    </label>
                    <select
                      value={formData.heating}
                      onChange={(e) => setFormData({ ...formData, heating: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    >
                      <option value="Autonomo">Autonomo</option>
                      <option value="Centralizzato">Centralizzato</option>
                      <option value="Radiatori">Radiatori</option>
                      <option value="Pavimento">A pavimento</option>
                      <option value="Geotermico">Geotermico</option>
                      <option value="Pompa di calore">Pompa di calore</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.airConditioning}
                        onChange={(e) => setFormData({ ...formData, airConditioning: e.target.checked })}
                      />
                      Aria Condizionata
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.alarm}
                        onChange={(e) => setFormData({ ...formData, alarm: e.target.checked })}
                      />
                      Allarme
                    </label>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.internetFiber}
                        onChange={(e) => setFormData({ ...formData, internetFiber: e.target.checked })}
                      />
                      Fibra Ottica
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.petsAllowed}
                        onChange={(e) => setFormData({ ...formData, petsAllowed: e.target.checked })}
                      />
                      Animali Ammessi
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={formData.smokingAllowed}
                        onChange={(e) => setFormData({ ...formData, smokingAllowed: e.target.checked })}
                      />
                      Fumatori Ammessi
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== SEZIONE 5: PREZZI E COSTI ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                💰 Prezzi e Costi
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Prezzo Vendita (€)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.salePrice || ''}
                      onChange={(e) => setFormData({ ...formData, salePrice: e.target.value ? parseInt(e.target.value) : undefined })}
                      disabled={formData.contractType === 'RENT'}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        backgroundColor: formData.contractType === 'RENT' ? '#f9fafb' : 'white'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Prezzo Affitto (€/mese)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.rentPrice || ''}
                      onChange={(e) => setFormData({ ...formData, rentPrice: e.target.value ? parseInt(e.target.value) : undefined })}
                      disabled={formData.contractType === 'SALE'}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        backgroundColor: formData.contractType === 'SALE' ? '#f9fafb' : 'white'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Classe Energetica
                    </label>
                    <select
                      value={formData.energyClass}
                      onChange={(e) => setFormData({ ...formData, energyClass: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    >
                      <option value="A+">A+</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                      <option value="E">E</option>
                      <option value="F">F</option>
                      <option value="G">G</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Spese Condominiali (€/mese)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.condominium || ''}
                      onChange={(e) => setFormData({ ...formData, condominium: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="150"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      IMU (€/anno)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.propertyTax || ''}
                      onChange={(e) => setFormData({ ...formData, propertyTax: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="2500"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ===== SEZIONE 6: IMMAGINI ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                📸 Immagini Immobile
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Carica Immagini (max 10 file, 5MB ciascuno)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px dashed #d1d5db',
                      borderRadius: '0.375rem',
                      backgroundColor: '#f9fafb',
                      cursor: 'pointer'
                    }}
                  />
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    marginTop: '0.5rem',
                    marginBottom: 0
                  }}>
                    Formati supportati: JPG, PNG, GIF, WebP
                  </p>
                </div>

                {/* Preview immagini caricate */}
                {uploadedImages && uploadedImages.length > 0 && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Immagini Caricate ({uploadedImages.length})
                    </label>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
                      gap: '0.5rem' 
                    }}>
                      {uploadedImages.map((image, index) => (
                        <div key={index} style={{ 
                          position: 'relative',
                          borderRadius: '0.375rem',
                          overflow: 'hidden',
                          backgroundColor: '#f3f4f6',
                          aspectRatio: '1'
                        }}>
                          <img 
                            src={image} 
                            alt={`Immobile ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            style={{
                              position: 'absolute',
                              top: '0.25rem',
                              right: '0.25rem',
                              background: 'rgba(0,0,0,0.7)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '20px',
                              height: '20px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== SEZIONE 7: AGENTE E NOTE ===== */}
            <div style={{ 
              border: '1px solid #e5e7eb', 
              borderRadius: '0.5rem', 
              padding: '1.5rem',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ 
                fontSize: '1.125rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#1f2937',
                borderBottom: '2px solid #2563eb',
                paddingBottom: '0.5rem'
              }}>
                👤 Agente e Note
              </h4>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                {/* Selezione Agente */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    🎯 Seleziona Agente Responsabile *
                  </label>
                  <select
                    value={formData.agentId}
                    onChange={(e) => handleAgentSelection(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: 'white'
                    }}
                    required
                  >
                    <option value="">-- Seleziona un agente --</option>
                    {availableAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role === 'SENIOR_AGENT' ? 'Senior Agent' : 
                         agent.role === 'TEAM_LEADER' ? 'Team Leader' : 
                         agent.role === 'MANAGER' ? 'Manager' : 'Agent'}) - {agent.specialization}
                      </option>
                    ))}
                  </select>
                  {formData.agentId && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.5rem', 
                      backgroundColor: '#f0fdf4', 
                      border: '1px solid #bbf7d0',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      color: '#166534'
                    }}>
                      ✅ Agente selezionato: <strong>{formData.agentName}</strong> - {formData.agentEmail}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                      Nome Agente (Auto-compilato)
                    </label>
                    <input
                      type="text"
                      value={formData.agentName}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280'
                      }}
                      placeholder="Seleziona prima un agente"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                      Telefono Agente (Auto-compilato)
                    </label>
                    <input
                      type="tel"
                      value={formData.agentPhone}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280'
                      }}
                      placeholder="Seleziona prima un agente"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#6b7280' }}>
                      Email Agente (Auto-compilato)
                    </label>
                    <input
                      type="email"
                      value={formData.agentEmail}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280'
                      }}
                      placeholder="Seleziona prima un agente"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Note Aggiuntive
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={4}
                    placeholder="Inserisci qui eventuali note aggiuntive sull'immobile..."
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              {property ? 'Aggiorna' : 'Crea'} Immobile
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal per visualizzare immobile
function PropertyViewModal({ 
  property, 
  onClose, 
  onEdit 
}: {
  property: Property
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {property.title}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {property.images && property.images.length > 0 && (
            <img
              src={property.images[0]}
              alt={property.title}
              style={{
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                borderRadius: '0.375rem'
              }}
            />
          )}

          <div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>Descrizione</h4>
            <p style={{ color: '#6b7280', lineHeight: '1.5' }}>{property.description}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Dettagli</h5>
              <p><strong>Tipologia:</strong> {property.type}</p>
              <p><strong>Contratto:</strong> {property.contractType === 'SALE' ? 'Vendita' : 'Affitto'}</p>
              <p><strong>Stato:</strong> {property.status === 'AVAILABLE' ? 'Disponibile' : property.status === 'RESERVED' ? 'Prenotato' : 'Venduto'}</p>
              <p><strong>Riferimento:</strong> {property.reference}</p>
            </div>
            <div>
              <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Ubicazione</h5>
              <p><strong>Indirizzo:</strong> {property.address}</p>
              <p><strong>Città:</strong> {property.city}</p>
              <p><strong>Provincia:</strong> {property.province}</p>
            </div>
            <div>
              <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Caratteristiche</h5>
              <p><strong>Locali:</strong> {property.rooms}</p>
              <p><strong>Camere:</strong> {property.bedrooms}</p>
              <p><strong>Bagni:</strong> {property.bathrooms}</p>
              <p><strong>Superficie:</strong> {property.surface} mq</p>
              <p><strong>Classe Energetica:</strong> {property.energyClass}</p>
            </div>
            <div>
              <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Prezzo</h5>
              {property.salePrice && (
                <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#059669' }}>
                  €{property.salePrice.toLocaleString()}
                </p>
              )}
              {property.rentPrice && (
                <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#059669' }}>
                  €{property.rentPrice.toLocaleString()}/mese
                </p>
              )}
            </div>
          </div>

          {property.notes && (
            <div>
              <h5 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Note</h5>
              <p style={{ color: '#6b7280', lineHeight: '1.5' }}>{property.notes}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Chiudi
          </button>
          <button
            onClick={onEdit}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Modifica
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== PAGINA AGENTI =====
function AgentsPage({ 
  agents, 
  dataLoading, 
  onRefreshData 
}: { 
  agents: Agent[]
  dataLoading: boolean
  onRefreshData: () => void
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const handleCreateAgent = async (agentData: Omit<Agent, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      })
      if (response.ok) {
        onRefreshData()
        setShowAddModal(false)
      }
    } catch (error) {
      console.error('Errore nella creazione agente:', error)
    }
  }

  const handleUpdateAgent = async (id: string, agentData: Partial<Agent>) => {
    try {
      const response = await fetch(`/api/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      })
      if (response.ok) {
        onRefreshData()
        setEditingAgent(null)
      }
    } catch (error) {
      console.error('Errore nell\'aggiornamento agente:', error)
    }
  }

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo agente?')) return
    
    try {
      const response = await fetch(`/api/agents/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        onRefreshData()
      }
    } catch (error) {
      console.error('Errore nell\'eliminazione agente:', error)
    }
  }

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    await handleUpdateAgent(id, { isActive: !isActive })
  }

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (dataLoading) {
    return <div>Caricamento agenti...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            👥 Agenti ({agents.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci il team di agenti immobiliari
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          <Plus size={20} />
          Nuovo Agente
        </button>
      </div>

      {/* Filtri */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search 
            size={20} 
            style={{ 
              position: 'absolute', 
              left: '0.75rem', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: '#6b7280' 
            }} 
          />
          <input
            type="text"
            placeholder="Cerca agenti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 0.75rem 0.75rem 2.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          />
        </div>
      </div>

      {/* Lista Agenti */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredAgents.map((agent) => (
          <div key={agent.id} style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                backgroundColor: agent.isActive ? '#10b981' : '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.25rem'
              }}>
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  {agent.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Mail size={16} />
                    {agent.email}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Phone size={16} />
                    {agent.phone}
                  </span>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    backgroundColor: agent.isActive ? '#d1fae5' : '#f3f4f6',
                    color: agent.isActive ? '#065f46' : '#6b7280'
                  }}>
                    {agent.isActive ? 'Attivo' : 'Inattivo'}
                  </span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setEditingAgent(agent)}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => handleToggleStatus(agent.id, agent.isActive)}
                style={{
                  padding: '0.5rem',
                  backgroundColor: agent.isActive ? '#fef3c7' : '#d1fae5',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                title={agent.isActive ? 'Disattiva' : 'Attiva'}
              >
                {agent.isActive ? '⏸️' : '▶️'}
              </button>
              <button
                onClick={() => handleDeleteAgent(agent.id)}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#fee2e2',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Creazione/Modifica Agente */}
      {(showAddModal || editingAgent) && (
        <AgentModal
          agent={editingAgent}
          onSave={editingAgent ? 
            (data) => handleUpdateAgent(editingAgent.id, data) : 
            handleCreateAgent
          }
          onCancel={() => {
            setShowAddModal(false)
            setEditingAgent(null)
          }}
        />
      )}
    </div>
  )
}

// ===== MODAL AGENTE =====
function AgentModal({
  agent,
  onSave,
  onCancel
}: {
  agent: Agent | null
  onSave: (agent: Omit<Agent, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    name: agent?.name || '',
    email: agent?.email || '',
    phone: agent?.phone || '',
    role: agent?.role || 'AGENT',
    isActive: agent?.isActive ?? true,
    commission: agent?.commission || 3,
    specialization: agent?.specialization || '',
    notes: agent?.notes || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim() || !formData.email.trim()) {
      alert('Nome e email sono obbligatori')
      return
    }

    onSave(formData)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {agent ? 'Modifica Agente' : 'Nuovo Agente'}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem',
              borderRadius: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Informazioni Base */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Telefono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({...prev, phone: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Ruolo
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({...prev, role: e.target.value as Agent['role']}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="AGENT">Agente</option>
                  <option value="SENIOR_AGENT">Agente Senior</option>
                  <option value="TEAM_LEADER">Team Leader</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Commissione (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.commission}
                  onChange={(e) => setFormData(prev => ({...prev, commission: parseFloat(e.target.value) || 0}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Specializzazione
              </label>
              <input
                type="text"
                value={formData.specialization}
                onChange={(e) => setFormData(prev => ({...prev, specialization: e.target.value}))}
                placeholder="es. Residenziale, Commerciale, Luxury..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Note
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({...prev, isActive: e.target.checked}))}
              />
              <label htmlFor="isActive" style={{ fontWeight: '500' }}>
                Agente attivo
              </label>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '1rem', 
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {agent ? 'Aggiorna' : 'Crea'} Agente
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ===== MODAL CONTATTO/CLIENTE =====
function ContactModal({
  contact,
  category,
  onSave,
  onCancel
}: {
  contact: Contact | null
  category: 'CLIENT' | 'PROPRIETOR'
  onSave: (contact: Omit<Contact, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    type: contact?.type || (category === 'CLIENT' ? 'BUYER' : 'SELLER'),
    category: contact?.category || category,
    city: contact?.city || '',
    address: contact?.address || '',
    budget: contact?.budget || undefined,
    preferences: contact?.preferences || '',
    assignedAgent: contact?.assignedAgent || '',
    source: contact?.source || '',
    notes: contact?.notes || '',
    tags: contact?.tags || [],
    isActive: contact?.isActive ?? true
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      alert('Nome, cognome e email sono obbligatori')
      return
    }

    onSave(formData)
  }

  const typeOptions = category === 'CLIENT' 
    ? [
        { value: 'BUYER', label: 'Acquirente' },
        { value: 'TENANT', label: 'Inquilino' }
      ]
    : [
        { value: 'SELLER', label: 'Venditore' },
        { value: 'LANDLORD', label: 'Proprietario' }
      ]

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {contact ? 'Modifica' : 'Nuovo'} {category === 'CLIENT' ? 'Cliente' : 'Proprietario'}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem',
              borderRadius: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Informazioni Base */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({...prev, firstName: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Cognome *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({...prev, lastName: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Telefono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({...prev, phone: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Tipo
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({...prev, type: e.target.value as Contact['type']}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  {typeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Città
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({...prev, city: e.target.value}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Budget (€)
                </label>
                <input
                  type="number"
                  value={formData.budget || ''}
                  onChange={(e) => setFormData(prev => ({...prev, budget: e.target.value ? parseInt(e.target.value) : undefined}))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Indirizzo
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({...prev, address: e.target.value}))}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Preferenze/Richieste
              </label>
              <textarea
                value={formData.preferences}
                onChange={(e) => setFormData(prev => ({...prev, preferences: e.target.value}))}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Note
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({...prev, isActive: e.target.checked}))}
              />
              <label htmlFor="isActive" style={{ fontWeight: '500' }}>
                {category === 'CLIENT' ? 'Cliente' : 'Proprietario'} attivo
              </label>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '1rem', 
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {contact ? 'Aggiorna' : 'Crea'} {category === 'CLIENT' ? 'Cliente' : 'Proprietario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ===== PAGINA NOTIFICHE =====
function NotificationsPage({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification
}: {
  notifications: Notification[]
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onDeleteNotification: (id: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  
  const filteredNotifications = notifications.filter(n => 
    filter === 'all' || (filter === 'unread' && !n.isRead)
  )

  const unreadCount = notifications.filter(n => !n.isRead).length

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'NEW_EVENT': return '📅'
      case 'EVENT_UPDATE': return '✏️'
      case 'EVENT_CANCELLED': return '❌'
      case 'EVENT_REMINDER': return '⏰'
      default: return '🔔'
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'NEW_EVENT': return '#3b82f6'
      case 'EVENT_UPDATE': return '#f59e0b'
      case 'EVENT_CANCELLED': return '#ef4444'
      case 'EVENT_REMINDER': return '#10b981'
      default: return '#6b7280'
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            🔔 Notifiche ({notifications.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Centro notifiche eventi calendario
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              ✅ Segna tutto come letto
            </button>
          )}
        </div>
      </div>

      {/* Filtri */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '2rem',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '1rem'
      }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: filter === 'all' ? '#3b82f6' : 'white',
            color: filter === 'all' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          Tutte ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: filter === 'unread' ? '#3b82f6' : 'white',
            color: filter === 'unread' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          Non lette ({unreadCount})
        </button>
      </div>

      {/* Lista Notifiche */}
      {filteredNotifications.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔕</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            {filter === 'unread' ? 'Nessuna notifica non letta' : 'Nessuna notifica'}
          </h3>
          <p style={{ color: '#6b7280' }}>
            {filter === 'unread' 
              ? 'Tutte le notifiche sono state lette' 
              : 'Le notifiche degli eventi appariranno qui'
            }
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredNotifications.map(notification => (
            <div
              key={notification.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: notification.isRead ? '1px solid #e5e7eb' : `2px solid ${getNotificationColor(notification.type)}`,
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div>
                      <h3 style={{ 
                        fontSize: '1.125rem', 
                        fontWeight: '600', 
                        margin: 0,
                        color: notification.isRead ? '#6b7280' : '#1f2937'
                      }}>
                        {notification.title}
                      </h3>
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280', 
                        margin: '0.25rem 0 0 0' 
                      }}>
                        {new Date(notification.createdAt).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!notification.isRead && (
                      <button
                        onClick={() => onMarkAsRead(notification.id)}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#f3f4f6',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                        title="Segna come letto"
                      >
                        ✅
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteNotification(notification.id)}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                      title="Elimina notifica"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <p style={{ 
                  fontSize: '0.875rem', 
                  color: notification.isRead ? '#6b7280' : '#374151',
                  marginBottom: '1rem',
                  lineHeight: '1.5'
                }}>
                  {notification.message}
                </p>

                {notification.data.eventTitle && (
                  <div style={{
                    backgroundColor: '#f9fafb',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    borderLeft: `4px solid ${getNotificationColor(notification.type)}`
                  }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      📅 Evento: {notification.data.eventTitle}
                    </div>
                    {notification.data.assignedBy && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        👤 Assegnato da: {notification.data.assignedBy}
                      </div>
                    )}
                    {notification.data.updatedBy && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        ✏️ Modificato da: {notification.data.updatedBy}
                      </div>
                    )}
                    {notification.data.deletedBy && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        🗑️ Eliminato da: {notification.data.deletedBy}
                      </div>
                    )}
                  </div>
                )}

                {!notification.isRead && (
                  <div style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    width: '8px',
                    height: '8px',
                    backgroundColor: getNotificationColor(notification.type),
                    borderRadius: '50%'
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== PAGINA CONTRATTI =====
function ContractsPage({
  contracts,
  contractTemplates,
  properties,
  contacts,
  agents,
  onSave,
  onDelete
}: {
  contracts: Contract[]
  contractTemplates: ContractTemplate[]
  properties: Property[]
  contacts: Contact[]
  agents: Agent[]
  onSave: (contractData: any) => void
  onDelete: (id: string) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [showModal, setShowModal] = useState(false)

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = contract.templateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.propertyTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = !filterType || contract.templateName === filterType
    return matchesSearch && matchesType
  })

  const handleCreateContract = (template: ContractTemplate) => {
    setSelectedTemplate(template)
    setEditingContract(null)
    setShowModal(true)
  }

  const handleEditContract = (contract: Contract) => {
    const template = contractTemplates.find(t => t.name === contract.templateName)
    if (template) {
      setSelectedTemplate(template)
      setEditingContract(contract)
      setShowModal(true)
    }
  }

  const handleSaveContract = (contractData: any) => {
    onSave(contractData)
    setShowModal(false)
    setSelectedTemplate(null)
    setEditingContract(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            📝 Contratti ({filteredContracts.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci i tuoi contratti di locazione
          </p>
        </div>
      </div>

      {/* Template Disponibili */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          📋 Template Disponibili
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {contractTemplates.map(template => (
            <div key={template.id} style={{
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              backgroundColor: '#f9fafb'
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {template.name}
              </h4>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                {template.description}
              </p>
              <button
                onClick={() => handleCreateContract(template)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                + Crea Contratto
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Filtri */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Cerca
            </label>
            <input
              type="text"
              placeholder="Cerca contratti..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Tipo Template
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                backgroundColor: 'white'
              }}
            >
              <option value="">Tutti i tipi</option>
              {contractTemplates.map(template => (
                <option key={template.id} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista Contratti */}
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {filteredContracts.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: '#6b7280' 
          }}>
            <p>Nessun contratto trovato</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Template</th>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Immobile</th>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Cliente</th>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Agente</th>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Stato</th>
                  <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map(contract => (
                  <tr key={contract.id}>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      {contract.templateName}
                    </td>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      {contract.propertyTitle || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      {contract.contactName || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      {contract.agentName || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: contract.status === 'active' ? '#dcfce7' : '#fef3c7',
                        color: contract.status === 'active' ? '#166534' : '#92400e'
                      }}>
                        {contract.status === 'active' ? 'Attivo' : 'Bozza'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleEditContract(contract)}
                          style={{
                            padding: '0.5rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer'
                          }}
                          title="Modifica"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => onDelete(contract.id)}
                          style={{
                            padding: '0.5rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer'
                          }}
                          title="Elimina"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Contratto */}
      {showModal && selectedTemplate && (
        <ContractModal
          template={selectedTemplate}
          contract={editingContract}
          properties={properties}
          contacts={contacts}
          agents={agents}
          onSave={handleSaveContract}
          onClose={() => {
            setShowModal(false)
            setSelectedTemplate(null)
            setEditingContract(null)
          }}
        />
      )}
    </div>
  )
}

export default App
        initialData[field] = contract?.data[field] || ''
      }
    })
    
    return {
      templateId: template.id,
      templateName: template.name,
      propertyId: contract?.propertyId || '',
      contactId: contract?.contactId || '',
      agentId: contract?.agentId || '1',
      data: initialData
    }
  })
  
  const [showGenerated, setShowGenerated] = useState(false)
  const [generatedText, setGeneratedText] = useState('')
  const [generating, setGenerating] = useState(false)

  const selectedProperty = properties.find(p => p.id === formData.propertyId)
  const selectedContact = contacts.find(c => c.id === formData.contactId)
  const selectedAgent = agents.find(a => a.id === formData.agentId)

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      data: { ...prev.data, [field]: value }
    }))
  }

  const addLocatore = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: [...prev.data.locatori, { nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '' }]
      }
    }))
  }

  const removeLocatore = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: prev.data.locatori.filter((_: any, i: number) => i !== index)
      }
    }))
  }

  const updateLocatore = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: prev.data.locatori.map((loc: any, i: number) => 
          i === index ? { ...loc, [field]: value } : loc
        )
      }
    }))
  }

  const addConduttore = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: [...prev.data.conduttori, { nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '', documento_tipo: '', documento_numero: '', documento_comune: '', documento_data: '' }]
      }
    }))
  }

  const removeConduttore = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: prev.data.conduttori.filter((_: any, i: number) => i !== index)
      }
    }))
  }

  const updateConduttore = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: prev.data.conduttori.map((cond: any, i: number) => 
          i === index ? { ...cond, [field]: value } : cond
        )
      }
    }))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      // Prima salva il contratto
      const contractData = {
        ...formData,
        propertyTitle: selectedProperty?.title,
        contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
        agentName: selectedAgent?.name || 'N/A'
      }

      let contractId = contract?.id
      if (!contractId) {
        // Crea nuovo contratto
        const response = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractData)
        })
        const result = await response.json()
        contractId = result.data.id
      } else {
        // Aggiorna contratto esistente
        await fetch(`/api/contracts/${contractId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractData)
        })
      }

      // Genera il contratto compilato
      const generateResponse = await fetch(`/api/contracts/${contractId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const generateResult = await generateResponse.json()
      
      if (generateResult.success) {
        setGeneratedText(generateResult.generatedText)
        setShowGenerated(true)
      }
    } catch (error) {
      console.error('Errore generazione contratto:', error)
    } finally {
      setGenerating(false)
    }
  }

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      'locatore_nome': 'Nome Locatore',
      'locatore_cognome': 'Cognome Locatore',
      'locatore_cf': 'Codice Fiscale Locatore',
      'locatore_nascita_luogo': 'Luogo di Nascita Locatore',
      'locatore_nascita_data': 'Data di Nascita Locatore',
      'locatore_residenza': 'Residenza Locatore',
      'conduttore_nome': 'Nome Conduttore',
      'conduttore_cognome': 'Cognome Conduttore',
      'conduttore_cf': 'Codice Fiscale Conduttore',
      'conduttore_nascita_luogo': 'Luogo di Nascita Conduttore',
      'conduttore_nascita_data': 'Data di Nascita Conduttore',
      'conduttore_residenza': 'Residenza Conduttore',
      'immobile_indirizzo': 'Indirizzo Immobile',
      'immobile_citta': 'Città',
      'immobile_cap': 'CAP',
      'immobile_provincia': 'Provincia',
      'immobile_vani': 'Numero Vani',
      'immobile_superficie': 'Superficie (mq)',
      'immobile_piano': 'Piano',
      'immobile_catasto': 'Dati Catastali',
      'canone_mensile': 'Canone Mensile (€)',
      'deposito_cauzionale': 'Deposito Cauzionale (€)',
      'durata_mesi': 'Durata (mesi)',
      'data_inizio': 'Data Inizio',
      'data_fine': 'Data Fine',
      'spese_condominiali': 'Spese Condominiali (€)',
      'motivazione_transitoria': 'Motivazione Transitoria',
      'uso_immobile': 'Uso Immobile'
    }
    return labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (showGenerated) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          width: '95%',
          maxWidth: '900px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{ 
            padding: '1.5rem', 
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
              📄 {template.name} - Contratto Generato
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowGenerated(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                ← Torna alla Modifica
              </button>
              <button
                onClick={() => {
                  onSave(formData)
                  onClose()
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                ✓ Salva Contratto
              </button>
              <button
                onClick={onClose}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Contratto Generato */}
          <div style={{ 
            flex: 1, 
            padding: '2rem', 
            overflow: 'auto',
            backgroundColor: '#f9fafb'
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              fontFamily: 'Times, serif',
              lineHeight: '1.6',
              whiteSpace: 'pre-line'
            }}>
              {generatedText}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        width: '95%',
        maxWidth: '900px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            📝 {contract ? 'Modifica' : 'Nuovo'} - {template.name}
          </h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          <form onSubmit={(e) => {
            e.preventDefault()
            onSave({
              ...formData,
              propertyTitle: selectedProperty?.title,
              contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
              agentName: selectedAgent?.name || 'N/A'
            })
          }}>
            {/* Selezione Dati Base */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: '1rem', 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '0.5rem'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  🏠 Immobile (Opzionale)
                </label>
                <select
                  value={formData.propertyId}
                  onChange={(e) => setFormData(prev => ({ ...prev, propertyId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleziona immobile...</option>
                  {properties.map(property => (
                    <option key={property.id} value={property.id}>
                      {property.title} - {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  👤 Cliente (Opzionale)
                </label>
                <select
                  value={formData.contactId}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleziona cliente...</option>
                  {contacts.map(contact => (
                    <option key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  👨‍💼 Agente Responsabile *
                </label>
                <select
                  value={formData.agentId}
                  onChange={(e) => setFormData(prev => ({ ...prev, agentId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                  required
                >
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clausole Opzionali */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#fef3c7',
              borderRadius: '0.5rem',
              border: '1px solid #f59e0b'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#92400e' }}>
                📋 Clausole Opzionali
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_deposito_precedente}
                    onChange={(e) => handleFieldChange('include_deposito_precedente', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>💰 Deposito precedente (Art. 12.3)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_arredi}
                    onChange={(e) => handleFieldChange('include_arredi', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>🪑 Arredi e consegna chiavi (Art. 14)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_cedolare_secca}
                    onChange={(e) => handleFieldChange('include_cedolare_secca', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>📊 Cedolare secca (Art. 16)</span>
                </label>
              </div>
            </div>

            {/* Parti Contrattuali - Locatori */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '0.5rem',
              border: '1px solid #0ea5e9'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0c4a6e' }}>
                  🏠 Locatori
                </h3>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.locatori_multipli}
                    onChange={(e) => {
                      handleFieldChange('locatori_multipli', e.target.checked)
                      if (!e.target.checked && formData.data.locatori.length > 1) {
                        setFormData(prev => ({
                          ...prev,
                          data: { ...prev.data, locatori: [prev.data.locatori[0]] }
                        }))
                      }
                    }}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Locatori multipli</span>
                </label>
              </div>
              
              {formData.data.locatori.map((locatore: any, index: number) => (
                <div key={field}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.875rem', 
                    fontWeight: '500', 
                    marginBottom: '0.5rem',
                    color: '#374151'
                  }}>
                    {getFieldLabel(field)}
                  </label>
                  {field.includes('data_') ? (
                    <input
                      type="date"
                      value={formData.data[field]}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  ) : field.includes('motivazione') || field.includes('note') ? (
                    <textarea
                      value={formData.data[field]}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  ) : (
                    <input
                      type={field.includes('canone') || field.includes('deposito') || field.includes('spese') || field.includes('superficie') || field.includes('vani') || field.includes('durata') ? 'number' : 'text'}
                      value={formData.data[field]}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '1.5rem', 
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Annulla
          </button>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: generating ? '#9ca3af' : '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {generating ? 'Generando...' : '📄 Genera Contratto'}
            </button>
            
            <button
              onClick={() => {
                onSave({
                  ...formData,
                  propertyTitle: selectedProperty?.title,
                  contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
                  agentName: selectedAgent?.name || 'N/A'
                })
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              💾 Salva Bozza
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== PAGINA CONTRATTI =====
function ContractsPage({
  contracts,
  contractTemplates,
  properties,
  contacts,
  agents,
  dataLoading,
  onRefreshData
}: {
  contracts: Contract[]
  contractTemplates: ContractTemplate[]
  properties: Property[]
  contacts: Contact[]
  agents: Agent[]
  dataLoading: boolean
  onRefreshData: () => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [showNewContractModal, setShowNewContractModal] = useState(false)
  const [showContractModal, setShowContractModal] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null)

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = contract.templateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.propertyTitle?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || contract.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#f59e0b'
      case 'COMPLETED': return '#10b981'
      case 'SIGNED': return '#3b82f6'
      case 'ACTIVE': return '#059669'
      case 'EXPIRED': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'Bozza'
      case 'COMPLETED': return 'Completato'
      case 'SIGNED': return 'Firmato'
      case 'ACTIVE': return 'Attivo'
      case 'EXPIRED': return 'Scaduto'
      default: return status
    }
  }

  if (dataLoading) {
    return <div>Caricamento contratti...</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            📄 Contratti ({contracts.length})
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestione contratti e modelli preimpostati
          </p>
        </div>
        
        <button
          onClick={() => setShowNewContractModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          <Plus size={20} />
          Nuovo Contratto
        </button>
      </div>

      {/* Filtri */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        {/* Ricerca */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Search 
            size={20} 
            style={{ 
              position: 'absolute', 
              left: '0.75rem', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: '#6b7280' 
            }} 
          />
          <input
            type="text"
            placeholder="Cerca contratti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 0.75rem 0.75rem 2.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Filtro Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            backgroundColor: 'white',
            minWidth: '150px'
          }}
        >
          <option value="ALL">Tutti gli stati</option>
          <option value="DRAFT">Bozze</option>
          <option value="COMPLETED">Completati</option>
          <option value="SIGNED">Firmati</option>
          <option value="ACTIVE">Attivi</option>
          <option value="EXPIRED">Scaduti</option>
        </select>
      </div>

      {/* Lista Contratti */}
      {filteredContracts.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <FileText size={64} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            {searchTerm || statusFilter !== 'ALL' ? 'Nessun contratto trovato' : 'Nessun contratto presente'}
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
            {searchTerm || statusFilter !== 'ALL' 
              ? 'Prova a modificare i filtri di ricerca'
              : 'Inizia creando il tuo primo contratto'
            }
          </p>
          {!searchTerm && statusFilter === 'ALL' && (
            <button
              onClick={() => setShowNewContractModal(true)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Crea Primo Contratto
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredContracts.map(contract => (
            <div
              key={contract.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                        {contract.templateName}
                      </h3>
                      <span
                        style={{
                          backgroundColor: getStatusColor(contract.status) + '20',
                          color: getStatusColor(contract.status),
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}
                      >
                        {getStatusText(contract.status)}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {contract.contactName && (
                        <div>👤 Cliente: {contract.contactName}</div>
                      )}
                      {contract.propertyTitle && (
                        <div>🏠 Immobile: {contract.propertyTitle}</div>
                      )}
                      <div>👨‍💼 Agente: {contract.agentName}</div>
                      <div>📅 Creato: {new Date(contract.createdAt).toLocaleDateString('it-IT')}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setEditingContract(contract)
                        setSelectedTemplate(contractTemplates.find(t => t.id === contract.templateId) || null)
                        setShowContractModal(true)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem',
                        backgroundColor: '#f3f4f6',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                      title="Modifica contratto"
                    >
                      <Edit size={16} />
                    </button>
                    
                    <button
                      onClick={() => {
                        setEditingContract(contract)
                        setSelectedTemplate(contractTemplates.find(t => t.id === contract.templateId) || null)
                        setShowContractModal(true)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem',
                        backgroundColor: '#eff6ff',
                        color: '#3b82f6',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                      title="Visualizza contratto"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Selezione Template */}
      {showNewContractModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '2rem',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                📄 Seleziona Modello Contratto
              </h2>
              <button
                onClick={() => setShowNewContractModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {contractTemplates.map(template => (
                <div
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplate(template)
                    setEditingContract(null)
                    setShowNewContractModal(false)
                    setShowContractModal(true)
                  }}
                  style={{
                    border: '2px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ':hover': { borderColor: '#3b82f6' }
                  }}
                >
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    {template.name}
                  </h3>
                  <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    {template.description}
                  </p>
                  <div style={{ fontSize: '0.875rem', color: '#3b82f6' }}>
                    {template.fields.length} campi da compilare
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Contratto */}
      {showContractModal && selectedTemplate && (
        <ContractModal
          template={selectedTemplate}
          contract={editingContract}
          properties={properties}
          contacts={contacts}
          agents={agents}
          onSave={async (contractData) => {
            try {
              if (editingContract) {
                // Aggiorna contratto esistente
                await fetch(`/api/contracts/${editingContract.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(contractData)
                })
              } else {
                // Crea nuovo contratto
                await fetch('/api/contracts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(contractData)
                })
              }
              onRefreshData()
              setShowContractModal(false)
              setSelectedTemplate(null)
              setEditingContract(null)
            } catch (error) {
              console.error('Errore salvataggio contratto:', error)
            }
          }}
          onClose={() => {
            setShowContractModal(false)
            setSelectedTemplate(null)
            setEditingContract(null)
          }}
        />
      )}
    </div>
  )
}

export default App 