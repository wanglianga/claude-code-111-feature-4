import { useEffect, useState } from 'react'
import { useStore } from './store'
import { PlayerLibraryPage, MyBookingsPage } from './pages/PlayerPages'
import { ScheduleDeskPage } from './pages/SchedulePages'
import { SessionsPage } from './pages/SessionsPage'
import { TicketCenterPage } from './pages/TicketPages'
import { DashboardPage } from './pages/DashboardPage'
import { LedgerPage } from './pages/LedgerPage'
import { ReviewPage } from './pages/ReviewPage'
import { RecommendationsPage } from './pages/RecommendationsPage'

type Role = 'player' | 'frontdesk' | 'host' | 'manager' | 'service'

const ROLE_LABEL: Record<Role, string> = {
  player: '玩家',
  frontdesk: '前台',
  host: '主持人',
  manager: '店长',
  service: '客服',
}

const NAV: Record<Role, { key: string; label: string }[]> = {
  player: [
    { key: 'library', label: '剧本大厅' },
    { key: 'my', label: '我的拼场' },
  ],
  frontdesk: [
    { key: 'sessions', label: '场次推进（签到/分角/道具）' },
    { key: 'schedule', label: '排班成局台' },
    { key: 'tickets', label: '异常工单' },
    { key: 'ledger', label: '收退款' },
  ],
  host: [
    { key: 'sessions', label: '我的场次' },
    { key: 'review', label: '主持复盘' },
  ],
  manager: [
    { key: 'dashboard', label: '店长看板' },
    { key: 'schedule', label: '排班成局台' },
    { key: 'sessions', label: '场次推进' },
    { key: 'tickets', label: '工单审批' },
    { key: 'review', label: '复盘与反馈' },
    { key: 'recommend', label: '推荐与排期调权' },
    { key: 'ledger', label: '收退款' },
  ],
  service: [
    { key: 'tickets', label: '客服工单串联' },
    { key: 'sessions', label: '场次档案' },
  ],
}

export default function App() {
  const role = useStore((s) => s.currentRole) as Role
  const setRole = useStore((s) => s.setRole)
  const resetDemo = useStore((s) => s.resetDemo)
  const [tab, setTab] = useState('library')
  const [focusSession, setFocusSession] = useState<string | undefined>()

  const nav = NAV[role]
  const active = nav.some((n) => n.key === tab) ? tab : nav[0].key

  const goSession = (id: string) => {
    setTab('sessions')
    setFocusSession(id)
  }

  // 玩家预约成功后跳转「我的拼场」
  useEffect(() => {
    const handler = () => setTab('my')
    window.addEventListener('nav:my-bookings', handler)
    return () => window.removeEventListener('nav:my-bookings', handler)
  }, [])

  return (
    <div>
      <header className="app-header">
        <div className="logo">
          🎭 入局 MYSTERY·STUDIO
          <small>城市剧本杀 · 拼场预约与主持排班平台</small>
        </div>
        <div className="header-spacer" />
        <div className="role-switch">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <button key={r} className={r === role ? 'active' : ''} onClick={() => { setRole(r); setTab(NAV[r][0].key) }}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <button className="btn ghost sm" title="恢复内置演示数据" onClick={() => { if (confirm('确定重置为内置演示数据？')) { resetDemo(); setTab(NAV[role][0].key) } }}>
          ↺ 重置演示
        </button>
      </header>

      <nav className="app-nav">
        {nav.map((n) => (
          <button key={n.key} className={n.key === active ? 'active' : ''} onClick={() => setTab(n.key)}>
            {n.label}
          </button>
        ))}
      </nav>

      <main className="page">
        {active === 'library' && <PlayerLibraryPage />}
        {active === 'my' && <MyBookingsPage />}
        {active === 'schedule' && <ScheduleDeskPage />}
        {active === 'sessions' && <SessionsPage focusId={focusSession} onConsumedFocus={() => setFocusSession(undefined)} />}
        {active === 'tickets' && <TicketCenterPage onOpenSession={goSession} />}
        {active === 'dashboard' && <DashboardPage onOpenSession={goSession} />}
        {active === 'ledger' && <LedgerPage />}
        {active === 'review' && <ReviewPage role={role} />}
        {active === 'recommend' && <RecommendationsPage />}
      </main>
    </div>
  )
}
