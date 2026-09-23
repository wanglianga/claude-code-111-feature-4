import { useStore, recommendScripts } from '../store'
import { Badge, Stars } from '../ui'

export function RecommendationsPage() {
  const st = useStore()
  // 不同会员画像的推荐结果（新手 / 复购金卡）
  const newbie = st.members.find((m) => m.visits <= 2)
  const veteran = st.members.slice().sort((a, b) => b.visits - a.visits)[0]

  // 下一轮排期建议
  const scheduleAdvice = st.scripts.map((s) => {
    const sss = st.sessions.filter((x) => x.scriptId === s.id)
    const rvs = st.reviews.filter((r) => st.sessions.find((x) => x.id === r.sessionId)?.scriptId === s.id)
    const avg = rvs.length ? rvs.reduce((n, r) => n + r.score, 0) / rvs.length : null
    const damage = sss.some((x) => x.propIssues.some((p) => p.condition === '严重损耗' || p.condition === '丢失'))
    const tooHard = rvs.filter((r) => r.difficultyFeel === '偏难').length
    const skilledHosts = st.hosts.filter((h) => (h.proficiency[s.id] ?? 0) >= 4)
    const repurchase = rvs.filter((r) => r.scriptRecommend).length
    let action: '加场' | '维持' | '降权/暂缓' | '维修后再排'
    if (damage) action = '维修后再排'
    else if ((avg !== null && avg < 3.5) || tooHard >= 2) action = '降权/暂缓'
    else if (avg !== null && avg >= 4.5 && repurchase >= 2 && skilledHosts.length >= 1) action = '加场'
    else action = '维持'
    return { script: s, avg, damage, tooHard, skilledHosts, repurchase, action }
  }).sort((a, b) => ({ '加场': 0, '维持': 1, '降权/暂缓': 2, '维修后再排': 3 }[a.action] - { '加场': 0, '维持': 1, '降权/暂缓': 2, '维修后再排': 3 }[b.action]))

  const Card = ({ title, memberId, empty }: { title: string; memberId?: string; empty?: string }) => {
    const recs = recommendScripts(memberId)
    return (
      <div className="card">
        <div className="card-title-row"><h3 style={{ margin: 0 }}>{title}</h3></div>
        {empty && <div className="small muted">{empty}</div>}
        <div className="stack" style={{ gap: 8 }}>
          {recs.map(({ script, score, reason }, i) => (
            <div key={script.id} className="spread" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
              <div>
                <b>{i + 1}. 《{script.name}》</b>
                <div className="tag-row" style={{ marginTop: 2 }}>
                  <Badge tone="purple">{script.genre}</Badge>
                  <Badge tone={script.horror === '不恐怖' ? 'green' : 'red'}>{script.horror}</Badge>
                  <Badge tone={script.beginnerFriendly ? 'green' : 'amber'}>{script.difficulty}</Badge>
                </div>
                <div className="small muted" style={{ marginTop: 2 }}>{reason}</div>
              </div>
              <div className="right">
                <div className="small muted">推荐分</div>
                <div className="price" style={{ fontSize: 18 }}>{score.toFixed(1)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>🎯 推荐与下一轮排期调权</div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        三个反馈回路自动作用于此页：① <b>道具损耗</b>（严重损耗/丢失 → 推荐与排期降权，提示维修后再排）；
        ② <b>玩家复购与评价</b>（高评分高复购 → 加场，偏难反馈 → 新手推荐降级）；
        ③ <b>主持复盘</b>（熟练度调整 → 影响排班自动选派与「有熟练主持」推荐加成）。
      </div>

      <div className="grid cols-2">
        <Card title={`🆕 新手画像推荐（${newbie?.name ?? '普通访客'} · 到店 ${newbie?.visits ?? 0} 次）`} memberId={newbie?.id} />
        <Card title={`💎 高复购会员推荐（${veteran?.name} · ${veteran?.level} · 到店 ${veteran?.visits} 次）`} memberId={veteran.id} />
      </div>

      <div className="section-title">🗓 下一轮剧本排期建议（门店排班直接参考）</div>
      <div className="card" style={{ padding: 0 }}>
        <table className="data">
          <thead><tr><th>剧本</th><th>玩家评分</th><th>推荐/复购</th><th>偏难反馈</th><th>道具损耗</th><th>熟练主持</th><th>排期动作</th></tr></thead>
          <tbody>
            {scheduleAdvice.map(({ script, avg, damage, tooHard, skilledHosts, repurchase, action }) => (
              <tr key={script.id}>
                <td><b>《{script.name}》</b><div className="small muted">{script.genre} · {script.minPlayers}-{script.maxPlayers}人</div></td>
                <td>{avg !== null ? <Stars n={avg} size={12} /> : <span className="muted small">暂无</span>}</td>
                <td className="small">{repurchase} 人愿意再来</td>
                <td>{tooHard > 0 ? <Badge tone="amber">{tooHard} 人偏难</Badge> : <span className="muted small">—</span>}</td>
                <td>{damage ? <Badge tone="red">严重损耗/丢失</Badge> : <Badge tone="green">正常</Badge>}</td>
                <td className="small">{skilledHosts.length ? skilledHosts.map((h) => h.name).join('、') : <span className="badge red">无熟练主持</span>}</td>
                <td>
                  <Badge tone={action === '加场' ? 'green' : action === '维持' ? 'blue' : action === '维修后再排' ? 'red' : 'amber'}>
                    {action === '加场' ? '📈 加场' : action === '维持' ? '➡ 维持' : action === '维修后再排' ? '🔧 维修后再排' : '⬇ 降权/暂缓'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="notice info" style={{ marginTop: 10, fontSize: 12 }}>
        闭环说明：玩家在「复盘与反馈」提交评价与难度感受、主持提交复盘调整熟练度、前台回收道具登记损耗 —— 三处数据实时汇总到本页，门店据此决定下一轮剧本排期与拼场推荐。
      </div>
    </div>
  )
}
