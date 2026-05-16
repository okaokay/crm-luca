import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Building2, CalendarDays, Mic, MicOff, Send, Sparkles, Users, Volume2 } from 'lucide-react'

type CommandTarget = {
  page: string
  label: string
  keywords: string[]
}

type AssistantServerResponse = {
  text: string
  action?: 'reply' | 'navigate'
  page?: string | null
  suggestion?: string
  scope?: 'in_scope' | 'out_of_scope'
  source?: 'groq' | 'local_fallback'
}

type Props = {
  userName: string
  onNavigatePage: (page: string) => void
  authToken?: string | null
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: any) => void) | null
  onresult: ((event: any) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor
    SpeechRecognition?: SpeechRecognitionCtor
  }
}

const COMMANDS: CommandTarget[] = [
  { page: 'dashboard', label: 'Dashboard', keywords: ['dashboard', 'home', 'riepilogo'] },
  { page: 'immobili', label: 'Immobili', keywords: ['immobili', 'immobile', 'casa', 'case'] },
  { page: 'contatti', label: 'Clienti', keywords: ['clienti', 'cliente', 'contatti', 'contatto'] },
  { page: 'incrocio', label: 'Incrocio', keywords: ['incrocio', 'matching', 'match'] },
  { page: 'agenti', label: 'Agenti', keywords: ['agenti', 'agente', 'team'] },
  { page: 'zone-tasks', label: 'Task di zona', keywords: ['task di zona', 'zona'] },
  { page: 'appuntamenti', label: 'Appuntamenti', keywords: ['appuntamenti', 'appuntamento', 'calendario'] },
  { page: 'contratti', label: 'Contratti', keywords: ['contratti', 'contratto'] },
  { page: 'attivita', label: 'Attivita', keywords: ['attivita', 'attivita', 'task', 'attivita'] },
  { page: 'notifiche', label: 'Notifiche', keywords: ['notifiche', 'notifica', 'avvisi'] },
  { page: 'report', label: 'Report', keywords: ['report', 'statistiche', 'kpi'] },
  { page: 'impostazioni', label: 'Impostazioni', keywords: ['impostazioni', 'configurazione', 'settaggi'] },
  { page: 'portals', label: '1clickannunci', keywords: ['portali', '1click', '1clickannunci'] },
  { page: 'ai-assist', label: 'AI Assist', keywords: ['assistente', 'ai assist', 'comandi vocali'] }
]

const QUICK_COMMANDS = [
  'Apri dashboard',
  'Apri immobili',
  'Apri clienti',
  'Apri appuntamenti',
  'Apri attivita',
  'Apri notifiche',
  'Apri report'
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type VoiceRecognizerController = {
  supported: boolean
  start: () => void
  stop: () => void
  destroy: () => void
}

function createVoiceRecognizer(options: {
  lang: string
  onResult: (payload: { transcript: string; isFinal: boolean }) => void
  onStart: () => void
  onEnd: () => void
  onError: (error: string) => void
}): VoiceRecognizerController {
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognitionImpl) {
    return {
      supported: false,
      start: () => undefined,
      stop: () => undefined,
      destroy: () => undefined
    }
  }

  const recognizer = new SpeechRecognitionImpl()
  recognizer.lang = options.lang
  recognizer.continuous = false
  recognizer.interimResults = true
  recognizer.maxAlternatives = 1
  recognizer.onstart = () => options.onStart()
  recognizer.onend = () => options.onEnd()
  recognizer.onerror = (event: any) => options.onError(String(event?.error || 'unknown'))
  recognizer.onresult = (event: any) => {
    let finalTranscript = ''
    let interimTranscript = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const value = String(event.results[i][0]?.transcript || '')
      if (event.results[i].isFinal) {
        finalTranscript += value
      } else {
        interimTranscript += value
      }
    }
    if (interimTranscript.trim()) options.onResult({ transcript: interimTranscript.trim(), isFinal: false })
    if (finalTranscript.trim()) options.onResult({ transcript: finalTranscript.trim(), isFinal: true })
  }

  return {
    supported: true,
    start: () => recognizer.start(),
    stop: () => recognizer.stop(),
    destroy: () => recognizer.abort()
  }
}

function resolveLocalCommand(message: string): CommandTarget | null {
  const clean = normalize(message)
  if (!clean) return null

  const hasNavigationVerb = /(apri|vai|mostra|portami|entra|apertura)/.test(clean)
  if (!hasNavigationVerb && !/dashboard|immobili|clienti|appuntamenti|notifiche|report|impostazioni|contratti|incrocio|agenti|task/.test(clean)) {
    return null
  }

  return COMMANDS.find((item) => item.keywords.some((keyword) => clean.includes(normalize(keyword)))) || null
}

function speakItalian(
  text: string,
  hooks?: { onStart?: () => void; onEnd?: () => void; onError?: () => void }
): void {
  if (!('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'it-IT'
    utterance.rate = 1
    utterance.pitch = 1

    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find((v) => v.lang.toLowerCase().startsWith('it') && v.name.toLowerCase().includes('google'))
      || voices.find((v) => v.lang.toLowerCase().startsWith('it'))
      || null
    utterance.voice = preferred
    utterance.onstart = () => hooks?.onStart?.()
    utterance.onend = () => hooks?.onEnd?.()
    utterance.onerror = () => hooks?.onError?.()

    window.speechSynthesis.speak(utterance)
  } catch {
    hooks?.onError?.()
  }
}

async function callAssistantApi({
  authToken,
  text,
  userName
}: {
  authToken?: string | null
  text: string
  userName: string
}): Promise<AssistantServerResponse | null> {
  try {
    const headers: HeadersInit = {
      'content-type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
    const response = await fetch('/api/ai-assist/respond', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        userName,
        pages: COMMANDS.map((item) => ({ page: item.page, label: item.label, keywords: item.keywords }))
      })
    })
    if (!response.ok) return null
    const payload = await response.json()
    if (!payload?.success || !payload?.data || typeof payload.data.text !== 'string') return null
    return payload.data as AssistantServerResponse
  } catch {
    return null
  }
}

export function AiVoiceAssistantPage({ userName, onNavigatePage, authToken }: Props) {
  const [message, setMessage] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastAnswer, setLastAnswer] = useState('Di "ciao Ehi Deddy" e un comando come "Apri immobili".')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState<'groq' | 'local'>('local')

  const recognizerRef = useRef<VoiceRecognizerController | null>(null)
  const lastTranscriptRef = useRef('')
  const processedTranscriptRef = useRef('')
  const supported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), [])

  const stopListening = useCallback(() => {
    const recognizer = recognizerRef.current
    if (!recognizer) return
    try {
      recognizer.stop()
    } catch {
      // no-op
    }
    setIsListening(false)
  }, [])

  const executeCommand = useCallback(async (raw: string) => {
    const clean = raw.trim()
    if (!clean) return

    const normalized = normalize(clean)
    setIsProcessing(true)
    setVoiceError(null)

    if (normalized.includes('aiuto') || normalized.includes('comandi')) {
      const helpText = 'Comandi rapidi: apri dashboard, immobili, clienti, appuntamenti, attivita, notifiche, report e impostazioni.'
      setLastAnswer(helpText)
      setSourceLabel('local')
      speakItalian(helpText, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      })
      setIsProcessing(false)
      return
    }

    const localTarget = resolveLocalCommand(clean)
    if (localTarget) {
      onNavigatePage(localTarget.page)
      const answer = `Apro ${localTarget.label}`
      setLastAnswer(answer)
      setSourceLabel('local')
      speakItalian(answer, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      })
      setIsProcessing(false)
      return
    }

    const aiResponse = await callAssistantApi({
      authToken,
      text: clean,
      userName
    })

    if (!aiResponse) {
      const fallback = 'Non riesco a contattare l assistente AI ora. Prova con un comando rapido.'
      setLastAnswer(fallback)
      setSourceLabel('local')
      speakItalian(fallback, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      })
      setIsProcessing(false)
      return
    }

    const fullText = [aiResponse.text, aiResponse.suggestion].filter(Boolean).join(' ')
    setLastAnswer(fullText || aiResponse.text)
    setSourceLabel(aiResponse.source === 'groq' ? 'groq' : 'local')
    speakItalian(fullText || aiResponse.text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    })

    if (aiResponse.action === 'navigate' && aiResponse.page) {
      onNavigatePage(aiResponse.page)
    }

    setIsProcessing(false)
  }, [authToken, onNavigatePage, userName])

  const rebuildRecognizer = useCallback(() => {
    try {
      recognizerRef.current?.destroy()
    } catch {
      // no-op
    }
    recognizerRef.current = createVoiceRecognizer({
      lang: 'it-IT',
      onResult: ({ transcript, isFinal }) => {
        setLiveTranscript(transcript)
        lastTranscriptRef.current = transcript
        if (isFinal) {
          processedTranscriptRef.current = transcript
          setMessage(transcript)
          void executeCommand(transcript)
        }
      },
      onStart: () => {
        setIsListening(true)
        setVoiceError(null)
      },
      onEnd: () => {
        setIsListening(false)
        const candidate = lastTranscriptRef.current.trim()
        if (candidate && processedTranscriptRef.current !== candidate) {
          processedTranscriptRef.current = candidate
          setMessage(candidate)
          void executeCommand(candidate)
        }
      },
      onError: (error) => {
        setIsListening(false)
        const low = error.toLowerCase()
        if (low === 'not-allowed' || low === 'service-not-allowed') {
          setVoiceError('Permesso microfono negato. Consenti il microfono dalle impostazioni del sito.')
          return
        }
        if (low === 'no-speech') {
          setVoiceError('Nessuna voce rilevata. Riprova parlando piu vicino al microfono.')
          return
        }
        if (low === 'aborted') {
          setVoiceError('Ascolto interrotto. Riprova.')
          return
        }
        setVoiceError(`Voice unavailable: ${error}`)
      }
    })
  }, [executeCommand])

  const startListening = useCallback(() => {
    if (!supported) {
      setVoiceError('Comandi vocali non supportati su questo browser. Usa Chrome/Edge aggiornato.')
      return
    }
    if (!recognizerRef.current?.supported) {
      setVoiceError('Riconoscimento vocale non disponibile su questo browser.')
      return
    }

    setVoiceError(null)
    setLastAnswer('Ti ascolto...')
    setLiveTranscript('')
    lastTranscriptRef.current = ''
    processedTranscriptRef.current = ''
    const tryStart = (): { ok: boolean; error?: unknown } => {
      try {
        recognizerRef.current?.start()
        return { ok: true }
      } catch (error) {
        return { ok: false, error }
      }
    }

    const first = tryStart()
    if (first.ok) return

    // Recover from invalid internal state and retry once.
    rebuildRecognizer()
    const second = tryStart()
    if (second.ok) return

    const err: any = second.error || first.error
    const name = String(err?.name || '').trim()
    const detail = String(err?.message || '').trim()
    const info = [name, detail].filter(Boolean).join(': ')
    setVoiceError(info ? `Avvio microfono fallito (${info}).` : 'Non riesco ad avviare l ascolto ora. Riprova tra pochi secondi.')
  }, [rebuildRecognizer, supported])

  useEffect(() => {
    rebuildRecognizer()
    return () => {
      try {
        recognizerRef.current?.destroy()
      } catch {
        // no-op
      }
      window.speechSynthesis?.cancel()
      recognizerRef.current = null
    }
  }, [rebuildRecognizer])

  const sendTypedMessage = () => {
    void executeCommand(message)
  }

  const quickActions = [
    { label: 'Report', icon: BarChart3, command: 'Apri report' },
    { label: 'Immobili', icon: Building2, command: 'Apri immobili' },
    { label: 'Clienti', icon: Users, command: 'Apri clienti' },
    { label: 'Appuntamenti', icon: CalendarDays, command: 'Apri appuntamenti' }
  ]

  const statusText = isListening ? 'Ti ascolto...' : isSpeaking ? 'Sto rispondendo...' : 'Pronto ad aiutarti'

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'linear-gradient(135deg, #e7e7ff 0%, #dcd6ff 50%, #e8ddff 100%)',
        padding: 'clamp(10px, 1.8vw, 20px)'
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', paddingTop: '0.4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)', fontWeight: 800 }}>
            Ciao, {userName}!
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: 'clamp(0.95rem, 2vw, 1.1rem)' }}>
            {statusText}
          </p>
        </div>

        <div style={{ display: 'grid', placeItems: 'center', marginBottom: '1.2rem' }}>
          <button
            type="button"
            onClick={() => {
              if (isListening) {
                stopListening()
              } else {
                startListening()
              }
            }}
            style={{
              position: 'relative',
              width: 'clamp(180px, 22vw, 250px)',
              height: 'clamp(180px, 22vw, 250px)',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(140deg, #8bd0ee 0%, #49b5eb 36%, #2f6de4 68%, #1f4eb7 100%)',
              boxShadow: isListening
                ? '0 0 0 10px rgba(56, 189, 248, 0.18), 0 0 65px rgba(37, 99, 235, 0.48), inset -16px -18px 30px rgba(17,24,39,0.34), inset 15px 14px 28px rgba(255,255,255,0.45)'
                : '0 0 50px rgba(37, 99, 235, 0.32), inset -16px -18px 30px rgba(17,24,39,0.34), inset 15px 14px 28px rgba(255,255,255,0.45)',
              transform: isListening ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 180ms ease'
            }}
            aria-label={isListening ? 'Ferma ascolto' : 'Attiva microfono'}
          >
            <div
              style={{
                position: 'absolute',
                top: '10%',
                left: '16%',
                width: '66%',
                height: '29%',
                borderRadius: '999px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0.05))',
                transform: 'rotate(-16deg)',
                filter: 'blur(1px)'
              }}
            />
            <Sparkles size={68} color="#ffffff" style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.72))' }} />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isListening) {
                stopListening()
              } else {
                startListening()
              }
            }}
            style={{
              marginTop: '0.9rem',
              borderRadius: 14,
              border: isListening ? '1px solid #ef4444' : '1px solid #2563eb',
              backgroundColor: isListening ? '#fee2e2' : '#dbeafe',
              color: isListening ? '#991b1b' : '#1d4ed8',
              padding: '0.66rem 1rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            {isListening ? 'Ferma HEY MAURI' : 'Attiva HEY MAURI'}
          </button>
        </div>

        <div
          style={{
            borderRadius: 20,
            border: '1px solid rgba(148, 163, 184, 0.32)',
            backgroundColor: 'rgba(255,255,255,0.84)',
            padding: 'clamp(12px, 2.1vw, 20px)',
            boxShadow: '0 14px 34px rgba(79, 70, 229, 0.12)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 12 }}>
            <Sparkles size={20} color="#2563eb" />
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.98rem' }}>Ehi Mauri</span>
          </div>

          <div
            style={{
              minHeight: 72,
              borderRadius: 14,
              border: '1px solid #dbe2f4',
              backgroundColor: '#f8fafc',
              padding: '0.75rem 0.9rem',
              color: '#334155',
              marginBottom: 12
            }}
          >
            {isListening ? (liveTranscript || 'Ti ascolto...') : lastAnswer}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendTypedMessage()
              }}
              placeholder="Scrivi: Apri immobili"
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                padding: '0.65rem 0.8rem',
                fontSize: '0.95rem'
              }}
            />
            <button
              type="button"
              onClick={sendTypedMessage}
              disabled={isProcessing}
              style={{
                borderRadius: 12,
                border: '1px solid #2563eb',
                backgroundColor: '#2563eb',
                color: '#fff',
                minWidth: 44,
                padding: '0.65rem 0.85rem',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                opacity: isProcessing ? 0.7 : 1
              }}
            >
              <Send size={16} />
            </button>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontWeight: 600 }}>
              <Volume2 size={16} />
              Comandi rapidi
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_COMMANDS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setMessage(preset)
                    void executeCommand(preset)
                  }}
                  style={{
                    borderRadius: 999,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#1e293b',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 10
            }}
          >
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setMessage(action.command)
                    void executeCommand(action.command)
                  }}
                  style={{
                    borderRadius: 16,
                    border: '1px solid rgba(148,163,184,0.34)',
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    padding: '0.7rem 0.55rem',
                    display: 'grid',
                    gap: 7,
                    placeItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Icon size={24} color="#334155" />
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>{action.label}</span>
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: 12, color: '#64748b', fontSize: '0.84rem', fontWeight: 600 }}>
            Modalita AI: {sourceLabel === 'groq' ? 'Groq attiva' : 'Fallback locale'}
            {' · '}Riconoscimento vocale: {supported ? 'disponibile' : 'non disponibile'}
          </div>

          {voiceError && (
            <div style={{ marginTop: 8, color: '#b91c1c', fontSize: '0.86rem', fontWeight: 600 }}>{voiceError}</div>
          )}
        </div>
      </div>
    </div>
  )
}
