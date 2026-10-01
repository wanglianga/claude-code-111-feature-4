import { useStore, sessionPlayers, sessionRisk, repurchaseRanking, waitlistRanking } from '../store'
import { Badge, SessionBadge, Stars } from '../ui'

export function DashboardPage({ onOpenSession, onOpenDisruption }: { onOpenSession: (id: string) => void; onOpenDisruption?: (id: string) => void }) {
  const st = useStore()
  const active = st.sessions.filter((s) => !['已解散', '已复盘'].includes(s.status))
  const todaySs = active.filter((s) => s.date === '2026-10-01')
  const forming = todaySs.filter((s) => !sessionRisk(s).formed && s.status !== '待补位')
  const noHost = todaySs.filter((s) => !s.hostId && s.status !== '待补位')
  const unpaidSs = todaySs.filter((s) => sessionPlayers(s.id).some((p) => !p.paid))
  const riskSs = todaySs.filter((s) => sessionRisk(s).refundAtRisk > 0 || sessionRisk(s).openTickets.length > 0)
  const activeDisruptions = st.disruptions.filter((d) =>
    !['已改期', '已退款关闭', '已取消处置'].includes(d.status) &&
    st.sessions.find((x) => x.id === d.sessionId)?.date === '2026-10-01')
  const pendingLocks = st.locks.filter((l) => l.status === '锁定失败' || l.status === '已回滚').slice(0, 6)
  const todayWait = waitlistRanking('st1').filter((w) => w.date === '2026-10-01')

  const todayRevenue = st.ledger
    .filter((l) => l.sessionId && st.sessions.find((x) => x.id === l.sessionId)?.date === '2026-09-23')
    .reduce((n, l) => n + l.amount, 0)
  const refundExposure = todaySs.reduce((n, s) => n + sessionRisk(s).refundAtRisk, 0)

  // 房间占用
  const rooms = st.rooms.map((r) => ({
    room: r,
    sessions: todaySs.filter((s) => s.roomId === r.id),
  }))

  const members = repurchaseRanking()

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>📊 店长看板 · 2026-10-01</div>
      <div className="muted small" style={{ marginBottom: 10 }}>一屏掌握：人数是否成局、主持是否熟练、房间是否空闲、玩家是否已支付、退款风险敞口、开场前异常处置与候补递补。</div>

      <div className="grid cols-4">
        <div className="stat"><div className="v">{todaySs.length}</div><div className="l">当日场次</div><div className="sub muted">{forming.length} 场人数未成局 · {todaySs.filter((s) => s.status === '待补位').length} 场待补位</div></div>
        <div className="stat"><div className="v" style={{ color: activeDisruptions.length ? 'var(--red)' : 'var(--green)' }}>{activeDisruptions.length}</div><div className="l">异常处置中</div><div className="sub muted">{activeDisruptions.filter((d) => ['待玩家确认', '部分已确认', '待执行迁移'].includes(d.status)).length} 单待玩家确认/执行</div></div>
        <div className="stat"><div className="v" style={{ color: todayWait.some((w) => w.status === '已通知') ? 'var(--amber)' : 'var(--green)' }}>{todayWait.filter((w) => w.status === '已通知').length}</div><div className="l">候补通知倒计时中</div><div className="sub muted">队列共 {todayWait.length} 人</div></div>
        <div className="stat"><div className="v amt-neg">¥{refundExposure}</div><div className="l">退款风险敞口（已付可能退）</div><div className="sub" style={{ color: 'var(--green)' }}>当日流水净额 ¥{todayRevenue}</div></div>
      </div>

      {activeDisruptions.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderColor: '#7a3747' }}>
          <div className="card-title-row"><h3 style={{ margin: 0 }}>🚨 开场前异常 · 需人工介入（点击进入处置）</h3></div>
          <div className="stack" style={{ gap: 6 }}>
            {activeDisruptions.map((d) => {
              const ss = st.sessions.find((x) => x.id === d.sessionId)!
              const script = st.scripts.find((x) => x.id === ss.scriptId)!
              const plan = d.plans.find((p) => p.id === d.publishedPlanId)
              return (
                <div key={d.id} className="notice warn clickable" style={{ cursor: 'pointer' }} onClick={() => onOpenDisruption?.(d.id)}>
                  <div className="spread">
                    <div className="row">
                      <Badge tone="red">{d.type}</Badge>
                      <b>《{script.name}》{ss.startKey}</b>
                      <Badge tone="amber">{d.status}</Badge>
                      {plan && <Badge tone="blue">{plan.kind} · {plan.status}</Badge>}
                    </div>
                    <span className="small muted mono">{d.id}</span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>{d.reason}</div>
                  {d.manualAlerts.length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{d.manualAlerts.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {pendingLocks.length > 0 && (
        <div className="notice warn" style={{ marginTop: 10, fontSize: 12.5 }}>
          🔒 最近有 {st.locks.filter((l) => l.status === '锁定失败' || l.status === '已回滚').length} 次资源锁定失败/回滚（并发抢占被系统整体回滚，未产生超卖或重复退款），请到异常处置中心重发方案。
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-title-row"><h3 style={{ margin: 0 }}>⚠ 风险场次（点击进入处理）</h3></div>
          {riskSs.length === 0 && <div className="empty" style={{ padding: 18 }}>今日无风险场次。</div>}
          <div className="stack">
            {riskSs.map((ss) => {
              const r = sessionRisk(ss)
              const script = st.scripts.find((x) => x.id === ss.scriptId)!
              const host = st.hosts.find((h) => h.id === ss.hostId)
              return (
                <div key={ss.id} className="notice warn clickable" style={{ cursor: 'pointer' }} onClick={() => onOpenSession(ss.id)}>
                  <div className="spread">
                    <b>《{script.name}》{ss.startKey}</b>
                    <SessionBadge s={ss.status} />
                  </div>
                  <div className="tag-row" style={{ marginTop: 4 }}>
                    {!r.formed && <Badge tone="red">人数未成局 {r.total}/{script.minPlayers}</Badge>}
                    {!r.hostReady && <Badge tone="red">主持空缺</Badge>}
                    {r.hostReady && (host?.proficiency[ss.scriptId] ?? 0) < 3 && <Badge tone="amber">主持不熟练 {(host?.proficiency[ss.scriptId] ?? 0)}/5</Badge>}
                    {r.paidCount < r.total && <Badge tone="amber">未支付 {r.total - r.paidCount} 人</Badge>}
                    {r.openTickets.length > 0 && <Badge tone="red">{r.openTickets.length} 张未结工单</Badge>}
                    {r.refundAtRisk > 0 && <Badge tone="red">敞口 ¥{r.refundAtRisk}</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title-row"><h3 style={{ margin: 0 }}>🚪 房间占用 & 主持档期</h3></div>
          <div className="stack" style={{ gap: 6 }}>
            {rooms.map(({ room, sessions }) => (
              <div key={room.id} className="spread small">
                <span>{room.name} <span className="muted">({room.capacity}人{room.horrorSet ? '·恐怖实景' : ''})</span></span>
                <span>{sessions.length === 0 ? <Badge tone="green">空闲</Badge>
                  : sessions.map((s) => <Badge key={s.id} tone="blue">{s.startKey} {st.scripts.find((x) => x.id === s.scriptId)?.name}</Badge>)}</span>
              </div>
            ))}
          </div>
          <hr className="hr-soft" />
          <div className="strong small" style={{ marginBottom: 6 }}>主持战力（均分 / 场次 / 可派本熟练度）</div>
          <div className="stack" style={{ gap: 6 }}>
            {st.hosts.map((h) => (
              <div key={h.id} className="small">
                <div className="spread"><b>{h.name}</b><span className="muted">{h.level} · <Stars n={h.reviewScore} size={12} /> {h.reviewScore}（{h.reviewCount} 场）</span></div>
                <div className="tag-row" style={{ marginTop: 2 }}>
                  {st.scripts.map((s) => {
                    const v = h.proficiency[s.id] ?? 0
                    return <Badge key={s.id} tone={v >= 4 ? 'green' : v >= 2 ? 'amber' : 'red'}>《{s.name.slice(0, 4)}》{v}/5</Badge>
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-title-row"><h3 style={{ margin: 0 }}>🔁 会员复购榜（拼场优先召回 & 生日局关怀）</h3></div>
          <table className="data">
            <thead><tr><th>会员</th><th>等级</th><th>到店次数</th><th>运营动作</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}<div className="small muted">{m.phone}</div></td>
                  <td><Badge tone="gold">{m.level}</Badge></td>
                  <td className="mono">{m.visits}</td>
                  <td className="small muted">{m.visits >= 10 ? '高复购：新本内测优先邀请' : m.visits >= 3 ? '稳定复购：拼场满员优先排位' : '新客：推新手友好本 + 第二次到店券'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title-row"><h3 style={{ margin: 0 }}>📈 剧本复盘动态（损耗 / 评分 / 难度 → 下轮排期）</h3></div>
          {st.scripts.map((s) => {
            const sss = st.sessions.filter((x) => x.scriptId === s.id)
            const rvs = st.reviews.filter((r) => st.sessions.find((x) => x.id === r.sessionId)?.scriptId === s.id)
            const avg = rvs.length ? rvs.reduce((n, r) => n + r.score, 0) / rvs.length : 0
            const tooHard = rvs.filter((r) => r.difficultyFeel === '偏难').length
            const damage = sss.some((x) => x.propIssues.some((p) => p.condition === '严重损耗' || p.condition === '丢失'))
            const skilledHosts = st.hosts.filter((h) => (h.proficiency[s.id] ?? 0) >= 4).length
            return (
              <div key={s.id} className="spread small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                <div><b>《{s.name}》</b>
                  <div className="muted small">已开 {sss.length} 场{avg > 0 && <> · 评分 <Stars n={avg} size={11} /> {avg.toFixed(1)}</>}{tooHard > 0 && ` · ${tooHard} 人觉得偏难`}</div>
                </div>
                <div className="tag-row">
                  <Badge tone={skilledHosts ? 'green' : 'amber'}>熟练主持 {skilledHosts} 人</Badge>
                  {damage && <Badge tone="red">道具损耗高·排期降权</Badge>}
                  {tooHard >= 2 && <Badge tone="amber">新手推荐降级</Badge>}
                  {!damage && tooHard < 2 && <Badge tone="green">排期正常/加场</Badge>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
