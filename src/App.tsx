import { useEffect, useState } from 'react'
import { useStore } from './store'
import { PlayerLibraryPage, MyBookingsPage } from './pages/PlayerPages'
import { WaitlistCenterPage } from './pages/PlayerDisruptionPages'
import { ScheduleDeskPage } from './pages/SchedulePages'
import { SessionsPage } from './pages/SessionsPage'
import { TicketCenterPage } from './pages/TicketPages'
import { DashboardPage } from './pages/DashboardPage'
import { LedgerPage } from './pages/LedgerPage'
import { ReviewPage } from './pages/ReviewPage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { DisruptionCenterPage } from './pages/DisruptionPages'
import { Badge, Modal } from './ui'

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
    { key: 'waitlist', label: '候补与我的权益' },
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
    { key: 'disruption', label: '异常改期中心' },
    { key: 'schedule', label: '排班成局台' },
    { key: 'sessions', label: '场次推进' },
    { key: 'tickets', label: '工单审批' },
    { key: 'review', label: '复盘与反馈' },
    { key: 'recommend', label: '推荐与排期调权' },
    { key: 'ledger', label: '收退款' },
  ],
  service: [
    { key: 'disruption', label: '异常改期跟踪' },
    { key: 'tickets', label: '客服工单串联' },
    { key: 'sessions', label: '场次档案' },
  ],
}

function NotificationBell({ goDisruption }: { goDisruption: () => void }) {
  const notifications = useStore((s) => s.notifications)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length
  return (
    <>
      <button className="btn ghost sm" style={{ position: 'relative' }} onClick={() => { setOpen(true); markAll() }}>
        🔔 通知{unread > 0 && <span style={{ color: 'var(--red)', fontWeight: 800, marginLeft: 4 }}>{unread}</span>}
      </button>
      {open && (
        <Modal title="🔔 站内通知（玩家确认 / 失败原因 / 人工介入）" onClose={() => setOpen(false)}>
          {notifications.length === 0 && <div className="empty">暂无通知。异常改期的方案下发、倒计时超时、回滚失败原因都会实时推送到这里。</div>}
          <div className="stack">
            {notifications.slice(0, 30).map((n) => (
              <div key={n.id} className="notice" style={{ fontSize: 13 }}>
                <div className="spread">
                  <b>{n.title}</b>
                  <Badge tone={n.audience === 'player' ? 'purple' : n.audience === 'manager' ? 'red' : 'blue'}>
                    {n.audience === 'player' ? '玩家' : n.audience === 'manager' ? '店长' : '全员'}
                  </Badge>
                </div>
                <div className="small muted">{n.body}</div>
                <div className="small muted mono">{n.at.slice(5, 19).replace('T', ' ')}</div>
              </div>
            ))}
          </div>
          <div className="modal-foot">
            <button className="btn primary" onClick={() => { setOpen(false); goDisruption() }}>前往异常改期中心</button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default function App() {
  const role = useStore((s) => s.currentRole) as Role
  const setRole = useStore((s) => s.setRole)
  const resetDemo = useStore((s) => s.resetDemo)
  const [tab, setTab] = useState('dashboard')
  const [focusSession, setFocusSession] = useState<string | undefined>()

  const nav = NAV[role]
  const active = nav.some((n) => n.key === tab) ? tab : nav[0].key

  const goDisruption = () => setTab('disruption')
  const goSession = (id: string) => {
    setTab('sessions')
    setFocusSession(id)
  }

  // 玩家预约成功后跳转「我的拼场」；店长看板跳转异常中心
  useEffect(() => {
    const mine = () => setTab('my')
    const disruption = () => setTab('disruption')
    window.addEventListener('nav:my-bookings', mine)
    window.addEventListener('nav:disruption', disruption)
    return () => {
      window.removeEventListener('nav:my-bookings', mine)
      window.removeEventListener('nav:disruption', disruption)
    }
  }, [])

  return (
    <div>
      <header className="app-header">
        <div className="logo">
          🎭 入局 MYSTERY·STUDIO
          <small>城市剧本杀 · 开场前异常改期 / 候补递补 / 多店资源原子锁定</small>
        </div>
        <div className="header-spacer" />
        <NotificationBell goDisruption={goDisruption} />
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
        {active === 'waitlist' && <WaitlistCenterPage />}
        {active === 'schedule' && <ScheduleDeskPage />}
        {active === 'sessions' && <SessionsPage focusId={focusSession} onConsumedFocus={() => setFocusSession(undefined)} />}
        {active === 'tickets' && <TicketCenterPage onOpenSession={goSession} />}
        {active === 'dashboard' && <DashboardPage onOpenSession={goSession} />}
        {active === 'disruption' && <DisruptionCenterPage />}
        {active === 'ledger' && <LedgerPage />}
        {active === 'review' && <ReviewPage role={role} />}
        {active === 'recommend' && <RecommendationsPage />}
      </main>
    </div>
  )
}
