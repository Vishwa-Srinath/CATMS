import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'

export function ToastRegion() {
  const { toasts, dismissToast } = useClinic()
  return <div aria-live="polite" aria-atomic="true" className="fixed right-4 top-20 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
    {toasts.map((toast) => {
      const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
      return <div key={toast.id} className={`floating-surface rounded-[14px] border bg-white p-4 ${toast.type === 'error' ? 'border-[#E8C2CA]' : 'border-[#DCE4E4]'}`}>
        <div className="flex gap-3"><Icon size={19} className={`mt-0.5 shrink-0 ${toast.type === 'success' ? 'text-[#1E8A5F]' : toast.type === 'error' ? 'text-[#C4425A]' : 'text-[#1E77B8]'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{toast.title}</p><p className="mt-0.5 text-xs leading-5 text-slate-600">{toast.message}</p>{toast.code && <code className="mt-2 inline-block text-[10px] font-medium text-[#C4425A]">{toast.code}</code>}</div><button onClick={() => dismissToast(toast.id)} className="self-start rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss notification"><X size={15} /></button></div>
      </div>
    })}
  </div>
}
