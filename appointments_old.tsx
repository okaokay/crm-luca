function AppointmentsPage({

  appointments,

  dataLoading,

  onCreateAppointment,

  onUpdateAppointment,

  onDeleteAppointment,

  agents,

  contacts,

  properties,

  onCreateContact,

  onCreateProperty,

  currentUserRole,

  currentUserId

}: {

  appointments: Appointment[]

  dataLoading: boolean

  onCreateAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt'>) => void

  onUpdateAppointment: (id: string, appointment: Partial<Appointment>) => void

  onDeleteAppointment: (id: string) => void

  agents: Agent[]

  contacts: Contact[]

  properties: Property[]

  onCreateContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => Promise<any>

  onCreateProperty?: (property: Omit<Property, 'id' | 'createdAt'>) => Promise<any>

  currentUserRole?: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'AGENT' | 'COLLABORATOR' | null

  currentUserId?: string | null

}) {

  const [view, setView] = useState<CalendarView>({ type: 'month', date: new Date() })
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  )

  const [showEventModal, setShowEventModal] = useState(false)

  const [eventModalMode, setEventModalMode] = useState<'view' | 'edit'>('edit')

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const toggleSidebar = React.useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const [sidebarMonth, setSidebarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const [visibleStatuses, setVisibleStatuses] = useState<Record<string, boolean>>({

    SCHEDULED: true,

    CONFIRMED: true,

    COMPLETED: true,

    CANCELLED: true

  })

  const [visibleAgentIds, setVisibleAgentIds] = useState<Record<string, boolean>>(() => {

    const next: Record<string, boolean> = {}

    agents.forEach(a => {

      next[a.id] = true

    })

    return next

  })

  const [showUnassigned, setShowUnassigned] = useState(true)



  const isAdmin = currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'AGENCY_ADMIN'
  const isMobileCalendar = viewportWidth < 768
  const moveMonthSafely = (baseDate: Date, delta: number) => {
    const nextDate = new Date(baseDate)
    const originalDay = nextDate.getDate()
    nextDate.setDate(1)
    nextDate.setMonth(nextDate.getMonth() + delta)
    const lastDayOfTargetMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
    nextDate.setDate(Math.min(originalDay, lastDayOfTargetMonth))
    return nextDate
  }

  const getMonthGridDays = (monthDate: Date) => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const mondayOffsetStart = (firstDay.getDay() + 6) % 7
    const mondayOffsetEnd = (6 - ((lastDay.getDay() + 6) % 7) + 7) % 7
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - mondayOffsetStart)
    const endDate = new Date(lastDay)
    endDate.setDate(endDate.getDate() + mondayOffsetEnd)

    const days: Date[] = []
    const cursor = new Date(startDate)

    while (cursor <= endDate) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    while (days.length < 35) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    return days
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)

    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (isMobileCalendar && sidebarOpen) {
      setSidebarOpen(false)
    }
  }, [isMobileCalendar, sidebarOpen])



  useEffect(() => {

    setSidebarMonth(new Date(view.date.getFullYear(), view.date.getMonth(), 1))

  }, [view.date.getFullYear(), view.date.getMonth()])



  useEffect(() => {

    setVisibleAgentIds(prev => {

      const next = { ...prev }

      agents.forEach(a => {

        if (typeof next[a.id] === 'undefined') next[a.id] = true

      })

      Object.keys(next).forEach(id => {

        if (!agents.some(a => a.id === id)) delete next[id]

      })

      return next

    })

  }, [agents])



  const calendarEventsAll: CalendarEvent[] = appointments.map(apt => ({

    ...apt,

    color: apt.status === 'CONFIRMED' ? '#10b981' :

      apt.status === 'COMPLETED' ? '#6b7280' :

        apt.status === 'CANCELLED' ? '#ef4444' : '#3b82f6',

    allDay: false

  }))



  const calendarEvents = calendarEventsAll.filter(evt => {

    if (!visibleStatuses[evt.status]) return false

    if (!evt.assignedToId) return showUnassigned

    return visibleAgentIds[evt.assignedToId] !== false

  })



  // Navigazione calendario

  const navigateCalendar = (direction: 'prev' | 'next' | 'today') => {

    const newDate = new Date(view.date)



    if (direction === 'today') {

      setView({ ...view, date: new Date() })

      return

    }



    if (view.type === 'month') {
      setView({ ...view, date: moveMonthSafely(newDate, direction === 'next' ? 1 : -1) })
      return
    } else if (view.type === 'week') {

      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))

    } else if (view.type === 'day') {

      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))

    }



    setView({ ...view, date: newDate })

  }



  const navigateSidebarMonth = (direction: 'prev' | 'next') => {

    const next = moveMonthSafely(sidebarMonth, direction === 'next' ? 1 : -1)
    next.setDate(1)

    setSidebarMonth(next)

  }



  const miniCalendarDays = () => {

    return getMonthGridDays(sidebarMonth)

  }



  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()



  const handleEventClick = (event: CalendarEvent) => {

    setSelectedEvent(event)

    setSelectedDate(null)

    setEventModalMode('view')

    setShowEventModal(true)

  }



  const handleDateClick = (date: Date) => {

    setSelectedDate(date)

    setSelectedEvent(null)

    setEventModalMode('edit')

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

        startTime: eventData?.startTime ?? selectedDate?.toISOString() ?? new Date().toISOString(),

        endTime:

          eventData?.endTime ??

          new Date((selectedDate?.getTime() || Date.now()) + 60 * 60 * 1000).toISOString()

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



  if (dataLoading) {

    return (
      <div className="manus-contact-modal-overlay" style={{
        display: 'flex',

        justifyContent: 'center',

        alignItems: 'center',

        height: '400px',

        flexDirection: 'column',

        gap: '1rem'

      }}>

        <div className="spin" style={{ width: '40px', height: '40px', fontSize: '2rem' }}>...</div>

        <p>Caricamento calendario...</p>

      </div>

    )

  }

  return (

    <div style={{ height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>

      <div style={{

        position: 'sticky',

        top: 0,

        zIndex: 20,

        backgroundColor: 'white',

        borderBottom: '1px solid #e5e7eb'

      }}>

        <div style={{
          minHeight: isMobileCalendar ? 'auto' : '64px',
          padding: isMobileCalendar ? '0.85rem' : '0 1rem',
          display: 'flex',
          flexDirection: isMobileCalendar ? 'column' : 'row',
          alignItems: isMobileCalendar ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobileCalendar ? '0.85rem' : '1rem'
        }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flexWrap: isMobileCalendar ? 'wrap' : 'nowrap' }}>

            {!isMobileCalendar && (
              <button
                onClick={() => setSidebarOpen(v => !v)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={sidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
              >
                <LayoutGrid size={20} style={{ color: '#374151' }} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

              <Calendar size={22} style={{ color: '#1a73e8' }} />

              <div style={{ fontSize: isMobileCalendar ? '1.05rem' : '1.25rem', fontWeight: '600', color: '#111827' }}>

                Calendario

              </div>

            </div>



            {!isMobileCalendar && (
              <div style={{ width: '1px', height: '28px', backgroundColor: '#e5e7eb', margin: '0 0.25rem' }} />
            )}



            <button

              onClick={() => navigateCalendar('today')}

              style={{

                height: '36px',

                padding: '0 12px',

                backgroundColor: 'white',

                border: '1px solid #d1d5db',

                borderRadius: '0.5rem',

                cursor: 'pointer',

                fontSize: '0.875rem',

                fontWeight: '500',

                color: '#111827'

              }}

            >

              Oggi

            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>

              <button

                onClick={() => navigateCalendar('prev')}

                style={{

                  width: '36px',

                  height: '36px',

                  borderRadius: '9999px',

                  border: 'none',

                  backgroundColor: 'transparent',

                  cursor: 'pointer',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                }}

                title="Precedente"

              >

                <ArrowLeft size={18} style={{ color: '#374151' }} />

              </button>

              <button

                onClick={() => navigateCalendar('next')}

                style={{

                  width: '36px',

                  height: '36px',

                  borderRadius: '9999px',

                  border: 'none',

                  backgroundColor: 'transparent',

                  cursor: 'pointer',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                }}

                title="Successivo"

              >

                <ArrowRight size={18} style={{ color: '#374151' }} />

              </button>

            </div>



            <div style={{
              fontSize: isMobileCalendar ? '1rem' : '1.125rem',

              fontWeight: '500',

              color: '#111827',

              whiteSpace: 'nowrap',

              overflow: 'hidden',

              textOverflow: 'ellipsis'

            }}>

              {formatViewTitle()}

            </div>

          </div>



          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: isMobileCalendar ? 'wrap' : 'nowrap' }}>

            <div style={{

              display: 'flex',

              alignItems: 'center',

              border: '1px solid #e5e7eb',

              borderRadius: '0.75rem',

              overflowX: 'auto',
              overflowY: 'hidden',
              height: '36px',
              width: isMobileCalendar ? '100%' : 'auto'

            }}>

              {(['month', 'week', 'day', 'agenda'] as const).map((viewType) => (

                <button

                  key={viewType}

                  onClick={() => setView({ ...view, type: viewType })}

                  style={{

                    height: '36px',

                    padding: '0 12px',

                    backgroundColor: view.type === viewType ? '#e8f0fe' : 'white',

                    color: view.type === viewType ? '#1a73e8' : '#374151',

                    border: 'none',

                    fontSize: isMobileCalendar ? '0.8rem' : '0.875rem',

                    fontWeight: '600',

                    cursor: 'pointer'

                  }}

                >

                  {viewType === 'month' ? 'Mese' :

                    viewType === 'week' ? 'Settimana' :

                      viewType === 'day' ? 'Giorno' : 'Agenda'}

                </button>

              ))}

            </div>



            {isAdmin && (

              <button

                onClick={() => handleDateClick(new Date())}

                style={{

                  display: 'flex',

                  alignItems: 'center',

                  gap: '0.5rem',

                  height: '40px',

                  padding: '0 14px',

                  borderRadius: '9999px',

                  border: 'none',

                  backgroundColor: '#1a73e8',

                  color: 'white',

                  cursor: 'pointer',

                  fontWeight: '700',

                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  width: isMobileCalendar ? '100%' : 'auto',
                  justifyContent: 'center'

                }}

              >

                <Plus size={18} />

                Nuovo

              </button>

            )}

          </div>

        </div>

      </div>



      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isMobileCalendar ? 'column' : 'row' }}>

        {sidebarOpen && !isMobileCalendar && (

          <div style={{

            width: '300px',

            borderRight: '1px solid #e5e7eb',

            backgroundColor: 'white',

            padding: '1rem',

            overflow: 'auto'

          }}>

            {isAdmin && (

              <button

                onClick={() => handleDateClick(new Date())}

                style={{

                  display: 'flex',

                  alignItems: 'center',

                  gap: '0.75rem',

                  height: '44px',

                  padding: '0 16px',

                  borderRadius: '9999px',

                  border: '1px solid #e5e7eb',

                  backgroundColor: 'white',

                  cursor: 'pointer',

                  fontWeight: '700',

                  color: '#111827',

                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)'

                }}

              >

                <Plus size={18} style={{ color: '#1a73e8' }} />

                Crea

              </button>

            )}



            <div style={{ marginTop: '1.25rem' }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>

                <div style={{ fontWeight: '700', color: '#111827' }}>

                  {sidebarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>

                  <button

                    onClick={() => navigateSidebarMonth('prev')}

                    style={{

                      width: '32px',

                      height: '32px',

                      borderRadius: '9999px',

                      border: 'none',

                      backgroundColor: 'transparent',

                      cursor: 'pointer',

                      display: 'flex',

                      alignItems: 'center',

                      justifyContent: 'center'

                    }}

                    title="Mese precedente"

                  >

                    <ArrowLeft size={16} style={{ color: '#374151' }} />

                  </button>

                  <button

                    onClick={() => navigateSidebarMonth('next')}

                    style={{

                      width: '32px',

                      height: '32px',

                      borderRadius: '9999px',

                      border: 'none',

                      backgroundColor: 'transparent',

                      cursor: 'pointer',

                      display: 'flex',

                      alignItems: 'center',

                      justifyContent: 'center'

                    }}

                    title="Mese successivo"

                  >

                    <ArrowRight size={16} style={{ color: '#374151' }} />

                  </button>

                </div>

              </div>



              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '0.5rem' }}>

                {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, idx) => (

                  <div key={idx} style={{ textAlign: 'center', fontSize: '0.75rem', color: '#6b7280', fontWeight: '700', padding: '4px 0' }}>

                    {d}

                  </div>

                ))}

              </div>



              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>

                {miniCalendarDays().map((d, idx) => {

                  const inMonth = d.getMonth() === sidebarMonth.getMonth()

                  const isToday = isSameDay(d, new Date())

                  const isSelected = isSameDay(d, view.date)

                  const bg = isToday ? '#1a73e8' : isSelected ? '#e8f0fe' : 'transparent'

                  const fg = isToday ? 'white' : isSelected ? '#1a73e8' : inMonth ? '#111827' : '#9ca3af'

                  return (

                    <button

                      key={idx}

                      onClick={() => setView({ ...view, date: new Date(d) })}

                      style={{

                        height: '32px',

                        borderRadius: '9999px',

                        border: 'none',

                        backgroundColor: bg,

                        cursor: 'pointer',

                        color: fg,

                        fontWeight: isToday || isSelected ? '700' : '500'

                      }}

                      title={d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}

                    >

                      {d.getDate()}

                    </button>

                  )

                })}

              </div>

            </div>



            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>

              <div style={{ fontWeight: '800', color: '#111827', marginBottom: '0.75rem' }}>Calendari</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                {agents.map(agent => (

                  <label key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>

                    <input

                      type="checkbox"

                      checked={visibleAgentIds[agent.id] !== false}

                      onChange={(e) => {

                        const checked = e.target.checked

                        setVisibleAgentIds(prev => ({ ...prev, [agent.id]: checked }))

                      }}

                    />

                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>

                  </label>

                ))}

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>

                  <input

                    type="checkbox"

                    checked={showUnassigned}

                    onChange={(e) => setShowUnassigned(e.target.checked)}

                  />

                  <span>Non assegnati</span>

                </label>

              </div>

            </div>



            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>

              <div style={{ fontWeight: '800', color: '#111827', marginBottom: '0.75rem' }}>Stato</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                {[

                  { key: 'SCHEDULED', label: 'Programmato', color: '#3b82f6' },

                  { key: 'CONFIRMED', label: 'Confermato', color: '#10b981' },

                  { key: 'COMPLETED', label: 'Completato', color: '#6b7280' },

                  { key: 'CANCELLED', label: 'Annullato', color: '#ef4444' }

                ].map(s => (

                  <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>

                    <input

                      type="checkbox"

                      checked={visibleStatuses[s.key] !== false}

                      onChange={(e) => setVisibleStatuses(prev => ({ ...prev, [s.key]: e.target.checked }))}

                    />

                    <span style={{ width: '10px', height: '10px', borderRadius: '9999px', backgroundColor: s.color }} />

                    <span>{s.label}</span>

                  </label>

                ))}

              </div>

            </div>

          </div>

        )}



        <div style={{ flex: 1, minWidth: 0, padding: isMobileCalendar ? '0.75rem' : '1rem', overflow: 'auto' }}>

          <div style={{

            minHeight: isMobileCalendar ? 'auto' : '100%',

            backgroundColor: 'white',

            border: '1px solid #e5e7eb',

            borderRadius: '0.75rem',

            overflow: 'hidden'

          }}>

            {view.type === 'month' && (
              isMobileCalendar ? (
                <CalendarMonthMobileView
                  events={calendarEvents}
                  currentDate={view.date}
                  onEventClick={handleEventClick}
                  onDateClick={handleDateClick}
                  getMonthGridDays={getMonthGridDays}
                />
              ) : (
                <CalendarMonthView
                  events={calendarEvents}
                  currentDate={view.date}
                  onEventClick={handleEventClick}
                  onDateClick={handleDateClick}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  getMonthGridDays={getMonthGridDays}
                />
              )
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

                onEventClick={handleEventClick}

              />

            )}

          </div>

        </div>

      </div>



      {/* Modal Evento */}

      {showEventModal && (

        <CalendarEventModal

          event={selectedEvent}

          selectedDate={selectedDate}

          initialMode={eventModalMode}

          onSave={handleCreateEvent}

          onDelete={selectedEvent ? () => onDeleteAppointment(selectedEvent.id) : undefined}

          onClose={() => {

            setShowEventModal(false)

            setEventModalMode('edit')

            setSelectedEvent(null)

            setSelectedDate(null)

          }}

          agents={agents}

          contacts={contacts}

          properties={properties}

          onCreateContact={onCreateContact}

          onCreateProperty={onCreateProperty}

          currentUserRole={currentUserRole}

          currentUserId={currentUserId}

        />

      )}

    </div>

  )

}



// ===== COMPONENTI VISTE CALENDARIO =====



// Vista Mese - Clone Google Calendar

