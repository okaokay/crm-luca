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
  giListingId?: number
  immoListingId?: number
  immoSyncStatus?: 'NOT_SYNCED' | 'SYNCED' | 'ERROR'
  immoLastSyncAt?: string
  immoLastError?: string
  apimoPropertyId?: string
  apimoPushStatus?: 'NOT_SYNCED' | 'SYNCED' | 'ERROR'
  apimoLastPushAt?: string
  apimoLastPushError?: string
  title: string
  description: string
  type: string
  contractType: string
  status: string
  address: string
  city: string
  province: string
  zipCode: string
  giComuneIstat?: string
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
  ownerFirstName?: string
  ownerLastName?: string
  ownerBirthDate?: string
  ownerBirthPlace?: string
  ownerFiscalCode?: string
  ownerAddress?: string
  ownerCity?: string
  ownerZipCode?: string
  ownerEmail?: string
  ownerPhone?: string
  buildingConstructionYear?: number
  buildingRenovationYear?: number
  buildingFloorsTotal?: number
  buildingElevator?: boolean
  buildingConcierge?: boolean
  buildingGardenShared?: boolean
  buildingHeatingType?: string
  buildingCondition?: string
  latitude?: number
  longitude?: number
  agentId?: string
  agentName?: string
  agentPhone?: string
  agentEmail?: string
  portalTargets?: string[]
  oneClickData?: {
    idtipologiaimmobile?: number
    idtipologiaannuncio?: number
    comune_istat?: string
    selectedPortalCodes?: number[]
    portalSelectionBaselineDone?: boolean
    riferimento?: string
    descrizione?: string
    data_inserimento?: string
    data_aggiornamento?: string
    [key: string]: any
  }
}

interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  type: 'BUYER' | 'SELLER' | 'LANDLORD' | 'TENANT' | 'LEAD'
  category: 'CLIENT' | 'PROPRIETOR'
  city: string
  province?: string
  address?: string
  zipCode?: string
  birthDate?: string
  birthPlace?: string
  fiscalCode?: string
  budget?: number
  preferences?: string
  requestApartmentType?: string
  requestBedrooms?: number
  requestBathrooms?: number
  requestFloor?: number
  assignedAgent?: string
  source?: string
  notes: string
  tags: string[]
  isActive: boolean
  createdAt: string
}

interface OwnerDocument {
  id: string
  contactId: string
  type: string
  side?: string
  fileKey: string
  uploadedAt: string
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
  assignedToId?: string
  contactName?: string
  propertyTitle?: string
  notes?: string
  createdAt: string
}

interface AgentZone {
  id: string
  agencyId: string
  agentId: string
  region: string
  province: string
  city: string
  zone?: string
  groupSize?: number
  sourceUrl?: string
  importStatus?: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
  lastImportedAt?: string
  notes?: string
  createdAt: string
  streetCount?: number
  groupCount?: number
  assignedStreetCount?: number
  hasStreetMapping?: boolean
  agent?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}

interface Activity {
  id: string
  type: 'CALL' | 'EMAIL' | 'VIEWING' | 'MEETING' | 'FOLLOW_UP' | 'TASK'
  title: string
  description: string
  completed: boolean
  completedAt?: string
  dueDate: string
  priority: number
  contactId: string
  propertyId?: string
  assignedToId?: string
  contactName?: string
  propertyTitle?: string
  assignedToName?: string
  report?: string
  createdAt: string
}

interface Agent {
  id: string
  name: string
  email: string
  phone: string
  role: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'AGENT' | 'COLLABORATOR'
  isActive: boolean
  commission: number
  specialization: string
  notes: string
  createdAt: string
}

type PortalKind = 'SYNC_PUSH' | 'FEED_PULL' | 'MANUAL' | 'PROXY'

type PortalRequirement = 'price' | 'image' | 'giComuneIstat' | 'giListingId' | 'location'

type PortalConfigMode = 'CENTRALIZZATO' | 'PER_AGENZIA'

type PortalRegistryItem = {
  id: string
  label: string
  kind: PortalKind
  modeLabel: string
  implemented: boolean
  configMode: PortalConfigMode
  feedPath?: string | null
  requirements: PortalRequirement[]
  feedUrl?: string | null
}

interface PortalSummary {
  id: string
  label: string
  kind: PortalKind
  modeLabel: string
  implemented: boolean
  feedUrl?: string | null
  active: boolean
  activationStatus?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED'
  requirements: PortalRequirement[]
  selectedCount: number
  publishedCount: number
  errorCount: number
  notPublishableCount: number
}

type PortalPropertyHighLevelStatus = 'selected' | 'published' | 'error' | 'not_publishable'

interface PortalPropertyRow {
  id: string
  title: string
  address: string
  city: string
  type: string
  contractType: string
  price: number | null
  agent: {
    id: string
    firstName: string
    lastName: string
  } | null
  portal: {
    status: any
    highLevelStatus: PortalPropertyHighLevelStatus
    missingRequirements: PortalRequirement[]
    error: string | null
  }
}

interface PortalLogPropertyRef {
  id: string
  title: string | null
  reference: string | null
}

interface PortalLogEntry {
  id: string
  createdAt: string
  portalId: string
  operation: string
  status: 'OK' | 'ERROR'
  message: string | null
  property: PortalLogPropertyRef | null
}

type NotificationType =
  | 'NEW_EVENT'
  | 'EVENT_UPDATE'
  | 'EVENT_CANCELLED'
  | 'EVENT_REMINDER'
  | 'ACTIVITY_CREATED'
  | 'TASK_COMPLETED'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_REMINDER'
  | 'MATCH_FOUND'
  | 'PROPERTY_ADDED'
  | 'CLIENT_ADDED'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  recipientId?: string
  relatedId?: string
  data?: {
    eventId?: string
    eventTitle?: string
    assignedBy?: string
    updatedBy?: string
    deletedBy?: string
    propertyId?: string
    clientId?: string
  }
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

interface ItalianCity {
  name: string
  provinceCode: string
  provinceName: string
  regionName: string
  istatCode: string
}

interface ItalianProvince {
  code: string
  name: string
  regionName: string
}
