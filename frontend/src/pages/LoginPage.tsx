import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { useSession } from '../app/useSession'
import { ApiError } from '../api/errors'
import type { Role, SessionUser } from '../types'
import { Button, Field } from '../components/ui'
import { AmbientGlowSpheres } from '../components/AmbientGlowSpheres'
import medSyncLogo from '../assets/brand/medsync-logo.png'
import loginIllustration from '../assets/brand/login-illustration.png'

const defaultCredentials: Record<Role, { username: string; password: string }> = {
  Receptionist: { username: 'reception.user', password: 'CorrectPassword123!' },
  Clinician: { username: 's.silva', password: 'CorrectPassword123!' },
  Manager: { username: 'k.perera', password: 'CorrectPassword123!' },
  Admin: { username: 'admin.user', password: 'CorrectPassword123!' },
}

export default function LoginPage() {
  const session = useSession()
  const { demoUsers, signIn } = useClinic()
  const [selected, setSelected] = useState<SessionUser>(demoUsers[0])
  const [username, setUsername] = useState(defaultCredentials[demoUsers[0].role]?.username ?? 'reception.user')
  const [password, setPassword] = useState(defaultCredentials[demoUsers[0].role]?.password ?? 'CorrectPassword123!')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSelectRole = (demoUser: SessionUser) => {
    setSelected(demoUser)
    setErrorMessage(null)
    const creds = defaultCredentials[demoUser.role]
    if (creds) {
      setUsername(creds.username)
      setPassword(creds.password)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    try {
      await session.login({ username, password })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to sign in. Please verify credentials.')
      }
    }
  }

  // Color theme unified to Receptionist (Harbor Blue) across all roles
  const portalClass = 'portal-reception'

  return (
    <main
      className={`relative min-h-screen flex flex-col justify-center p-4 pt-16 sm:p-6 lg:p-12 ${portalClass} bg-[#F5F7F7] overflow-hidden`}
    >
      {/* Brand logo in top left corner */}
      <div className="absolute top-5 left-5 sm:top-8 sm:left-8 lg:top-10 lg:left-12 z-20">
        <img
          className="h-16 sm:h-16 lg:h-24 w-auto object-contain drop-shadow-xs"
          src={medSyncLogo}
          alt="MedSync Medical Network"
        />
      </div>

      {/* Ambient background glowing spheres in Harbor Blue palette */}
      <AmbientGlowSpheres role="Receptionist" interactive intensity="medium" />

      {/* 
        =============================================================================
        MAIN CONTENT ROW
        - Left: MedSync Clinic Illustration
        - Right: Glassmorphism Login Card
        - (Uses `lg:flex-row-reverse` so login card is on right and illustration is on left)
        =============================================================================
      */}
      <div className="relative z-10 mx-auto w-full max-w-7xl flex flex-col lg:flex-row-reverse items-center justify-between px-6 sm:px-12 lg:px-16 gap-8 lg:gap-16 py-6">
        {/* Right Column: Glassmorphism Login Card */}
        <div className="w-full max-w-[440px] shrink-0">
          {/* Glassmorphism Login Card with Optical Refraction */}
          <div
            className="glass-card relative overflow-hidden rounded-2xl p-7 sm:p-8"
            style={{
              /* ===================================================================
                 REFRACTION & GLASS CONTROLS GUIDE:
                 - '--glass-blur': controls frosting diffusion (e.g. '12px' sharp -> '32px' frosted)
                 - '--glass-saturate': controls prism chromatic intensity (e.g. '130%' subtle -> '220%' vibrant)
                 - '--glass-bg-opacity': controls glass transparency (e.g. '0.35' clear crystal -> '0.70' milky)
                 - '--glass-border-opacity': controls beveled rim reflection (e.g. '0.50' -> '0.90')
                 =================================================================== */
              ['--glass-blur' as string]: '24px',
              ['--glass-saturate' as string]: '190%',
              ['--glass-bg-opacity' as string]: '0.52',
              ['--glass-border-opacity' as string]: '0.75',
            }}
          >
            {/* Top-left specular refraction glare */}
            <div
              className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-gradient-to-br from-white/60 via-white/20 to-transparent blur-md"
              aria-hidden="true"
            />

            {/* Top specular highlight sheen */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/95 to-transparent"
              aria-hidden="true"
            />

            <div className="relative text-center">
              <h1 className="font-display text-2xl font-semibold text-slate-900">
                Staff Portal Login
              </h1>
              <p className="mt-1.5 text-xs text-slate-500">
                Select your role and sign in to access your workspace
              </p>
            </div>

            {/* Role selector tabs with frosted glass styling */}
            <div
              className="tab-list relative mt-6 mb-5 rounded-xl border border-white/60 bg-white/40 p-1 shadow-[inset_0_1px_2px_rgba(18,35,43,0.03)] backdrop-blur-md"
              role="tablist"
              aria-label="Select role"
            >
              {demoUsers.map((demoUser) => {
                const active = selected.role === demoUser.role
                return (
                  <button
                    key={demoUser.role}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectRole(demoUser)}
                    className={`tab-button flex-1 text-center py-2 text-xs font-semibold transition ${active
                      ? 'tab-button-active bg-white/95 font-bold text-[var(--portal-accent)] shadow-sm border border-white/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                      }`}
                  >
                    {demoUser.role}
                  </button>
                )
              })}
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-800 backdrop-blur-sm" role="alert">
                <p className="font-semibold">{errorMessage}</p>
              </div>
            )}

            {/* Credentials Form */}
            <form className="relative space-y-4" onSubmit={handleSubmit}>
              <Field label="Username or work email">
                <input
                  className="input h-11 border-white/70 bg-white/65 shadow-[inset_0_1px_2px_rgba(18,35,43,0.02)] backdrop-blur-md focus:bg-white/95 focus:border-[var(--portal-accent)] transition-all"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  disabled={session.isLoggingIn}
                  placeholder="e.g. reception.user"
                />
              </Field>

              <Field label="Password">
                <div className="relative">
                  <input
                    className="input h-11 pr-11 border-white/70 bg-white/65 shadow-[inset_0_1px_2px_rgba(18,35,43,0.02)] backdrop-blur-md focus:bg-white/95 focus:border-[var(--portal-accent)] transition-all"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={session.isLoggingIn}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white/60 hover:text-slate-700 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between pt-1 text-xs">
                <label className="flex items-center gap-2 font-medium text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 accent-[var(--portal-accent)]"
                  />
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

              <Button type="submit" className="mt-2 h-11 w-full text-[14px] shadow-sm hover:shadow" disabled={session.isLoggingIn}>
                {session.isLoggingIn ? 'Signing in to workspace…' : 'Sign in to workspace'}
                <ArrowRight size={16} />
              </Button>
            </form>

            {/* Footer info inside glass card */}
            <div className="relative mt-6 border-t border-white/60 pt-4 text-center text-xs text-slate-500 font-medium">
              MedSync Clinics · Colombo · Kandy · Galle
            </div>
          </div>
        </div>

        {/* 
          =============================================================================
          LEFT-SIDE ILLUSTRATION
          ADJUSTMENT GUIDE FOR SIZING & POSITIONING:
          1. Sizing:
             - Container max width: edit `max-w-[600px]` (e.g. `max-w-[480px]`, `max-w-[650px]`)
             - Image max height: edit `max-h-[520px]` (e.g. `max-h-[420px]`, `max-h-[600px]`)
          2. Horizontal Positioning:
             - Align inside container: change `justify-center` or `justify-start`
             - Shift left/right: add `lg:translate-x-4` or `-translate-x-4`
          3. Vertical Positioning:
             - Shift up/down: add `translate-y-4` or `-translate-y-4`
          4. Swapping Sides:
             - On parent <div className="... flex flex-col lg:flex-row-reverse ...">:
               Change `lg:flex-row-reverse` to `lg:flex-row` to swap sides!
          =============================================================================
        */}
        <div className="hidden lg:flex flex-1 justify-center xl:justify-start items-center max-w-[580px] pointer-events-none select-none">
          <img
            src={loginIllustration}
            alt="MedSync Clinical Healthcare Team"
            className="w-full h-auto max-h-[540px] object-contain drop-shadow-sm"
          />
        </div>
      </div>
    </main>
  )
}
