import { useMemo, useState } from 'react'
import { useStore, sessionPlayers, sessionRisk } from '../store'
import type { Session, Player, PropStatus, TicketType } from '../types'
import { scriptRoles } from '../seed'
import { Badge, Modal, PayBadge, SessionBadge } from '../ui'

const STEP: Session['status'][] = ['待成局', '已成局', '已签到', '角色已分', '道具已发', '进行中', '休息中', '已结账', '已复盘']
const endish = ['已结账', '已复盘', '已解散']

function StepsBar({ status }: { status: Session['status'] }) {
  const idx = STEP.indexOf(status)
  return (
    <div className="steps">
      {STEP.map((s, i) => (
        <span key={s} className={`step ${i < idx && status !== '已解散' ? 'done' : ''} ${i === idx ? 'cur' : ''}`}>
          {i + 1}.{s}
        </span>
      ))}
    </div>
  )
}

function RiskLine({ ss }: { ss: Session }) {
  const r = sessionRisk(ss)
  return (
    <div className="tag-row">
      <Badge tone={r.formed ? 'green' : 'red'}>{r.formed ? '✅ 人数成局' : '❌ 人数未成局'}</Badge>
      <Badge tone={r.hostReady ? 'green' : 'red'}>{r.hostReady ? '✅ 主持已派' : '❌ 主持空缺'}</Badge>
      <Badge tone={r.roomReady ? 'green' : 'red'}>{r.roomReady ? '✅ 房间已排' : '❌ 房间未排'}</Badge>
      <Badge tone={r.paidCount === r.total && r.total > 0 ? 'green' : 'amber'}>已支付 {r.paidCount}/{r.total}</Badge>
      {r.refundAtRisk > 0 && <Badge tone="red">退款风险敞口 ¥{r.refundAtRisk}</Badge>}
      {r.risks.filter((x) => !x.startsWith('人数') && x !== '无主持').map((x) => <Badge key={x} tone="red">⚠ {x}</Badge>)}
    </div>
  )
}

function PlayerTable({ ss }: { ss: Session }) {
  const st = useStore()
  const all = st.bookings.filter((b) => b.sessionId === ss.id).flatMap((b) => b.players)
  const roles = scriptRoles[ss.scriptId] ?? []
  const canEdit = ['待成局', '已成局', '已签到', '角色已分'].includes(ss.status)

  const hasOpenLate = (pid: string) =>
    st.tickets.some((t) => t.sessionId === ss.id && t.playerId === pid && t.type === '玩家迟到' && !['已解决', '已驳回'].includes(t.status))

  return (
    <div className="scroll-x">
      <table className="data">
        <thead><tr><th>玩家</th><th>偏好/反串</th><th>支付</th><th>签到</th><th>分配角色</th><th>前台操作</th></tr></thead>
        <tbody>
          {all.map((p) => (
            <PlayerRow key={p.id} ss={ss} p={p} roles={roles.map((r) => r.name)} canEdit={canEdit} hasOpenLate={hasOpenLate(p.id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerRow({ ss, p, roles, canEdit, hasOpenLate }: { ss: Session; p: Player; roles: string[]; canEdit: boolean; hasOpenLate: boolean }) {
  const st = useStore()
  const member = st.members.find((m) => m.id === p.memberId)
  return (
    <tr style={p.quit ? { opacity: 0.5 } : undefined}>
      <td>
        <b>{p.name}</b>{p.isBirthday && <Badge tone="gold">🎂 寿星</Badge>}{member && <Badge tone="gold">{member.level}</Badge>}
        {p.quit && <Badge tone="red">已退出</Badge>}
        <div className="small muted">{p.phone || '联系人代填'}</div>
      </td>
      <td className="small">{p.rolePreference} · {p.acceptCrossGender ? '接受反串' : '不接受反串'}</td>
      <td>
        {p.paid ? <PayBadge s={p.paidAmount > 0 ? '已支付' : '已退款'} /> : <PayBadge s="未支付" />}
        <div className="small price">¥{p.paidAmount}</div>
      </td>
      <td className="small">
        {p.checkedIn ? <Badge tone="green">已签到 {p.checkInAt?.slice(11, 16)}</Badge> : <Badge>未签到</Badge>}
        {p.late && <Badge tone="amber">迟到</Badge>}
      </td>
      <td>
        {canEdit && !p.quit ? (
          <select style={{ width: 130 }} value={p.assignedRole ?? ''} onChange={(e) => st.assignRole(ss.id, p.id, e.target.value)}>
            <option value="">未分配</option>
            {roles.map((r) => <option key={r} disabled={st.bookings.flatMap((b) => b.players).some((x) => x.assignedRole === r && x.id !== p.id)}>{r}</option>)}
          </select>
        ) : <span className="small">{p.assignedRole ?? '—'}</span>}
      </td>
      <td>
        <div className="row">
          {!p.checkedIn && !p.quit && canEdit && <button className="btn sm" onClick={() => st.checkInPlayer(ss.id, p.id)}>前台签到</button>}
          {canEdit && !p.quit && (
            <button className="btn sm" disabled={hasOpenLate} onClick={() => {
              st.markLate(ss.id, p.id, true)
              if (!hasOpenLate) st.raiseTicket({ sessionId: ss.id, playerId: p.id, type: '玩家迟到', title: `玩家「${p.name}」迟到`, detail: '前台标记迟到，电话确认预计到场时间；评估是否延后开场。', raisedBy: '前台' })
            }}>{p.late ? '已登记迟到' : '登记迟到'}</button>
          )}
          {!p.paid && !p.quit && canEdit && <button className="btn sm gold" onClick={() => st.payPlayer(ss.id, p.id)}>到店收款</button>}
          {canEdit && !p.quit && <button className="btn sm danger" onClick={() => {
            const note = prompt(`登记「${p.name}」临时退出原因（将自动生成退款工单，默认退 70%）：`, '突发情况无法到场')
            if (note !== null) st.quitPlayer(ss.id, p.id, note)
          }}>临时退出</button>}
        </div>
      </td>
    </tr>
  )
}

function PropPanel({ ss }: { ss: Session }) {
  const st = useStore()
  const [sel, setSel] = useState<Record<string, PropStatus>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const issued = ss.propIssues.length > 0
  const damageTicketExists = (propId: string) =>
    st.tickets.some((t) => t.sessionId === ss.id && t.type === '结账争议' && t.title.includes(propId))

  const reportReturn = (propId: string, name: string) => {
    const cond = sel[propId] ?? '正常'
    const dmgNote = notes[propId]
    st.returnProp(ss.id, propId, cond, dmgNote)
    if ((cond === '严重损耗' || cond === '丢失') && !damageTicketExists(propId)) {
      st.raiseTicket({
        sessionId: ss.id, type: '结账争议',
        title: `道具损坏/丢失：${name}（${propId}）`,
        detail: `回收验收为「${cond}」。${dmgNote || '无补充说明'}。建议从道具押金 ¥${st.scripts.find((x) => x.id === ss.scriptId)!.deposit} 中扣减。`,
        raisedBy: '前台', depositDeduct: cond === '丢失' ? 80 : 50,
      })
    }
  }

  if (!issued) {
    return (
      <div className="notice info">
        道具尚未发放。点击「发放道具并收押金」将按剧本配发道具包，并产生 <b className="price">¥{st.scripts.find((x) => x.id === ss.scriptId)!.deposit}</b> 押金收入流水。
        <div style={{ marginTop: 8 }}><button className="btn primary sm" onClick={() => st.issueProps(ss.id)}>📦 发放道具并收押金</button></div>
      </div>
    )
  }
  return (
    <div className="stack">
      {ss.propIssues.map((p) => (
        <div key={p.propId} className="row spread" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
          <div className="small"><b>{p.name}</b> {p.returned ? <Badge tone={p.condition === '正常' ? 'green' : 'red'}>已回收·{p.condition}</Badge> : <Badge tone="amber">使用中</Badge>}
            {p.damageNote && <span className="muted">（{p.damageNote}）</span>}</div>
          {!p.returned && (
            <div className="row">
              <select style={{ width: 110 }} value={sel[p.propId] ?? '正常'} onChange={(e) => setSel((s) => ({ ...s, [p.propId]: e.target.value as PropStatus }))}>
                {['正常', '轻微损耗', '严重损耗', '丢失'].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input style={{ width: 150 }} placeholder="损耗说明（可选）" value={notes[p.propId] ?? ''} onChange={(e) => setNotes((s) => ({ ...s, [p.propId]: e.target.value }))} />
              <button className="btn sm" onClick={() => reportReturn(p.propId, p.name)}>回收验收</button>
            </div>
          )}
        </div>
      ))}
      <div className="small muted">严重损耗/丢失会自动生成「扣押金」工单提交店长审批，纳入收退款记录与道具损耗复盘。</div>
    </div>
  )
}

function QuickTicketBar({ ss }: { ss: Session }) {
  const st = useStore()
  const raise = (type: TicketType, title: string, detail: string, extra?: { refundAmount?: number }) => {
    st.raiseTicket({ sessionId: ss.id, type, title, detail, raisedBy: '前台', ...extra })
  }
  return (
    <div className="tag-row">
      <button className="btn sm" onClick={() => raise('人数不足', '拼场人数不足，面临解散', '玩家迟到/退出导致低于成局线，需决定等待、补位或解散退款。')}>人数不足</button>
      <button className="btn sm" onClick={() => raise('主持请假', '主持人临时请假/无法到场', '需要店长调班：换主持、改期或解散退款。', { refundAmount: 0 })}>主持请假</button>
      <button className="btn sm" onClick={() => {
        const d = prompt('玩家要求换本的原因：', '觉得本太难/太恐怖，想换欢乐本')
        if (d !== null) raise('要求换本', '玩家要求换本', d, { refundAmount: 0 })
      }}>要求换本</button>
      <button className="btn sm danger" onClick={() => {
        const d = prompt('玩家不适情况（恐怖本安全机制：已亮灯暂停）：', '受惊吓身体不适，需要休息')
        if (d !== null) raise('中途不适', '玩家体验中途不适', `已使用安全机制暂停亮灯。${d}`, { refundAmount: 50 })
      }}>中途不适</button>
      <button className="btn sm danger" onClick={() => {
        const d = prompt('结账争议描述：', '玩家认为时长不足/体验不好，要求退款')
        if (d !== null) raise('结账争议', '结账环节发生争议', d, { refundAmount: 80 })
      }}>结账争议</button>
    </div>
  )
}

function SessionDetail({ ss, onClose }: { ss: Session; onClose: () => void }) {
  const st = useStore()
  const live = st.sessions.find((x) => x.id === ss.id)!
  const script = st.scripts.find((x) => x.id === live.scriptId)!
  const host = st.hosts.find((h) => h.id === live.hostId)
  const room = st.rooms.find((r) => r.id === live.roomId)
  const players = sessionPlayers(live.id)
  const checked = players.filter((p) => p.checkedIn).length
  const assigned = players.filter((p) => p.assignedRole).length
  const unpaid = players.filter((p) => !p.paid)
  const propsBack = live.propIssues.filter((p) => p.returned).length
  const [interrupt, setInterrupt] = useState(live.hostInterruptNote ?? '')
  const tickets = st.tickets.filter((t) => t.sessionId === live.id)

  const canCheckout = unpaid.length === 0 && propsBack === live.propIssues.length
  const nextLabel: Partial<Record<Session['status'], string>> = {
    已成局: '确认进入签到环节',
    已签到: '完成签到，进入分角',
    角色已分: '进入道具发放',
    道具已发: '主持开场，体验开始',
    休息中: '休息结束，继续开本',
    进行中: '体验结束，去结账',
    已结账: '查看复盘',
  }

  return (
    <Modal wide onClose={onClose} title={
      <div className="row">《{script.name}》 <Badge tone="purple">{live.mode}</Badge> <SessionBadge s={live.status} /> <span className="muted small mono">{live.startAt.replace('T', ' ')}</span></div>
    }>
      <StepsBar status={live.status} />
      <div style={{ margin: '10px 0' }}><RiskLine ss={live} /></div>

      <div className="grid cols-3" style={{ gap: 8 }}>
        <div className="notice" style={{ fontSize: 12 }}><b>房间</b><br />{room ? `${room.name}（${room.capacity}人${room.horrorSet ? '·恐怖实景' : ''}）` : '未安排'}</div>
        <div className="notice" style={{ fontSize: 12 }}><b>主持</b><br />{host ? `${host.name} · ${host.level} · 熟练度 ${host.proficiency[live.scriptId] ?? 0}/5 · 均分 ${host.reviewScore}` : '⚠ 空缺（见调班工单）'}</div>
        <div className="notice" style={{ fontSize: 12 }}><b>签到/角色</b><br />签到 {checked}/{players.length} · 角色 {assigned}/{players.length}</div>
      </div>

      <div className="section-title">👥 玩家确认与前台签到 / 角色分配</div>
      <PlayerTable ss={live} />

      {live.status === '已成局' && players.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary sm" disabled={checked !== players.length} onClick={() => st.setSessionStatus(live.id, '已签到')}>
            {checked === players.length ? '全员已签到，进入角色分配' : `等待全员签到（${checked}/${players.length}）`}
          </button>
          <span className="small muted">未支付/迟到玩家可先在表内处理；签到时自动校验。</span>
        </div>
      )}
      {live.status === '已签到' && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary sm" onClick={() => st.autoAssignRoles(live.id)}>🎭 按偏好一键分配角色</button>
          <button className="btn sm" disabled={assigned !== players.length} onClick={() => st.setSessionStatus(live.id, '角色已分')}>
            {assigned === players.length ? '角色分完，进入道具发放' : `请先分配全部角色（${assigned}/${players.length}）`}
          </button>
        </div>
      )}

      <div className="section-title">📦 道具发放 / 押金 / 回收验收</div>
      <PropPanel ss={live} />

      <div className="section-title">🎤 主持开场与中途状态</div>
      <div className="stack">
        <div className="row">
          {(['待成局', '已成局', '已签到', '角色已分'].includes(live.status)) && (
            <button className="btn primary sm" disabled={live.status !== '道具已发'} onClick={() => st.setSessionStatus(live.id, '进行中')}>
              {live.status === '道具已发' ? '▶ 主持开场（状态→进行中）' : '先发放道具再开场'}
            </button>
          )}
          {(live.status === '进行中' || live.status === '休息中') && (
            <>
              <button className="btn sm" onClick={() => st.toggleBreak(live.id)}>{live.status === '进行中' ? '⏸ 中途休息（暂停）' : '▶ 休息结束继续'}</button>
              <input style={{ width: 320 }} placeholder="主持中断记录（设备故障/情绪安抚/规则争议…）" value={interrupt} onChange={(e) => setInterrupt(e.target.value)} />
              <button className="btn sm" onClick={() => { st.noteHostInterrupt(live.id, interrupt); alert('已记录主持中断，客服时间线可查') }}>保存中断记录</button>
            </>
          )}
        </div>
        {live.hostInterruptNote && <div className="notice warn" style={{ fontSize: 12 }}>最近中断记录：{live.hostInterruptNote}</div>}
        <QuickTicketBar ss={live} />
      </div>

      <div className="section-title">🧾 异常工单（归本场）</div>
      {tickets.length === 0 ? <div className="small muted">暂无异常工单。</div> : (
        <div className="stack">
          {tickets.map((t) => (
            <div key={t.id} className="notice" style={{ fontSize: 12 }}>
              <div className="spread"><b>[{t.type}] {t.title}</b>
                <Badge tone={t.status === '待店长审批' ? 'red' : t.status === '已解决' ? 'green' : 'amber'}>{t.status}</Badge></div>
              <div className="muted">{t.detail}</div>
              {(t.refundAmount || t.depositDeduct) && <div className="small">涉及金额：退款 ¥{t.refundAmount ?? 0} / 扣押金 ¥{t.depositDeduct ?? 0}{t.resolution ? ` → ${t.resolution}` : ''}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="section-title">💴 结账与解散</div>
      <div className="row">
        <button className="btn gold" disabled={!['进行中', '休息中'].includes(live.status) || !canCheckout} onClick={() => st.checkoutSession(live.id)}>
          结账（退剩余押金{ss.depositCharged > 0 ? `，已扣损耗 ¥${live.depositCharged}` : ''}，状态→已结账）
        </button>
        <button className="btn danger" disabled={endish.includes(live.status)} onClick={() => {
          const reason = prompt('解散原因（将触发已支付玩家全额退款并释放房间/主持档期）：', '拼场人数不足，玩家同意改期')
          if (reason) st.disbandSession(live.id, reason)
        }}>解散场次并全额退款</button>
        {!canCheckout && ['进行中', '休息中'].includes(live.status) && <span className="small muted">结账前请完成：{unpaid.length > 0 && `收款（${unpaid.map((p) => p.name).join('、')}）`}{live.propIssues.length > 0 && propsBack < live.propIssues.length && ' · 道具全部回收'}</span>}
      </div>

      {nextLabel[live.status] && <div className="small muted" style={{ marginTop: 6 }}>流程提示：{nextLabel[live.status]}</div>}
    </Modal>
  )
}

export function SessionsPage({ focusId, onConsumedFocus, hostOnly }: { focusId?: string; onConsumedFocus?: () => void; hostOnly?: boolean }) {
  const st = useStore()
  const [open, setOpen] = useState<string | undefined>(focusId)
  const [date, setDate] = useState('2026-09-23')
  const [hostFilter, setHostFilter] = useState(st.hosts[0]?.id ?? '')
  const [statusFilter, setStatusFilter] = useState<string>('全部')

  const list = useMemo(() => st.sessions
    .filter((s) => s.date === date || date === '')
    .filter((s) => (hostOnly ? s.hostId === hostFilter : true))
    .filter((s) => (statusFilter === '全部' ? true : s.status === statusFilter))
    .sort((a, b) => a.startAt.localeCompare(b.startAt)), [st.sessions, date, hostOnly, hostFilter, statusFilter])

  const opened = open ? st.sessions.find((s) => s.id === open) : undefined
  return (
    <div>
      <div className="spread">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>🎬 场次推进{hostOnly ? '（主持视图）' : ''}</div>
          <div className="muted small">前台签到 → 角色分配 → 道具发放/押金 → 主持开场 → 中途休息 → 结账复盘；迟到、退出、换本、不适、争议全部归到场次工单。</div>
        </div>
        <div className="row">
          {hostOnly && <select style={{ width: 150 }} value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>{st.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}
          <input type="date" style={{ width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} />
          <select style={{ width: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {['全部', '待成局', '已成局', '已签到', '角色已分', '道具已发', '进行中', '休息中', '已结账', '已复盘', '已解散'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>

      {list.length === 0 && <div className="empty">当日无场次，可去「排班成局台」生成。</div>}
      <div className="stack">
        {list.map((ss) => {
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const host = st.hosts.find((h) => h.id === ss.hostId)
          const room = st.rooms.find((r) => r.id === ss.roomId)
          const players = sessionPlayers(ss.id)
          const risk = sessionRisk(ss)
          const openTickets = risk.openTickets.length
          return (
            <div key={ss.id} className="card clickable" onClick={() => setOpen(ss.id)}>
              <div className="spread">
                <div className="row">
                  <b>《{script.name}》</b>
                  <Badge tone="purple">{ss.mode}</Badge>
                  <SessionBadge s={ss.status} />
                  <span className="small muted mono">{ss.startKey}</span>
                </div>
                <div className="row">
                  <Badge tone={risk.formed ? 'green' : 'red'}>{players.length} 人{risk.formed ? '·成局' : `·缺${script.minPlayers - players.length}`}</Badge>
                  <Badge tone={(host?.proficiency[ss.scriptId] ?? 0) >= 3 ? 'green' : 'amber'}>主持 {host?.name ?? '空缺'} {(host?.proficiency[ss.scriptId] ?? 0)}/5</Badge>
                  <Badge tone="blue">{room?.name ?? '未排房'}</Badge>
                  <Badge tone={risk.paidCount === risk.total && risk.total > 0 ? 'green' : 'amber'}>付 {risk.paidCount}/{risk.total}</Badge>
                  {openTickets > 0 && <Badge tone="red">⚠ 工单 {openTickets}</Badge>}
                  {risk.refundAtRisk > 0 && <Badge tone="red">退款敞口 ¥{risk.refundAtRisk}</Badge>}
                </div>
              </div>
              <div style={{ marginTop: 6 }}><StepsBar status={ss.status} /></div>
            </div>
          )
        })}
      </div>

      {opened && <SessionDetail ss={opened} onClose={() => { setOpen(undefined); onConsumedFocus?.() }} />}
    </div>
  )
}
