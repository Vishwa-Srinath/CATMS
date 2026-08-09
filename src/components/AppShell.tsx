import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Bell, Building2, CalendarDays, ChevronDown, CircleHelp,
  ClipboardPlus, CreditCard, LayoutDashboard, LogOut, Menu, Moon, Search, ShieldCheck, Sun, UsersRound, X,
  type LucideIcon,
} from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import type { Role } from '../types'
import { Avatar } from './ui'
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
    <div className="workspace-switcher mt-7 rounded-2xl border px-3.5 py-3.5">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[.1em] text-slate-400">Workspace</p>
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
  const { user, data } = useClinic()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [nightCharting, setNightCharting] = useState(false)
  const location = useLocation()
  const currentPage = navItems.find((item) => item.to === location.pathname)?.label ?? 'MedSync workspace'
  if (!user) return null
  const branchName = user.branchId === 'all' ? 'All clinic branches' : data.branches.find((branch) => branch.id === user.branchId)?.name ?? 'MedSync Clinics'
  const portalClass = user.role === 'Receptionist' ? 'portal-reception' : user.role === 'Clinician' ? 'portal-clinician' : user.role === 'Manager' ? 'portal-manager' : 'portal-admin'
  return <div className={`portal-shell ${portalClass} min-h-screen`} data-theme={user.role === 'Clinician' && nightCharting ? 'night' : 'light'}>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block"><Sidebar /></aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><aside className="floating-surface relative h-full w-[min(86vw,20rem)]"><button className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button><Sidebar close={() => setMobileOpen(false)} /></aside></div>}
    <div className="lg:pl-64">
      <header className="portal-topbar sticky top-0 z-30 flex h-[72px] items-center justify-between border-b bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={21} /></button><img className="h-9 w-9 object-contain lg:hidden" src={medSyncMark} alt="MedSync" /><div className="hidden sm:block"><p className="text-sm font-bold text-slate-800">{currentPage}</p><p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{branchName} · Live workspace</p></div></div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user.role === 'Clinician' && <button type="button" onClick={() => setNightCharting((active) => !active)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={nightCharting ? 'Turn off Night Charting' : 'Turn on Night Charting'} title={nightCharting ? 'Use light charting mode' : 'Night Charting'}>{nightCharting ? <Sun size={18} /> : <Moon size={18} />}</button>}
          <button type="button" className="topbar-search hidden items-center gap-2 rounded-xl border px-3 py-2 text-slate-500 transition hover:text-slate-800 sm:flex" aria-label="Search workspace"><Search size={16} /><span className="text-xs font-medium">Search</span><kbd className="ml-3 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">⌘ K</kbd></button>
          <button type="button" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell size={19} /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral ring-2 ring-white" /></button>
          <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
          <button type="button" className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100"><Avatar name={user.name} size="sm" className="portal-avatar" /><span className="hidden md:block"><span className="block text-xs font-bold text-slate-800">{user.name}</span><span className="block text-[10px] text-slate-500">{user.jobTitle}</span></span><ChevronDown size={14} className="hidden text-slate-400 md:block" /></button>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <footer className="px-6 pb-6 text-center text-[11px] text-slate-400"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} />CATMS Phase 1 · Fictional demonstration data only</span></footer>
    </div>
  </div>
}
