import { useState } from 'react'
import { Calendar, Clock, MapPin, User as UserIcon, Plus, Edit, Trash2, Eye, Wand2, X } from 'lucide-react'
import { generateRandomAppointment } from '../utils/randomData'
import { Contact, Property, User as UserType } from '../types'

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
  assignedToId?: string
}

interface AppointmentCalendarProps {
  appointments: Appointment[]
  contacts?: Contact[]
  properties?: Property[]
  agents?: UserType[]
  onCreateAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void
  onUpdateAppointment: (id: string, appointment: Partial<Appointment>) => void
  onDeleteAppointment: (id: string) => void
  onCreateContact?: (contact: any) => Promise<any>
}

export function AppointmentCalendar({ 
  appointments, 
  contacts = [],
  properties = [],
  agents = [],
  onCreateAppointment, 
  onUpdateAppointment, 
  onDeleteAppointment,
  onCreateContact
}: AppointmentCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null)

  // Genera calendario del mese
  const generateCalendar = () => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())
    
    const days = []
    const currentDate = new Date(startDate)
    
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return days
  }

  // Filtra appuntamenti per data
  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.startTime)
      return aptDate.toDateString() === date.toDateString()
    })
  }

  // Colori per stato
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return '#3b82f6'
      case 'CONFIRMED': return '#10b981'
      case 'COMPLETED': return '#6b7280'
      case 'CANCELLED': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'Programmato'
      case 'CONFIRMED': return 'Confermato'
      case 'COMPLETED': return 'Completato'
      case 'CANCELLED': return 'Annullato'
      default: return status
    }
  }

  // Navigazione mese
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ]

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

  return (
    <div style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            📅 Appuntamenti
          </h1>
          <p style={{ color: '#6b7280' }}>
            Gestisci i tuoi appuntamenti e visite
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
          Nuovo Appuntamento
        </button>
      </div>

      {/* Controlli Calendario */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => navigateMonth('prev')}
              style={{
                padding: '0.5rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              ←
            </button>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </h2>
            <button
              onClick={() => navigateMonth('next')}
              style={{
                padding: '0.5rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              →
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['month', 'week', 'day'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: viewMode === mode ? '#2563eb' : '#f3f4f6',
                  color: viewMode === mode ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {mode === 'month' ? 'Mese' : mode === 'week' ? 'Settimana' : 'Giorno'}
              </button>
            ))}
          </div>
        </div>

        {/* Calendario */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: '1px',
          backgroundColor: '#e5e7eb',
          borderRadius: '0.375rem',
          overflow: 'hidden'
        }}>
          {/* Intestazioni giorni */}
          {dayNames.map(day => (
            <div
              key={day}
              style={{
                backgroundColor: '#374151',
                color: 'white',
                padding: '0.75rem',
                textAlign: 'center',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              {day}
            </div>
          ))}

          {/* Giorni del calendario */}
          {generateCalendar().map((date, index) => {
            const dayAppointments = getAppointmentsForDate(date)
            const isCurrentMonth = date.getMonth() === selectedDate.getMonth()
            const isToday = date.toDateString() === new Date().toDateString()

            return (
              <div
                key={index}
                style={{
                  backgroundColor: isCurrentMonth ? 'white' : '#f9fafb',
                  minHeight: '100px',
                  padding: '0.5rem',
                  position: 'relative',
                  cursor: 'pointer',
                  border: isToday ? '2px solid #2563eb' : 'none'
                }}
                onClick={() => setSelectedDate(date)}
              >
                <div style={{ 
                  fontSize: '0.875rem',
                  fontWeight: isToday ? 'bold' : 'normal',
                  color: isCurrentMonth ? '#111827' : '#9ca3af',
                  marginBottom: '0.25rem'
                }}>
                  {date.getDate()}
                </div>
                
                {/* Appuntamenti del giorno */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {dayAppointments.slice(0, 2).map(apt => (
                    <div
                      key={apt.id}
                      style={{
                        backgroundColor: `${getStatusColor(apt.status)}20`,
                        color: getStatusColor(apt.status),
                        padding: '2px 4px',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                      }}
                      title={apt.title}
                    >
                      {new Date(apt.startTime).toLocaleTimeString('it-IT', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })} {apt.title}
                    </div>
                  ))}
                  {dayAppointments.length > 2 && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: '#6b7280',
                      textAlign: 'center'
                    }}>
                      +{dayAppointments.length - 2} altri
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista appuntamenti del giorno selezionato */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Appuntamenti del {selectedDate.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </h3>

        {getAppointmentsForDate(selectedDate).length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: '#6b7280'
          }}>
            <Calendar size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
            <p>Nessun appuntamento per questo giorno</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {getAppointmentsForDate(selectedDate).map(apt => (
              <div
                key={apt.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  padding: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginRight: '1rem' }}>
                        {apt.title}
                      </h4>
                      <span
                        style={{
                          backgroundColor: `${getStatusColor(apt.status)}20`,
                          color: getStatusColor(apt.status),
                          padding: '0.25rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}
                      >
                        {getStatusText(apt.status)}
                      </span>
                    </div>

                    <p style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                      {apt.description}
                    </p>

                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '0.75rem',
                      fontSize: '0.875rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Clock size={16} style={{ marginRight: '0.5rem', color: '#6b7280' }} />
                        {new Date(apt.startTime).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })} - {new Date(apt.endTime).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <MapPin size={16} style={{ marginRight: '0.5rem', color: '#6b7280' }} />
                        {apt.location}
                      </div>
                      {apt.contactName && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <UserIcon size={16} style={{ marginRight: '0.5rem', color: '#6b7280' }} />
                          {apt.contactName}
                        </div>
                      )}
                    </div>

                    {apt.notes && (
                      <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem' }}>
                        <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                          <strong>Note:</strong> {apt.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                    <button
                      onClick={() => setViewingAppointment(apt)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer'
                      }}
                      title="Visualizza"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => setEditingAppointment(apt)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer'
                      }}
                      title="Modifica"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => onDeleteAppointment(apt.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer'
                      }}
                      title="Elimina"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Creazione/Modifica Appuntamento */}
      {(showCreateModal || editingAppointment) && (
        <AppointmentModal
          appointment={editingAppointment}
          contacts={contacts}
          properties={properties}
          agents={agents}
          onCreateContact={onCreateContact}
          onSave={(appointment) => {
            if (editingAppointment) {
              onUpdateAppointment(editingAppointment.id, appointment)
              setEditingAppointment(null)
            } else {
              onCreateAppointment(appointment)
              setShowCreateModal(false)
            }
          }}
          onCancel={() => {
            setShowCreateModal(false)
            setEditingAppointment(null)
          }}
        />
      )}

      {viewingAppointment && (
        <AppointmentViewModal
          appointment={viewingAppointment}
          contacts={contacts}
          properties={properties}
          onClose={() => setViewingAppointment(null)}
          onEdit={() => {
            setEditingAppointment(viewingAppointment)
            setViewingAppointment(null)
          }}
        />
      )}
    </div>
  )
}

function AppointmentViewModal({
  appointment,
  contacts,
  properties,
  onClose,
  onEdit
}: {
  appointment: Appointment
  contacts: Contact[]
  properties: Property[]
  onClose: () => void
  onEdit: () => void
}) {
  const contact = appointment.contactId ? contacts.find(c => c.id === appointment.contactId) : undefined
  const property = appointment.propertyId ? properties.find(p => p.id === appointment.propertyId) : undefined

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
        width: '100%',
        maxWidth: '650px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem'
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
              {appointment.title}
            </h2>
            {appointment.description && (
              <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>
                {appointment.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.375rem'
            }}
            aria-label="Chiudi"
            title="Chiudi"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Clock size={18} style={{ color: '#6b7280' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: '600' }}>
                  {new Date(appointment.startTime).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
                <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                  {new Date(appointment.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} – {new Date(appointment.endTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {appointment.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <MapPin size={18} style={{ color: '#6b7280' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: '600' }}>Luogo</span>
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{appointment.location}</span>
                </div>
              </div>
            )}

            {(contact || appointment.contactName) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <UserIcon size={18} style={{ color: '#6b7280' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: '600' }}>Cliente</span>
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {contact ? `${contact.firstName} ${contact.lastName}` : appointment.contactName}
                  </span>
                </div>
              </div>
            )}

            {(property || appointment.propertyTitle) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Calendar size={18} style={{ color: '#6b7280' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: '600' }}>Immobile</span>
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {property?.title || appointment.propertyTitle}
                  </span>
                </div>
              </div>
            )}
          </div>

          {appointment.notes && (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '1rem',
              backgroundColor: '#ffffff'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '0.5rem' }}>Note</div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{appointment.notes}</div>
            </div>
          )}
        </div>

        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem'
        }}>
          <button
            onClick={onEdit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <Edit size={18} />
            Modifica
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal per creare/modificare appuntamenti
function AppointmentModal({ 
  appointment, 
  contacts = [],
  properties = [],
  agents = [],
  onCreateContact,
  onSave, 
  onCancel 
}: {
  appointment: Appointment | null
  contacts?: Contact[]
  properties?: Property[]
  agents?: UserType[]
  onCreateContact?: (contact: any) => Promise<any>
  onSave: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    title: appointment?.title || '',
    description: appointment?.description || '',
    startTime: appointment?.startTime ? new Date(appointment.startTime).toISOString().slice(0, 16) : '',
    endTime: appointment?.endTime ? new Date(appointment.endTime).toISOString().slice(0, 16) : '',
    location: appointment?.location || '',
    status: appointment?.status || 'SCHEDULED' as const,
    contactId: appointment?.contactId || '',
    contactName: appointment?.contactName || '',
    propertyId: appointment?.propertyId || '',
    propertyTitle: appointment?.propertyTitle || '',
    notes: appointment?.notes || '',
    assignedToId: appointment?.assignedToId || ''
  })

  const [showClientList, setShowClientList] = useState(false)
  const [showPropertyList, setShowPropertyList] = useState(false)
  const [isCreatingClient, setIsCreatingClient] = useState(false)
  const [newClientData, setNewClientData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    type: 'LEAD' as const,
    source: 'MANUAL',
    tags: [] as string[],
    isActive: true,
    agencyId: '' // Will be handled by backend
  })

  const handleAutoFill = () => {
    const randomData = generateRandomAppointment()
    setFormData(prev => ({
      ...prev,
      title: randomData.title,
      description: randomData.description,
      startTime: randomData.startTime,
      endTime: randomData.endTime,
      location: randomData.location,
      status: randomData.status as any,
      notes: randomData.notes
    }))
  }

  const handleSaveNewClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientData.firstName || !newClientData.lastName) {
      alert('Nome e Cognome sono obbligatori')
      return
    }

    try {
      if (onCreateContact) {
        const newContact = await onCreateContact(newClientData)
        if (newContact) {
          setFormData(prev => ({
            ...prev,
            contactId: newContact.id,
            contactName: `${newContact.firstName} ${newContact.lastName}`
          }))
          setIsCreatingClient(false)
        }
      }
    } catch (error) {
      console.error('Error creating client:', error)
      alert('Errore durante la creazione del cliente')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Create clean payload without extra fields
    const payload = {
      title: formData.title,
      description: formData.description,
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString(),
      location: formData.location,
      status: formData.status,
      contactId: formData.contactId || '', // Ensure empty string if null
      propertyId: formData.propertyId || undefined,
      notes: formData.notes,
      assignedToId: formData.assignedToId
    }

    onSave(payload)
  }

  if (isCreatingClient) {
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
        zIndex: 1100
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '2rem',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            Nuovo Cliente
          </h3>
          <form onSubmit={handleSaveNewClient}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Nome *</label>
                <input
                  type="text"
                  value={newClientData.firstName}
                  onChange={e => setNewClientData({ ...newClientData, firstName: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Cognome *</label>
                <input
                  type="text"
                  value={newClientData.lastName}
                  onChange={e => setNewClientData({ ...newClientData, lastName: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Email</label>
                <input
                  type="email"
                  value={newClientData.email}
                  onChange={e => setNewClientData({ ...newClientData, email: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Telefono</label>
                <input
                  type="tel"
                  value={newClientData.phone}
                  onChange={e => setNewClientData({ ...newClientData, phone: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsCreatingClient(false)}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                type="submit"
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                Salva Cliente
              </button>
            </div>
          </form>
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
        padding: '2rem',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {appointment ? 'Modifica Appuntamento' : 'Nuovo Appuntamento'}
          </h3>
          <button
            type="button"
            onClick={handleAutoFill}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            <Wand2 size={16} />
            Autocompila
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '1rem' }}>
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

            {/* Client Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Cliente (Opzionale)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={formData.contactName}
                    onChange={(e) => {
                      setFormData({ ...formData, contactName: e.target.value, contactId: '' })
                      setShowClientList(true)
                    }}
                    onFocus={() => setShowClientList(true)}
                    onBlur={() => setTimeout(() => setShowClientList(false), 200)}
                    placeholder="Cerca cliente..."
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem'
                    }}
                  />
                  {showClientList && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'white',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      zIndex: 1000,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      {contacts
                        .filter(c => 
                          `${c.firstName} ${c.lastName}`.toLowerCase().includes(formData.contactName.toLowerCase())
                        )
                        .map(contact => (
                          <div
                            key={contact.id}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setFormData({ 
                                ...formData, 
                                contactName: `${contact.firstName} ${contact.lastName}`,
                                contactId: contact.id
                              })
                              setShowClientList(false)
                            }}
                            style={{
                              padding: '0.75rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f3f4f6'
                            }}
                          >
                            <div style={{ fontWeight: '500' }}>{contact.firstName} {contact.lastName}</div>
                            {contact.email && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{contact.email}</div>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingClient(true)}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer'
                  }}
                  title="Aggiungi nuovo cliente"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            {/* Property Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Immobile (Opzionale)
              </label>
              <input
                type="text"
                value={formData.propertyTitle}
                onChange={(e) => {
                  setFormData({ ...formData, propertyTitle: e.target.value, propertyId: '' })
                  setShowPropertyList(true)
                }}
                onFocus={() => setShowPropertyList(true)}
                onBlur={() => setTimeout(() => setShowPropertyList(false), 200)}
                placeholder="Cerca immobile per via..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
              {showPropertyList && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  zIndex: 1000,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                  {properties
                    .filter(p => 
                      p.address.toLowerCase().includes(formData.propertyTitle.toLowerCase()) ||
                      p.title.toLowerCase().includes(formData.propertyTitle.toLowerCase())
                    )
                    .map(property => (
                      <div
                        key={property.id}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setFormData({ 
                            ...formData, 
                            propertyTitle: property.title,
                            propertyId: property.id
                          })
                          setShowPropertyList(false)
                        }}
                        style={{
                          padding: '0.75rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f3f4f6'
                        }}
                      >
                        <div style={{ fontWeight: '500' }}>{property.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{property.address}</div>
                      </div>
                    ))}
                </div>
              )}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Data/Ora Inizio *
                </label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
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
                  Data/Ora Fine *
                </label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>
            </div>

            {/* Agent Selection */}
            {agents && agents.length > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Assegna a Agente
                </label>
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                >
                  <option value="">Seleziona un agente...</option>
                  {agents
                    .filter(agent => agent.isActive)
                    .map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName} ({agent.role})
                      </option>
                    ))
                  }
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Luogo
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                Stato
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              >
                <option value="SCHEDULED">Programmato</option>
                <option value="CONFIRMED">Confermato</option>
                <option value="COMPLETED">Completato</option>
                <option value="CANCELLED">Annullato</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Note
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
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
              {appointment ? 'Aggiorna' : 'Crea'} Appuntamento
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 
