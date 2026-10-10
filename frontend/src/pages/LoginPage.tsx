import { useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import {
  AlertCircle, ArrowRight, BarChart3, CalendarCheck2, Check, ChevronRight, ClipboardPlus, Eye, EyeOff,
  Fingerprint, LockKeyhole, Network, ShieldCheck, Sparkles, UserRoundCog,
} from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { useSession } from '../app/useSession'
import { ApiError } from '../api/errors'
import type { Role, SessionUser } from '../types'
import { Button, Field } from '../components/ui'
import receptionImage from '../assets/clinical/reception-corridor.webp'
import clinicianImage from '../assets/clinical/clinical-technology.webp'
import managerImage from '../assets/clinical/digital-health.webp'
import financeImage from '../assets/clinical/finance-calculator.webp'
import medSyncLogo from '../assets/brand/medsync-logo.png'

interface PortalMeta {
  label: string
  portalName: string
  description: string
  outcome: string
  icon: typeof ClipboardPlus
  color: string
  soft: string
  deep: string
  number: string
  image: string
}

const roleCopy: Record<Role, PortalMeta> = {
  Receptionist: {
    label: 'Reception', portalName: 'Front desk', description: 'Coordinate every patient arrival and appointment.',
    outcome: 'Patients · Scheduling · Walk-ins', icon: CalendarCheck2, color: '#3B6EA5', soft: '#EAF0F8', deep: '#284F79', number: '01', image: receptionImage,
  },
  Clinician: {
    label: 'Clinician', portalName: 'Care team', description: 'Move from today’s visits into clear clinical records.',
    outcome: 'Worklist · Notes · Treatments', icon: ClipboardPlus, color: '#6C4AB6', soft: '#F1ECFA', deep: '#4F3487', number: '02', image: clinicianImage,
  },
  Manager: {
    label: 'Manager', portalName: 'Branch lead', description: 'See branch activity, capacity, and daily performance.',
    outcome: 'Operations · Activity · Reports', icon: BarChart3, color: '#0E5E5E', soft: '#E7F5F1', deep: '#0A4747', number: '03', image: managerImage,
  },
  Admin: {
    label: 'Admin / Finance', portalName: 'Finance office', description: 'Control billing, claims, staff, and clinic setup.',
    outcome: 'Billing · Claims · Administration', icon: UserRoundCog, color: '#B5651D', soft: '#FBF0E2', deep: '#854710', number: '04', image: financeImage,
  },
}

const defaultCredentials: Record<Role, { username: string; password: string }> = {
  Receptionist: { username: 'reception.user', password: 'CorrectPassword123!' },
  Clinician: { username: 's.silva', password: 'CorrectPassword123!' },
  Manager: { username: 'k.perera', password: 'CorrectPassword123!' },
  Admin: { username: 'admin.user', password: 'CorrectPassword123!' },
}

const portalClass: Record<Role, string> = {
  Receptionist: 'portal-reception', Clinician: 'portal-clinician', Manager: 'portal-manager', Admin: 'portal-admin',
}

export default function LoginPage() {
  const { demoUsers, signIn, notify } = useClinic()
  const session = useSession()
  const [selected, setSelected] = useState<SessionUser>(demoUsers[0])
  const [username, setUsername] = useState(defaultCredentials.Receptionist.username)
  const [password, setPassword] = useState(defaultCredentials.Receptionist.password)
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)

  const selectedMeta = roleCopy[selected.role]

  const handleSelectRole = (demoUser: SessionUser) => {
    setSelected(demoUser)
    const creds = defaultCredentials[demoUser.role]
    setUsername(creds.username)
    setPassword(creds.password)
    setErrorMessage(null)
    setErrorCode(undefined)
  }

  const followPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setErrorCode(undefined)

    try {
      const response = await session.login({
        username: username.trim(),
        password,
      })
      notify({
        type: 'success',
        title: `Welcome, ${response.user.fullName.split(' ')[0]}`,
        message: `${response.user.roleDisplayName || response.user.role} workspace initialized.`,
      })
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Authentication could not be completed.'
      const code = caught instanceof ApiError ? caught.code : undefined
      setErrorMessage(message)
      setErrorCode(code)
      notify({
        type: 'error',
        title: 'Sign in rejected',
        message,
        code,
      })
    }
  }

  return <main className={`access-gateway ${portalClass[selected.role]} min-h-screen`}>
    <div className="gateway-orb gateway-orb-one" aria-hidden="true" />
    <div className="gateway-orb gateway-orb-two" aria-hidden="true" />

    <header className="relative z-10 mx-auto flex h-24 max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-12">
      <img className="gateway-brand-logo w-[142px] sm:w-[166px]" src={medSyncLogo} alt="MedSync Medical Network" />
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-lg border border-[#DCE4E4] bg-white/75 px-3 py-2 text-xs font-medium text-slate-600 backdrop-blur sm:flex"><span className="live-pulse !bg-[#1E8A5F]" />Backend auth online</span>
        <span className="flex items-center gap-2 text-xs font-medium text-slate-500"><LockKeyhole size={14} />Authorized staff only</span>
      </div>
    </header>

    <div className="relative z-[1] mx-auto grid max-w-[1480px] gap-8 px-5 pb-10 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)] lg:items-center lg:gap-12 lg:px-12 lg:pb-14 lg:pt-8">
      <section aria-labelledby="gateway-title">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#DCE4E4] bg-white/70 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[.1em] text-slate-600 backdrop-blur"><Network size={13} className="text-clinic-600" />CATMS · Internal clinic operations</span>
          <h1 id="gateway-title" className="mt-5 max-w-[700px] font-display text-[clamp(2.1rem,4vw,3.2rem)] font-semibold leading-[1.08] text-[#12232B]">Staff system access</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#4B5D66]">Select your assigned work area or enter your credentials. Access, actions, and patient records are restricted by staff role.</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Choose your MedSync workspace">
          {demoUsers.map((demoUser) => {
            const meta = roleCopy[demoUser.role]
            const Icon = meta.icon
            const active = selected.role === demoUser.role
            const style = { '--entry-color': meta.color, '--entry-soft': meta.soft, '--entry-deep': meta.deep } as CSSProperties
            return <button
              key={demoUser.role}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelectRole(demoUser)}
              onPointerMove={followPointer}
              style={style}
              className={`portal-entry-card group ${active ? 'is-selected' : ''}`}
            >
              <span className="entry-spotlight" aria-hidden="true" />
              <span className="entry-photo" aria-hidden="true"><img src={meta.image} alt="" loading="eager" /></span>
              <span className="relative z-[1] flex h-full flex-col">
                <span className="flex items-start justify-between">
                  <span className="entry-icon"><Icon size={21} /></span>
                  <span className="flex items-center gap-2"><span className="font-mono text-[10px] font-medium text-slate-400">{meta.number}</span>{active && <span className="entry-check"><Check size={12} /></span>}</span>
                </span>
                <span className="mt-6 block font-mono text-[9px] font-medium uppercase tracking-[.12em] text-[var(--entry-color)]">{meta.portalName}</span>
                <span className="mt-1 block font-display text-[24px] font-semibold leading-tight text-[#12232B]">{meta.label}</span>
                <span className="mt-2 block max-w-[25ch] text-[13px] leading-5 text-[#4B5D66]">{meta.description}</span>
                <span className="mt-5 flex items-end justify-between border-t border-[#EAEFEF] pt-4">
                  <span className="font-mono text-[9px] font-medium text-[#7C8B92]">{meta.outcome}</span>
                  <span className="entry-arrow"><ChevronRight size={15} /></span>
                </span>
              </span>
            </button>
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#1E8A5F]" />Role-aware access</span>
          <span className="flex items-center gap-2"><Fingerprint size={14} className="text-[#1E77B8]" />Audited activity</span>
          <span className="flex items-center gap-2"><Sparkles size={14} className="text-[#6C4AB6]" />One clinic-wide record</span>
        </div>
      </section>

      <aside className="access-panel relative overflow-hidden rounded-[20px] border border-white/80 bg-white/90 p-5 backdrop-blur-xl sm:p-7 lg:p-8" aria-label={`${selectedMeta.label} sign in`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-[var(--portal-accent)]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[.1em] text-[var(--portal-accent)]">Selected work area</p>
            <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight text-slate-900">{selectedMeta.label} sign in</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Active role preset: <strong className="font-semibold text-slate-700">{selected.name}</strong></p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--portal-accent-soft)] text-[var(--portal-accent)]"><selectedMeta.icon size={20} /></span>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800" role="alert">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={17} />
              <div className="space-y-1">
                <p className="font-bold text-red-900">{errorCode ? `[${errorCode}] ` : ''}Sign-in rejected</p>
                <p className="text-red-700 leading-relaxed">{errorMessage}</p>
                {errorCode === 'AUTH_ACCOUNT_LOCKED' && (
                  <p className="font-semibold text-red-800 pt-1">
                    This account is locked after consecutive failed attempts. An administrator can unlock it from the Administration portal.
                  </p>
                )}
                {errorCode === 'AUTH_ACCOUNT_DISABLED' && (
                  <p className="font-semibold text-red-800 pt-1">
                    This account is marked disabled. An administrator must reactivate it before logins are permitted.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Username or work email" required>
            <input
              className="input h-12"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin.user"
              autoComplete="username"
              disabled={session.isLoggingIn}
              required
            />
          </Field>
          <Field label="Password" required>
            <div className="relative">
              <input
                className="input h-12 pr-11"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                disabled={session.isLoggingIn}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[var(--portal-accent)]" />
              Keep me signed in
            </label>
            <button
              type="button"
              onClick={() => signIn(selected)}
              className="font-semibold text-[var(--portal-accent)] hover:underline"
              title="Direct demo bypass for offline testing"
            >
              Offline demo bypass
            </button>
          </div>
          <Button type="submit" className="h-11 w-full text-[14px]" disabled={session.isLoggingIn}>
            {session.isLoggingIn ? (
              <>
                <span className="live-pulse !bg-white" /> Verifying credentials…
              </>
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 rounded-xl border border-[#DCE4E4] bg-[#F8FAFA] p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#0E5E5E]" size={17} />
            <div>
              <p className="text-xs font-semibold text-[#12232B]">Connected security system</p>
              <p className="mt-1 text-[11px] leading-5 text-[#64747B]">
                Secured by HttpOnly session cookie, Argon2/Bcrypt password hashing, anti-CSRF token, and immutable event auditing.
              </p>
            </div>
          </div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 font-mono text-[9px] text-[#7C8B92]">
          <LockKeyhole size={11} />ENCRYPTED · ROLE-SCOPED · AUDIT READY
        </p>
      </aside>
    </div>
  </main>
}
