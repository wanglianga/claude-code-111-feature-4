import { useMemo, useState } from 'react'
import { useStore, memberDiscount } from '../store'
import { useTicker, remainSecs, fmtCountdown } from '../ticker'
import type { ReschedulePlan, WaitlistAutoMode } from '../types'
import { Badge, Modal } from '../ui'

const PLAN_DECISION_TONE = { 待响应: 'amber', 同意: 'green', 拒绝: 'red', 超时未响应: 'amber' } as const

// ============ 我的异常方案（嵌入“我的拼场”） ============
function PlanProposalCard({ plan, bookingId }: { plan: ReschedulePlan; bookingId: string }) {
  const st = useStore()
  useTicker()
  const resp = plan.responses.find((r) => r.bookingId === bookingId)!
  const dc = st.cases.find((c) => c.id === plan.caseId)
  const targetStore = plan.targetStoreId ? st.stores.find((x) => x.id === plan.targetStoreId) : undefined
  const targetRoom = st.rooms.find((r) => r.id === plan.targetRoomId)
  const targetHost = st.hosts.find((h) => h.id === plan.targetHostId)
  const secs = remainSecs(plan.confirmDeadline)
  const low = secs > 0 && secs < 300

  return (
    <div className="notice" style={{ borderColor: 'var(--primary)', background: '#241a31' }}>
      <div className="spread">
        <div className="row">
          <b>🎲 门店发起改期方案：{plan.title}</b>
          <Badge tone={PLAN_DECISION_TONE[resp.decision]}>{resp.decision}</Badge>
        </div>
        {plan.status === '玩家确认中' && resp.decision === '待响应' && (
          <span className="price" style={{ fontSize: 20, color: low ? 'var(--red)' : undefined }}>⏳ {fmtCountdown(secs)}</span>
        )}
      </div>
      <div className="small muted" style={{ margin: '6px 0' }}>
        异常：{dc?.type} —— {dc?.title}
      </div>
      <div className="tag-row" style={{ margin: '6px 0' }}>
        {targetStore && <Badge tone="blue">{targetStore.shortName}</Badge>}
        {plan.targetStartAt && <Badge tone="purple">{plan.targetStartAt.replace('T', ' ')}</Badge>}
        {targetRoom && <Badge>{targetRoom.name}</Badge>}
        {targetHost && <Badge>{`主持 ${targetHost.name}`}</Badge>}
        <Badge tone="gold">{plan.kind}</Badge>
      </div>

      <div className="small">
        <b>你的权益变化：</b>
        {plan.kind === '全额退款'
          ? '已付报名费原路全额退回（门店原因不扣占位费），原场次名额继续对其他玩家开放候补。'
          : plan.kind === '保留权益待补位'
            ? '已付金额转为全额权益券，资源恢复/新场开出后你优先补位，期间不占用任何座位。'
            : <>同意迁移：已付费用与角色偏好整体平移{plan.kind === '跨店迁移' ? '，另发 ¥20 交通补偿券' : ''}；拒绝：全额退款；超时不响应：自动保留全额权益。</>}
      </div>

      {resp.decision === '待响应' && plan.status === '玩家确认中' && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary sm" onClick={() => st.respondPlan(plan.id, bookingId, '同意')}>✅ 同意该安排</button>
          {plan.targetStartAt && <button className="btn sm" onClick={() => st.respondPlan(plan.id, bookingId, '同意', plan.targetStartAt!.slice(11, 16))}>
            仅接受 {plan.targetStartAt.slice(11, 16)} 这个时段
          </button>}
          <button className="btn danger sm" onClick={() => st.respondPlan(plan.id, bookingId, '拒绝')}>✋ 拒绝（全额退款）</button>
        </div>
      )}
      {resp.acceptedSlot && <div className="small muted" style={{ marginTop: 4 }}>你已声明：仅接受 {resp.acceptedSlot} 时段。</div>}
      {resp.decision === '超时未响应' && <div className="small" style={{ marginTop: 4, color: 'var(--amber)' }}>你已超时未响应，系统已为你保留全额权益，可在下方“我的权益”查看。</div>}

      {plan.status === '已回滚' && (
        <div className="notice warn" style={{ marginTop: 8, fontSize: 12 }}>
          <b>❌ 门店确认时资源被抢占，本次安排未生效：</b>{plan.lastCommitError}
          <br />你的报名费未被扣减、座位仍在原场次，门店会重新给出方案。
        </div>
      )}
      {plan.status === '已执行' && plan.execution && (
        <div className="notice ok" style={{ marginTop: 8, fontSize: 12 }}>
          ✅ 方案已执行：迁移 {plan.execution.movedBookingIds.length} 组 · 退款 {plan.execution.refunds.length} 笔 · 补偿/权益 {plan.execution.voucherIds.length} 张。
          {resp.decision === '同意' && plan.execution.movedBookingIds.includes(bookingId) && '你的新场次已生成，见下方预约状态。'}
        </div>
      )}
    </div>
  )
}

export function MyPlanProposals({ bookingId }: { bookingId: string }) {
  const plans = useStore((s) => s.plans)
  const mine = plans.filter((p) => p.responses.some((r) => r.bookingId === bookingId) &&
    ['玩家确认中', '满足执行条件', '已执行', '已回滚'].includes(p.status))
  if (!mine.length) return null
  return <div className="stack" style={{ marginTop: 8 }}>{mine.map((p) => <PlanProposalCard key={p.id} plan={p} bookingId={bookingId} />)}</div>
}

// ============ 候补报名 ============
function JoinWaitlistModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [scriptId, setScriptId] = useState(st.scripts[0]?.id ?? '')
  const [count, setCount] = useState(1)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [memberId, setMemberId] = useState('')
  const [prepaid, setPrepaid] = useState(true)
  const [mode, setMode] = useState<WaitlistAutoMode>('同意自动补位')
  const [prefs, setPrefs] = useState<string[]>(['随意'])
  const [cross, setCross] = useState<boolean[]>([true])
  const script = st.scripts.find((s) => s.id === scriptId)!
  const slots = script.startTime.split(' / ')
  const [accepted, setAccepted] = useState<string[]>(slots)
  const price = Math.round(script.price * memberDiscount(st.members.find((m) => m.id === memberId)?.level))

  const setN = (n: number) => {
    setCount(n)
    setPrefs((p) => Array.from({ length: n }, (_, i) => p[i] ?? '随意'))
    setCross((p) => Array.from({ length: n }, (_, i) => p[i] ?? true))
  }
  const toggleSlot = (s: string) =>
    setAccepted((xs) => xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s])

  return (
    <Modal wide title="📋 登记候补（满场/改期待补场次可自动递补）" onClose={onClose}>
      <div className="grid cols-2">
        <div className="stack">
          <label className="field"><span>剧本</span>
            <select value={scriptId} onChange={(e) => { setScriptId(e.target.value); const sc = st.scripts.find((x) => x.id === e.target.value)!; setAccepted(sc.startTime.split(' / ')) }}>
              {st.scripts.map((s) => <option key={s.id} value={s.id}>《{s.name}》{s.minPlayers}-{s.maxPlayers}人 · ¥{s.price}</option>)}
            </select>
          </label>
          <div className="grid cols-2">
            <label className="field"><span>同行人数（整组补位不拆分）</span>
              <input type="number" min={1} max={script.maxPlayers} value={count}
                onChange={(e) => setN(Math.max(1, Math.min(script.maxPlayers, Number(e.target.value) || 1)))} /></label>
            <label className="field"><span>会员（影响公开优先级）</span>
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">非会员</option>
                {st.members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.level}（到店 {m.visits} 次）</option>)}
              </select>
            </label>
            <label className="field"><span>联系人</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" /></label>
            <label className="field"><span>手机号</span><input value={phone} maxLength={11} onChange={(e) => setPhone(e.target.value)} placeholder="11 位手机号" /></label>
          </div>
          <label className="field"><span>自动补位策略</span>
            <div className="switch-pill">
              <button className={mode === '同意自动补位' ? 'active' : ''} onClick={() => setMode('同意自动补位')}>🟢 同意自动补位</button>
              <button className={mode === '仅接受指定时段' ? 'active' : ''} onClick={() => setMode('仅接受指定时段')}>🟡 仅接受指定时段</button>
              <button className={mode === '暂不自动补位' ? 'active' : ''} onClick={() => setMode('暂不自动补位')}>🔴 每次先问我</button>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {mode === '同意自动补位' ? '有名额时按公开优先级自动补位并通知你。'
                : mode === '仅接受指定时段' ? '只有你勾选的开场时段才会被递补。'
                  : '门店每次都先邀约，超时未响应自动顺延下一位。'}
            </div>
          </label>
          {mode !== '暂不自动补位' && (
            <label className="field"><span>{mode === '仅接受指定时段' ? '仅接受的开场时段（必选）' : '可接受的开场时段'}</span>
              <div className="tag-row">{slots.map((s) => (
                <button key={s} type="button" className={`btn sm ${accepted.includes(s) ? 'primary' : ''}`} onClick={() => toggleSlot(s)}>{s}</button>
              ))}</div>
            </label>
          )}
          <label className="checkbox"><input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} />
            <span>在线预付报名费（候补 +50 优先级分，补位成功自动核销）</span></label>
        </div>
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="strong small" style={{ marginBottom: 8 }}>每位玩家角色偏好 / 反串</div>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="row" style={{ borderTop: '1px dashed var(--line)', padding: '6px 0' }}>
              <span className="small" style={{ width: 56 }}>{i === 0 ? '联系人' : `同行${i + 1}`}</span>
              <select style={{ width: 120 }} value={prefs[i]} onChange={(e) => setPrefs((p) => p.map((x, j) => j === i ? e.target.value : x))}>
                {['随意', 'C位', '推理位', '情感位', '氛围位', '欢乐位'].map((x) => <option key={x}>{x}</option>)}
              </select>
              <label className="checkbox small"><input type="checkbox" checked={cross[i]} onChange={(e) => setCross((p) => p.map((x, j) => j === i ? e.target.checked : x))} />接受反串</label>
            </div>
          ))}
          <hr className="hr-soft" />
          <div className="spread small"><span>单价（候补占用按 {memberId ? st.members.find((m) => m.id === memberId)?.level : '原价'}）</span><span className="price">¥{price}</span></div>
          <div className="small muted" style={{ marginTop: 8 }}>
            公开优先级：金卡 +100 / 银卡 +60；历史到店 ×5；已预付 +50；登记次序依次 +0/20/40…；同行整组不拆分；容量与角色配置约束优先于排序。
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" disabled={!name.trim() || !/^1\d{10}$/.test(phone) || (mode === '仅接受指定时段' && accepted.length === 0)}
          onClick={() => {
            st.joinWaitlist({
              scriptId, contactName: name, contactPhone: phone, memberId: memberId || undefined,
              partySize: count, prepaid, autoMode: mode, acceptedSlots: mode === '暂不自动补位' ? [] : accepted,
              rolePreferences: prefs, acceptCross: cross,
            })
            onClose()
          }}>加入候补队列</button>
      </div>
    </Modal>
  )
}

export function WaitlistCenterPage() {
  const st = useStore()
  useTicker()
  const [join, setJoin] = useState(false)
  // 演示环境展示全部候补；按当前玩家（会员）优先置顶
  const list = useMemo(() => [...st.waitlist].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)), [st.waitlist])

  return (
    <div>
      <div className="spread">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>📋 候补与自动补位</div>
          <div className="muted small">满场或「改期待补」场次有名额时，按公开优先级规则自动递补；你可随时改变自动补位策略与接受时段。</div>
        </div>
        <button className="btn primary" onClick={() => setJoin(true)}>＋ 登记候补</button>
      </div>

      {list.length === 0 && <div className="empty">还没有候补记录。</div>}
      <div className="stack">
        {list.map((w) => {
          const script = st.scripts.find((x) => x.id === w.scriptId)!
          const member = st.members.find((m) => m.id === w.memberId)
          const slots = script.startTime.split(' / ')
          const secs = remainSecs(w.respondDeadline)
          return (
            <div key={w.id} className="card">
              <div className="spread">
                <div className="row">
                  <h3 style={{ margin: 0 }}>《{script.name}》候补</h3>
                  <Badge tone={w.status === '补位成功' ? 'green' : w.status === '已邀约' ? 'amber' : w.status === '超时未响应' ? 'red' : 'blue'}>{w.status}</Badge>
                  {member && <Badge tone="gold">{member.level}</Badge>}
                  {w.prepaid && <Badge tone="green">已预付</Badge>}
                </div>
                <span className="small muted mono">登记 {w.joinedAt.slice(5, 16).replace('T', ' ')}</span>
              </div>
              <div className="grid cols-3" style={{ marginTop: 8 }}>
                <div className="small"><span className="muted">联系人：</span>{w.contactName} · {w.contactPhone}</div>
                <div className="small"><span className="muted">同行：</span>{w.partySize} 人（整组不拆分）</div>
                <div className="small"><span className="muted">门店：</span>{st.stores.find((x) => x.id === w.storeId)?.shortName}</div>
              </div>

              {w.status === '已邀约' && (
                <div className="notice warn" style={{ marginTop: 8 }}>
                  <div className="spread">
                    <b>🎟 收到补位邀约！{w.respondDeadline && <>剩余 <span className="price">{fmtCountdown(secs)}</span></>}</b>
                    <div className="row">
                      <button className="btn primary sm" onClick={() => st.respondWaitlist(w.id, true)}>接受补位</button>
                      <button className="btn sm danger" onClick={() => st.respondWaitlist(w.id, false)}>放弃本次</button>
                    </div>
                  </div>
                  <div className="small muted">超时未响应将按规则顺延下一位（你的候补记录保留）。</div>
                </div>
              )}
              {w.status === '补位成功' && w.promotedSessionId && (
                <div className="notice ok small" style={{ marginTop: 8 }}>✅ 已补位入场次 <b className="mono">{w.promotedSessionId}</b>，可在“我的拼场”查看。</div>
              )}

              <div className="row" style={{ marginTop: 8 }}>
                <span className="small muted">自动补位：</span>
                <select style={{ width: 170 }} value={w.autoMode}
                  onChange={(e) => st.setWaitlistMode(w.id, e.target.value as WaitlistAutoMode, e.target.value === '仅接受指定时段' ? (w.acceptedSlots.length ? w.acceptedSlots : [slots[0]]) : w.acceptedSlots)}>
                  <option>同意自动补位</option>
                  <option>仅接受指定时段</option>
                  <option>暂不自动补位</option>
                </select>
                <div className="tag-row">
                  {slots.map((s) => {
                    const on = w.acceptedSlots.includes(s)
                    return <button key={s} className={`btn sm ${on ? 'primary' : ''}`}
                      onClick={() => st.setWaitlistMode(w.id, w.autoMode === '暂不自动补位' ? '仅接受指定时段' : w.autoMode, on ? w.acceptedSlots.filter((x) => x !== s) : [...w.acceptedSlots, s])}>{s}</button>
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="section-title">🎫 我的权益（异常补偿 / 全额权益保留）</div>
      <VoucherList />
      {join && <JoinWaitlistModal onClose={() => setJoin(false)} />}
    </div>
  )
}

export function VoucherList() {
  const vouchers = useStore((s) => s.vouchers)
  if (!vouchers.length) return <div className="empty">暂无权益券。异常改期中若发生超时未响应、拒绝迁移退款或跨店补偿，会在此发放。</div>
  return (
    <div className="grid cols-3">
      {vouchers.map((v) => (
        <div key={v.id} className="card" style={{ borderColor: 'var(--gold)' }}>
          <div className="spread"><Badge tone="gold">{v.kind}</Badge>
            <Badge tone={v.status === '待使用' ? 'green' : v.status === '已锁定' ? 'amber' : 'blue'}>{v.status}</Badge></div>
          <div className="price" style={{ fontSize: 24, margin: '8px 0' }}>¥{v.amount}</div>
          <div className="small"><b>{v.playerName}</b> · {v.note}</div>
          <div className="small muted mono" style={{ marginTop: 6 }}>{v.id} · 发于 {v.issuedAt.slice(5, 16).replace('T', ' ')}</div>
        </div>
      ))}
    </div>
  )
}
