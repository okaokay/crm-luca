
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, Pencil, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type AgentSummary = { id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean }
type AgentZoneTasksPageProps = {
  agents: AgentSummary[]
  onRefreshGlobalData?: () => Promise<void> | void
}
type GeoRow = { region: string; province: string; city: string; zone: string }
type CapCatalog = { cap: string; city: string; province: string; region: string; streetCount: number }
type CapGroup = { groupIndex: number; groupName: string; streetCount: number; assigned: { agentId: string; agentName: string } | null }
type CapSummary = {
  cap: string
  streetCount: number
  zoneId: string | null
  groups: Array<{
    groupIndex: number
    groupName: string
    streetCount: number
    assigned: { agentId: string; agentName: string } | null
    handoverCount?: number
    hasHandover?: boolean
  }>
}
type ZoneDetails = {
  id: string
  region: string
  province: string
  city: string
  zone?: string
  assignments: Array<{
    id: string
    assignmentType: 'GROUP' | 'STREET'
    group?: { id: string; name: string; groupIndex: number; members?: Array<{ street: { id: string; name: string } }> } | null
    street?: { id: string; name: string } | null
  }>
}
type Workspace = {
  zoneId: string | null
  groupId?: string
  cap: string
  groupIndex: number
  groupName: string
  canWrite?: boolean
  streets: string[]
  streetItems?: Array<{ id: string; name: string }>
  assignmentHistory: Array<{ id: string; isActive: boolean; note: string | null; assignedAt: string; endedAt: string | null; agent: { id: string; firstName: string; lastName: string; email: string } }>
  logs: Array<{ id: string; entryType: 'NOTE' | 'STATUS' | 'STATISTICS' | 'HANDOVER'; title: string | null; content: string; metadata?: any; createdAt: string; createdBy: { id: string; firstName: string; lastName: string } }>
}
type WorkspaceCtx = { cap: string; groupIndex: number; region: string; province: string; city: string }
type StreetCtx = WorkspaceCtx & { streetId: string; streetName: string }
type StreetWorkspace = {
  cap: string
  groupName: string
  groupIndex: number
  street: { id: string; name: string }
  canWrite?: boolean
  assignmentHistory: Array<{ id: string; isActive: boolean; assignedAt: string; endedAt: string | null; agent: { firstName: string; lastName: string } }>
  logs: Array<{ id: string; entryType: string; title: string | null; content: string; metadata?: any; createdAt: string; createdBy: { firstName: string; lastName: string } }>
}
type StreetMarketInsights = {
  street: { id: string; name: string }
  cap: string
  sourceUrl: string | null
  marketTitle: string | null
  avgPricePerSqm: string | null
  avgRangeText: string | null
  trendSummary: string | null
  trendLongTerm: string | null
  cityAverageTitle: string | null
  houseSummary: string | null
  apartmentSummary: string | null
  lat: number | null
  lng: number | null
  geomCoordinates?: number[][][] | null
  fetchedAt: string | null
}

type StreetListing = {
  id: string
  sourceListingId: string
  listingUrl: string
  title: string | null
  priceText: string | null
  surfaceText: string | null
  roomsText: string | null
  floorText: string | null
  agencyName: string | null
  mainImageUrl: string | null
  listingStatus: 'NEW' | 'IN_PROGRESS' | 'CONTACTED' | 'VISIT_BOOKED' | 'CLOSED' | 'DISMISSED'
  lastSeenAt: string
  updatedAt: string
}

type StreetListingSnapshot = {
  id: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  warning: string | null
  fetchedAt: string
  expiresAt: string
}

type StreetListingDetail = {
  canWrite: boolean
  listing: {
    id: string
    sourceListingId: string
    listingUrl: string
    title: string | null
    priceText: string | null
    surfaceText: string | null
    roomsText: string | null
    floorText: string | null
    description: string | null
    energyClass: string | null
    addressText: string | null
    agencyName: string | null
    phoneVisible: string | null
    mainImageUrl: string | null
    listingStatus: 'NEW' | 'IN_PROGRESS' | 'CONTACTED' | 'VISIT_BOOKED' | 'CLOSED' | 'DISMISSED'
    lastSeenAt: string
    updatedAt: string
    zone: { id: string; region: string; province: string; city: string; zone: string | null }
    group: { id: string; groupIndex: number; name: string } | null
    street: { id: string; name: string }
  }
  actions: Array<{
    id: string
    actionType: 'CALL' | 'VISIT_SET' | 'RECALL' | 'NOTE' | 'STATUS' | 'HANDOVER'
    title: string | null
    content: string
    outcome: string | null
    nextActionAt: string | null
    metadata?: any
    createdAt: string
    createdBy: { id?: string; firstName: string; lastName: string; email: string }
  }>
  assignmentHistory: Array<{
    id: string
    assignedAt: string
    note: string | null
    fromAgent: { firstName: string; lastName: string; email: string } | null
    toAgent: { firstName: string; lastName: string; email: string }
  }>
}

type GroupOverview = {
  dailyListings: Array<{
    id: string
    sourceListingId: string
    title: string | null
    priceText: string | null
    surfaceText: string | null
    roomsText: string | null
    mainImageUrl: string | null
    listingUrl: string
    street: { id: string; name: string } | null
    firstSeenAt: string
  }>
  mapPoints: Array<{
    streetId: string
    streetName: string
    lat: number
    lng: number
    geomCoordinates?: number[][][] | null
  }>
  center: { lat: number; lng: number } | null
}

type ZoneClientForm = {
  firstName: string
  lastName: string
  phone: string
  email: string
  type: 'SELLER' | 'LEAD'
  note: string
}

type ZoneClientRecordForm = {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  city: string
  province: string
  zipCode: string
  type: 'SELLER' | 'LEAD'
  note: string
}
type DynamicZoneGroup = {
  zoneId: string
  groupId: string
  city: string
  province: string
  region: string
  zoneName: string
  groupName: string
  streets: Array<{ id: string; name: string }>
  activeAssignment: { assignmentId: string; agentId: string; agentName: string } | null
}

type DynamicGroupWorkspace = {
  zoneId: string
  groupId: string
  groupName: string
  groupIndex: number
  city: string
  province: string
  region: string
  zoneName: string
  canWrite: boolean
  streets: Array<{ id: string; name: string }>
  logs: Array<{
    id: string
    entryType: string
    title: string | null
    content: string
    metadata?: any
    createdAt: string
    createdBy: { id: string; firstName: string; lastName: string; email: string }
  }>
}

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString('it-IT') : '-')
const capFromZone = (zone?: string) => (String(zone || '').match(/^CAP\s+(\d{5})$/i)?.[1] || '')
const buildZoneImageMetadata = (photoDataUrl?: string | null) => {
  const clean = String(photoDataUrl || '').trim()
  if (!clean) return { photoDataUrl: null as string | null, attachments: [] as Array<{ type: 'image'; dataUrl: string; label: string }> }
  return {
    photoDataUrl: clean,
    attachments: [{ type: 'image' as const, dataUrl: clean, label: 'Foto zona' }]
  }
}
const getZonePrimaryPhoto = (metadata?: any) => {
  const fromAttachment = Array.isArray(metadata?.attachments)
    ? String(metadata.attachments.find((a: any) => a && typeof a.dataUrl === 'string' && String(a.dataUrl).trim())?.dataUrl || '').trim()
    : ''
  if (fromAttachment) return fromAttachment
  const legacy = String(metadata?.photoDataUrl || '').trim()
  return legacy || null
}
const csvEsc = (v: unknown) => {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
const ZONE_KIND_LABELS: Record<string, string> = {
  ZONE_NOTE: 'Nota di zona',
  ZONE_SIGN: 'Cartello di zona',
  ZONE_PROPERTY: 'Immobile di zona',
  ZONE_CLIENT: 'Cliente di zona',
  ZONE_CLIENT_RECORD: 'Scheda cliente di zona',
  ZONE_CLIENT_RECORD_UPDATE: 'Aggiornamento scheda cliente',
  ZONE_CLIENT_RECORD_NOTE: 'Nota su scheda cliente',
  ZONE_SIGN_ACTION: 'Azione su cartello'
}
const zoneKindLabel = (kind?: string | null) => {
  const key = String(kind || '').trim()
  return ZONE_KIND_LABELS[key] || key || 'Altro'
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: '10px',
  padding: '10px 12px',
  background: '#fff'
}

const btnPrimary: React.CSSProperties = {
  border: 'none',
  borderRadius: '10px',
  padding: '11px 14px',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer'
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 2500,
  padding: '16px'
}

const modalCardStyle: React.CSSProperties = {
  width: 'min(680px, 96vw)',
  maxHeight: '90vh',
  overflowY: 'auto',
  background: '#ffffff',
  border: '1px solid #dbe3ef',
  borderRadius: '14px',
  boxShadow: '0 16px 44px rgba(15,23,42,0.2)',
  padding: '16px',
  display: 'grid',
  gap: '10px'
}

const normalizeGeomLine = (line: unknown): [number, number][] => {
  if (!Array.isArray(line)) return []
  const points: [number, number][] = []
  for (const item of line) {
    if (Array.isArray(item) && item.length >= 2) {
      const lng = Number(item[0])
      const lat = Number(item[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push([lat, lng])
      }
    }
  }
  return points
}

const extractGeomLatLngGroups = (geomCoordinates?: number[][][] | null): [number, number][][] => {
  if (!Array.isArray(geomCoordinates)) return []
  const first = geomCoordinates[0] as unknown

  if (Array.isArray(first) && first.length > 0 && Array.isArray((first as unknown[])[0])) {
    const nestedFirst = (first as unknown[])[0]
    if (Array.isArray(nestedFirst) && Array.isArray((nestedFirst as unknown[])[0])) {
      // MultiLineString-like [[ [lng,lat], ... ], [ ... ]]
      return (geomCoordinates as unknown[])
        .map((line) => normalizeGeomLine(line))
        .filter((line) => line.length > 1)
    }
    // LineString-like [ [lng,lat], ... ]
    const single = normalizeGeomLine(geomCoordinates as unknown)
    return single.length > 1 ? [single] : []
  }

  // Point-like [lng,lat] -> no line
  return []
}

const deriveCenterFromGeom = (geomCoordinates?: number[][][] | null): [number, number] | null => {
  if (!Array.isArray(geomCoordinates)) return null
  const flat: [number, number][] = []
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const lng = Number(value[0])
      const lat = Number(value[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) flat.push([lat, lng])
      return
    }
    for (const next of value) walk(next)
  }
  walk(geomCoordinates)
  if (flat.length === 0) return null
  const [latSum, lngSum] = flat.reduce<[number, number]>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
  return [latSum / flat.length, lngSum / flat.length]
}

function StreetMap({
  lat,
  lng,
  geomCoordinates
}: {
  lat: number
  lng: number
  geomCoordinates?: number[][][] | null
}) {
  const id = useMemo(() => `street-map-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    const container = document.getElementById(id)
    if (!container) return
    const map = L.map(container, { zoomControl: true }).setView([lat, lng], 16)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    if (Array.isArray(geomCoordinates) && geomCoordinates.length > 0) {
      const latLngGroups = extractGeomLatLngGroups(geomCoordinates)
      if (latLngGroups.length > 0) {
        const poly = L.polyline(latLngGroups, { color: '#2563eb', weight: 6, opacity: 0.9 }).addTo(map)
        map.fitBounds(poly.getBounds(), { padding: [20, 20] })
      } else {
        L.circleMarker([lat, lng], { radius: 7, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9 }).addTo(map)
      }
    } else {
      L.circleMarker([lat, lng], { radius: 7, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9 }).addTo(map)
    }

    return () => {
      map.remove()
    }
  }, [id, lat, lng, geomCoordinates])

  return <div id={id} style={{ width: '100%', height: '340px', border: '1px solid #d1d5db', borderRadius: '10px' }} />
}

function GroupZoneMap({
  center,
  points
}: {
  center: { lat: number; lng: number } | null
  points: Array<{ streetName: string; lat: number; lng: number; geomCoordinates?: number[][][] | null }>
}) {
  const id = useMemo(() => `group-zone-map-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    const container = document.getElementById(id)
    if (!container || !center) return

    const map = L.map(container, { zoomControl: true }).setView([center.lat, center.lng], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    const bounds: [number, number][] = []
    points.forEach((p) => {
      const hasLine = Array.isArray(p.geomCoordinates) && p.geomCoordinates.length > 0
      if (hasLine) {
        const lineGroups = extractGeomLatLngGroups(p.geomCoordinates)
        if (lineGroups.length > 0) {
          const poly = L.polyline(lineGroups, { color: '#2563eb', weight: 4, opacity: 0.75 }).addTo(map)
          poly.bindPopup(p.streetName)
          lineGroups.flat().forEach((v) => bounds.push(v))
          return
        }
      }
      const marker = L.circleMarker([p.lat, p.lng], { radius: 5, color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.9 }).addTo(map)
      marker.bindPopup(p.streetName)
      bounds.push([p.lat, p.lng])
    })

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [24, 24] })
    }

    return () => {
      map.remove()
    }
  }, [id, center, points])

  if (!center) {
    return <div style={{ color: '#64748b' }}>Mappa zona non disponibile per questo gruppo.</div>
  }

  return <div id={id} style={{ width: '100%', height: '360px', border: '1px solid #d1d5db', borderRadius: '10px' }} />
}

export function AgentZoneTasksPage({ agents, onRefreshGlobalData }: AgentZoneTasksPageProps) {
  const { token, logout, user } = useAuthStore()
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'AGENCY_ADMIN'

  const [geo, setGeo] = useState<GeoRow[]>([])
  const [caps, setCaps] = useState<CapCatalog[]>([])
  const [groups, setGroups] = useState<CapGroup[]>([])
  const [summary, setSummary] = useState<CapSummary[]>([])
  const [zones, setZones] = useState<AgentZone[]>([])
  const [zoneDetails, setZoneDetails] = useState<Record<string, ZoneDetails>>({})
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [agentFilter, setAgentFilter] = useState('ALL')
  const [handoverOnly, setHandoverOnly] = useState(false)
  const [wsCtx, setWsCtx] = useState<WorkspaceCtx | null>(null)
  const [ws, setWs] = useState<Workspace | null>(null)
  const [wsLoading, setWsLoading] = useState(false)
  const [logForm, setLogForm] = useState({ entryType: 'NOTE', title: '', content: '' })
  const [closingAssignmentId, setClosingAssignmentId] = useState<string | null>(null)
  const [reassignModal, setReassignModal] = useState<{ assignmentId: string; open: boolean }>({ assignmentId: '', open: false })
  const [reassignAgentId, setReassignAgentId] = useState('')
  const [groupPage, setGroupPage] = useState<{ mode: 'list' | 'history' | 'operational' | 'notes_archive' | 'clients_archive' | 'add_zone_info_menu' | 'add_zone_sign' | 'add_zone_property' | 'add_zone_client' | 'add_zone_note' | 'zone_log' | 'zone_clients_registry' | 'zone_client_detail' | 'zone_sign_detail' | 'zone_property_detail'; assignmentId: string | null }>({
    mode: 'list',
    assignmentId: null
  })
  const [zoneSignDetailId, setZoneSignDetailId] = useState<string | null>(null)
  const [zonePropertyDetailId, setZonePropertyDetailId] = useState<string | null>(null)
  const [zoneClientDetailId, setZoneClientDetailId] = useState<string | null>(null)
  const [streetCtx, setStreetCtx] = useState<StreetCtx | null>(null)
  const [streetWs, setStreetWs] = useState<StreetWorkspace | null>(null)
  const [streetLoading, setStreetLoading] = useState(false)
  const [streetInsights, setStreetInsights] = useState<StreetMarketInsights | null>(null)
  const [streetInsightsLoading, setStreetInsightsLoading] = useState(false)
  const [streetLogForm, setStreetLogForm] = useState({ entryType: 'NOTE', title: '', content: '' })
  const [streetListings, setStreetListings] = useState<StreetListing[]>([])
  const [streetListingsSnapshot, setStreetListingsSnapshot] = useState<StreetListingSnapshot | null>(null)
  const [streetListingsLoading, setStreetListingsLoading] = useState(false)
  const [streetListingsWarning, setStreetListingsWarning] = useState<string | null>(null)
  const [manualStreetListingMap, setManualStreetListingMap] = useState<Record<string, string>>({})
  const [listingCtx, setListingCtx] = useState<{ listingId: string } | null>(null)
  const [listingDetail, setListingDetail] = useState<StreetListingDetail | null>(null)
  const [listingDetailLoading, setListingDetailLoading] = useState(false)
  const [listingActionForm, setListingActionForm] = useState({
    actionType: 'NOTE',
    title: '',
    content: '',
    outcome: '',
    nextActionAt: ''
  })
  const [listingStatusSaving, setListingStatusSaving] = useState(false)
  const [zoneSignActionForm, setZoneSignActionForm] = useState({
    actionType: 'NOTE',
    title: '',
    content: '',
    outcome: '',
    nextActionAt: ''
  })
  const [zoneSignActionSaving, setZoneSignActionSaving] = useState(false)
  const [zoneSignStatusSaving, setZoneSignStatusSaving] = useState(false)
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const [groupOverview, setGroupOverview] = useState<GroupOverview | null>(null)
  const [groupOverviewLoading, setGroupOverviewLoading] = useState(false)
  const [dailySlideIndex, setDailySlideIndex] = useState(0)
  const [zoneNoteForm, setZoneNoteForm] = useState({ title: '', content: '', streetId: '', photoDataUrl: '' })
  const [zoneLogKeyword, setZoneLogKeyword] = useState('')
  const [zoneLogStreetFilter, setZoneLogStreetFilter] = useState('ALL')
  const [megaGridKeyword, setMegaGridKeyword] = useState('')
  const [megaGridKindFilter, setMegaGridKindFilter] = useState('ALL')
  const [megaGridStreetFilter, setMegaGridStreetFilter] = useState('ALL')
  const [megaGridAuthorFilter, setMegaGridAuthorFilter] = useState('ALL')
  const [megaGridContactTypeFilter, setMegaGridContactTypeFilter] = useState('ALL')
  const [megaGridWithPhoto, setMegaGridWithPhoto] = useState('ALL')
  const [megaGridDateFrom, setMegaGridDateFrom] = useState('')
  const [megaGridDateTo, setMegaGridDateTo] = useState('')
  const [megaGridSort, setMegaGridSort] = useState<'DESC' | 'ASC'>('DESC')
  const [zoneClientForm, setZoneClientForm] = useState<ZoneClientForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    type: 'SELLER',
    note: ''
  })
  const [zoneSignForm, setZoneSignForm] = useState({
    streetId: '',
    customStreetName: '',
    civicNumber: '',
    ownerFullName: '',
    phone: '',
    apartmentFeatures: '',
    note: '',
    photoDataUrl: ''
  })
  const [zonePropertyForm, setZonePropertyForm] = useState({
    streetId: '',
    customStreetName: '',
    civicNumber: '',
    ownerFullName: '',
    phone: '',
    apartmentFeatures: '',
    note: '',
    photoDataUrl: ''
  })
  const [zoneClientRecordForm, setZoneClientRecordForm] = useState<ZoneClientRecordForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    zipCode: '',
    type: 'SELLER',
    note: ''
  })
  const [zoneClientRecordEditForm, setZoneClientRecordEditForm] = useState<ZoneClientRecordForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    zipCode: '',
    type: 'SELLER',
    note: ''
  })
  const [zoneClientRecordNote, setZoneClientRecordNote] = useState('')

  const [f, setF] = useState({ agentId: '', region: '', province: '', city: '', cap: '', groupIndex: '' })
  const hideGroupOperationalLegacyBlocks = true
  const [dynamicGroups, setDynamicGroups] = useState<DynamicZoneGroup[]>([])
  const [dynamicLoading, setDynamicLoading] = useState(false)
  const [dynamicCityFilter, setDynamicCityFilter] = useState('')
  const [dynamicKeyword, setDynamicKeyword] = useState('')
  const [dynamicTypeFilter, setDynamicTypeFilter] = useState('')
  const [dynamicAuthorFilter, setDynamicAuthorFilter] = useState('')
  const [dynamicContactTypeFilter, setDynamicContactTypeFilter] = useState('')
  const [dynamicPhotoFilter, setDynamicPhotoFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL')
  const [dynamicDateFromFilter, setDynamicDateFromFilter] = useState('')
  const [dynamicDateToFilter, setDynamicDateToFilter] = useState('')
  const [dynamicOrderBy, setDynamicOrderBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'TYPE_ASC' | 'AUTHOR_ASC'>('DATE_DESC')
  const [showDynamicCreateModal, setShowDynamicCreateModal] = useState(false)
  const [showDynamicImportModal, setShowDynamicImportModal] = useState(false)
  const [dynamicImportMode, setDynamicImportMode] = useState<'APPEND' | 'UPSERT'>('APPEND')
  const [dynamicImportFile, setDynamicImportFile] = useState<File | null>(null)
  const [dynamicImporting, setDynamicImporting] = useState(false)
  const [dynamicImportReport, setDynamicImportReport] = useState<any | null>(null)
  const [dynamicCreateForm, setDynamicCreateForm] = useState({
    city: '',
    zoneName: '',
    groupName: '',
    streets: ['']
  })
  const [dynamicSelectedGroupId, setDynamicSelectedGroupId] = useState<string | null>(null)
  const [dynamicWorkspace, setDynamicWorkspace] = useState<DynamicGroupWorkspace | null>(null)
  const [dynamicWorkspaceLoading, setDynamicWorkspaceLoading] = useState(false)
  const [dynamicSelectedStreetId, setDynamicSelectedStreetId] = useState<string | null>(null)
  const [streetMenuOpenId, setStreetMenuOpenId] = useState<string | null>(null)
  const [dynamicClosingAssignmentId, setDynamicClosingAssignmentId] = useState<string | null>(null)
  const [dynamicReassignModal, setDynamicReassignModal] = useState<{ open: boolean; zoneId: string; groupId: string; assignmentId: string; groupName: string }>({
    open: false, zoneId: '', groupId: '', assignmentId: '', groupName: ''
  })
  const [dynamicReassignAgentId, setDynamicReassignAgentId] = useState('')
  const [dynamicAssignModal, setDynamicAssignModal] = useState<{ open: boolean; zoneId: string; groupId: string; groupName: string }>({
    open: false, zoneId: '', groupId: '', groupName: ''
  })
  const [dynamicAssignAgentId, setDynamicAssignAgentId] = useState('')
  const [dynamicDeletingGroupId, setDynamicDeletingGroupId] = useState<string | null>(null)
  const [dynamicCreateTargetZone, setDynamicCreateTargetZone] = useState<{ zoneId: string; city: string; zoneName: string } | null>(null)
  const [dynamicEditModal, setDynamicEditModal] = useState<{
    open: boolean
    zoneId: string
    groupId: string
    groupName: string
    existingStreets: Array<{ id: string; name: string }>
  }>({ open: false, zoneId: '', groupId: '', groupName: '', existingStreets: [] })
  const [dynamicEditNewStreets, setDynamicEditNewStreets] = useState<string[]>([''])
  const [dynamicEditRemovedStreetIds, setDynamicEditRemovedStreetIds] = useState<string[]>([])
  const [dynamicEditSaving, setDynamicEditSaving] = useState(false)
  const [zoneQuickModal, setZoneQuickModal] = useState<{
    open: boolean
    kind: 'ZONE_SIGN' | 'ZONE_PROPERTY' | 'ZONE_CLIENT' | 'ZONE_NOTE' | null
    title: string
    content: string
    fullName: string
    phone: string
    email: string
    address: string
    contactType: string
  }>({
    open: false,
    kind: null,
    title: '',
    content: '',
    fullName: '',
    phone: '',
    email: '',
    address: '',
    contactType: ''
  })

  const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const h = token ? { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } : init.headers
    const res = await fetch(input, { ...init, headers: h, credentials: 'include' })
    if (res.status === 401) {
      logout(); window.location.href = '/login'; throw new Error('Unauthorized')
    }
    return res
  }

  const parseJsonSafe = async (res: Response) => {
    const text = await res.text()
    try {
      return { ok: true as const, data: JSON.parse(text) }
    } catch {
      return { ok: false as const, raw: text }
    }
  }

  const loadDynamicGroups = async (params?: { city?: string; q?: string }) => {
    setDynamicLoading(true)
    try {
      const query = new URLSearchParams()
      const city = String(params?.city ?? dynamicCityFilter).trim()
      const qValue = String(params?.q ?? dynamicKeyword).trim()
      if (city) query.set('city', city)
      if (qValue) query.set('q', qValue)
      const response = await authFetch(`/api/agent-zones/dynamic-groups${query.toString() ? `?${query.toString()}` : ''}`)
      const parsed = await parseJsonSafe(response)
      if (parsed.ok && parsed.data?.success && Array.isArray(parsed.data.data)) {
        setDynamicGroups(parsed.data.data)
      } else {
        setDynamicGroups([])
      }
    } catch {
      setDynamicGroups([])
    } finally {
      setDynamicLoading(false)
    }
  }

  const openDynamicGroupWorkspace = async (groupId: string) => {
    setDynamicSelectedStreetId(null)
    setStreetMenuOpenId(null)
    setDynamicSelectedGroupId(groupId)
    setDynamicWorkspaceLoading(true)
    try {
      const response = await authFetch(`/api/agent-zones/dynamic-groups/${encodeURIComponent(groupId)}/workspace`)
      const parsed = await parseJsonSafe(response)
      if (parsed.ok && parsed.data?.success) {
        setDynamicWorkspace(parsed.data.data)
      } else {
        setDynamicWorkspace(null)
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore apertura gruppo dinamico') : 'Errore apertura gruppo dinamico')
      }
    } catch {
      setDynamicWorkspace(null)
      setMsg('Errore apertura gruppo dinamico')
    } finally {
      setDynamicWorkspaceLoading(false)
    }
  }

  const createDynamicGroup = async () => {
    const city = String(dynamicCreateForm.city || '').trim()
    const zoneName = String(dynamicCreateForm.zoneName || '').trim()
    const groupName = String(dynamicCreateForm.groupName || '').trim()
    const streets = dynamicCreateForm.streets.map((s) => String(s || '').trim()).filter(Boolean)
    if (!groupName || streets.length === 0) {
      setMsg('Compila nome gruppo e almeno una via')
      return
    }
    if (!dynamicCreateTargetZone && (!city || !zoneName)) {
      setMsg('Compila citt�, nome zona, nome gruppo e almeno una via')
      return
    }
    try {
      const response = await authFetch('/api/agent-zones/dynamic-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dynamicCreateTargetZone
          ? { zoneId: dynamicCreateTargetZone.zoneId, groupName, streets }
          : { city, zoneName, groupName, streets })
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore creazione gruppo') : 'Errore creazione gruppo')
        return
      }
      setShowDynamicCreateModal(false)
      setDynamicCreateForm({ city: '', zoneName: '', groupName: '', streets: [''] })
      setDynamicCreateTargetZone(null)
      await loadDynamicGroups()
      setMsg('Gruppo zona creato')
    } catch {
      setMsg('Errore creazione gruppo')
    }
  }

  const downloadDynamicCsvTemplate = async () => {
    try {
      const response = await authFetch('/api/agent-zones/dynamic-groups/import-template')
      if (!response.ok) {
        setMsg('Errore download template CSV')
        return
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'template-import-zone.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setMsg('Errore download template CSV')
    }
  }

  const downloadDynamicCsvExample = async () => {
    try {
      const response = await authFetch('/api/agent-zones/dynamic-groups/import-template-example')
      if (!response.ok) {
        setMsg('Errore download esempio CSV')
        return
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'esempio-import-zone.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setMsg('Errore download esempio CSV')
    }
  }

  const downloadDynamicImportErrorsCsv = () => {
    const rejected = Array.isArray(dynamicImportReport?.rejectedRows) ? dynamicImportReport.rejectedRows : []
    if (!rejected.length) {
      setMsg('Nessuna riga scartata da esportare')
      return
    }
    const lines = ['line,reason,raw']
    for (const row of rejected) {
      const line = String(row?.line ?? '')
      const reason = String(row?.reason ?? '').replace(/"/g, '""')
      const raw = String(row?.raw ?? '').replace(/"/g, '""')
      lines.push(`${line},"${reason}","${raw}"`)
    }
    const csv = `\uFEFF${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-zone-righe-scartate.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const importDynamicGroupsCsv = async () => {
    if (!dynamicImportFile) {
      setMsg('Seleziona un file CSV da importare')
      return
    }
    const form = new FormData()
    form.append('file', dynamicImportFile)
    form.append('mode', dynamicImportMode)
    setDynamicImporting(true)
    try {
      const response = await authFetch('/api/agent-zones/dynamic-groups/import', {
        method: 'POST',
        body: form
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore import CSV zone') : 'Errore import CSV zone')
        return
      }
      setDynamicImportReport(parsed.data?.data || null)
      await loadDynamicGroups()
      setMsg('Import zone completato')
    } catch {
      setMsg('Errore import CSV zone')
    } finally {
      setDynamicImporting(false)
    }
  }

  const saveDynamicZoneLog = async (payload: { title: string; content: string; metadata?: any; entryType?: string }) => {
    if (!dynamicWorkspace) return false
    const content = String(payload.content || '').trim()
    if (!content) return false
    const response = await authFetch(`/api/agent-zones/dynamic-groups/${encodeURIComponent(dynamicWorkspace.groupId)}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: payload.entryType || 'NOTE',
        title: String(payload.title || '').trim(),
        content,
        metadata: payload.metadata || null
      })
    })
    const parsed = await parseJsonSafe(response)
    if (!parsed.ok || !parsed.data?.success) {
      setMsg(parsed.ok ? (parsed.data?.message || 'Errore salvataggio informazione zona') : 'Errore salvataggio informazione zona')
      return false
    }
    await openDynamicGroupWorkspace(dynamicWorkspace.groupId)
    return true
  }

  const moveDynamicStreet = async (streetId: string, targetGroupId: string) => {
    if (!targetGroupId) return
    const response = await authFetch(`/api/agent-zones/dynamic-groups/streets/${encodeURIComponent(streetId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetGroupId })
    })
    const parsed = await parseJsonSafe(response)
    if (!parsed.ok || !parsed.data?.success) {
      setMsg(parsed.ok ? (parsed.data?.message || 'Errore spostamento via') : 'Errore spostamento via')
      return
    }
    setStreetMenuOpenId(null)
    await loadDynamicGroups()
    if (dynamicWorkspace) await openDynamicGroupWorkspace(dynamicWorkspace.groupId)
    setMsg('Via spostata')
  }

  const renameDynamicStreet = async (streetId: string, currentName: string) => {
    const nextName = window.prompt('Nuovo nome via', currentName)
    if (!nextName || !nextName.trim()) return
    const response = await authFetch(`/api/agent-zones/dynamic-groups/streets/${encodeURIComponent(streetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName })
    })
    const parsed = await parseJsonSafe(response)
    if (!parsed.ok || !parsed.data?.success) {
      setMsg(parsed.ok ? (parsed.data?.message || 'Errore modifica via') : 'Errore modifica via')
      return
    }
    setStreetMenuOpenId(null)
    await loadDynamicGroups()
    if (dynamicWorkspace) await openDynamicGroupWorkspace(dynamicWorkspace.groupId)
    setMsg('Via modificata')
  }

  const deleteDynamicStreet = async (streetId: string, streetName: string) => {
    if (!window.confirm(`Eliminare la via "${streetName}"?`)) return
    const response = await authFetch(`/api/agent-zones/dynamic-groups/streets/${encodeURIComponent(streetId)}`, {
      method: 'DELETE'
    })
    const parsed = await parseJsonSafe(response)
    if (!parsed.ok || !parsed.data?.success) {
      setMsg(parsed.ok ? (parsed.data?.message || 'Errore eliminazione via') : 'Errore eliminazione via')
      return
    }
    setStreetMenuOpenId(null)
    if (dynamicSelectedStreetId === streetId) setDynamicSelectedStreetId(null)
    await loadDynamicGroups()
    if (dynamicWorkspace) await openDynamicGroupWorkspace(dynamicWorkspace.groupId)
    setMsg('Via eliminata')
  }

  const closeDynamicGroupAndArchive = async (assignmentId: string) => {
    if (!assignmentId) return
    if (!window.confirm('Confermi chiusura e archiviazione del gruppo?')) return
    setDynamicClosingAssignmentId(assignmentId)
    try {
      const response = await authFetch('/api/agent-zones/group-workspace/close-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, note: 'Chiuso e archiviato da admin (gruppo dinamico)' })
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore chiusura gruppo') : 'Errore chiusura gruppo')
        return
      }
      await loadDynamicGroups()
      if (dynamicWorkspace?.groupId && dynamicSelectedGroupId && dynamicWorkspace.groupId === dynamicSelectedGroupId) {
        await openDynamicGroupWorkspace(dynamicWorkspace.groupId)
      }
      setMsg('Gruppo chiuso e archiviato')
    } catch {
      setMsg('Errore chiusura gruppo')
    } finally {
      setDynamicClosingAssignmentId(null)
    }
  }

  const closeArchiveAndReassignDynamicGroup = async () => {
    if (!dynamicReassignModal.open || !dynamicReassignModal.assignmentId || !dynamicReassignModal.zoneId || !dynamicReassignModal.groupId || !dynamicReassignAgentId) return
    setDynamicClosingAssignmentId(dynamicReassignModal.assignmentId)
    try {
      const closeResponse = await authFetch('/api/agent-zones/group-workspace/close-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: dynamicReassignModal.assignmentId, note: 'Chiuso e riassegnato da admin (gruppo dinamico)' })
      })
      const closeParsed = await parseJsonSafe(closeResponse)
      if (!closeParsed.ok || !closeParsed.data?.success) {
        setMsg(closeParsed.ok ? (closeParsed.data?.message || 'Errore chiusura gruppo') : 'Errore chiusura gruppo')
        return
      }
      const assignResponse = await authFetch(`/api/agent-zones/${encodeURIComponent(dynamicReassignModal.zoneId)}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: dynamicReassignAgentId,
          assignmentType: 'GROUP',
          groupId: dynamicReassignModal.groupId,
          note: 'Riassegnazione da gruppo dinamico'
        })
      })
      const assignParsed = await parseJsonSafe(assignResponse)
      if (!assignParsed.ok || !assignParsed.data?.success) {
        setMsg(assignParsed.ok ? (assignParsed.data?.message || 'Errore riassegnazione gruppo') : 'Errore riassegnazione gruppo')
        return
      }
      setDynamicReassignModal({ open: false, zoneId: '', groupId: '', assignmentId: '', groupName: '' })
      setDynamicReassignAgentId('')
      await loadDynamicGroups()
      if (dynamicSelectedGroupId === dynamicReassignModal.groupId) await openDynamicGroupWorkspace(dynamicReassignModal.groupId)
      setMsg('Gruppo chiuso, archiviato e riassegnato')
    } catch {
      setMsg('Errore riassegnazione gruppo')
    } finally {
      setDynamicClosingAssignmentId(null)
    }
  }

  const assignDynamicGroup = async () => {
    if (!dynamicAssignModal.open || !dynamicAssignModal.zoneId || !dynamicAssignModal.groupId || !dynamicAssignAgentId) return
    try {
      const response = await authFetch(`/api/agent-zones/${encodeURIComponent(dynamicAssignModal.zoneId)}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: dynamicAssignAgentId,
          assignmentType: 'GROUP',
          groupId: dynamicAssignModal.groupId,
          note: 'Assegnazione gruppo dinamico da admin'
        })
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore assegnazione gruppo') : 'Errore assegnazione gruppo')
        return
      }
      setDynamicAssignModal({ open: false, zoneId: '', groupId: '', groupName: '' })
      setDynamicAssignAgentId('')
      await loadDynamicGroups()
      setMsg('Gruppo assegnato con successo')
    } catch {
      setMsg('Errore assegnazione gruppo')
    }
  }

  const deleteDynamicGroup = async (groupId: string, groupName: string) => {
    if (!groupId) return
    if (!window.confirm(`Eliminare completamente il gruppo "${groupName}" con tutte le sue vie e informazioni?`)) return
    setDynamicDeletingGroupId(groupId)
    try {
      const response = await authFetch(`/api/agent-zones/dynamic-groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE'
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore eliminazione gruppo') : 'Errore eliminazione gruppo')
        return
      }
      if (dynamicSelectedGroupId === groupId) {
        setDynamicSelectedGroupId(null)
        setDynamicWorkspace(null)
        setDynamicSelectedStreetId(null)
      }
      await loadDynamicGroups()
      setMsg('Gruppo eliminato con successo')
    } catch {
      setMsg('Errore eliminazione gruppo')
    } finally {
      setDynamicDeletingGroupId(null)
    }
  }

  const activeAgents = useMemo(() => agents.filter((a) => a.isActive && a.role === 'AGENT'), [agents])
  const dynamicZonesView = useMemo(() => {
    const sourceGroups = (() => {
      if (isAdmin) return dynamicGroups
      const currentAgentId = String(user?.id || '').trim()
      if (!currentAgentId) return [] as DynamicZoneGroup[]
      return dynamicGroups.filter((group) => String(group.activeAssignment?.agentId || '') === currentAgentId)
    })()
    const map = new Map<string, { zoneId: string; city: string; province: string; region: string; zoneName: string; groups: DynamicZoneGroup[] }>()
    for (const group of sourceGroups) {
      const key = String(group.zoneId)
      if (!map.has(key)) {
        map.set(key, {
          zoneId: key,
          city: group.city,
          province: group.province,
          region: group.region,
          zoneName: group.zoneName,
          groups: []
        })
      }
      map.get(key)!.groups.push(group)
    }
    return Array.from(map.values()).sort((a, b) => {
      const ka = `${a.city} ${a.zoneName}`.toLowerCase()
      const kb = `${b.city} ${b.zoneName}`.toLowerCase()
      return ka.localeCompare(kb, 'it')
    })
  }, [isAdmin, user?.id, dynamicGroups])

  const openDynamicAssignModal = (group: DynamicZoneGroup) => {
    setDynamicAssignModal({
      open: true,
      zoneId: group.zoneId,
      groupId: group.groupId,
      groupName: group.groupName
    })
    setDynamicAssignAgentId('')
  }

  const openDynamicEditModal = (group: DynamicZoneGroup) => {
    setDynamicEditModal({
      open: true,
      zoneId: group.zoneId,
      groupId: group.groupId,
      groupName: group.groupName,
      existingStreets: Array.isArray(group.streets) ? group.streets : []
    })
    setDynamicEditNewStreets([''])
    setDynamicEditRemovedStreetIds([])
  }

  const saveDynamicGroupEdit = async () => {
    if (!dynamicEditModal.open || !dynamicEditModal.groupId) return
    const cleanedGroupName = String(dynamicEditModal.groupName || '').trim()
    if (!cleanedGroupName) {
      setMsg('Il nome gruppo è obbligatorio')
      return
    }

    const newStreets = dynamicEditNewStreets
      .map((street) => String(street || '').trim())
      .filter(Boolean)

    setDynamicEditSaving(true)
    try {
      for (const streetId of dynamicEditRemovedStreetIds) {
        const deleteRes = await authFetch(`/api/agent-zones/dynamic-groups/streets/${encodeURIComponent(streetId)}`, {
          method: 'DELETE'
        })
        const deleteParsed = await parseJsonSafe(deleteRes)
        if (!deleteParsed.ok || !deleteParsed.data?.success) {
          setMsg(deleteParsed.ok ? (deleteParsed.data?.message || 'Errore rimozione via dal gruppo') : 'Errore rimozione via dal gruppo')
          return
        }
      }

      const response = await authFetch('/api/agent-zones/dynamic-groups/' + encodeURIComponent(dynamicEditModal.groupId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupName: cleanedGroupName,
          streets: newStreets
        })
      })
      const parsed = await parseJsonSafe(response)
      if (!parsed.ok || !parsed.data?.success) {
        setMsg(parsed.ok ? (parsed.data?.message || 'Errore modifica gruppo') : 'Errore modifica gruppo')
        return
      }

      const editedGroupId = dynamicEditModal.groupId
      setDynamicEditModal({ open: false, zoneId: '', groupId: '', groupName: '', existingStreets: [] })
      setDynamicEditNewStreets([''])
      setDynamicEditRemovedStreetIds([])
      await loadDynamicGroups()
      if (dynamicSelectedGroupId === editedGroupId) {
        await openDynamicGroupWorkspace(editedGroupId)
      }
      setMsg('Gruppo aggiornato con successo')
    } catch {
      setMsg('Errore modifica gruppo')
    } finally {
      setDynamicEditSaving(false)
    }
  }

  const openZoneQuickModal = (kind: 'ZONE_SIGN' | 'ZONE_PROPERTY' | 'ZONE_CLIENT' | 'ZONE_NOTE') => {
    if (!currentDynamicStreet) {
      setMsg('Seleziona una via per inserire informazioni puntuali')
      return
    }
    const baseTitle =
      kind === 'ZONE_SIGN'
        ? `Cartello zona - ${currentDynamicStreet.name}`
        : kind === 'ZONE_PROPERTY'
          ? `Immobile zona - ${currentDynamicStreet.name}`
          : kind === 'ZONE_CLIENT'
            ? `Cliente di zona - ${currentDynamicStreet.name}`
            : `Informazione zona - ${currentDynamicStreet.name}`
    setZoneQuickModal({
      open: true,
      kind,
      title: baseTitle,
      content: '',
      fullName: '',
      phone: '',
      email: '',
      address: '',
      contactType: kind === 'ZONE_CLIENT' ? 'LEAD' : ''
    })
  }

  const submitZoneQuickModal = async () => {
    if (!zoneQuickModal.kind || !currentDynamicStreet) return
    const content = String(zoneQuickModal.content || '').trim()
    if (!content) {
      setMsg('Inserisci il contenuto principale')
      return
    }
    if (zoneQuickModal.kind === 'ZONE_CLIENT' && !String(zoneQuickModal.fullName || '').trim()) {
      setMsg('Inserisci nome e cognome cliente')
      return
    }

    const metadata: Record<string, any> = {
      kind: zoneQuickModal.kind,
      streetId: currentDynamicStreet.id,
      streetName: currentDynamicStreet.name
    }
    if (zoneQuickModal.title.trim()) metadata.title = zoneQuickModal.title.trim()
    if (zoneQuickModal.fullName.trim()) metadata.fullName = zoneQuickModal.fullName.trim()
    if (zoneQuickModal.phone.trim()) metadata.phone = zoneQuickModal.phone.trim()
    if (zoneQuickModal.email.trim()) metadata.email = zoneQuickModal.email.trim()
    if (zoneQuickModal.address.trim()) metadata.address = zoneQuickModal.address.trim()
    if (zoneQuickModal.contactType.trim()) metadata.contactType = zoneQuickModal.contactType.trim()

    const entryType = zoneQuickModal.kind === 'ZONE_NOTE' ? 'NOTE' : 'STATUS'
    const ok = await saveDynamicZoneLog({
      entryType,
      title: zoneQuickModal.title.trim() || undefined,
      content,
      metadata
    })
    if (ok) {
      setZoneQuickModal({
        open: false,
        kind: null,
        title: '',
        content: '',
        fullName: '',
        phone: '',
        email: '',
        address: '',
        contactType: ''
      })
    }
  }
  // Desktop + tablet: 3 colonne affiancate. Solo mobile stretto va in colonna.
  const isMobileLayout = viewportWidth < 640
  const regions = useMemo(() => Array.from(new Set(geo.map((x) => x.region))).sort(), [geo])
  const provinces = useMemo(() => Array.from(new Set(geo.filter((x) => x.region === f.region).map((x) => x.province))).sort(), [geo, f.region])
  const cities = useMemo(() => Array.from(new Set(geo.filter((x) => x.region === f.region && x.province === f.province).map((x) => x.city))).sort(), [geo, f.region, f.province])
  const capOptions = useMemo(() => caps.filter((c) => c.region === f.region && c.province === f.province && c.city === f.city).sort((a, b) => a.cap.localeCompare(b.cap)), [caps, f.region, f.province, f.city])

  const filteredSummary = useMemo(() => {
    return summary.filter((item) => {
      const s = [item.cap, ...item.groups.map((g) => g.groupName), ...item.groups.map((g) => g.assigned?.agentName || '')].join(' ').toLowerCase()
      const mQ = !q || s.includes(q.toLowerCase())
      const mA = agentFilter === 'ALL' || item.groups.some((g) => g.assigned?.agentId === agentFilter)
      const mH = !handoverOnly || item.groups.some((g) => Boolean(g.hasHandover))
      return mQ && mA && mH
    })
  }, [summary, q, agentFilter, handoverOnly])

  const loadBase = async () => {
    try {
      const [g, c, z] = await Promise.all([authFetch('/api/geo/locations'), authFetch('/api/geo/pescara-caps'), authFetch('/api/agent-zones')])
      const gj = await parseJsonSafe(g)
      const cj = await parseJsonSafe(c)
      const zj = await parseJsonSafe(z)
      setGeo(gj.ok && gj.data?.success ? gj.data.data : [])
      setCaps(cj.ok && cj.data?.success ? cj.data.data : [])
      setZones(zj.ok && zj.data?.success ? zj.data.data : [])
      if ((gj.ok && gj.data?.success) && (cj.ok && cj.data?.success) && (zj.ok && zj.data?.success)) {
        setMsg('')
      } else if (!(zj.ok && zj.data?.success)) {
        setMsg('Impossibile caricare le zone assegnate al momento. Riprova tra qualche secondo.')
      }
    } catch {
      setGeo([])
      setCaps([])
      setZones([])
      setMsg('Errore caricamento Task di zona. Riprova tra qualche secondo.')
    }
  }

  const loadSummary = async () => {
    if (!f.region || !f.province || !f.city) return setSummary([])
    const p = new URLSearchParams({ region: f.region, province: f.province, city: f.city })
    const res = await authFetch(`/api/agent-zones/cap-summary?${p.toString()}`)
    const parsed = await parseJsonSafe(res)
    setSummary(parsed.ok && parsed.data?.success ? parsed.data.data : [])
  }

  const getSelectableStreetItems = () => {
    if (!ws) return [] as Array<{ id: string; name: string; isManual?: boolean }>
    const baseStreetItems = (ws.streetItems && ws.streetItems.length > 0)
      ? ws.streetItems.map((s) => ({ id: s.id, name: s.name, isManual: false }))
      : (ws.streets || []).map((name) => ({ id: name, name, isManual: false }))

    const seen = new Set(baseStreetItems.map((s) => s.name.trim().toLowerCase()))
    const manualNames = Array.from(
      new Set(
        (ws.logs || [])
          .filter((l: any) => l?.metadata?.kind === 'ZONE_SIGN' || l?.metadata?.kind === 'ZONE_PROPERTY')
          .map((l: any) => String(l?.metadata?.streetName || '').trim())
          .filter(Boolean)
      )
    )

    const manualItems = manualNames
      .filter((name) => !seen.has(name.toLowerCase()))
      .map((name) => ({ id: `__manual__:${name.toLowerCase()}`, name: `${name} (ALTRO)`, isManual: true }))

    return [...baseStreetItems, ...manualItems]
  }

  const loadGroups = async (cap: string) => {
    if (!cap || !f.region || !f.province || !f.city) return setGroups([])
    const p = new URLSearchParams({ cap, region: f.region, province: f.province, city: f.city })
    const res = await authFetch(`/api/agent-zones/cap-groups?${p.toString()}`)
    const parsed = await parseJsonSafe(res)
    setGroups(parsed.ok && parsed.data?.success ? parsed.data.data.groups : [])
  }
  const loadZoneDetails = async (zoneId: string) => {
    const res = await authFetch(`/api/agent-zones/${encodeURIComponent(zoneId)}/details`)
    const parsed = await parseJsonSafe(res)
    if (parsed.ok && parsed.data?.success) setZoneDetails((prev) => ({ ...prev, [zoneId]: parsed.data.data }))
  }

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    loadDynamicGroups().catch(() => null)
  }, [isAdmin, token])

  useEffect(() => {
    if (groupPage.mode !== 'operational') return
    const list = groupOverview?.dailyListings || []
    if (list.length <= 1) return
    const t = window.setInterval(() => {
      setDailySlideIndex((prev) => (prev + 1) % list.length)
    }, 4500)
    return () => window.clearInterval(t)
  }, [groupPage.mode, groupOverview?.dailyListings])

  const loadGroupOverview = async (ctx: WorkspaceCtx) => {
    setGroupOverviewLoading(true)
    try {
      const p = new URLSearchParams({
        cap: ctx.cap,
        groupIndex: String(ctx.groupIndex),
        region: ctx.region,
        province: ctx.province,
        city: ctx.city
      })
      const res = await authFetch(`/api/agent-zones/group-workspace/overview?${p.toString()}`)
      const data = await res.json()
      setGroupOverview(data.success ? data.data : null)
      setDailySlideIndex(0)
    } finally {
      setGroupOverviewLoading(false)
    }
  }

  const actorLabel = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Agente'

  const trackGroupEvent = async (ctx: WorkspaceCtx, title: string, content: string, metadata?: Record<string, unknown>) => {
    try {
      await authFetch('/api/agent-zones/group-workspace/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cap: ctx.cap,
          groupIndex: ctx.groupIndex,
          region: ctx.region,
          province: ctx.province,
          city: ctx.city,
          entryType: 'STATUS',
          title,
          content,
          metadata: {
            kind: 'AGENT_TRACE',
            actor: actorLabel,
            ...metadata
          }
        })
      })
    } catch {
      // telemetry best effort
    }
  }

  const trackStreetEvent = async (ctx: StreetCtx, title: string, content: string, metadata?: Record<string, unknown>) => {
    try {
      await authFetch('/api/agent-zones/street-workspace/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cap: ctx.cap,
          groupIndex: ctx.groupIndex,
          region: ctx.region,
          province: ctx.province,
          city: ctx.city,
          streetId: ctx.streetId,
          entryType: 'STATUS',
          title,
          content,
          metadata: {
            kind: 'AGENT_TRACE',
            actor: actorLabel,
            ...metadata
          }
        })
      })
    } catch {
      // telemetry best effort
    }
  }

  const trackListingEvent = async (listingId: string, title: string, content: string, metadata?: Record<string, unknown>) => {
    try {
      await authFetch(`/api/agent-zones/street-listings/${encodeURIComponent(listingId)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'NOTE',
          title,
          content,
          metadata: {
            kind: 'AGENT_TRACE',
            actor: actorLabel,
            ...metadata
          }
        })
      })
    } catch {
      // telemetry best effort
    }
  }

  const openWorkspace = async (ctx: WorkspaceCtx, opts?: { trackOpen?: boolean }) => {
    setWsCtx(ctx)
    setGroupPage({ mode: 'list', assignmentId: null })
    setZoneSignDetailId(null)
    setZonePropertyDetailId(null)
    setZoneClientDetailId(null)
    setGroupOverview(null)
    setManualStreetListingMap({})
    setZoneNoteForm({ title: '', content: '', streetId: '', photoDataUrl: '' })
    setZoneLogKeyword('')
    setZoneLogStreetFilter('ALL')
    setZoneClientForm({ firstName: '', lastName: '', phone: '', email: '', type: 'SELLER', note: '' })
    setZoneSignForm({
      streetId: '',
      customStreetName: '',
      civicNumber: '',
      ownerFullName: '',
      phone: '',
      apartmentFeatures: '',
      note: '',
      photoDataUrl: ''
    })
    setZonePropertyForm({
      streetId: '',
      customStreetName: '',
      civicNumber: '',
      ownerFullName: '',
      phone: '',
      apartmentFeatures: '',
      note: '',
      photoDataUrl: ''
    })
    setZoneClientRecordForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      province: '',
      zipCode: '',
      type: 'SELLER',
      note: ''
    })
    setZoneClientRecordEditForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      province: '',
      zipCode: '',
      type: 'SELLER',
      note: ''
    })
    setZoneClientRecordNote('')
    setWsLoading(true)
    const p = new URLSearchParams({ cap: ctx.cap, groupIndex: String(ctx.groupIndex), region: ctx.region, province: ctx.province, city: ctx.city })
    const res = await authFetch(`/api/agent-zones/group-workspace?${p.toString()}`)
    const data = await res.json()
    const workspaceData = data.success ? data.data : null
    setWs(workspaceData)
    if (workspaceData) {
      const preferredAssignment =
        workspaceData.assignmentHistory.find((a: any) => a.isActive && a.agent?.id === user?.id) ||
        workspaceData.assignmentHistory.find((a: any) => a.isActive) ||
        workspaceData.assignmentHistory[0] ||
        null
      if (preferredAssignment) {
        setGroupPage({
          mode: preferredAssignment.isActive ? 'operational' : 'history',
          assignmentId: preferredAssignment.id
        })
      }
    }
    setWsLoading(false)
    await loadGroupOverview(ctx)
    if (opts?.trackOpen !== false) {
      await trackGroupEvent(
        ctx,
        `Apertura task di zona � CAP ${ctx.cap} � Gruppo ${ctx.groupIndex}`,
        `${actorLabel} ha aperto task di zona alle ${new Date().toLocaleString('it-IT')}.`,
        { traceEvent: 'ZONE_GROUP_OPEN' }
      )
    }
  }

  const refreshWorkspaceData = async (ctx: WorkspaceCtx) => {
    setWsLoading(true)
    const p = new URLSearchParams({ cap: ctx.cap, groupIndex: String(ctx.groupIndex), region: ctx.region, province: ctx.province, city: ctx.city })
    const res = await authFetch(`/api/agent-zones/group-workspace?${p.toString()}`)
    const data = await res.json()
    setWs(data.success ? data.data : null)
    setWsLoading(false)
    await loadGroupOverview(ctx)
  }

  const saveWorkspaceLog = async () => {
    if (!wsCtx || !logForm.content.trim()) return setMsg('Inserisci contenuto nota')
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        cap: wsCtx.cap, groupIndex: wsCtx.groupIndex, region: wsCtx.region, province: wsCtx.province, city: wsCtx.city,
        entryType: logForm.entryType, title: logForm.title, content: logForm.content
      })
    })
    const data = await res.json()
    if (!data.success) return setMsg(data.message || 'Errore salvataggio nota')
    setLogForm({ entryType: 'NOTE', title: '', content: '' })
    await refreshWorkspaceData(wsCtx)
    if (isAdmin) await loadSummary()
    setMsg('Aggiornamento salvato')
  }

  const saveZoneNote = async () => {
    if (!wsCtx || !zoneNoteForm.content.trim()) return setMsg('Scrivi una nota di zona prima di salvare')
    const selectableStreetItems = (() => {
      const base = getSelectableStreetItems()
      return base.length > 0 ? base : [{ id: '__whole_zone__', name: 'Intera zona', isManual: true }]
    })()
    const selectedStreet = selectableStreetItems.find((s) => s.id === zoneNoteForm.streetId)
    const isManualStreet = Boolean(selectedStreet?.isManual)
    const streetName = selectedStreet ? String(selectedStreet.name || '').replace(/\s*\(ALTRO\)\s*$/i, '').trim() : null
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'NOTE',
        title: zoneNoteForm.title.trim(),
        content: zoneNoteForm.content.trim(),
        metadata: {
          kind: 'ZONE_NOTE',
          streetId: selectedStreet && !isManualStreet ? selectedStreet.id : null,
          streetName: streetName || null,
          ...buildZoneImageMetadata(zoneNoteForm.photoDataUrl)
        }
      })
    })
    if (!res.ok && res.status === 413) {
      return setMsg('Immagine troppo grande: riduci la foto e riprova')
    }
    const data = await res.json()
    if (!data.success) return setMsg(data.message || 'Errore salvataggio nota di zona')
    setZoneNoteForm({ title: '', content: '', streetId: '', photoDataUrl: '' })
    await refreshWorkspaceData(wsCtx)
    setMsg('Nota di zona salvata')
  }

  const saveZoneClient = async () => {
    if (!wsCtx) return
    const firstName = zoneClientForm.firstName.trim()
    const lastName = zoneClientForm.lastName.trim()
    if (!firstName || !lastName) {
      return setMsg('Nome e cognome cliente sono obbligatori')
    }

    const contactRes = await authFetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        phone: zoneClientForm.phone.trim() || undefined,
        email: zoneClientForm.email.trim() || undefined,
        type: zoneClientForm.type,
        city: wsCtx.city,
        province: wsCtx.province,
        zipCode: wsCtx.cap,
        notes: zoneClientForm.note.trim() || undefined,
        source: 'ZONE_TASK'
      })
    })
    const contactData = await contactRes.json()
    if (!contactData.success) {
      return setMsg(contactData.message || 'Errore creazione cliente di zona')
    }

    await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'STATUS',
        title: `Nuovo cliente di zona: ${firstName} ${lastName}`,
        content: zoneClientForm.note.trim() || 'Contatto inserito da scheda gruppo',
        metadata: {
          kind: 'ZONE_CLIENT',
          contactId: contactData?.data?.id || null,
          contactType: zoneClientForm.type,
          fullName: `${firstName} ${lastName}`,
          phone: zoneClientForm.phone.trim() || null,
          email: zoneClientForm.email.trim() || null
        }
      })
    })

    setZoneClientForm({ firstName: '', lastName: '', phone: '', email: '', type: 'SELLER', note: '' })
    await refreshWorkspaceData(wsCtx)
    setMsg('Cliente di zona aggiunto')
  }

  const makeClientRecordId = () => {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `zclient-${uuid}`
  }

  const saveZoneClientRecord = async () => {
    if (!wsCtx) return
    const firstName = zoneClientRecordForm.firstName.trim()
    const lastName = zoneClientRecordForm.lastName.trim()
    if (!firstName || !lastName) return setMsg('Nome e cognome cliente sono obbligatori')
    const clientRecordId = makeClientRecordId()
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'STATUS',
        title: `Cliente di zona: ${firstName} ${lastName}`,
        content: zoneClientRecordForm.note.trim() || 'Nuovo cliente di zona inserito',
        metadata: {
          kind: 'ZONE_CLIENT_RECORD',
          clientRecordId,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          phone: zoneClientRecordForm.phone.trim() || null,
          email: zoneClientRecordForm.email.trim() || null,
          address: zoneClientRecordForm.address.trim() || null,
          city: zoneClientRecordForm.city.trim() || wsCtx.city,
          province: zoneClientRecordForm.province.trim() || wsCtx.province,
          zipCode: zoneClientRecordForm.zipCode.trim() || wsCtx.cap,
          contactType: zoneClientRecordForm.type,
          note: zoneClientRecordForm.note.trim() || null
        }
      })
    })
    const parsed = await parseJsonSafe(res)
    if (!parsed.ok) return setMsg('Errore salvataggio cliente: risposta server non valida')
    const data = parsed.data
    if (!data.success) return setMsg(data.message || 'Errore salvataggio cliente di zona')
    await refreshWorkspaceData(wsCtx)
    setZoneClientDetailId(clientRecordId)
    setZoneClientRecordForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      province: '',
      zipCode: '',
      type: 'SELLER',
      note: ''
    })
    setGroupPage((p) => ({ ...p, mode: 'zone_client_detail' }))
    setMsg('Cliente di zona salvato')
  }

  const saveZoneClientRecordUpdate = async () => {
    if (!wsCtx || !zoneClientDetailId) return
    const firstName = zoneClientRecordEditForm.firstName.trim()
    const lastName = zoneClientRecordEditForm.lastName.trim()
    if (!firstName || !lastName) return setMsg('Nome e cognome cliente sono obbligatori')
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'STATUS',
        title: `Aggiornamento cliente: ${firstName} ${lastName}`,
        content: zoneClientRecordEditForm.note.trim() || 'Dati cliente aggiornati',
        metadata: {
          kind: 'ZONE_CLIENT_RECORD_UPDATE',
          clientRecordId: zoneClientDetailId,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          phone: zoneClientRecordEditForm.phone.trim() || null,
          email: zoneClientRecordEditForm.email.trim() || null,
          address: zoneClientRecordEditForm.address.trim() || null,
          city: zoneClientRecordEditForm.city.trim() || wsCtx.city,
          province: zoneClientRecordEditForm.province.trim() || wsCtx.province,
          zipCode: zoneClientRecordEditForm.zipCode.trim() || wsCtx.cap,
          contactType: zoneClientRecordEditForm.type,
          note: zoneClientRecordEditForm.note.trim() || null
        }
      })
    })
    const parsed = await parseJsonSafe(res)
    if (!parsed.ok) return setMsg('Errore aggiornamento cliente: risposta server non valida')
    const data = parsed.data
    if (!data.success) return setMsg(data.message || 'Errore aggiornamento cliente')
    await refreshWorkspaceData(wsCtx)
    setGroupPage((p) => ({ ...p, mode: 'zone_client_detail' }))
    setMsg('Cliente aggiornato')
  }

  const addZoneClientRecordNote = async () => {
    if (!wsCtx || !zoneClientDetailId || !zoneClientRecordNote.trim()) return setMsg('Inserisci una nota cliente')
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'NOTE',
        title: 'Nota cliente di zona',
        content: zoneClientRecordNote.trim(),
        metadata: {
          kind: 'ZONE_CLIENT_RECORD_NOTE',
          clientRecordId: zoneClientDetailId
        }
      })
    })
    const parsed = await parseJsonSafe(res)
    if (!parsed.ok) return setMsg('Errore salvataggio nota cliente: risposta server non valida')
    const data = parsed.data
    if (!data.success) return setMsg(data.message || 'Errore salvataggio nota cliente')
    setZoneClientRecordNote('')
    await refreshWorkspaceData(wsCtx)
    setGroupPage((p) => ({ ...p, mode: 'zone_client_detail' }))
    setMsg('Nota cliente salvata')
  }

  const fileToOptimizedDataUrl = async (file: File) => {
    const readAsDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Errore lettura file'))
        reader.readAsDataURL(file)
      })

    if (!file.type.startsWith('image/')) {
      return readAsDataUrl()
    }

    const baseDataUrl = await readAsDataUrl()
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Errore caricamento immagine'))
      image.src = baseDataUrl
    })

    const maxDim = 1280
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * ratio))
    const height = Math.max(1, Math.round(img.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return baseDataUrl
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  const onZoneSignPhotoSelected = async (file: File | null) => {
    if (!file) return
    const dataUrl = await fileToOptimizedDataUrl(file)
    setZoneSignForm((p) => ({ ...p, photoDataUrl: dataUrl }))
  }

  const onZonePropertyPhotoSelected = async (file: File | null) => {
    if (!file) return
    const dataUrl = await fileToOptimizedDataUrl(file)
    setZonePropertyForm((p) => ({ ...p, photoDataUrl: dataUrl }))
  }

  const onZoneNotePhotoSelected = async (file: File | null) => {
    if (!file) return
    const dataUrl = await fileToOptimizedDataUrl(file)
    setZoneNoteForm((p) => ({ ...p, photoDataUrl: dataUrl }))
  }

  const saveZoneSign = async () => {
    if (!wsCtx || !ws) return
    if (!ws.canWrite) return setMsg('Non hai permessi per inserire cartelli su questo gruppo')
    const selectableStreetItems = (() => {
      const base = getSelectableStreetItems()
      return base.length > 0 ? base : [{ id: '__whole_zone__', name: 'Intera zona', isManual: true }]
    })()
    const isCustomStreet = zoneSignForm.streetId === '__add_custom__'
    const selectedStreet = selectableStreetItems.find((s) => s.id === zoneSignForm.streetId)
    const isManualStreet = Boolean(selectedStreet?.isManual)
    const streetName = isCustomStreet
      ? zoneSignForm.customStreetName.trim()
      : String(selectedStreet?.name || '').replace(/\s*\(ALTRO\)\s*$/i, '').trim()
    if (!streetName) return setMsg('Seleziona una via o inserisci una via personalizzata')
    if (!zoneSignForm.civicNumber.trim()) return setMsg('Inserisci numero civico')
    if (!zoneSignForm.phone.trim()) return setMsg('Inserisci numero di telefono')

    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        groupIndex: wsCtx.groupIndex,
        entryType: 'STATUS',
        title: `Cartello zona - ${streetName} ${zoneSignForm.civicNumber.trim()}`,
        content: zoneSignForm.note.trim() || 'Nuovo cartello di zona inserito',
        metadata: {
          kind: 'ZONE_SIGN',
          streetId: (isCustomStreet || isManualStreet) ? null : selectedStreet?.id || null,
          streetName,
          isCustomStreet: isCustomStreet || isManualStreet,
          civicNumber: zoneSignForm.civicNumber.trim(),
          ownerFullName: zoneSignForm.ownerFullName.trim() || null,
          phone: zoneSignForm.phone.trim(),
          apartmentFeatures: zoneSignForm.apartmentFeatures.trim() || null,
          note: zoneSignForm.note.trim() || null,
          ...buildZoneImageMetadata(zoneSignForm.photoDataUrl)
        }
      })
    })
    if (!res.ok && res.status === 413) {
      return setMsg('Immagine troppo grande: riduci la foto e riprova')
    }
    const parsed = await parseJsonSafe(res)
    if (!parsed.ok) {
      return setMsg('Errore salvataggio cartello: risposta non valida dal server (HTML invece di JSON)')
    }
    const data = parsed.data
    if (!data.success) return setMsg(data.message || 'Errore salvataggio cartello di zona')

    setZoneSignForm({
      streetId: '',
      customStreetName: '',
      civicNumber: '',
      ownerFullName: '',
      phone: '',
      apartmentFeatures: '',
      note: '',
      photoDataUrl: ''
    })
    await refreshWorkspaceData(wsCtx)
    setZoneSignDetailId(String(data?.data?.id || ''))
    setGroupPage((p) => ({ ...p, mode: 'zone_sign_detail' }))
    setMsg('Cartello di zona salvato')
  }

  const saveZoneProperty = async () => {
    if (!wsCtx || !ws) return
    if (!ws.canWrite) return setMsg('Non hai permessi per inserire immobili di zona')
    const selectableStreetItems = (() => {
      const base = getSelectableStreetItems()
      return base.length > 0 ? base : [{ id: '__whole_zone__', name: 'Intera zona', isManual: true }]
    })()
    const isCustomStreet = zonePropertyForm.streetId === '__add_custom__'
    const selectedStreet = selectableStreetItems.find((s) => s.id === zonePropertyForm.streetId)
    const isManualStreet = Boolean(selectedStreet?.isManual)
    const streetName = isCustomStreet
      ? zonePropertyForm.customStreetName.trim()
      : String(selectedStreet?.name || '').replace(/\s*\(ALTRO\)\s*$/i, '').trim()
    if (!streetName) return setMsg('Seleziona una via o inserisci una via personalizzata')
    if (!zonePropertyForm.civicNumber.trim()) return setMsg('Inserisci numero civico')
    if (!zonePropertyForm.phone.trim()) return setMsg('Inserisci numero di telefono')

    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        groupIndex: wsCtx.groupIndex,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        entryType: 'STATUS',
        title: `Immobile zona - ${streetName} ${zonePropertyForm.civicNumber.trim()}`,
        content: zonePropertyForm.note.trim() || 'Nuovo immobile di zona inserito',
        metadata: {
          kind: 'ZONE_PROPERTY',
          streetId: (isCustomStreet || isManualStreet) ? null : selectedStreet?.id || null,
          streetName,
          isCustomStreet: isCustomStreet || isManualStreet,
          civicNumber: zonePropertyForm.civicNumber.trim(),
          ownerFullName: zonePropertyForm.ownerFullName.trim() || null,
          phone: zonePropertyForm.phone.trim(),
          apartmentFeatures: zonePropertyForm.apartmentFeatures.trim() || null,
          note: zonePropertyForm.note.trim() || null,
          ...buildZoneImageMetadata(zonePropertyForm.photoDataUrl)
        }
      })
    })
    if (!res.ok && res.status === 413) {
      return setMsg('Immagine troppo grande: riduci la foto e riprova')
    }
    const parsed = await parseJsonSafe(res)
    if (!parsed.ok) {
      return setMsg('Errore salvataggio immobile: risposta non valida dal server (HTML invece di JSON)')
    }
    const data = parsed.data
    if (!data.success) return setMsg(data.message || 'Errore salvataggio immobile di zona')

    setZonePropertyForm({
      streetId: '',
      customStreetName: '',
      civicNumber: '',
      ownerFullName: '',
      phone: '',
      apartmentFeatures: '',
      note: '',
      photoDataUrl: ''
    })
    await refreshWorkspaceData(wsCtx)
    setZonePropertyDetailId(String(data?.data?.id || ''))
    setGroupPage((p) => ({ ...p, mode: 'zone_property_detail' }))
    setMsg('Immobile di zona salvato')
  }

  const saveZoneSignAction = async () => {
    if (!wsCtx || !ws || !zoneSignDetailId) return
    if (!ws.canWrite) return setMsg('Non hai permessi per aggiornare il cartello')
    if (!zoneSignActionForm.content.trim()) return setMsg('Inserisci contenuto azione cartello')
    setZoneSignActionSaving(true)
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        groupIndex: wsCtx.groupIndex,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        entryType: 'STATUS',
        title: zoneSignActionForm.title.trim() || `Azione cartello ${zoneSignActionForm.actionType}`,
        content: zoneSignActionForm.content.trim(),
        metadata: {
          kind: 'ZONE_SIGN_ACTION',
          zoneSignLogId: zoneSignDetailId,
          actionType: zoneSignActionForm.actionType,
          outcome: zoneSignActionForm.outcome.trim() || null,
          nextActionAt: zoneSignActionForm.nextActionAt || null
        }
      })
    })
    const data = await res.json()
    if (!data.success) {
      setZoneSignActionSaving(false)
      return setMsg(data.message || 'Errore salvataggio azione cartello')
    }
    setZoneSignActionForm({ actionType: 'NOTE', title: '', content: '', outcome: '', nextActionAt: '' })
    await refreshWorkspaceData(wsCtx)
    setGroupPage((p) => ({ ...p, mode: 'zone_sign_detail' }))
    setZoneSignActionSaving(false)
    setMsg('Azione cartello salvata')
  }

  const saveZoneSignStatus = async (status: string) => {
    if (!wsCtx || !ws || !zoneSignDetailId) return
    if (!ws.canWrite) return setMsg('Non hai permessi per aggiornare lo stato cartello')
    setZoneSignStatusSaving(true)
    const res = await authFetch('/api/agent-zones/group-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: wsCtx.cap,
        groupIndex: wsCtx.groupIndex,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        entryType: 'STATUS',
        title: `Stato cartello: ${status}`,
        content: `Aggiornato stato cartello a ${status}`,
        metadata: {
          kind: 'ZONE_SIGN_ACTION',
          zoneSignLogId: zoneSignDetailId,
          actionType: 'STATUS',
          status
        }
      })
    })
    const data = await res.json()
    if (!data.success) {
      setZoneSignStatusSaving(false)
      return setMsg(data.message || 'Errore aggiornamento stato cartello')
    }
    await refreshWorkspaceData(wsCtx)
    setGroupPage((p) => ({ ...p, mode: 'zone_sign_detail' }))
    setZoneSignStatusSaving(false)
    setMsg('Stato cartello aggiornato')
  }

  const closeGroupAssignment = async (assignmentId: string) => {
    if (!wsCtx || !isAdmin) return
    setClosingAssignmentId(assignmentId)
    const res = await authFetch('/api/agent-zones/group-workspace/close-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId })
    })
    const data = await res.json()
    if (!data.success) {
      setClosingAssignmentId(null)
      return setMsg(data.message || 'Errore chiusura gruppo')
    }
    await Promise.all([openWorkspace(wsCtx, { trackOpen: false }), loadSummary(), loadBase()])
    setClosingAssignmentId(null)
    setMsg('Gruppo chiuso e archiviato')
  }

  const closeAndReassignGroup = async () => {
    if (!wsCtx || !isAdmin || !reassignModal.assignmentId || !reassignAgentId) return
    setClosingAssignmentId(reassignModal.assignmentId)
    const closeRes = await authFetch('/api/agent-zones/group-workspace/close-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: reassignModal.assignmentId, note: 'Chiuso e riassegnato da admin' })
    })
    const closeData = await closeRes.json()
    if (!closeData.success) {
      setClosingAssignmentId(null)
      return setMsg(closeData.message || 'Errore chiusura gruppo')
    }

    const assignRes = await authFetch('/api/agent-zones/assign-cap-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: reassignAgentId,
        region: wsCtx.region,
        province: wsCtx.province,
        city: wsCtx.city,
        cap: wsCtx.cap,
        groupIndex: wsCtx.groupIndex,
        note: 'Riassegnazione da gruppo chiuso'
      })
    })
    const assignData = await assignRes.json()
    setClosingAssignmentId(null)
    if (!assignData.success) return setMsg(assignData.message || 'Errore riassegnazione gruppo')
    setReassignModal({ assignmentId: '', open: false })
    setReassignAgentId('')
    await Promise.all([openWorkspace(wsCtx, { trackOpen: false }), loadSummary(), loadBase()])
    setMsg('Gruppo chiuso, archiviato e riassegnato')
  }

  const assignmentScopedLogs = (assignmentId: string) => {
    if (!ws) return []
    const assignment = ws.assignmentHistory.find((a) => a.id === assignmentId)
    if (!assignment) return []
    const start = new Date(assignment.assignedAt).getTime()
    const end = assignment.endedAt ? new Date(assignment.endedAt).getTime() : Date.now()
    return ws.logs.filter((l) => {
      const ts = new Date(l.createdAt).getTime()
      return ts >= start && ts <= end
    })
  }

  const openStreetWorkspace = async (ctx: StreetCtx, opts?: { trackOpen?: boolean }) => {
    setStreetCtx(ctx)
    setStreetLoading(true)
    setStreetInsights(null)
    setStreetInsightsLoading(true)
    setStreetListings([])
    setStreetListingsSnapshot(null)
    setStreetListingsWarning(null)
    setManualStreetListingMap({})
    setStreetListingsLoading(true)
    setListingCtx(null)
    setListingDetail(null)
    const p = new URLSearchParams({
      cap: ctx.cap,
      groupIndex: String(ctx.groupIndex),
      region: ctx.region,
      province: ctx.province,
      city: ctx.city,
      streetId: ctx.streetId
    })
    const res = await authFetch(`/api/agent-zones/street-workspace?${p.toString()}`)
    const data = await res.json()
    setStreetWs(data.success ? data.data : null)
    setStreetLoading(false)

    const pi = new URLSearchParams({
      cap: ctx.cap,
      groupIndex: String(ctx.groupIndex),
      region: ctx.region,
      province: ctx.province,
      city: ctx.city,
      streetId: ctx.streetId
    })
    const resInsights = await authFetch(`/api/agent-zones/street-market-insights?${pi.toString()}`)
    const dataInsights = await resInsights.json()
    setStreetInsights(dataInsights.success ? dataInsights.data : null)
    setStreetInsightsLoading(false)

    const pl = new URLSearchParams({
      cap: ctx.cap,
      groupIndex: String(ctx.groupIndex),
      region: ctx.region,
      province: ctx.province,
      city: ctx.city,
      streetId: ctx.streetId
    })
    const resListings = await authFetch(`/api/agent-zones/street-listings?${pl.toString()}`)
    const dataListings = await resListings.json()
    if (dataListings.success) {
      setStreetListings(Array.isArray(dataListings.data?.listings) ? dataListings.data.listings : [])
      setStreetListingsSnapshot(dataListings.data?.snapshot || null)
      setStreetListingsWarning(dataListings.data?.warning || null)
    } else {
      setStreetListings([])
      setStreetListingsSnapshot(null)
      setStreetListingsWarning(dataListings.message || 'Errore caricamento immobili via')
    }
    setStreetListingsLoading(false)
    if (opts?.trackOpen !== false) {
      await trackStreetEvent(
        ctx,
        `Apertura dettagli via � ${ctx.streetName}`,
        `${actorLabel} ha aperto i dettagli della via "${ctx.streetName}" alle ${new Date().toLocaleString('it-IT')}.`,
        { traceEvent: 'ZONE_STREET_OPEN', streetName: ctx.streetName }
      )
    }
  }

  const openManualStreetWorkspace = (ctx: StreetCtx) => {
    if (!ws) return
    const cleanStreetName = String(ctx.streetName || '').replace(/\s*\(ALTRO\)\s*$/i, '').trim()
    const signLogs = (ws.logs || []).filter((l: any) => {
      if (l?.metadata?.kind !== 'ZONE_SIGN' && l?.metadata?.kind !== 'ZONE_PROPERTY') return false
      return String(l?.metadata?.streetName || '').trim().toLowerCase() === cleanStreetName.toLowerCase()
    })
    const signIds = new Set(signLogs.map((l) => String(l.id)))
    const signActionLogs = (ws.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_SIGN_ACTION' && signIds.has(String(l?.metadata?.zoneSignLogId || '')))
    const manualLogs = [...signLogs, ...signActionLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    setStreetCtx(ctx)
    setStreetWs({
      cap: ws.cap,
      groupName: ws.groupName,
      groupIndex: ws.groupIndex,
      street: { id: ctx.streetId, name: cleanStreetName || ctx.streetName },
      canWrite: false,
      assignmentHistory: (ws.assignmentHistory || []).map((a) => ({
        id: a.id,
        isActive: a.isActive,
        assignedAt: a.assignedAt,
        endedAt: a.endedAt,
        agent: { firstName: a.agent.firstName, lastName: a.agent.lastName }
      })),
      logs: manualLogs.map((l) => ({
        id: l.id,
        entryType: l.entryType,
        title: l.title,
        content: l.content,
        metadata: l.metadata || null,
        createdAt: l.createdAt,
        createdBy: { firstName: l.createdBy.firstName, lastName: l.createdBy.lastName }
      }))
    })
    const manualPropertyLogs = (ws.logs || []).filter((l: any) => {
      if (l?.metadata?.kind !== 'ZONE_PROPERTY') return false
      return String(l?.metadata?.streetName || '').trim().toLowerCase() === cleanStreetName.toLowerCase()
    })
    const manualListings: StreetListing[] = manualPropertyLogs.map((l: any) => {
      const status = String(l?.metadata?.status || 'NEW')
      const safeStatus = (['NEW', 'IN_PROGRESS', 'CONTACTED', 'VISIT_BOOKED', 'CLOSED', 'DISMISSED'] as const).includes(status as any)
        ? (status as StreetListing['listingStatus'])
        : 'NEW'
      return {
        id: `manual-zone-property-${String(l.id)}`,
        sourceListingId: String(l.id),
        listingUrl: '',
        title: l.title || `Immobile zona - ${cleanStreetName} ${String(l?.metadata?.civicNumber || '').trim()}`,
        priceText: String(l?.metadata?.priceText || '-'),
        surfaceText: String(l?.metadata?.surfaceText || '-'),
        roomsText: String(l?.metadata?.roomsText || '-'),
        floorText: String(l?.metadata?.floorText || '-'),
        agencyName: 'Interno zona',
        mainImageUrl: getZonePrimaryPhoto(l?.metadata),
        listingStatus: safeStatus,
        lastSeenAt: l.createdAt,
        updatedAt: l.createdAt
      }
    })
    const manualMap = Object.fromEntries(manualPropertyLogs.map((l: any) => [`manual-zone-property-${String(l.id)}`, String(l.id)]))

    setStreetInsights(null)
    setStreetInsightsLoading(false)
    setStreetListings(manualListings)
    setManualStreetListingMap(manualMap)
    setStreetListingsSnapshot({
      id: `manual-${ctx.streetId}`,
      status: 'SUCCESS',
      warning: null,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
    setStreetListingsWarning(manualListings.length === 0 ? 'Via aggiunta manualmente: nessun immobile di zona registrato al momento.' : null)
    setStreetListingsLoading(false)
    setStreetLoading(false)
    setListingCtx(null)
    setListingDetail(null)
    void trackGroupEvent(
      { cap: ctx.cap, groupIndex: ctx.groupIndex, region: ctx.region, province: ctx.province, city: ctx.city },
      `Apertura dettagli via � ${ctx.streetName}`,
      `${actorLabel} ha aperto i dettagli della via "${ctx.streetName}" alle ${new Date().toLocaleString('it-IT')}.`,
      { traceEvent: 'ZONE_STREET_OPEN_MANUAL', streetName: ctx.streetName }
    )
  }

  const refreshStreetListings = async (forceRefresh = false) => {
    if (!streetCtx) return
    if (String(streetCtx.streetId).startsWith('altro-')) return
    setStreetListingsLoading(true)
    const pl = new URLSearchParams({
      cap: streetCtx.cap,
      groupIndex: String(streetCtx.groupIndex),
      region: streetCtx.region,
      province: streetCtx.province,
      city: streetCtx.city,
      streetId: streetCtx.streetId
    })
    if (forceRefresh) pl.set('forceRefresh', 'true')
    const res = await authFetch(`/api/agent-zones/street-listings?${pl.toString()}`)
    const data = await res.json()
    if (data.success) {
      setStreetListings(Array.isArray(data.data?.listings) ? data.data.listings : [])
      setStreetListingsSnapshot(data.data?.snapshot || null)
      setStreetListingsWarning(data.data?.warning || null)
    } else {
      setStreetListingsWarning(data.message || 'Errore aggiornamento immobili via')
    }
    setStreetListingsLoading(false)
  }

  const openListingDetail = async (listingId: string, opts?: { trackOpen?: boolean }) => {
    setListingCtx({ listingId })
    setListingDetail(null)
    setListingDetailLoading(true)
    const res = await authFetch(`/api/agent-zones/street-listings/${encodeURIComponent(listingId)}`)
    const data = await res.json()
    if (!data.success) {
      setMsg(data.message || 'Errore caricamento scheda immobile')
      setListingCtx(null)
      setListingDetailLoading(false)
      return
    }
    setListingDetail(data.data)
    if (opts?.trackOpen !== false) {
      const listingTitle = data?.data?.listing?.title || `Immobile ${data?.data?.listing?.sourceListingId || listingId}`
      await trackListingEvent(
        listingId,
        `Apertura scheda immobile � ${listingTitle}`,
        `${actorLabel} ha aperto scheda immobile "${listingTitle}" alle ${new Date().toLocaleString('it-IT')}.`,
        { traceEvent: 'ZONE_LISTING_OPEN', listingTitle }
      )
    }
    setListingDetailLoading(false)
  }

  const saveListingAction = async () => {
    if (!listingDetail) return
    const normalizedContent =
      listingActionForm.content.trim() ||
      listingActionForm.title.trim() ||
      `Azione operativa ${listingActionForm.actionType}`
    const res = await authFetch(`/api/agent-zones/street-listings/${encodeURIComponent(listingDetail.listing.id)}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: listingActionForm.actionType,
        title: listingActionForm.title,
        content: normalizedContent,
        outcome: listingActionForm.outcome,
        nextActionAt: listingActionForm.nextActionAt || null
      })
    })
    const data = await res.json()
    if (!data.success) return setMsg(data.message || 'Errore salvataggio azione immobile')
    setListingActionForm({ actionType: 'NOTE', title: '', content: '', outcome: '', nextActionAt: '' })
    await openListingDetail(listingDetail.listing.id, { trackOpen: false })
    try {
      await onRefreshGlobalData?.()
    } catch {
      // Keep local success feedback even if global refresh fails
    }
    setMsg('Azione immobile salvata')
  }

  const saveListingStatus = async (listingStatus: string) => {
    if (!listingDetail) return
    setListingStatusSaving(true)
    const res = await authFetch(`/api/agent-zones/street-listings/${encodeURIComponent(listingDetail.listing.id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingStatus })
    })
    const data = await res.json()
    if (!data.success) {
      setListingStatusSaving(false)
      return setMsg(data.message || 'Errore aggiornamento stato immobile')
    }
    await Promise.all([openListingDetail(listingDetail.listing.id, { trackOpen: false }), refreshStreetListings(false)])
    setListingStatusSaving(false)
    setMsg('Stato immobile aggiornato')
  }

  const getVisibleListingActionsForUser = (actions: StreetListingDetail['actions']) => {
    if (isAdmin) return actions
    const currentUserEmail = String(user?.email || '').trim().toLowerCase()
    return actions.filter((action) => {
      const traceKind = String(action?.metadata?.kind || '').toUpperCase()
      const traceEvent = String(action?.metadata?.traceEvent || '').toUpperCase()
      const isTelemetry = traceKind === 'AGENT_TRACE' || traceEvent.startsWith('ZONE_')
      const isOwnedByCurrentUser =
        !currentUserEmail || String(action?.createdBy?.email || '').trim().toLowerCase() === currentUserEmail
      const isProgrammedAction = Boolean(action?.nextActionAt)
      return !isTelemetry && isOwnedByCurrentUser && isProgrammedAction
    })
  }

  const saveStreetLog = async () => {
    if (!streetCtx || !streetLogForm.content.trim()) return setMsg('Inserisci contenuto nota via')
    const res = await authFetch('/api/agent-zones/street-workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cap: streetCtx.cap,
        groupIndex: streetCtx.groupIndex,
        region: streetCtx.region,
        province: streetCtx.province,
        city: streetCtx.city,
        streetId: streetCtx.streetId,
        entryType: streetLogForm.entryType,
        title: streetLogForm.title,
        content: streetLogForm.content
      })
    })
    const data = await res.json()
    if (!data.success) return setMsg(data.message || 'Errore salvataggio via')
    setStreetLogForm({ entryType: 'NOTE', title: '', content: '' })
    await openStreetWorkspace(streetCtx, { trackOpen: false })
    setMsg('Aggiornamento via salvato')
  }

  const exportCsv = () => {
    if (!ws || !wsCtx) return
    const lines: string[] = []
    lines.push(['CAP', wsCtx.cap, 'Gruppo', ws.groupName].map(csvEsc).join(','))
    lines.push(['Regione', wsCtx.region, 'Provincia', wsCtx.province, 'Comune', wsCtx.city].map(csvEsc).join(','))
    lines.push('')
    lines.push('STORICO ASSEGNAZIONI')
    lines.push(['Agente', 'Email', 'Da', 'A', 'Attiva', 'Nota'].map(csvEsc).join(','))
    ws.assignmentHistory.forEach((a) => lines.push([`${a.agent.firstName} ${a.agent.lastName}`, a.agent.email, fmt(a.assignedAt), a.isActive ? 'in corso' : fmt(a.endedAt), a.isActive ? 'SI' : 'NO', a.note || ''].map(csvEsc).join(',')))
    lines.push('')
    lines.push('ARCHIVIO')
    lines.push(['Data', 'Tipo', 'Titolo', 'Contenuto', 'Autore'].map(csvEsc).join(','))
    ws.logs.forEach((l) => lines.push([fmt(l.createdAt), l.entryType, l.title || '', l.content, `${l.createdBy.firstName} ${l.createdBy.lastName}`].map(csvEsc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = u; a.download = `scheda-gruppo-${wsCtx.cap}-g${ws.groupIndex}.csv`; a.click(); URL.revokeObjectURL(u)
  }

  const exportPdf = () => {
    if (!ws || !wsCtx) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f5f5f5}</style></head><body><h1>${ws.groupName}</h1><p>${wsCtx.region} > ${wsCtx.province} > ${wsCtx.city} > CAP ${wsCtx.cap}</p><h2>Storico assegnazioni</h2><table><tr><th>Agente</th><th>Da</th><th>A</th></tr>${ws.assignmentHistory.map((a) => `<tr><td>${a.agent.firstName} ${a.agent.lastName}</td><td>${fmt(a.assignedAt)}</td><td>${a.isActive ? 'in corso' : fmt(a.endedAt)}</td></tr>`).join('')}</table><h2>Archivio</h2><table><tr><th>Data</th><th>Tipo</th><th>Contenuto</th></tr>${ws.logs.map((l) => `<tr><td>${fmt(l.createdAt)}</td><td>${l.entryType}</td><td>${l.content}</td></tr>`).join('')}</table></body></html>`
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); w.print()
  }

  useEffect(() => { loadBase() }, [])
  useEffect(() => {
    if (!f.region && !f.province && !f.city) {
      const hasDefault = geo.some((x) => x.region === 'Abruzzo' && x.province === 'Pescara' && x.city === 'Pescara')
      if (hasDefault) setF((p) => ({ ...p, region: 'Abruzzo', province: 'Pescara', city: 'Pescara' }))
    }
  }, [geo, f.region, f.province, f.city])
  useEffect(() => { if (f.cap) loadGroups(f.cap); else setGroups([]); setF((p) => ({ ...p, groupIndex: '' })) }, [f.cap, f.region, f.province, f.city])
  useEffect(() => { if (isAdmin) loadSummary() }, [isAdmin, f.region, f.province, f.city])
  useEffect(() => { if (!isAdmin) zones.forEach((z) => { if (!zoneDetails[z.id]) loadZoneDetails(z.id) }) }, [isAdmin, zones])

  const assignGroup = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    if (!f.agentId || !f.region || !f.province || !f.city || !f.cap || !f.groupIndex) return setMsg('Compila i campi obbligatori')
    const res = await authFetch('/api/agent-zones/assign-cap-group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: f.agentId, region: f.region, province: f.province, city: f.city, cap: f.cap, groupIndex: Number(f.groupIndex) })
    })
    const data = await res.json()
    if (!data.success) return setMsg(data.message || 'Errore assegnazione')
    setMsg(data.data?.handover ? `Gruppo riassegnato con storico conservato (da ${data.data.handover.agentName}).` : 'Gruppo assegnato con successo.')
    await Promise.all([loadGroups(f.cap), loadSummary(), loadBase()])
  }

  if (streetCtx && listingCtx) {
    return (
      <div>
        <button type="button" onClick={() => setListingCtx(null)} style={{ ...inputStyle, width: 'auto', marginBottom: '10px' }}>
          {'<'}- Torna alla scheda via
        </button>
        {listingDetailLoading && <div style={{ ...card, padding: '12px' }}>Caricamento scheda immobile...</div>}
        {!listingDetailLoading && listingDetail && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ ...card, padding: '14px' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{listingDetail.listing.title || `Immobile ${listingDetail.listing.sourceListingId}`}</h1>
              <p style={{ marginTop: '6px', color: '#64748b' }}>
                {streetCtx.region} {'>'} {streetCtx.province} {'>'} {streetCtx.city} {'>'} CAP {streetCtx.cap} {'>'} Gruppo {streetCtx.groupIndex} {'>'} {streetCtx.streetName}
              </p>
              {listingDetail.listing.mainImageUrl ? (
                <div style={{ marginTop: '10px' }}>
                  <img
                    src={listingDetail.listing.mainImageUrl}
                    alt={listingDetail.listing.title || `Immobile ${listingDetail.listing.sourceListingId}`}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                    style={{
                      width: '100%',
                      maxWidth: '520px',
                      maxHeight: '300px',
                      borderRadius: '10px',
                      objectFit: 'cover',
                      border: '1px solid #e5e7eb',
                      background: '#f8fafc'
                    }}
                  />
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                <div><strong>Prezzo:</strong> {listingDetail.listing.priceText || '-'}</div>
                <div><strong>Superficie:</strong> {listingDetail.listing.surfaceText || '-'}</div>
                <div><strong>Locali:</strong> {listingDetail.listing.roomsText || '-'}</div>
                <div><strong>Piano:</strong> {listingDetail.listing.floorText || '-'}</div>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={listingDetail.listing.listingStatus}
                  disabled={!listingDetail.canWrite || listingStatusSaving}
                  onChange={(e) => saveListingStatus(e.target.value)}
                  style={{ ...inputStyle, width: '260px' }}
                >
                  <option value="NEW">NEW</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="CONTACTED">CONTACTED</option>
                  <option value="VISIT_BOOKED">VISIT_BOOKED</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="DISMISSED">DISMISSED</option>
                </select>
                <a
                  href={listingDetail.listing.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', fontWeight: 600 }}
                  onClick={() => {
                    void trackListingEvent(
                      listingDetail.listing.id,
                      `Apertura annuncio sorgente � ${listingDetail.listing.title || listingDetail.listing.sourceListingId}`,
                      `${actorLabel} ha cliccato su "Apri annuncio dettaglio" per "${listingDetail.listing.title || listingDetail.listing.sourceListingId}" alle ${new Date().toLocaleString('it-IT')}.`,
                      {
                        traceEvent: 'ZONE_LISTING_SOURCE_OPEN',
                        listingTitle: listingDetail.listing.title || null,
                        listingUrl: listingDetail.listing.listingUrl || null
                      }
                    )
                  }}
                >
                  Apri annuncio sorgente
                </a>
              </div>
              {listingDetail.listing.addressText && <div style={{ marginTop: '8px' }}><strong>Indirizzo:</strong> {listingDetail.listing.addressText}</div>}
              {listingDetail.listing.description && <div style={{ marginTop: '8px', color: '#334155' }}>{listingDetail.listing.description}</div>}
            </div>

            <div style={{ ...card, padding: '12px' }}>
              <h3 style={{ marginTop: 0 }}>Storico assegnazioni immobile</h3>
              {listingDetail.assignmentHistory.length === 0 && <div style={{ color: '#64748b' }}>Nessuno storico assegnazioni disponibile.</div>}
              {listingDetail.assignmentHistory.map((h) => (
                <div key={h.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                  <strong>{h.fromAgent ? `${h.fromAgent.firstName} ${h.fromAgent.lastName}` : 'N/D'}</strong> {'->'} <strong>{h.toAgent.firstName} {h.toAgent.lastName}</strong> | {fmt(h.assignedAt)}
                  {h.note ? <div style={{ color: '#475569' }}>{h.note}</div> : null}
                </div>
              ))}
            </div>

            <div style={{ ...card, padding: '12px' }}>
              <h3 style={{ marginTop: 0 }}>{isAdmin ? 'Timeline azioni immobile' : 'Le tue azioni programmate'}</h3>
              {getVisibleListingActionsForUser(listingDetail.actions).length === 0 && (
                <div style={{ color: '#64748b' }}>
                  {isAdmin ? 'Nessuna azione registrata.' : 'Nessuna azione programmata da te per questo immobile.'}
                </div>
              )}
              {getVisibleListingActionsForUser(listingDetail.actions).map((a) => (
                <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                  <strong>[{a.actionType}] {a.title || 'Aggiornamento'}</strong> | {fmt(a.createdAt)}<br />
                  {a.content}
                  {a.outcome ? <div style={{ color: '#475569', marginTop: '4px' }}><strong>Esito:</strong> {a.outcome}</div> : null}
                  {a.nextActionAt ? <div style={{ color: '#475569' }}><strong>Prossima azione:</strong> {fmt(a.nextActionAt)}</div> : null}
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{a.createdBy.firstName} {a.createdBy.lastName}</div>
                </div>
              ))}
            </div>

            {listingDetail.canWrite && (
              <div style={{ ...card, padding: '12px', display: 'grid', gap: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Nuova azione operativa</h3>
                <select value={listingActionForm.actionType} onChange={(e) => setListingActionForm((p) => ({ ...p, actionType: e.target.value }))} style={inputStyle}>
                  <option value="NOTE">Nota</option>
                  <option value="CALL">Chiamata</option>
                  <option value="VISIT_SET">Appuntamento fissato</option>
                  <option value="RECALL">Da richiamare</option>
                  <option value="STATUS">Stato</option>
                  <option value="HANDOVER">Handover</option>
                </select>
                <input value={listingActionForm.title} onChange={(e) => setListingActionForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titolo" style={inputStyle} />
                <textarea value={listingActionForm.content} onChange={(e) => setListingActionForm((p) => ({ ...p, content: e.target.value }))} placeholder="Contenuto" style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} />
                <input value={listingActionForm.outcome} onChange={(e) => setListingActionForm((p) => ({ ...p, outcome: e.target.value }))} placeholder="Esito (opzionale)" style={inputStyle} />
                <input type="datetime-local" value={listingActionForm.nextActionAt} onChange={(e) => setListingActionForm((p) => ({ ...p, nextActionAt: e.target.value }))} style={inputStyle} />
                <button type="button" style={btnPrimary} onClick={saveListingAction}>Salva azione</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (streetCtx) {
    const isManualStreetView = String(streetCtx.streetId || '').startsWith('altro-')
    const getVisibleStreetArchiveLogs = () => {
      if (!streetWs) return []
      const rawLogs = Array.isArray(streetWs.logs) ? streetWs.logs : []
      if (isAdmin) return rawLogs

      const currentAgentName = `${String(user?.firstName || '').trim()} ${String(user?.lastName || '').trim()}`.trim().toLowerCase()
      const activeAssignment = (streetWs.assignmentHistory || []).find((a) => a.isActive)
      const activeAssignedAtTs = activeAssignment?.assignedAt ? new Date(activeAssignment.assignedAt).getTime() : null

      return rawLogs.filter((l: any) => {
        const metadata = l?.metadata || {}
        const traceEvent = String(metadata?.traceEvent || '').trim()
        const isAutomaticTrace = traceEvent.startsWith('ZONE_')
        if (isAutomaticTrace) return false

        const logAgentName = `${String(l?.createdBy?.firstName || '').trim()} ${String(l?.createdBy?.lastName || '').trim()}`.trim().toLowerCase()
        const isCurrentAgentLog = currentAgentName && logAgentName === currentAgentName
        if (isCurrentAgentLog) return false

        if (activeAssignedAtTs) {
          const logTs = new Date(l.createdAt).getTime()
          if (!Number.isFinite(logTs) || logTs >= activeAssignedAtTs) return false
        }

        return true
      })
    }
    const visibleStreetArchiveLogs = getVisibleStreetArchiveLogs()
    return (
      <div>
        <button type="button" onClick={() => setStreetCtx(null)} style={{ ...inputStyle, width: 'auto', marginBottom: '10px' }}>
          {'<'}- Torna al gruppo
        </button>
        <div style={{ ...card, padding: '14px', marginBottom: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '1.7rem' }}>Scheda via: {streetCtx.streetName}</h1>
          <p style={{ marginTop: '6px', color: '#64748b' }}>
            {streetCtx.region} {'>'} {streetCtx.province} {'>'} {streetCtx.city} {'>'} CAP {streetCtx.cap} {'>'} Gruppo {streetCtx.groupIndex}
          </p>
        </div>

        {streetLoading && <div style={{ ...card, padding: '12px' }}>Caricamento scheda via...</div>}
        {!streetLoading && streetWs && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(4, minmax(0, 1fr))' }}>
            <div style={{ ...card, padding: '12px', gridColumn: isMobileLayout ? 'auto' : 'span 2' }}>
              <h3 style={{ marginTop: 0 }}>Statistiche e mercato della via</h3>
              {streetInsightsLoading && <div style={{ color: '#64748b' }}>Caricamento dati mercato...</div>}
              {!streetInsightsLoading && !streetInsights && (
                <div style={{ color: '#64748b' }}>
                  Dati mercato non disponibili per questa via al momento.
                </div>
              )}
              {!streetInsightsLoading && streetInsights && (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {(typeof streetInsights.lat === 'number' && typeof streetInsights.lng === 'number') ||
                  deriveCenterFromGeom(streetInsights.geomCoordinates || null) ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '6px' }}>Mappa zona (OpenStreetMap)</div>
                      {(() => {
                        const center = deriveCenterFromGeom(streetInsights.geomCoordinates || null)
                        const mapLat = typeof streetInsights.lat === 'number' ? streetInsights.lat : center?.[0]
                        const mapLng = typeof streetInsights.lng === 'number' ? streetInsights.lng : center?.[1]
                        if (typeof mapLat !== 'number' || typeof mapLng !== 'number') return null
                        return (
                      <StreetMap
                        lat={mapLat}
                        lng={mapLng}
                        geomCoordinates={streetInsights.geomCoordinates || null}
                      />
                        )
                      })()}
                    </div>
                  ) : null}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                      {streetInsights.marketTitle || `Mercato immobiliare in ${streetCtx.streetName}`}
                    </div>
                    <div><strong>Prezzo medio al m�:</strong> {streetInsights.avgPricePerSqm || '-'}</div>
                    {streetInsights.avgRangeText && <div><strong>Range indicativo:</strong> {streetInsights.avgRangeText}</div>}
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                      Andamento dei prezzi immobiliari e tendenze di mercato a {streetCtx.city} ({streetCtx.cap})
                    </div>
                    <div style={{ color: '#334155' }}>{streetInsights.trendSummary || '-'}</div>
                    {streetInsights.trendLongTerm && <div style={{ color: '#334155', marginTop: '6px' }}>{streetInsights.trendLongTerm}</div>}
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                      {streetInsights.cityAverageTitle || `Prezzi medi a ${streetCtx.city} (${streetCtx.cap})`}
                    </div>
                    <div><strong>Prezzi delle case:</strong> {streetInsights.houseSummary || '-'}</div>
                    <div style={{ marginTop: '6px' }}><strong>Prezzi degli appartamenti:</strong> {streetInsights.apartmentSummary || '-'}</div>
                    {streetInsights.sourceUrl && (
                      <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                        Fonte: <a href={streetInsights.sourceUrl} target="_blank" rel="noreferrer">RealAdvisor</a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div style={{ ...card, padding: '12px', gridColumn: isMobileLayout ? 'auto' : 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Immobili presenti nella via</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {streetListingsSnapshot ? (
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Aggiornato: {fmt(streetListingsSnapshot.fetchedAt)} (scade {fmt(streetListingsSnapshot.expiresAt)})
                    </span>
                  ) : null}
                  <button
                    type="button"
                    style={btnPrimary}
                    onClick={() => refreshStreetListings(true)}
                    disabled={isManualStreetView}
                    title={isManualStreetView ? 'Via aggiunta manualmente: aggiornamento automatico non disponibile' : undefined}
                  >
                    Aggiorna immobili via
                  </button>
                </div>
              </div>
              {streetListingsWarning ? (
                <div style={{ marginTop: '8px', border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', borderRadius: '8px', padding: '8px' }}>
                  {streetListingsWarning}
                </div>
              ) : null}
              {streetListingsLoading ? (
                <div style={{ marginTop: '10px', color: '#64748b' }}>Caricamento immobili...</div>
              ) : null}
              {!streetListingsLoading && streetListings.length === 0 ? (
                <div style={{ marginTop: '10px', color: '#64748b' }}>Nessun immobile disponibile per questa via.</div>
              ) : null}
              {!streetListingsLoading && streetListings.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    marginTop: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
                  }}
                >
                  {streetListings.map((listing) => (
                    <div key={listing.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px', background: '#fff' }}>
                      {(() => {
                        const isManualListing = Boolean(manualStreetListingMap[String(listing.id)])
                        const linkedZonePropertyId = manualStreetListingMap[String(listing.id)] || ''
                        return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          {listing.mainImageUrl ? (
                            <img
                              src={listing.mainImageUrl}
                              alt={listing.title || `Immobile ${listing.sourceListingId}`}
                              style={{ width: '108px', height: '78px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #e5e7eb' }}
                            />
                          ) : null}
                          <div>
                            <div style={{ fontWeight: 700 }}>{listing.title || `Immobile ${listing.sourceListingId}`}</div>
                            <div style={{ color: '#475569', marginTop: '4px', fontSize: '0.92rem' }}>
                              {listing.priceText || '-'} | {listing.surfaceText || '-'} | {listing.roomsText || '-'} {listing.floorText ? `| ${listing.floorText}` : ''}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '3px' }}>
                              Agenzia: {listing.agencyName || '-'} | Stato: {listing.listingStatus} | Ultimo visto: {fmt(listing.lastSeenAt)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {isManualListing ? (
                            <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1 }}>Sorgente interna</span>
                          ) : (
                            <a
                              href={listing.listingUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1 }}
                              onClick={() => {
                                void trackListingEvent(
                                  listing.id,
                                  `Apertura annuncio sorgente � ${listing.title || listing.sourceListingId}`,
                                  `${actorLabel} ha cliccato su "Apri annuncio dettaglio" per "${listing.title || listing.sourceListingId}" alle ${new Date().toLocaleString('it-IT')}.`,
                                  {
                                    traceEvent: 'ZONE_LISTING_SOURCE_OPEN',
                                    listingTitle: listing.title || null,
                                    listingUrl: listing.listingUrl || null
                                  }
                                )
                              }}
                            >
                              Sorgente
                            </a>
                          )}
                          <button
                            type="button"
                            style={{ ...btnPrimary, padding: '7px 10px', borderRadius: '8px', fontSize: '0.95rem', lineHeight: 1.1 }}
                            onClick={() => {
                              if (isManualListing && linkedZonePropertyId) {
                                setZonePropertyDetailId(linkedZonePropertyId)
                                setStreetCtx(null)
                                setGroupPage((p) => ({ ...p, mode: 'zone_property_detail' }))
                                return
                              }
                              openListingDetail(listing.id)
                            }}
                          >
                            Apri scheda immobile
                          </button>
                        </div>
                      </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div style={{ ...card, padding: '12px' }}>
              <h3 style={{ marginTop: 0 }}>Storico assegnazioni</h3>
              {streetWs.assignmentHistory.map((a) => (
                <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                  <strong>{a.agent.firstName} {a.agent.lastName}</strong> | {fmt(a.assignedAt)} - {a.isActive ? 'in corso' : fmt(a.endedAt)}
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: '12px' }}>
              <h3 style={{ marginTop: 0 }}>Archivio via</h3>
              {visibleStreetArchiveLogs.length === 0 && <div style={{ color: '#64748b' }}>Nessun archivio precedente disponibile per questa via.</div>}
              {visibleStreetArchiveLogs.map((l: any) => (
                <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                  <strong>[{l.entryType}] {l.title || 'Aggiornamento'}</strong><br />{l.content}
                  {(l?.metadata?.kind === 'ZONE_SIGN' || l?.metadata?.kind === 'ZONE_SIGN_ACTION') ? (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#1d4ed8', padding: '7px 10px', fontSize: '0.9rem' }}
                        onClick={() => {
                          const signId = l?.metadata?.kind === 'ZONE_SIGN_ACTION'
                            ? String(l?.metadata?.zoneSignLogId || '')
                            : String(l.id)
                          if (!signId) return
                          setZoneSignDetailId(signId)
                          setStreetCtx(null)
                          setGroupPage((p) => ({ ...p, mode: 'zone_sign_detail' }))
                        }}
                      >
                        Apri scheda cartello
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {streetWs.canWrite && (
              <div style={{ ...card, padding: '12px', display: 'grid', gap: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Nuovo aggiornamento via</h3>
                <select value={streetLogForm.entryType} onChange={(e) => setStreetLogForm((p) => ({ ...p, entryType: e.target.value }))} style={inputStyle}>
                  <option value="NOTE">Nota</option>
                  <option value="STATUS">Stato</option>
                  <option value="STATISTICS">Statistiche</option>
                  <option value="HANDOVER">Passaggio consegne</option>
                </select>
                <input value={streetLogForm.title} onChange={(e) => setStreetLogForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titolo" style={inputStyle} />
                <textarea value={streetLogForm.content} onChange={(e) => setStreetLogForm((p) => ({ ...p, content: e.target.value }))} placeholder="Contenuto" style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} />
                <button type="button" style={btnPrimary} onClick={saveStreetLog}>Salva aggiornamento</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (wsCtx) {
    const fallbackAssignmentId =
      ws?.assignmentHistory.find((a) => a.isActive)?.id ||
      ws?.assignmentHistory[0]?.id ||
      null
    const selectedAssignmentId = groupPage.assignmentId || fallbackAssignmentId
    const selectedAssignment = selectedAssignmentId ? (ws?.assignmentHistory.find((a) => a.id === selectedAssignmentId) || null) : null
    const selectedAssignmentLogs = selectedAssignmentId ? assignmentScopedLogs(selectedAssignmentId) : []
    const visibleSelectedAssignmentLogs = (() => {
      if (isAdmin) return selectedAssignmentLogs
      const currentAgentName = `${String(user?.firstName || '').trim()} ${String(user?.lastName || '').trim()}`.trim().toLowerCase()
      const selectedAssignmentStartTs = selectedAssignment?.assignedAt ? new Date(selectedAssignment.assignedAt).getTime() : null
      return selectedAssignmentLogs.filter((l: any) => {
        const metadata = l?.metadata || {}
        const traceEvent = String(metadata?.traceEvent || '').trim()
        const isAutomaticTrace = traceEvent.startsWith('ZONE_')
        if (isAutomaticTrace) return false

        const logAgentName = `${String(l?.createdBy?.firstName || '').trim()} ${String(l?.createdBy?.lastName || '').trim()}`.trim().toLowerCase()
        const isCurrentAgentLog = currentAgentName && logAgentName === currentAgentName
        if (isCurrentAgentLog) return false

        if (selectedAssignmentStartTs) {
          const logTs = new Date(l.createdAt).getTime()
          if (!Number.isFinite(logTs) || logTs >= selectedAssignmentStartTs) return false
        }
        return true
      })
    })()
    const selectedAssignmentIsHistory = Boolean(selectedAssignment && !selectedAssignment.isActive)
    const allGroupZoneNotes = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_NOTE')
    const allGroupZoneClients = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_CLIENT')
    const zoneNotes = selectedAssignmentLogs.filter((l: any) => l?.metadata?.kind === 'ZONE_NOTE')
    const zoneClients = selectedAssignmentLogs.filter((l: any) => l?.metadata?.kind === 'ZONE_CLIENT')
    const zoneSigns = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_SIGN')
    const zoneProperties = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_PROPERTY')
    const zoneLogEntries = (ws?.logs || [])
      .filter((l: any) => {
        const kind = String(l?.metadata?.kind || '')
        return (
          kind === 'ZONE_NOTE' ||
          kind === 'ZONE_SIGN' ||
          kind === 'ZONE_PROPERTY' ||
          kind === 'ZONE_CLIENT' ||
          kind === 'ZONE_CLIENT_RECORD' ||
          kind === 'ZONE_CLIENT_RECORD_UPDATE' ||
          kind === 'ZONE_CLIENT_RECORD_NOTE' ||
          kind === 'ZONE_SIGN_ACTION'
        )
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const zoneLogStreetOptions = Array.from(
      new Set(
        zoneLogEntries
          .map((l: any) => String(l?.metadata?.streetName || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'it'))
    const filteredZoneLogEntries = zoneLogEntries.filter((l: any) => {
      const keyword = zoneLogKeyword.trim().toLowerCase()
      const content = [
        l?.title || '',
        l?.content || '',
        l?.createdBy?.firstName || '',
        l?.createdBy?.lastName || '',
        l?.metadata?.streetName || '',
        l?.metadata?.fullName || '',
        l?.metadata?.phone || '',
        l?.metadata?.email || ''
      ].join(' ').toLowerCase()
      const matchesKeyword = !keyword || content.includes(keyword)
      const streetName = String(l?.metadata?.streetName || '').trim()
      const matchesStreet = zoneLogStreetFilter === 'ALL' || streetName === zoneLogStreetFilter
      return matchesKeyword && matchesStreet
    })
    const zoneClientRecordCreates = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_CLIENT_RECORD')
    const zoneClientRecordUpdates = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_CLIENT_RECORD_UPDATE')
    const zoneClientRecordNotes = (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_CLIENT_RECORD_NOTE')
    const zoneClientRecords = (() => {
      const map = new Map<string, any>()
      zoneClientRecordCreates.forEach((l: any) => {
        const id = String(l?.metadata?.clientRecordId || l.id)
        map.set(id, {
          id,
          firstName: String(l?.metadata?.firstName || '').trim(),
          lastName: String(l?.metadata?.lastName || '').trim(),
          fullName: String(l?.metadata?.fullName || '').trim(),
          phone: String(l?.metadata?.phone || '').trim(),
          email: String(l?.metadata?.email || '').trim(),
          address: String(l?.metadata?.address || '').trim(),
          city: String(l?.metadata?.city || wsCtx.city).trim(),
          province: String(l?.metadata?.province || wsCtx.province).trim(),
          zipCode: String(l?.metadata?.zipCode || wsCtx.cap).trim(),
          type: String(l?.metadata?.contactType || 'SELLER'),
          note: String(l?.metadata?.note || l.content || '').trim(),
          createdAt: l.createdAt,
          createdBy: l.createdBy
        })
      })
      zoneClientRecordUpdates
        .slice()
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach((l: any) => {
          const id = String(l?.metadata?.clientRecordId || '')
          const curr = map.get(id)
          if (!curr) return
          map.set(id, {
            ...curr,
            firstName: String(l?.metadata?.firstName || curr.firstName || '').trim(),
            lastName: String(l?.metadata?.lastName || curr.lastName || '').trim(),
            fullName: String(l?.metadata?.fullName || `${l?.metadata?.firstName || curr.firstName || ''} ${l?.metadata?.lastName || curr.lastName || ''}`).trim(),
            phone: String(l?.metadata?.phone || curr.phone || '').trim(),
            email: String(l?.metadata?.email || curr.email || '').trim(),
            address: String(l?.metadata?.address || curr.address || '').trim(),
            city: String(l?.metadata?.city || curr.city || wsCtx.city).trim(),
            province: String(l?.metadata?.province || curr.province || wsCtx.province).trim(),
            zipCode: String(l?.metadata?.zipCode || curr.zipCode || wsCtx.cap).trim(),
            type: String(l?.metadata?.contactType || curr.type || 'SELLER'),
            note: String(l?.metadata?.note || curr.note || '').trim()
          })
        })
      return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'it'))
    })()
    const selectedZoneClientRecord = zoneClientDetailId
      ? zoneClientRecords.find((c) => String(c.id) === String(zoneClientDetailId)) || null
      : null
    const selectedZoneClientNotes = selectedZoneClientRecord
      ? zoneClientRecordNotes
          .filter((l: any) => String(l?.metadata?.clientRecordId || '') === String(selectedZoneClientRecord.id))
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
    const zoneSignDetail = zoneSignDetailId
      ? zoneSigns.find((l: any) => String(l.id) === String(zoneSignDetailId)) || null
      : null
    const zonePropertyDetail = zonePropertyDetailId
      ? zoneProperties.find((l: any) => String(l.id) === String(zonePropertyDetailId)) || null
      : null
    const zoneSignActions = zoneSignDetail
      ? (ws?.logs || []).filter((l: any) => l?.metadata?.kind === 'ZONE_SIGN_ACTION' && String(l?.metadata?.zoneSignLogId || '') === String(zoneSignDetail.id))
      : []
    const zoneSignCurrentStatus = (() => {
      const latest = [...zoneSignActions].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      return String(latest?.metadata?.status || zoneSignDetail?.metadata?.status || 'NEW')
    })()
    const selectableStreetItems = getSelectableStreetItems()
    const safeStreetItems = ws?.streetItems || []
    const safeStreetNames = ws?.streets || []
    const baseGroupStreetItems = safeStreetItems.length > 0
      ? safeStreetItems.map((s) => ({ id: s.id, name: s.name }))
      : safeStreetNames.map((name) => ({ id: name, name }))
    const additionalStreetNames = Array.from(
      new Set(
        [...zoneSigns, ...zoneProperties]
          .map((l: any) => String(l?.metadata?.streetName || '').trim())
          .filter(Boolean)
      )
    )
    const groupStreetItems = (() => {
      const existing = new Set(baseGroupStreetItems.map((s) => s.name.toLowerCase()))
      const extra = additionalStreetNames
        .filter((name) => !existing.has(name.toLowerCase()))
        .map((name, idx) => ({ id: `altro-${idx}-${name}`, name: `${name} (ALTRO)` }))
      return [...baseGroupStreetItems, ...extra]
    })()
    const formStreetOptions = (() => {
      const byId = new Map<string, { id: string; name: string; isManual?: boolean }>()
      selectableStreetItems.forEach((s: any) => byId.set(String(s.id), { id: String(s.id), name: String(s.name || ''), isManual: Boolean(s.isManual) }))
      groupStreetItems.forEach((s: any) => {
        const id = String(s.id || s.name)
        if (!byId.has(id)) byId.set(id, { id, name: String(s.name || ''), isManual: /\(ALTRO\)\s*$/i.test(String(s.name || '')) })
      })
      const list = Array.from(byId.values()).filter((s) => String(s.name || '').trim())
      if (list.length > 0) return list
      return [{ id: '__whole_zone__', name: 'Intera zona', isManual: true }]
    })()
    const latestZoneSigns = zoneSigns.slice(0, 3)
    const latestZoneProperties = zoneProperties.slice(0, 3)
    const latestAssignmentLogs = visibleSelectedAssignmentLogs.slice(0, 4)
    const latestZoneLogEntries = filteredZoneLogEntries.slice(0, 6)
    const megaGridRows = zoneLogEntries.map((l: any) => {
      const metadata = l?.metadata || {}
      const createdBy = `${String(l?.createdBy?.firstName || '').trim()} ${String(l?.createdBy?.lastName || '').trim()}`.trim() || '-'
      const kind = String(metadata.kind || 'ALTRO')
      const street = String(metadata.streetName || '').trim()
      const fullName = String(metadata.fullName || '').trim()
      const phone = String(metadata.phone || '').trim()
      const email = String(metadata.email || '').trim()
      const contactType = String(metadata.contactType || '').trim()
      const address = [metadata.address, metadata.city, metadata.province, metadata.zipCode].filter(Boolean).join(', ')
      const hasPhoto = Boolean(getZonePrimaryPhoto(metadata))
      const searchable = [
        l?.title || '',
        l?.content || '',
        createdBy,
        kind,
        street,
        fullName,
        phone,
        email,
        contactType,
        address
      ].join(' ').toLowerCase()
      return {
        id: String(l.id),
        rawId: String(l.id),
        rawMetadata: metadata,
        kind,
        createdAt: String(l.createdAt || ''),
        createdAtTs: new Date(String(l.createdAt || '')).getTime(),
        createdBy,
        title: String(l?.title || '').trim(),
        content: String(l?.content || '').trim(),
        street,
        fullName,
        phone,
        email,
        contactType,
        address,
        hasPhoto,
        searchable
      }
    })
    const openMegaGridRowDetail = (row: any) => {
      const kind = String(row?.kind || '')
      if (kind === 'ZONE_SIGN' || kind === 'ZONE_SIGN_ACTION') {
        const signTargetId = kind === 'ZONE_SIGN_ACTION'
          ? String(row?.rawMetadata?.zoneSignLogId || '')
          : String(row?.rawId || '')
        if (signTargetId) {
          setZoneSignDetailId(signTargetId)
          setGroupPage({ mode: 'zone_sign_detail', assignmentId: selectedAssignmentId })
          return
        }
      }
      if (kind === 'ZONE_PROPERTY') {
        const propertyId = String(row?.rawId || '')
        if (propertyId) {
          setZonePropertyDetailId(propertyId)
          setGroupPage({ mode: 'zone_property_detail', assignmentId: selectedAssignmentId })
          return
        }
      }
      if (kind === 'ZONE_CLIENT_RECORD' || kind === 'ZONE_CLIENT_RECORD_UPDATE' || kind === 'ZONE_CLIENT_RECORD_NOTE') {
        const clientRecordId = String(row?.rawMetadata?.clientRecordId || '')
        if (clientRecordId) {
          setZoneClientDetailId(clientRecordId)
          setGroupPage({ mode: 'zone_client_detail', assignmentId: selectedAssignmentId })
          return
        }
      }
      if (kind === 'ZONE_CLIENT') {
        setGroupPage({ mode: 'clients_archive', assignmentId: selectedAssignmentId })
        return
      }
      setGroupPage({ mode: 'zone_log', assignmentId: selectedAssignmentId })
    }
    const megaGridKindOptions = Array.from(
      new Set([
        'ZONE_NOTE',
        'ZONE_SIGN',
        'ZONE_PROPERTY',
        'ZONE_CLIENT',
        'ZONE_CLIENT_RECORD',
        'ZONE_CLIENT_RECORD_UPDATE',
        'ZONE_CLIENT_RECORD_NOTE',
        'ZONE_SIGN_ACTION',
        ...megaGridRows.map((r) => r.kind)
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'it'))
    const megaGridStreetOptions = Array.from(
      new Set([
        ...groupStreetItems.map((s) => String(s.name || '').replace(/\s*\(ALTRO\)\s*$/i, '').trim()),
        ...megaGridRows.map((r) => r.street)
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'it'))
    const megaGridAuthorOptions = Array.from(
      new Set([
        ...(ws?.assignmentHistory || []).map((a: any) => `${String(a?.agent?.firstName || '').trim()} ${String(a?.agent?.lastName || '').trim()}`.trim()),
        ...megaGridRows.map((r) => r.createdBy)
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'it'))
    const megaGridContactTypeOptions = Array.from(
      new Set(['SELLER', 'LEAD', ...megaGridRows.map((r) => r.contactType)].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'it'))
    const megaGridRowsFiltered = megaGridRows
      .filter((row) => {
        const keyword = megaGridKeyword.trim().toLowerCase()
        if (keyword && !row.searchable.includes(keyword)) return false
        if (megaGridKindFilter !== 'ALL' && row.kind !== megaGridKindFilter) return false
        if (megaGridStreetFilter !== 'ALL' && row.street !== megaGridStreetFilter) return false
        if (megaGridAuthorFilter !== 'ALL' && row.createdBy !== megaGridAuthorFilter) return false
        if (megaGridContactTypeFilter !== 'ALL' && row.contactType !== megaGridContactTypeFilter) return false
        if (megaGridWithPhoto === 'YES' && !row.hasPhoto) return false
        if (megaGridWithPhoto === 'NO' && row.hasPhoto) return false
        if (megaGridDateFrom) {
          const fromTs = new Date(`${megaGridDateFrom}T00:00:00`).getTime()
          if (Number.isFinite(fromTs) && row.createdAtTs < fromTs) return false
        }
        if (megaGridDateTo) {
          const toTs = new Date(`${megaGridDateTo}T23:59:59`).getTime()
          if (Number.isFinite(toTs) && row.createdAtTs > toTs) return false
        }
        return true
      })
      .sort((a, b) => megaGridSort === 'DESC' ? b.createdAtTs - a.createdAtTs : a.createdAtTs - b.createdAtTs)
    const dailyListings = groupOverview?.dailyListings || []
    const activeDailyListing = dailyListings.length > 0 ? dailyListings[dailySlideIndex % dailyListings.length] : null
    return (
      <div>
        <button type="button" onClick={() => setWsCtx(null)} style={{ ...inputStyle, width: 'auto', marginBottom: '10px' }}>
          {'<'}- Torna a Task di zona
        </button>
        <div style={{ ...card, padding: '14px', marginBottom: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Scheda gruppo CAP {wsCtx.cap} - Gruppo {wsCtx.groupIndex}</h1>
          <p style={{ marginTop: '6px', color: '#64748b' }}>{wsCtx.region} {'>'} {wsCtx.province} {'>'} {wsCtx.city}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={btnPrimary} onClick={exportCsv}>Export CSV</button>
            <button type="button" style={btnPrimary} onClick={exportPdf}>Export PDF</button>
            <button
              type="button"
              style={{ ...btnPrimary, background: '#475569' }}
              onClick={() => setGroupPage({ mode: 'zone_clients_registry', assignmentId: selectedAssignmentId })}
            >
              Tab clienti di zona
            </button>
            <button
              type="button"
              style={{ ...btnPrimary, background: '#0f766e' }}
              onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: null })}
            >
              Aggiungi informazioni di zona
            </button>
          </div>
        </div>
        {wsLoading && <div style={{ ...card, padding: '12px' }}>Caricamento...</div>}
        {!wsLoading && ws && (
          <div style={{ display: 'grid', gap: '12px' }}>
            {groupPage.mode === 'add_zone_info_menu' && (
              <div style={{ ...card, padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Aggiungi informazioni di zona</h3>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    onClick={() => setGroupPage({ mode: 'list', assignmentId: null })}
                  >
                    Torna alla scheda gruppo
                  </button>
                </div>
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                      <button type="button" style={{ ...btnPrimary, background: '#1d4ed8' }} onClick={() => setGroupPage({ mode: 'add_zone_sign', assignmentId: groupPage.assignmentId })}>
                        AGGIUNGI CARTELLO DI ZONA
                  </button>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#2563eb' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_property', assignmentId: groupPage.assignmentId })}
                  >
                    AGGIUNGI IMMOBILE DI ZONA
                  </button>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#0f766e' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_client', assignmentId: selectedAssignmentId })}
                  >
                    AGGIUNGI CLIENTE DI ZONA
                  </button>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#334155' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_note', assignmentId: selectedAssignmentId })}
                  >
                    AGGIUNGI INFORMAZIONI DI ZONA
                  </button>
                </div>
              </div>
            )}
            {groupPage.mode === 'add_zone_note' && (
              <div style={{ ...card, padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Nuova nota di zona</h3>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: groupPage.assignmentId })}
                  >
                    Torna al menu
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <input
                    value={zoneNoteForm.title}
                    onChange={(e) => setZoneNoteForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Titolo nota (opzionale)"
                    style={inputStyle}
                  />
                  <select
                    value={zoneNoteForm.streetId}
                    onChange={(e) => setZoneNoteForm((p) => ({ ...p, streetId: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Sotto-zona: tutta la zona</option>
                    {formStreetOptions.map((street) => (
                      <option key={street.id} value={street.id}>{street.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={zoneNoteForm.content}
                    onChange={(e) => setZoneNoteForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Inserisci informazioni di zona"
                    style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
                  />
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ fontSize: '0.88rem', color: '#334155' }}>Foto nota zona (opzionale)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => onZoneNotePhotoSelected(e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                    {zoneNoteForm.photoDataUrl ? (
                      <img src={zoneNoteForm.photoDataUrl} alt="Anteprima nota zona" style={{ width: '220px', maxWidth: '100%', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    ) : null}
                  </div>
                  <button type="button" style={btnPrimary} onClick={saveZoneNote}>Salva nota di zona</button>
                </div>
              </div>
            )}
            {groupPage.mode === 'add_zone_sign' && (
              <div style={{ ...card, padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Aggiungi cartello di zona</h3>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: groupPage.assignmentId })}
                  >
                    Torna al menu
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '0.88rem', color: '#334155' }}>VIA</label>
                  <select
                    value={zoneSignForm.streetId}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, streetId: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Seleziona via</option>
                    {formStreetOptions.map((street) => (
                      <option key={street.id} value={street.id}>{street.name}</option>
                    ))}
                    <option value="__add_custom__">AGGIUNGI VIA</option>
                  </select>
                  {zoneSignForm.streetId === '__add_custom__' && (
                    <input
                      value={zoneSignForm.customStreetName}
                      onChange={(e) => setZoneSignForm((p) => ({ ...p, customStreetName: e.target.value }))}
                      placeholder="Inserisci nuova via (ALTRO)"
                      style={inputStyle}
                    />
                  )}
                  <input
                    value={zoneSignForm.civicNumber}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, civicNumber: e.target.value }))}
                    placeholder="Numero civico"
                    style={inputStyle}
                  />
                  <input
                    value={zoneSignForm.ownerFullName}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, ownerFullName: e.target.value }))}
                    placeholder="Nome e cognome proprietario (opzionale)"
                    style={inputStyle}
                  />
                  <input
                    value={zoneSignForm.phone}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Numero di telefono"
                    style={inputStyle}
                  />
                  <input
                    value={zoneSignForm.apartmentFeatures}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, apartmentFeatures: e.target.value }))}
                    placeholder="Caratteristiche appartamento"
                    style={inputStyle}
                  />
                  <textarea
                    value={zoneSignForm.note}
                    onChange={(e) => setZoneSignForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Note"
                    style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                  />
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ fontSize: '0.88rem', color: '#334155' }}>Aggiungi foto cartello</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => onZoneSignPhotoSelected(e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                    {zoneSignForm.photoDataUrl ? (
                      <img src={zoneSignForm.photoDataUrl} alt="Anteprima cartello" style={{ width: '220px', maxWidth: '100%', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    ) : null}
                  </div>
                  <button type="button" style={btnPrimary} onClick={saveZoneSign}>Salva cartello di zona</button>
                </div>
              </div>
            )}
            {groupPage.mode === 'add_zone_property' && (
              <div style={{ ...card, padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Aggiungi immobile di zona</h3>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: groupPage.assignmentId })}
                  >
                    Torna al menu
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '0.88rem', color: '#334155' }}>VIA</label>
                  <select
                    value={zonePropertyForm.streetId}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, streetId: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Seleziona via</option>
                    {formStreetOptions.map((street) => (
                      <option key={street.id} value={street.id}>{street.name}</option>
                    ))}
                    <option value="__add_custom__">AGGIUNGI VIA</option>
                  </select>
                  {zonePropertyForm.streetId === '__add_custom__' && (
                    <input
                      value={zonePropertyForm.customStreetName}
                      onChange={(e) => setZonePropertyForm((p) => ({ ...p, customStreetName: e.target.value }))}
                      placeholder="Inserisci nuova via (ALTRO)"
                      style={inputStyle}
                    />
                  )}
                  <input
                    value={zonePropertyForm.civicNumber}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, civicNumber: e.target.value }))}
                    placeholder="Numero civico"
                    style={inputStyle}
                  />
                  <input
                    value={zonePropertyForm.ownerFullName}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, ownerFullName: e.target.value }))}
                    placeholder="Nome e cognome proprietario (opzionale)"
                    style={inputStyle}
                  />
                  <input
                    value={zonePropertyForm.phone}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Numero di telefono"
                    style={inputStyle}
                  />
                  <input
                    value={zonePropertyForm.apartmentFeatures}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, apartmentFeatures: e.target.value }))}
                    placeholder="Caratteristiche appartamento"
                    style={inputStyle}
                  />
                  <textarea
                    value={zonePropertyForm.note}
                    onChange={(e) => setZonePropertyForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Note"
                    style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                  />
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ fontSize: '0.88rem', color: '#334155' }}>Aggiungi foto immobile</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => onZonePropertyPhotoSelected(e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                    {zonePropertyForm.photoDataUrl ? (
                      <img src={zonePropertyForm.photoDataUrl} alt="Anteprima immobile" style={{ width: '220px', maxWidth: '100%', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    ) : null}
                  </div>
                  <button type="button" style={btnPrimary} onClick={saveZoneProperty}>Salva immobile di zona</button>
                </div>
              </div>
            )}
            {groupPage.mode === 'add_zone_client' && (
              <div style={{ ...card, padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Aggiungi cliente di zona</h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{ ...btnPrimary, background: '#475569', padding: '8px 10px' }}
                      onClick={() => setGroupPage({ mode: 'zone_clients_registry', assignmentId: selectedAssignmentId })}
                    >
                      Apri tab clienti di zona
                    </button>
                    <button
                      type="button"
                      style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                      onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: selectedAssignmentId })}
                    >
                      Torna al menu
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr' }}>
                  <input value={zoneClientRecordForm.firstName} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nome*" style={inputStyle} />
                  <input value={zoneClientRecordForm.lastName} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Cognome*" style={inputStyle} />
                  <input value={zoneClientRecordForm.phone} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefono" style={inputStyle} />
                  <input value={zoneClientRecordForm.email} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={inputStyle} />
                  <input value={zoneClientRecordForm.address} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, address: e.target.value }))} placeholder="Indirizzo" style={inputStyle} />
                  <input value={zoneClientRecordForm.zipCode} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, zipCode: e.target.value }))} placeholder="CAP" style={inputStyle} />
                  <input value={zoneClientRecordForm.city} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, city: e.target.value }))} placeholder="Citt�" style={inputStyle} />
                  <input value={zoneClientRecordForm.province} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, province: e.target.value }))} placeholder="Provincia" style={inputStyle} />
                </div>
                <select value={zoneClientRecordForm.type} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, type: e.target.value as 'SELLER' | 'LEAD' }))} style={inputStyle}>
                  <option value="SELLER">Cliente venditore</option>
                  <option value="LEAD">Contatto vendita</option>
                </select>
                <textarea value={zoneClientRecordForm.note} onChange={(e) => setZoneClientRecordForm((p) => ({ ...p, note: e.target.value }))} placeholder="Note agente sul cliente" style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} />
                <button type="button" style={btnPrimary} onClick={saveZoneClientRecord}>Salva cliente di zona</button>
              </div>
            )}
            {groupPage.mode === 'list' && (
              <div style={{ ...card, padding: '12px' }}>
                <h3 style={{ marginTop: 0 }}>Storico assegnazioni</h3>
                {ws.assignmentHistory.map((a) => (
                  <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{a.agent.firstName} {a.agent.lastName}</strong> | {fmt(a.assignedAt)} - {a.isActive ? 'in corso' : fmt(a.endedAt)}
                      </div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {a.isActive ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setGroupPage({ mode: 'operational', assignmentId: a.id })}
                                style={{ ...btnPrimary, background: '#334155', padding: '8px 10px' }}
                              >
                                Apri scheda operativa
                              </button>
                              <button
                                type="button"
                                onClick={() => closeGroupAssignment(a.id)}
                                disabled={closingAssignmentId === a.id}
                                style={{ ...btnPrimary, background: '#0f766e', padding: '8px 10px' }}
                              >
                                Chiudi gruppo e archivia
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReassignModal({ assignmentId: a.id, open: true })
                                  setReassignAgentId('')
                                }}
                                disabled={closingAssignmentId === a.id}
                                style={{ ...btnPrimary, background: '#1d4ed8', padding: '8px 10px' }}
                              >
                                Chiudi, archivia e assegna
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGroupPage({ mode: 'history', assignmentId: a.id })}
                              style={{ ...btnPrimary, background: '#475569', padding: '8px 10px' }}
                            >
                              Visualizza storico
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {groupPage.mode === 'zone_sign_detail' && zoneSignDetail && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ ...card, padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '1.6rem' }}>
                        Cartello di zona - {String(zoneSignDetail?.metadata?.streetName || 'Via non specificata')} {String(zoneSignDetail?.metadata?.civicNumber || '').trim()}
                      </h1>
                      <p style={{ marginTop: '6px', color: '#64748b' }}>
                        {wsCtx.region} {'>'} {wsCtx.province} {'>'} {wsCtx.city} {'>'} CAP {wsCtx.cap} {'>'} Gruppo {wsCtx.groupIndex}
                      </p>
                    </div>
                    {getZonePrimaryPhoto(zoneSignDetail?.metadata) ? (
                      <img
                        src={String(getZonePrimaryPhoto(zoneSignDetail?.metadata))}
                        alt="Foto cartello"
                        style={{ width: '180px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      />
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <div><strong>Via:</strong> {String(zoneSignDetail?.metadata?.streetName || '-')}</div>
                    <div><strong>Civico:</strong> {String(zoneSignDetail?.metadata?.civicNumber || '-')}</div>
                    <div><strong>Telefono:</strong> {String(zoneSignDetail?.metadata?.phone || '-')}</div>
                    <div><strong>Proprietario:</strong> {String(zoneSignDetail?.metadata?.ownerFullName || '-')}</div>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={zoneSignCurrentStatus}
                      disabled={!ws?.canWrite || zoneSignStatusSaving}
                      onChange={(e) => saveZoneSignStatus(e.target.value)}
                      style={{ ...inputStyle, width: '260px' }}
                    >
                      <option value="NEW">NEW</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="CONTACTED">CONTACTED</option>
                      <option value="VISIT_BOOKED">VISIT_BOOKED</option>
                      <option value="CLOSED">CLOSED</option>
                      <option value="DISMISSED">DISMISSED</option>
                    </select>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>
                      Cartello di zona (sorgente interna)
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupPage({ mode: selectedAssignment?.isActive ? 'operational' : 'history', assignmentId: selectedAssignmentId })}
                      style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    >
                      Torna alla scheda assegnazione
                    </button>
                  </div>
                  {zoneSignDetail?.metadata?.apartmentFeatures ? (
                    <div style={{ marginTop: '8px' }}><strong>Caratteristiche:</strong> {String(zoneSignDetail.metadata.apartmentFeatures)}</div>
                  ) : null}
                  {zoneSignDetail?.metadata?.note ? (
                    <div style={{ marginTop: '8px', color: '#334155' }}>{String(zoneSignDetail.metadata.note)}</div>
                  ) : null}
                  <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '8px' }}>
                    Inserito il {fmt(zoneSignDetail.createdAt)} da {zoneSignDetail.createdBy.firstName} {zoneSignDetail.createdBy.lastName}
                  </div>
                </div>

                <div style={{ ...card, padding: '12px' }}>
                  <h3 style={{ marginTop: 0 }}>Storico assegnazioni immobile</h3>
                  {ws?.assignmentHistory.length === 0 && <div style={{ color: '#64748b' }}>Nessuno storico assegnazioni disponibile.</div>}
                  {(ws?.assignmentHistory || []).map((a) => (
                    <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                      <strong>{a.agent.firstName} {a.agent.lastName}</strong> | {fmt(a.assignedAt)} - {a.isActive ? 'in corso' : fmt(a.endedAt)}
                      {a.note ? <div style={{ color: '#475569' }}>{a.note}</div> : null}
                    </div>
                  ))}
                </div>

                <div style={{ ...card, padding: '12px' }}>
                  <h3 style={{ marginTop: 0 }}>Timeline azioni immobile</h3>
                  {zoneSignActions.length === 0 && <div style={{ color: '#64748b' }}>Nessuna azione registrata.</div>}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                    <strong>[STATUS] Cartello creato</strong> | {fmt(zoneSignDetail.createdAt)}<br />
                    {zoneSignDetail.content || 'Cartello di zona inserito'}
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{zoneSignDetail.createdBy.firstName} {zoneSignDetail.createdBy.lastName}</div>
                  </div>
                  {zoneSignActions.map((a: any) => (
                    <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                      <strong>[{String(a?.metadata?.actionType || 'NOTE')}] {a.title || 'Aggiornamento'}</strong> | {fmt(a.createdAt)}<br />
                      {a.content}
                      {a?.metadata?.outcome ? <div style={{ color: '#475569', marginTop: '4px' }}><strong>Esito:</strong> {String(a.metadata.outcome)}</div> : null}
                      {a?.metadata?.nextActionAt ? <div style={{ color: '#475569' }}><strong>Prossima azione:</strong> {fmt(String(a.metadata.nextActionAt))}</div> : null}
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{a.createdBy.firstName} {a.createdBy.lastName}</div>
                    </div>
                  ))}
                </div>

                {ws?.canWrite && (
                  <div style={{ ...card, padding: '12px', display: 'grid', gap: '8px' }}>
                    <h3 style={{ marginTop: 0 }}>Nuova azione operativa</h3>
                    <select value={zoneSignActionForm.actionType} onChange={(e) => setZoneSignActionForm((p) => ({ ...p, actionType: e.target.value }))} style={inputStyle}>
                      <option value="NOTE">Nota</option>
                      <option value="CALL">Chiamata</option>
                      <option value="VISIT_SET">Appuntamento fissato</option>
                      <option value="RECALL">Da richiamare</option>
                      <option value="STATUS">Stato</option>
                      <option value="HANDOVER">Handover</option>
                    </select>
                    <input value={zoneSignActionForm.title} onChange={(e) => setZoneSignActionForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titolo" style={inputStyle} />
                    <textarea value={zoneSignActionForm.content} onChange={(e) => setZoneSignActionForm((p) => ({ ...p, content: e.target.value }))} placeholder="Contenuto" style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} />
                    <input value={zoneSignActionForm.outcome} onChange={(e) => setZoneSignActionForm((p) => ({ ...p, outcome: e.target.value }))} placeholder="Esito (opzionale)" style={inputStyle} />
                    <input type="datetime-local" value={zoneSignActionForm.nextActionAt} onChange={(e) => setZoneSignActionForm((p) => ({ ...p, nextActionAt: e.target.value }))} style={inputStyle} />
                    <button type="button" style={btnPrimary} onClick={saveZoneSignAction} disabled={zoneSignActionSaving}>
                      {zoneSignActionSaving ? 'Salvataggio...' : 'Salva azione'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {groupPage.mode === 'zone_property_detail' && zonePropertyDetail && (
              <div style={{ ...card, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>
                    Scheda immobile di zona: {String(zonePropertyDetail?.metadata?.streetName || 'Via non specificata')} {String(zonePropertyDetail?.metadata?.civicNumber || '').trim()}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setGroupPage({ mode: selectedAssignment?.isActive ? 'operational' : 'history', assignmentId: selectedAssignmentId })}
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                  >
                    Torna alla scheda assegnazione
                  </button>
                </div>
                <div style={{ color: '#334155', marginTop: '8px' }}>
                  <strong>Via:</strong> {String(zonePropertyDetail?.metadata?.streetName || '-')}
                </div>
                <div style={{ color: '#334155', marginTop: '4px' }}>
                  <strong>Numero civico:</strong> {String(zonePropertyDetail?.metadata?.civicNumber || '-')}
                </div>
                <div style={{ color: '#334155', marginTop: '4px' }}>
                  <strong>Telefono:</strong> {String(zonePropertyDetail?.metadata?.phone || '-')}
                </div>
                {zonePropertyDetail?.metadata?.ownerFullName ? (
                  <div style={{ color: '#334155', marginTop: '4px' }}>
                    <strong>Proprietario:</strong> {String(zonePropertyDetail.metadata.ownerFullName)}
                  </div>
                ) : null}
                {zonePropertyDetail?.metadata?.apartmentFeatures ? (
                  <div style={{ color: '#334155', marginTop: '4px' }}>
                    <strong>Caratteristiche appartamento:</strong> {String(zonePropertyDetail.metadata.apartmentFeatures)}
                  </div>
                ) : null}
                {zonePropertyDetail?.metadata?.note ? (
                  <div style={{ color: '#334155', marginTop: '4px' }}>
                    <strong>Note:</strong> {String(zonePropertyDetail.metadata.note)}
                  </div>
                ) : null}
                {getZonePrimaryPhoto(zonePropertyDetail?.metadata) ? (
                  <img
                    src={String(getZonePrimaryPhoto(zonePropertyDetail?.metadata))}
                    alt="Foto immobile"
                    style={{ marginTop: '10px', width: '280px', maxWidth: '100%', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                ) : null}
                <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '8px' }}>
                  Inserito il {fmt(zonePropertyDetail.createdAt)} da {zonePropertyDetail.createdBy.firstName} {zonePropertyDetail.createdBy.lastName}
                </div>
              </div>
            )}

            {groupPage.mode === 'zone_clients_registry' && (
              <div style={{ ...card, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Clienti di zona - Tab gruppo</h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{ ...btnPrimary, background: '#0f766e', padding: '8px 10px' }}
                      onClick={() => setGroupPage({ mode: 'add_zone_client', assignmentId: selectedAssignmentId })}
                    >
                      Nuovo cliente di zona
                    </button>
                    <button
                      type="button"
                      style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                      onClick={() => setGroupPage({ mode: selectedAssignment?.isActive ? 'operational' : 'history', assignmentId: selectedAssignmentId })}
                    >
                      Torna alla scheda assegnazione
                    </button>
                  </div>
                </div>
                {zoneClientRecords.length === 0 && <div style={{ color: '#64748b', marginTop: '8px' }}>Nessun cliente di zona registrato.</div>}
                {zoneClientRecords.map((c: any) => (
                  <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{c.fullName || `${c.firstName} ${c.lastName}`}</strong>
                        <div style={{ color: '#475569', marginTop: '2px' }}>
                          {c.type === 'LEAD' ? 'Contatto vendita' : 'Cliente venditore'} | {c.phone || '-'} | {c.email || '-'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          {c.address || '-'} {c.city || ''} {c.province || ''} {c.zipCode || ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#1d4ed8', padding: '8px 10px' }}
                        onClick={() => {
                          setZoneClientDetailId(c.id)
                          setZoneClientRecordEditForm({
                            firstName: c.firstName || '',
                            lastName: c.lastName || '',
                            phone: c.phone || '',
                            email: c.email || '',
                            address: c.address || '',
                            city: c.city || wsCtx.city,
                            province: c.province || wsCtx.province,
                            zipCode: c.zipCode || wsCtx.cap,
                            type: (c.type === 'LEAD' ? 'LEAD' : 'SELLER'),
                            note: c.note || ''
                          })
                          setGroupPage((p) => ({ ...p, mode: 'zone_client_detail' }))
                        }}
                      >
                        Apri scheda cliente
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {groupPage.mode === 'zone_client_detail' && selectedZoneClientRecord && (
              <div style={{ ...card, padding: '12px', display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Scheda cliente di zona: {selectedZoneClientRecord.fullName || `${selectedZoneClientRecord.firstName} ${selectedZoneClientRecord.lastName}`}</h3>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    onClick={() => setGroupPage({ mode: 'zone_clients_registry', assignmentId: selectedAssignmentId })}
                  >
                    Torna alla tab clienti
                  </button>
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' }}>
                  <h4 style={{ marginTop: 0 }}>Dati cliente (modificabili)</h4>
                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr' }}>
                    <input value={zoneClientRecordEditForm.firstName} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nome*" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.lastName} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Cognome*" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.phone} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefono" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.email} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.address} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, address: e.target.value }))} placeholder="Indirizzo" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.zipCode} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, zipCode: e.target.value }))} placeholder="CAP" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.city} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, city: e.target.value }))} placeholder="Citt�" style={inputStyle} />
                    <input value={zoneClientRecordEditForm.province} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, province: e.target.value }))} placeholder="Provincia" style={inputStyle} />
                  </div>
                  <select value={zoneClientRecordEditForm.type} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, type: e.target.value as 'SELLER' | 'LEAD' }))} style={{ ...inputStyle, marginTop: '8px' }}>
                    <option value="SELLER">Cliente venditore</option>
                    <option value="LEAD">Contatto vendita</option>
                  </select>
                  <textarea value={zoneClientRecordEditForm.note} onChange={(e) => setZoneClientRecordEditForm((p) => ({ ...p, note: e.target.value }))} placeholder="Note sintetiche cliente" style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', marginTop: '8px' }} />
                  <button type="button" style={{ ...btnPrimary, marginTop: '8px' }} onClick={saveZoneClientRecordUpdate}>Salva modifiche cliente</button>
                </div>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' }}>
                  <h4 style={{ marginTop: 0 }}>Storico note cliente</h4>
                  {selectedZoneClientNotes.length === 0 && <div style={{ color: '#64748b' }}>Nessuna nota cliente registrata.</div>}
                  {selectedZoneClientNotes.map((n: any) => (
                    <div key={n.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                      <div>{n.content}</div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{fmt(n.createdAt)} - {n.createdBy.firstName} {n.createdBy.lastName}</div>
                    </div>
                  ))}
                  <textarea value={zoneClientRecordNote} onChange={(e) => setZoneClientRecordNote(e.target.value)} placeholder="Aggiungi nuova nota su questo cliente" style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} />
                  <button type="button" style={{ ...btnPrimary, marginTop: '8px' }} onClick={addZoneClientRecordNote}>Aggiungi nota cliente</button>
                </div>
              </div>
            )}

            {groupPage.mode !== 'list' && groupPage.mode !== 'add_zone_info_menu' && groupPage.mode !== 'add_zone_sign' && groupPage.mode !== 'add_zone_property' && groupPage.mode !== 'add_zone_client' && groupPage.mode !== 'add_zone_note' && groupPage.mode !== 'zone_clients_registry' && groupPage.mode !== 'zone_client_detail' && groupPage.mode !== 'zone_sign_detail' && groupPage.mode !== 'zone_property_detail' && selectedAssignment && (
              <>
                <div style={{ ...card, padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ marginTop: 0 }}>
                      {groupPage.mode === 'notes_archive'
                        ? 'Archivio note di zona'
                        : groupPage.mode === 'clients_archive'
                          ? 'Archivio clienti di zona'
                          : groupPage.mode === 'zone_log'
                            ? 'Log di Zona'
                          : selectedAssignmentIsHistory
                            ? 'Storico completo assegnazione'
                            : 'Scheda operativa assegnazione'}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        groupPage.mode === 'notes_archive' || groupPage.mode === 'clients_archive' || groupPage.mode === 'zone_log'
                          ? setGroupPage({ mode: selectedAssignment?.isActive ? 'operational' : 'history', assignmentId: groupPage.assignmentId })
                          : setGroupPage({ mode: 'list', assignmentId: null })
                      }
                      style={{ ...btnPrimary, background: '#64748b', padding: '8px 10px' }}
                    >
                      {groupPage.mode === 'notes_archive' || groupPage.mode === 'clients_archive' || groupPage.mode === 'zone_log'
                        ? 'Torna alla scheda assegnazione'
                        : 'Torna allo storico assegnazioni'}
                    </button>
                  </div>
                  <div style={{ color: '#334155', marginBottom: '10px' }}>
                    <strong>{selectedAssignment.agent.firstName} {selectedAssignment.agent.lastName}</strong> | {fmt(selectedAssignment.assignedAt)} - {selectedAssignment.isActive ? 'in corso' : fmt(selectedAssignment.endedAt)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <h4 style={{ margin: 0 }}>{ws.groupName}</h4>
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                      Vie: {groupStreetItems.length}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {groupStreetItems.map((street) => (
                      <button
                        type="button"
                        key={street.id}
                        onClick={() => {
                          if (String(street.id).startsWith('altro-')) {
                            openManualStreetWorkspace({
                              cap: wsCtx.cap,
                              groupIndex: wsCtx.groupIndex,
                              region: wsCtx.region,
                              province: wsCtx.province,
                              city: wsCtx.city,
                              streetId: String(street.id),
                              streetName: street.name
                            })
                            return
                          }
                          openStreetWorkspace({
                            cap: wsCtx.cap,
                            groupIndex: wsCtx.groupIndex,
                            region: wsCtx.region,
                            province: wsCtx.province,
                            city: wsCtx.city,
                            streetId: street.id,
                            streetName: street.name
                          })
                        }}
                        style={{
                          border: '1px solid #dbeafe',
                          borderRadius: '999px',
                          padding: '4px 8px',
                          fontSize: '0.8rem',
                          background: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        {street.name}
                      </button>
                    ))}
                  </div>
                </div>
                {groupPage.mode === 'operational' && (
                  <div style={{ ...card, padding: '10px', display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>Aggiungi informazioni di zona</h3>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#64748b', padding: '7px 10px' }}
                        onClick={() => setGroupPage({ mode: 'operational', assignmentId: selectedAssignmentId })}
                      >
                        Torna alla scheda gruppo
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr', gap: '8px' }}>
                      <button type="button" style={{ ...btnPrimary, background: '#1d4ed8' }} onClick={() => setGroupPage({ mode: 'add_zone_sign', assignmentId: selectedAssignmentId })}>
                        AGGIUNGI CARTELLO DI ZONA
                      </button>
                      <button type="button" style={{ ...btnPrimary, background: '#2563eb' }} onClick={() => setGroupPage({ mode: 'add_zone_property', assignmentId: selectedAssignmentId })}>
                        AGGIUNGI IMMOBILE DI ZONA
                      </button>
                      <button type="button" style={{ ...btnPrimary, background: '#0f766e' }} onClick={() => setGroupPage({ mode: 'add_zone_client', assignmentId: selectedAssignmentId })}>
                        AGGIUNGI CLIENTE DI ZONA
                      </button>
                      <button type="button" style={{ ...btnPrimary, background: '#334155' }} onClick={() => setGroupPage({ mode: 'add_zone_note', assignmentId: selectedAssignmentId })}>
                        AGGIUNGI INFORMAZIONI DI ZONA
                      </button>
                    </div>
                  </div>
                )}
                {groupPage.mode === 'operational' && (
                  <div style={{ ...card, padding: '12px', display: 'grid', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>Mega griglia informazioni zona</h3>
                      <div style={{ color: '#64748b', fontSize: '0.86rem' }}>
                        Totale: <strong>{megaGridRows.length}</strong> � Filtrate: <strong>{megaGridRowsFiltered.length}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(4, minmax(0, 1fr))' }}>
                      <input value={megaGridKeyword} onChange={(e) => setMegaGridKeyword(e.target.value)} placeholder="Ricerca globale..." style={inputStyle} />
                      <select value={megaGridKindFilter} onChange={(e) => setMegaGridKindFilter(e.target.value)} style={inputStyle}>
                        <option value="ALL">Tutti i tipi</option>
                        {megaGridKindOptions.map((k) => <option key={k} value={k}>{zoneKindLabel(k)}</option>)}
                      </select>
                      <select value={megaGridStreetFilter} onChange={(e) => setMegaGridStreetFilter(e.target.value)} style={inputStyle}>
                        <option value="ALL">Tutte le vie/sotto-zone</option>
                        {megaGridStreetOptions.map((street) => <option key={street} value={street}>{street}</option>)}
                      </select>
                      <select value={megaGridAuthorFilter} onChange={(e) => setMegaGridAuthorFilter(e.target.value)} style={inputStyle}>
                        <option value="ALL">Tutti gli autori</option>
                        {megaGridAuthorOptions.map((author) => <option key={author} value={author}>{author}</option>)}
                      </select>
                      <select value={megaGridContactTypeFilter} onChange={(e) => setMegaGridContactTypeFilter(e.target.value)} style={inputStyle}>
                        <option value="ALL">Tutti i tipi contatto</option>
                        {megaGridContactTypeOptions.map((cType) => <option key={cType} value={cType}>{cType}</option>)}
                      </select>
                      <select value={megaGridWithPhoto} onChange={(e) => setMegaGridWithPhoto(e.target.value)} style={inputStyle}>
                        <option value="ALL">Foto: tutte</option>
                        <option value="YES">Solo con foto</option>
                        <option value="NO">Solo senza foto</option>
                      </select>
                      <input type="date" value={megaGridDateFrom} onChange={(e) => setMegaGridDateFrom(e.target.value)} style={inputStyle} />
                      <input type="date" value={megaGridDateTo} onChange={(e) => setMegaGridDateTo(e.target.value)} style={inputStyle} />
                      <select value={megaGridSort} onChange={(e) => setMegaGridSort(e.target.value as 'DESC' | 'ASC')} style={inputStyle}>
                        <option value="DESC">Ordina: pi� recenti</option>
                        <option value="ASC">Ordina: pi� vecchie</option>
                      </select>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#475569' }}
                        onClick={() => {
                          setMegaGridKeyword('')
                          setMegaGridKindFilter('ALL')
                          setMegaGridStreetFilter('ALL')
                          setMegaGridAuthorFilter('ALL')
                          setMegaGridContactTypeFilter('ALL')
                          setMegaGridWithPhoto('ALL')
                          setMegaGridDateFrom('')
                          setMegaGridDateTo('')
                          setMegaGridSort('DESC')
                        }}
                      >
                        Reset filtri
                      </button>
                    </div>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1300px', background: '#fff' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {['Data/Ora', 'Tipo', 'Via', 'Autore', 'Titolo', 'Contenuto', 'Contatto', 'Tipo contatto', 'Telefono', 'Email', 'Indirizzo', 'Foto'].map((h) => (
                              <th key={h} style={{ textAlign: 'left', padding: '9px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {megaGridRowsFiltered.length === 0 ? (
                            <tr>
                              <td colSpan={12} style={{ padding: '12px', color: '#64748b' }}>Nessun dato trovato con i filtri correnti.</td>
                            </tr>
                          ) : megaGridRowsFiltered.map((row) => (
                            <tr
                              key={row.id}
                              style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                              onClick={() => openMegaGridRowDetail(row)}
                              title="Apri dettaglio"
                            >
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{fmt(row.createdAt)}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{zoneKindLabel(row.kind)}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.street || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.createdBy || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem' }}>{row.title || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', maxWidth: '320px' }}>{row.content || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.fullName || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.contactType || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.phone || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.email || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem' }}>{row.address || '-'}</td>
                              <td style={{ padding: '8px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.hasPhoto ? 'Si' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {groupPage.mode === 'operational' && (
                  <>
                    <div
                      style={{
                        display: hideGroupOperationalLegacyBlocks ? 'none' : 'grid',
                        gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                        gap: '10px'
                      }}
                    >
                      <div style={{ ...card, padding: '10px', display: 'grid', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Azioni rapide</h3>
                        <button type="button" style={{ ...btnPrimary, padding: '8px 10px' }} onClick={() => setGroupPage({ mode: 'add_zone_info_menu', assignmentId: selectedAssignmentId })}>
                          Aggiungi informazioni di zona
                        </button>
                        <button type="button" style={{ ...btnPrimary, background: '#475569', padding: '8px 10px' }} onClick={() => setGroupPage({ mode: 'zone_clients_registry', assignmentId: selectedAssignmentId })}>
                          Tab clienti di zona
                        </button>
                        <button type="button" style={{ ...btnPrimary, background: '#475569', padding: '8px 10px' }} onClick={() => setGroupPage({ mode: 'notes_archive', assignmentId: selectedAssignmentId })}>
                          Archivio note di zona
                        </button>
                        <button type="button" style={{ ...btnPrimary, background: '#1e293b', padding: '8px 10px' }} onClick={() => setGroupPage({ mode: 'zone_log', assignmentId: selectedAssignmentId })}>
                          Log di Zona
                        </button>
                        <button type="button" style={{ ...btnPrimary, background: '#334155', padding: '8px 10px' }} onClick={() => setGroupPage({ mode: 'history', assignmentId: selectedAssignmentId })}>
                          Storico assegnazione
                        </button>
                      </div>

                      <div style={{ ...card, padding: '10px', display: 'grid', gap: '6px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Immobili giornalieri</h3>
                        {groupOverviewLoading && <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Caricamento...</div>}
                        {!groupOverviewLoading && !activeDailyListing && <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Nessun immobile oggi.</div>}
                        {!groupOverviewLoading && activeDailyListing && (
                          <>
                            <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700 }}>
                              Nuovo immobile � {fmt(activeDailyListing.firstSeenAt)}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{activeDailyListing.title || 'Immobile'}</div>
                            <div style={{ color: '#334155', fontSize: '0.86rem' }}>
                              {activeDailyListing.priceText || '-'} | {activeDailyListing.surfaceText || '-'}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button type="button" style={{ ...btnPrimary, background: '#475569', padding: '7px 10px', fontSize: '0.86rem' }} onClick={() => setDailySlideIndex((prev) => (dailyListings.length > 0 ? (prev - 1 + dailyListings.length) % dailyListings.length : 0))} disabled={dailyListings.length <= 1}>
                                Prec.
                              </button>
                              <button type="button" style={{ ...btnPrimary, padding: '7px 10px', fontSize: '0.86rem' }} onClick={() => setDailySlideIndex((prev) => (dailyListings.length > 0 ? (prev + 1) % dailyListings.length : 0))} disabled={dailyListings.length <= 1}>
                                Succ.
                              </button>
                              <button type="button" style={{ ...btnPrimary, background: '#0f766e', padding: '7px 10px', fontSize: '0.86rem' }} onClick={() => openListingDetail(activeDailyListing.id)}>
                                Apri scheda
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ ...card, padding: '10px', display: 'grid', gap: '6px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Riepilogo zona</h3>
                        <div style={{ fontSize: '0.88rem', color: '#334155' }}>Clienti: <strong>{zoneClientRecords.length}</strong></div>
                        <div style={{ fontSize: '0.88rem', color: '#334155' }}>Note zona: <strong>{allGroupZoneNotes.length}</strong></div>
                        <div style={{ fontSize: '0.88rem', color: '#334155' }}>Cartelli: <strong>{zoneSigns.length}</strong></div>
                        <div style={{ fontSize: '0.88rem', color: '#334155' }}>Immobili manuali: <strong>{zoneProperties.length}</strong></div>
                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                          Ultimi clienti: {zoneClientRecords.slice(0, 2).map((c: any) => c.fullName || `${c.firstName} ${c.lastName}`.trim()).join(' � ') || '-'}
                        </div>
                        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '6px', display: 'grid', gap: '6px' }}>
                          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>Log di Zona</div>
                          <input
                            value={zoneLogKeyword}
                            onChange={(e) => setZoneLogKeyword(e.target.value)}
                            placeholder="Cerca parola chiave..."
                            style={inputStyle}
                          />
                          <select value={zoneLogStreetFilter} onChange={(e) => setZoneLogStreetFilter(e.target.value)} style={inputStyle}>
                            <option value="ALL">Tutte le sotto-zone</option>
                            {zoneLogStreetOptions.map((street) => (
                              <option key={street} value={street}>{street}</option>
                            ))}
                          </select>
                          {latestZoneLogEntries.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Nessuna informazione trovata.</div>
                          ) : latestZoneLogEntries.map((l: any) => (
                            <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 8px' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{l.title || 'Aggiornamento zona'}</div>
                              <div style={{ fontSize: '0.78rem', color: '#334155' }}>{String(l.content || '').slice(0, 120)}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{fmt(l.createdAt)}{l?.metadata?.streetName ? ` � ${String(l.metadata.streetName)}` : ''}</div>
                            </div>
                          ))}
                          <button type="button" style={{ ...btnPrimary, padding: '7px 10px', background: '#1e293b' }} onClick={() => setGroupPage({ mode: 'zone_log', assignmentId: selectedAssignmentId })}>
                            Apri log completo
                          </button>
                        </div>
                      </div>

                      <div style={{ ...card, padding: '10px', display: 'grid', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Archivio rapido</h3>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Ultimi cartelli</div>
                        {latestZoneSigns.length === 0 ? <div style={{ fontSize: '0.86rem', color: '#94a3b8' }}>Nessuno</div> : latestZoneSigns.map((l: any) => (
                          <button
                            key={l.id}
                            type="button"
                            style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '8px', padding: '6px 8px', textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => {
                              setZoneSignDetailId(l.id)
                              setGroupPage({ mode: 'zone_sign_detail', assignmentId: selectedAssignmentId })
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{String(l?.metadata?.streetName || 'Via')}</div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{fmt(l.createdAt)}</div>
                          </button>
                        ))}
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Ultimi immobili manuali</div>
                        {latestZoneProperties.length === 0 ? <div style={{ fontSize: '0.86rem', color: '#94a3b8' }}>Nessuno</div> : latestZoneProperties.map((l: any) => (
                          <button
                            key={l.id}
                            type="button"
                            style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '8px', padding: '6px 8px', textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => {
                              setZonePropertyDetailId(l.id)
                              setGroupPage({ mode: 'zone_property_detail', assignmentId: selectedAssignmentId })
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{String(l?.metadata?.streetName || 'Via')}</div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{fmt(l.createdAt)}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: hideGroupOperationalLegacyBlocks ? 'none' : 'grid',
                        gridTemplateColumns: isMobileLayout ? '1fr' : 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
                        gap: '10px'
                      }}
                    >
                      <div style={{ ...card, padding: '10px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Mappa zona gruppo</h3>
                        <GroupZoneMap center={groupOverview?.center || null} points={groupOverview?.mapPoints || []} />
                      </div>
                      <div style={{ ...card, padding: '10px', display: 'grid', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Aggiornamenti rapidi</h3>
                        {latestAssignmentLogs.length === 0 ? (
                          <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Nessuna lavorazione recente.</div>
                        ) : (
                          latestAssignmentLogs.map((l) => (
                            <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 8px' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>[{l.entryType}] {l.title || 'Aggiornamento'}</div>
                              <div style={{ fontSize: '0.8rem', color: '#475569' }}>{fmt(l.createdAt)} - {l.createdBy.firstName} {l.createdBy.lastName}</div>
                            </div>
                          ))
                        )}
                        {selectedAssignment.isActive && ws.canWrite ? (
                          <>
                            <select value={logForm.entryType} onChange={(e) => setLogForm((p) => ({ ...p, entryType: e.target.value }))} style={inputStyle}>
                              <option value="NOTE">Nota</option>
                              <option value="STATUS">Stato</option>
                              <option value="STATISTICS">Statistiche</option>
                              <option value="HANDOVER">Passaggio consegne</option>
                            </select>
                            <input value={logForm.title} onChange={(e) => setLogForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titolo" style={inputStyle} />
                            <textarea value={logForm.content} onChange={(e) => setLogForm((p) => ({ ...p, content: e.target.value }))} placeholder="Contenuto" style={{ ...inputStyle, minHeight: '84px', resize: 'vertical' }} />
                            <button type="button" style={{ ...btnPrimary, padding: '8px 10px' }} onClick={saveWorkspaceLog}>Salva aggiornamento</button>
                          </>
                        ) : (
                          <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Scrittura disabilitata su assegnazione non attiva.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {groupPage.mode === 'notes_archive' && (
                  <div style={{ ...card, padding: '12px' }}>
                    <h3 style={{ marginTop: 0 }}>Archivio completo note di zona</h3>
                    {allGroupZoneNotes.length === 0 && <div style={{ color: '#64748b' }}>Nessuna nota di zona registrata.</div>}
                    {allGroupZoneNotes.map((l) => (
                      <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                        <strong>{l.title || 'Nota di zona'}</strong>
                        <div>{l.content}</div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          {fmt(l.createdAt)} - {l.createdBy.firstName} {l.createdBy.lastName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {groupPage.mode === 'zone_log' && (
                  <div style={{ ...card, padding: '12px', display: 'grid', gap: '10px' }}>
                    <h3 style={{ marginTop: 0 }}>Log completo di zona</h3>
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 260px' }}>
                      <input
                        value={zoneLogKeyword}
                        onChange={(e) => setZoneLogKeyword(e.target.value)}
                        placeholder="Ricerca veloce (stile chat): parola chiave"
                        style={inputStyle}
                      />
                      <select value={zoneLogStreetFilter} onChange={(e) => setZoneLogStreetFilter(e.target.value)} style={inputStyle}>
                        <option value="ALL">Tutte le sotto-zone</option>
                        {zoneLogStreetOptions.map((street) => (
                          <option key={street} value={street}>{street}</option>
                        ))}
                      </select>
                    </div>
                    {filteredZoneLogEntries.length === 0 && <div style={{ color: '#64748b' }}>Nessun elemento nel log con i filtri correnti.</div>}
                    {filteredZoneLogEntries.map((l: any) => (
                      <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', display: 'grid', gap: '4px' }}>
                        <strong>{l.title || 'Aggiornamento zona'}</strong>
                        <div>{l.content}</div>
                        {getZonePrimaryPhoto(l?.metadata) ? (
                          <img
                            src={String(getZonePrimaryPhoto(l?.metadata))}
                            alt="Foto log zona"
                            style={{ width: '220px', maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                          />
                        ) : null}
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          {fmt(l.createdAt)} - {l.createdBy.firstName} {l.createdBy.lastName}
                          {l?.metadata?.streetName ? ` � Sotto-zona: ${String(l.metadata.streetName)}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {groupPage.mode === 'clients_archive' && (
                  <div style={{ ...card, padding: '12px' }}>
                    <h3 style={{ marginTop: 0 }}>Archivio completo clienti di zona</h3>
                    {allGroupZoneClients.length === 0 && <div style={{ color: '#64748b' }}>Nessun cliente di zona registrato.</div>}
                    {allGroupZoneClients.map((l) => (
                      <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                        <strong>{l.metadata?.fullName || l.title || 'Cliente di zona'}</strong>
                        <div>{l.content}</div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          Tipo: {l.metadata?.contactType || '-'} | {fmt(l.createdAt)} - {l.createdBy.firstName} {l.createdBy.lastName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {groupPage.mode === 'history' && (
                  <div style={{ ...card, padding: '12px' }}>
                    <h3 style={{ marginTop: 0 }}>Archivio lavorazioni assegnazione</h3>
                    {visibleSelectedAssignmentLogs.length === 0 && <div style={{ color: '#64748b' }}>Nessuna lavorazione registrata in questo periodo.</div>}
                    {visibleSelectedAssignmentLogs.map((l) => (
                      <div key={l.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                        <strong>[{l.entryType}] {l.title || 'Aggiornamento'}</strong><br />{l.content}
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{fmt(l.createdAt)} - {l.createdBy.firstName} {l.createdBy.lastName}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {reassignModal.open && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
            <div style={{ ...card, width: 'min(520px, 92vw)', padding: '16px', display: 'grid', gap: '10px' }}>
              <h3 style={{ margin: 0 }}>Riassegna gruppo ad altro agente</h3>
              <p style={{ margin: 0, color: '#64748b' }}>
                Verr� chiuso il gruppo attuale, archiviato lo storico e assegnato il gruppo al nuovo agente.
              </p>
              <select value={reassignAgentId} onChange={(e) => setReassignAgentId(e.target.value)} style={inputStyle}>
                <option value="">Seleziona agente</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName} ({a.email})
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  style={{ ...btnPrimary, background: '#64748b' }}
                  onClick={() => {
                    setReassignModal({ assignmentId: '', open: false })
                    setReassignAgentId('')
                  }}
                >
                  Annulla
                </button>
                <button type="button" style={btnPrimary} onClick={closeAndReassignGroup} disabled={!reassignAgentId || Boolean(closingAssignmentId)}>
                  Conferma
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const dynamicCityOptions = useMemo(
    () => Array.from(new Set(geo.map((row) => String(row.city || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'it')),
    [geo]
  )
  const visibleDynamicGroups = useMemo(() => {
    if (isAdmin) return dynamicGroups
    const currentAgentId = String(user?.id || '').trim()
    if (!currentAgentId) return []
    return dynamicGroups.filter((group) => String(group.activeAssignment?.agentId || '') === currentAgentId)
  }, [isAdmin, user?.id, dynamicGroups])
  const currentDynamicStreet = dynamicWorkspace?.streets.find((street) => street.id === dynamicSelectedStreetId) || null
  const streetAwareLogs = (dynamicWorkspace?.logs || []).filter((entry) => {
    if (!currentDynamicStreet) return true
    const metaStreetId = String(entry?.metadata?.streetId || '').trim()
    const metaStreetName = String(entry?.metadata?.streetName || '').trim().toLowerCase()
    if (metaStreetId && metaStreetId === currentDynamicStreet.id) return true
    if (metaStreetName && metaStreetName === currentDynamicStreet.name.trim().toLowerCase()) return true
    return false
  })
  const megaRowsBase = streetAwareLogs
    .filter((entry) => {
      const kind = String(entry?.metadata?.kind || '')
      return kind.startsWith('ZONE_')
    })
    .map((entry) => ({
      id: String(entry.id),
      createdAt: entry.createdAt,
      kind: String(entry?.metadata?.kind || ''),
      streetName: String(entry?.metadata?.streetName || currentDynamicStreet?.name || '-'),
      author: `${entry.createdBy.firstName} ${entry.createdBy.lastName}`.trim(),
      title: entry.title || '-',
      content: entry.content || '-',
      contactName: String(entry?.metadata?.fullName || entry?.metadata?.ownerFullName || '-'),
      contactType: String(entry?.metadata?.contactType || '-'),
      phone: String(entry?.metadata?.phone || '-'),
      email: String(entry?.metadata?.email || '-'),
      address: String(entry?.metadata?.address || '-'),
      hasPhoto: Boolean(getZonePrimaryPhoto(entry?.metadata))
    }))
  const megaTypeOptions = useMemo(() => Array.from(new Set(megaRowsBase.map((row) => row.kind))).sort((a, b) => a.localeCompare(b, 'it')), [megaRowsBase])
  const megaAuthorOptions = useMemo(() => Array.from(new Set(megaRowsBase.map((row) => row.author))).sort((a, b) => a.localeCompare(b, 'it')), [megaRowsBase])
  const megaContactTypeOptions = useMemo(() => Array.from(new Set(megaRowsBase.map((row) => row.contactType).filter((v) => v && v !== '-'))).sort((a, b) => a.localeCompare(b, 'it')), [megaRowsBase])
  const megaRows = megaRowsBase
    .filter((row) => {
      const keyword = dynamicKeyword.trim().toLowerCase()
      if (keyword && ![row.kind, row.streetName, row.author, row.title, row.content, row.contactName, row.phone, row.email, row.address].join(' ').toLowerCase().includes(keyword)) return false
      if (dynamicTypeFilter && row.kind !== dynamicTypeFilter) return false
      if (dynamicAuthorFilter && row.author !== dynamicAuthorFilter) return false
      if (dynamicContactTypeFilter && row.contactType !== dynamicContactTypeFilter) return false
      if (dynamicPhotoFilter === 'YES' && !row.hasPhoto) return false
      if (dynamicPhotoFilter === 'NO' && row.hasPhoto) return false
      if (dynamicDateFromFilter) {
        const fromTs = new Date(`${dynamicDateFromFilter}T00:00:00`).getTime()
        if (new Date(row.createdAt).getTime() < fromTs) return false
      }
      if (dynamicDateToFilter) {
        const toTs = new Date(`${dynamicDateToFilter}T23:59:59`).getTime()
        if (new Date(row.createdAt).getTime() > toTs) return false
      }
      return true
    })
    .sort((a, b) => {
      if (dynamicOrderBy === 'DATE_ASC') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (dynamicOrderBy === 'TYPE_ASC') return zoneKindLabel(a.kind).localeCompare(zoneKindLabel(b.kind), 'it')
      if (dynamicOrderBy === 'AUTHOR_ASC') return a.author.localeCompare(b.author, 'it')
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginTop: 0 }}>Task di zona [TEST DEPLOY]</h1>
      <p style={{ color: '#64748b' }}>Crea e gestisci gruppi di vie dinamici, scalabili nel tempo.</p>
      {msg && <div style={{ ...card, padding: '10px', marginBottom: '10px' }}>{msg}</div>}
      <div style={{ ...card, padding: '12px', marginBottom: '12px', display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Search size={14} />
            <input
              value={dynamicKeyword}
              onChange={(e) => setDynamicKeyword(e.target.value)}
              placeholder="Ricerca per citt�, zona, gruppo o via..."
              style={{ ...inputStyle, minWidth: '260px' }}
            />
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" style={{ ...btnPrimary, background: '#0f766e' }} onClick={downloadDynamicCsvTemplate}>
                Scarica template CSV
              </button>
              <button type="button" style={{ ...btnPrimary, background: '#1d4ed8' }} onClick={downloadDynamicCsvExample}>
                Scarica esempio CSV
              </button>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#334155' }}
                onClick={() => {
                  setShowDynamicImportModal(true)
                  setDynamicImportFile(null)
                }}
              >
                Importa CSV zone
              </button>
              <button
                type="button"
                style={btnPrimary}
                onClick={() => {
                  setDynamicCreateTargetZone(null)
                  setDynamicCreateForm({ city: '', zoneName: '', groupName: '', streets: [''] })
                  setShowDynamicCreateModal(true)
                }}
              >
                + Crea nuovo gruppo di zona
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={dynamicCityFilter} onChange={(e) => setDynamicCityFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '260px' }}>
            <option value="">Tutte le citt�</option>
            {dynamicCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          <button type="button" style={{ ...btnPrimary, padding: '9px 12px' }} onClick={() => loadDynamicGroups()}>
            Aggiorna
          </button>
        </div>
      </div>
      {dynamicImportReport && (
        <div style={{ ...card, padding: '12px', marginBottom: '12px', display: 'grid', gap: '6px' }}>
          <div style={{ fontWeight: 800 }}>Report import CSV zone ({dynamicImportReport.mode || '-'})</div>
          <div style={{ color: '#334155', fontSize: '0.92rem' }}>
            Righe totali: {dynamicImportReport.totalRows ?? 0} � Valide: {dynamicImportReport.validRows ?? 0} �
            Zone create: {dynamicImportReport.zoneCreated ?? 0} � Gruppi creati: {dynamicImportReport.groupCreated ?? 0} �
            Gruppi aggiornati: {dynamicImportReport.groupUpdated ?? 0} � Vie create: {dynamicImportReport.streetsCreated ?? 0} �
            Duplicati ignorati: {dynamicImportReport.duplicatesIgnored ?? 0}
          </div>
          {Array.isArray(dynamicImportReport.rejectedRows) && dynamicImportReport.rejectedRows.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ color: '#b45309', fontSize: '0.9rem' }}>
                Righe scartate: {dynamicImportReport.rejectedRows.length}
              </div>
              <button type="button" style={{ ...btnPrimary, background: '#b45309', padding: '7px 10px', fontSize: '0.82rem' }} onClick={downloadDynamicImportErrorsCsv}>
                Scarica errori CSV
              </button>
            </div>
          )}
        </div>
      )}

      {!dynamicSelectedGroupId && (
        <div style={{ ...card, padding: '12px', display: 'grid', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{isAdmin ? 'Lista assegnazioni gruppi (Admin)' : 'I tuoi gruppi assegnati'}</h3>
          {dynamicLoading ? <div>Caricamento gruppi dinamici...</div> : null}
          {!dynamicLoading && visibleDynamicGroups.length === 0 ? (
            <div style={{ color: '#64748b' }}>{isAdmin ? 'Nessun gruppo dinamico creato.' : 'Nessun gruppo assegnato al tuo utente.'}</div>
          ) : null}
          {!dynamicLoading && dynamicZonesView.map((zone) => (
            <div key={zone.zoneId} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px', background: '#fff', display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1.02rem' }}>{zone.zoneName}</div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{zone.city} � {zone.province} � {zone.region}</div>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#2563eb', padding: '8px 12px' }}
                    onClick={() => {
                      setDynamicCreateTargetZone({ zoneId: zone.zoneId, city: zone.city, zoneName: zone.zoneName })
                      setDynamicCreateForm({ city: zone.city, zoneName: zone.zoneName, groupName: '', streets: [''] })
                      setShowDynamicCreateModal(true)
                    }}
                  >
                    + Nuovo gruppo
                  </button>
                ) : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '10px',
                  gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(auto-fit, minmax(360px, 1fr))',
                  alignItems: 'stretch'
                }}
              >
                {zone.groups.map((group) => (
                  <div
                    key={group.groupId}
                    style={{
                      border: '1px solid #cfd8e3',
                      borderRadius: '12px',
                      padding: '12px',
                      background: '#f8fafc',
                      display: 'grid',
                      gap: '10px',
                      alignContent: 'start',
                      minHeight: '236px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        borderBottom: '1px solid #e2e8f0',
                        paddingBottom: '10px'
                      }}
                    >
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a', lineHeight: 1.2 }}>{group.groupName}</div>
                        <span style={{ borderRadius: '999px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: 800, background: group.activeAssignment ? '#dcfce7' : '#e2e8f0', color: group.activeAssignment ? '#166534' : '#334155', width: 'fit-content' }}>
                          {group.activeAssignment ? `Assegnato a ${group.activeAssignment.agentName}` : 'Non assegnato'}
                        </span>
                      </div>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: group.activeAssignment ? '#2563eb' : '#0f766e', padding: '7px 10px', fontSize: '0.9rem', lineHeight: 1.1 }}
                        onClick={() => (group.activeAssignment ? openDynamicGroupWorkspace(group.groupId) : openDynamicAssignModal(group))}
                      >
                        {group.activeAssignment ? 'Apri gruppo' : 'Assegna gruppo'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: '6px' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#334155' }}>
                        Vie del gruppo ({group.streets.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                        {group.streets.length === 0 ? (
                          <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Nessuna via nel gruppo</span>
                        ) : (
                          group.streets.map((street) => (
                            <span
                              key={street.id}
                              style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '999px',
                                padding: '4px 9px',
                                fontSize: '0.78rem',
                                background: '#fff',
                                color: '#334155'
                              }}
                            >
                              {street.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {isAdmin ? (
                      <div style={{ display: 'grid', gap: '6px', marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>Azioni gruppo</div>
                        <div
                          style={{
                            display: 'grid',
                            gap: '6px',
                            gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                            alignItems: 'stretch'
                          }}
                        >
                          {group.activeAssignment ? (
                            <>
                              <button
                                type="button"
                                style={{ ...btnPrimary, background: '#475569', padding: '6px 8px', fontSize: '0.78rem', lineHeight: 1.15, minHeight: '34px' }}
                                onClick={() => closeDynamicGroupAndArchive(group.activeAssignment!.assignmentId)}
                                disabled={dynamicClosingAssignmentId === group.activeAssignment!.assignmentId}
                              >
                                Chiudi e archivia
                              </button>
                              <button
                                type="button"
                                style={{ ...btnPrimary, background: '#0f766e', padding: '6px 8px', fontSize: '0.78rem', lineHeight: 1.15, minHeight: '34px' }}
                                onClick={() => {
                                  setDynamicReassignModal({
                                    open: true,
                                    zoneId: group.zoneId,
                                    groupId: group.groupId,
                                    assignmentId: group.activeAssignment!.assignmentId,
                                    groupName: group.groupName
                                  })
                                  setDynamicReassignAgentId('')
                                }}
                                disabled={dynamicClosingAssignmentId === group.activeAssignment!.assignmentId}
                              >
                                Chiudi e riassegna
                              </button>
                            </>
                          ) : (
                            <>
                              <div style={{ visibility: 'hidden' }} />
                              <div style={{ visibility: 'hidden' }} />
                            </>
                          )}
                          <button
                            type="button"
                            style={{ ...btnPrimary, background: '#1d4ed8', padding: '6px 8px', fontSize: '0.78rem', lineHeight: 1.15, minHeight: '34px' }}
                            onClick={() => openDynamicEditModal(group)}
                            disabled={dynamicEditSaving || dynamicDeletingGroupId === group.groupId}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Pencil size={13} /> Modifica gruppo</span>
                          </button>
                          <button
                            style={{ ...btnPrimary, background: '#dc2626', padding: '6px 8px', fontSize: '0.78rem', lineHeight: 1.15, minHeight: '34px' }}
                            onClick={() => deleteDynamicGroup(group.groupId, group.groupName)}
                            disabled={dynamicDeletingGroupId === group.groupId || Boolean(group.activeAssignment && dynamicClosingAssignmentId === group.activeAssignment.assignmentId)}
                          >
                            Elimina gruppo
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dynamicSelectedGroupId && (
        <div style={{ display: 'grid', gap: '10px' }}>
          <button type="button" style={{ ...inputStyle, width: 'fit-content' }} onClick={() => { setDynamicSelectedGroupId(null); setDynamicWorkspace(null); setDynamicSelectedStreetId(null) }}>
            {'<'}- Torna a Task di zona
          </button>
          {dynamicWorkspaceLoading ? <div style={{ ...card, padding: '12px' }}>Caricamento gruppo...</div> : null}
          {!dynamicWorkspaceLoading && dynamicWorkspace && (
            <>
              <div style={{ ...card, padding: '12px', display: 'grid', gap: '8px' }}>
                <h2 style={{ margin: 0 }}>Scheda gruppo: {dynamicWorkspace.zoneName} � {dynamicWorkspace.groupName}</h2>
                <div style={{ color: '#64748b' }}>
                  {dynamicWorkspace.region} {'>'} {dynamicWorkspace.province} {'>'} {dynamicWorkspace.city}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {dynamicWorkspace.streets.map((street) => (
                    <div key={street.id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setDynamicSelectedStreetId(street.id)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '999px', padding: '5px 34px 5px 10px', background: dynamicSelectedStreetId === street.id ? '#dbeafe' : '#fff', cursor: 'pointer', position: 'relative' }}
                      >
                        {street.name}
                        <span
                          onClick={(event) => {
                            event.stopPropagation()
                            setStreetMenuOpenId((prev) => (prev === street.id ? null : street.id))
                          }}
                          style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', borderLeft: '1px solid #cbd5e1', paddingLeft: '7px', display: 'inline-flex', alignItems: 'center', color: '#334155' }}
                        >
                          {streetMenuOpenId === street.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </button>
                      {streetMenuOpenId === street.id && (
                        <div style={{ position: 'absolute', top: '34px', right: 0, zIndex: 20, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 8px 20px rgba(15,23,42,0.12)', minWidth: '230px', padding: '6px' }}>
                          <div style={{ padding: '6px 8px', fontSize: '0.82rem', color: '#64748b' }}>Sposta via in altro gruppo</div>
                          <select
                            defaultValue=""
                            style={{ ...inputStyle, marginBottom: '6px' }}
                            onChange={(e) => {
                              if (!e.target.value) return
                              moveDynamicStreet(street.id, e.target.value)
                            }}
                          >
                            <option value="">Seleziona gruppo destinazione</option>
                            {dynamicGroups
                              .filter((g) => g.zoneId === dynamicWorkspace.zoneId && g.groupId !== dynamicWorkspace.groupId)
                              .map((g) => (
                                <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
                              ))}
                          </select>
                          <button type="button" style={{ ...btnPrimary, width: '100%', background: '#475569', marginBottom: '6px' }} onClick={() => renameDynamicStreet(street.id, street.name)}>
                            Modifica via
                          </button>
                          <button type="button" style={{ ...btnPrimary, width: '100%', background: '#dc2626' }} onClick={() => deleteDynamicStreet(street.id, street.name)}>
                            Elimina via
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!!dynamicSelectedStreetId && (
                  <button
                    type="button"
                    style={{ ...btnPrimary, width: 'fit-content', background: '#64748b' }}
                    onClick={() => setDynamicSelectedStreetId(null)}
                  >
                    Mostra tutto il gruppo
                  </button>
                )}
              </div>
                  <div style={{ ...card, padding: '10px', display: 'grid', gap: '8px' }}>
                    <h3 style={{ margin: 0 }}>
                      Aggiungi informazioni di zona {currentDynamicStreet ? `� ${currentDynamicStreet.name}` : '� gruppo completo'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#1d4ed8' }}
                        onClick={() => openZoneQuickModal('ZONE_SIGN')}
                      >
                        AGGIUNGI CARTELLO DI ZONA
                      </button>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#2563eb' }}
                        onClick={() => openZoneQuickModal('ZONE_PROPERTY')}
                      >
                        AGGIUNGI IMMOBILE DI ZONA
                      </button>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#0f766e' }}
                        onClick={() => openZoneQuickModal('ZONE_CLIENT')}
                      >
                        AGGIUNGI CLIENTE DI ZONA
                      </button>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#334155' }}
                        onClick={() => openZoneQuickModal('ZONE_NOTE')}
                      >
                        AGGIUNGI INFORMAZIONI DI ZONA
                      </button>
                    </div>
                  </div>

                  <div style={{ ...card, padding: '12px', display: 'grid', gap: '8px' }}>
                    <h3 style={{ margin: 0 }}>
                      Mega griglia informazioni zona {currentDynamicStreet ? `� ${currentDynamicStreet.name}` : '� tutte le vie del gruppo'}
                    </h3>
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : 'repeat(4, minmax(0, 1fr))' }}>
                      <input
                        type="text"
                        value={dynamicKeyword}
                        onChange={(e) => setDynamicKeyword(e.target.value)}
                        placeholder="Ricerca manuale (via, titolo, contenuto, contatto...)"
                        style={inputStyle}
                      />
                      <select value={dynamicTypeFilter} onChange={(e) => setDynamicTypeFilter(e.target.value)} style={inputStyle}>
                        <option value="">Tutti i tipi</option>
                        {megaTypeOptions.map((type) => <option key={type} value={type}>{zoneKindLabel(type)}</option>)}
                      </select>
                      <select value={dynamicAuthorFilter} onChange={(e) => setDynamicAuthorFilter(e.target.value)} style={inputStyle}>
                        <option value="">Tutti gli autori</option>
                        {megaAuthorOptions.map((author) => <option key={author} value={author}>{author}</option>)}
                      </select>
                      <select value={dynamicContactTypeFilter} onChange={(e) => setDynamicContactTypeFilter(e.target.value)} style={inputStyle}>
                        <option value="">Tutti i tipi contatto</option>
                        {megaContactTypeOptions.map((contactType) => <option key={contactType} value={contactType}>{contactType}</option>)}
                      </select>
                      <select value={dynamicPhotoFilter} onChange={(e) => setDynamicPhotoFilter(e.target.value as any)} style={inputStyle}>
                        <option value="ALL">Foto: tutte</option>
                        <option value="YES">Solo con foto</option>
                        <option value="NO">Solo senza foto</option>
                      </select>
                      <input type="date" value={dynamicDateFromFilter} onChange={(e) => setDynamicDateFromFilter(e.target.value)} style={inputStyle} />
                      <input type="date" value={dynamicDateToFilter} onChange={(e) => setDynamicDateToFilter(e.target.value)} style={inputStyle} />
                      <select value={dynamicOrderBy} onChange={(e) => setDynamicOrderBy(e.target.value as any)} style={inputStyle}>
                        <option value="DATE_DESC">Ordina: pi� recenti</option>
                        <option value="DATE_ASC">Ordina: pi� vecchi</option>
                        <option value="TYPE_ASC">Ordina: tipo (A-Z)</option>
                        <option value="AUTHOR_ASC">Ordina: autore (A-Z)</option>
                      </select>
                      <button
                        type="button"
                        style={{ ...btnPrimary, background: '#475569' }}
                        onClick={() => {
                          setDynamicTypeFilter('')
                          setDynamicAuthorFilter('')
                          setDynamicContactTypeFilter('')
                          setDynamicPhotoFilter('ALL')
                          setDynamicDateFromFilter('')
                          setDynamicDateToFilter('')
                          setDynamicOrderBy('DATE_DESC')
                          setDynamicKeyword('')
                        }}
                      >
                        Reset filtri
                      </button>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Totale righe: {megaRows.length}</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
                        <thead>
                          <tr>
                            {['Data/Ora', 'Tipo', 'Via', 'Autore', 'Titolo', 'Contenuto', 'Contatto', 'Tipo contatto', 'Telefono', 'Email', 'Indirizzo', 'Foto'].map((header) => (
                              <th key={header} style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '7px', fontSize: '0.84rem' }}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {megaRows.length === 0 ? (
                            <tr><td colSpan={12} style={{ padding: '10px', color: '#64748b' }}>Nessuna informazione trovata per questa via.</td></tr>
                          ) : megaRows.map((row) => (
                            <tr key={row.id}>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{fmt(row.createdAt)}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{zoneKindLabel(row.kind)}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.streetName}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.author}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.title}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.content}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.contactName}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.contactType}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.phone}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.email}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.address}</td>
                              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '7px' }}>{row.hasPhoto ? 'S�' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
            </>
          )}
        </div>
      )}

      {zoneQuickModal.open && (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ margin: 0 }}>
              {zoneQuickModal.kind === 'ZONE_SIGN' && 'Aggiungi cartello di zona'}
              {zoneQuickModal.kind === 'ZONE_PROPERTY' && 'Aggiungi immobile di zona'}
              {zoneQuickModal.kind === 'ZONE_CLIENT' && 'Aggiungi cliente di zona'}
              {zoneQuickModal.kind === 'ZONE_NOTE' && 'Aggiungi informazioni di zona'}
            </h3>
            <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
              {currentDynamicStreet ? `Via selezionata: ${currentDynamicStreet.name}` : 'Seleziona una via'}
            </div>

            <label style={{ fontWeight: 700 }}>Titolo</label>
            <input
              value={zoneQuickModal.title}
              onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, title: e.target.value }))}
              style={inputStyle}
              placeholder="Titolo informazione"
            />

            {zoneQuickModal.kind === 'ZONE_CLIENT' && (
              <>
                <label style={{ fontWeight: 700 }}>Nome e Cognome *</label>
                <input value={zoneQuickModal.fullName} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, fullName: e.target.value }))} style={inputStyle} placeholder="Es. Mario Rossi" />
                <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr' }}>
                  <input value={zoneQuickModal.phone} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, phone: e.target.value }))} style={inputStyle} placeholder="Telefono" />
                  <input value={zoneQuickModal.email} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, email: e.target.value }))} style={inputStyle} placeholder="Email" />
                </div>
                <input value={zoneQuickModal.address} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, address: e.target.value }))} style={inputStyle} placeholder="Indirizzo" />
                <select value={zoneQuickModal.contactType} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, contactType: e.target.value }))} style={inputStyle}>
                  <option value="LEAD">Lead</option>
                  <option value="BUYER">Acquirente</option>
                  <option value="SELLER">Venditore</option>
                </select>
              </>
            )}

            {zoneQuickModal.kind === 'ZONE_PROPERTY' && (
              <>
                <label style={{ fontWeight: 700 }}>Proprietario</label>
                <input value={zoneQuickModal.fullName} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, fullName: e.target.value }))} style={inputStyle} placeholder="Nome proprietario" />
                <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr' }}>
                  <input value={zoneQuickModal.phone} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, phone: e.target.value }))} style={inputStyle} placeholder="Telefono" />
                  <input value={zoneQuickModal.address} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, address: e.target.value }))} style={inputStyle} placeholder="Indirizzo" />
                </div>
              </>
            )}

            {zoneQuickModal.kind === 'ZONE_SIGN' && (
              <>
                <label style={{ fontWeight: 700 }}>Azienda / Riferimento</label>
                <input value={zoneQuickModal.fullName} onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, fullName: e.target.value }))} style={inputStyle} placeholder="Es. Tecnocasa" />
              </>
            )}

            <label style={{ fontWeight: 700 }}>Contenuto *</label>
            <textarea
              value={zoneQuickModal.content}
              onChange={(e) => setZoneQuickModal((prev) => ({ ...prev, content: e.target.value }))}
              style={{ ...inputStyle, minHeight: '110px', resize: 'vertical' }}
              placeholder="Inserisci dettaglio informazione"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => setZoneQuickModal({ open: false, kind: null, title: '', content: '', fullName: '', phone: '', email: '', address: '', contactType: '' })}
              >
                Annulla
              </button>
              <button type="button" style={btnPrimary} onClick={submitZoneQuickModal}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {showDynamicImportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 70 }}>
          <div style={{ ...card, width: 'min(700px, 96vw)', padding: '16px', display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Importa zone da CSV</h3>
            <div style={{ color: '#475569', fontSize: '0.9rem' }}>
              Colonne obbligatorie: <strong>city, zone_name, group_name, street_name</strong>.
            </div>
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr auto' }}>
              <select value={dynamicImportMode} onChange={(e) => setDynamicImportMode((String(e.target.value) === 'UPSERT' ? 'UPSERT' : 'APPEND'))} style={inputStyle}>
                <option value="APPEND">APPEND (aggiunge senza toccare esistente)</option>
                <option value="UPSERT">UPSERT (crea/aggiorna gruppi e vie)</option>
              </select>
              <div style={{ display: 'grid', gap: '6px' }}>
                <button type="button" style={{ ...btnPrimary, background: '#0f766e', padding: '8px 10px' }} onClick={downloadDynamicCsvTemplate}>
                  Scarica template
                </button>
                <button type="button" style={{ ...btnPrimary, background: '#1d4ed8', padding: '8px 10px' }} onClick={downloadDynamicCsvExample}>
                  Scarica esempio
                </button>
              </div>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setDynamicImportFile(e.target.files?.[0] || null)}
              style={inputStyle}
            />
            {dynamicImportFile && (
              <div style={{ color: '#334155', fontSize: '0.9rem' }}>
                File selezionato: <strong>{dynamicImportFile.name}</strong>
              </div>
            )}
            {dynamicImportReport && Array.isArray(dynamicImportReport.rejectedRows) && dynamicImportReport.rejectedRows.length > 0 && (
              <div style={{ ...card, padding: '10px', borderColor: '#fdba74', background: '#fff7ed', maxHeight: '200px', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>Righe scartate ({dynamicImportReport.rejectedRows.length})</div>
                  <button type="button" style={{ ...btnPrimary, background: '#b45309', padding: '6px 10px', fontSize: '0.8rem' }} onClick={downloadDynamicImportErrorsCsv}>
                    Scarica errori CSV
                  </button>
                </div>
                {dynamicImportReport.rejectedRows.slice(0, 100).map((row: any, idx: number) => (
                  <div key={`rej-${idx}`} style={{ fontSize: '0.84rem', color: '#9a3412' }}>
                    Riga {row.line}: {row.reason}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => {
                  setShowDynamicImportModal(false)
                  setDynamicImportFile(null)
                }}
              >
                Annulla
              </button>
              <button type="button" style={btnPrimary} onClick={importDynamicGroupsCsv} disabled={!dynamicImportFile || dynamicImporting}>
                {dynamicImporting ? 'Import in corso...' : 'Importa CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDynamicCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 70 }}>
          <div style={{ ...card, width: 'min(760px, 96vw)', padding: '16px', display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Crea nuovo gruppo di zona</h3>
            {dynamicCreateTargetZone ? (
              <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                Zona selezionata: <strong>{dynamicCreateTargetZone.zoneName}</strong> � {dynamicCreateTargetZone.city}
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr 1fr' }}>
              <select
                value={dynamicCreateForm.city}
                onChange={(e) => setDynamicCreateForm((p) => ({ ...p, city: e.target.value }))}
                style={inputStyle}
                disabled={Boolean(dynamicCreateTargetZone)}
              >
                <option value="">Citt�</option>
                {dynamicCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
              <input
                value={dynamicCreateForm.zoneName}
                onChange={(e) => setDynamicCreateForm((p) => ({ ...p, zoneName: e.target.value }))}
                placeholder="Nome Zona"
                style={inputStyle}
                disabled={Boolean(dynamicCreateTargetZone)}
              />
              <input
                value={dynamicCreateForm.groupName}
                onChange={(e) => setDynamicCreateForm((p) => ({ ...p, groupName: e.target.value }))}
                placeholder="Nome gruppo"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ fontWeight: 700 }}>Inserisci vie</div>
              {dynamicCreateForm.streets.map((street, idx) => (
                <div key={`street-input-${idx}`} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={street}
                    onChange={(e) => setDynamicCreateForm((p) => ({ ...p, streets: p.streets.map((item, i) => (i === idx ? e.target.value : item)) }))}
                    placeholder={`Via ${idx + 1}`}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#dc2626', padding: '8px 11px' }}
                    onClick={() => setDynamicCreateForm((p) => ({ ...p, streets: p.streets.filter((_, i) => i !== idx) }))}
                    disabled={dynamicCreateForm.streets.length === 1}
                  >
                    -
                  </button>
                </div>
              ))}
              <button type="button" style={{ ...btnPrimary, background: '#0f766e', width: 'fit-content' }} onClick={() => setDynamicCreateForm((p) => ({ ...p, streets: [...p.streets, ''] }))}>
                + Aggiungi via
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => {
                  setShowDynamicCreateModal(false)
                  setDynamicCreateTargetZone(null)
                }}
              >
                Annulla
              </button>
              <button type="button" style={btnPrimary} onClick={createDynamicGroup}>Crea gruppo</button>
            </div>
          </div>
        </div>
      )}
      {dynamicEditModal.open && (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ margin: 0 }}>Modifica gruppo di zona</h3>
            <div style={{ color: '#475569', fontSize: '0.9rem' }}>
              Aggiorna il nome gruppo e aggiungi nuove vie.
            </div>
            <label style={{ fontWeight: 700 }}>Nome gruppo</label>
            <input
              value={dynamicEditModal.groupName}
              onChange={(e) => setDynamicEditModal((prev) => ({ ...prev, groupName: e.target.value }))}
              style={inputStyle}
              placeholder="Nome gruppo"
            />

            <div style={{ display: 'grid', gap: '6px' }}>
              <div style={{ fontWeight: 700 }}>Vie attuali ({dynamicEditModal.existingStreets.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {dynamicEditModal.existingStreets.length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Nessuna via nel gruppo</span>
                ) : (
                  dynamicEditModal.existingStreets.map((street) => (
                    <span
                      key={street.id}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '999px',
                        padding: '4px 6px 4px 9px',
                        fontSize: '0.78rem',
                        background: '#fff',
                        color: '#334155',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: dynamicEditRemovedStreetIds.includes(street.id) ? 0.55 : 1
                      }}
                    >
                      {street.name}
                      <button
                        type="button"
                        style={{
                          border: 'none',
                          background: dynamicEditRemovedStreetIds.includes(street.id) ? '#16a34a' : '#ef4444',
                          color: '#fff',
                          borderRadius: '999px',
                          width: '20px',
                          height: '20px',
                          fontSize: '0.72rem',
                          lineHeight: 1,
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setDynamicEditRemovedStreetIds((prev) =>
                            prev.includes(street.id) ? prev.filter((id) => id !== street.id) : [...prev, street.id]
                          )
                        }}
                        title={dynamicEditRemovedStreetIds.includes(street.id) ? 'Ripristina via' : 'Rimuovi via'}
                      >
                        {dynamicEditRemovedStreetIds.includes(street.id) ? '+' : '-'}
                      </button>
                    </span>
                  ))
                )}
              </div>
              {dynamicEditRemovedStreetIds.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#b45309' }}>
                  Vie da rimuovere al salvataggio: {dynamicEditRemovedStreetIds.length}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <div style={{ fontWeight: 700 }}>Nuove vie da aggiungere</div>
              {dynamicEditNewStreets.map((street, idx) => (
                <div key={`edit-street-${idx}`} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={street}
                    onChange={(e) => setDynamicEditNewStreets((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))}
                    style={inputStyle}
                    placeholder="Nome via"
                  />
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: '#64748b', width: '40px', minWidth: '40px' }}
                    onClick={() => setDynamicEditNewStreets((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={dynamicEditNewStreets.length === 1}
                  >
                    -
                  </button>
                </div>
              ))}
              <button
                type="button"
                style={{ ...btnPrimary, background: '#0f766e', width: 'fit-content' }}
                onClick={() => setDynamicEditNewStreets((prev) => [...prev, ''])}
              >
                + Aggiungi via
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => {
                  setDynamicEditModal({ open: false, zoneId: '', groupId: '', groupName: '', existingStreets: [] })
                  setDynamicEditNewStreets([''])
                  setDynamicEditRemovedStreetIds([])
                }}
              >
                Annulla
              </button>
              <button type="button" style={btnPrimary} onClick={saveDynamicGroupEdit} disabled={dynamicEditSaving}>
                {dynamicEditSaving ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
      {dynamicReassignModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 72 }}>
          <div style={{ ...card, width: 'min(520px, 92vw)', padding: '16px', display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Chiudi, archivia e assegna</h3>
            <p style={{ margin: 0, color: '#64748b' }}>
              Gruppo: <strong>{dynamicReassignModal.groupName}</strong>. Seleziona il nuovo agente per la riassegnazione.
            </p>
            <select value={dynamicReassignAgentId} onChange={(e) => setDynamicReassignAgentId(e.target.value)} style={inputStyle}>
              <option value="">Seleziona agente</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} ({a.email})
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => {
                  setDynamicReassignModal({ open: false, zoneId: '', groupId: '', assignmentId: '', groupName: '' })
                  setDynamicReassignAgentId('')
                }}
              >
                Annulla
              </button>
              <button
                type="button"
                style={btnPrimary}
                onClick={closeArchiveAndReassignDynamicGroup}
                disabled={!dynamicReassignAgentId || Boolean(dynamicClosingAssignmentId)}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
      {dynamicAssignModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 72 }}>
          <div style={{ ...card, width: 'min(520px, 92vw)', padding: '16px', display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Assegna gruppo</h3>
            <p style={{ margin: 0, color: '#64748b' }}>
              Gruppo: <strong>{dynamicAssignModal.groupName}</strong>. Seleziona l&apos;agente.
            </p>
            <select value={dynamicAssignAgentId} onChange={(e) => setDynamicAssignAgentId(e.target.value)} style={inputStyle}>
              <option value="">Seleziona agente</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} ({a.email})
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#64748b' }}
                onClick={() => {
                  setDynamicAssignModal({ open: false, zoneId: '', groupId: '', groupName: '' })
                  setDynamicAssignAgentId('')
                }}
              >
                Annulla
              </button>
              <button type="button" style={btnPrimary} onClick={assignDynamicGroup} disabled={!dynamicAssignAgentId}>
                Conferma assegnazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



