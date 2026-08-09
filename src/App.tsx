import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ToastRegion } from './components/ToastRegion'
import { LoadingBlock } from './components/ui'
import { useClinic } from './context/ClinicContext'
import type { Role } from './types'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PatientsPage = lazy(() => import('./pages/PatientsPage'))
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'))
const ClinicalPage = lazy(() => import('./pages/ClinicalPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const AdministrationPage = lazy(() => import('./pages/AdministrationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function ProtectedPage({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useClinic()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  const { user } = useClinic()
  return <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <Suspense fallback={<div className="min-h-screen bg-canvas"><LoadingBlock label="Opening secure workspace" /></div>}><Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedPage><DashboardPage /></ProtectedPage>} />
      <Route path="/patients" element={<ProtectedPage roles={['Receptionist', 'Clinician', 'Admin']}><PatientsPage /></ProtectedPage>} />
      <Route path="/appointments" element={<ProtectedPage roles={['Receptionist', 'Clinician', 'Manager', 'Admin']}><AppointmentsPage /></ProtectedPage>} />
      <Route path="/clinical" element={<ProtectedPage roles={['Clinician', 'Admin']}><ClinicalPage /></ProtectedPage>} />
      <Route path="/finance" element={<ProtectedPage roles={['Admin']}><FinancePage /></ProtectedPage>} />
      <Route path="/reports" element={<ProtectedPage roles={['Manager', 'Admin']}><ReportsPage /></ProtectedPage>} />
      <Route path="/administration" element={<ProtectedPage roles={['Admin']}><AdministrationPage /></ProtectedPage>} />
      <Route path="*" element={<ProtectedPage><NotFoundPage /></ProtectedPage>} />
    </Routes></Suspense>
    <ToastRegion />
  </>
}
