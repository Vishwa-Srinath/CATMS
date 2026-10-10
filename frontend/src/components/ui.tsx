import { AlertCircle, AlertTriangle, CalendarDays, Check, ChevronRight, Circle, Clock3, Info, Minus, Search, X, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ClinicRuleError } from '../lib/domain'

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  const variants = {
    primary: 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed',
    secondary: 'btn-secondary border disabled:text-slate-400 disabled:cursor-not-allowed',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed',
    danger: 'border border-[#E8C2CA] bg-[#FBEAEE] text-[#C4425A] hover:bg-[#F7DCE2] disabled:opacity-50 disabled:cursor-not-allowed',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-[13px]'
      } ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const badgeStyles: Record<string, string> = {
  Scheduled: 'bg-[#EAF4FB] text-[#1E77B8] ring-[#1E77B8]/25',
  Pending: 'bg-[#EAF4FB] text-[#1E77B8] ring-[#1E77B8]/25',
  Completed: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/25',
  Paid: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/25',
  Approved: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/25',
  Active: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/25',
  PartiallyPaid: 'bg-[#FBF2E3] text-[#9B6819] ring-[#C0872A]/30',
  PartiallyApproved: 'bg-[#FBF2E3] text-[#9B6819] ring-[#C0872A]/30',
  Unpaid: 'bg-[#FBEAEE] text-[#C4425A] ring-[#C4425A]/25',
  Rejected: 'bg-[#FBEAEE] text-[#C4425A] ring-[#C4425A]/25',
  Cancelled: 'bg-[#EFF3F3] text-[#69777F] ring-[#8A97A0]/25',
  Inactive: 'bg-[#EFF3F3] text-[#69777F] ring-[#8A97A0]/25',
  'Walk-in': 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/25',
  Booked: 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/25',
}

const badgeIcons: Record<string, LucideIcon> = {
  Scheduled: Clock3,
  Pending: Clock3,
  Completed: Check,
  Paid: Check,
  Approved: Check,
  Active: Check,
  PartiallyPaid: Circle,
  PartiallyApproved: Circle,
  Unpaid: AlertTriangle,
  Rejected: AlertTriangle,
  Cancelled: Minus,
  Inactive: Minus,
  'Walk-in': Zap,
  Booked: CalendarDays,
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = tone ?? String(children)
  const label = String(children).replace(/([a-z])([A-Z])/g, '$1 $2')
  const Icon = badgeIcons[key]
  return (
    <span
      className={`status-badge inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
        badgeStyles[key] ?? 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/25'
      }`}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {label}
    </span>
  )
}

export function Avatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const letters = name
    .replace('Dr. ', '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-12 w-12 text-sm',
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#EFF3F3] font-semibold text-[#4B5D66] ring-1 ring-[#DCE4E4] ${sizes[size]} ${className}`}
    >
      {letters}
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  image,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  image?: string
}) {
  return (
    <header className="page-hero mb-6">
      <div className="relative z-[1] flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--portal-accent)]">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[26px] font-semibold leading-tight text-slate-900 sm:text-[32px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[14px] leading-6 text-slate-600">{description}</p>
          )}
        </div>
        {(actions || image) && (
          <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
            {image && (
              <span className="page-hero-photo hidden sm:block" aria-hidden="true">
                <img src={image} alt="" loading="eager" />
              </span>
            )}
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        )}
      </div>
    </header>
  )
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'teal',
  subStats,
}: {
  label: string
  value: ReactNode
  detail: string
  icon: LucideIcon
  accent?: 'teal' | 'blue' | 'amber' | 'coral'
  subStats?: {
    label1: string
    val1: string | number
    label2: string
    val2: string | number
  }
}) {
  const accentColors = {
    teal: { bar: 'bg-emerald-500', text: 'text-emerald-600', icon: 'text-emerald-600 bg-emerald-50' },
    blue: { bar: 'bg-sky-500', text: 'text-sky-600', icon: 'text-sky-600 bg-sky-50' },
    amber: { bar: 'bg-amber-500', text: 'text-amber-600', icon: 'text-amber-600 bg-amber-50' },
    coral: { bar: 'bg-rose-500', text: 'text-rose-600', icon: 'text-rose-600 bg-rose-50' },
  }

  const leftBars = [14, 18, 12, 20, 16, 22, 15, 19, 17, 21]
  const rightBars = [14, 16, 12, 15, 10, 13, 11, 14]

  return (
    <div className="metric-card rounded-2xl bg-white/90 p-5 border border-white/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur-md flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-slate-500">{label}</span>
          <div className="h-9 w-9 rounded-full border border-slate-100 bg-white flex items-center justify-center text-slate-600 shadow-xs">
            <Icon size={17} />
          </div>
        </div>
        <div className="my-2 font-display text-[30px] sm:text-[34px] font-bold tracking-tight text-slate-900 leading-none">
          {value}
        </div>
      </div>

      <div className="mt-2 pt-2.5 border-t border-slate-100/90">
        {subStats ? (
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <div className="text-[10px] font-medium text-slate-500 mb-1">{subStats.label1}</div>
              <div className="flex items-end gap-[2px] h-5 mb-1">
                {leftBars.map((h, i) => (
                  <div
                    key={i}
                    className={`w-[2.5px] rounded-full ${accentColors[accent].bar}`}
                    style={{ height: `${h * 0.8}px` }}
                  />
                ))}
              </div>
              <div className="text-[11px] font-bold text-slate-700">{subStats.val1}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-slate-400 mb-1">{subStats.label2}</div>
              <div className="flex items-end gap-[2px] h-5 mb-1">
                {rightBars.map((h, i) => (
                  <div
                    key={i}
                    className="w-[2.5px] rounded-full bg-slate-200"
                    style={{ height: `${h * 0.8}px` }}
                  />
                ))}
              </div>
              <div className="text-[11px] font-medium text-slate-400">{subStats.val2}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-[3px] h-5 mb-1.5">
              {[...leftBars, ...rightBars].slice(0, 14).map((h, i) => (
                <div
                  key={i}
                  className={`w-[2.5px] rounded-full ${i < 8 ? accentColors[accent].bar : 'bg-slate-200'}`}
                  style={{ height: `${h * 0.8}px` }}
                />
              ))}
            </div>
            <p className="text-[11px] font-medium text-slate-500 truncate">{detail}</p>
          </>
        )}
      </div>
    </div>
  )
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        size={16}
      />
      <input className="input pl-10" type="search" {...props} />
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span>
        {label}
        {required && (
          <span className="ml-1 text-[var(--state-coral)]" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint && !error && (
        <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--state-coral)]">
          <AlertCircle size={13} />
          {error}
        </span>
      )}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handle)
    panelRef.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus()
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])
  if (!open) return null
  const widths = {
    sm: 'max-w-lg',
    md: 'max-w-2xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[3px] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal-panel floating-surface max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl ${widths[size]}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 id="modal-title" className="font-display text-xl font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--portal-accent)]"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
      <span className="rounded-xl border border-[#DCE4E4] bg-white p-3 text-slate-400">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function RuleError({ error }: { error: unknown }) {
  if (!error) return null
  const isRule = error instanceof ClinicRuleError
  return (
    <div
      className="rule-error rounded-xl border border-[#E8C2CA] bg-[#FBEAEE] p-4"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-[#C4425A]" size={18} />
        <div>
          <p className="font-bold text-[#962C41]">Operation rejected</p>
          <p className="mt-1 text-sm leading-5 text-[#962C41]">
            {error instanceof Error ? error.message : 'The operation could not be completed.'}
          </p>
          {isRule && (
            <code className="mt-2 inline-block rounded-md bg-white/70 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#962C41]">
              {error.code}
            </code>
          )}
        </div>
      </div>
    </div>
  )
}

export function LoadingBlock({ label = 'Loading records' }: { label?: string }) {
  return (
    <div
      className="mx-auto flex min-h-48 w-full max-w-xl flex-col justify-center gap-3 px-6"
      role="status"
      aria-label={label}
    >
      <span className="skeleton-line h-4 w-36" />
      <span className="skeleton-line h-12 w-full" />
      <span className="skeleton-line h-12 w-full" />
      <span className="sr-only">{label}…</span>
    </div>
  )
}

export function InfoNote({
  title,
  children,
  tone = 'info',
}: {
  title: string
  children: ReactNode
  tone?: 'info' | 'success'
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'success'
          ? 'border-[#BFD9D2] bg-[#E7F5EE] text-[#176B4A]'
          : 'border-[#C6D9EA] bg-[#EAF4FB] text-[#245B87]'
      }`}
    >
      <div className="flex gap-3">
        {tone === 'success' ? (
          <Check className="mt-0.5 shrink-0" size={17} />
        ) : (
          <Info className="mt-0.5 shrink-0" size={17} />
        )}
        <div>
          <p className="text-sm font-bold">{title}</p>
          <div className="mt-1 text-xs leading-5 opacity-85">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function DetailLink({
  children,
  onClick,
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded text-xs font-semibold text-clinic-700 hover:text-clinic-900 focus:outline-none focus:ring-2 focus:ring-clinic-500"
    >
      {children}
      <ChevronRight size={14} />
    </button>
  )
}
