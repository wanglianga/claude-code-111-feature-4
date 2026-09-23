import { useState } from 'react'
import { useStore, sessionPlayers } from '../store'
import type { Review } from '../types'
import { Badge, Modal, Stars } from '../ui'

function ReviewForm({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const st = useStore()
  const players = sessionPlayers(sessionId)
  const ss = st.sessions.find((x) => x.id === sessionId)!
  const script = st.scripts.find((x) => x.id === ss.scriptId)!
  const existing = new Set(st.reviews.filter((r) => r.sessionId === sessionId).map((r) => r.playerId))
  const [pid, setPid] = useState(players.find((p) => !existing.has(p.id))?.id ?? players[0]?.id ?? '')
  const [score, setScore] = useState(5)
  const [hostScore, setHostScore] = useState(5)
  const [diff, setDiff] = useState<Review['difficultyFeel']>('刚好')
  const [recommend, setRecommend] = useState(true)
  const [comment, setComment] = useState('')
  const player = players.find((p) => p.id === pid)
  const already = existing.has(pid)

  return (
    <Modal title={`玩家复盘评价 · 《${script.name}》`} onClose={onClose}
      footer={<button className="btn primary" disabled={already || !player} onClick={() => {
        st.submitReview({ sessionId, playerId: pid, playerName: player!.name, score, hostScore, difficultyFeel: diff, scriptRecommend: recommend, comment })
        alert('评价已提交，主持均分已更新')
        onClose()
      }}>{already ? '该玩家已评价' : '提交评价'}</button>}>
      <label className="field"><span>玩家</span>
        <select value={pid} onChange={(e) => setPid(e.target.value)}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}{existing.has(p.id) ? '（已评价）' : ''}</option>)}
        </select>
      </label>
      <div className="grid cols-2">
        <label className="field"><span>整体体验 {score} 星</span>
          <input type="range" min={1} max={5} value={score} onChange={(e) => setScore(Number(e.target.value))} />
        </label>
        <label className="field"><span>主持表现 {hostScore} 星（计入主持均分）</span>
          <input type="range" min={1} max={5} value={hostScore} onChange={(e) => setHostScore(Number(e.target.value))} />
        </label>
        <label className="field"><span>剧本难度感受（影响推荐）</span>
          <div className="switch-pill">
            {(['偏简单', '刚好', '偏难'] as const).map((d) => <button key={d} className={diff === d ? 'active' : ''} onClick={() => setDiff(d)}>{d}</button>)}
          </div>
        </label>
        <label className="field"><span>是否愿意推荐/复购</span>
          <div className="switch-pill">
            <button className={recommend ? 'active' : ''} onClick={() => setRecommend(true)}>👍 愿意再来</button>
            <button className={!recommend ? 'active' : ''} onClick={() => setRecommend(false)}>👎 暂不推荐</button>
          </div>
        </label>
      </div>
      <label className="field"><span>文字评价（客服可串联到工单）</span><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="恐怖环节感受、节奏、DM 控场、道具新旧…" /></label>
      <div className="small muted">提交后：主持表现进入主持累计均分；剧本难度反馈影响新手推荐；差评会出现在客服看板。</div>
    </Modal>
  )
}

function DebriefForm({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const st = useStore()
  const ss = st.sessions.find((x) => x.id === sessionId)!
  const host = st.hosts.find((h) => h.id === ss.hostId)
  const [note, setNote] = useState('')
  const [delta, setDelta] = useState(0)
  return (
    <Modal title={`主持复盘 · 《${st.scripts.find((x) => x.id === ss.scriptId)!.name}》`} onClose={onClose}
      footer={<button className="btn gold" disabled={!host} onClick={() => {
        st.submitDebrief({ sessionId, hostId: host!.id, scriptId: ss.scriptId, note, proficiencyDelta: delta })
        alert('复盘已归档，主持熟练度已调整，场次进入「已复盘」')
        onClose()
      }}>提交主持复盘并归档</button>}>
      <div className="small muted" style={{ marginBottom: 8 }}>主持：{host?.name} · 当前该本熟练度 {host?.proficiency[ss.scriptId] ?? 0}/5</div>
      <label className="field"><span>熟练度调整（本场带教/翻车后的修正，直接影响下一轮排班优先级）</span>
        <div className="switch-pill">
          {[-1, 0, 1].map((d) => <button key={d} className={delta === d ? 'active' : ''} onClick={() => setDelta(d)}>{d === 1 ? '⬆ +1（更加熟练）' : d === 0 ? '保持' : '⬇ -1（复盘发现不熟练）'}</button>)}
        </div>
      </label>
      <label className="field"><span>复盘笔记（控场问题、玩家状态、节奏、道具损耗改进）</span>
        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：第二幕信息发放过早；红盖头道具有轻微勾丝已报修；新手玩家反馈偏难，下次开此本建议前置规则讲解。" />
      </label>
    </Modal>
  )
}

export function ReviewPage({ role }: { role: 'player' | 'frontdesk' | 'host' | 'manager' | 'service' }) {
  const st = useStore()
  const [reviewSid, setReviewSid] = useState<string>()
  const [debriefSid, setDebriefSid] = useState<string>()
  const done = st.sessions.filter((s) => ['已结账', '已复盘'].includes(s.status))
  const damages = st.sessions.flatMap((s) => s.propIssues.filter((p) => p.condition !== '正常').map((p) => ({ ...p, session: s })))

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>📝 复盘与反馈（评价 / 主持表现 / 剧本难度 / 道具损耗 → 反哺排班与推荐）</div>

      <div className="section-title">待收集复盘的场次（已结账）</div>
      {done.length === 0 && <div className="empty">暂无已结账场次。把演示场次推进到结账后即可收集评价。</div>}
      <div className="stack">
        {done.map((ss) => {
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const host = st.hosts.find((h) => h.id === ss.hostId)
          const players = sessionPlayers(ss.id)
          const reviews = st.reviews.filter((r) => r.sessionId === ss.id)
          const debrief = st.debriefs.find((d) => d.sessionId === ss.id)
          const avgHost = reviews.length ? (reviews.reduce((n, r) => n + r.hostScore, 0) / reviews.length) : 0
          const badProps = ss.propIssues.filter((p) => p.condition !== '正常')
          return (
            <div key={ss.id} className="card">
              <div className="spread">
                <div className="row">
                  <b>《{script.name}》</b><Badge tone="purple">{ss.mode}</Badge>
                  {ss.reviewDone ? <Badge tone="green">已复盘归档</Badge> : <Badge tone="amber">待复盘</Badge>}
                  <span className="small muted mono">{ss.startAt.replace('T', ' ')}</span>
                </div>
                <div className="row">
                  <button className="btn sm primary" onClick={() => setReviewSid(ss.id)}>
                    {reviews.length ? `补收玩家评价（${reviews.length}/${players.length}）` : '收集玩家评价'}
                  </button>
                  {(role === 'manager' || role === 'host') && !debrief && <button className="btn sm gold" onClick={() => setDebriefSid(ss.id)}>主持复盘归档</button>}
                </div>
              </div>
              <div className="grid cols-3" style={{ marginTop: 8, gap: 8 }}>
                <div className="notice" style={{ fontSize: 12 }}>
                  <b>主持表现</b><br />
                  {host?.name}：{reviews.length ? <Stars n={avgHost} /> : '暂无评分'}
                  <span className="muted">（累计均分 {host?.reviewScore} · {host?.reviewCount} 场）</span>
                </div>
                <div className="notice" style={{ fontSize: 12 }}>
                  <b>剧本难度反馈</b><br />
                  {reviews.length ? reviews.map((r) => `${r.playerName}:${r.difficultyFeel}`).join('；') : '暂无'}
                  <br /><span className="muted">推荐意愿：{reviews.filter((r) => r.scriptRecommend).length}/{reviews.length || 0}</span>
                </div>
                <div className="notice" style={{ fontSize: 12 }}>
                  <b>道具损耗</b><br />
                  {ss.propIssues.length === 0 ? '本场无道具包' : badProps.length
                    ? badProps.map((p) => `${p.name}:${p.condition}`).join('；')
                    : '全部完好归还'}
                  {ss.depositCharged > 0 && <span className="price"> · 已扣押金 ¥{ss.depositCharged}</span>}
                </div>
              </div>
              {reviews.some((r) => r.score <= 3 || !r.scriptRecommend) && (
                <div className="notice warn" style={{ marginTop: 8, fontSize: 12 }}>
                  ⚠ 出现低评价/不推荐：{reviews.filter((r) => r.score <= 3 || !r.scriptRecommend).map((r) => `${r.playerName}「${r.comment || '无留言'}」`).join('；')}
                  ，客服可在工单中心串联本场签到/主持中断/道具记录跟进。
                </div>
              )}
              {debrief && <div className="notice ok" style={{ marginTop: 8, fontSize: 12 }}>🎤 主持复盘（熟练度 {debrief.proficiencyDelta >= 0 ? '+' : ''}{debrief.proficiencyDelta}）：{debrief.note}</div>}
            </div>
          )
        })}
      </div>

      <div className="section-title">📦 道具损耗台账（影响采购与下轮排期）</div>
      {damages.length === 0 ? <div className="small muted">暂无损耗记录。</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data">
            <thead><tr><th>道具</th><th>状态</th><th>说明</th><th>场次</th><th>扣押金</th></tr></thead>
            <tbody>
              {damages.map((p) => (
                <tr key={p.propId + p.session.id}>
                  <td>{p.name}</td>
                  <td><Badge tone={p.condition === '丢失' || p.condition === '严重损耗' ? 'red' : 'amber'}>{p.condition}</Badge></td>
                  <td className="small muted">{p.damageNote ?? '—'}</td>
                  <td className="small mono">{p.session.id}</td>
                  <td className="price">¥{p.session.depositCharged || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewSid && <ReviewForm sessionId={reviewSid} onClose={() => setReviewSid(undefined)} />}
      {debriefSid && <DebriefForm sessionId={debriefSid} onClose={() => setDebriefSid(undefined)} />}
    </div>
  )
}
