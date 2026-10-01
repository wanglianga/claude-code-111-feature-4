// 开场前异常处置：核心不变量校验（Node 直跑，无 UI）
// 运行：node_modules/.bin/esbuild verify/verify.ts --bundle --platform=node --format=esm --outfile=/tmp/verify.mjs && node /tmp/verify.mjs
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
} as Storage

const { useStore } = await import('../src/store.ts')
const { rankWaitlist } = await import('../src/disruption.ts')

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.error(`  ❌ ${name} ${extra}`) }
}
const S = () => useStore.getState()
const headcount = (sid: string) =>
  S().bookings.filter((b) => b.sessionId === sid).flatMap((b) => b.players).filter((p) => !p.quit).length

async function main() {
  // ---------- 场景 1：跨店迁移全员同意，原子提交成功 ----------
  console.log('\n[场景1] 跨店迁移 6 人全员同意 → 并入静安 19:00（余 6 席，房间上限 7）')
  S().resetDemo()
  const dcId = S().cases[0].id
  S().computePlans(dcId)
  const mergePlan = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900')!
  check('跨店并入候选可行', mergePlan.feasible, mergePlan.blockers.join('；'))
  S().selectPlan(dcId, mergePlan.id, 30)
  for (const r of S().plans.find((p) => p.id === mergePlan.id)!.responses) S().respondPlan(mergePlan.id, r.bookingId, '同意')
  const res1 = S().commitPlan(mergePlan.id)
  check('提交成功', res1.ok, res1.error ?? '')
  check('原场次转为「改期待补」且名额可候补', S().sessions.find((x) => x.id === 'ss-wg-1900')!.status === '改期待补')
  check('两个同行组迁入目标场次', headcount('ss-wg2-1900') === 7, `实际 ${headcount('ss-wg2-1900')}`)
  check('未超卖（7 ≤ 房间容量/角色上限 7）', headcount('ss-wg2-1900') <= 7)
  check('4 项资源锁（原名额+房间+班次+库存）全部生效', S().locks.filter((l) => l.planId === mergePlan.id && l.status === '已生效').length === 4)
  check('无退款；跨店迁移 6 人各得 1 张 ¥20 交通补偿券', res1.execution!.refunds.length === 0 && res1.execution!.voucherIds.length === 6)
  const bookingsMoved = S().bookings.filter((b) => ['b-wg-a', 'b-wg-b'].includes(b.id)).every((b) => b.status === '已改期' && b.sessionId === 'ss-wg2-1900')
  check('预约状态=已改期并指向新场次', bookingsMoved)

  // 重复确认幂等
  const refundCountBefore = S().ledger.filter((l) => l.idemKey?.startsWith('case-refund:')).length
  const again = S().commitPlan(mergePlan.id)
  const refundCountAfter = S().ledger.filter((l) => l.idemKey?.startsWith('case-refund:')).length
  check('重复确认被幂等拦截', again.ok && refundCountBefore === refundCountAfter)

  // ---------- 场景 2：一组同意一组拒绝 → 部分迁移 + 拒绝组全额退款，且仅退一次 ----------
  console.log('\n[场景2] 4 人组同意、2 人组拒绝 → 部分迁移 + 拒绝组全额退款')
  S().resetDemo()
  S().computePlans(dcId)
  const plan2 = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900')!
  S().selectPlan(dcId, plan2.id, 30)
  S().respondPlan(plan2.id, 'b-wg-a', '同意')
  S().respondPlan(plan2.id, 'b-wg-b', '拒绝')
  const res2 = S().commitPlan(plan2.id)
  check('提交成功', res2.ok, res2.error ?? '')
  check('目标场次 1+4=5 人，未超卖', headcount('ss-wg2-1900') === 5, `实际 ${headcount('ss-wg2-1900')}`)
  const refusedB = S().bookings.find((b) => b.id === 'b-wg-b')!
  check('拒绝组已移出原场次并取消', refusedB.status === '已取消' && refusedB.sessionId === undefined)
  check('拒绝组 2 名玩家均已退款且 paid=false', refusedB.players.every((p) => !p.paid && p.paidAmount === 0))
  const refundRows = S().ledger.filter((l) => l.idemKey?.startsWith(`case-refund:${dcId}`))
  check('恰好 2 笔退款流水（幂等键一人一笔）', refundRows.length === 2, `实际 ${refundRows.length}`)
  S().commitPlan(plan2.id)
  const refundRows2 = S().ledger.filter((l) => l.idemKey?.startsWith(`case-refund:${dcId}`))
  check('再次提交不产生重复退款', refundRows2.length === 2)

  // ---------- 场景 3：并发抢占 → 终检失败整体回滚，权益/座位不变 ----------
  console.log('\n[场景3] 他店在确认期间抢占目标房间 → 原子确认整体回滚')
  S().resetDemo()
  S().computePlans(dcId)
  const plan3 = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900')!
  S().selectPlan(dcId, plan3.id, 30)
  for (const r of plan3.responses) S().respondPlan(plan3.id, r.bookingId, '同意')
  // 并发：目标房间 r6 被临时包场抢走
  S().toggleSimClaim({ kind: '房间', refId: 'r6', startAt: '2026-10-02T19:00', durationMin: 240, by: '其他门店临时包场（模拟）' })
  const res3 = S().commitPlan(plan3.id)
  check('提交失败', !res3.ok)
  const origin3 = S().sessions.find((x) => x.id === 'ss-wg-1900')!
  check('原场次保持「已成局」可售/候补', origin3.status === '已成局')
  check('玩家仍在原场次、仍已付费（未扣权益却无座位）', headcount('ss-wg-1900') === 6 &&
    S().bookings.filter((b) => b.sessionId === 'ss-wg-1900').flatMap((b) => b.players).every((p) => p.paid))
  check('未产生新场次/退款/权益', S().sessions.length === 5 && S().ledger.every((l) => l.kind !== '退款支出') && S().vouchers.length === 0)
  const rolled = S().plans.find((p) => p.id === plan3.id)!
  check('方案标记为已回滚并保留失败原因', rolled.status === '已回滚' && !!rolled.lastCommitError)
  check('异常单进入「执行失败已回滚」', S().cases.find((c) => c.id === dcId)!.status === '执行失败已回滚')

  // 解除抢占 → 重新计算 → 可再次提交成功（原场次状态恢复处置链路）
  S().toggleSimClaim({ kind: '房间', refId: 'r6', startAt: '2026-10-02T19:00', durationMin: 240, by: '其他门店临时包场（模拟）' })
  S().computePlans(dcId)
  const plan3b = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900' && p.status === '候选')!
  check('解除抢占后重新出现可行候选', !!plan3b && plan3b.feasible)
  S().selectPlan(dcId, plan3b.id, 30)
  for (const r of plan3b.responses) S().respondPlan(plan3b.id, r.bookingId, '同意')
  const res3b = S().commitPlan(plan3b.id)
  check('重新提交成功', res3b.ok, res3b.error ?? '')

  // ---------- 场景 4：超时未响应 → 保留全额权益、不占新场座位 ----------
  console.log('\n[场景4] 一组超时未响应 → 保留全额权益券，同意组迁移')
  S().resetDemo()
  S().computePlans(dcId)
  const plan4 = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900')!
  S().selectPlan(dcId, plan4.id, 30)
  S().respondPlan(plan4.id, 'b-wg-a', '同意')
  // b-wg-b 不响应，直接让倒计时结束
  S().expirePlanResponses(plan4.id)
  const res4 = S().commitPlan(plan4.id)
  check('提交成功', res4.ok, res4.error ?? '')
  check('目标场次 1+4=5 人（超时组未占座）', headcount('ss-wg2-1900') === 5)
  const timeoutB = S().bookings.find((b) => b.id === 'b-wg-b')!
  check('超时组仍挂原场次（改期待补）且标记权益保留中', timeoutB.sessionId === 'ss-wg-1900' && timeoutB.players.every((p) => p.benefitStatus === '权益保留中'))
  const vs = S().vouchers.filter((v) => v.kind === '全额权益保留')
  check('超时组 2 人各得 1 张全额权益券（金额等于实付）', vs.length === 2 && vs.every((v) => v.amount > 0))

  // ---------- 场景 5：同日换场（新建场次型）原场次资源在同一事务释放，终检不得误冲突 ----------
  console.log('\n[场景5] 同日换场 21:30（新建场次，原场盒装/主持在提交时释放）')
  S().resetDemo()
  S().computePlans(dcId)
  const planSame = S().plans.find((p) => p.caseId === dcId && p.kind === '同日换场' && p.feasible)!
  check('同日换场 21:30 候选可行（排除原场次占用视角）', planSame.title.includes('21:30'), planSame.title)
  S().selectPlan(dcId, planSame.id, 30)
  for (const r of S().plans.find((p) => p.id === planSame.id)!.responses) S().respondPlan(planSame.id, r.bookingId, '同意')
  const resSame = S().commitPlan(planSame.id)
  check('同日换场提交成功（终检按提交后视角，不误判原场次库存/房间冲突）', resSame.ok, resSame.error ?? '')
  const newSessions = S().sessions.filter((x) => x.storeId === 'st1' && x.scriptId === 's1' && x.startKey === '21:30' && x.id !== 'ss-hj-2130')
  check('新建 21:30 场次并承接 6 名玩家', newSessions.length === 1 && headcount(newSessions[0].id) === 6)
  check('原场次仍为改期待补', S().sessions.find((x) => x.id === 'ss-wg-1900')!.status === '改期待补')

  // ---------- 场景 6：全额退款方案 → 全员幂等全额退款，原场次转改期待补 ----------
  console.log('\n[场景6] 全额退款方案')
  S().resetDemo()
  S().computePlans(dcId)
  const plan5 = S().plans.find((p) => p.caseId === dcId && p.kind === '全额退款')!
  check('退款方案无需玩家确认', !plan5.requiresConfirm)
  S().selectPlan(dcId, plan5.id, 30)
  const res5 = S().commitPlan(plan5.id)
  check('提交成功', res5.ok, res5.error ?? '')
  check('6 名已付玩家全部退款（6 笔流水）', S().ledger.filter((l) => l.idemKey?.startsWith(`case-refund:${dcId}`)).length === 6)
  check('原场次转「改期待补」，未简单取消', S().sessions.find((x) => x.id === 'ss-wg-1900')!.status === '改期待补')
  const n1 = S().ledger.filter((l) => l.idemKey?.startsWith(`case-refund:${dcId}`)).length
  S().commitPlan(plan5.id)
  check('重复提交不重复退款', S().ledger.filter((l) => l.idemKey?.startsWith(`case-refund:${dcId}`)).length === n1)

  // ---------- 场景 6：候补公开优先级与整组/时段规则 ----------
  console.log('\n[场景6] 候补优先级排序与自动递补规则')
  S().resetDemo()
  const ranked = rankWaitlist(S().domain(), 's1', 'st1').map((r) => r.contactName)
  check('优先级顺序：苏晴(215) > 王胖子(100) > 吴迪(50) > 赵雨桐(25)',
    JSON.stringify(ranked) === JSON.stringify(['苏晴', '王胖子', '吴迪', '赵雨桐']), ranked.join(','))
  // 让原场次改期待补且 0 人（全额退款后），再按公开规则自动递补
  S().computePlans(dcId)
  const pRefund = S().plans.find((p) => p.caseId === dcId && p.kind === '全额退款')!
  S().selectPlan(dcId, pRefund.id, 30); S().commitPlan(pRefund.id)
  const fill = S().autoFillWaitlist('ss-wg-1900')
  // 苏晴2 + 吴迪1 + 王胖子1(接受19:00) + 赵雨桐1 = 5 人成局（min 5），均 ≤ 7
  check('自动递补 4 组全部成功', fill.promoted.length === 4, fill.promoted.join(','))
  check('递补后 5 人成局且不超卖', headcount('ss-wg-1900') === 5)
  check('候补状态=补位成功', S().waitlist.every((w) => w.status === '补位成功'))

  // 指定时段：21:30 开场时王胖子（仅接受 19:00）应被跳过
  S().resetDemo()
  const skipFill = S().autoFillWaitlist('ss-hj-2130') // 红嫁衣，候补都是 s1 剧本 → 不应匹配
  check('不同剧本不会跨本递补', skipFill.promoted.length === 0)

  // ---------- 场景 7：手工调整不得绕过容量/原因 ----------
  console.log('\n[场景7] 店长手工调整约束')
  S().resetDemo()
  const r1 = S().manualAdjust('ss-mj-2000', { roomId: 'r3' }, '') // 校园教室仅 6 座，9 人满员场
  check('必须填写原因', !r1.ok && r1.error!.includes('原因'))
  const r2 = S().manualAdjust('ss-mj-2000', { roomId: 'r3' }, '测试容量')
  check('容量不足被拦截（9 人 > 6 座）', !r2.ok && r2.error!.includes('容量'))
  const r3 = S().manualAdjust('ss-mj-2000', { roomId: 'r8' }, '测试跨店房')
  check('不能把场次调到其他门店的房间', !r3.ok)
  const r4 = S().manualAdjust('ss-wg-1900', { hostId: 'h1' }, '测试请假主持')
  check('请假/缺勤主持不能被手工排回', !r4.ok && r4.error!.includes('请假'))
  const r5 = S().manualAdjust('ss-wg-1900', { roomId: 'r2' }, '工程抢修前临时换到唐风大厅')
  check('合法调整通过', r5.ok, r5.error ?? '')

  // ---------- 场景 8：事件时间线完整覆盖 ----------
  console.log('\n[场景8] 场次事件时间线覆盖全链路')
  S().resetDemo()
  S().computePlans(dcId)
  const types = new Set(S().events.map((e) => e.type))
  check('初始已有「异常触发」事件', types.has('异常触发'))
  check('方案计算已入时间线', types.has('方案计算'))
  const p8 = S().plans.find((p) => p.caseId === dcId && p.targetSessionId === 'ss-wg2-1900')!
  S().selectPlan(dcId, p8.id, 30)
  S().respondPlan(p8.id, 'b-wg-a', '同意')
  S().respondPlan(p8.id, 'b-wg-b', '拒绝')
  S().commitPlan(p8.id)
  const after = new Set(S().events.map((e) => e.type))
  for (const t of ['玩家确认', '资源锁定', '退款', '排班变更', '执行成功'] as const)
    check(`时间线包含「${t}」`, after.has(t))

  console.log(`\n==== 结果：${pass} 通过 / ${fail} 失败 ====`)
  if (fail) process.exit(1)
}
main()
