import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Script } from '../types'
import { DEMO_DATE } from '../seed'
import { Badge } from '../ui'

function ProfMeter({ v }: { v: number }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="meter" style={{ width: 70 }}><i style={{ width: `${v * 20}%`, background: v >= 4 ? 'linear-gradient(90deg,#4caf7d,#d9a84e)' : v >= 2 ? 'linear-gradient(90deg,#e0a23e,#e2647a)' : 'linear-gradient(90deg,#e05d5d,#e2647a)' }} /></span>
      <span className="small mono">{v}/5</span>
    </span>
  )
}

export function ScheduleDeskPage() {
  const st = useStore()
  const [date, setDate] = useState(DEMO_DATE)
  const [storeId, setStoreId] = useState('st1')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 拼场池：待拼场预约，按 门店 + 剧本+开场 聚合
  const pools = useMemo(() => {
    const map = new Map<string, { script: Script; startAt: string; startKey: string; count: number; ids: string[]; modes: string[] }>()
    st.bookings.filter((b) => b.status === '待拼场' && b.storeId === storeId && b.expectedStart.startsWith(date)).forEach((b) => {
      const key = `${b.scriptId}|${b.expectedStart}`
      const script = st.scripts.find((s) => s.id === b.scriptId)!
      const cur = map.get(key) ?? { script, startAt: b.expectedStart, startKey: b.expectedStart.slice(11), count: 0, ids: [], modes: [] }
      cur.count += b.playersCount
      cur.ids.push(b.id)
      cur.modes.push(b.mode)
      map.set(key, cur)
    })
    return Array.from(map.values())
  }, [st.bookings, st.scripts, date, storeId])

  const generate = (scriptId: string, startAt: string, mode: '拼场' | '包场' | '生日局') => {
    const r = st.generateSession(scriptId, startAt.slice(0, 10), startAt.slice(11), mode, storeId)
    if (typeof r === 'object') setMsg({ ok: false, text: r.error })
    else setMsg({ ok: true, text: `场次 ${r} 已生成：系统按容量匹配了房间，主持按「档期空闲 → 熟练度优先」自动选派。` })
  }

  const pendingSessions = st.sessions.filter((s) => (s.status === '待成局' || (s.status === '已成局' && s.date === date)) && s.storeId === storeId)

  return (
    <div>
      <div className="spread">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>🧭 排班成局台</div>
          <div className="muted small">系统根据 <b>拼场人数（成局区间）、房间容量与占用、主持档期与剧本熟练度、盒装库存</b> 生成场次；主持全员无档期或熟练度不足会自动开工单。</div>
        </div>
        <div className="row">
          <select style={{ width: 180 }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {st.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="field" style={{ margin: 0, width: 170 }}><span>排班日期</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
      </div>

      {msg && <div className={`notice ${msg.ok ? 'ok' : 'warn'}`} style={{ margin: '10px 0' }}>
        {msg.ok ? '✅ ' : '⚠️ '}{msg.text}
        <button className="btn ghost sm" style={{ float: 'right' }} onClick={() => setMsg(null)}>知道了</button>
      </div>}

      <div className="section-title">🧩 待拼场预约池</div>
      {pools.length === 0 && <div className="empty">当日没有待拼场预约。可切换到「玩家」角色去剧本大厅下单。</div>}
      <div className="grid cols-2">
        {pools.map((p) => {
          const formed = p.count >= p.script.minPlayers
          const hosts = st.eligibleHosts(p.script.id, p.startAt, storeId)
          const rooms = st.eligibleRooms(p.script.id, p.startAt, storeId)
          return (
            <div key={`${p.script.id}-${p.startAt}`} className="card">
              <div className="spread">
                <h3 style={{ margin: 0 }}>《{p.script.name}》 <span className="muted small">@ {p.startKey}</span></h3>
                {formed ? <Badge tone="green">{p.count} 人 · 可成局（{p.script.minPlayers}-{p.script.maxPlayers}）</Badge>
                  : <Badge tone="amber">{p.count} 人 · 缺 {p.script.minPlayers - p.count} 人</Badge>}
              </div>
              <div className="small muted" style={{ margin: '6px 0' }}>预约 {p.ids.length} 单 · 模式：{Array.from(new Set(p.modes)).join(' / ')} · 时长 {p.script.durationMin} 分钟</div>
              <div className="grid cols-2" style={{ gap: 8 }}>
                <div className="notice info" style={{ fontSize: 12 }}>
                  <b>空闲房间（{rooms.length}）</b><br />
                  {rooms.slice(0, 3).map((r) => `${r.name}(${r.capacity}人)`).join('、') || <span className="badge red">无可用房间</span>}
                </div>
                <div className="notice" style={{ fontSize: 12 }}>
                  <b>档期可派主持（按熟练度排序）</b><br />
                  {hosts.length ? hosts.slice(0, 3).map((h) => `${h.name} ${(h.proficiency[p.script.id] ?? 0)}/5`).join('、')
                    : <span className="badge red">全部无档期</span>}
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary sm" disabled={!formed || !rooms.length} onClick={() => generate(p.script.id, p.startAt, '拼场')}>按拼场生成场次</button>
                <button className="btn sm" disabled={!rooms.length} onClick={() => generate(p.script.id, p.startAt, '包场')}>取最大单包场生成</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="section-title">🛠 待确认场次（房间 / 主持调整）</div>
      {pendingSessions.length === 0 && <div className="empty">暂无待确认场次。</div>}
      <div className="stack">
        {pendingSessions.map((ss) => {
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const head = st.bookings.filter((b) => b.sessionId === ss.id).reduce((n, b) => n + b.playersCount, 0)
          const hosts = st.eligibleHosts(ss.scriptId, ss.startAt, ss.storeId)
          const rooms = st.eligibleRooms(ss.scriptId, ss.startAt, ss.storeId)
          const curHost = st.hosts.find((h) => h.id === ss.hostId)
          const curRoom = st.rooms.find((r) => r.id === ss.roomId)
          return (
            <div key={ss.id} className="card">
              <div className="spread">
                <div className="row">
                  <b>《{script.name}》</b>
                  <Badge tone="purple">{ss.mode}</Badge>
                  <Badge tone={ss.status === '待成局' ? 'amber' : 'green'}>{ss.status}</Badge>
                  <span className="small muted mono">{ss.startAt.replace('T', ' ')}</span>
                </div>
                <span className="small">{head} 人 · 成局线 {script.minPlayers}-{script.maxPlayers}</span>
              </div>
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <label className="field" style={{ margin: 0 }}><span>房间（容量 ≥ {script.minPlayers}，排除时段冲突/故障）</span>
                  <select value={ss.roomId ?? ''} onChange={(e) => { const r = st.assignRoom(ss.id, e.target.value); if (!r.ok) { alert(`调整被拦截：${r.error}`) } }}>
                    {[...(curRoom ? [curRoom] : []), ...rooms].map((r) => <option key={r.id} value={r.id}>{r.name}（{r.capacity} 人{curRoom?.id === r.id ? '· 当前' : ''}）</option>)}
                  </select>
                </label>
                <label className="field" style={{ margin: 0 }}><span>主持（档期空闲，熟练度优先）</span>
                  <select value={ss.hostId ?? ''} onChange={(e) => { const r = st.assignHost(ss.id, e.target.value); if (!r.ok) alert(`调整被拦截：${r.error}`) }}>
                    <option value="">— 暂无主持，触发调班工单 —</option>
                    {[...(curHost && !hosts.some((h) => h.id === curHost.id) ? [curHost] : []), ...hosts].map((h) => (
                      <option key={h.id} value={h.id}>{h.name} · {h.level} · 熟练度 {(h.proficiency[ss.scriptId] ?? 0)}/5 · 均分 {h.reviewScore}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted small">熟练度参考：</span>
                {st.hosts.map((h) => <span key={h.id} className="small">{h.name}<ProfMeter v={h.proficiency[ss.scriptId] ?? 0} /></span>)}
                {ss.status === '待成局' && ss.hostId && (curHost?.proficiency[ss.scriptId] ?? 0) >= 3 && (
                  <button className="btn primary sm" onClick={() => st.setSessionStatus(ss.id, '已成局')}>主持达标，确认成局</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
