import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

function BootWithPreloader() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 900)
    return () => window.clearTimeout(timer)
  }, [])

  if (!isReady) {
    return (
      <div className="cosmocasa-preloader" role="status" aria-live="polite" aria-label="Caricamento applicazione">
        <img
          src="/cosmocasa-preloader.webp"
          alt="Cosmo Casa"
          className="cosmocasa-preloader-logo"
          loading="eager"
          decoding="async"
        />
      </div>
    )
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <BootWithPreloader />
    </BrowserRouter>
  </React.StrictMode>,
) 
