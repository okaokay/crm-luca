import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from './store/authStore'

type Props = {
  property: any
  onSave: (property: any) => Promise<void>
  onCancel: () => void
  currentUserRole?: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'AGENT' | 'COLLABORATOR' | null
}

type DictState = {
  propertyTypes: Array<{ id: number; label: string }>
  announcementTypes: Array<{ id: number; label: string }>
  portalCodes: Array<{ id: number; label: string }>
  enums: Record<string, string[]>
}

type City = { name: string; provinceCode: string; provinceName: string; istatCode: string }
type Province = { code: string; name: string }
type StreetSuggestion = {
  street: string
  houseNumber?: string
  city?: string
  province?: string
  provinceCode?: string
  zipCode?: string
  latitude?: number
  longitude?: number
  fullLabel?: string
}

type FieldDef = {
  key: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'checkbox' | 'enum'
  placeholder?: string
  required?: boolean
  enumKey?: string
}

let citiesCache: City[] | null = null
let provincesCache: Province[] | null = null

const STEPS = [
  '1. Identificazione', '2. Localizzazione', '3. Prezzo e priorita', '4. Dimensioni e vani',
  '5. Caratteristiche generali', '6. Struttura edificio', '7. Spazi e accessori', '8. Dotazioni interne',
  '9. Energetica', '10. Descrizioni', '11. Date e stato', '12. Dati asta',
  '13. Pubblicazione portali', '14. Contratto affitto', '15. Foto', '16. Video + Assegnazione'
]

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontWeight: 600, color: '#111827', fontSize: 13 }
const hintStyle: React.CSSProperties = { marginTop: 3, color: '#6b7280', fontSize: 11 }
const cardStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#ffffff' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.5rem 0.55rem', border: '1px solid #111827', borderRadius: 6, background: '#fff', color: '#111827', fontSize: 13 }
const cellStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#111827', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.45rem 0.55rem' }
const labelRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }
const labelLeftStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#111827', fontWeight: 600, fontSize: 13 }
const badgeBaseStyle: React.CSSProperties = { borderRadius: 999, padding: '1px 6px', fontSize: 10, lineHeight: 1.4, fontWeight: 700, border: '1px solid' }
const reqBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#b91c1c', borderColor: '#fca5a5', background: '#fef2f2' }
const optBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#374151', borderColor: '#d1d5db', background: '#f9fafb' }
const helpBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#1f2937', borderColor: '#cbd5e1', background: '#eff6ff', cursor: 'help' }

const parseAddress = (address: string) => {
  const raw = String(address || '').trim()
  if (!raw) return { street: '', streetNumber: '' }
  const comma = raw.match(/^(.*?),\s*([0-9]+[a-zA-Z\/-]*)$/)
  if (comma) return { street: comma[1].trim(), streetNumber: comma[2].trim() }
  const end = raw.match(/^(.*)\s+([0-9]+[a-zA-Z\/-]*)$/)
  if (end) return { street: end[1].trim(), streetNumber: end[2].trim() }
  return { street: raw, streetNumber: '' }
}

const composeAddress = (street: string, number: string) => {
  const s = String(street || '').trim()
  const n = String(number || '').trim()
  if (!s) return ''
  return n ? `${s}, ${n}` : s
}

const parseStreetInput = (raw: string) => {
  const parsed = parseAddress(raw)
  return {
    street: parsed.street || String(raw || '').trim(),
    streetNumber: parsed.streetNumber || ''
  }
}

const escapeRegExp = (value: string) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const stripTrailingToken = (value: string, token: string) => {
  const base = String(value || '').trim()
  const t = String(token || '').trim()
  if (!base || !t) return base
  return base.replace(new RegExp(`\\s*[,\\-]?\\s*${escapeRegExp(t)}\\s*$`, 'i'), '').trim()
}

const extractLooseHouseNumber = (value: string) => {
  const m = String(value || '').match(/\b(\d+[a-zA-Z\/-]*)\b(?!.*\b\d)/)
  return m?.[1] || ''
}

const normText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const resolveProvinceCode = (raw: string, provinces: Province[]) => {
  const v = String(raw || '').trim()
  if (!v) return ''
  const up = v.toUpperCase()
  if (up.length === 2) return up
  const n = normText(v)
  const found = provinces.find((p) => normText(p.name) === n || normText(p.name).includes(n) || n.includes(normText(p.name)))
  return found?.code || ''
}

const inferCityFromFreeAddress = (input: string, cities: City[], provinceCodeHint?: string) => {
  const cleaned = normText(input)
  if (!cleaned) return null
  const pool = cities
    .filter((c) => !provinceCodeHint || String(c.provinceCode || '').toUpperCase() === String(provinceCodeHint || '').toUpperCase())
    .sort((a, b) => b.name.length - a.name.length)
  for (const c of pool) {
    const cityNorm = normText(c.name)
    if (cleaned === cityNorm || cleaned.endsWith(` ${cityNorm}`) || cleaned.includes(` ${cityNorm} `)) {
      return c
    }
  }
  return null
}

async function loadCities(): Promise<City[]> {
  if (citiesCache) return citiesCache
  const r = await fetch('https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json')
  if (!r.ok) throw new Error('cities load failed')
  const raw = await r.json()
  citiesCache = (raw as any[]).map((i) => ({
    name: String(i.nome || ''),
    provinceCode: String(i.sigla || ''),
    provinceName: String(i.provincia?.nome || i.sigla || ''),
    istatCode: String(i.codice || '')
  }))
  return citiesCache
}

async function loadProvinces(): Promise<Province[]> {
  if (provincesCache) return provincesCache
  const cities = await loadCities()
  const map = new Map<string, Province>()
  for (const c of cities) {
    const code = String(c.provinceCode || '').toUpperCase()
    if (code && !map.has(code)) map.set(code, { code, name: c.provinceName || code })
  }
  provincesCache = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  return provincesCache
}

export function PropertyModalOneClick({ property, onSave, onCancel, currentUserRole }: Props) {
  const { token } = useAuthStore()
  const isAdminUser = currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'AGENCY_ADMIN'

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dict, setDict] = useState<DictState>({ propertyTypes: [], announcementTypes: [], portalCodes: [], enums: {} })
  const [agents, setAgents] = useState<any[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [images, setImages] = useState<string[]>(Array.isArray(property?.images) ? property.images : [])
  const [streetSuggestions, setStreetSuggestions] = useState<StreetSuggestion[]>([])
  const [streetLoading, setStreetLoading] = useState(false)
  const [streetDropdownOpen, setStreetDropdownOpen] = useState(false)
  const [istatManual, setIstatManual] = useState(false)
  const [streetNumberManual, setStreetNumberManual] = useState(false)
  const streetAutocompleteRef = useRef<HTMLDivElement | null>(null)
  const suppressStreetDropdownRef = useRef(false)

  const parsed = parseAddress(property?.address || '')
  const [form, setForm] = useState<any>({
    title: property?.title || '',
    reference: property?.reference || '',
    description: property?.description || '',
    contractType: property?.contractType || 'SALE',
    status: property?.status || 'AVAILABLE',
    street: parsed.street,
    streetNumber: parsed.streetNumber,
    address: property?.address || '',
    city: property?.city || '',
    province: property?.province || '',
    zipCode: property?.zipCode || '',
    latitude: property?.latitude || undefined,
    longitude: property?.longitude || undefined,
    giComuneIstat: property?.giComuneIstat || '',
    ownerFirstName: property?.ownerFirstName || '',
    ownerLastName: property?.ownerLastName || '',
    ownerEmail: property?.ownerEmail || '',
    ownerPhone: property?.ownerPhone || '',
    ownerFiscalCode: property?.ownerFiscalCode || '',
    agentId: property?.agentId || '',
    agentName: property?.agentName || '',
    agentEmail: property?.agentEmail || '',
    agentPhone: property?.agentPhone || '',
    notes: property?.notes || '',
    oneClickData: {
      ...(property?.oneClickData || {}),
      idtipologiaimmobile: property?.oneClickData?.idtipologiaimmobile || 5,
      idtipologiaannuncio: property?.oneClickData?.idtipologiaannuncio || (property?.contractType === 'RENT' ? 2 : 1),
      riferimento: property?.oneClickData?.riferimento || property?.reference || '',
      comune_istat: property?.oneClickData?.comune_istat || property?.giComuneIstat || '',
      descrizione: property?.oneClickData?.descrizione || property?.description || '',
      titolo_annuncio: property?.oneClickData?.titolo_annuncio || property?.title || '',
      indirizzo: property?.oneClickData?.indirizzo || property?.address || '',
      data_inserimento: property?.oneClickData?.data_inserimento || '',
      data_aggiornamento: property?.oneClickData?.data_aggiornamento || '',
      tipo_classe_energetica: property?.oneClickData?.tipo_classe_energetica || 'V',
      nazione: property?.oneClickData?.nazione || 'IT',
      categoria_annuncio: property?.oneClickData?.categoria_annuncio || 'residenziale',
      indirizzo_visibile: property?.oneClickData?.indirizzo_visibile || 'S',
      mappa: property?.oneClickData?.mappa || 'S',
      selectedPortalCodes: Array.isArray(property?.oneClickData?.selectedPortalCodes) ? property.oneClickData.selectedPortalCodes : [20],
      videos: Array.isArray(property?.oneClickData?.videos) ? property.oneClickData.videos : []
    }
  })

  const setOne = (key: string, value: any) => setForm((prev: any) => ({ ...prev, oneClickData: { ...(prev.oneClickData || {}), [key]: value } }))
  const setNum = (key: string, value: string) => setOne(key, value ? Number(value) : undefined)
  const setSN = (key: string, checked: boolean) => setOne(key, checked ? 'S' : 'N')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    loadCities().then(setCities).catch(() => setCities([]))
    loadProvinces().then(setProvinces).catch(() => setProvinces([]))
  }, [])

  useEffect(() => {
    const run = async () => {
      try {
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
        const [aRes, dRes] = await Promise.all([
          fetch('/api/agents?isActive=true', { headers }),
          fetch('/api/oneclick/dictionaries', { headers })
        ])
        const aJson = await aRes.json().catch(() => [])
        if (Array.isArray(aJson)) setAgents(aJson)

        const dJson = await dRes.json().catch(() => null)
        if (dRes.ok && dJson?.success) {
          setDict({
            propertyTypes: Array.isArray(dJson.data?.propertyTypes) ? dJson.data.propertyTypes : [],
            announcementTypes: Array.isArray(dJson.data?.announcementTypes) ? dJson.data.announcementTypes : [],
            portalCodes: Array.isArray(dJson.data?.portalCodes) ? dJson.data.portalCodes : [],
            enums: dJson.data?.enums && typeof dJson.data.enums === 'object' ? dJson.data.enums : {}
          })
        }
      } catch {
        setAgents([])
      }
    }
    run()
  }, [token])

  useEffect(() => {
    const composed = composeAddress(form.street, form.streetNumber)
    setForm((prev: any) => ({ ...prev, address: composed, oneClickData: { ...(prev.oneClickData || {}), indirizzo: composed } }))
  }, [form.street, form.streetNumber])

  useEffect(() => {
    if (istatManual) return
    const city = String(form.city || '').trim().toLowerCase()
    if (!city) return
    const prov = String(form.province || '').trim().toUpperCase()
    const found = cities.find((c) => String(c.name || '').trim().toLowerCase() === city && (!prov || String(c.provinceCode || '').trim().toUpperCase() === prov))
    if (!found?.istatCode) return
    setForm((prev: any) => ({ ...prev, giComuneIstat: found.istatCode, oneClickData: { ...(prev.oneClickData || {}), comune_istat: found.istatCode } }))
  }, [form.city, form.province, cities, istatManual])

  const applyStreetSuggestion = (s: StreetSuggestion) => {
    if (!s) return
    if (s.houseNumber) setStreetNumberManual(false)
    setIstatManual(false)
    suppressStreetDropdownRef.current = true
    setStreetDropdownOpen(false)
    setForm((prev: any) => ({
      ...prev,
      street: s.street || prev.street,
      streetNumber: s.houseNumber || prev.streetNumber,
      city: s.city || prev.city,
      province: s.provinceCode || prev.province,
      zipCode: s.zipCode || prev.zipCode,
      latitude: typeof s.latitude === 'number' ? s.latitude : prev.latitude,
      longitude: typeof s.longitude === 'number' ? s.longitude : prev.longitude
    }))
    if (s.zipCode) setOne('cap', s.zipCode)
    if (typeof s.latitude === 'number') setOne('latitudine', s.latitude)
    if (typeof s.longitude === 'number') setOne('longitudine', s.longitude)
  }

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!streetAutocompleteRef.current) return
      if (!streetAutocompleteRef.current.contains(event.target as Node)) {
        setStreetDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  useEffect(() => {
    if (step !== 2) {
      setStreetDropdownOpen(false)
      setStreetLoading(false)
      return
    }

    const rawStreet = String(form.street || '').trim()
    if (rawStreet.length < 2) {
      setStreetSuggestions([])
      setStreetLoading(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setStreetLoading(true)
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
        const inferredCity = !String(form.city || '').trim()
          ? inferCityFromFreeAddress(rawStreet, cities, String(form.province || '').trim() || undefined)
          : null
        const city = String(form.city || inferredCity?.name || '').trim()
        const province = String(form.province || '').trim()
        const zipCode = String(form.zipCode || '').trim()
        let street = rawStreet
        if (city) street = stripTrailingToken(street, city)
        const parsedStreet = parseStreetInput(street)
        street = String(parsedStreet.street || street).trim()
        const number = String(form.streetNumber || parsedStreet.streetNumber || '').trim()
        const params = new URLSearchParams({ q: street || rawStreet, limit: '20' })
        if (city) params.set('city', city)
        if (province) params.set('province', province)
        if (zipCode) params.set('zipCode', zipCode)
        if (number) params.set('number', number)

        const r = await fetch(`/api/geocoding/streets/autocomplete?${params.toString()}`, { headers })
        const payload = await r.json().catch(() => null)
        const rows = Array.isArray(payload?.data) ? payload.data : []

        const mapped = rows
          .map((it: any) => {
            const road = String(it?.road || '').trim()
            if (!road) return null
            const cityName = String(it?.city || '').trim()
            const provinceRaw = String(it?.province || '').trim()
            const provinceCode = resolveProvinceCode(String(it?.provinceCode || provinceRaw), provinces)
            const zip = String(it?.postcode || '').trim()
            const lat = Number(it?.latitude)
            const lon = Number(it?.longitude)
            const houseNumber = String(it?.houseNumber || '').trim()
            return {
              street: road,
              houseNumber,
              city: cityName,
              province: provinceRaw,
              provinceCode,
              zipCode: zip,
              latitude: Number.isFinite(lat) ? lat : undefined,
              longitude: Number.isFinite(lon) ? lon : undefined,
              fullLabel: String(it?.label || '')
            } as StreetSuggestion
          })
          .filter(Boolean) as StreetSuggestion[]

        setStreetSuggestions(mapped)
        if (suppressStreetDropdownRef.current) {
          suppressStreetDropdownRef.current = false
          setStreetDropdownOpen(false)
        } else {
          setStreetDropdownOpen(mapped.length > 0)
        }
      } catch {
        setStreetSuggestions([])
      } finally {
        setStreetLoading(false)
      }
    }, 280)

    return () => clearTimeout(t)
  }, [step, form.street, form.streetNumber, form.city, form.province, form.zipCode, provinces, cities, token])

  const propertyTypes = useMemo(() => (dict.propertyTypes.length ? dict.propertyTypes : [{ id: 5, label: 'Appartamento' }]), [dict.propertyTypes])
  const announcementTypes = useMemo(() => (dict.announcementTypes.length ? dict.announcementTypes : [{ id: 1, label: 'Vendita' }, { id: 2, label: 'Affitto' }, { id: 3, label: 'Vacanze' }]), [dict.announcementTypes])

  const togglePortal = (portalCode: number) => {
    const current = Array.isArray(form.oneClickData?.selectedPortalCodes) ? form.oneClickData.selectedPortalCodes : []
    const next = current.includes(portalCode) ? current.filter((v: number) => v !== portalCode) : [...current, portalCode]
    setOne('selectedPortalCodes', next.sort((a: number, b: number) => a - b))
  }

  const pick = <T,>(arr: T[], fallback: T): T => {
    if (!Array.isArray(arr) || arr.length === 0) return fallback
    return arr[Math.floor(Math.random() * arr.length)]
  }
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
  const maybe = (chance = 0.5) => Math.random() < chance
  const nowIt = () => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const autofillRandom = () => {
    const cityPick = pick(cities, { name: 'Pescara', provinceCode: 'PE', provinceName: 'Pescara', istatCode: '068028' })
    const provincePick = cityPick.provinceCode || pick(provinces, { code: 'PE', name: 'Pescara' }).code
    const streetNames = ['Via Benedetto Croce', 'Via Roma', 'Corso Vittorio Emanuele', 'Via Garibaldi', 'Viale Europa', 'Via Giovanni XXIII']
    const owners = [
      { first: 'Mario', last: 'Rossi' },
      { first: 'Luca', last: 'Bianchi' },
      { first: 'Giulia', last: 'Verdi' },
      { first: 'Anna', last: 'Colombo' }
    ]
    const owner = pick(owners, owners[0])
    const street = `${pick(streetNames, streetNames[0])}`
    const streetNumber = String(randInt(1, 199))
    const composedAddress = composeAddress(street, streetNumber)
    const typePick = pick(propertyTypes, { id: 5, label: 'Appartamento' })
    const annPick = pick(announcementTypes, { id: 1, label: 'Vendita' })
    const price = randInt(65000, 790000)
    const rooms = randInt(2, 8)
    const bedrooms = Math.max(1, Math.min(rooms - 1, randInt(1, 5)))
    const bathrooms = randInt(1, 4)
    const surface = randInt(45, 320)
    const now = nowIt()
    const rnd = randInt(10000, 99999)
    const rif = `REF-${rnd}`
    const title = `${typePick.label} ${cityPick.name} ${rnd}`
    const allPortalCodes = (dict.portalCodes || []).map((p) => p.id)
    const fallbackPortals = allPortalCodes.length > 0 ? allPortalCodes : [20]
    const agentPick = agents.length > 0 ? pick(agents, agents[0]) : null
    const enumOr = (k: string, def: string) => pick((dict.enums?.[k] || []).filter(Boolean), def)
    const lat = Number((41 + Math.random() * 5).toFixed(6))
    const lon = Number((12 + Math.random() * 5).toFixed(6))
    const makeDemoImage = (label: string, bg: string) =>
      `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${bg}"/>
              <stop offset="100%" stop-color="#0f172a"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)"/>
          <text x="50%" y="45%" fill="#ffffff" font-size="54" font-family="Arial, sans-serif" text-anchor="middle">${label}</text>
          <text x="50%" y="56%" fill="#e5e7eb" font-size="30" font-family="Arial, sans-serif" text-anchor="middle">Immagine demo auto-fill</text>
        </svg>`
      )}`
    const demoImages = [
      makeDemoImage(`Immobile ${rnd} - 1`, '#2563eb'),
      makeDemoImage(`Immobile ${rnd} - 2`, '#16a34a'),
      makeDemoImage(`Immobile ${rnd} - 3`, '#dc2626')
    ]
    const shortVideoUrl = 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4'

    setIstatManual(false)
    setStreetNumberManual(true)
    setImages(demoImages)
    setForm((prev: any) => ({
      ...prev,
      title,
      reference: rif,
      description: `Immobile test auto-generato in ${cityPick.name}. Ottimo stato, pronto per pubblicazione e test integrazione 1click.`,
      contractType: annPick.id === 2 ? 'RENT' : 'SALE',
      status: 'AVAILABLE',
      type: annPick.id === 2 ? 'APARTMENT' : 'APARTMENT',
      street,
      streetNumber,
      address: composedAddress,
      city: cityPick.name,
      province: provincePick,
      zipCode: String(randInt(10000, 98168)),
      latitude: lat,
      longitude: lon,
      giComuneIstat: cityPick.istatCode || '068028',
      rooms,
      bedrooms,
      bathrooms,
      surface,
      salePrice: annPick.id === 2 ? undefined : price,
      rentPrice: annPick.id === 2 ? randInt(450, 2500) : undefined,
      energyClass: pick(['A4', 'A3', 'A2', 'B', 'C', 'D', 'E', 'F', 'G'], 'C'),
      ownerFirstName: owner.first,
      ownerLastName: owner.last,
      ownerEmail: `${owner.first.toLowerCase()}.${owner.last.toLowerCase()}${randInt(1, 99)}@mailtest.it`,
      ownerPhone: `3${randInt(10, 99)}${randInt(1000000, 9999999)}`,
      ownerFiscalCode: `${owner.last.slice(0, 3).toUpperCase()}${owner.first.slice(0, 3).toUpperCase()}${randInt(10, 99)}A01H501X`,
      agentId: agentPick?.id || '',
      agentName: agentPick?.name || '',
      agentEmail: agentPick?.email || '',
      agentPhone: agentPick?.phone || '',
      notes: `Compilazione automatica di test #${rnd}`,
      oneClickData: {
        ...(prev.oneClickData || {}),
        riferimento: rif,
        idtipologiaimmobile: typePick.id,
        idtipologiaannuncio: annPick.id,
        comune_istat: cityPick.istatCode || '068028',
        descrizione: `Descrizione completa test per ${title}.`,
        titolo_annuncio: title.slice(0, 50),
        indirizzo: composedAddress,
        nazione: 'IT',
        cap: String(randInt(10000, 98168)),
        zona: `Zona ${pick(['Centro', 'Nord', 'Sud', 'Colli'], 'Centro')}`,
        localita: '',
        latitudine: lat,
        longitudine: lon,
        mappa: maybe(0.8) ? 'S' : 'N',
        indirizzo_visibile: maybe(0.8) ? 'S' : 'N',
        prezzo: price,
        note_prezzo: maybe(0.4) ? 'Trattabile' : '',
        prezzo_settimanale: annPick.id === 3 ? randInt(350, 2200) : undefined,
        priorita: randInt(1, 5),
        mq: surface,
        nr_locali: rooms,
        nr_camere: bedrooms,
        nr_servizi: bathrooms,
        nr_altre_stanze: randInt(0, 3),
        note_locali: maybe(0.5) ? 'Soggiorno ampio, cucina abitabile' : '',
        ncostruzionesn: maybe(0.3) ? 'S' : 'N',
        anno_costruzione: randInt(1960, 2024),
        condizioni: enumOr('condizioni', 'abitabile'),
        classe_immobile: enumOr('classe_immobile', 'medio'),
        disponibilita: enumOr('disponibilita', 'libero'),
        vetrina: maybe(0.5) ? 'S' : 'N',
        piano: enumOr('piano', '1'),
        totale_piani: randInt(1, 10),
        unita_immobiliare: randInt(1, 50),
        ascensore: maybe(0.6) ? 'S' : 'N',
        spese_cond_mensili: randInt(20, 280),
        balcone: maybe(0.6) ? 'S' : 'N',
        nr_balconi: randInt(0, 3),
        terrazzo: maybe(0.35) ? 'S' : 'N',
        nr_terrazzi: randInt(0, 2),
        giardino: enumOr('giardino', 'nessuno'),
        mq_giardino: randInt(0, 140),
        mansarda: maybe(0.25) ? 'S' : 'N',
        cantina: maybe(0.45) ? 'S' : 'N',
        box_auto: enumOr('box_auto', 'nessuno'),
        mq_box: randInt(0, 45),
        mq_esterno: randInt(0, 160),
        arredato: maybe(0.6) ? 'S' : 'N',
        cucina: enumOr('cucina', 'abitabile'),
        riscaldamento: enumOr('riscaldamento', 'autonomo'),
        tipo_riscaldamento: enumOr('tipo_riscaldamento', 'termosifone'),
        condizionatore: maybe(0.55) ? 'S' : 'N',
        allarme_antifurto: maybe(0.25) ? 'S' : 'N',
        portineria: maybe(0.15) ? 'S' : 'N',
        internet: maybe(0.8) ? 'S' : 'N',
        caminetto: maybe(0.1) ? 'S' : 'N',
        piscina: maybe(0.08) ? 'S' : 'N',
        tipo_classe_energetica: pick(['V', 'N'], 'V'),
        classe_energetica: pick(['A4', 'A3', 'A2', 'B', 'C', 'D', 'E', 'F', 'G'], 'C'),
        ipe: randInt(20, 280),
        ipe_rinnovabili: randInt(0, 70),
        efficienza_estiva: pick(['scarsa', 'sufficiente', 'buona'], 'buona'),
        efficienza_invernale: pick(['scarsa', 'sufficiente', 'buona'], 'buona'),
        efficienza_zero: maybe(0.2) ? 'S' : 'N',
        ipe_certificato: maybe(0.75) ? 'S' : 'N',
        descrizione_breve: `Immobile test in ${cityPick.name}, pronto per visita.`,
        descrizione_ing: 'Auto-generated english description for test workflow.',
        descrizione_ted: 'Automatisch erzeugte deutsche Beschreibung fuer Tests.',
        descrizione_fra: 'Description francaise generee automatiquement pour test.',
        descrizione_spa: 'Descripcion en espanol generada automaticamente para pruebas.',
        data_inserimento: now,
        data_aggiornamento: now,
        data_scadenza_asta: '',
        asta: maybe(0.1) ? 'S' : 'N',
        codice_rge: maybe(0.1) ? `RGE-${randInt(100, 999)}` : '',
        lotto_asta: maybe(0.1) ? String(randInt(1, 12)) : '',
        valutazione_asta: maybe(0.1) ? randInt(45000, 420000) : undefined,
        categoria_annuncio: enumOr('categoria_annuncio', 'residenziale'),
        link_esterno: `https://example.com/immobile/${rnd}`,
        id_localita_immobiliareit: '',
        id_zona_immobiliareit: '',
        contratto_affitto: annPick.id === 2 ? enumOr('contratto_affitto', '4+4') : '',
        selectedPortalCodes: fallbackPortals,
        videos: [
          {
            link_video: shortVideoUrl,
            titolo: `Tour ${title}`.slice(0, 40),
            tipo_video: 'V',
            codice_embedded: ''
          }
        ]
      }
    }))
    alert('Auto-compilazione test completata.')
  }

  const uploadImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).slice(0, Math.max(0, 40 - images.length)).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (evt) => { if (evt.target?.result) setImages((prev) => [...prev, String(evt.target?.result)]) }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const fieldDefs: Record<number, FieldDef[]> = {
    3: [
      { key: 'prezzo', label: 'Prezzo', type: 'number', placeholder: 'Es. 250000' },
      { key: 'note_prezzo', label: 'Note prezzo', type: 'text', placeholder: 'Es. Trattabile' },
      { key: 'prezzo_settimanale', label: 'Prezzo settimanale', type: 'number', placeholder: 'Solo affitti turistici' },
      { key: 'priorita', label: 'Priorita (1-5)', type: 'number', placeholder: '1 minimo - 5 massimo' }
    ],
    4: [
      { key: 'mq', label: 'Superficie (mq)', type: 'number' },
      { key: 'nr_locali', label: 'Numero locali', type: 'number' },
      { key: 'nr_camere', label: 'Numero camere', type: 'number' },
      { key: 'nr_servizi', label: 'Numero bagni', type: 'number' },
      { key: 'nr_altre_stanze', label: 'Altre stanze', type: 'number' },
      { key: 'note_locali', label: 'Note vani', type: 'text', placeholder: 'Es. soggiorno doppio' }
    ],
    11: [
      { key: 'data_inserimento', label: 'Data inserimento *', type: 'text', required: true, placeholder: 'gg/mm/aaaa hh:mm:ss' },
      { key: 'data_aggiornamento', label: 'Data aggiornamento *', type: 'text', required: true, placeholder: 'gg/mm/aaaa hh:mm:ss' },
      { key: 'data_scadenza_asta', label: 'Data scadenza asta', type: 'text', placeholder: 'gg/mm/aaaa' }
    ],
    12: [
      { key: 'codice_rge', label: 'Codice RGE', type: 'text' },
      { key: 'lotto_asta', label: 'Lotto asta', type: 'text' },
      { key: 'valutazione_asta', label: 'Valutazione asta', type: 'number' }
    ],
    13: [
      { key: 'link_esterno', label: 'Link esterno annuncio', type: 'text', placeholder: 'https://...' },
      { key: 'id_localita_immobiliareit', label: 'ID localita immobiliare.it', type: 'text' },
      { key: 'id_zona_immobiliareit', label: 'ID zona immobiliare.it', type: 'text' }
    ],
    10: [
      { key: 'descrizione_breve', label: 'Descrizione breve', type: 'textarea', placeholder: 'Max 255 caratteri' },
      { key: 'descrizione_ing', label: 'Descrizione inglese', type: 'textarea' },
      { key: 'descrizione_ted', label: 'Descrizione tedesco', type: 'textarea' },
      { key: 'descrizione_fra', label: 'Descrizione francese', type: 'textarea' },
      { key: 'descrizione_spa', label: 'Descrizione spagnolo', type: 'textarea' }
    ]
  }

  const fieldHelp: Record<string, string> = {
    prezzo: 'Prezzo richiesto dell\'immobile in euro.',
    note_prezzo: 'Note commerciali sul prezzo (es. trattabile).',
    prezzo_settimanale: 'Solo per locazioni brevi/turistiche.',
    priorita: 'Priorita di pubblicazione da 1 (bassa) a 5 (alta).',
    mq: 'Superficie commerciale o principale in metri quadrati.',
    nr_locali: 'Numero totale locali principali.',
    nr_camere: 'Numero camere da letto.',
    nr_servizi: 'Numero bagni/servizi.',
    nr_altre_stanze: 'Stanze aggiuntive (studio, ripostiglio, ecc.).',
    note_locali: 'Dettagli utili sulla distribuzione interna.',
    data_inserimento: 'Data prima pubblicazione nel formato gg/mm/aaaa hh:mm:ss.',
    data_aggiornamento: 'Data ultimo aggiornamento nel formato gg/mm/aaaa hh:mm:ss.',
    data_scadenza_asta: 'Solo per annunci all\'asta.',
    codice_rge: 'Codice RGE della procedura.',
    lotto_asta: 'Lotto assegnato alla procedura d\'asta.',
    valutazione_asta: 'Valutazione economica legata all\'asta.',
    link_esterno: 'URL esterno dell\'annuncio o landing.',
    id_localita_immobiliareit: 'ID localita su immobiliare.it (alternativo a zona).',
    id_zona_immobiliareit: 'ID zona su immobiliare.it (alternativo a localita).',
    descrizione: 'Testo descrittivo completo dell\'immobile.',
    descrizione_breve: 'Versione breve per anteprime portali.',
    descrizione_ing: 'Traduzione in inglese.',
    descrizione_ted: 'Traduzione in tedesco.',
    descrizione_fra: 'Traduzione in francese.',
    descrizione_spa: 'Traduzione in spagnolo.',
    titolo_annuncio: 'Titolo commerciale, massimo 50 caratteri.',
    ncostruzionesn: 'Indica se l\'immobile e di nuova costruzione.',
    anno_costruzione: 'Anno di costruzione o ristrutturazione principale.',
    vetrina: 'Mette in evidenza l\'annuncio sui portali compatibili.',
    totale_piani: 'Numero totale di piani dell\'edificio.',
    unita_immobiliare: 'Numero unita immobiliari nel fabbricato.',
    spese_cond_mensili: 'Spese condominiali mensili in euro.',
    ascensore: 'Presenza ascensore nel fabbricato.',
    nr_balconi: 'Numero balconi disponibili.',
    nr_terrazzi: 'Numero terrazzi disponibili.',
    mq_giardino: 'Metri quadrati del giardino.',
    mansarda: 'Presenza mansarda.',
    cantina: 'Presenza cantina.',
    mq_box: 'Metri quadrati del box auto.',
    mq_esterno: 'Metri quadrati esterni (corte/terrazzi/giardino).',
    arredato: 'Indica se viene venduto/locato arredato.',
    condizionatore: 'Presenza impianto di climatizzazione.',
    allarme_antifurto: 'Presenza sistema di allarme.',
    portineria: 'Presenza servizio portineria.',
    internet: 'Predisposizione/connessione internet.',
    caminetto: 'Presenza caminetto.',
    piscina: 'Presenza piscina.',
    classe_energetica: 'Classe energetica dichiarata (A4, A3, ..., G).',
    ipe: 'Indice prestazione energetica.',
    ipe_rinnovabili: 'Quota IPE da fonti rinnovabili.',
    efficienza_estiva: 'Efficienza involucro in estate.',
    efficienza_invernale: 'Efficienza involucro in inverno.',
    efficienza_zero: 'Edificio a energia quasi zero.',
    ipe_certificato: 'IPE certificato da attestato energetico.',
    asta: 'Attiva i campi asta per immobili giudiziari.'
  }

  const renderField = (f: FieldDef) => {
    const value = form.oneClickData?.[f.key]
    const helpText = fieldHelp[f.key] || f.placeholder || ''
    const badge = f.required ? <span style={reqBadgeStyle}>Obbligatorio</span> : <span style={optBadgeStyle}>Facoltativo</span>
    const help = helpText ? <span style={helpBadgeStyle} title={helpText}>?</span> : null
    if (f.type === 'checkbox') {
      return <div key={f.key} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.5rem', background: '#fff' }}>
        <div style={labelRowStyle}>
          <span style={labelLeftStyle}>{f.label}{help}</span>
          {badge}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#111827' }}>
          <input type="checkbox" checked={String(value || 'N') === 'S'} onChange={(e) => setSN(f.key, e.target.checked)} />
          {String(value || 'N') === 'S' ? 'Si' : 'No'}
        </label>
      </div>
    }
    const label = `${f.label}${f.required ? ' *' : ''}`
    return <div key={f.key}>
      <div style={labelRowStyle}>
        <span style={labelLeftStyle}>{label}{help}</span>
        {badge}
      </div>
      {f.type === 'textarea'
        ? <textarea rows={3} style={inputStyle} value={value || ''} placeholder={f.placeholder || ''} onChange={(e) => setOne(f.key, e.target.value)} />
        : <input type={f.type} style={inputStyle} value={value ?? ''} placeholder={f.placeholder || ''} onChange={(e) => f.type === 'number' ? setNum(f.key, e.target.value) : setOne(f.key, e.target.value)} />
      }
      {helpText && <div style={hintStyle}>{helpText}</div>}
    </div>
  }

  const renderStep = () => {
    if (step === 1) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}><div><label style={labelStyle}>Riferimento annuncio *</label><input style={inputStyle} value={form.oneClickData?.riferimento || form.reference || ''} placeholder="Codice univoco es. REF-12345" onChange={(e) => { setForm((p: any) => ({ ...p, reference: e.target.value })); setOne('riferimento', e.target.value) }} /><div style={hintStyle}>Identificativo unico dell'immobile</div></div><div><label style={labelStyle}>Tipologia immobile *</label><select style={inputStyle} value={form.oneClickData?.idtipologiaimmobile || ''} onChange={(e) => setOne('idtipologiaimmobile', e.target.value ? Number(e.target.value) : undefined)}><option value="">Seleziona tipologia...</option>{propertyTypes.map((r) => <option key={r.id} value={r.id}>{r.id} - {r.label}</option>)}</select></div><div><label style={labelStyle}>Tipo annuncio *</label><select style={inputStyle} value={form.oneClickData?.idtipologiaannuncio || 1} onChange={(e) => setOne('idtipologiaannuncio', Number(e.target.value))}>{announcementTypes.map((r) => <option key={r.id} value={r.id}>{r.id} - {r.label}</option>)}</select></div></div></div>

    if (step === 2) return <div style={cardStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 1fr 1fr 0.8fr', gap: 10 }}>
        <div ref={streetAutocompleteRef} style={{ position: 'relative' }}>
          <label style={labelStyle}>Via *</label>
          <input
            style={inputStyle}
            value={form.street || ''}
            placeholder="Es. Via Benedetto Croce 297 Pescara"
            onChange={(e) => {
              const raw = e.target.value
              const parsedInput = parseStreetInput(raw)
              const looseNumber = extractLooseHouseNumber(raw)
              setForm((p: any) => ({
                ...p,
                street: raw,
                streetNumber: !streetNumberManual
                  ? (parsedInput.streetNumber || looseNumber || p.streetNumber)
                  : p.streetNumber
              }))
              setStreetDropdownOpen(true)
            }}
            onFocus={() => {
              if (streetSuggestions.length > 0) setStreetDropdownOpen(true)
            }}
            autoComplete="street-address"
          />
          {streetDropdownOpen && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 63, zIndex: 20, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', maxHeight: 220, overflowY: 'auto' }}>
              {streetLoading ? (
                <div style={{ padding: '7px 8px', fontSize: 12, color: '#6b7280' }}>Cerco indirizzi in Italia...</div>
              ) : streetSuggestions.length === 0 ? (
                <div style={{ padding: '7px 8px', fontSize: 12, color: '#6b7280' }}>Nessun risultato</div>
              ) : (
                streetSuggestions.map((s, idx) => (
                  <button
                    key={`${s.street}-${s.houseNumber || ''}-${idx}`}
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: '#fff', padding: '6px 8px', cursor: 'pointer', fontSize: 12 }}
                    onClick={() => applyStreetSuggestion(s)}
                  >
                    <div style={{ fontWeight: 700 }}>{s.street}{s.houseNumber ? ` ${s.houseNumber}` : ''}</div>
                    <div style={{ color: '#6b7280', marginTop: 2 }}>{[s.city, s.provinceCode || s.province, s.zipCode].filter(Boolean).join(' - ')}</div>
                  </button>
                ))
              )}
            </div>
          )}
          <div style={hintStyle}>Scrivi anche civico e citta (es. \"Via Benedetto Croce 297 Pescara\")</div>
        </div>

        <div>
          <label style={labelStyle}>Numero civico</label>
          <input
            style={inputStyle}
            value={form.streetNumber || ''}
            placeholder="Es. 12A"
            onChange={(e) => {
              const value = e.target.value
              setStreetNumberManual(String(value || '').trim().length > 0)
              setForm((p: any) => ({ ...p, streetNumber: value }))
              if (String(form.street || '').trim().length >= 2) setStreetDropdownOpen(true)
            }}
          />
        </div>

        <div>
          <label style={labelStyle}>Citta *</label>
          <input
            style={inputStyle}
            value={form.city || ''}
            placeholder="Es. Pescara"
            onChange={(e) => {
              setIstatManual(false)
              setForm((p: any) => ({ ...p, city: e.target.value }))
            }}
          />
        </div>

        <div>
          <label style={labelStyle}>Provincia *</label>
          <select
            style={inputStyle}
            value={form.province || ''}
            onChange={(e) => {
              setIstatManual(false)
              setForm((p: any) => ({ ...p, province: e.target.value }))
            }}
          >
            <option value="">Seleziona...</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>CAP</label>
          <input
            style={inputStyle}
            value={form.zipCode || ''}
            placeholder="Es. 65121"
            onChange={(e) => {
              setForm((p: any) => ({ ...p, zipCode: e.target.value }))
              setOne('cap', e.target.value)
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Comune ISTAT *</label>
          <input style={inputStyle} value={form.oneClickData?.comune_istat || form.giComuneIstat || ''} placeholder="Auto da citta/provincia" onChange={(e) => { setIstatManual(true); setForm((p: any) => ({ ...p, giComuneIstat: e.target.value })); setOne('comune_istat', e.target.value) }} />
          <div style={hintStyle}>{istatManual ? 'Valore manuale' : 'Compilato automaticamente'}</div>
        </div>
        <div><label style={labelStyle}>Nazione</label><input style={inputStyle} value={form.oneClickData?.nazione || 'IT'} onChange={(e) => setOne('nazione', e.target.value)} /></div>
        <div><label style={labelStyle}>Zona</label><input style={inputStyle} value={form.oneClickData?.zona || ''} placeholder="Es. Centro" onChange={(e) => setOne('zona', e.target.value)} /></div>
        <div><label style={labelStyle}>Localita</label><input style={inputStyle} value={form.oneClickData?.localita || ''} placeholder="Alternativa a zona" onChange={(e) => setOne('localita', e.target.value)} /></div>
        <div><label style={labelStyle}>Indirizzo completo</label><input style={inputStyle} readOnly value={composeAddress(form.street, form.streetNumber) || ''} /></div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <div><label style={labelStyle}>Latitudine</label><input type="number" style={inputStyle} value={form.latitude || ''} placeholder="Es. 42.467" onChange={(e) => { const v = e.target.value ? Number(e.target.value) : undefined; setForm((p: any) => ({ ...p, latitude: v })); setOne('latitudine', v) }} /></div>
        <div><label style={labelStyle}>Longitudine</label><input type="number" style={inputStyle} value={form.longitude || ''} placeholder="Es. 14.210" onChange={(e) => { const v = e.target.value ? Number(e.target.value) : undefined; setForm((p: any) => ({ ...p, longitude: v })); setOne('longitudine', v) }} /></div>
        <label style={cellStyle}><input type="checkbox" checked={String(form.oneClickData?.indirizzo_visibile || 'S') === 'S'} onChange={(e) => setSN('indirizzo_visibile', e.target.checked)} />Mostra indirizzo sul portale</label>
        <label style={cellStyle}><input type="checkbox" checked={String(form.oneClickData?.mappa || 'S') === 'S'} onChange={(e) => setSN('mappa', e.target.checked)} />Mostra mappa sul portale</label>
      </div>
    </div>

    if (step === 3) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>{fieldDefs[3].map(renderField)}</div></div>

    if (step === 4) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>{fieldDefs[4].map(renderField)}</div></div>

    if (step === 5) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>{renderField({ key: 'ncostruzionesn', label: 'Nuova costruzione', type: 'checkbox' })}{renderField({ key: 'anno_costruzione', label: 'Anno costruzione', type: 'number', placeholder: 'Es. 2008' })}<div><label style={labelStyle}>Condizioni</label><select style={inputStyle} value={form.oneClickData?.condizioni || ''} onChange={(e) => setOne('condizioni', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.condizioni || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div><div><label style={labelStyle}>Classe immobile</label><select style={inputStyle} value={form.oneClickData?.classe_immobile || ''} onChange={(e) => setOne('classe_immobile', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.classe_immobile || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div><div><label style={labelStyle}>Disponibilita</label><select style={inputStyle} value={form.oneClickData?.disponibilita || ''} onChange={(e) => setOne('disponibilita', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.disponibilita || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>{renderField({ key: 'vetrina', label: 'In vetrina', type: 'checkbox' })}</div></div>

    if (step === 6) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}><div><label style={labelStyle}>Piano</label><select style={inputStyle} value={form.oneClickData?.piano || ''} onChange={(e) => setOne('piano', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.piano || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>{renderField({ key: 'totale_piani', label: 'Totale piani edificio', type: 'number' })}{renderField({ key: 'unita_immobiliare', label: 'Unita immobiliari', type: 'number' })}{renderField({ key: 'spese_cond_mensili', label: 'Spese condominiali mensili', type: 'number', placeholder: 'Euro/mese' })}{renderField({ key: 'ascensore', label: 'Ascensore', type: 'checkbox' })}</div></div>

    if (step === 7) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>{renderField({ key: 'balcone', label: 'Balcone', type: 'checkbox' })}{renderField({ key: 'nr_balconi', label: 'Numero balconi', type: 'number' })}{renderField({ key: 'terrazzo', label: 'Terrazzo', type: 'checkbox' })}{renderField({ key: 'nr_terrazzi', label: 'Numero terrazzi', type: 'number' })}<div><label style={labelStyle}>Giardino</label><select style={inputStyle} value={form.oneClickData?.giardino || ''} onChange={(e) => setOne('giardino', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.giardino || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>{renderField({ key: 'mq_giardino', label: 'Mq giardino', type: 'number' })}{renderField({ key: 'mansarda', label: 'Mansarda', type: 'checkbox' })}{renderField({ key: 'cantina', label: 'Cantina', type: 'checkbox' })}<div><label style={labelStyle}>Box auto</label><select style={inputStyle} value={form.oneClickData?.box_auto || ''} onChange={(e) => setOne('box_auto', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.box_auto || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>{renderField({ key: 'mq_box', label: 'Mq box', type: 'number' })}{renderField({ key: 'mq_esterno', label: 'Mq esterno', type: 'number' })}</div></div>

    if (step === 8) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>{renderField({ key: 'arredato', label: 'Arredato', type: 'checkbox' })}<div><label style={labelStyle}>Cucina</label><select style={inputStyle} value={form.oneClickData?.cucina || ''} onChange={(e) => setOne('cucina', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.cucina || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div><div><label style={labelStyle}>Riscaldamento</label><select style={inputStyle} value={form.oneClickData?.riscaldamento || ''} onChange={(e) => setOne('riscaldamento', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.riscaldamento || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div><div><label style={labelStyle}>Tipo riscaldamento</label><select style={inputStyle} value={form.oneClickData?.tipo_riscaldamento || ''} onChange={(e) => setOne('tipo_riscaldamento', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.tipo_riscaldamento || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>{renderField({ key: 'condizionatore', label: 'Condizionatore', type: 'checkbox' })}{renderField({ key: 'allarme_antifurto', label: 'Allarme antifurto', type: 'checkbox' })}{renderField({ key: 'portineria', label: 'Portineria', type: 'checkbox' })}{renderField({ key: 'internet', label: 'Internet', type: 'checkbox' })}{renderField({ key: 'caminetto', label: 'Caminetto', type: 'checkbox' })}{renderField({ key: 'piscina', label: 'Piscina', type: 'checkbox' })}</div></div>

    if (step === 9) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}><div><label style={labelStyle}>Tipo classe energetica</label><select style={inputStyle} value={form.oneClickData?.tipo_classe_energetica || 'V'} onChange={(e) => setOne('tipo_classe_energetica', e.target.value)}><option value="V">V (ante 2015)</option><option value="N">N (post 2015)</option></select></div>{renderField({ key: 'classe_energetica', label: 'Classe energetica', type: 'text', placeholder: 'Es. A4, B, C...' })}{renderField({ key: 'ipe', label: 'IPE', type: 'number' })}{renderField({ key: 'ipe_rinnovabili', label: 'IPE rinnovabili', type: 'number' })}{renderField({ key: 'efficienza_estiva', label: 'Efficienza estiva', type: 'text', placeholder: 'scarsa/sufficiente/buona' })}{renderField({ key: 'efficienza_invernale', label: 'Efficienza invernale', type: 'text', placeholder: 'scarsa/sufficiente/buona' })}{renderField({ key: 'efficienza_zero', label: 'Edificio quasi zero', type: 'checkbox' })}{renderField({ key: 'ipe_certificato', label: 'IPE certificato', type: 'checkbox' })}</div></div>

    if (step === 10) return <div style={cardStyle}><div>{renderField({ key: 'descrizione', label: 'Descrizione immobile', type: 'textarea', required: true, placeholder: 'Descrizione completa (obbligatoria)' })}</div><div style={{ marginTop: 10 }}>{renderField({ key: 'titolo_annuncio', label: 'Titolo annuncio', type: 'text', placeholder: 'Max 50 caratteri' })}</div><div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>{fieldDefs[10].map(renderField)}</div></div>

    if (step === 11) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>{fieldDefs[11].map(renderField)}</div></div>

    if (step === 12) return <div style={cardStyle}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>{renderField({ key: 'asta', label: 'Immobile all\'asta', type: 'checkbox' })}{fieldDefs[12].map(renderField)}</div></div>

    if (step === 13) return <div style={cardStyle}>
      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#111827' }}>Seleziona i portali dove pubblicare</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOne('selectedPortalCodes', (dict.portalCodes || []).map((p) => p.id))}
          style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          Seleziona tutti
        </button>
        <button
          type="button"
          onClick={() => setOne('selectedPortalCodes', [])}
          style={{ border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          Deseleziona tutti
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
        {(dict.portalCodes || []).map((p) => <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}><input type="checkbox" checked={Array.isArray(form.oneClickData?.selectedPortalCodes) && form.oneClickData.selectedPortalCodes.includes(p.id)} onChange={() => togglePortal(p.id)} />{p.label} ({p.id})</label>)}
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>{fieldDefs[13].map(renderField)}</div>
      <div style={hintStyle}>Nota: id_localita_immobiliareit e id_zona_immobiliareit sono alternativi (non usarli insieme).</div>
    </div>

    if (step === 14) return <div style={cardStyle}><div><label style={labelStyle}>Contratto affitto</label><select style={inputStyle} value={form.oneClickData?.contratto_affitto || ''} onChange={(e) => setOne('contratto_affitto', e.target.value)}><option value="">Seleziona...</option>{(dict.enums.contratto_affitto || []).map((o) => <option key={o} value={o}>{o}</option>)}</select><div style={hintStyle}>Compila solo se l'annuncio e in locazione.</div></div></div>

    if (step === 15) return <div style={cardStyle}><div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Foto immobile (max 40)</div><input type="file" accept="image/*" multiple onChange={uploadImages} /><div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>{images.map((img, i) => <div key={`${img}-${i}`} style={{ border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden', position: 'relative' }}><img src={img} alt={`img-${i}`} style={{ width: '100%', height: 85, objectFit: 'cover' }} /><button type="button" onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))} style={{ position: 'absolute', top: 2, right: 2, border: 'none', background: '#ef4444', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>x</button></div>)}</div></div>

    if (step === 16) {
      const videos = Array.isArray(form.oneClickData?.videos) ? form.oneClickData.videos : []
      return <div style={{ display: 'grid', gap: 10 }}><div style={cardStyle}><div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Video (max 4)</div><div style={{ display: 'grid', gap: 8 }}>{videos.map((video: any, i: number) => <div key={`v-${i}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 90px 120px 36px', gap: 6 }}><input style={inputStyle} value={video?.link_video || ''} placeholder="Link video" onChange={(e) => { const next = [...videos]; next[i] = { ...(next[i] || {}), link_video: e.target.value }; setOne('videos', next) }} /><input style={inputStyle} value={video?.titolo || ''} placeholder="Titolo" onChange={(e) => { const next = [...videos]; next[i] = { ...(next[i] || {}), titolo: e.target.value }; setOne('videos', next) }} /><select style={inputStyle} value={video?.tipo_video || 'V'} onChange={(e) => { const next = [...videos]; next[i] = { ...(next[i] || {}), tipo_video: e.target.value }; setOne('videos', next) }}><option value="V">V</option><option value="T">T</option></select><input style={inputStyle} value={video?.codice_embedded || ''} placeholder="Embed" onChange={(e) => { const next = [...videos]; next[i] = { ...(next[i] || {}), codice_embedded: e.target.value }; setOne('videos', next) }} /><button type="button" onClick={() => setOne('videos', videos.filter((_: any, idx: number) => idx !== i))}>x</button></div>)}{videos.length < 4 && <button type="button" onClick={() => setOne('videos', [...videos, { link_video: '', titolo: '', tipo_video: 'V', codice_embedded: '' }])}>Aggiungi video</button>}</div></div><div style={cardStyle}><div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Dati proprietario / assegnazione agente</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}><div><label style={labelStyle}>Nome proprietario</label><input style={inputStyle} value={form.ownerFirstName || ''} onChange={(e) => setForm((p: any) => ({ ...p, ownerFirstName: e.target.value }))} /></div><div><label style={labelStyle}>Cognome proprietario</label><input style={inputStyle} value={form.ownerLastName || ''} onChange={(e) => setForm((p: any) => ({ ...p, ownerLastName: e.target.value }))} /></div><div><label style={labelStyle}>Codice fiscale</label><input style={inputStyle} value={form.ownerFiscalCode || ''} onChange={(e) => setForm((p: any) => ({ ...p, ownerFiscalCode: e.target.value }))} /></div><div><label style={labelStyle}>Email proprietario</label><input style={inputStyle} value={form.ownerEmail || ''} onChange={(e) => setForm((p: any) => ({ ...p, ownerEmail: e.target.value }))} /></div><div><label style={labelStyle}>Telefono proprietario</label><input style={inputStyle} value={form.ownerPhone || ''} onChange={(e) => setForm((p: any) => ({ ...p, ownerPhone: e.target.value }))} /></div><div><label style={labelStyle}>Assegna agente</label><select style={inputStyle} value={form.agentId || ''} onChange={(e) => { const a = agents.find((x) => x.id === e.target.value); setForm((p: any) => ({ ...p, agentId: e.target.value, agentName: a?.name || '', agentEmail: a?.email || '', agentPhone: a?.phone || '' })) }}><option value="">Seleziona agente...</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div><div style={{ marginTop: 10 }}><label style={labelStyle}>Note interne</label><textarea rows={3} style={inputStyle} value={form.notes || ''} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} /></div></div></div>
    }

    return <div style={cardStyle}>Step non disponibile.</div>
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const oneClickData = {
      ...(form.oneClickData || {}),
      riferimento: String(form.oneClickData?.riferimento || form.reference || '').trim(),
      descrizione: String(form.oneClickData?.descrizione || form.description || '').trim(),
      comune_istat: String(form.oneClickData?.comune_istat || form.giComuneIstat || '').trim(),
      titolo_annuncio: String(form.oneClickData?.titolo_annuncio || form.title || '').trim().slice(0, 50),
      indirizzo: composeAddress(form.street, form.streetNumber),
      idtipologiaannuncio: Number(form.oneClickData?.idtipologiaannuncio) || (form.contractType === 'RENT' ? 2 : 1),
      data_inserimento: String(form.oneClickData?.data_inserimento || '').trim() || new Date().toLocaleString('it-IT'),
      data_aggiornamento: String(form.oneClickData?.data_aggiornamento || '').trim() || new Date().toLocaleString('it-IT'),
      selectedPortalCodes: Array.isArray(form.oneClickData?.selectedPortalCodes) ? form.oneClickData.selectedPortalCodes : [],
      immagini: images.map((link, i) => ({ link, description: '', planimetria: 'N', principale: i === 0 ? 'S' : 'N' })),
      videos: Array.isArray(form.oneClickData?.videos) ? form.oneClickData.videos.slice(0, 4) : []
    }

    const missing: string[] = []
    if (!oneClickData.riferimento) missing.push('Riferimento')
    if (!oneClickData.idtipologiaimmobile) missing.push('Tipologia immobile')
    if (!oneClickData.idtipologiaannuncio) missing.push('Tipo annuncio')
    if (!oneClickData.comune_istat) missing.push('Comune ISTAT')
    if (!oneClickData.descrizione) missing.push('Descrizione')
    if (!oneClickData.data_inserimento) missing.push('Data inserimento')
    if (!oneClickData.data_aggiornamento) missing.push('Data aggiornamento')
    if (!Array.isArray(oneClickData.selectedPortalCodes) || oneClickData.selectedPortalCodes.length === 0) missing.push('Portali pubblicazione')
    if (oneClickData.id_localita_immobiliareit && oneClickData.id_zona_immobiliareit) missing.push('ID localita/zona immobiliare.it (inserirne solo uno)')

    if (missing.length > 0) {
      alert(`Compila i campi obbligatori: ${missing.join(', ')}`)
      return
    }

    const payload = {
      ...form,
      title: String(form.title || form.oneClickData?.titolo_annuncio || '').trim(),
      reference: String(form.reference || oneClickData.riferimento || '').trim(),
      description: String(form.description || oneClickData.descrizione || '').trim(),
      address: composeAddress(form.street, form.streetNumber),
      zipCode: form.zipCode,
      city: form.city,
      province: form.province,
      latitude: form.latitude,
      longitude: form.longitude,
      giComuneIstat: String(oneClickData.comune_istat || '').trim(),
      images,
      portalTargets: ['ONECLICKANNUNCI'],
      oneClickData,
      submitForApproval: !isAdminUser,
      isPublished: isAdminUser
    }

    setIsSubmitting(true)
    try {
      await onSave(payload)
    } finally {
      setIsSubmitting(false)
    }
  }

  const body = renderStep()

  const modal = <div className="manus-contact-modal-overlay" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483647, padding: '0.75rem' }}><div className="manus-contact-modal-panel property-upload-modal-panel" style={{ backgroundColor: '#ffffff', borderRadius: '0.95rem', padding: '0.75rem 0.85rem 0.7rem', width: '100%', maxWidth: '1080px', height: 'min(860px, calc(100dvh - 16px))', maxHeight: 'calc(100dvh - 16px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}><div><h3 className="manus-contact-title" style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, color: '#111827' }}>{property ? 'Modifica Immobile' : 'Nuovo Immobile'}</h3><p className="manus-contact-subtitle" style={{ margin: '0.15rem 0 0', color: '#6b7280', fontSize: '0.75rem' }}>Flusso completo 1click + proprietario + assegnazione agente</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" onClick={autofillRandom} style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '0.35rem 0.6rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Auto-fill test</button><button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontSize: 20, lineHeight: 1 }}>x</button></div></div><div style={{ marginBottom: '0.55rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}><div style={{ color: '#111827', fontSize: '0.77rem', fontWeight: 700 }}>Step {step} di {STEPS.length}: {STEPS[step - 1]}</div><div style={{ color: '#6b7280', fontSize: '0.72rem' }}>1click-v6.2</div></div><div style={{ width: '100%', height: 6, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden', marginBottom: '0.45rem' }}><div style={{ width: `${(step / STEPS.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb 0%,#38bdf8 100%)' }} /></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>{STEPS.map((label, i) => <button key={label} type="button" onClick={() => setStep(i + 1)} style={{ border: i + 1 === step ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,.25)', background: i + 1 === step ? 'rgba(37,99,235,.15)' : '#f3f4f6', color: '#111827', borderRadius: 999, padding: '0.18rem 0.5rem', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>{label}</button>)}</div></div><form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}><div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>{body}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.6rem', justifyContent: 'flex-end', paddingTop: '0.55rem', borderTop: '1px solid #e5e7eb' }}>{step > 1 && <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} style={{ padding: '0.5rem 0.9rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.55rem', color: '#111827', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Indietro</button>}{step < STEPS.length && <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))} style={{ padding: '0.5rem 0.9rem', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Avanti</button>}<button type="button" onClick={onCancel} style={{ padding: '0.5rem 0.9rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.55rem', color: '#111827', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annulla</button>{step === STEPS.length && <button type="submit" disabled={isSubmitting} style={{ padding: '0.5rem 0.9rem', backgroundColor: isSubmitting ? '#1d4ed8' : '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.55rem', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, fontSize: 13 }}>{isSubmitting ? 'Salvataggio...' : property ? 'Aggiorna immobile' : 'Crea immobile'}</button>}</div></form></div></div>

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
