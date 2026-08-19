import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Bell, Building2, CalendarDays, ChevronDown, CircleHelp,
  ClipboardPlus, CreditCard, LayoutDashboard, LogOut, Menu, Moon, Search, ShieldCheck, Sun, UsersRound, X,
  type LucideIcon,
} from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import type { Role } from '../types'
import { Avatar, Modal, SearchInput, Badge } from './ui'
import medSyncLogo from '../assets/brand/medsync-logo.png'
import medSyncMark from '../assets/brand/medsync-mark.png'

interface NavItem { label: string; to: string; icon: LucideIcon; roles: Role[] }

const navItems: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, roles: ['Receptionist', 'Clinician', 'Manager', 'Admin'] },
  { label: 'Patients', to: '/patients', icon: UsersRound, roles: ['Receptionist', 'Clinician', 'Admin'] },
  { label: 'Appointments', to: '/appointments', icon: CalendarDays, roles: ['Receptionist', 'Clinician', 'Manager', 'Admin'] },
  { label: 'Clinical workspace', to: '/clinical', icon: ClipboardPlus, roles: ['Clinician', 'Admin'] },
  { label: 'Billing & claims', to: '/finance', icon: CreditCard, roles: ['Admin'] },
  { label: 'Reports', to: '/reports', icon: BarChart3, roles: ['Manager', 'Admin'] },
  { label: 'Branches & staff', to: '/administration', icon: Building2, roles: ['Admin'] },
]

const roleLabels: Record<Role, string> = { Receptionist: 'Reception', Clinician: 'Clinical', Manager: 'Branch management', Admin: 'Admin & Finance' }

function Brand() {
  return <div className="sidebar-brand flex items-center justify-center">
    <img className="sidebar-brand-logo" src={medSyncLogo} alt="MedSync Medical Network" />
  </div>
}

function Sidebar({ close }: { close?: () => void }) {
  const { user, signOut } = useClinic()
  if (!user) return null
  return <div className="portal-sidebar flex h-full flex-col px-4 py-5 text-slate-800">
    <div className="px-2"><Brand /></div>
    <div className="workspace-switcher mt-4 rounded-2xl border px-3.5 py-3">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[.1em] text-slate-400">Authorized work area</p>
      <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--portal-accent)]"><ShieldCheck size={15} />{roleLabels[user.role]}</div>
    </div>
    <nav className="mt-5 flex-1 space-y-1" aria-label="Main navigation">
      {navItems.filter((item) => item.roles.includes(user.role)).map((item) => <NavLink key={item.to} to={item.to} onClick={close} className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${isActive ? 'portal-nav-active' : 'portal-nav-idle'}`} end={item.to === '/'}><item.icon size={17} /><span>{item.label}</span></NavLink>)}
    </nav>
    <div className="sidebar-footer space-y-1 border-t pt-4">
      <button type="button" className="portal-nav-idle flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"><CircleHelp size={17} />Help & shortcuts</button>
      <button type="button" onClick={signOut} className="portal-nav-idle flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"><LogOut size={17} />Sign out</button>
    </div>
  </div>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, data, signOut } = useClinic()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [nightCharting, setNightCharting] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
  const location = useLocation()
  const currentPage = navItems.find((item) => item.to === location.pathname)?.label ?? 'MedSync workspace'
  if (!user) return null
  const branchName = user.branchId === 'all' ? 'All clinic branches' : data.branches.find((branch) => branch.id === user.branchId)?.name ?? 'MedSync Clinics'
  const portalClass = user.role === 'Receptionist' ? 'portal-reception' : user.role === 'Clinician' ? 'portal-clinician' : user.role === 'Manager' ? 'portal-manager' : 'portal-admin'
  return <div className={`portal-shell ${portalClass} min-h-screen`} data-theme={user.role === 'Clinician' && nightCharting ? 'night' : 'light'}>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block"><Sidebar /></aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><aside className="floating-surface relative h-full w-[min(86vw,20rem)]"><button className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button><Sidebar close={() => setMobileOpen(false)} /></aside></div>}
    <div className="lg:pl-64">
      <header className="portal-topbar sticky top-0 z-30 flex h-[60px] items-center justify-between border-b bg-white/95 px-4 sm:px-5 lg:px-6">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={21} /></button><img className="h-9 w-9 object-contain lg:hidden" src={medSyncMark} alt="MedSync" /><div className="hidden sm:block"><p className="text-sm font-bold text-slate-800">{currentPage}</p><p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{branchName} · Live workspace</p></div></div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user.role === 'Clinician' && <button type="button" onClick={() => setNightCharting((active) => !active)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={nightCharting ? 'Turn off Night Charting' : 'Turn on Night Charting'} title={nightCharting ? 'Use light charting mode' : 'Night Charting'}>{nightCharting ? <Sun size={18} /> : <Moon size={18} />}</button>}
          <button type="button" onClick={() => setSearchOpen(true)} className="topbar-search hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-slate-500 transition hover:text-slate-800 sm:flex" aria-label="Search workspace"><Search size={16} /><span className="text-xs font-medium">Search records</span><kbd className="ml-3 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">Ctrl K</kbd></button>
          <div className="relative">
            <button type="button" onClick={() => setNotificationsOpen(!notificationsOpen)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell size={19} /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral ring-2 ring-white" /></button>
            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50">
                  <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-slate-100">
                    <span className="font-semibold text-sm text-slate-800">Notifications</span>
                    <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800 transition">Mark all as read</button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto px-1">
                    <button type="button" className="flex items-start gap-3 rounded-lg p-2 text-left hover:bg-slate-50 transition">
                      <div className="mt-0.5 rounded-full bg-coral/10 p-1.5 text-coral"><Bell size={14} /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">System update</p>
                        <p className="mt-0.5 text-xs text-slate-500">Scheduled maintenance in 2 hours.</p>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium">10 mins ago</p>
                      </div>
                    </button>
                    <button type="button" className="flex items-start gap-3 rounded-lg p-2 text-left hover:bg-slate-50 transition">
                      <div className="mt-0.5 rounded-full bg-blue-50 p-1.5 text-blue-600"><CalendarDays size={14} /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">New appointment</p>
                        <p className="mt-0.5 text-xs text-slate-500">Sarah Jenkins booked a consultation for 14:30 today.</p>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium">1 hour ago</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
          <div className="relative">
            <button type="button" onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100"><Avatar name={user.name} size="sm" className="portal-avatar" /><span className="hidden md:block"><span className="block text-xs font-bold text-slate-800">{user.name}</span><span className="block text-[10px] text-slate-500">{user.jobTitle}</span></span><ChevronDown size={14} className="hidden text-slate-400 md:block" /></button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-50">
                  <div className="px-3 py-3 border-b border-slate-100 mb-1">
                    <p className="text-sm font-bold text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.jobTitle}</p>
                    <div className="mt-3 space-y-2">
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span>{user.role}</span>
                      </p>
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <Building2 size={14} className="text-blue-500" />
                        <span className="truncate">{branchName}</span>
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setProfileOpen(false); signOut(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"><LogOut size={16} />Sign out</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1560px] px-4 py-4 sm:px-5 sm:py-5 lg:px-6">{children}</main>
      <footer className="px-6 pb-4 text-center text-[11px] text-slate-400"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} />MedSync CATMS · Local staff system · Demonstration data</span></footer>
    </div>

    <Modal open={searchOpen} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} title="Search records" description="Find patients, appointments, and staff members across the network.">
      <SearchInput placeholder="Search by name, ID, or phone number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus className="w-full" />
      <div className="mt-4 min-h-[250px]">
        {searchQuery ? (
          <div className="space-y-2">
            {data.patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.patientNo.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer transition" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.patientNo} • {p.phone}</div>
                </div>
                <Badge tone="Active">Patient</Badge>
              </div>
            ))}
            {data.patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.patientNo.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="mt-12 text-center text-sm text-slate-500">No records found for "{searchQuery}"</div>
            )}
          </div>
        ) : (
          <div className="mt-12 text-center text-sm text-slate-500">Type a name or ID to start searching.</div>
        )}
      </div>
    </Modal>
  </div>
}
