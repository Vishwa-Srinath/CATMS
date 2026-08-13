import { AlertCircle, AlertTriangle, CalendarDays, Check, ChevronRight, Circle, Clock3, Info, Minus, Search, X, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ClinicRuleError } from '../lib/domain'

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  const variants = {
    primary: 'btn-primary disabled:bg-slate-300',
    secondary: 'btn-secondary border disabled:text-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
    danger: 'border border-[#E8C2CA] bg-[#FBEAEE] text-[#C4425A] hover:bg-[#F7DCE2] disabled:opacity-50',
  }
  return <button className={`inline-flex items-center justify-center gap-2 rounded font-semibold transition disabled:cursor-not-allowed ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-[13px]'} ${variants[variant]} ${className}`} {...props}>{children}</button>
}

const badgeStyles: Record<string, string> = {
  Scheduled: 'bg-[#EAF4FB] text-[#1E77B8] ring-[#1E77B8]/20', Pending: 'bg-[#EAF4FB] text-[#1E77B8] ring-[#1E77B8]/20',
  Completed: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/20', Paid: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/20', Approved: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/20', Active: 'bg-[#E7F5EE] text-[#1E8A5F] ring-[#1E8A5F]/20',
  PartiallyPaid: 'bg-[#FBF2E3] text-[#9B6819] ring-[#C0872A]/25', PartiallyApproved: 'bg-[#FBF2E3] text-[#9B6819] ring-[#C0872A]/25',
  Unpaid: 'bg-[#FBEAEE] text-[#C4425A] ring-[#C4425A]/20', Rejected: 'bg-[#FBEAEE] text-[#C4425A] ring-[#C4425A]/20',
  Cancelled: 'bg-[#EFF3F3] text-[#69777F] ring-[#8A97A0]/25', Inactive: 'bg-[#EFF3F3] text-[#69777F] ring-[#8A97A0]/25',
  'Walk-in': 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/20', Booked: 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/20',
}

const badgeIcons: Record<string, LucideIcon> = {
  Scheduled: Clock3, Pending: Clock3, Completed: Check, Paid: Check, Approved: Check, Active: Check,
  PartiallyPaid: Circle, PartiallyApproved: Circle, Unpaid: AlertTriangle, Rejected: AlertTriangle,
  Cancelled: Minus, Inactive: Minus, 'Walk-in': Zap, Booked: CalendarDays,
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = tone ?? String(children)
  const label = String(children).replace(/([a-z])([A-Z])/g, '$1 $2')
  const Icon = badgeIcons[key]
  return <span className={`status-badge inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[10px] font-medium ring-1 ring-inset ${badgeStyles[key] ?? 'bg-[#EFF3F3] text-[#4B5D66] ring-[#8A97A0]/20'}`}>{Icon && <Icon size={11} aria-hidden="true" />}{label}</span>
}

export function Avatar({ name, size = 'md', className = '' }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const letters = name.replace('Dr. ', '').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const sizes = { sm: 'h-8 w-8 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-sm' }
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#EFF3F3] font-semibold text-[#4B5D66] ring-1 ring-[#DCE4E4] ${sizes[size]} ${className}`}>{letters}</span>
}

export function PageHeader({ eyebrow, title, description, actions, image }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; image?: string }) {
  return <header className={`page-hero mb-7 overflow-hidden ${image ? 'page-hero-has-image' : ''}`}>
    <span className="page-hero-orbit" aria-hidden="true" />
    <div className="relative z-[1] flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
      <div className="page-hero-content">
        {eyebrow && <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.11em] text-[var(--portal-accent)]">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-semibold leading-tight text-slate-900 sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[14px] leading-6 text-slate-500">{description}</p>}
      </div>
      {(actions || image) && <div className="page-hero-end flex shrink-0 flex-col items-start gap-3 lg:items-end">
        {image && <span className="page-hero-photo" aria-hidden="true"><img src={image} alt="" loading="eager" /></span>}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>}
    </div>
  </header>
}

export function StatCard({ label, value, detail, icon: Icon, accent = 'teal' }: { label: string; value: ReactNode; detail: string; icon: LucideIcon; accent?: 'teal' | 'blue' | 'amber' | 'coral' }) {
  const colors = { teal: 'bg-[#E7F5EE] text-[#1E8A5F]', blue: 'bg-[#EAF4FB] text-[#1E77B8]', amber: 'bg-[#FBF2E3] text-[#C0872A]', coral: 'bg-[#FBEAEE] text-[#C4425A]' }
  return <div className={`metric-card metric-${accent}`}>
    <span className="metric-curve" aria-hidden="true" />
    <div className="relative z-[1] flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-slate-500">{label}</p><p className="mt-2 text-[26px] font-bold tracking-[-.035em] text-slate-900">{value}</p></div><span className={`rounded-2xl p-2.5 ${colors[accent]}`}><Icon size={19} aria-hidden="true" /></span></div>
    <p className="relative z-[1] mt-3 text-[11px] leading-5 text-slate-500">{detail}</p>
  </div>
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <div className={`relative ${className}`}><Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="input pl-10" type="search" {...props} /></div>
}

export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">
    <span>{label}{required && <span className="ml-1 text-coral" aria-hidden="true">*</span>}</span>
    <span className="mt-1.5 block">{children}</span>
    {hint && !error && <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    {error && <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600"><AlertCircle size={13} />{error}</span>}
  </label>
}

export function Modal({ open, onClose, title, description, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handle)
    panelRef.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus()
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])
  if (!open) return null
  const widths = { sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal-panel floating-surface max-h-[94vh] w-full overflow-y-auto rounded-t bg-white sm:rounded ${widths[size]}`}>
      <div className="modal-head sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
        <div><h2 id="modal-title" className="font-display text-xl font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">{description}</p>}</div>
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-clinic-500" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
      </div>
      <div className="px-5 py-6 sm:px-7">{children}</div>
    </div>
  </div>
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-60 flex-col items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
    <span className="rounded-xl border border-[#DCE4E4] bg-white p-3 text-slate-400"><Icon size={23} /></span><h3 className="mt-4 font-semibold text-slate-800">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}
  </div>
}

export function RuleError({ error }: { error: unknown }) {
  if (!error) return null
  const isRule = error instanceof ClinicRuleError
  return <div className="rule-error rounded-xl border border-[#E8C2CA] bg-[#FBEAEE] p-4" role="alert">
    <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#C4425A]" size={18} /><div><p className="font-bold text-[#962C41]">Operation rejected</p><p className="mt-1 text-sm leading-5 text-[#962C41]">{error instanceof Error ? error.message : 'The operation could not be completed.'}</p>{isRule && <code className="mt-2 inline-block rounded-md bg-white/60 px-2 py-1 text-[11px] font-medium text-[#962C41]">{error.code}</code>}</div></div>
  </div>
}

export function LoadingBlock({ label = 'Loading records' }: { label?: string }) {
  return <div className="mx-auto flex min-h-48 w-full max-w-xl flex-col justify-center gap-3 px-6" role="status" aria-label={label}><span className="skeleton-line h-4 w-36" /><span className="skeleton-line h-12 w-full" /><span className="skeleton-line h-12 w-full" /><span className="sr-only">{label}…</span></div>
}

export function InfoNote({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'success' }) {
  return <div className={`rounded-xl border p-4 ${tone === 'success' ? 'border-[#BFD9D2] bg-[#E7F5EE] text-[#176B4A]' : 'border-[#C6D9EA] bg-[#EAF4FB] text-[#245B87]'}`}><div className="flex gap-3">{tone === 'success' ? <Check className="mt-0.5 shrink-0" size={17} /> : <Info className="mt-0.5 shrink-0" size={17} />}<div><p className="text-sm font-bold">{title}</p><div className="mt-1 text-xs leading-5 opacity-80">{children}</div></div></div></div>
}

export function DetailLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded text-xs font-bold text-clinic-700 hover:text-clinic-900 focus:outline-none focus:ring-2 focus:ring-clinic-500">{children}<ChevronRight size={14} /></button>
}
