import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useTicker, remainSecs, fmtCountdown } from '../ticker'
import { rankWaitlist, validatePlan } from '../disruption'
import type {
  DisruptionCase, DisruptionType, PlanKind, ReschedulePlan,
} from '../types'
import { Badge, Modal } from '../ui'

const CASE_TONE: Record<DisruptionCase['status'], 'red' | 'amber' | 'blue' | 'purple' | 'green' | 'gold'> = {
  异常已登记: 'red', 方案计算中: 'blue', 待玩家确认: 'purple', 待店长执行: 'amber',
  已改期: 'green', 已退款: 'green', 已保留权益: 'gold', 执行失败已回滚: 'red', 已关闭: 'green',
}
const PLAN_TONE: Record<ReschedulePlan['status'], 'amber' | 'blue' | 'green' | 'red' | 'purple'> = {
  候选: 'amber', 玩家确认中: 'purple', 满足执行条件: 'blue', 已执行: 'green', 已回滚: 'red', 已作废: 'red',
}
const KIND_ICON: Record<PlanKind, string> = { 同日换场: '🔁', 跨店迁移: '🚇', 全额退款: '💴', 保留权益待补位: '🎟' }
const DEADLINE_MIN = 30

// ---------------- 登记异常 ----------------
function RaiseDisruptionModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [sessionId, setSessionId] = useState(st.sessions[0]?.id ?? '')
  const [type, setType] = useState<DisruptionType>('主持缺勤')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const ss = st.sessions.find((x) => x.id === sessionId)
  const script = ss ? st.scripts.find((x) => x.id === ss.scriptId) : undefined
  const presets: Record<DisruptionType, { title: string; detail: string }> = {
    主持缺勤: { title: '主持人临时缺勤，开场前无人主持', detail: '主持人突发请假/失联，需要调班或发起改期。' },
    场次延迟: { title: '场次延迟，无法按原定时间开场', detail: '前序场次拖堂/设备调试延迟，影响该场玩家按时开场。' },
    房间不可用: { title: '房间故障/被占用，原定房间不可用', detail: '房间设施故障、临时检修或被其他活动占用。' },
  }
  return (
    <Modal title="🚨 登记开场前异常" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" disabled={!title.trim() || !detail.trim()}
          onClick={() => { st.raiseDisruption({ sessionId, type, title, detail, raisedBy: '值班店长' }); onClose() }}>
          登记并冻结原场次名额
        </button></>}>
      <div className="stack">
        <label className="field"><span>异常场次（原场次不会被简单取消，名额冻结等待方案）</span>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {st.sessions.map((s) => {
              const sc = st.scripts.find((x) => x.id === s.scriptId)!
              const store = st.stores.find((x) => x.id === s.storeId)
              return <option key={s.id} value={s.id}>{store?.shortName} · 《{sc.name}》{s.startKey} · {s.status} · {s.id}</option>
            })}
          </select>
        </label>
        {ss && script && <div className="notice info small">
          门店：{st.stores.find((x) => x.id === ss.storeId)?.name} · 房间 {st.rooms.find((r) => r.id === ss.roomId)?.name} ·
          主持 {st.hosts.find((h) => h.id === ss.hostId)?.name ?? '空缺'} · 盒装 {st.copies.find((c) => c.id === ss.copyId)?.code} ·
          已报名 {ss.bookingIds.length} 组
        </div>}
        <label className="field"><span>异常类型</span>
          <div className="switch-pill">
            {(['主持缺勤', '场次延迟', '房间不可用'] as const).map((t) => (
              <button key={t} className={type === t ? 'active' : ''} onClick={() => { setType(t); setTitle(presets[t].title); setDetail(presets[t].detail) }}>{t}</button>
            ))}
          </div>
        </label>
        <label className="field"><span>异常标题</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>情况说明（同步给玩家与各岗位）</span><textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
        <div className="muted small">登记后系统将统筹：已报名玩家、候补队列、主持排班、房间资源、剧本库存、会员权益，并生成场次事件时间线。</div>
      </div>
    </Modal>
  )
}

// ---------------- 方案卡片 ----------------
function FitList({ plan }: { plan: ReschedulePlan }) {
  return (
    <div className="stack" style={{ gap: 3 }}>
      {plan.fit.map((f, i) => (
        <div key={i} className="small" style={{ color: f.ok ? 'var(--green)' : 'var(--red)' }}>
          {f.ok ? '✅' : '❌'} <b>{f.label}</b>：<span className="muted" style={{ color: f.ok ? 'var(--muted)' : '#ffc4c4' }}>{f.detail}</span>
        </div>
      ))}
    </div>
  )
}

function PlanCard({ dc, plan, onChosen, disabled }: {
  dc: DisruptionCase; plan: ReschedulePlan; onChosen: () => void; disabled: boolean
}) {
  const st = useStore()
  const targetStore = plan.targetStoreId ? st.stores.find((x) => x.id === plan.targetStoreId) : undefined
  const chosen = dc.chosenPlanId === plan.id
  return (
    <div className="card" style={{ borderColor: chosen ? 'var(--primary)' : plan.feasible ? undefined : '#6e3040', opacity: plan.status === '已作废' ? 0.5 : 1 }}>
      <div className="spread">
        <div className="row">
          <b style={{ fontSize: 15 }}>{KIND_ICON[plan.kind]} {plan.title}</b>
          <Badge tone={PLAN_TONE[plan.status]}>{plan.status}</Badge>
          {plan.feasible ? <Badge tone="green">资源可行</Badge> : <Badge tone="red">资源冲突</Badge>}
        </div>
        <div className="row">
          {targetStore && <Badge tone="blue">{targetStore.shortName}</Badge>}
          {plan.targetVacancy !== undefined && plan.kind !== '全额退款' && plan.kind !== '保留权益待补位' &&
            <Badge tone="purple">目标余 {plan.targetVacancy} 席</Badge>}
          {plan.requiresConfirm && <Badge tone="gold">需玩家确认</Badge>}
        </div>
      </div>
      <div className="stack" style={{ gap: 4, marginTop: 8 }}>
        {plan.blockers.length > 0 && plan.blockers.map((b, i) => (
          <div key={i} className="notice warn" style={{ fontSize: 12, padding: '6px 10px' }}>⛔ {b}</div>
        ))}
        <FitList plan={plan} />
        <div className="small muted">说明：{plan.explanations.join('；')}</div>
      </div>
      {plan.status === '候选' && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary sm" disabled={!plan.feasible || disabled} onClick={onChosen}>
            {plan.requiresConfirm ? `发起方案并向玩家确认（倒计时 ${DEADLINE_MIN} 分钟）` : '发起方案（可直接执行）'}
          </button>
          {!plan.feasible && <span className="small muted">冲突资源在玩家确认前必须解除，或选择其他方案</span>}
        </div>
      )}
      {plan.lastCommitError && (
        <div className="notice warn" style={{ marginTop: 8, fontSize: 12 }}>
          <b>上次原子确认已整体回滚：</b>{plan.lastCommitError}
        </div>
      )}
      {plan.execution && (
        <div className="notice ok" style={{ marginTop: 8, fontSize: 12 }}>
          事务 {plan.execution.txId} · 迁移 {plan.execution.movedBookingIds.length} 组 ·
          退款 {plan.execution.refunds.length} 笔 · 权益 {plan.execution.voucherIds.length} 张 ·
          锁 {plan.execution.lockIds.length} 项
        </div>
      )}
    </div>
  )
}

// ---------------- 玩家确认表 + 提交 ----------------
function ConfirmationPanel({ dc, plan }: { dc: DisruptionCase; plan: ReschedulePlan }) {
  const st = useStore()
  useTicker()
  const secs = remainSecs(plan.confirmDeadline)
  const stageCheck = useMemo(() => validatePlan(st.domain(), dc, plan), [st.sessions, st.locks, st.simClaims, st.bookings, plan.responses, plan.status])
  const groups = plan.responses.map((r) => ({ r, b: st.bookings.find((b) => b.id === r.bookingId)! }))

  return (
    <div className="card" style={{ borderColor: 'var(--primary)' }}>
      <div className="spread">
        <div className="row"><b>📨 玩家确认与原子提交</b><Badge tone={PLAN_TONE[plan.status]}>{plan.status}</Badge></div>
        {plan.confirmDeadline && plan.status === '玩家确认中' && (
          <div className="row">
            <span className="small muted">确认截止 {plan.confirmDeadline.slice(11, 16)}</span>
            <span className="price" style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{fmtCountdown(secs)}</span>
            <button className="btn sm danger" onClick={() => st.expirePlanResponses(plan.id)}>模拟倒计时结束</button>
          </div>
        )}
      </div>

      <table className="data" style={{ marginTop: 8 }}>
        <thead><tr><th>同行组</th><th>玩家/偏好</th><th>会员</th><th>响应</th><th>演示操作（可代玩家）</th></tr></thead>
        <tbody>
          {groups.map(({ r, b }) => {
            const member = st.members.find((m) => m.id === b.memberId)
            return (
              <tr key={r.bookingId}>
                <td><b>{b.contactName}组</b><div className="small muted">{b.players.length} 人同行（不拆分）</div></td>
                <td className="small">{r.partyNames.join('、')}<div className="muted">{b.players.map((p) => p.rolePreference).join('/')}</div></td>
                <td>{member ? <Badge tone="gold">{member.level}</Badge> : <span className="small muted">散客</span>}</td>
                <td>{r.decision === '待响应' ? <Badge tone="amber">待响应</Badge>
                  : r.decision === '同意' ? <Badge tone="green">同意{r.acceptedSlot ? `（仅 ${r.acceptedSlot}）` : ''}</Badge>
                    : r.decision === '拒绝' ? <Badge tone="red">拒绝（将全额退款）</Badge>
                      : <Badge tone="amber">超时未响应（保留权益）</Badge>}
                  <div className="small muted mono">{r.at?.slice(11, 16)}</div></td>
                <td>
                  {r.decision === '待响应' && <div className="row">
                    <button className="btn sm primary" onClick={() => st.respondPlan(plan.id, r.bookingId, '同意')}>同意</button>
                    <button className="btn sm" onClick={() => st.respondPlan(plan.id, r.bookingId, '同意', plan.targetStartAt?.slice(11, 16))}>仅接受此时段</button>
                    <button className="btn sm danger" onClick={() => st.respondPlan(plan.id, r.bookingId, '拒绝')}>拒绝</button>
                  </div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="section-title">🔒 原子提交预检（原场次名额 → 目标余量 → 房间 → 主持 → 库存）</div>
      <div className="tag-row">
        {stageCheck.map((s, i) => (
          <Badge key={i} tone={s.ok ? 'green' : 'red'}>{s.ok ? '✅' : '❌'} {s.stage}{s.error ? `：${s.error}` : ''}</Badge>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn gold" disabled={plan.status !== '满足执行条件'}
          onClick={() => {
            const res = st.commitPlan(plan.id)
            if (!res.ok) alert(`原子确认失败，已整体回滚：\n${res.error}`)
          }}>
          ⚡ 一次性锁定并原子确认（失败整体回滚）
        </button>
        {plan.status === '已执行' && <button className="btn sm" onClick={() => { const r = st.commitPlan(plan.id); alert(r.ok ? '重复确认被幂等拦截：未产生重复退款/座位' : r.error) }}>
          🔁 再次点击（验证重复确认幂等）
        </button>}
        <span className="small muted">
          {plan.kind === '全额退款' ? '提交即逐笔幂等全额退款，原场次转「改期待补」继续可候补'
            : plan.kind === '保留权益待补位' ? '提交即把已付款转全额权益券，原场次转「改期待补」'
              : '拒绝组全额退款、超时组保留全额权益；任一资源失效则全部回滚，不会出现扣了权益却没座位'}
        </span>
      </div>
    </div>
  )
}

// ---------------- 并发抢占模拟 ----------------
function ContentionPanel({ plan }: { plan?: ReschedulePlan }) {
  const st = useStore()
  const isMigration = plan && (plan.kind === '同日换场' || plan.kind === '跨店迁移')
  const ss = plan ? st.sessions.find((x) => x.id === st.cases.find((c) => c.id === plan.caseId)?.sessionId) : undefined
  const script = ss ? st.scripts.find((x) => x.id === ss.scriptId) : undefined
  const dur = script?.durationMin ?? 240
  const claims: { kind: '房间' | '主持' | '库存'; refId?: string; label: string; startAt?: string }[] =
    isMigration && plan ? [
    { kind: '房间', refId: plan.targetRoomId, label: `抢占目标房间 ${st.rooms.find((r) => r.id === plan.targetRoomId)?.name}`, startAt: plan.targetStartAt },
    { kind: '主持', refId: plan.targetHostId, label: `调走目标主持 ${st.hosts.find((h) => h.id === plan.targetHostId)?.name}`, startAt: plan.targetStartAt },
    { kind: '库存', refId: plan.targetCopyId, label: `借走目标盒装 ${st.copies.find((c) => c.id === plan.targetCopyId)?.code}`, startAt: plan.targetStartAt },
  ] : []
  return (
    <div className="card">
      <b>🧪 多店同时抢占模拟（验证原子回滚）</b>
      <div className="muted small" style={{ margin: '6px 0' }}>
        {isMigration
          ? <>打开任一抢占开关后再点「原子确认」，系统会在对应阶段终检失败：<b>名额/房间/班次/库存全部不生效、不退款、不扣权益，原场次保持可售/候补</b>。</>
          : <>当前方案为<b>{plan?.kind ?? '退款/保留权益类'}</b>，不迁移房间/主持/库存，原资源抢占不阻塞提交；请选择「同日换场 / 跨店迁移」方案来演练资源失效整体回滚。</>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {claims.map((c) => {
          const on = st.simClaims.some((x) => x.kind === c.kind && x.refId === c.refId && x.startAt === c.startAt)
          return (
            <label key={`${c.kind}-${c.refId}`} className="checkbox small">
              <input type="checkbox" checked={on} onChange={() => st.toggleSimClaim({
                kind: c.kind, refId: c.refId!, startAt: c.startAt!, durationMin: dur, by: '其他门店/临时包场（模拟）',
              })} />
              <span>{c.label}（{c.kind}）{on && <Badge tone="red">抢占中</Badge>}</span>
            </label>
          )
        })}
        {claims.length === 0 && <div className="small muted">请先选择一个迁移类候选方案。</div>}
      </div>
    </div>
  )
}

// ---------------- 候补面板 ----------------
function WaitlistPanel({ dc }: { dc: DisruptionCase }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === dc.sessionId)!
  const ranked = useMemo(() => rankWaitlist(st.domain(), ss.scriptId, ss.storeId), [st.waitlist, st.sessions, st.members])
  const [fillTarget, setFillTarget] = useState(ss.id)
  const targetSessions = st.sessions.filter((x) => x.storeId === ss.storeId && x.scriptId === ss.scriptId && !['已解散', '已复盘'].includes(x.status))

  return (
    <div className="card">
      <div className="spread">
        <b>📋 候补队列（公开优先级规则）</b>
        <div className="row">
          <select style={{ width: 230 }} value={fillTarget} onChange={(e) => setFillTarget(e.target.value)}>
            {targetSessions.map((x) => <option key={x.id} value={x.id}>{x.startKey} · {x.status} · {x.id}</option>)}
          </select>
          <button className="btn sm primary" onClick={() => {
            const r = st.autoFillWaitlist(fillTarget)
            alert(`自动递补完成：${r.promoted.length ? '补入 ' + r.promoted.join('、') : '无补入'}${r.skipped.length ? '\n跳过：\n' + r.skipped.map((s) => `· ${s.name}：${s.reason}`).join('\n') : ''}`)
          }}>按公开规则自动递补</button>
        </div>
      </div>
      <div className="muted small" style={{ margin: '6px 0' }}>
        公开规则：金卡 +100 / 银卡 +60；历史到店 ×5；已预付 +50；登记次序依次 +0/20/40…；同行整组补位不拆分；「仅接受指定时段」与容量/角色约束优先于排序。
      </div>
      {ranked.length === 0 ? <div className="empty" style={{ padding: 14 }}>该剧本在本店暂无候补。</div> : (
        <table className="data">
          <thead><tr><th>#</th><th>候补组</th><th>会员</th><th>人数</th><th>自动补位策略</th><th>优先级分/规则</th><th>状态/操作</th></tr></thead>
          <tbody>
            {ranked.map((w, i) => (
              <tr key={w.id}>
                <td className="mono">{i + 1}</td>
                <td><b>{w.contactName}</b><div className="small muted">{w.contactPhone}</div></td>
                <td>{w.member ? <Badge tone="gold">{w.member.level} · 到店{w.member.visits}</Badge> : <span className="small muted">散客</span>}</td>
                <td className="mono">{w.partySize} 人</td>
                <td>
                  <Badge tone={w.autoMode === '同意自动补位' ? 'green' : w.autoMode === '仅接受指定时段' ? 'amber' : 'red'}>{w.autoMode}</Badge>
                  {w.acceptedSlots.length > 0 && <div className="small muted">仅 {w.acceptedSlots.join('/')}</div>}
                </td>
                <td className="small"><b className="price">{w.score}</b>
                  <div className="muted">{w.scoreRules.join('；')}</div></td>
                <td>
                  <div className="row">
                    <Badge tone={w.status === '补位成功' ? 'green' : w.status === '已邀约' ? 'amber' : 'blue'}>{w.status}</Badge>
                    {w.status === '候补中' && <>
                      <button className="btn sm" onClick={() => st.inviteWaitlist(w.id, fillTarget, DEADLINE_MIN)}>发邀约</button>
                      <button className="btn sm" onClick={() => {
                        const reason = prompt('手工递补原因（必填，且不得绕过容量/角色约束）：', '店长根据玩家特殊情况手工调整')
                        if (reason) { const r = st.promoteWaitlistManual(w.id, fillTarget, reason); if (!r.ok) alert(`被拦截：${r.error}`) }
                      }}>手工递补</button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------------- 手工调整（必须原因 + 约束拦截） ----------------
function ManualAdjustPanel({ dc }: { dc: DisruptionCase }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === dc.sessionId)!
  const [roomId, setRoomId] = useState(ss.roomId ?? '')
  const [hostId, setHostId] = useState(ss.hostId ?? '')
  const [reason, setReason] = useState('')
  const rooms = st.rooms.filter((r) => r.storeId === ss.storeId)
  const hosts = st.hosts.filter((h) => h.storeId === ss.storeId || h.crossStore)
  return (
    <div className="card">
      <b>🛠 店长手工调整（必须填写原因，容量/角色/档期约束不可绕过）</b>
      <div className="grid cols-3" style={{ marginTop: 8 }}>
        <label className="field" style={{ margin: 0 }}><span>房间（容量/故障自动校验）</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}（{r.capacity}人{r.horrorSet ? '·恐怖实景' : ''}）</option>)}</select>
        </label>
        <label className="field" style={{ margin: 0 }}><span>主持（请假/技能留痕）</span>
          <select value={hostId} onChange={(e) => setHostId(e.target.value)}>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name} · {h.level} · 熟练 {(h.proficiency[ss.scriptId] ?? 0)}/5</option>)}</select>
        </label>
        <label className="field" style={{ margin: 0 }}><span>调整原因（必填）</span>
          <input placeholder="如：工程确认房间提前修复；与小鹿协商换班" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm primary" disabled={!reason.trim()} onClick={() => {
          const r = st.manualAdjust(ss.id, { roomId: roomId !== ss.roomId ? roomId : undefined, hostId: hostId !== ss.hostId ? hostId : undefined }, reason)
          if (r.ok) { alert('调整成功，已写入场次事件时间线'); setReason('') } else alert(`被拦截：${r.error}`)
        }}>应用手工调整</button>
        <span className="small muted">调整仅换资源，不改变玩家权益；所有动作写入时间线</span>
      </div>
    </div>
  )
}

// ---------------- 锁 & 时间线 ----------------
function LocksPanel({ dc }: { dc: DisruptionCase }) {
  const st = useStore()
  const locks = st.locks.filter((l) => l.caseId === dc.id)
  if (!locks.length) return <div className="small muted">暂无资源锁（提交原子确认时一次性建立）。</div>
  return (
    <table className="data">
      <thead><tr><th>锁类型</th><th>资源</th><th>说明</th><th>门店</th><th>状态</th><th>建立/释放</th></tr></thead>
      <tbody>
        {locks.map((l) => (
          <tr key={l.id}>
            <td><Badge tone="gold">{l.kind}</Badge></td>
            <td className="small mono">{l.label}</td>
            <td className="small muted">{l.detail}</td>
            <td className="small">{st.stores.find((x) => x.id === l.storeId)?.shortName}</td>
            <td><Badge tone={l.status === '已生效' ? 'green' : l.status === '已释放' || l.status === '已失效' ? 'red' : 'amber'}>{l.status}</Badge></td>
            <td className="small muted mono">{l.since.slice(5, 16).replace('T', ' ')}{l.releasedAt ? ` → ${l.releasedAt.slice(11, 16)}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TimelinePanel({ dc }: { dc: DisruptionCase }) {
  const st = useStore()
  const evs = st.events.filter((e) => e.caseId === dc.id || e.sessionId === dc.sessionId).sort((a, b) => a.at.localeCompare(b.at))
  return (
    <ul className="timeline">
      {evs.map((e) => (
        <li key={e.id}>
          <div className="t-at mono">{e.at.slice(5, 19).replace('T', ' ')}</div>
          <span className="t-actor">{e.actor}</span>
          <Badge tone={e.tone}>{e.type}</Badge> <b>{e.title}</b>
          <div className="small muted">{e.detail}</div>
        </li>
      ))}
    </ul>
  )
}

// ---------------- 主页面 ----------------
export function DisruptionCenterPage() {
  const st = useStore()
  useTicker()
  const [raise, setRaise] = useState(false)
  const [openId, setOpenId] = useState<string | undefined>(st.cases[0]?.id)
  const cases = [...st.cases].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
  const dc = cases.find((c) => c.id === openId) ?? cases[0]
  const ss = dc ? st.sessions.find((x) => x.id === dc.sessionId) : undefined
  const script = ss ? st.scripts.find((x) => x.id === ss.scriptId) : undefined
  const plans = dc ? st.plans.filter((p) => p.caseId === dc.id).sort((a, b) => b.fitScore - a.fitScore) : []
  const chosen = dc?.chosenPlanId ? st.plans.find((p) => p.id === dc.chosenPlanId) : undefined

  const manualCases = st.cases.filter((c) => ['异常已登记', '执行失败已回滚', '待店长执行'].includes(c.status))

  return (
    <div>
      <div className="spread">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>🚨 开场前异常改期中心</div>
          <div className="muted small">
            主持人缺勤 / 场次延迟 / 房间不可用时，统筹已报名玩家、候补队列、主持排班、房间、剧本库存与会员权益；四类方案均给出可解释候选，原子确认失败整体回滚。
          </div>
        </div>
        <button className="btn primary" onClick={() => setRaise(true)}>＋ 登记开场前异常</button>
      </div>

      {manualCases.length > 0 && (
        <div className="notice warn" style={{ margin: '10px 0' }}>
          ⚠ 需人工介入 <b>{manualCases.length}</b> 单：{manualCases.map((c) => `【${c.type}】${c.title}`).join('；')}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '300px 1fr', alignItems: 'start' }}>
        <div className="stack">
          {cases.map((c) => {
            return (
              <div key={c.id} className={`card clickable ${dc?.id === c.id ? '' : ''}`}
                style={{ padding: 12, borderColor: dc?.id === c.id ? 'var(--primary)' : undefined, cursor: 'pointer' }}
                onClick={() => setOpenId(c.id)}>
                <div className="spread"><Badge tone="red">{c.type}</Badge><Badge tone={CASE_TONE[c.status]}>{c.status}</Badge></div>
                <div className="strong small" style={{ margin: '6px 0' }}>{c.title}</div>
                <div className="small muted mono">{c.sessionId} · {c.raisedAt.slice(5, 16).replace('T', ' ')}</div>
              </div>
            )
          })}
          {cases.length === 0 && <div className="empty">暂无异常单。</div>}
        </div>

        {dc && ss && script && (
          <div className="stack">
            <div className="card">
              <div className="spread">
                <div className="row">
                  <h3 style={{ margin: 0 }}>《{script.name}》{ss.startKey} 场</h3>
                  <Badge tone="red">{dc.type}</Badge>
                  <Badge tone={CASE_TONE[dc.status]}>{dc.status}</Badge>
                  <Badge tone="blue">{st.stores.find((x) => x.id === ss.storeId)?.shortName}</Badge>
                </div>
                <div className="small muted mono">异常单 {dc.id} · 场次 {ss.id}</div>
              </div>
              <div className="notice warn" style={{ marginTop: 8, fontSize: 13 }}>{dc.detail}</div>
              <div className="grid cols-4" style={{ marginTop: 10, gap: 8 }}>
                <div className="notice" style={{ fontSize: 12 }}><b>原房间</b><br />{st.rooms.find((r) => r.id === ss.roomId)?.name}{ss.roomId && st.rooms.find((r) => r.id === ss.roomId)?.outages.length ? ' ⚠故障' : ''}</div>
                <div className="notice" style={{ fontSize: 12 }}><b>原主持</b><br />{st.hosts.find((h) => h.id === ss.hostId)?.name ?? '空缺'}</div>
                <div className="notice" style={{ fontSize: 12 }}><b>盒装库存</b><br />{st.copies.find((c) => c.id === ss.copyId)?.code}</div>
                <div className="notice" style={{ fontSize: 12 }}><b>已报名</b><br />{ss.bookingIds.length} 个同行组 / {ss.bookingIds.reduce((n, id) => n + (st.bookings.find((b) => b.id === id)?.players.length ?? 0), 0)} 人</div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => st.computePlans(dc.id)}>
                  {plans.some((p) => p.status === '已回滚') ? '♻ 解除抢占后重新计算候选' : '🧮 计算候选安排（同日换场/跨店/退款/保留权益）'}
                </button>
                {['已改期', '已退款', '已保留权益'].includes(dc.status) && <button className="btn sm" onClick={() => st.closeCase(dc.id)}>关闭异常单</button>}
              </div>
            </div>

            {plans.length === 0 && <div className="empty">尚未计算候选方案，点击上方按钮。</div>}
            <div className="grid cols-2">
              {plans.map((p) => <PlanCard key={p.id} dc={dc} plan={p} disabled={!!chosen && chosen.status !== '已回滚'} onChosen={() => st.selectPlan(dc.id, p.id, DEADLINE_MIN)} />)}
            </div>

            {chosen && <ConfirmationPanel dc={dc} plan={chosen} />}
            <ContentionPanel plan={chosen} />
            <WaitlistPanel dc={dc} />
            <ManualAdjustPanel dc={dc} />

            <div className="card">
              <b>🔗 资源锁台账</b>
              <div style={{ marginTop: 8 }}><LocksPanel dc={dc} /></div>
            </div>
            <div className="card">
              <b>📜 场次事件时间线（异常触发→方案→确认→锁定→退款/补偿→排班变更）</b>
              <div style={{ marginTop: 10 }}><TimelinePanel dc={dc} /></div>
            </div>
          </div>
        )}
      </div>

      {raise && <RaiseDisruptionModal onClose={() => setRaise(false)} />}
    </div>
  )
}
