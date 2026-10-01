import { useMemo, useState } from 'react'
import { useStore, planGroupView, disruptionTimeline, waitlistRanking } from '../store'
import type {
  Disruption, DisruptionType, ReschedulePlan, PlanResponse, ResourceLock,
} from '../types'
import { Badge, Modal, useNow } from '../ui'
import { countdownText } from '../domain'

const ACTIVE_DSTAT = ['异常已触发', '方案计算中', '待玩家确认', '部分已确认', '待执行迁移']
const KIND_TONE: Record<ReschedulePlan['kind'], 'green' | 'blue' | 'red' | 'gold'> = {
  同日换场: 'green',
  跨店迁移: 'blue',
  全额退款: 'red',
  保留权益待补位: 'gold',
}
const RESP_TONE: Record<PlanResponse, 'amber' | 'green' | 'blue' | 'red' | 'gray'> = {
  待确认: 'amber',
  已接受: 'green',
  仅指定时段: 'blue',
  已拒绝: 'red',
  超时未响应: 'red',
}
const LEVEL_TONE = { info: 'blue', warn: 'amber', ok: 'green', error: 'red' } as const
const CAT_EMOJI: Record<string, string> = {
  异常触发: '🚨', 方案计算: '🧮', 玩家确认: '📨', 资源锁定: '🔒',
  退款补偿: '💴', 排班变更: '🛠', 候补递补: '🔁', 系统: '⚙️',
}

// ============ 发起异常 ============
function TriggerForm({ onCreated }: { onCreated: (id: string) => void }) {
  const st = useStore()
  const [sessionId, setSessionId] = useState('')
  const [type, setType] = useState<DisruptionType>('主持缺勤')
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const candidates = st.sessions.filter((s) =>
    ['待成局', '已成局', '已签到', '角色已分', '道具已发'].includes(s.status) &&
    !st.disruptions.some((d) => d.sessionId === s.id && ACTIVE_DSTAT.includes(d.status)))
  const submit = () => {
    if (!sessionId || !reason.trim()) return
    const r = st.triggerDisruption({ sessionId, type, reason: reason.trim(), detail, raisedBy: '店长-老K' })
    if (typeof r === 'string') { setReason(''); setDetail(''); onCreated(r) }
    else alert(r.error)
  }
  return (
    <div className="card">
      <div className="card-title-row"><h3 style={{ margin: 0 }}>🚨 发起开场前异常处置（不会简单取消场次）</h3></div>
      <div className="grid cols-2">
        <label className="field"><span>受影响场次</span>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">请选择…</option>
            {candidates.map((s) => {
              const sc = st.scripts.find((x) => x.id === s.scriptId)!
              const store = st.stores.find((x) => x.id === s.storeId)
              return <option key={s.id} value={s.id}>{store?.name} · 《{sc.name}》{s.startAt.replace('T', ' ')} · {s.id}</option>
            })}
          </select>
        </label>
        <label className="field"><span>异常类型</span>
          <div className="switch-pill">
            {(['主持缺勤', '场次延迟', '房间不可用'] as const).map((t) => (
              <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>
        </label>
      </div>
      <label className="field"><span>原因（必填，写入事件时间线与工单）</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：主持 17:40 来电高烧 39 度；消防检查房间暂停使用；上家场次严重延迟…" />
      </label>
      <label className="field"><span>补充说明（玩家结构、特殊诉求等）</span>
        <textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="例：6 人均预付，含两组同行不可拆散，1 人仅接受指定时段…" />
      </label>
      <button className="btn danger" disabled={!sessionId || !reason.trim()} onClick={submit}>冻结名额并发起处置（自动释放受影响资源）</button>
      <div className="small muted" style={{ marginTop: 6 }}>发起后：场次转为「待补位」并保留可售/候补状态；主持缺勤自动释放班次并登记请假，房间不可用自动登记故障时段；同步生成工单。</div>
    </div>
  )
}

// ============ 候选方案卡片 ============
function PlanCard({ d, plan, onPublish }: { d: Disruption; plan: ReschedulePlan; onPublish: () => void }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === d.sessionId)!
  const store = plan.storeId ? st.stores.find((x) => x.id === plan.storeId) : undefined
  const room = plan.roomId ? st.rooms.find((x) => x.id === plan.roomId) : undefined
  const host = plan.hostId ? st.hosts.find((x) => x.id === plan.hostId) : undefined
  const script = st.scripts.find((x) => x.id === ss.scriptId)!
  const groups = planGroupView(plan.id)
  const coverable = groups.filter((g) => g.move).reduce((n, g) => n + g.players.length, 0)
  return (
    <div className={`notice ${plan.conflicts.length ? 'warn' : 'ok'}`} style={{ fontSize: 13 }}>
      <div className="spread">
        <div className="row">
          <Badge tone={KIND_TONE[plan.kind]}>{plan.kind}</Badge>
          {plan.kind !== '全额退款' && plan.kind !== '保留权益待补位' && <b>{plan.startAt.replace('T', ' ')}</b>}
          {store && <Badge tone="purple">{store.name}</Badge>}
          {plan.sessionId && <span className="small muted mono">复用 {plan.sessionId}</span>}
        </div>
        <div className="row">
          {plan.kind === '同日换场' || plan.kind === '跨店迁移' ? <Badge tone={coverable === groups.reduce((n, g) => n + g.players.length, 0) ? 'green' : 'amber'}>预计随迁 {coverable} 人</Badge> : null}
          <Badge tone={plan.conflicts.length ? 'red' : 'green'}>{plan.conflicts.length ? `⚠ ${plan.conflicts.length} 项冲突` : '✅ 资源可行'}</Badge>
        </div>
      </div>
      {(room || host) && (
        <div className="small" style={{ marginTop: 4 }}>
          {room && `房间：${room.name}（${room.capacity}人）`} {host && `· 主持：${host.name}（熟练度 ${host.proficiency[script.id] ?? 0}/5）`}
        </div>
      )}
      <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>
        {plan.reasons.map((r, i) => <li key={i} style={{ color: 'var(--green)' }}>{r}</li>)}
        {plan.conflicts.map((r, i) => <li key={`c${i}`} style={{ color: '#ffc4c4' }}>⚠ {r}</li>)}
      </ul>
      {Object.keys(plan.roleAssign).length > 0 && (
        <div className="small muted" style={{ marginTop: 4 }}>
          角色预分配：{Object.entries(plan.roleAssign).slice(0, 6).map(([pid, role]) => {
            const p = st.bookings.flatMap((b) => b.players).find((x) => x.id === pid)
            return `${p?.name ?? pid}→${role}`
          }).join('；')}
        </div>
      )}
      {plan.status === '候选' && <button className="btn primary sm" style={{ marginTop: 6 }} onClick={onPublish}>📨 发布给玩家确认</button>}
    </div>
  )
}

// ============ 玩家确认面板 ============
function ResponsesPanel({ d }: { d: Disruption }) {
  const st = useStore()
  const nowMs = useNow()
  const plan = d.plans.find((p) => p.id === d.publishedPlanId)
  if (!plan) return null
  const groups = planGroupView(plan.id)
  const cd = plan.confirmDeadline ? countdownText(plan.confirmDeadline, nowMs) : null
  const allPlayers = groups.flatMap((g) => g.rows)
  const accepted = allPlayers.filter((r) => r.resp === '已接受').length
  const slotOnly = allPlayers.filter((r) => r.resp === '仅指定时段').length
  const rejected = allPlayers.filter((r) => r.resp === '已拒绝' || r.resp === '超时未响应').length
  const slots = st.scripts.find((x) => x.id === st.sessions.find((s) => s.id === d.sessionId)!.scriptId)!.startTime.split(' / ')
  const date = d.sessionId ? st.sessions.find((s) => s.id === d.sessionId)!.date : ''

  const setResp = (pid: string, resp: PlanResponse) => {
    if (resp === '仅指定时段') {
      const v = prompt('玩家仅接受的开场时间（多个用逗号分隔，可选：' + slots.join(' / ') + '）', slots.join(','))
      if (!v) return
      const pick = v.split(/[,，]/).map((x) => x.trim()).filter((x) => slots.includes(x)).map((x) => `${date}T${x}`)
      st.respondPlan(plan.id, pid, '仅指定时段', pick)
    } else st.respondPlan(plan.id, pid, resp)
  }

  return (
    <div className="card">
      <div className="spread">
        <div className="row">
          <h3 style={{ margin: 0 }}>📨 玩家确认（方案：{plan.kind} {plan.startAt.replace('T', ' ')}）</h3>
          <Badge tone={KIND_TONE[plan.kind]}>{plan.status}</Badge>
        </div>
        {cd && plan.status === '已发布' && <Badge tone={cd.overdue ? 'red' : 'amber'}>确认倒计时 {cd.text}</Badge>}
      </div>
      <div className="tag-row" style={{ margin: '8px 0' }}>
        <Badge tone="green">已接受 {accepted}</Badge>
        <Badge tone="blue">仅指定时段 {slotOnly}</Badge>
        <Badge tone="red">拒绝/超时 {rejected}</Badge>
        <Badge tone="amber">待确认 {allPlayers.length - accepted - slotOnly - rejected}</Badge>
      </div>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>同行组</th><th>玩家</th><th>会员/性别</th><th>可接受时段</th><th>确认状态</th><th>整组可迁移</th><th>店长代回复（电话确认）</th></tr></thead>
          <tbody>
            {groups.map((g) => g.rows.map((r, i) => (
              <tr key={r.player.id}>
                {i === 0 ? <td rowSpan={g.rows.length}><b>{g.contact}</b><div className="small muted">{g.rows.length} 人同行</div><Badge tone={g.move ? 'green' : 'amber'}>{g.move ? '整组可迁移' : '不可拆组迁移'}</Badge></td> : null}
                <td>{r.player.name}</td>
                <td className="small">{st.members.find((m) => m.id === r.player.memberId)?.level ?? '普通'} · {r.player.gender}{r.player.acceptCrossGender ? '' : ' · 不反串'}</td>
                <td className="small mono">{r.player.acceptableSlots.length ? r.player.acceptableSlots.map((x) => x.slice(11)).join('/') : '听从安排'}</td>
                <td><Badge tone={RESP_TONE[r.resp] as any}>{r.resp}</Badge></td>
                <td>{i === 0 ? (g.move ? '✅' : '⏸') : ''}</td>
                <td>
                  <select style={{ width: 150 }} value={r.resp} onChange={(e) => setResp(r.player.id, e.target.value as PlanResponse)}
                    disabled={plan.status !== '已发布'}>
                    {['待确认', '已接受', '仅指定时段', '已拒绝'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ margin: 0, width: 300 }}><span>拒绝 / 超时未响应玩家的处理策略（执行时生效）</span>
          <div className="switch-pill">
            <button className={plan.rejectPolicy === '全额退款' ? 'active' : ''} onClick={() => st.setRejectPolicy(d.id, '全额退款')}>全额退款</button>
            <button className={plan.rejectPolicy === '保留权益待补位' ? 'active' : ''} onClick={() => st.setRejectPolicy(d.id, '保留权益待补位')}>保留权益待补位</button>
          </div>
        </label>
      </div>
    </div>
  )
}

// ============ 执行区（含并发抢占模拟与回滚展示） ============
function ExecutionPanel({ d, onMsg }: { d: Disruption; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const st = useStore()
  const plan = d.plans.find((p) => p.id === d.publishedPlanId)
  const [inject, setInject] = useState<ResourceLock['kind'] | ''>('')
  if (!plan) return null
  const locks = st.locks.filter((l) => l.planId === plan.id)
  const executed = ['已确认执行', '已执行'].includes(plan.status)
  return (
    <div className="card">
      <div className="spread">
        <h3 style={{ margin: 0 }}>🔒 一次性锁定与迁移（四类资源同事务，任一失效整体回滚）</h3>
        <Badge tone={plan.status === '执行失败已回滚' ? 'red' : executed ? 'green' : 'amber'}>{plan.status}</Badge>
      </div>
      <div className="small muted" style={{ margin: '6px 0' }}>
        确认时依次校验并锁定：① 原场次名额 ② 目标房间 ③ 主持人班次 ④ 剧本库存，随后再做容量与角色人数/性别约束终检；任一资源在并发确认中失效，全部回滚，原场次保留「待补位」，玩家权益不扣减。
      </div>
      {plan.status === '已发布' && (
        <div className="row">
          <label className="field" style={{ margin: 0, width: 320 }}><span>并发模拟（验证多店同时抢占不超卖）</span>
            <select value={inject} onChange={(e) => setInject(e.target.value as ResourceLock['kind'] | '')}>
              <option value="">不注入（正常确认）</option>
              <option value="原场次名额">模拟原场次名额已被另一处置单抢占</option>
              <option value="目标房间">模拟目标房间被其他门店抢先锁定</option>
              <option value="主持人班次">模拟主持人班次被其他场次抢走</option>
              <option value="剧本库存">模拟盒装本库存被并发开新场耗尽</option>
            </select>
          </label>
          <button className="btn primary" onClick={() => {
            const r = st.confirmMigration(d.id, '店长-老K', inject || undefined)
            onMsg(r.ok ? { ok: true, text: `迁移已提交：${r.newSessionId || '见处置结果'}，资源锁已提交，可在下方台账查看。` } : { ok: false, text: `整体回滚：${r.errors.join('；')}` })
          }}>✅ 确认迁移（原子事务）</button>
          <button className="btn danger sm" onClick={() => {
            const reason = prompt('作废该方案的原因：', '玩家接受度不足，重算其他时段')
            if (reason) st.voidPlan(d.id, plan.id, '店长-老K', reason)
          }}>作废方案</button>
        </div>
      )}
      {plan.executionNote && <div className={`notice ${plan.status === '执行失败已回滚' ? 'warn' : 'ok'}`} style={{ marginTop: 10, fontSize: 13 }}>{plan.executionNote}</div>}
      {locks.length > 0 && (
        <div className="scroll-x" style={{ marginTop: 10 }}>
          <table className="data">
            <thead><tr><th>资源锁</th><th>对象</th><th>时段</th><th>状态</th><th>说明</th></tr></thead>
            <tbody>
              {locks.map((l) => {
                const tone = l.status === '已提交' ? 'green' : l.status === '已锁定' ? 'blue' : l.status === '已回滚' ? 'amber' : 'red'
                return (
                  <tr key={l.id}>
                    <td>{l.kind}</td>
                    <td className="small">
                      {l.kind === '目标房间' ? st.rooms.find((r) => r.id === l.refId)?.name
                        : l.kind === '主持人班次' ? st.hosts.find((h) => h.id === l.refId)?.name
                          : l.kind === '剧本库存' ? `盒装本 ${l.refId}`
                            : st.sessions.find((s) => s.id === l.refId)?.id ?? l.refId}
                    </td>
                    <td className="small mono">{l.startAt.replace('T', ' ')}</td>
                    <td><Badge tone={tone as any}>{l.status}</Badge></td>
                    <td className="small muted">{l.detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============ 候补队列面板 ============
function WaitlistPanel({ d, onMsg }: { d: Disruption; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const st = useStore()
  const nowMs = useNow()
  const ss = st.sessions.find((x) => x.id === d.sessionId)!
  const ranking = waitlistRanking(ss.storeId, ss.scriptId, ss.date)
  const targets = st.sessions.filter((x) =>
    x.storeId === ss.storeId && x.scriptId === ss.scriptId && x.date === ss.date &&
    ['待成局', '已成局'].includes(x.status) && !x.disruptionId)
  const [targetMap, setTargetMap] = useState<Record<string, string>>({})

  return (
    <div className="card">
      <div className="card-title-row"><h3 style={{ margin: 0 }}>🔁 候补递补（公开优先级规则）</h3></div>
      <div className="notice info" style={{ fontSize: 12, marginBottom: 10 }}>
        计分规则（玩家端同步可见）：会员等级 金卡 40 / 银卡 25；同意自动补位 +20、仅指定时段 +5；报名先后每分钟 +0.1（封顶 20）；
        历史履约=到店次数（封顶 10）；同行成组 +5；店长手工置顶须填原因，且置顶只改通知顺序，<b>容量与角色人数/性别约束永远由系统强制校验</b>。
      </div>
      {ranking.length === 0 && <div className="empty">该剧本当日暂无候补。</div>}
      <div className="stack" style={{ gap: 8 }}>
        {ranking.map((w, i) => (
          <div key={w.id} className="notice" style={{ fontSize: 12.5 }}>
            <div className="spread">
              <div className="row">
                <b>#{i + 1} {w.playerName}{w.groupSize > 1 ? ` 等 ${w.groupSize} 人` : ''}</b>
                {w.memberId && <Badge tone="gold">{st.members.find((m) => m.id === w.memberId)?.level}</Badge>}
                <Badge tone={w.mode === '自动补位' ? 'green' : 'blue'}>{w.mode}</Badge>
                {w.manualPin && <Badge tone="red">📌 手工置顶：{w.manualPin.reason}</Badge>}
                <Badge tone={w.status === '已补位' ? 'green' : w.status === '已通知' ? 'amber' : w.status === '超时未响应' ? 'red' : undefined}>{w.status}</Badge>
              </div>
              <div className="row">
                <span className="price">优先级 {w.score}</span>
                <span className="small muted">排队于 {w.createdAt.slice(11, 16)}</span>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {w.acceptableSlots.length ? `仅接受：${w.acceptableSlots.map((x) => x.slice(11)).join('/')}　` : '任意时段　'}
              分值分解：{w.scoreParts.map((p) => `${p.label}+${p.value}`).join('，')}
            </div>
            {w.status === '已通知' && w.respondDeadline && (
              <div className="small" style={{ marginTop: 4 }}>
                <Badge tone={countdownText(w.respondDeadline, nowMs).overdue ? 'red' : 'amber'}>
                  补位响应倒计时 {countdownText(w.respondDeadline, nowMs).text}
                </Badge>
                <span className="muted">（目标场次 {w.offeredSessionId}）</span>
                <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => st.respondWaitlist(w.id, true)}>代确认接受补位</button>
                <button className="btn sm danger" onClick={() => st.respondWaitlist(w.id, false)}>玩家放弃</button>
              </div>
            )}
            {w.status === '排队中' && (
              <div className="row" style={{ marginTop: 6 }}>
                <select style={{ width: 240 }} value={targetMap[w.id] ?? targets[0]?.id ?? ''} onChange={(e) => setTargetMap((m) => ({ ...m, [w.id]: e.target.value }))}>
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.startKey} 场 {t.id}（当前 {st.bookings.filter((b) => b.sessionId === t.id).reduce((n, b) => n + b.players.filter((p) => !p.quit).length, 0)} 人）</option>)}
                </select>
                <button className="btn primary sm" onClick={() => {
                  const r = st.notifyWaitlist(w.id, targetMap[w.id] ?? targets[0]?.id ?? '', '店长-老K')
                  if (r) onMsg({ ok: false, text: r.error })
                  else onMsg({ ok: true, text: `已按顺位通知「${w.playerName}」，15 分钟倒计时开始。` })
                }}>按顺位通知补位</button>
                <button className="btn sm gold" onClick={() => {
                  const reason = prompt('手工补位/置顶必须填写原因（容量与角色约束仍强制校验）：', '玩家已在门店等候，特批优先')
                  if (!reason) return
                  const r = st.manualFillWaitlist(w.id, targetMap[w.id] ?? targets[0]?.id ?? '', reason, '店长-老K')
                  if (r) onMsg({ ok: false, text: r.error })
                  else onMsg({ ok: true, text: `「${w.playerName}」手工补位成功（已记录原因）。` })
                }}>手工补位（填原因）</button>
                <button className="btn sm" onClick={() => {
                  const reason = prompt('手工置顶原因：', '到店等候')
                  if (reason) { st.pinWaitlist(w.id, reason, '店长-老K'); onMsg({ ok: true, text: '已置顶并留痕。' }) }
                }}>置顶（填原因）</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ 处置详情 ============
function DisruptionDetail({ d, onClose, onMsg }: { d: Disruption; onClose: () => void; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === d.sessionId)!
  const script = st.scripts.find((x) => x.id === ss.scriptId)!
  const store = st.stores.find((x) => x.id === ss.storeId)
  const live = st.disruptions.find((x) => x.id === d.id)!
  const candidates = live.plans.filter((p) => p.status === '候选')
  const historyPlans = live.plans.filter((p) => p.status !== '候选')
  const published = historyPlans.find((p) => p.id === live.publishedPlanId)
  const timeline = disruptionTimeline(d.id)
  const entitlements = st.entitlements.filter((e) => st.bookings.some((b) => b.sessionId === d.sessionId && b.players.some((p) => p.id === e.playerId)) || e.planId && live.plans.some((p) => p.id === e.planId))
  const resolved = ['已改期', '已退款关闭', '已取消处置'].includes(live.status)

  return (
    <Modal wide onClose={onClose} title={
      <div className="row">🚨 处置单 {d.id} <Badge tone="red">{live.type}</Badge><Badge tone={resolved ? 'green' : 'amber'}>{live.status}</Badge></div>
    }>
      <div className="notice" style={{ fontSize: 13 }}>
        <div className="spread">
          <b>《{script.name}》{ss.startAt.replace('T', ' ')} · {store?.name} · {ss.id}</b>
          <span className="small muted mono">{d.raisedAt.replace('T', ' ')} · {d.raisedBy}</span>
        </div>
        <div className="small" style={{ marginTop: 4 }}><b>原因：</b>{d.reason}</div>
        <div className="small muted">{d.detail}</div>
      </div>

      {live.manualAlerts.length > 0 && (
        <div className="notice warn" style={{ marginTop: 10, fontSize: 12.5 }}>
          <b>需人工介入事项：</b>
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{live.manualAlerts.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <div className="section-title">🧮 可解释候选方案（玩家时段 / 拼车整组 / 会员优先级 / 容量 / 主持技能 / 库存 / 角色约束）</div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn primary sm" onClick={() => st.computePlans(d.id)}>{candidates.length ? '↻ 重新计算候选方案' : '1. 计算候选方案'}</button>
        {!resolved && <button className="btn sm" onClick={() => { const r = prompt('异常已解除的说明：', '主持退烧赶回 / 房间检修完成') ; if (r) st.cancelDisruption(d.id, r, '店长-老K') }}>异常解除，撤回处置（恢复已成局）</button>}
        <span className="small muted">候选每次重算都会替换旧候选；已发布/已执行的方案全程保留。</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {candidates.map((p) => <PlanCard key={p.id} d={live} plan={p} onPublish={() => st.publishPlan(d.id, p.id, '店长-老K', 30)} />)}
        {candidates.length === 0 && <div className="small muted">尚未计算，或候选已被发布/作废（见下方方案历史）。</div>}
      </div>

      {published && !resolved && <div style={{ marginTop: 12 }}><ResponsesPanel d={live} /></div>}
      {published && <div style={{ marginTop: 12 }}><ExecutionPanel d={live} onMsg={onMsg} /></div>}

      {historyPlans.filter((p) => p.id !== live.publishedPlanId).length > 0 && (
        <>
          <div className="section-title">📁 方案历史</div>
          <div className="stack" style={{ gap: 6 }}>
            {historyPlans.filter((p) => p.id !== live.publishedPlanId).map((p) => (
              <div key={p.id} className="notice" style={{ fontSize: 12 }}>
                <div className="spread">
                  <span><Badge tone={KIND_TONE[p.kind]}>{p.kind}</Badge> {p.startAt.replace('T', ' ')} <Badge tone={p.status.includes('回滚') ? 'red' : p.status.includes('执行') ? 'green' : 'amber'}>{p.status}</Badge></span>
                  {p.executionNote && <span className="muted">{p.executionNote}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 12 }}><WaitlistPanel d={live} onMsg={onMsg} /></div>

      {entitlements.length > 0 && (
        <>
          <div className="section-title">🎟 权益变动</div>
          <div className="tag-row">
            {entitlements.slice(0, 12).map((e) => (
              <Badge key={e.id} tone={e.kind === '核销' ? 'green' : e.kind === '退回' ? 'red' : 'gold'}>{e.playerName} · {e.kind} ¥{e.amount}</Badge>
            ))}
          </div>
        </>
      )}

      <div className="section-title">📜 场次事件时间线（异常触发 → 方案 → 确认 → 锁定 → 退款补偿 → 排班变更）</div>
      <ul className="timeline">
        {timeline.map((x, i) => (
          <li key={i}>
            <div className="t-at mono">{x.at.replace('T', ' ')}</div>
            <Badge tone={(x.level ? LEVEL_TONE[x.level] : 'blue') as any}>{CAT_EMOJI[x.category] ?? '•'} {x.category}</Badge>
            <span className="t-actor">{x.actor}</span>{x.action}
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// ============ 主页面 ============
export function DisruptionCenterPage({ focusId, onConsumedFocus }: { focusId?: string; onConsumedFocus?: () => void }) {
  const st = useStore()
  const [open, setOpen] = useState<string | undefined>(focusId)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const list = useMemo(() => st.disruptions.slice().sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)), [st.disruptions])
  const active = list.filter((d) => ACTIVE_DSTAT.includes(d.status))
  const waitingConfirm = active.filter((d) => ['待玩家确认', '部分已确认', '待执行迁移'].includes(d.status))
  const opened = open ? st.disruptions.find((d) => d.id === open) : undefined

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>🚨 开场前异常处置中心（主持缺勤 / 场次延迟 / 房间不可用）</div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        异常不是「一改取消」：名额冻结保留可售/候补 → 可解释改期方案（同日换场 / 跨店迁移 / 全额退款 / 保留权益）→ 玩家确认倒计时 →
        原场次名额、目标房间、主持班次、剧本库存一次性锁定，任一并发失效整体回滚 → 候补按公开规则递补 → 全程事件时间线留痕。
      </div>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="v" style={{ color: 'var(--red)' }}>{active.length}</div><div className="l">处置中</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--amber)' }}>{waitingConfirm.length}</div><div className="l">待玩家确认 / 待执行</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--gold)' }}>{st.waitlist.filter((w) => w.status === '已通知').length}</div><div className="l">候补通知倒计时中</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--green)' }}>{list.filter((d) => ['已改期', '已退款关闭', '已取消处置'].includes(d.status)).length}</div><div className="l">已闭环</div></div>
      </div>

      {msg && <div className={`notice ${msg.ok ? 'ok' : 'warn'}`} style={{ marginBottom: 10 }}>
        {msg.ok ? '✅ ' : '⚠️ '}{msg.text}
        <button className="btn ghost sm" style={{ float: 'right' }} onClick={() => setMsg(null)}>知道了</button>
      </div>}

      <div style={{ marginBottom: 14 }}><TriggerForm onCreated={(id) => { setOpen(id); setMsg({ ok: true, text: '异常处置单已创建，名额已冻结，受影响资源已处理。' }) }} /></div>

      <div className="section-title">处置单</div>
      <div className="stack">
        {list.map((d) => {
          const ss = st.sessions.find((x) => x.id === d.sessionId)!
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const plan = d.plans.find((p) => p.id === d.publishedPlanId)
          const locks = st.locks.filter((l) => l.disruptionId === d.id)
          return (
            <div key={d.id} className="card clickable" onClick={() => setOpen(d.id)}>
              <div className="spread">
                <div className="row">
                  <Badge tone="red">{d.type}</Badge>
                  <b>《{script.name}》{ss.startKey}</b>
                  <Badge tone={ACTIVE_DSTAT.includes(d.status) ? 'amber' : 'green'}>{d.status}</Badge>
                  <span className="small muted mono">{d.id}</span>
                </div>
                <div className="row">
                  {plan && <Badge tone={KIND_TONE[plan.kind]}>{plan.kind}{plan.confirmDeadline ? ` · 截止 ${plan.confirmDeadline.slice(11, 16)}` : ''}</Badge>}
                  {locks.length > 0 && <Badge tone={locks.some((l) => l.status === '锁定失败') ? 'red' : 'blue'}>锁 {locks.length}</Badge>}
                </div>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{d.reason}</div>
            </div>
          )
        })}
      </div>

      {opened && <DisruptionDetail d={opened} onClose={() => { setOpen(undefined); onConsumedFocus?.() }} onMsg={setMsg} />}
    </div>
  )
}
