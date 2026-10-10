import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, Bell, CalendarDays, Clock,
  CreditCard, LayoutDashboard, LogOut, Menu, Moon, Search, Settings, ShieldCheck,
  Stethoscope, Sun, UsersRound, X,
  type LucideIcon,
} from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import type { Role } from '../types'
import { Avatar, Modal, SearchInput, Badge } from './ui'
import { AmbientGlowSpheres } from './AmbientGlowSpheres'
import medSyncMark from '../assets/brand/medsync-mark.png'

interface NavItem { label: string; to: string; icon: LucideIcon; roles: Role[] }

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: ['Receptionist', 'Clinician', 'Manager', 'Admin'] },
  { label: 'Doctor', to: '/clinical', icon: Stethoscope, roles: ['Clinician', 'Admin'] },
  { label: 'Patients', to: '/patients', icon: UsersRound, roles: ['Receptionist', 'Clinician', 'Admin'] },
  { label: 'Appointments', to: '/appointments', icon: CalendarDays, roles: ['Receptionist', 'Clinician', 'Manager', 'Admin'] },
  { label: 'Billing', to: '/finance', icon: CreditCard, roles: ['Admin'] },
  { label: 'Reports', to: '/reports', icon: BarChart3, roles: ['Manager', 'Admin'] },
  { label: 'Settings', to: '/administration', icon: Settings, roles: ['Admin', 'Manager', 'Receptionist', 'Clinician'] },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <div className="flex items-center justify-center">
        <img src={medSyncMark} alt="MedSync" className="w-12 h-12 object-contain" />
      </div>
      <span className="font-bold text-[20px] tracking-tight text-slate-900 font-sans">MedSync</span>
    </div>
  )
}

function Sidebar({ close }: { close?: () => void }) {
  const { user, data, signOut } = useClinic()
  if (!user) return null
  const staffMember = data.staff.find((s) => s.name === user.name)

  return (
    <div className="relative z-10 flex h-full flex-col justify-between p-5 text-slate-800">
      <div>
        <Brand />
        <nav className="mt-8 space-y-1.5" aria-label="Main navigation">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  `group flex items-center gap-3.5 rounded-2xl px-4 py-2.5 text-[14px] font-medium transition-all ${isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/65 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-xs'
                  }`
                }
                end={item.to === '/'}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={18}
                      className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
        </nav>
      </div>

      <div className="space-y-4 pt-4">
        {/* User profile row */}
        <div className="flex items-center gap-3 px-1 pt-3 border-t border-slate-200/60">
          <Avatar name={user.name} size="sm" className="ring-2 ring-emerald-500/20" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-800 leading-tight">{user.name}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {staffMember?.employeeNo || '72630284'}</p>
          </div>
        </div>

        {/* AI Health Update promo card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white/50 to-teal-50/35 p-3.5 shadow-[0_4px_16px_rgba(16,185,129,0.06)] backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">AI Health Update</span>
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 hover:bg-white/70 hover:text-slate-600 transition"
              aria-label="Close update"
            >
              <X size={12} />
            </button>
          </div>
          <div className="mt-2">
            <p className="text-[11px] font-bold text-slate-700">Advantages</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
              New AI engine improves diagnosis accuracy by 27%
            </p>
          </div>
          <div className="mt-2 text-emerald-500/80">
            <svg viewBox="0 0 160 26" fill="none" className="w-full h-4 stroke-current stroke-[1.8]">
              <path d="M0 18 Q 20 4, 40 16 T 80 10 T 120 20 T 160 8" />
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-1 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-white/60 transition backdrop-blur-xs"
        >
          <LogOut size={13} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, data } = useClinic()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [nightCharting, setNightCharting] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  )

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      )
    }
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!user) return null
  const portalClass = 'portal-reception'

  return (
    <div
      className={`portal-shell ${portalClass} min-h-screen relative overflow-x-hidden`}
      data-theme={user.role === 'Clinician' && nightCharting ? 'night' : 'light'}
    >
      {/* Ambient background glowing spheres across all dashboards for glass refraction */}
      <AmbientGlowSpheres role={user.role} interactive intensity="medium" className="z-0 fixed" />

      {/* Floating rounded Sidebar on Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block p-3 sm:p-4">
        <div className="glass-sidebar relative h-full rounded-[28px] overflow-hidden overflow-y-auto">
          {/* Top specular refraction highlight sheen */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/95 to-transparent z-10"
            aria-hidden="true"
          />
          {/* Top-left specular refraction glare */}
          <div
            className="pointer-events-none absolute -top-12 -left-12 h-36 w-36 rounded-full bg-gradient-to-br from-white/50 via-white/15 to-transparent blur-md z-10"
            aria-hidden="true"
          />
          <Sidebar />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(86vw,19rem)] p-3">
            <div className="glass-sidebar relative h-full rounded-[28px] overflow-hidden overflow-y-auto">
              {/* Top specular refraction highlight sheen */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/95 to-transparent z-10"
                aria-hidden="true"
              />
              <button
                className="absolute right-5 top-5 z-20 rounded-full p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800 transition backdrop-blur-xs"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
              <Sidebar close={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main layout container */}
      <div className="lg:pl-64 relative z-10">
        <div className="sticky top-0 z-30 pt-3 sm:pt-4 pointer-events-none">
          <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 pointer-events-none">
            <header className="pointer-events-auto portal-topbar flex h-[68px] sm:h-[72px] items-center justify-between px-4 sm:px-6 lg:px-8 py-3 rounded-2xl shadow-xs">
              {/* Left: Mobile toggle + Pill Search input */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileOpen(true)}
                  className="rounded-xl p-2 text-slate-600 hover:bg-white/80 lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu size={22} />
                </button>

                <div
                  onClick={() => setSearchOpen(true)}
                  className="flex items-center gap-2.5 rounded-full bg-white/90 border border-slate-200/80 shadow-xs px-4 py-2 w-48 sm:w-80 cursor-pointer hover:border-slate-300 transition"
                  role="search"
                >
              <Search size={15} className="text-slate-400" />
              <span className="text-xs text-slate-400 font-medium">Search</span>
            </div>
          </div>

          {/* Right: Actions and Status Pills */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {user.role === 'Clinician' && (
              <button
                type="button"
                onClick={() => setNightCharting((active) => !active)}
                className="h-10 w-10 rounded-full bg-white/90 border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-500 hover:bg-white"
                aria-label={nightCharting ? 'Turn off Night Charting' : 'Turn on Night Charting'}
              >
                {nightCharting ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}

            {/* Notification Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="h-10 w-10 rounded-full bg-white/90 border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-600 hover:bg-white relative transition"
                aria-label="Notifications"
              >
                <Bell size={17} />
                <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              </button>
              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl z-50">
                    <div className="flex items-center justify-between px-3 pb-2 pt-1 border-b border-slate-100">
                      <span className="font-semibold text-xs text-slate-800">Notifications</span>
                      <button type="button" className="text-[11px] font-medium text-slate-400 hover:text-slate-700">Mark all read</button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto px-1 pt-1">
                      <div className="rounded-xl p-2.5 text-left hover:bg-slate-50 transition flex items-start gap-2.5">
                        <div className="rounded-full bg-rose-50 p-1.5 text-rose-600"><Bell size={13} /></div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">System update</p>
                          <p className="text-[11px] text-slate-500">Scheduled maintenance in 2 hours.</p>
                        </div>
                      </div>
                      <div className="rounded-xl p-2.5 text-left hover:bg-slate-50 transition flex items-start gap-2.5">
                        <div className="rounded-full bg-sky-50 p-1.5 text-sky-600"><CalendarDays size={13} /></div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">New appointment</p>
                          <p className="text-[11px] text-slate-500">Sarah Jenkins booked for 14:30 today.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Date Pill badge */}
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/90 border border-slate-200/80 shadow-xs px-4 py-2 text-xs font-semibold text-slate-700">
              <CalendarDays size={14} className="text-slate-400" />
              <span>October 23, 2025</span>
            </div>

            {/* Live Clock Pill with Seconds */}
            <div
              className="flex items-center gap-2 rounded-full bg-white/90 border border-slate-200/80 shadow-xs px-4 py-2 text-xs font-semibold text-slate-700 tabular-nums"
              aria-label="Current time"
            >
              <Clock size={14} className="text-slate-400" />
              <span>{currentTime}</span>
            </div>
              </div>
            </header>
          </div>
        </div>

        <main id="main-content" className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-8 py-4 sm:py-5">{children}</main>
        <footer className="px-6 pb-6 text-center text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} />MedSync CATMS · Live System</span>
        </footer>
      </div>

      <Modal open={searchOpen} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} title="Search records" description="Find patients, appointments, and staff members across the network.">
        <SearchInput placeholder="Search patients, appointments, or staff by name, ID, or phone…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus className="w-full" />
        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {searchQuery.trim() ? (
            <div className="space-y-2">
              {/* Patients matches */}
              {data.patients
                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.patientNo.toLowerCase().includes(searchQuery.toLowerCase()) || p.nic.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 4)
                .map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-clinic-500 hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate('/patients'); }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} size="sm" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{p.patientNo} · {p.phone}</div>
                      </div>
                    </div>
                    <Badge tone="Active">Patient</Badge>
                  </div>
                ))}

              {/* Appointments matches */}
              {data.appointments
                .filter(a => a.reference.toLowerCase().includes(searchQuery.toLowerCase()) || a.reason.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 3)
                .map(a => {
                  const patient = data.patients.find(p => p.id === a.patientId)
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-clinic-500 hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate('/appointments'); }}
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{a.reference} · {patient?.name}</div>
                        <div className="text-xs text-slate-500">{a.date} · {a.start}–{a.end} · {a.reason}</div>
                      </div>
                      <Badge tone={a.status}>{a.status}</Badge>
                    </div>
                  )
                })}

              {/* Staff matches */}
              {data.staff
                .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.employeeNo.toLowerCase().includes(searchQuery.toLowerCase()) || s.role.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 3)
                .map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-clinic-500 hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate('/administration'); }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} size="sm" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{s.employeeNo} · {s.role}</div>
                      </div>
                    </div>
                    <Badge tone={s.isActive ? 'Active' : 'Inactive'}>{s.role}</Badge>
                  </div>
                ))}

              {data.patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.patientNo.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                data.appointments.filter(a => a.reference.toLowerCase().includes(searchQuery.toLowerCase()) || a.reason.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                data.staff.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.employeeNo.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div className="py-12 text-center text-sm text-slate-500">No matching records found for "{searchQuery}"</div>
                )}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">Type a name, patient ID, reference, or doctor to search.</div>
          )}
        </div>
      </Modal>
    </div>
  )
}
