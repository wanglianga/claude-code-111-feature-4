import { useMemo, useState } from 'react'
import { useStore, memberDiscount, waitlistRanking } from '../store'
import type { Script, Booking, Player, ReschedulePlan } from '../types'
import { Badge, Modal, Stars, useNow } from '../ui'
import { countdownText } from '../domain'

const horrorTone = (h: Script['horror']): 'green' | 'amber' | 'red' | 'purple' =>
  h === '不恐怖' ? 'green' : h === '微恐' ? 'amber' : h === '中恐' ? 'red' : 'purple'
const diffTone = (d: Script['difficulty']): 'green' | 'blue' | 'amber' | 'red' =>
  d === '新手友好' ? 'green' : d === '入门' ? 'blue' : d === '进阶' ? 'amber' : 'red'

function ScriptCard({ s, onBook }: { s: Script; onBook: () => void }) {
  return (
    <div className="card clickable" onClick={onBook}>
      <div className="spread">
        <h3>《{s.name}》</h3>
        <span className="price">¥{s.price}<span className="muted small">/人</span></span>
      </div>
      <div className="tag-row" style={{ marginBottom: 8 }}>
        <Badge tone="purple">{s.genre}</Badge>
        <Badge tone={horrorTone(s.horror)}>恐怖：{s.horror}</Badge>
        <Badge tone={diffTone(s.difficulty)}>推理：{s.difficulty}</Badge>
        {s.beginnerFriendly ? <Badge tone="green">新手友好</Badge> : <Badge>需经验</Badge>}
        {s.horror !== '不恐怖' && <Badge tone="red">⚠ 安全提示</Badge>}
      </div>
      <div className="kv">
        <dt>人数</dt><dd>{s.minPlayers}-{s.maxPlayers} 人成局</dd>
        <dt>时长</dt><dd>{s.durationMin} 分钟（{Math.round(s.durationMin / 60 * 10) / 10}h）</dd>
        <dt>角色性别</dt><dd>{s.genderAdvice}</dd>
        <dt>开场时间</dt><dd>每日 {s.startTime}</dd>
        <dt>道具押金</dt><dd className="price">¥{s.deposit}</dd>
      </div>
      <hr className="hr-soft" />
      <div className="muted small">{s.desc}</div>
      <div className="muted small" style={{ marginTop: 6 }}>💰 退款：{s.refundRule.slice(0, 26)}…</div>
    </div>
  )
}

function BookingModal({ script, onClose }: { script: Script; onClose: () => void }) {
  const { members, submitBooking, currentMemberId, setRole } = useStore()
  const [mode, setMode] = useState<Booking['mode']>('拼场')
  const [count, setCount] = useState(script.minPlayers)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startKey, setStartKey] = useState(script.startTime.split(' / ')[0])
  const [contactName, setContactName] = useState(currentMemberId ? members.find((m) => m.id === currentMemberId)?.name ?? '' : '')
  const [phone, setPhone] = useState(currentMemberId ? members.find((m) => m.id === currentMemberId)?.phone ?? '' : '')
  const [memberId, setMemberId] = useState(currentMemberId ?? '')
  const [note, setNote] = useState(mode === '生日局' ? '生日局，请协助布置 & 预留合影时间' : '')
  const [prefs, setPrefs] = useState<string[]>(Array(count).fill('随意'))
  const [cross, setCross] = useState<boolean[]>(Array(count).fill(true))
  const [genders, setGenders] = useState<Player['gender'][]>(Array(count).fill('不便透露'))
  const [safety, setSafety] = useState(false)
  const [payMethod, setPayMethod] = useState<Booking['payMethod']>('在线预付')
  const [done, setDone] = useState<string | null>(null)

  const member = members.find((m) => m.id === memberId)
  const price = Math.round(script.price * memberDiscount(member?.level))
  const slots = script.startTime.split(' / ')
  const isHorror = script.horror !== '不恐怖'
  const canSubmit = contactName.trim() && /^1\d{10}$/.test(phone) && (!isHorror || safety) &&
    count >= (mode === '包场' ? script.minPlayers : 1) && count <= script.maxPlayers

  const setN = (n: number) => {
    setCount(n)
    setPrefs((p) => Array.from({ length: n }, (_, i) => p[i] ?? '随意'))
    setCross((p) => Array.from({ length: n }, (_, i) => p[i] ?? true))
    setGenders((p) => Array.from({ length: n }, (_, i) => p[i] ?? '不便透露'))
  }

  if (done) {
    return (
      <Modal title="✅ 预约已提交，等待拼场成局" onClose={onClose}
        footer={<><button className="btn" onClick={onClose}>继续逛本</button><button className="btn primary" onClick={() => { onClose(); window.dispatchEvent(new Event('nav:my-bookings')) }}>查看我的拼场</button></>}>
        <div className="stack">
          <div className="notice ok">预约单号 <b className="mono">{done}</b> 已进入《{script.name}》{date} {startKey} 的拼场池。</div>
          <div className="muted small">
            · 拼场达到 {script.minPlayers}-{script.maxPlayers} 人后，门店将结合房间与主持档期自动生成场次；<br />
            · 退款规则：{script.refundRule}<br />
            · 到店后前台签到、角色分配、道具发放（押金 ¥{script.deposit}）、主持开场。
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal wide title={<>预约《{script.name}》 <Badge tone={horrorTone(script.horror)}>{script.horror}</Badge> <Badge tone={diffTone(script.difficulty)}>{script.difficulty}</Badge></>} onClose={onClose}>
      <div className="grid cols-2">
        <div>
          <div className="kv" style={{ marginBottom: 10 }}>
            <dt>成局人数</dt><dd>{script.minPlayers}-{script.maxPlayers} 人</dd>
            <dt>时长</dt><dd>{script.durationMin} 分钟</dd>
            <dt>性别建议</dt><dd>{script.genderAdvice}</dd>
            <dt>新手</dt><dd>{script.beginnerFriendly ? '适合新手' : '建议有经验'}</dd>
            <dt>开场时间</dt><dd>{script.startTime}</dd>
            <dt>退款规则</dt><dd>{script.refundRule}</dd>
          </div>
          {script.safetyNote && <div className="safety-box" style={{ marginBottom: 10 }}>🩸 {script.safetyNote}</div>}

          <label className="field"><span>局类型（支持会员拼场 / 包场 / 生日局）</span>
            <div className="switch-pill">
              {(['拼场', '包场', '生日局'] as const).map((m) => (
                <button key={m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); if (m === '包场' && count < script.minPlayers) setN(script.minPlayers); if (m === '生日局' && !note) setNote('生日局，请协助布置 & 预留合影时间') }}>
                  {m === '拼场' ? '🧩 会员拼场' : m === '包场' ? '👑 包场' : '🎂 生日局'}
                </button>
              ))}
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {mode === '拼场' && '与其他玩家拼场，未满员时持续招募；未成局自动全额退款。会员享折扣。'}
              {mode === '包场' && `整间包场不拼陌生人，至少 ${script.minPlayers} 人，预付 50% 定金。`}
              {mode === '生日局' && '寿星免单/赠甜品合影（演示：按会员折扣计），安排情感向主持。'}
            </div>
          </label>

          <div className="grid cols-2">
            <label className="field"><span>到场人数</span>
              <input type="number" min={mode === '包场' ? script.minPlayers : 1} max={script.maxPlayers} value={count}
                onChange={(e) => setN(Math.max(1, Math.min(script.maxPlayers, Number(e.target.value) || 1)))} />
            </label>
            <label className="field"><span>会员</span>
              <select value={memberId} onChange={(e) => { setMemberId(e.target.value); const m = members.find((x) => x.id === e.target.value); if (m) { setContactName(m.name); setPhone(m.phone) } }}>
                <option value="">非会员（原价）</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.level}（到店 {m.visits} 次）</option>)}
              </select>
            </label>
            <label className="field"><span>日期</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field"><span>开场时间</span>
              <select value={startKey} onChange={(e) => setStartKey(e.target.value)}>{slots.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="field"><span>联系人</span><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="姓名" /></label>
            <label className="field"><span>联系方式（手机号）</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 位手机号" maxLength={11} /></label>
          </div>
          <label className="field"><span>备注（角色倾向/忌口/恐怖承受度等）</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>

          {isHorror && (
            <label className="checkbox" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} />
              <span>我已阅读并知晓恐怖本安全提示，知晓安全词「开灯」，确认同行人均无禁忌病症。</span>
            </label>
          )}
          <label className="field"><span>支付方式</span>
            <div className="switch-pill">
              <button className={payMethod === '在线预付' ? 'active' : ''} onClick={() => setPayMethod('在线预付')}>在线预付（优先成局）</button>
              <button className={payMethod === '到店付' ? 'active' : ''} onClick={() => setPayMethod('到店付')}>到店付</button>
            </div>
          </label>
        </div>

        <div>
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="strong" style={{ marginBottom: 8 }}>每位玩家信息（角色偏好 / 反串）</div>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} style={{ borderTop: '1px dashed var(--line)', padding: '8px 0' }}>
                <div className="small strong">{i === 0 ? `联系人本人：${contactName || '—'}` : `同伴 ${i + 1}`}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  <select style={{ width: 90 }} value={genders[i]} onChange={(e) => setGenders((p) => p.map((x, j) => (j === i ? e.target.value as Player['gender'] : x)))}>
                    {['女', '男', '不便透露'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <select style={{ width: 130 }} value={prefs[i]} onChange={(e) => setPrefs((p) => p.map((x, j) => (j === i ? e.target.value : x)))}>
                    {['随意', 'C位', '推理位', '情感位', '氛围位', '欢乐位'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <label className="checkbox" style={{ fontSize: 12 }}>
                    <input type="checkbox" checked={cross[i]} onChange={(e) => setCross((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
                    接受反串
                  </label>
                </div>
              </div>
            ))}
            <hr className="hr-soft" />
            <div className="spread"><span>单价（{member ? member.level + ' 折扣' : '原价'}）</span><span className="price">¥{price}</span></div>
            <div className="spread"><span>人数合计</span><span>× {count}</span></div>
            <div className="spread"><span>道具押金（到店收，无损退还）</span><span className="price">¥{script.deposit}</span></div>
            <hr className="hr-soft" />
            <div className="spread strong"><span>报名合计</span><span className="price" style={{ fontSize: 18 }}>¥{price * count}</span></div>
            {!canSubmit && <div className="notice warn" style={{ marginTop: 8, fontSize: 12 }}>请填写正确的 11 位手机号{isHorror ? '、勾选安全提示确认' : ''}。</div>}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" disabled={!canSubmit} onClick={() => {
          const id = submitBooking({
            scriptId: script.id, mode, playersCount: count, contactName, contactPhone: phone,
            memberId: memberId || undefined, note, expectedStart: `${date}T${startKey}`,
            rolePreferences: prefs, acceptCross: cross, genders, acknowledgedSafety: safety, payMethod,
          })
          setDone(id)
        }}>确认提交预约</button>
      </div>
    </Modal>
  )
}

export function PlayerLibraryPage() {
  const scripts = useStore((s) => s.scripts)
  const [filter, setFilter] = useState('全部')
  const [booking, setBooking] = useState<Script | null>(null)
  const genres = useMemo(() => ['全部', ...Array.from(new Set(scripts.map((s) => s.genre)))], [scripts])
  const list = filter === '全部' ? scripts : scripts.filter((s) => s.genre === filter)
  return (
    <div>
      <div className="spread">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>🎬 剧本大厅</div>
          <div className="muted small">选择剧本可查看人数、时长、恐怖程度、推理难度、角色性别建议、新手适配、开场时间与退款规则，并直接发起拼场 / 包场 / 生日局预约。</div>
        </div>
        <div className="tag-row">{genres.map((g) => <button key={g} className={`btn sm ${g === filter ? 'primary' : ''}`} onClick={() => setFilter(g)}>{g}</button>)}</div>
      </div>
      <div className="grid cols-3" style={{ marginTop: 12 }}>
        {list.map((s) => <ScriptCard key={s.id} s={s} onBook={() => setBooking(s)} />)}
      </div>
      {booking && <BookingModal script={booking} onClose={() => setBooking(null)} />}
    </div>
  )
}

const PLAN_RESP_LABEL: Record<string, { tone: 'amber' | 'green' | 'blue' | 'red'; text: string }> = {
  待确认: { tone: 'amber', text: '待你确认' },
  已接受: { tone: 'green', text: '已接受' },
  仅指定时段: { tone: 'blue', text: '仅接受指定时段' },
  已拒绝: { tone: 'red', text: '已拒绝（按策略退款/保留权益）' },
  超时未响应: { tone: 'red', text: '超时未响应（按策略处理）' },
}

/** 玩家端：改期方案卡（实时倒计时、权益变化、失败原因、响应按钮） */
function PlayerPlanCard({ plan, disruptionSessionId }: { plan: ReschedulePlan; disruptionSessionId: string }) {
  const st = useStore()
  const nowMs = useNow()
  const ss = st.sessions.find((x) => x.id === disruptionSessionId)!
  const script = st.scripts.find((x) => x.id === ss.scriptId)!
  const store = plan.storeId ? st.stores.find((x) => x.id === plan.storeId) : undefined
  const room = plan.roomId ? st.rooms.find((x) => x.id === plan.roomId) : undefined
  const host = plan.hostId ? st.hosts.find((h) => h.id === plan.hostId) : undefined
  const cd = plan.confirmDeadline ? countdownText(plan.confirmDeadline, nowMs) : null
  const slots = script.startTime.split(' / ')
  const [slotPick, setSlotPick] = useState(slots[slots.length - 1])
  const allPlayersById = new Map(st.bookings.flatMap((b) => b.players).map((p) => [p.id, p]))
  const players = Object.keys(plan.responses).map((pid) => allPlayersById.get(pid)).filter(Boolean) as Player[]
  const rolledBack = plan.status === '执行失败已回滚'
  const done = ['已确认执行', '已执行'].includes(plan.status)

  return (
    <div className={`notice ${rolledBack ? 'warn' : done ? 'ok' : 'info'}`} style={{ marginTop: 10 }}>
      <div className="spread">
        <div className="row">
          <b>🚨 门店通知：本场安排需要调整 —— 【{plan.kind}】</b>
          {plan.kind === '同日换场' || plan.kind === '跨店迁移' ? <span className="strong">{plan.startAt.replace('T', ' ')}</span> : null}
          {store && <Badge tone="purple">{store.name}</Badge>}
        </div>
        {cd && plan.status === '已发布' && <Badge tone={cd.overdue ? 'red' : 'amber'}>⏳ 确认倒计时 {cd.text}</Badge>}
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        {plan.kind === '同日换场' || plan.kind === '跨店迁移'
          ? <>新安排：{store?.name} · {room?.name}（{room?.capacity}人） · 主持 {host?.name}（该本熟练度 {host ? host.proficiency[script.id] ?? 0 : 0}/5） · 原已付费用<b className="price">随席位平移，不会二次扣款</b>；同行的朋友会作为整组一起迁移，不会被拆散。</>
          : plan.kind === '全额退款'
            ? <>门店原因无法安排：已付报名费将<b className="amt-neg">全额原路退回</b>（不受常规退款时限限制），系统逐笔记账，不会重复退款。</>
            : <>已付费用将<b className="price">以权益形式保留</b>，你进入候补补位队列；补位成功自动核销抵扣，7 天内未补位可转全额退款。</>}
      </div>
      <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>
        {plan.reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
        {plan.conflicts.map((r, i) => <li key={`c${i}`} style={{ color: '#ffc4c4' }}>⚠ {r}</li>)}
      </ul>
      {rolledBack && <div className="notice warn" style={{ fontSize: 12 }}>❌ 失败原因：{plan.executionNote}。你的<b>权益与座位均未变化</b>，原场次仍在「待补位」，门店会重新给出方案，请以新通知为准。</div>}
      {done && <div className="small" style={{ color: 'var(--green)' }}>✅ 该方案已执行：{plan.executionNote}</div>}

      {plan.status === '已发布' && (
        <div className="scroll-x" style={{ marginTop: 6 }}>
          <table className="data">
            <thead><tr><th>玩家</th><th>你的确认</th><th>操作</th></tr></thead>
            <tbody>
              {players.map((p) => {
                const resp = plan.responses[p.id] ?? '待确认'
                return (
                  <tr key={p.id}>
                    <td className="small">{p.name}{p.memberId && `（${st.members.find((m) => m.id === p.memberId)?.level}）`}</td>
                    <td><Badge tone={PLAN_RESP_LABEL[resp]?.tone ?? 'amber'}>{PLAN_RESP_LABEL[resp]?.text ?? resp}</Badge></td>
                    <td>
                      <div className="row">
                        <button className="btn sm primary" onClick={() => st.respondPlan(plan.id, p.id, '已接受')}>接受安排</button>
                        {plan.kind !== '全额退款' && plan.kind !== '保留权益待补位' && <>
                          <select style={{ width: 100 }} value={slotPick} onChange={(e) => setSlotPick(e.target.value)}>
                            {slots.map((x) => <option key={x}>{x}</option>)}
                          </select>
                          <button className="btn sm" onClick={() => st.respondPlan(plan.id, p.id, '仅指定时段', [`${ss.date}T${slotPick}`])}>仅此时段可来</button>
                        </>}
                        <button className="btn sm danger" onClick={() => { if (confirm(`确认代表「${p.name}」拒绝该方案？将按门店策略${plan.rejectPolicy}处理。`)) st.respondPlan(plan.id, p.id, '已拒绝') }}>无法接受</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="small muted" style={{ marginTop: 6 }}>未在倒计时内确认将被记为「超时未响应」，门店按「{plan.rejectPolicy}」处理；拒绝/超时不影响你再次接受后续新方案。</div>
    </div>
  )
}

/** 玩家端：候补报名 + 我的候补（顺位、公开分值、通知倒计时） */
function WaitlistSection() {
  const st = useStore()
  const nowMs = useNow()
  const ranking = waitlistRanking()
  const [open, setOpen] = useState(false)
  const [scriptId, setScriptId] = useState(st.scripts[0]?.id ?? '')
  const [storeId, setStoreId] = useState(st.stores[0]?.id ?? '')
  const [date, setDate] = useState('2026-10-01')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [memberId, setMemberId] = useState('')
  const [mode, setMode] = useState<Player['waitlistMode']>('自动补位')
  const [groupSize, setGroupSize] = useState(1)
  const [slots, setSlots] = useState<string[]>([])
  const script = st.scripts.find((s) => s.id === scriptId)
  const slotKeys = script?.startTime.split(' / ') ?? []

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>🔁 候补 / 补位队列</h3>
        <button className="btn sm primary" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '＋ 登记候补'}</button>
      </div>
      <div className="notice info" style={{ fontSize: 12, margin: '8px 0' }}>
        公开顺位规则：金卡 +40 / 银卡 +25；同意自动补位 +20（仅指定时段 +5）；报名先后每分钟 +0.1（封顶 20）；
        历史到店次数 +N（封顶 10）；同行成组 +5。补位通知有 <b>15 分钟响应时限</b>，超时名额自动顺延给下一位。
      </div>
      {open && (
        <div className="grid cols-2" style={{ gap: 10 }}>
          <label className="field"><span>剧本</span>
            <select value={scriptId} onChange={(e) => { setScriptId(e.target.value); setSlots([]) }}>{st.scripts.map((s) => <option key={s.id} value={s.id}>《{s.name}》</option>)}</select>
          </label>
          <label className="field"><span>门店</span>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>{st.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <label className="field"><span>日期</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>同行人数</span><input type="number" min={1} max={9} value={groupSize} onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value) || 1))} /></label>
          <label className="field"><span>姓名</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="联系人姓名" /></label>
          <label className="field"><span>手机号</span><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} placeholder="11 位手机号" /></label>
          <label className="field"><span>会员</span>
            <select value={memberId} onChange={(e) => { setMemberId(e.target.value); const m = st.members.find((x) => x.id === e.target.value); if (m) { setName(m.name); setPhone(m.phone) } }}>
              <option value="">非会员</option>
              {st.members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.level}</option>)}
            </select>
          </label>
          <label className="field"><span>补位策略</span>
            <div className="switch-pill">
              <button className={mode === '自动补位' ? 'active' : ''} onClick={() => setMode('自动补位')}>任何时段自动补位（+20）</button>
              <button className={mode === '仅指定时段' ? 'active' : ''} onClick={() => setMode('仅指定时段')}>仅指定时段（+5）</button>
            </div>
          </label>
          {mode === '仅指定时段' && (
            <label className="field" style={{ gridColumn: '1 / -1' }}><span>可接受的开场（可多选）</span>
              <div className="tag-row">{slotKeys.map((x) => (
                <button key={x} className={`btn sm ${slots.includes(x) ? 'primary' : ''}`} onClick={() => setSlots((v) => v.includes(x) ? v.filter((z) => z !== x) : [...v, x])}>{x}</button>
              ))}</div>
            </label>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn primary" disabled={!name.trim() || !/^1\d{10}$/.test(phone) || (mode === '仅指定时段' && slots.length === 0)} onClick={() => {
              st.joinWaitlist({ scriptId, storeId, date, name: name.trim(), phone, memberId: memberId || undefined, mode, groupSize, slots: slots.map((x) => `${date}T${x}`) })
              setOpen(false); setName(''); setPhone('')
            }}>确认登记候补</button>
          </div>
        </div>
      )}
      <div className="stack" style={{ gap: 6, marginTop: 10 }}>
        {ranking.length === 0 && <div className="small muted">暂无候补记录。</div>}
        {ranking.map((w, i) => (
          <div key={w.id} className="notice" style={{ fontSize: 12.5 }}>
            <div className="spread">
              <div className="row">
                <b>#{i + 1} {w.playerName}{w.groupSize > 1 ? ` 等${w.groupSize}人` : ''}</b>
                {w.memberId && <Badge tone="gold">{st.members.find((m) => m.id === w.memberId)?.level}</Badge>}
                <Badge tone={w.mode === '自动补位' ? 'green' : 'blue'}>{w.mode}</Badge>
                {w.manualPin && <Badge tone="red">📌 {w.manualPin.reason}</Badge>}
              </div>
              <div className="row">
                <span className="price">{w.score} 分</span>
                <Badge tone={w.status === '已补位' ? 'green' : w.status === '已通知' ? 'amber' : w.status === '超时未响应' ? 'red' : undefined}>{w.status}</Badge>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 2 }}>
              《{st.scripts.find((s) => s.id === w.scriptId)?.name}》{w.date} · {st.stores.find((s) => s.id === w.storeId)?.name}
              {w.acceptableSlots.length ? ` · 仅 ${w.acceptableSlots.map((x) => x.slice(11)).join('/')}` : ''}
            </div>
            <div className="small muted">分值：{w.scoreParts.map((p) => `${p.label}+${p.value}`).join('，')}</div>
            {w.status === '已通知' && w.respondDeadline && (
              <div className="row" style={{ marginTop: 4 }}>
                <Badge tone={countdownText(w.respondDeadline, nowMs).overdue ? 'red' : 'amber'}>⏳ 补位确认倒计时 {countdownText(w.respondDeadline, nowMs).text}</Badge>
                <button className="btn sm primary" onClick={() => { const r = st.respondWaitlist(w.id, true); if (r) alert(r.error) }}>接受补位（权益自动核销）</button>
                <button className="btn sm danger" onClick={() => st.respondWaitlist(w.id, false)}>本次放弃</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MyBookingsPage() {
  const { bookings, scripts, sessions, cancelBooking, disruptions, entitlements } = useStore()
  const mine = bookings.slice(0, 50)
  // 玩家端展示：已发布/已执行/回滚的方案（按场次关联）
  const playerPlans = disruptions.flatMap((d) =>
    d.plans.filter((p) => ['已发布', '已确认执行', '已执行', '执行失败已回滚'].includes(p.status))
      .map((p) => ({ d, p })))
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>📒 我的拼场</div>
      <div className="muted small" style={{ marginBottom: 10 }}>演示环境展示全部预约单；真实环境按手机号过滤。可看到拼场进度、成局场次与退款规则。</div>
      {mine.length === 0 && <div className="empty">还没有预约，去剧本大厅挑一本吧。</div>}
      <div className="stack">
        {mine.map((b) => {
          const s = scripts.find((x) => x.id === b.scriptId)!
          const ss = b.sessionId ? sessions.find((x) => x.id === b.sessionId) : undefined
          const paid = b.players.filter((p) => p.paid).length
          return (
            <div key={b.id} className="card">
              <div className="spread">
                <div className="row">
                  <h3 style={{ margin: 0 }}>《{s.name}》</h3>
                  <Badge tone="purple">{b.mode}</Badge>
                  {b.status === '待拼场' && <Badge tone="amber">⏳ 待拼场</Badge>}
                  {b.status === '已成局' && <Badge tone="green">🎉 已成局</Badge>}
                  {b.status === '已取消' && <Badge tone="red">已取消/退款</Badge>}
                </div>
                <div className="muted small mono">{b.expectedStart.replace('T', ' ')}</div>
              </div>
              <div className="grid cols-3" style={{ marginTop: 10 }}>
                <div className="small"><span className="muted">联系人：</span>{b.contactName} · {b.contactPhone}</div>
                <div className="small"><span className="muted">人数：</span>{b.playersCount} 人（已支付 {paid} 人）</div>
                <div className="small"><span className="muted">支付：</span>{b.payMethod}</div>
                <div className="small"><span className="muted">偏好：</span>{b.players.map((p) => p.rolePreference).join(' / ')}</div>
                <div className="small"><span className="muted">接受反串：</span>{b.players.map((p) => (p.acceptCrossGender ? '是' : '否')).join(' / ')}</div>
                <div className="small"><span className="muted">押金：</span>¥{s.deposit}（到店收）</div>
              </div>
              {ss && <div className="notice info" style={{ marginTop: 8, fontSize: 12 }}>
                已归入场次 <b className="mono">{ss.id}</b> · 状态：{ss.status === '待补位' ? '🚨 待补位（开场前异常处置中，名额已为你保留，不会被超卖）' : ss.status === '已改期' ? `已改期 → ${ss.migratedTo ? sessions.find((x) => x.id === ss.migratedTo!.newSessionId)?.startKey ?? ss.migratedTo.newSessionId : ''}` : ss.status} · 开场 {ss.startKey}
              </div>}
              {playerPlans.filter(({ p }) => b.players.some((pl) => p.responses[pl.id] !== undefined)).map(({ d, p }) => (
                <PlayerPlanCard key={p.id} plan={p} disruptionSessionId={d.sessionId} />
              ))}
              <div className="muted small" style={{ marginTop: 6 }}>退款规则：{s.refundRule}</div>
              {b.status === '待拼场' && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn danger sm" onClick={() => { if (confirm('取消预约？已预付费用将按原路退回。')) cancelBooking(b.id) }}>取消预约（自动退款）</button>
                  <Stars n={0} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {entitlements.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 8px' }}>🎟 我的权益变动（保留 / 核销 / 退回，全程可查）</h3>
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>时间</th><th>类型</th><th>金额</th><th>说明</th></tr></thead>
              <tbody>
                {entitlements.slice(0, 20).map((e) => (
                  <tr key={e.id}>
                    <td className="small mono">{e.at.replace('T', ' ').slice(0, 16)}</td>
                    <td><Badge tone={e.kind === '核销' ? 'green' : e.kind === '退回' ? 'red' : 'gold'}>{e.kind}</Badge></td>
                    <td className="price">¥{e.amount}</td>
                    <td className="small muted">{e.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WaitlistSection />
    </div>
  )
}
