import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from './app/QueryProvider'
import { ClinicProvider } from './context/ClinicContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <BrowserRouter>
        <ClinicProvider><App /></ClinicProvider>
      </BrowserRouter>
    </QueryProvider>
  </StrictMode>,
)
