import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

import App from './App'
import { useAuthStore, type User } from './store/authStore'

function createAuthenticatedUser(): User {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    firstName: 'Mario',
    lastName: 'Rossi',
    role: 'AGENCY_ADMIN',
    mustChangePassword: false,
    avatar: undefined,
    agency: {
      id: 'agency-1',
      name: 'Agenzia Demo',
      logo: undefined,
    },
  }
}

function mockOnboardingStatusResponse(status: string, step: number) {
  const body = {
    success: true,
    data: {
      status,
      step,
      agencyDataComplete: step >= 1,
      teamComplete: step >= 2,
      configComplete: step >= 3,
      missingAgencyFields: [],
      missingTeam: [],
      missingConfig: [],
    },
  }

  const defaultBody = {
    success: true,
    data: {},
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input)

    if (url === '/api/onboarding/status') {
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as any
    }

    return {
      ok: true,
      status: 200,
      json: async () => defaultBody,
    } as any
  })

  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as any)
}

function setupOnboardingFlowFetchMock() {
  type OnboardingChecklist = {
    status: string
    step: number
    agencyDataComplete: boolean
    teamComplete: boolean
    configComplete: boolean
    missingAgencyFields: string[]
    missingTeam: string[]
    missingConfig: string[]
  }

  let onboarding: OnboardingChecklist = {
    status: 'PENDING',
    step: 1,
    agencyDataComplete: false,
    teamComplete: false,
    configComplete: false,
    missingAgencyFields: [],
    missingTeam: [],
    missingConfig: [],
  }

  const agencyUpdates: any[] = []
  const usersPayloads: any[] = []
  const portalsPayloads: any[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input)

    const method = (init.method || 'GET').toUpperCase()

    if (url === '/api/onboarding/status') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: onboarding,
        }),
      } as any
    }

    if (url === '/api/onboarding/agency' && method === 'PUT') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      agencyUpdates.push(body)

      onboarding = {
        status: 'IN_PROGRESS',
        step: 2,
        agencyDataComplete: true,
        teamComplete: false,
        configComplete: false,
        missingAgencyFields: [],
        missingTeam: [],
        missingConfig: [],
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any
    }

    if (url === '/api/onboarding/users' && method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      usersPayloads.push(body)

      onboarding = {
        status: 'IN_PROGRESS',
        step: 3,
        agencyDataComplete: true,
        teamComplete: true,
        configComplete: false,
        missingAgencyFields: [],
        missingTeam: [],
        missingConfig: [],
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any
    }

    if (url === '/api/portals' && method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            effectiveBaseUrl: '',
            portals: [
              {
                id: 'IMMOBILIARE_IT',
                label: 'Immobiliare.it',
                kind: 'SYNC_PUSH',
                modeLabel: 'Sync (push)',
                implemented: true,
                active: false,
              },
            ],
          },
        }),
      } as any
    }

    if (url === '/api/onboarding/portals' && method === 'PUT') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      portalsPayloads.push(body)

      onboarding = {
        status: 'IN_PROGRESS',
        step: 4,
        agencyDataComplete: true,
        teamComplete: true,
        configComplete: true,
        missingAgencyFields: [],
        missingTeam: [],
        missingConfig: [],
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any
    }

    if (url === '/api/onboarding/complete' && method === 'POST') {
      onboarding = {
        status: 'COMPLETED',
        step: 4,
        agencyDataComplete: true,
        teamComplete: true,
        configComplete: true,
        missingAgencyFields: [],
        missingTeam: [],
        missingConfig: [],
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: onboarding,
        }),
      } as any
    }

    if (url.startsWith('/api/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    } as any
  })

  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as any)

  return {
    fetchMock,
    agencyUpdates,
    usersPayloads,
    portalsPayloads,
    getOnboarding: () => onboarding,
  }
}

beforeEach(() => {
  const store = useAuthStore.getState()
  store.logout()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Onboarding wizard routing', () => {
  it('redirects authenticated user to onboarding when status is not completed', async () => {
    const user = createAuthenticatedUser()

    useAuthStore.setState((state) => ({
      ...state,
      user,
      token: 'test-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
    }))

    mockOnboardingStatusResponse('IN_PROGRESS', 2)

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Step 2 · Team')).toBeInTheDocument()
    })
  })

  it('forces onboarding when accessing internal page directly with pending status', async () => {
    const user = createAuthenticatedUser()

    useAuthStore.setState((state) => ({
      ...state,
      user,
      token: 'test-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
    }))

    mockOnboardingStatusResponse('PENDING', 1)

    render(
      <MemoryRouter initialEntries={['/portals']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Step 1 · Dati agenzia')).toBeInTheDocument()
    })
  })

  it('redirects from onboarding to dashboard when status is completed', async () => {
    const user = createAuthenticatedUser()

    useAuthStore.setState((state) => ({
      ...state,
      user,
      token: 'test-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
    }))

    mockOnboardingStatusResponse('COMPLETED', 4)

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument()
    })
  })

  it('mostra lo step corretto in base allo step restituito dal backend', async () => {
    const user = createAuthenticatedUser()

    useAuthStore.setState((state) => ({
      ...state,
      user,
      token: 'test-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
    }))

    mockOnboardingStatusResponse('IN_PROGRESS', 3)

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Step 3 · Configurazioni')).toBeInTheDocument()
    })
  })

  it('permette di completare il flusso di onboarding e arrivare alla dashboard', async () => {
    const user = createAuthenticatedUser()

    useAuthStore.setState((state) => ({
      ...state,
      user,
      token: 'test-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
    }))

    const { agencyUpdates, usersPayloads, portalsPayloads } = setupOnboardingFlowFetchMock()

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Step 1 · Dati agenzia')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Salva e prosegui' }))

    await waitFor(() => {
      expect(screen.getByText('Step 2 · Team')).toBeInTheDocument()
    })

    const step2Textboxes = screen.getAllByRole('textbox')

    fireEvent.change(step2Textboxes[0], { target: { value: 'Mario' } })
    fireEvent.change(step2Textboxes[1], { target: { value: 'Rossi' } })
    fireEvent.change(step2Textboxes[2], { target: { value: 'mario.rossi@example.com' } })

    const step2Submit = screen.getByRole('button', { name: 'Salva e prosegui' })
    fireEvent.click(step2Submit)

    await waitFor(() => {
      expect(screen.getByText('Step 3 · Configurazioni')).toBeInTheDocument()
    })

    const step3Textboxes = screen.getAllByRole('textbox')

    fireEvent.change(step3Textboxes[0], { target: { value: 'https://www.example.com' } })

    const saveConfigButton = screen.getByRole('button', { name: 'Salva e prosegui' })
    fireEvent.click(saveConfigButton)

    await waitFor(() => {
      expect(screen.getByText('Step 4 · Riepilogo')).toBeInTheDocument()
    })

    const completeButton = screen.getByRole('button', { name: 'Conferma e vai alla dashboard' })
    fireEvent.click(completeButton)

    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument()
    })

    expect(agencyUpdates.length).toBeGreaterThan(0)
    expect(usersPayloads.length).toBeGreaterThan(0)
    expect(portalsPayloads.length).toBeGreaterThan(0)

    const firstAgencyUpdate = agencyUpdates[0]
    expect(firstAgencyUpdate).toHaveProperty('name')

    const firstUsersPayload = usersPayloads[0]
    expect(Array.isArray(firstUsersPayload.users)).toBe(true)
    expect(firstUsersPayload.users.length).toBeGreaterThan(0)

    const firstPortalsPayload = portalsPayloads[0]
    expect(firstPortalsPayload).toHaveProperty('portals')
  })
})
