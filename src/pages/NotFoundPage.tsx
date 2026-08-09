import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'

export default function NotFoundPage() {
  return <div className="flex min-h-[65vh] items-center justify-center"><div className="max-w-md text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-clinic-50 text-clinic-700"><Compass size={24} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-clinic-600">404 · Page not found</p><h1 className="mt-2 font-display text-4xl font-semibold text-slate-900">This workspace isn’t here.</h1><p className="mt-3 text-sm leading-6 text-slate-500">The address may be outdated, or this page may not be available for your current role.</p><Link to="/" className="mt-6 inline-block"><Button><ArrowLeft size={16} />Return to overview</Button></Link></div></div>
}
