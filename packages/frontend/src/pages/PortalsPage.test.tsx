import { BrowserRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { PortalsPage } from '@/App'

describe('PortalsPage', () => {
  it('renderizza una lista base di portali', () => {
    const portals = [
      {
        id: 'IMMOBILIARE_IT',
        label: 'Immobiliare.it',
        kind: 'SYNC_PUSH' as const,
        modeLabel: 'Sync (push)',
        implemented: true,
        feedUrl: null,
        active: true,
        activationStatus: 'COMPLETED' as const,
        requirements: [],
        selectedCount: 10,
        publishedCount: 8,
        errorCount: 0,
        notPublishableCount: 2
      }
    ]

    render(
      <BrowserRouter>
        <PortalsPage
          portals={portals}
          loading={false}
          onSelectPortal={() => {}}
          onTogglePortal={() => {}}
          onSetPortalActiveLocal={() => {}}
          onSetPortalActivationStatusLocal={() => {}}
          canToggle
        />
      </BrowserRouter>
    )

    expect(screen.getByText(/Immobiliare\.it/i)).toBeInTheDocument()
  })
})

