// Application shell: Entra ID identity + RBAC role switcher, the Event Hubs feed
// control, and navigation gated by the current role's permissions.
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  ClipboardList,
  FileSearch,
  Newspaper,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  ScanSearch,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { PRINCIPALS, ROLES, can, type Role } from '../lib/rbac'

interface NavItem {
  to: string
  label: string
  icon: typeof Activity
  zone: string
}

const NAV: NavItem[] = [
  { to: '/screening', label: 'Screening Monitor', icon: Radio, zone: 'AI Detection' },
  { to: '/media', label: 'Adverse Media', icon: Newspaper, zone: 'AI Detection' },
  { to: '/alerts', label: 'Alert Queue', icon: Bell, zone: 'Orchestration' },
  { to: '/analyst', label: 'Analyst Dashboard', icon: Activity, zone: 'Human Oversight' },
  { to: '/cases', label: 'Case Investigation', icon: FileSearch, zone: 'Human Oversight' },
  { to: '/edd', label: 'EDD Reports', icon: ScanSearch, zone: 'Human Oversight' },
  { to: '/kyc', label: 'KYC Reporting', icon: ClipboardList, zone: 'Governance' },
  { to: '/executive', label: 'Executive Dashboard', icon: BarChart3, zone: 'Governance' },
  { to: '/audit', label: 'Immutable Audit', icon: BadgeCheck, zone: 'Governance' },
]

export default function Layout() {
  const role = useStore((s) => s.role)
  const setRole = useStore((s) => s.setRole)
  const ingest = useStore((s) => s.ingest)
  const alerts = useStore((s) => s.alerts)
  const principal = PRINCIPALS[role]
  const location = useLocation()
  const navigate = useNavigate()

  const [running, setRunning] = useState(true)
  const timer = useRef<number | null>(null)

  // The simulated Kafka / Azure Event Hubs feed: emit a transaction every ~1.5s.
  useEffect(() => {
    if (running) {
      timer.current = window.setInterval(() => ingest(), 1500)
      return () => {
        if (timer.current) window.clearInterval(timer.current)
      }
    }
  }, [running, ingest])

  // If the current role loses access to the open route, send it somewhere allowed.
  useEffect(() => {
    if (!can(role, location.pathname)) {
      const first = ROLES.find((r) => r.role === role)?.permissions[0] ?? '/audit'
      navigate(first)
    }
  }, [role, location.pathname, navigate])

  const mediaHits = useStore((s) => s.mediaHits)
  const kycReports = useStore((s) => s.kycReports)
  const eddReports = useStore((s) => s.eddReports)
  const openAlerts = alerts.filter((a) => a.status === 'triaged' || a.status === 'in_review').length
  const newMediaHits = mediaHits.filter((h) => h.status === 'new').length
  const pendingKyc = kycReports.filter((r) => r.status !== 'submitted').length
  const pendingEdd = eddReports.filter((r) => r.status === 'draft').length

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <ShieldCheck className="text-sky-400" size={22} />
          <div>
            <div className="text-sm font-bold leading-tight text-slate-100">Compliance</div>
            <div className="text-xs text-slate-400">Command Center</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const allowed = can(role, item.to)
            if (!allowed) return null
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/30'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`
                }
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
                {item.to === '/alerts' && openAlerts > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-1.5 text-xs text-rose-300">
                    {openAlerts}
                  </span>
                )}
                {item.to === '/media' && newMediaHits > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-1.5 text-xs text-rose-300">
                    {newMediaHits}
                  </span>
                )}
                {item.to === '/edd' && pendingEdd > 0 && (
                  <span className="rounded-full bg-sky-500/20 px-1.5 text-xs text-sky-300">
                    {pendingEdd}
                  </span>
                )}
                {item.to === '/kyc' && pendingKyc > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-300">
                    {pendingKyc}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-slate-800 p-3 text-xs text-slate-500">
          <div className="mb-1 font-semibold text-slate-400">Entra ID · RBAC</div>
          Signed in as <span className="text-slate-300">{principal.name}</span>
          <div className="text-slate-600">{principal.email}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRunning((r) => !r)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                running ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
              {running ? 'Feed live' : 'Feed paused'}
            </button>
            <button
              onClick={() => ingest()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              + Ingest one
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">View as role:</span>
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setRole(r.role as Role)}
                title={r.description}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  role === r.role
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
