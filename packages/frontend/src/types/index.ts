// Tipi base
export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

// Enums
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  AGENCY_ADMIN = 'AGENCY_ADMIN',
  AGENT = 'AGENT',
  COLLABORATOR = 'COLLABORATOR',
}

export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  VILLA = 'VILLA',
  OFFICE = 'OFFICE',
  SHOP = 'SHOP',
  WAREHOUSE = 'WAREHOUSE',
  LAND = 'LAND',
  GARAGE = 'GARAGE',
  OTHER = 'OTHER',
}

export enum PropertyStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ContractType {
  SALE = 'SALE',
  RENT = 'RENT',
  BOTH = 'BOTH',
}

export enum ContactType {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  TENANT = 'TENANT',
  LANDLORD = 'LANDLORD',
  LEAD = 'LEAD',
}

export enum RequestStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED',
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum ActivityType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
  VIEWING = 'VIEWING',
  NOTE = 'NOTE',
  TASK = 'TASK',
}

export enum PortalConfigType {
  CENTRALIZZATO = 'CENTRALIZZATO',
  PER_AGENZIA = 'PER_AGENZIA',
}

export enum PortalConfigStatus {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
}

// Entità principali
export interface Agency extends BaseEntity {
  name: string
  email: string
  phone?: string
  address?: string
  city?: string
  province?: string
  zipCode?: string
  vatNumber?: string
  website?: string
  logo?: string
  publicBaseUrl?: string
  giAgencyId?: number
  isActive: boolean
}

export interface User extends BaseEntity {
  email: string
  firstName: string
  lastName: string
  phone?: string
  avatar?: string
  role: UserRole
  isActive: boolean
  mustChangePassword?: boolean
  lastLoginAt?: string
  agencyId: string
  agency: Agency
}

export interface Property extends BaseEntity {
  giListingId?: number
  title: string
  description?: string
  type: PropertyType
  contractType: ContractType
  status: PropertyStatus
  
  // Ubicazione
  address: string
  city: string
  province: string
  zipCode: string
  giComuneIstat?: string
  latitude?: number
  longitude?: number
  
  // Caratteristiche
  rooms?: number
  bedrooms?: number
  bathrooms?: number
  surface?: number
  garden?: number
  terrace?: number
  balcony?: number
  parking?: number
  floor?: number
  totalFloors?: number
  elevator: boolean
  furnished: boolean
  
  // Prezzi
  salePrice?: number
  rentPrice?: number
  advertisingSalePrice?: number
  advertisingRentPrice?: number
  expenses?: number
  
  // Efficienza energetica
  energyClass?: string
  
  // Media
  images: string[]
  virtualTour?: string
  floorPlan?: string
  
  // Metadati
  reference?: string
  notes?: string
  portalTargets: string[]
  isPublished: boolean
  publishedAt?: string
  
  // Relazioni
  agencyId: string
  agency: Agency
  ownerId: string
  owner: User
}

export interface Contact extends BaseEntity {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  type: ContactType
  
  // Dati aggiuntivi
  address?: string
  city?: string
  province?: string
  zipCode?: string
  birthDate?: string
  birthPlace?: string
  fiscalCode?: string
  notes?: string
  budget?: number
  preferences?: string
  requestApartmentType?: string
  requestPropertyType?: string
  requestGoal?: 'SALE' | 'RENT' | 'VACATION'
  requestZone?: string
  requestSurfaceSqm?: number
  rentContractSubtype?: 'TRANSITORIO' | '3+2' | '4+4'
  requestBedrooms?: number
  requestBathrooms?: number
  requestFloor?: number
  
  // Privacy GDPR
  privacyConsent: boolean
  marketingConsent: boolean
  consentDate?: string
  
  // Metadati
  source?: string
  tags: string[]
  isActive: boolean
  
  // Relazioni
  agencyId: string
  agency: Agency
  assignedToId?: string
  assignedTo?: User
}

export interface Request extends BaseEntity {
  title: string
  description?: string
  type: PropertyType
  contractType: ContractType
  status: RequestStatus
  
  // Criteri di ricerca
  minPrice?: number
  maxPrice?: number
  minSurface?: number
  maxSurface?: number
  minRooms?: number
  maxRooms?: number
  minBathrooms?: number
  maxBathrooms?: number
  minFloor?: number
  maxFloor?: number
  cities: string[]
  provinces: string[]
  
  // Caratteristiche desiderate
  elevator?: boolean
  parking?: boolean
  garden?: boolean
  terrace?: boolean
  furnished?: boolean
  apartmentSubtype?: string
  
  // Metadati
  priority: number
  notes?: string
  expiresAt?: string
  
  // Relazioni
  agencyId: string
  agency: Agency
  contactId: string
  contact: Contact
  assignedToId?: string
  assignedTo?: User
}

export interface Appointment extends BaseEntity {
  title: string
  description?: string
  startTime: string
  endTime: string
  location?: string
  status: AppointmentStatus
  
  // Metadati
  notes?: string
  reminder: boolean
  reminderSent: boolean
  
  // Relazioni
  agencyId: string
  agency: Agency
  assignedToId: string
  assignedTo: User
  createdById?: string
  participantIds?: string[]
  assignedAgents?: string[]
  participants?: Array<Partial<User> & { id: string; name?: string }>
  contactId?: string
  contact?: Contact
  propertyId?: string
  property?: Property
}

export interface Activity extends BaseEntity {
  type: ActivityType
  typeLabel?: string
  title: string
  description?: string
  completed: boolean
  dueDate?: string
  completedAt?: string
  report?: string
  
  // Metadati
  priority: number
  tags: string[]
  
  // Relazioni
  agencyId: string
  agency: Agency
  assignedToId: string
  assignedTo: User
  contactId?: string
  contact?: Contact
  propertyId?: string
  property?: Property
  requestId?: string
  request?: Request
}

export interface PortalConfig extends BaseEntity {
  portalId: string
  agencyId: string
  type: PortalConfigType
  status: PortalConfigStatus
  active: boolean
  settings?: any
}

export interface PortalLog {
  id: string
  portalId: string
  operation: string
  status: string
  message?: string
  createdAt: string
}

// Tipi per API responses
export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Tipi per form
export interface LoginForm {
  email: string
  password: string
}

export interface PropertyForm {
  title: string
  description?: string
  type: PropertyType
  contractType: ContractType
  address: string
  city: string
  province: string
  zipCode: string
  rooms?: number
  bedrooms?: number
  bathrooms?: number
  surface?: number
  salePrice?: number
  rentPrice?: number
  energyClass?: string
  notes?: string
}

export interface ContactForm {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  type: ContactType
  address?: string
  city?: string
  province?: string
  zipCode?: string
  birthDate?: string
  birthPlace?: string
  fiscalCode?: string
  notes?: string
  privacyConsent: boolean
  marketingConsent: boolean
}

// Tipi per filtri
export interface PropertyFilters {
  type?: PropertyType
  contractType?: ContractType
  status?: PropertyStatus
  city?: string
  province?: string
  minPrice?: number
  maxPrice?: number
  minSurface?: number
  maxSurface?: number
  rooms?: number
  bedrooms?: number
}

export interface ContactFilters {
  type?: ContactType
  city?: string
  province?: string
  assignedToId?: string
  tags?: string[]
}

// Tipi per dashboard
export interface DashboardStats {
  totalProperties: number
  availableProperties: number
  soldProperties: number
  rentedProperties: number
  totalContacts: number
  activeRequests: number
  todayAppointments: number
  thisMonthActivities: number
}

export interface ChartData {
  name: string
  value: number
  color?: string
} 

