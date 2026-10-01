// ============ 开场前异常处置：纯计算逻辑（无副作用，便于测试与回放） ============
import type {
  Booking, DisruptionCase, Host, Member, PlanFitItem, ReschedulePlan, Room,
  Script, ScriptCopy, Session, SessionStatus, StoreInfo, WaitlistEntry,
  ResourceLock, Player,
} from './types'
import { scriptRoles } from './seed'

/** 演示用：模拟“他店/外部临时包场”对资源的抢占声明 */
export interface SimClaim {
  id: string
  kind: '房间' | '主持' | '库存'
  refId: string
  startAt: string
  durationMin: number
  by: string
}

export interface Domain {
  stores: StoreInfo[]
  scripts: Script[]
  hosts: Host[]
  rooms: Room[]
  members: Member[]
  bookings: Booking[]
  sessions: Session[]
  copies: ScriptCopy[]
  waitlist: WaitlistEntry[]
  locks: ResourceLock[]
  simClaims: SimClaim[]
}

// ---------- 时间 / 占用 ----------
export const toMin = (startAt: string) => {
  const d = new Date(startAt.length === 16 ? startAt + ':00' : startAt)
  return d.getTime()
}
export const overlaps = (aStart: string, aDur: number, bStart: string, bDur: number) => {
  const t1 = toMin(aStart)
  const t2 = toMin(bStart)
  return t1 < t2 + bDur * 60000 && t2 < t1 + aDur * 60000
}
const pad2 = (n: number) => String(n).padStart(2, '0')
export const slotLabel = (startAt: string) => `${startAt.slice(5, 10)} ${startAt.slice(11, 16)}`

/** 场次是否仍占用资源（改期待补 / 已解散 / 已复盘 均释放资源） */
export const sessionOccupies = (s: Session) =>
  !['改期待补', '已解散', '已复盘'].includes(s.status)

/** 处于预占态的锁（提交成功后的「已生效」锁只作审计，实际占用已体现在场次上） */
const activeHolds = (locks: ResourceLock[], opts?: { excludePlan?: string }) =>
  locks.filter((l) => l.status === '已锁定' && (!opts?.excludePlan || l.planId !== opts.excludePlan))

// ---------- 资源可用性 ----------
export function roomBusy(d: Domain, room: Room, startAt: string, durMin: number, opts?: {
  excludeSession?: string; excludePlan?: string
}): { busy: boolean; reasons: string[] } {
  const reasons: string[] = []
  for (const o of room.outages) {
    const os = toMin(o.startAt)
    const oe = toMin(o.endAt)
    const s = toMin(startAt)
    if (s < oe && os < s + durMin * 60000) reasons.push(`房间故障/不可用：${o.reason}（${o.startAt.slice(5, 16).replace('T', ' ')}-${o.endAt.slice(11, 16)}）`)
  }
  for (const ss of d.sessions) {
    if (!sessionOccupies(ss) || ss.id === opts?.excludeSession) continue
    if (ss.roomId === room.id) {
      const script = d.scripts.find((x) => x.id === ss.scriptId)!
      if (overlaps(startAt, durMin, ss.startAt, script.durationMin))
        reasons.push(`被场次 ${ss.id}（${ss.startAt.slice(11, 16)}）占用`)
    }
  }
  for (const c of d.simClaims) {
    if (c.kind === '房间' && c.refId === room.id && overlaps(startAt, durMin, c.startAt, c.durationMin))
      reasons.push(`并发抢占：${c.by} 已临时锁定该房间`)
  }
  for (const l of activeHolds(d.locks, { excludePlan: opts?.excludePlan })) {
    if (l.kind === '目标房间' && l.refId === room.id) reasons.push(`异常改期单 ${l.caseId} 已预占该房间`)
  }
  return { busy: reasons.length > 0, reasons }
}

export function hostBusy(d: Domain, host: Host, startAt: string, durMin: number, opts?: {
  excludeSession?: string; excludePlan?: string
}): { busy: boolean; reasons: string[]; onLeave: boolean } {
  const reasons: string[] = []
  let onLeave = false
  if (host.unavailable.some((u) => u === startAt || overlaps(startAt, durMin, u, durMin))) {
    onLeave = true
    reasons.push('主持人该时段请假/缺勤')
  }
  for (const ss of d.sessions) {
    if (!sessionOccupies(ss) || ss.id === opts?.excludeSession) continue
    if (ss.hostId === host.id) {
      const script = d.scripts.find((x) => x.id === ss.scriptId)!
      if (overlaps(startAt, durMin, ss.startAt, script.durationMin))
        reasons.push(`主持该时段已有场次 ${ss.id}`)
    }
  }
  for (const c of d.simClaims) {
    if (c.kind === '主持' && c.refId === host.id && overlaps(startAt, durMin, c.startAt, c.durationMin))
      reasons.push(`并发抢占：${c.by} 已调走该主持`)
  }
  for (const l of activeHolds(d.locks, { excludePlan: opts?.excludePlan })) {
    if (l.kind === '主持班次' && l.refId === host.id) reasons.push(`异常改期单 ${l.caseId} 已预占该主持班次`)
  }
  return { busy: reasons.length > 0, reasons, onLeave }
}

export function copyBusy(d: Domain, copy: ScriptCopy, startAt: string, durMin: number, opts?: {
  excludeSession?: string; excludePlan?: string
}): { busy: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (copy.status !== '在库可排') reasons.push(`盒装库存状态为「${copy.status}」${copy.note ? `（${copy.note}）` : ''}`)
  for (const ss of d.sessions) {
    if (!sessionOccupies(ss) || ss.id === opts?.excludeSession) continue
    if (ss.copyId === copy.id) {
      const script = d.scripts.find((x) => x.id === ss.scriptId)!
      if (overlaps(startAt, durMin, ss.startAt, script.durationMin))
        reasons.push(`盒装正用于场次 ${ss.id}（${ss.startAt.slice(11, 16)}），一店一盒不可重叠`)
    }
  }
  for (const c of d.simClaims) {
    if (c.kind === '库存' && c.refId === copy.id && overlaps(startAt, durMin, c.startAt, c.durationMin))
      reasons.push(`并发抢占：${c.by} 已借走该盒装`)
  }
  for (const l of activeHolds(d.locks, { excludePlan: opts?.excludePlan })) {
    if (l.kind === '剧本库存' && l.refId === copy.id) reasons.push(`异常改期单 ${l.caseId} 已预占该盒装`)
  }
  return { busy: reasons.length > 0, reasons }
}

// ---------- 场次 / 同行组 ----------
export function sessionBookings(d: Domain, sessionId: string): Booking[] {
  return d.sessions.find((s) => s.id === sessionId)?.bookingIds
    .map((id) => d.bookings.find((b) => b.id === id))
    .filter((b): b is Booking => !!b && b.status !== '已取消') ?? []
}
export function activePlayers(bookings: Booking[]): Player[] {
  return bookings.flatMap((b) => b.players).filter((p) => !p.quit)
}
export function sessionHeadcount(d: Domain, sessionId: string): number {
  return activePlayers(sessionBookings(d, sessionId)).length
}
export function sessionVacancy(d: Domain, ss: Session): number {
  const script = d.scripts.find((x) => x.id === ss.scriptId)!
  const room = d.rooms.find((r) => r.id === ss.roomId)
  const cap = Math.min(script.maxPlayers, room?.capacity ?? script.maxPlayers)
  return Math.max(0, cap - sessionHeadcount(d, ss.id))
}

/** 角色人数 / 配置约束：容量与角色位不足一律视为硬违规，手工调整不得绕过 */
export function roleBalanceViolations(script: Script, players: Player[], opts?: { requireMin?: boolean }): string[] {
  const roles = scriptRoles[script.id] ?? []
  const out: string[] = []
  if (players.length > script.maxPlayers) out.push(`总人数 ${players.length} 超过剧本角色上限 ${script.maxPlayers}`)
  if (opts?.requireMin !== false && players.length < script.minPlayers) out.push(`总人数 ${players.length} 低于成局下限 ${script.minPlayers}`)
  const cRoleCount = Math.max(1, roles.filter((r) => /C\s?位|主角/.test(r.hint)).length)
  const strictC = players.filter((p) => !p.acceptCrossGender && /C位/.test(p.rolePreference)).length
  if (strictC > cRoleCount) out.push(`不接受反串且指定 C 位的玩家 ${strictC} 人，但 C 位角色仅 ${cRoleCount} 个，会造成角色配置失衡`)
  return out
}

// ---------- 资源挑选 ----------
interface Pick {
  blockers: string[]
  fit: PlanFitItem[]
  room?: Room
  host?: Host
  copy?: ScriptCopy
}

export function pickRoom(d: Domain, storeId: string, startAt: string, head: number, script: Script, opts?: {
  excludeSession?: string; excludePlan?: string
}): Pick {
  const fit: PlanFitItem[] = []
  const blockers: string[] = []
  const candidates = d.rooms
    .filter((r) => r.storeId === storeId && r.capacity >= head)
    .map((r) => ({ r, busy: roomBusy(d, r, startAt, script.durationMin, opts) }))
  const usable = candidates.filter((c) => !c.busy.busy)
  if (candidates.length === 0) blockers.push(`没有任何房间容量 ≥ ${head} 人`)
  if (candidates.length > 0 && usable.length === 0)
    blockers.push(`容量满足的房间全部不可用：${Array.from(new Set(candidates.flatMap((c) => c.busy.reasons))).join('；')}`)
  usable.sort((a, b) => {
    // 恐怖实景优先，其次容量贴合
    const sa = (script.horror !== '不恐怖' && a.r.horrorSet ? 0 : 1) + a.r.capacity / 100
    const sb = (script.horror !== '不恐怖' && b.r.horrorSet ? 0 : 1) + b.r.capacity / 100
    return sa - sb
  })
  const room = usable[0]?.r
  if (room) {
    fit.push({ label: '房间容量', ok: true, detail: `${room.name} 可容纳 ${room.capacity} 人 ≥ 迁移 ${head} 人` })
    if (script.horror !== '不恐怖' && !room.horrorSet)
      fit.push({ label: '恐怖实景', ok: true, detail: `${room.name} 非恐怖实景房，沉浸体验略有降级（不影响成局）` })
    else if (script.horror !== '不恐怖')
      fit.push({ label: '恐怖实景', ok: true, detail: `${room.name} 为恐怖实景房，场景匹配` })
  } else {
    fit.push({ label: '房间容量', ok: false, detail: blockers.join('；') })
  }
  return { blockers, fit, room }
}

export function pickHost(d: Domain, scriptId: string, startAt: string, preferStoreId: string, opts?: {
  excludeSession?: string; excludePlan?: string; excludeHostId?: string
}): Pick {
  const fit: PlanFitItem[] = []
  const blockers: string[] = []
  const script = d.scripts.find((x) => x.id === scriptId)!
  const checked = d.hosts
    .filter((h) => h.id !== opts?.excludeHostId)
    .map((h) => ({ h, busy: hostBusy(d, h, startAt, script.durationMin, opts), prof: h.proficiency[scriptId] ?? 0 }))
  const skilled = checked.filter((c) => c.prof >= 3)
  const usable = skilled.filter((c) => !c.busy.busy)
  usable.sort((a, b) => {
    const sa = (a.h.storeId === preferStoreId ? 0 : a.h.crossStore ? 1 : 2) + (5 - a.prof) / 10
    const sb = (b.h.storeId === preferStoreId ? 0 : b.h.crossStore ? 1 : 2) + (5 - b.prof) / 10
    return sa - sb
  })
  const host = usable[0]?.h
  if (!host) {
    const noSkill = checked.filter((c) => c.prof < 3)
    const busySkilled = skilled.filter((c) => c.busy.busy)
    if (skilled.length === 0 && noSkill.length > 0)
      blockers.push(`主持人技能不匹配：其余主持对《${script.name}》熟练度均低于 3/5（${noSkill.map((c) => `${c.h.name} ${c.prof}/5`).join('、')}）`)
    else
      blockers.push(`熟练主持（熟练度 ≥3）该时段均不可用：${busySkilled.map((c) => `${c.h.name}（${c.busy.reasons[0]}）`).join('；') || '无'}`)
    fit.push({ label: '主持技能匹配', ok: false, detail: blockers.join('；') })
  } else {
    const prof = host.proficiency[scriptId] ?? 0
    fit.push({
      label: '主持技能匹配', ok: true,
      detail: `${host.name} · ${host.level} · 《${script.name}》熟练度 ${prof}/5${host.storeId !== preferStoreId ? `（${d.stores.find((s) => s.id === host.storeId)?.shortName}跨店支援）` : ''}`,
    })
  }
  return { blockers, fit, host }
}

export function pickCopy(d: Domain, scriptId: string, storeId: string, startAt: string, opts?: {
  excludeSession?: string; excludePlan?: string
}): Pick {
  const fit: PlanFitItem[] = []
  const blockers: string[] = []
  const script = d.scripts.find((x) => x.id === scriptId)!
  const copies = d.copies.filter((c) => c.scriptId === scriptId && c.storeId === storeId)
  const checked = copies.map((c) => ({ c, busy: copyBusy(d, c, startAt, script.durationMin, opts) }))
  const usable = checked.filter((x) => !x.busy.busy)
  const copy = usable[0]?.c
  if (!copy) blockers.push(`《${script.name}》在 ${d.stores.find((s) => s.id === storeId)?.shortName} 无可用盒装库存：${Array.from(new Set(checked.flatMap((x) => x.busy.reasons))).join('；') || '该店未配盒装'}`)
  fit.push({
    label: '剧本库存', ok: !!copy,
    detail: copy ? `盒装 ${copy.code} 在库，可一次性锁定` : blockers.join('；'),
  })
  return { blockers, fit, copy, ...({} as object) } as Pick
}

// ---------- 候补优先级（公开规则） ----------
export const MEMBER_BONUS: Record<Member['level'], number> = { 金卡: 100, 银卡: 60, 普通: 0 }

export interface RankedWaitlist extends WaitlistEntry {
  member?: Member
  score: number
  scoreRules: string[]
}

export function rankWaitlist(d: Domain, scriptId: string, storeId: string): RankedWaitlist[] {
  const list = d.waitlist.filter((w) => w.scriptId === scriptId && w.storeId === storeId && w.status === '候补中')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
  const n = list.length
  return list.map((w, i) => {
    const member = d.members.find((m) => m.id === w.memberId)
    const rules: string[] = []
    let score = 0
    if (member) { const b = MEMBER_BONUS[member.level]; if (b) { score += b; rules.push(`${member.level}会员 +${b}`) } }
    if (member) { score += member.visits * 5; rules.push(`历史到店 ${member.visits} 次 ×5 = +${member.visits * 5}`) }
    if (w.prepaid) { score += 50; rules.push('已在线预付 +50') }
    const early = (n - 1 - i) * 20
    score += early; rules.push(`候补登记次序 +${early}`)
    rules.push(`同行 ${w.partySize} 人整组递补，不拆分`)
    return { ...w, member, score, scoreRules: rules }
  }).sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt))
}

/** 按公开优先级计算可递补名单（尊重自动补位策略 / 指定时段 / 整组容量 / 角色约束） */
export function planWaitlistFill(d: Domain, scriptId: string, storeId: string, startKey: string, seats: number): {
  entry: RankedWaitlist; accepted: boolean; reason: string
}[] {
  const ranked = rankWaitlist(d, scriptId, storeId)
  let left = seats
  return ranked.map((entry) => {
    if (entry.autoMode === '仅接受指定时段' && !entry.acceptedSlots.includes(startKey))
      return { entry, accepted: false, reason: `该组仅接受 ${entry.acceptedSlots.join('/')}，不接受 ${startKey} 时段` }
    if (entry.partySize > left)
      return { entry, accepted: false, reason: `整组 ${entry.partySize} 人 > 剩余名额 ${left}（公开规则不允许拆散同行组）` }
    left -= entry.partySize
    return { entry, accepted: true, reason: `优先级分 ${entry.score}，${entry.autoMode}，整组 ${entry.partySize} 人补入` }
  })
}

// ---------- 候选方案计算 ----------
let planSeq = 0
export const newPlanId = () => `rp-${(++planSeq).toString(36)}-${Date.now().toString(36)}`

const baseResponses = (d: Domain, ss: Session) =>
  sessionBookings(d, ss.id).map((b) => ({
    bookingId: b.id,
    partyNames: b.players.filter((p) => !p.quit).map((p) => p.name),
    decision: '待响应' as const,
  }))

/** 生成四类候选方案：同日换场 / 跨店迁移 / 全额退款 / 保留权益待补位 */
export function buildPlans(d: Domain, dc: DisruptionCase, nowIso: string): ReschedulePlan[] {
  const ss = d.sessions.find((x) => x.id === dc.sessionId)!
  const script = d.scripts.find((x) => x.id === ss.scriptId)!
  const store = d.stores.find((x) => x.id === ss.storeId)!
  const bookings = sessionBookings(d, ss.id)
  const head = activePlayers(bookings).length
  const plans: ReschedulePlan[] = []
  const absentHost = dc.type === '主持缺勤' ? ss.hostId : undefined

  const commonFit = (): PlanFitItem[] => [
    {
      label: '拼车/同行关系', ok: true,
      detail: bookings.map((b) => `${b.players.filter((p) => !p.quit).length} 人同行组（${b.contactName}组）`).join('；') + '，迁移/补位按整组处理，不拆分',
    },
    {
      label: '角色偏好', ok: roleBalanceViolations(script, activePlayers(bookings)).length === 0,
      detail: roleBalanceViolations(script, activePlayers(bookings))[0] ?? `全组 ${head} 人角色偏好可在《${script.name}》${script.maxPlayers} 个角色内满足`,
    },
  ]

  // ① 同日换场：本店同日其余开场
  for (const key of script.startTime.split(' / ')) {
    if (key === ss.startKey) continue
    const startAt = `${ss.date}T${key}`
    const roomPick = pickRoom(d, store.id, startAt, head, script, { excludeSession: ss.id })
    const hostPick = pickHost(d, script.id, startAt, store.id, { excludeSession: ss.id, excludeHostId: absentHost })
    const copyPick = pickCopy(d, script.id, store.id, startAt, { excludeSession: ss.id })
    const blockers = [...roomPick.blockers, ...hostPick.blockers, ...copyPick.blockers]
    plans.push({
      id: newPlanId(), caseId: dc.id, kind: '同日换场',
      title: `同日换场：${key} 在${store.shortName}重新开场`,
      targetStoreId: store.id, targetStartAt: startAt,
      targetRoomId: roomPick.room?.id, targetHostId: hostPick.host?.id, targetCopyId: copyPick.copy?.id,
      targetVacancy: script.maxPlayers - head,
      feasible: blockers.length === 0, blockers,
      explanations: [
        `保留同门店、同剧本，仅把开场从 ${ss.startKey} 调整到 ${key}`,
        hostPick.host?.storeId === store.id ? '主持由本店排班调剂' : '需跨店主持支援（已核对档期与熟练度）',
        '拒绝迁移的同行组全额退款；超时未响应组保留全额权益，不占新场座位',
      ],
      fit: [...commonFit(), ...roomPick.fit, ...hostPick.fit, ...copyPick.fit],
      fitScore: blockers.length ? 0 : 70 - Math.abs(key < ss.startKey ? 1 : 0) * 5 - (hostPick.host && hostPick.host.storeId !== store.id ? 8 : 0),
      requiresConfirm: true, responses: baseResponses(d, ss),
      status: '候选', contentions: [], createdAt: nowIso,
    })
  }

  // ② 跨店迁移：其他门店可并入的同剧本场次 + 可新建开场
  for (const target of d.stores.filter((x) => x.id !== store.id)) {
    // 已有同剧本场次：并入
    const existing = d.sessions.filter((x) =>
      sessionOccupies(x) && x.storeId === target.id && x.scriptId === script.id && x.date === ss.date)
    for (const es of existing) {
      const vacancy = sessionVacancy(d, es)
      const blockers: string[] = []
      const fit: PlanFitItem[] = []
      if (vacancy < head) blockers.push(`目标场次仅余 ${vacancy} 席 < 迁移 ${head} 人`)
      else fit.push({ label: '目标场次余量', ok: true, detail: `目标场次现有 ${sessionHeadcount(d, es.id)} 人，余 ${vacancy} 席，可整组并入` })
      const room = d.rooms.find((r) => r.id === es.roomId)
      const host = d.hosts.find((h) => h.id === es.hostId)
      const copy = d.copies.find((c) => c.id === es.copyId)
      if (room) fit.push({ label: '房间容量', ok: true, detail: `${room.name}（${room.capacity} 人）` })
      if (host) fit.push({ label: '主持技能匹配', ok: (host.proficiency[script.id] ?? 0) >= 3, detail: `${host.name} 熟练度 ${host.proficiency[script.id] ?? 0}/5` })
      else blockers.push('目标场次主持空缺')
      if (!copy || copy.status !== '在库可排') blockers.push(`目标盒装不可用（${copy?.status ?? '无盒装'}）`)
      else fit.push({ label: '剧本库存', ok: true, detail: `沿用目标场次盒装 ${copy.code}` })
      fit.push({ label: '通勤距离', ok: true, detail: `${target.name}（${target.district}${target.address}），迁移玩家发放交通补偿券` })
      plans.push({
        id: newPlanId(), caseId: dc.id, kind: '跨店迁移',
        title: `跨店迁移：并入${target.shortName} ${es.startKey} 场`,
        targetStoreId: target.id, targetSessionId: es.id, targetStartAt: es.startAt,
        targetRoomId: es.roomId, targetHostId: es.hostId, targetCopyId: es.copyId,
        targetVacancy: vacancy, targetExistingHeadcount: sessionHeadcount(d, es.id),
        feasible: blockers.length === 0, blockers,
        explanations: [
          `并入${target.shortName}已成局的同剧本场次，拼场玩家混合开局`,
          '同一盒装/主持/房间沿用目标场次，仅需锁定目标余量',
          '迁移玩家整组保留，发放交通补偿券；拒绝者全额退款',
        ],
        fit: [...commonFit(), ...fit],
        fitScore: blockers.length ? 0 : 90,
        requiresConfirm: true, responses: baseResponses(d, ss),
        status: '候选', contentions: [], createdAt: nowIso,
      })
    }
    // 新建开场（用于展示资源冲突型候选）
    for (const key of script.startTime.split(' / ')) {
      if (existing.some((e) => e.startKey === key)) continue
      const startAt = `${ss.date}T${key}`
      const roomPick = pickRoom(d, target.id, startAt, head, script, { excludeSession: ss.id })
      const hostPick = pickHost(d, script.id, startAt, target.id, { excludeSession: ss.id, excludeHostId: absentHost })
      const copyPick = pickCopy(d, script.id, target.id, startAt, { excludeSession: ss.id })
      const blockers = [...roomPick.blockers, ...hostPick.blockers, ...copyPick.blockers]
      plans.push({
        id: newPlanId(), caseId: dc.id, kind: '跨店迁移',
        title: `跨店迁移：${target.shortName} ${key} 新开一场`,
        targetStoreId: target.id, targetStartAt: startAt,
        targetRoomId: roomPick.room?.id, targetHostId: hostPick.host?.id, targetCopyId: copyPick.copy?.id,
        targetVacancy: script.maxPlayers - head,
        feasible: blockers.length === 0, blockers,
        explanations: [`在${target.shortName}按 ${key} 新开一场`, '需同时锁定目标房间、主持班次与盒装库存'],
        fit: [...commonFit(), ...roomPick.fit, ...hostPick.fit, ...copyPick.fit],
        fitScore: blockers.length ? 0 : 60,
        requiresConfirm: true, responses: baseResponses(d, ss),
        status: '候选', contentions: [], createdAt: nowIso,
      })
    }
  }

  // ③ 全额退款
  const paidTotal = activePlayers(bookings).filter((p) => p.paid).reduce((n, p) => n + p.paidAmount, 0)
  plans.push({
    id: newPlanId(), caseId: dc.id, kind: '全额退款',
    title: '全额退款：门店原因，原路全额退回，不扣占位费',
    feasible: true, blockers: [],
    explanations: [
      `共 ${activePlayers(bookings).filter((p) => p.paid).length} 名已付玩家，退款合计 ¥${paidTotal}`,
      '退款按幂等键执行，重复确认不会产生重复退款',
      '原场次转为「改期待补」，名额继续可售/可候补，不做简单取消',
    ],
    fit: [
      ...commonFit(),
      { label: '退款规则', ok: true, detail: '门店原因（主持缺勤/房间故障）触发，按剧本退款规则全额退回、不扣占位费' },
      { label: '幂等保护', ok: true, detail: '同一异常单同一玩家仅产生一笔退款流水' },
    ],
    fitScore: 40, requiresConfirm: false, responses: baseResponses(d, ss),
    status: '候选', contentions: [], createdAt: nowIso,
  })

  // ④ 保留权益待补位
  const wl = rankWaitlist(d, script.id, store.id)
  plans.push({
    id: newPlanId(), caseId: dc.id, kind: '保留权益待补位',
    title: '保留权益待补位：付款转全额权益，优先等待补位',
    feasible: true, blockers: [],
    explanations: [
      '已付金额转为「全额权益保留」券，不立即退款',
      `当前候补队列 ${wl.length} 组；资源修复/新场开出后，权益玩家优先补位、候补按公开优先级补位`,
      '原场次转为「改期待补」，房间/主持释放但名额继续可售/可候补',
    ],
    fit: [
      ...commonFit(),
      { label: '候补深度', ok: wl.length > 0, detail: wl.length ? `候补 ${wl.length} 组（队首：${wl[0].contactName} ${wl[0].partySize} 人，优先级分 ${wl[0].score}）` : '当前暂无候补，补位需等待新报名' },
      { label: '权益锁定', ok: true, detail: '权益券与玩家一一绑定，补位核销时不二次扣款' },
    ],
    fitScore: 30, requiresConfirm: false, responses: baseResponses(d, ss),
    status: '候选', contentions: [], createdAt: nowIso,
  })

  return plans.sort((a, b) => b.fitScore - a.fitScore || a.title.localeCompare(b.title))
}

/** 提交前对方案做最终可行性校验（原子提交的依据） */
export function validatePlan(d: Domain, dc: DisruptionCase, plan: ReschedulePlan): {
  stage: '原场次名额' | '目标房间' | '主持班次' | '剧本库存' | '目标余量' | '成局人数'
  ok: boolean
  error?: string
}[] {
  const origin = d.sessions.find((x) => x.id === dc.sessionId)
  const script = d.scripts.find((x) => x.id === origin?.scriptId)!
  const stages: ReturnType<typeof validatePlan> = []
  const consent = plan.responses.filter((r) => r.decision === '同意').map((r) => d.bookings.find((b) => b.id === r.bookingId)!).filter(Boolean)
  const consentPlayers = activePlayers(consent)

  // 阶段 1：原场次名额（退款/保留权益类不迁移资源，原房间/主持被抢占不阻塞；迁移类必须校验）
  if (!origin) stages.push({ stage: '原场次名额', ok: false, error: '原场次不存在' })
  else {
    const stillLinked = consent.every((b) => origin.bookingIds.includes(b.id) || b.sessionId === origin.id)
    const otherHold = d.locks.find((l) => l.kind === '原场次名额' && l.refId === origin.id && l.status === '已锁定' && l.planId !== plan.id)
    const extClaim = d.simClaims.find((c) => (c.kind === '房间' && c.refId === origin.roomId) || (c.kind === '主持' && c.refId === origin.hostId))
    const migrationLike = plan.kind === '同日换场' || plan.kind === '跨店迁移'
    const err = !stillLinked ? '同意迁移的预约已不在原场次（可能被其他流程处理）'
      : otherHold ? `原场次名额正被异常单 ${otherHold.caseId} 锁定`
        : migrationLike && extClaim ? `并发抢占：原场次资源被「${extClaim.by}」抢先变更`
          : ['已解散', '已复盘'].includes(origin.status) ? `原场次状态为「${origin.status}」，不可迁移`
            : undefined
    stages.push({ stage: '原场次名额', ok: !err, error: err })
  }

  if (plan.kind === '全额退款' || plan.kind === '保留权益待补位') return stages

  // 同意人数
  if (!plan.targetSessionId && consentPlayers.length < script.minPlayers)
    stages.push({ stage: '成局人数', ok: false, error: `同意迁移仅 ${consentPlayers.length} 人，低于《${script.name}》成局下限 ${script.minPlayers}（拒绝/超时组不随迁）；可延长确认或改选退款/保留权益` })
  else stages.push({ stage: '成局人数', ok: true })

  // 目标余量（并入已有场次）
  if (plan.targetSessionId) {
    const target = d.sessions.find((x) => x.id === plan.targetSessionId)
    if (!target) stages.push({ stage: '目标余量', ok: false, error: '目标场次不存在' })
    else {
      const vacancy = sessionVacancy(d, target)
      stages.push({ stage: '目标余量', ok: vacancy >= consentPlayers.length, error: vacancy < consentPlayers.length ? `并发抢占：目标场次余量仅剩 ${vacancy}（需 ${consentPlayers.length}）` : undefined })
    }
  }

  // 房间 / 主持 / 库存（终检按“提交后”视角：原场次在同一事务中转为改期待补、释放资源，
  // 故新建场次型方案需同时把原场次排除；并入型方案排除目标场次本身）
  const startAt = plan.targetStartAt!
  const exclude = plan.targetSessionId ?? origin?.id
  if (plan.targetRoomId) {
    const room = d.rooms.find((r) => r.id === plan.targetRoomId)!
    const busy = roomBusy(d, room, startAt, script.durationMin, { excludeSession: exclude, excludePlan: plan.id })
    stages.push({ stage: '目标房间', ok: !busy.busy, error: busy.busy ? busy.reasons.join('；') : undefined })
  } else stages.push({ stage: '目标房间', ok: false, error: '未匹配到可用房间' })

  if (plan.targetHostId) {
    const host = d.hosts.find((h) => h.id === plan.targetHostId)!
    const busy = hostBusy(d, host, startAt, script.durationMin, { excludeSession: exclude, excludePlan: plan.id })
    stages.push({ stage: '主持班次', ok: !busy.busy, error: busy.busy ? busy.reasons.join('；') : undefined })
  } else stages.push({ stage: '主持班次', ok: false, error: '未匹配到熟练主持' })

  if (plan.targetCopyId) {
    const copy = d.copies.find((c) => c.id === plan.targetCopyId)!
    const busy = copyBusy(d, copy, startAt, script.durationMin, { excludeSession: exclude, excludePlan: plan.id })
    stages.push({ stage: '剧本库存', ok: !busy.busy, error: busy.busy ? busy.reasons.join('；') : undefined })
  } else stages.push({ stage: '剧本库存', ok: false, error: '未锁定盒装库存' })

  return stages
}

export const statusColor = (s: SessionStatus) =>
  ({ 待成局: 'amber', 已成局: 'green', 改期待补: 'amber', 已签到: 'blue', 角色已分: 'purple', 道具已发: 'purple', 进行中: 'gold', 休息中: 'amber', 已结账: 'green', 已复盘: 'green', 已解散: 'red' }) as const
