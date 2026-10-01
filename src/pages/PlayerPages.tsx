import { useMemo, useState } from 'react'
import { useStore, memberDiscount } from '../store'
import type { Script, Booking } from '../types'
import { Badge, Modal, Stars } from '../ui'
import { MyPlanProposals } from './PlayerDisruptionPages'

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
                  <select style={{ width: 150 }} value={prefs[i]} onChange={(e) => setPrefs((p) => p.map((x, j) => (j === i ? e.target.value : x)))}>
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
            rolePreferences: prefs, acceptCross: cross, acknowledgedSafety: safety, payMethod,
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

export function MyBookingsPage() {
  const { bookings, scripts, sessions, stores, cancelBooking } = useStore()
  const mine = bookings.slice(0, 50)
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>📒 我的拼场</div>
      <div className="muted small" style={{ marginBottom: 10 }}>演示环境展示全部预约单；真实环境按手机号过滤。可看到拼场进度、成局场次与退款规则。</div>
      {mine.length === 0 && <div className="empty">还没有预约，去剧本大厅挑一本吧。</div>}
      <div className="stack">
        {mine.map((b) => {
          const s = scripts.find((x) => x.id === b.scriptId)!
          const ss = b.sessionId ? sessions.find((x) => x.id === b.sessionId) : undefined
          const store = b.storeId ? stores.find((x) => x.id === b.storeId) : undefined
          const paid = b.players.filter((p) => p.paid).length
          return (
            <div key={b.id} className="card">
              <div className="spread">
                <div className="row">
                  <h3 style={{ margin: 0 }}>《{s.name}》</h3>
                  {store && <Badge tone="blue">{store.shortName}</Badge>}
                  <Badge tone="purple">{b.mode}</Badge>
                  {b.status === '待拼场' && <Badge tone="amber">⏳ 待拼场</Badge>}
                  {b.status === '已成局' && <Badge tone="green">🎉 已成局</Badge>}
                  {b.status === '候补中' && <Badge tone="blue">📋 候补中</Badge>}
                  {b.status === '已改期' && <Badge tone="green">↪ 已改期迁移</Badge>}
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
                已归入场次 <b className="mono">{ss.id}</b> · 状态：{ss.status} · 开场 {ss.startKey}
                {ss.status === '改期待补' && '（原场次名额继续可售/可候补，你的权益未受影响，等待门店补位安排）'}
              </div>}
              <MyPlanProposals bookingId={b.id} />
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
    </div>
  )
}
