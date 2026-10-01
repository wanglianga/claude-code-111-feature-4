import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { LedgerKind } from '../types'
import { Badge } from '../ui'

const KIND_TONE: Record<LedgerKind, 'green' | 'red' | 'gold' | 'blue' | 'amber'> = {
  报名费收入: 'green',
  押金收入: 'gold',
  押金退还: 'blue',
  退款支出: 'red',
  换本差价: 'amber',
  争议补偿: 'red',
  权益保留: 'gold',
  权益核销: 'blue',
  跨店结算: 'blue',
}

export function LedgerPage() {
  const st = useStore()
  const [kind, setKind] = useState<string>('全部')
  const [sid, setSid] = useState<string>('')

  const list = useMemo(() => st.ledger
    .filter((l) => kind === '全部' ? true : l.kind === kind)
    .filter((l) => sid === '' ? true : sid === '__none__' ? !l.sessionId : l.sessionId === sid)
    .sort((a, b) => b.at.localeCompare(a.at)), [st.ledger, kind, sid])

  const sum = (k: LedgerKind) => st.ledger.filter((l) => l.kind === k).reduce((n, l) => n + l.amount, 0)
  const net = st.ledger.reduce((n, l) => n + l.amount, 0)

  const sessionName = (id: string) => {
    if (!id) return '（未归场次/预约阶段）'
    const ss = st.sessions.find((x) => x.id === id)
    if (!ss) return id
    const s = st.scripts.find((x) => x.id === ss.scriptId)
    return `《${s?.name}》${ss.startKey} ${ss.mode}`
  }

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>💰 收退款台账（全部流水归场次 / 关联工单）</div>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="v amt-pos">¥{sum('报名费收入')}</div><div className="l">报名费收入</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--gold)' }}>¥{sum('押金收入')}</div><div className="l">押金净收入（含扣损）</div></div>
        <div className="stat"><div className="v amt-neg">¥{Math.abs(sum('退款支出') + sum('争议补偿') + sum('押金退还'))}</div><div className="l">退款/补偿/退押支出</div></div>
        <div className="stat"><div className="v" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>¥{net}</div><div className="l">净收入合计</div></div>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <select style={{ width: 150 }} value={kind} onChange={(e) => setKind(e.target.value)}>
          {['全部', '报名费收入', '押金收入', '押金退还', '退款支出', '换本差价', '争议补偿', '权益保留', '权益核销', '跨店结算'].map((k) => <option key={k}>{k}</option>)}
        </select>
        <select style={{ width: 320 }} value={sid} onChange={(e) => setSid(e.target.value)}>
          <option value="">全部场次</option>
          <option value="__none__">（预约阶段未归场次）</option>
          {st.sessions.map((ss) => <option key={ss.id} value={ss.id}>{sessionName(ss.id)}</option>)}
        </select>
        <span className="small muted">提示：审批退款 / 解散场次 / 结账退押金都会自动写入；每笔可追溯场次、玩家与工单号。</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>时间</th><th>类型</th><th>金额</th><th>归属场次</th><th>玩家/备注</th><th>工单</th><th>经手人</th></tr></thead>
            <tbody>
              {list.map((l) => {
                const p = l.playerId ? st.bookings.flatMap((b) => b.players).find((x) => x.id === l.playerId) : undefined
                return (
                  <tr key={l.id}>
                    <td className="small mono">{l.at.replace('T', ' ')}</td>
                    <td><Badge tone={KIND_TONE[l.kind]}>{l.kind}</Badge></td>
                    <td className={l.amount >= 0 ? 'amt-pos mono' : 'amt-neg mono'}>{l.amount >= 0 ? '+' : ''}¥{l.amount}</td>
                    <td className="small">{sessionName(l.sessionId)}</td>
                    <td className="small">{p ? `${p.name} · ` : ''}{l.memo}</td>
                    <td className="small mono">{l.ticketId ?? '—'}</td>
                    <td className="small">{l.operator}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
