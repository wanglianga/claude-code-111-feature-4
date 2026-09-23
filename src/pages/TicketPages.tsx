import { useMemo, useState } from 'react'
import { useStore, sessionPlayers, sessionRisk } from '../store'
import type { Ticket, TicketType } from '../types'
import { Badge, Modal, SessionBadge, TicketBadge } from '../ui'

const TYPE_TONE: Record<TicketType, 'red' | 'amber' | 'blue' | 'purple' | 'gold'> = {
  玩家迟到: 'amber',
  人数不足: 'red',
  临时退出: 'amber',
  主持请假: 'purple',
  要求换本: 'blue',
  中途不适: 'red',
  结账争议: 'red',
  退款申请: 'gold',
}

/** 客服串联：把签到、角色、主持中断、道具问题汇总到一张档案 */
function SessionTrace({ sessionId }: { sessionId: string }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === sessionId)
  if (!ss) return <div className="small muted">场次已不存在。</div>
  const script = st.scripts.find((x) => x.id === ss.scriptId)!
  const host = st.hosts.find((h) => h.id === ss.hostId)
  const players = sessionPlayers(ss.id)
  const badProps = ss.propIssues.filter((p) => p.condition === '严重损耗' || p.condition === '丢失' || p.condition === '轻微损耗')
  const risk = sessionRisk(ss)
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="notice info" style={{ fontSize: 12 }}>
        <div className="spread"><b>关联场次：《{script.name}》{ss.startKey} · {ss.mode}</b><SessionBadge s={ss.status} /></div>
        <div>房间：{st.rooms.find((r) => r.id === ss.roomId)?.name ?? '未排'} · 主持：{host?.name ?? '空缺'}（熟练度 {host?.proficiency[ss.scriptId] ?? 0}/5）· 成局：{risk.formed ? '是' : '否'} · 退款敞口 ¥{risk.refundAtRisk}</div>
      </div>
      <div className="small">
        <b>签到/角色链：</b>
        {players.map((p) => (
          <span key={p.id} className="badge" style={{ margin: 2 }}>
            {p.name} · {p.checkedIn ? `已签到${p.late ? '(迟到)' : ''}` : '未签到'} · {p.assignedRole ?? '未分角'} · {p.paid ? `付¥${p.paidAmount}` : '未付'}
          </span>
        ))}
      </div>
      {ss.hostInterruptNote && <div className="notice warn" style={{ fontSize: 12 }}>🎤 主持中断记录：{ss.hostInterruptNote}</div>}
      {badProps.length > 0 && (
        <div className="notice warn" style={{ fontSize: 12 }}>📦 道具问题：
          {badProps.map((p) => `${p.name}(${p.condition}${p.damageNote ? `:${p.damageNote}` : ''})`).join('；')}
        </div>
      )}
      <div className="small muted">客服可依据上述完整链路（签到→角色→主持中断→道具→支付）判断责任并给出处理方案。</div>
    </div>
  )
}

function TicketDetail({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const st = useStore()
  const live = st.tickets.find((x) => x.id === t.id)!
  const role = st.currentRole
  const [action, setAction] = useState('')
  const [refund, setRefund] = useState(live.refundAmount ?? 0)
  const [deduct, setDeduct] = useState(live.depositDeduct ?? 0)
  const [resolution, setResolution] = useState('')
  const actorName = { player: '玩家', frontdesk: '前台-小周', host: '主持', manager: '店长-老K', service: '客服-小暖' }[role]

  const canHandle = role === 'service' || role === 'frontdesk'
  const canApprove = role === 'manager'
  return (
    <Modal wide onClose={onClose} title={<div className="row">[{live.type}] {live.title} <TicketBadge s={live.status} /></div>}>
      <div className="grid cols-2">
        <div>
          <div className="notice" style={{ fontSize: 13, marginBottom: 10 }}>{live.detail}</div>
          <dl className="kv">
            <dt>提交人</dt><dd>{live.raisedBy}</dd>
            <dt>提交时间</dt><dd className="mono">{live.raisedAt.replace('T', ' ')}</dd>
            <dt>处理人</dt><dd>{live.handler ?? '未分配'}</dd>
            {live.resolution && <><dt>处理结果</dt><dd>{live.resolution}</dd></>}
          </dl>

          {(live.refundAmount || live.depositDeduct) ? (
            <div className="card" style={{ boxShadow: 'none', marginTop: 10 }}>
              <div className="strong small">涉及收退款（审批后自动写入场次流水）</div>
              <div className="grid cols-2" style={{ marginTop: 6 }}>
                <label className="field" style={{ margin: 0 }}><span>退款/补偿金额 ¥</span>
                  <input type="number" disabled={!canApprove || live.status === '已解决'} value={refund} onChange={(e) => setRefund(Number(e.target.value))} />
                </label>
                <label className="field" style={{ margin: 0 }}><span>扣道具押金 ¥</span>
                  <input type="number" disabled={!canApprove || live.status === '已解决'} value={deduct} onChange={(e) => setDeduct(Number(e.target.value))} />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          {live.sessionId ? <SessionTrace sessionId={live.sessionId} /> : <div className="notice" style={{ fontSize: 12 }}>该工单未关联具体场次（预约阶段）。</div>}

          <div className="section-title">📜 处理时间线（玩家确认 / 签到 / 排班 / 审批 / 收退款全留痕）</div>
          <ul className="timeline">
            {live.timeline.map((x, i) => (
              <li key={i}>
                <div className="t-at mono">{x.at.replace('T', ' ')}</div>
                <span className="t-actor">{x.actor}</span>{x.action}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {live.status !== '已解决' && live.status !== '已驳回' && (
        <div className="card" style={{ boxShadow: 'none', marginTop: 12 }}>
          <div className="grid cols-2">
            <textarea rows={2} placeholder="处理记录 / 与玩家确认内容（如：已电话沟通、玩家接受改签…）" value={action} onChange={(e) => setAction(e.target.value)} />
            <textarea rows={2} placeholder="店长审批意见 / 最终处理结果" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {canHandle && <>
              <button className="btn sm" onClick={() => st.progressTicket(live.id, `客服/前台跟进：${action || '已联系玩家，持续跟进'}`, actorName, { status: '处理中' })}>登记跟进（处理中）</button>
              <button className="btn sm" onClick={() => st.progressTicket(live.id, `玩家已确认方案：${action || '无补充'}，提交店长审批`, actorName, { status: '待店长审批' })}>玩家确认，提交店长审批</button>
            </>}
            {canApprove && <>
              <button className="btn primary sm" disabled={!resolution} onClick={() =>
                st.progressTicket(live.id, `店长核定金额：退款 ¥${refund} / 扣押金 ¥${deduct}；${resolution}`, actorName,
                  { refundAmount: refund || undefined, depositDeduct: deduct || undefined })
              }>1. 核定金额并留痕</button>
              <button className="btn gold sm" disabled={!resolution} onClick={() => st.approveTicket(live.id, actorName, resolution)}>
                2. 审批通过（执行收退款）
              </button>
              <button className="btn danger sm" onClick={() => { const r = resolution || prompt('驳回原因：'); if (r) st.rejectTicket(live.id, actorName, r) }}>驳回</button>
            </>}
            {role === 'host' && <button className="btn sm" onClick={() => st.progressTicket(live.id, `主持补充：${action || '已协助处理'}`, actorName, { status: '处理中' })}>主持补充说明</button>}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>审批通过后：退款/补偿写入「收退款」流水并关联场次；扣押金同步道具损耗；时间线完整保留，客服与店长可随时回看。</div>
        </div>
      )}
    </Modal>
  )
}

export function TicketCenterPage({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const st = useStore()
  const [filter, setFilter] = useState<'待处理' | '处理中' | '待店长审批' | '全部'>('待店长审批')
  const [open, setOpen] = useState<string>()
  const list = useMemo(() => st.tickets.filter((t) => filter === '全部' ? true : t.status === filter), [st.tickets, filter])
  const counts = {
    待店长审批: st.tickets.filter((t) => t.status === '待店长审批').length,
    待处理: st.tickets.filter((t) => t.status === '待处理').length,
    处理中: st.tickets.filter((t) => t.status === '处理中').length,
    已解决: st.tickets.filter((t) => t.status === '已解决').length,
  }

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>🛎 异常工单中心（客服串联 · 店长审批 · 收退款归场次）</div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        覆盖：玩家迟到、拼场人数不足、临时退出、主持请假、玩家要求换本、中途不适、结账争议。处理链路：玩家确认 → 前台/客服跟进 → 店长审批 → 收退款自动归入场次。
      </div>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="v" style={{ color: 'var(--red)' }}>{counts.待店长审批}</div><div className="l">待店长审批（含退款/扣押金）</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--amber)' }}>{counts.待处理}</div><div className="l">待处理</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--blue)' }}>{counts.处理中}</div><div className="l">处理中</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--green)' }}>{counts.已解决}</div><div className="l">本周已解决</div></div>
      </div>
      <div className="tag-row" style={{ marginBottom: 10 }}>
        {(['待店长审批', '待处理', '处理中', '全部'] as const).map((f) =>
          <button key={f} className={`btn sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>

      {list.length === 0 && <div className="empty">当前筛选下没有工单。</div>}
      <div className="stack">
        {list.map((t) => {
          const ss = t.sessionId ? st.sessions.find((x) => x.id === t.sessionId) : undefined
          const script = ss ? st.scripts.find((x) => x.id === ss.scriptId) : undefined
          return (
            <div key={t.id} className="card clickable" onClick={() => setOpen(t.id)}>
              <div className="spread">
                <div className="row">
                  <Badge tone={TYPE_TONE[t.type]}>{t.type}</Badge>
                  <b>{t.title}</b>
                  <TicketBadge s={t.status} />
                </div>
                <div className="row">
                  {(t.refundAmount || t.depositDeduct) && <Badge tone="gold">退 ¥{t.refundAmount ?? 0} / 扣押 ¥{t.depositDeduct ?? 0}</Badge>}
                  {script && <Badge tone="purple">《{script.name}》{ss?.startKey}</Badge>}
                  <span className="small muted mono">{t.raisedAt.slice(5, 16).replace('T', ' ')}</span>
                </div>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{t.detail}</div>
              {ss && onOpenSession && <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); onOpenSession(ss.id) }}>↗ 打开场次档案</button>}
            </div>
          )
        })}
      </div>
      {open && <TicketDetail t={st.tickets.find((x) => x.id === open)!} onClose={() => setOpen(undefined)} />}
    </div>
  )
}
