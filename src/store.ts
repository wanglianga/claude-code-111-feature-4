import { create, type StateCreator } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Script, Host, Room, Member, Booking, Session, Ticket, LedgerEntry,
  Review, HostDebrief, Player, SessionStatus, TicketType,
  PropIssue, PropStatus, Store, ScriptStock, WaitlistEntry,
  Disruption, DisruptionType, ReschedulePlan, PlanKind, PlanResponse,
  ResourceLock, EntitlementLog, IncidentEvent,
} from './types'
import {
  seedScripts, seedHosts, seedRooms, seedMembers, seedBookings,
  seedSessions, seedTickets, seedLedger, seedProps, seedStores,
  seedStocks, seedWaitlist, seedDisruptions, seedEvents, scriptRoles,
} from './seed'
import { computeWaitScore, matchRoles, overlaps, type RoleDef } from './domain'

// ---------- 工具 ----------
let seq = 100
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`
const now = () => new Date().toISOString().slice(0, 19)
const today = () => new Date().toISOString().slice(0, 10)

export const memberDiscount = (level?: Member['level']) =>
  level === '金卡' ? 0.9 : level === '银卡' ? 0.95 : 1

/** 占用资源的场次状态（已改期/已解散/已结账/已复盘 不再占用） */
const ACTIVE_STATUSES: SessionStatus[] =
  ['待成局', '已成局', '已签到', '角色已分', '道具已发', '进行中', '休息中', '待补位']

interface State {
  stores: Store[]
  scripts: Script[]
  hosts: Host[]
  rooms: Room[]
  stocks: ScriptStock[]
  members: Member[]
  bookings: Booking[]
  sessions: Session[]
  tickets: Ticket[]
  ledger: LedgerEntry[]
  reviews: Review[]
  debriefs: HostDebrief[]
  waitlist: WaitlistEntry[]
  disruptions: Disruption[]
  locks: ResourceLock[]
  entitlements: EntitlementLog[]
  events: IncidentEvent[]
  currentRole: 'player' | 'frontdesk' | 'host' | 'manager' | 'service'
  currentMemberId?: string

  setRole: (r: State['currentRole'], memberId?: string) => void

  // 玩家：预约 / 候补
  submitBooking: (input: {
    scriptId: string
    mode: Booking['mode']
    playersCount: number
    contactName: string
    contactPhone: string
    memberId?: string
    note: string
    expectedStart: string
    rolePreferences: string[]
    acceptCross: boolean[]
    genders: Player['gender'][]
    acknowledgedSafety: boolean
    payMethod: Booking['payMethod']
  }) => string
  cancelBooking: (id: string) => void
  joinWaitlist: (input: {
    scriptId: string; storeId: string; date: string; name: string; phone: string
    memberId?: string; mode: Player['waitlistMode']; slots: string[]; groupSize: number; note?: string
  }) => string

  // 排班
  generateSession: (scriptId: string, date: string, startKey: string, mode: Session['mode'], storeId?: string) => string | { error: string }
  assignRoom: (sessionId: string, roomId: string) => void
  assignHost: (sessionId: string, hostId: string) => void
  eligibleHosts: (scriptId: string, startAt: string, storeId?: string) => Host[]
  eligibleRooms: (scriptId: string, startAt: string, storeId?: string) => string[]

  // 场次状态机
  advanceSession: (sessionId: string) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  checkInPlayer: (sessionId: string, playerId: string) => void
  markLate: (sessionId: string, playerId: string, late: boolean) => void
  quitPlayer: (sessionId: string, playerId: string, note: string) => void
  assignRole: (sessionId: string, playerId: string, roleName: string) => void
  autoAssignRoles: (sessionId: string) => void
  issueProps: (sessionId: string) => void
  toggleBreak: (sessionId: string) => void
  noteHostInterrupt: (sessionId: string, note: string) => void
  returnProp: (sessionId: string, propId: string, condition: PropStatus, note?: string) => void
  checkoutSession: (sessionId: string) => void
  disbandSession: (sessionId: string, reason: string) => void
  collectDeposit: (sessionId: string) => void
  payPlayer: (sessionId: string, playerId: string) => void

  // 工单
  raiseTicket: (input: {
    sessionId?: string; bookingId?: string; playerId?: string
    type: TicketType; title: string; detail: string; raisedBy: string
    refundAmount?: number; depositDeduct?: number
  }) => void
  progressTicket: (id: string, action: string, actor: string, patch?: Partial<Ticket>) => void
  approveTicket: (id: string, manager: string, resolution: string) => void
  rejectTicket: (id: string, manager: string, reason: string) => void

  postLedger: (e: Omit<LedgerEntry, 'id' | 'at'>) => void

  // 复盘
  submitReview: (r: Omit<Review, 'id' | 'at'>) => void
  submitDebrief: (d: Omit<HostDebrief, 'id' | 'at'>) => void

  // ========== 开场前异常处置 ==========
  triggerDisruption: (input: {
    sessionId: string; type: DisruptionType; reason: string; detail: string; raisedBy: string
  }) => string | { error: string }
  cancelDisruption: (disruptionId: string, reason: string, actor: string) => void
  computePlans: (disruptionId: string) => void
  publishPlan: (disruptionId: string, planId: string, actor: string, deadlineMin?: number) => void | { error: string }
  voidPlan: (disruptionId: string, planId: string, actor: string, reason: string) => void
  respondPlan: (planId: string, playerId: string, response: PlanResponse, slots?: string[]) => void
  setRejectPolicy: (disruptionId: string, policy: Disruption['rejectPolicy']) => void
  /** 一次性锁定四类资源；injectFailure 模拟并发确认中某资源被别处抢占 */
  confirmMigration: (disruptionId: string, actor: string, injectFailure?: ResourceLock['kind']) =>
    { ok: true; newSessionId: string } | { ok: false; errors: string[] }
  /** 超时巡检：方案确认倒计时 / 候补通知倒计时 */
  tick: () => void

  // 候补
  pinWaitlist: (id: string, reason: string, by: string) => void
  notifyWaitlist: (id: string, sessionId: string, by: string) => void | { error: string }
  respondWaitlist: (id: string, accept: boolean) => void | { error: string }
  manualFillWaitlist: (id: string, sessionId: string, reason: string, by: string) => void | { error: string }

  resetDemo: () => void
}

export const useStore = create<State>()(
  persist(
    ((set, get) => {
      // ---------- 内部辅助（闭包，不暴露） ----------
      const addEvent = (e: Omit<IncidentEvent, 'id'>) =>
        set((s) => ({ events: [{ ...e, id: uid('ev') }, ...s.events] }))

      /** 某房间在 startAt 是否被占用（可排除源/目标场次自身） */
      const roomBusyAt = (st: ReturnType<typeof useStore.getState>, roomId: string, startAt: string, durMin: number, exclude: string[] = [], includeLocks = true) =>
        st.sessions.some((ss) => !exclude.includes(ss.id) && ACTIVE_STATUSES.includes(ss.status) && ss.roomId === roomId &&
          overlaps(ss.startAt, st.scripts.find((x) => x.id === ss.scriptId)!.durationMin, startAt, durMin)) ||
        (includeLocks && st.locks.some((l) => l.status === '已锁定' && l.kind === '目标房间' && l.refId === roomId &&
          overlaps(l.startAt, durMin, startAt, durMin)))

      /** 某主持在 startAt 是否有班 */
      const hostBusyAt = (st: ReturnType<typeof useStore.getState>, hostId: string, startAt: string, durMin: number, exclude: string[] = [], includeLocks = true) =>
        st.sessions.some((ss) => !exclude.includes(ss.id) && ACTIVE_STATUSES.includes(ss.status) && ss.hostId === hostId &&
          overlaps(ss.startAt, st.scripts.find((x) => x.id === ss.scriptId)!.durationMin, startAt, durMin)) ||
        (includeLocks && st.locks.some((l) => l.status === '已锁定' && l.kind === '主持人班次' && l.refId === hostId &&
          overlaps(l.startAt, durMin, startAt, durMin)))

      /** 剧本库存：迁出版次释放后，目标门店在该时段还能否开 */
      const stockFeasible = (st: ReturnType<typeof useStore.getState>, storeId: string, scriptId: string, startAt: string, sourceSessionId?: string, targetSessionId?: string) => {
        const script = st.scripts.find((x) => x.id === scriptId)!
        const copies = st.stocks.find((x) => x.storeId === storeId && x.scriptId === scriptId)?.copies ?? 0
        const usedBySessions = st.sessions.filter((ss) =>
          ss.id !== sourceSessionId && ss.id !== targetSessionId && ACTIVE_STATUSES.includes(ss.status) &&
          ss.storeId === storeId && ss.scriptId === scriptId &&
          overlaps(ss.startAt, script.durationMin, startAt, script.durationMin)).length
        const usedByLocks = st.locks.filter((l) => l.status === '已锁定' && l.kind === '剧本库存' &&
          l.storeId === storeId && l.refId === `${storeId}:${scriptId}` &&
          overlaps(l.startAt, script.durationMin, startAt, script.durationMin)).length
        return { copies, used: usedBySessions + usedByLocks, available: copies - usedBySessions - usedByLocks }
      }

      /** 方案下每个同行组的确认有效性（拼车关系：整组接受才迁移；「仅指定时段」且目标时段命中视为接受） */
      const planGroups = (plan: ReschedulePlan) => {
        const st = get()
        const d = st.disruptions.find((x) => x.id === plan.disruptionId)!
        const ss = st.sessions.find((x) => x.id === d.sessionId)!
        return st.bookings.filter((b) => b.sessionId === ss.id).map((b) => {
          const members = b.players.filter((p) => !p.quit)
          const accepts = (p: Player) => {
            const r = plan.responses[p.id] ?? '待确认'
            return r === '已接受' || (r === '仅指定时段' && p.acceptableSlots.includes(plan.startAt))
          }
          const responses = members.map((p) => ({ pid: p.id, name: p.name, resp: plan.responses[p.id] ?? '待确认' as PlanResponse }))
          const allAccepted = members.every((p) => accepts(p))
          const slotCompatible = members.every((p) => p.acceptableSlots.length === 0 || p.acceptableSlots.includes(plan.startAt))
          return { bookingId: b.id, members, responses, allAccepted, slotCompatible, move: allAccepted && slotCompatible }
        })
      }

      type MigrationResult = { ok: true; newSessionId: string } | { ok: false; errors: string[] }

      /** 全额退款方案执行（逐玩家幂等，防重复退款） */
      const executeRefund = (did: string, actor: string): MigrationResult => {
        const st = get()
        const d = st.disruptions.find((x) => x.id === did)!
        const plan = d.plans.find((p) => p.id === d.publishedPlanId)!
        if (plan.status === '已执行') return { ok: true, newSessionId: '' }
        const ss = st.sessions.find((x) => x.id === d.sessionId)!
        const players = st.bookings.filter((b) => b.sessionId === ss.id).flatMap((b) => b.players).filter((p) => !p.quit)
        const lock: ResourceLock = {
          id: uid('lk'), disruptionId: did, planId: plan.id, kind: '原场次名额', refId: ss.id,
          storeId: ss.storeId, startAt: ss.startAt, status: '已锁定', lockedAt: now(),
          detail: '全额退款：锁定原场次名额后统一释放',
        }
        // 幂等退款：同 plan+player 已存在退款流水则跳过
        let refunded = 0
        players.forEach((p) => {
          if (p.paid && p.paidAmount > 0) {
            const dup = get().ledger.some((l) => l.planId === plan.id && l.playerId === p.id && l.kind === '退款支出')
            if (!dup) {
              get().postLedger({ kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: ss.id, planId: plan.id, memo: `门店异常全额退款：${p.name}（方案幂等）`, operator: actor })
              refunded += p.paidAmount
            }
          }
        })
        set((s) => ({
          locks: [{ ...lock, status: '已提交' }, ...s.locks],
          sessions: s.sessions.map((x) => x.id === ss.id ? { ...x, status: '已解散', roomId: undefined, hostId: undefined } : x),
          bookings: s.bookings.map((b) => b.sessionId === ss.id ? { ...b, status: '已取消' as const } : b),
          disruptions: s.disruptions.map((x) => x.id === did ? {
            ...x, status: '已退款关闭', resolvedAt: now(), lockIds: [...x.lockIds, lock.id],
            resolution: `全员全额退款 ¥${refunded}，场次关闭，资源释放`,
            plans: x.plans.map((p) => p.id === plan.id ? { ...p, status: '已执行', executedAt: now(), executionNote: `全额退款完成 ¥${refunded}` } : p),
          } : x),
        }))
        addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '资源锁定', level: 'ok', action: '原场次名额锁定后统一释放，主持/房间班次与库存回到可售池' })
        addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '退款补偿', level: 'warn', action: `全额退款方案执行：${players.length} 人合计退款 ¥${refunded}（逐玩家幂等，重复确认不产生重复退款）` })
        const ticket = get().tickets.find((t) => t.sessionId === ss.id && t.type === '主持请假' && t.status !== '已解决')
        if (ticket) get().progressTicket(ticket.id, `异常处置完成：全额退款 ¥${refunded}`, actor, { status: '已解决', resolution: '门店原因，全额退款' })
        return { ok: true, newSessionId: '' }
      }

      /** 保留权益方案执行（不退款、不重复扣款，全员转入候补池） */
      const executeRetain = (did: string, actor: string): MigrationResult => {
        const st = get()
        const d = st.disruptions.find((x) => x.id === did)!
        const plan = d.plans.find((p) => p.id === d.publishedPlanId)!
        if (plan.status === '已执行') return { ok: true, newSessionId: '' }
        const ss = st.sessions.find((x) => x.id === d.sessionId)!
        const players = st.bookings.filter((b) => b.sessionId === ss.id).flatMap((b) => b.players).filter((p) => !p.quit)
        players.forEach((p) => {
          if (p.paid && p.paidAmount > 0 && !get().entitlements.some((e) => e.planId === plan.id && e.playerId === p.id)) {
            set((s) => ({
              entitlements: [{ id: uid('en'), at: now(), playerId: p.id, playerName: p.name, kind: '保留', amount: p.paidAmount, sessionId: ss.id, planId: plan.id, memo: '选择保留权益待补位', operator: actor }, ...s.entitlements],
            }))
            const member = get().members.find((m) => m.id === p.memberId)
            const { score, parts } = computeWaitScore({ member, mode: p.waitlistMode, ageMinutes: 0, groupSize: 1 })
            const entry: WaitlistEntry = {
              id: uid('w'), storeId: ss.storeId, scriptId: ss.scriptId, date: ss.date,
              playerId: p.id, playerName: p.name, phone: p.phone, memberId: p.memberId,
              score: score + 50, scoreParts: [{ label: '权益保留（已付费）', value: 50 }, ...parts],
              groupKey: uid('g'), groupSize: 1, mode: p.waitlistMode, acceptableSlots: p.acceptableSlots,
              status: '排队中', createdAt: now(), note: `已付 ¥${p.paidAmount} 保留待补位`,
            }
            set((s) => ({ waitlist: [entry, ...s.waitlist] }))
          }
        })
        const lock: ResourceLock = {
          id: uid('lk'), disruptionId: did, planId: plan.id, kind: '原场次名额', refId: ss.id,
          storeId: ss.storeId, startAt: ss.startAt, status: '已锁定', lockedAt: now(),
          detail: '保留权益：原名额转入候补池，资源释放',
        }
        set((s) => ({
          locks: [{ ...lock, status: '已提交' }, ...s.locks],
          sessions: s.sessions.map((x) => x.id === ss.id ? { ...x, status: '待补位', roomId: undefined, hostId: undefined } : x),
          bookings: s.bookings.map((b) => b.sessionId === ss.id ? { ...b, status: '待拼场' as const } : b),
          disruptions: s.disruptions.map((x) => x.id === did ? {
            ...x, status: '已退款关闭', resolvedAt: now(), lockIds: [...x.lockIds, lock.id],
            resolution: '全员保留权益，进入候补补位池',
            plans: x.plans.map((p) => p.id === plan.id ? { ...p, status: '已执行', executedAt: now(), executionNote: '权益全部保留并转入候补池' } : p),
          } : x),
        }))
        addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '退款补偿', level: 'info', action: `保留权益方案执行：${players.length} 人已付费用转为候补权益（不退款、不重复扣款），按自动补位/指定时段策略等待补位核销` })
        return { ok: true, newSessionId: '' }
      }

      return {
        stores: seedStores,
        scripts: seedScripts,
        hosts: seedHosts,
        rooms: seedRooms,
        stocks: seedStocks,
        members: seedMembers,
        bookings: seedBookings,
        sessions: seedSessions,
        tickets: seedTickets,
        ledger: seedLedger,
        reviews: [],
        debriefs: [],
        waitlist: seedWaitlist,
        disruptions: seedDisruptions,
        locks: [],
        entitlements: [],
        events: seedEvents,
        currentRole: 'manager',

        setRole: (r, memberId) => set({ currentRole: r, currentMemberId: memberId }),

        // ---------------- 玩家预约 ----------------
        submitBooking: (input) => {
          const script = get().scripts.find((s) => s.id === input.scriptId)!
          const id = uid('b')
          const startAt = input.expectedStart
          const players: Player[] = Array.from({ length: input.playersCount }, (_, i) => {
            const isContact = i === 0
            const member = isContact ? get().members.find((m) => m.id === input.memberId) : undefined
            const price = Math.round(script.price * memberDiscount(member?.level))
            const paid = input.payMethod === '在线预付'
            return {
              id: uid('pl'),
              name: isContact ? input.contactName : `${input.contactName}的同伴${i + 1}`,
              phone: isContact ? input.contactPhone : '',
              memberId: isContact ? input.memberId : undefined,
              gender: input.genders[i] ?? '不便透露',
              rolePreference: input.rolePreferences[i] || '随意',
              acceptCrossGender: input.acceptCross[i] ?? true,
              isBirthday: isContact && input.mode === '生日局',
              paid,
              paidAmount: paid ? price : 0,
              checkedIn: false,
              acceptableSlots: [],
              waitlistMode: '自动补位',
            }
          })
          const booking: Booking = {
            id, scriptId: input.scriptId, mode: input.mode, playersCount: input.playersCount,
            contactName: input.contactName, contactPhone: input.contactPhone, memberId: input.memberId,
            note: input.note, expectedStart: startAt, status: '待拼场', createdAt: now(), players,
            acknowledgedSafety: input.acknowledgedSafety, payMethod: input.payMethod,
          }
          set((s) => ({ bookings: [booking, ...s.bookings] }))
          if (input.payMethod === '在线预付') {
            players.forEach((p) =>
              get().postLedger({
                kind: '报名费收入', amount: p.paidAmount, playerId: p.id, sessionId: '',
                memo: `${p.name}《${script.name}》预付报名费`, operator: input.contactName,
              }),
            )
          }
          return id
        },

        cancelBooking: (bid) => {
          const st = get()
          const b = st.bookings.find((x) => x.id === bid)
          if (!b || b.status === '已成局') return
          b.players.filter((p) => p.paid).forEach((p) =>
            get().postLedger({
              kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: '',
              memo: `${p.name} 取消预约，原路退款`, operator: '系统',
            }),
          )
          set((s) => ({ bookings: s.bookings.map((x) => (x.id === bid ? { ...x, status: '已取消' } : x)) }))
        },

        joinWaitlist: (input) => {
          const member = get().members.find((m) => m.id === input.memberId)
          const age = 0
          const { score, parts } = computeWaitScore({ member, mode: input.mode, ageMinutes: age, groupSize: input.groupSize })
          const entry: WaitlistEntry = {
            id: uid('w'), storeId: input.storeId, scriptId: input.scriptId, date: input.date,
            playerId: uid('plw'), playerName: input.name, phone: input.phone, memberId: input.memberId,
            score, scoreParts: parts, groupKey: uid('g'), groupSize: input.groupSize,
            mode: input.mode, acceptableSlots: input.slots, status: '排队中', createdAt: now(), note: input.note,
          }
          set((s) => ({ waitlist: [entry, ...s.waitlist] }))
          addEvent({
            at: now(), scope: `waitlist:${input.storeId}:${input.scriptId}:${input.date}`,
            category: '候补递补', actor: input.name, level: 'info',
            action: `进入候补队列（${input.mode}${input.slots.length ? `·仅 ${input.slots.map((x) => x.slice(11)).join('/')}` : ''}·${input.groupSize} 人同行），公开优先级分 ${score}`,
          })
          return entry.id
        },

        // ---------------- 排班成局 ----------------
        eligibleHosts: (scriptId, startAt, storeId) => {
          const s = get()
          const script = s.scripts.find((x) => x.id === scriptId)!
          return s.hosts
            .filter((h) => !storeId || h.storeId === storeId)
            .filter((h) => !h.unavailable.includes(startAt))
            .filter((h) => !hostBusyAt(s, h.id, startAt, script.durationMin))
            .sort((a, b) => (b.proficiency[scriptId] ?? 0) - (a.proficiency[scriptId] ?? 0))
        },

        eligibleRooms: (scriptId, startAt, storeId) => {
          const s = get()
          const script = s.scripts.find((x) => x.id === scriptId)!
          return s.rooms
            .filter((r) => !storeId || r.storeId === storeId)
            .filter((r) => r.capacity >= script.minPlayers)
            .filter((r) => !r.downSlots.includes(startAt))
            .filter((r) => !roomBusyAt(s, r.id, startAt, script.durationMin))
            .sort((a, b) => a.capacity - b.capacity)
            .map((r) => r.id)
        },

        generateSession: (scriptId, date, startKey, mode, storeId = 'st1') => {
          const st = get()
          const script = st.scripts.find((s) => s.id === scriptId)!
          const startAt = `${date}T${startKey}`

          const pool = st.bookings.filter((b) =>
            b.scriptId === scriptId && b.status === '待拼场' &&
            (mode === '拼场' || b.mode === mode || mode === '生日局') &&
            b.expectedStart === startAt,
          )
          let picked: Booking[] = []
          if (mode === '包场') {
            const cand = [...pool].sort((a, b) => b.playersCount - a.playersCount)[0]
            if (!cand) return { error: '该开场没有可包场的预约单' }
            picked = [cand]
          } else {
            let acc = 0
            for (const b of pool) {
              if (acc >= script.maxPlayers) break
              picked.push(b)
              acc += b.playersCount
            }
          }
          const headcount = picked.reduce((n, b) => n + b.playersCount, 0)
          if (headcount < script.minPlayers)
            return { error: `当前拼场仅 ${headcount} 人，未达《${script.name}》成局下限 ${script.minPlayers} 人` }

          const hosts = get().eligibleHosts(scriptId, startAt, storeId)
          const roomIds = get().eligibleRooms(scriptId, startAt, storeId)
          if (!roomIds.length) return { error: '该时段没有空闲房间（容量满足、未被占用、未故障停用）' }
          const stock = stockFeasible(st, storeId, scriptId, startAt)
          if (stock.available <= 0) return { error: `该门店《${script.name}》盒装本库存不足（${stock.copies} 套均在开/锁定）` }

          const id = uid('ss')
          const bestHost = hosts[0]
          const session: Session = {
            id, storeId, scriptId, date, startKey, startAt, mode,
            roomId: roomIds[0], hostId: bestHost?.id,
            status: bestHost && (bestHost.proficiency[scriptId] ?? 0) >= 3 ? '已成局' : '待成局',
            bookingIds: picked.map((b) => b.id),
            propIssues: [], depositCharged: 0, createdAt: now(), createdBy: '排班系统',
          }
          set((s) => ({
            sessions: [session, ...s.sessions],
            bookings: s.bookings.map((b) =>
              picked.some((p) => p.id === b.id) ? { ...b, status: '已成局', sessionId: id } : b,
            ),
          }))
          if (!bestHost) {
            get().raiseTicket({
              sessionId: id, type: '主持请假', title: `《${script.name}》${startKey} 场次无可用主持`,
              detail: '排班时所有主持该时段均无档期，需要店长调班或外借主持，否则建议解散并退款。',
              raisedBy: 'system',
            })
          } else if ((bestHost.proficiency[scriptId] ?? 0) < 3) {
            get().raiseTicket({
              sessionId: id, type: '主持请假', title: `主持「${bestHost.name}」对《${script.name}》熟练度不足`,
              detail: `熟练度 ${bestHost.proficiency[scriptId] ?? 0}/5，建议换资深主持或安排复盘带教。`,
              raisedBy: 'system',
            })
          }
          return id
        },

        assignRoom: (sid, roomId) =>
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sid ? { ...x, roomId } : x)) })),
        assignHost: (sid, hostId) =>
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sid ? { ...x, hostId } : x)) })),

        // ---------------- 场次推进 ----------------
        setSessionStatus: (sid, status) =>
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sid ? { ...x, status } : x)) })),

        advanceSession: (sid) => {
          const order: SessionStatus[] = ['待成局', '已成局', '已签到', '角色已分', '道具已发', '进行中', '休息中', '进行中', '已结账', '已复盘']
          const ss = get().sessions.find((x) => x.id === sid)!
          const next = order[order.indexOf(ss.status) + 1]
          if (next) get().setSessionStatus(sid, next)
        },

        checkInPlayer: (sid, pid) =>
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid
                ? { ...b, players: b.players.map((p) => (p.id === pid ? { ...p, checkedIn: true, checkInAt: now(), late: p.late ?? false } : p)) }
                : b,
            ),
          })),

        markLate: (sid, pid, late) =>
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid ? { ...b, players: b.players.map((p) => (p.id === pid ? { ...p, late } : p)) } : b,
            ),
          })),

        quitPlayer: (sid, pid, note) => {
          const st = get()
          const p = st.bookings.flatMap((b) => b.players).find((x) => x.id === pid)
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid ? { ...b, players: b.players.map((x) => (x.id === pid ? { ...x, quit: true, checkedIn: false } : x)) } : b,
            ),
          }))
          get().raiseTicket({
            sessionId: sid, playerId: pid, type: '临时退出',
            title: `玩家「${p?.name ?? pid}」临时退出`,
            detail: note || '玩家开场前/中途临时退出，申请按退款规则处理并重新评估成局人数。',
            raisedBy: '前台',
            refundAmount: p?.paid ? Math.round(p.paidAmount * 0.7) : undefined,
          })
        },

        assignRole: (sid, pid, roleName) =>
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid ? { ...b, players: b.players.map((p) => (p.id === pid ? { ...p, assignedRole: roleName } : p)) } : b,
            ),
          })),

        autoAssignRoles: (sid) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          const roles = scriptRoles[ss.scriptId] ?? []
          const players = st.bookings.filter((b) => b.sessionId === sid).flatMap((b) => b.players)
          const used = new Set(players.map((p) => p.assignedRole).filter(Boolean) as string[])
          for (const p of players) {
            if (p.assignedRole) continue
            const pool = roles.filter((r) => !used.has(r.name))
            const key = p.rolePreference.replace(/位/g, '')
            const pref = pool.find((r) => r.hint.includes(key) || key.includes(r.hint[0] ?? '___'))
            const fallback =
              pool.find((r) => r.gender === '不限') ||
              pool.find((r) => p.acceptCrossGender) ||
              pool[0]
            const chosen = pref || fallback
            if (chosen) { used.add(chosen.name); get().assignRole(sid, p.id, chosen.name) }
          }
          get().setSessionStatus(sid, '角色已分')
        },

        issueProps: (sid) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          const scriptProps = seedProps.filter((p) => !p.scriptId || p.scriptId === ss.scriptId)
          const issues: PropIssue[] = scriptProps.map((p) => ({ propId: p.id, name: p.name, returned: false, condition: '正常' }))
          const deposit = st.scripts.find((x) => x.id === ss.scriptId)!.deposit
          set((s) => ({
            sessions: s.sessions.map((x) => (x.id === sid ? { ...x, propIssues: issues, status: '道具已发' } : x)),
          }))
          get().postLedger({ kind: '押金收入', amount: deposit, sessionId: sid, memo: `《${st.scripts.find((x) => x.id === ss.scriptId)!.name}》道具押金`, operator: '前台' })
        },

        collectDeposit: (sid) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          const deposit = st.scripts.find((x) => x.id === ss.scriptId)!.deposit
          get().postLedger({ kind: '押金收入', amount: deposit, sessionId: sid, memo: '补收道具押金', operator: '前台' })
        },

        toggleBreak: (sid) => {
          const ss = get().sessions.find((x) => x.id === sid)!
          get().setSessionStatus(sid, ss.status === '进行中' ? '休息中' : '进行中')
        },

        noteHostInterrupt: (sid, note) =>
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sid ? { ...x, hostInterruptNote: note } : x)) })),

        returnProp: (sid, propId, condition, dmgNote) =>
          set((s) => ({
            sessions: s.sessions.map((x) =>
              x.id === sid
                ? { ...x, propIssues: x.propIssues.map((p) => (p.propId === propId ? { ...p, returned: true, condition, damageNote: dmgNote } : p)) }
                : x,
            ),
          })),

        payPlayer: (sid, pid) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          const player = st.bookings.flatMap((bk) => bk.players).find((p) => p.id === pid)!
          const member = st.members.find((m) => m.id === player.memberId)
          const price = Math.round(st.scripts.find((x) => x.id === ss.scriptId)!.price * memberDiscount(member?.level))
          set((s) => ({
            bookings: s.bookings.map((bk) => ({
              ...bk,
              players: bk.players.map((p) => (p.id === pid ? { ...p, paid: true, paidAmount: price } : p)),
            })),
          }))
          get().postLedger({ kind: '报名费收入', amount: price, playerId: pid, sessionId: sid, memo: `${player.name} 到店支付报名费`, operator: '前台' })
        },

        checkoutSession: (sid) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const totalDeposit = script.deposit
          const back = totalDeposit - ss.depositCharged
          if (back > 0) {
            get().postLedger({ kind: '押金退还', amount: -back, sessionId: sid, memo: `道具验收后退还押金（扣损耗 ¥${ss.depositCharged}）`, operator: '前台' })
          }
          const memberIds = st.bookings.filter((b) => b.sessionId === sid).flatMap((b) => b.players.map((p) => p.memberId)).filter(Boolean) as string[]
          set((s) => ({
            sessions: s.sessions.map((x) => (x.id === sid ? { ...x, status: '已结账' } : x)),
            members: s.members.map((m) => (memberIds.includes(m.id) ? { ...m, visits: m.visits + 1 } : m)),
          }))
        },

        disbandSession: (sid, reason) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sid)!
          st.bookings.filter((b) => b.sessionId === sid).forEach((b) =>
            b.players.filter((p) => p.paid).forEach((p) =>
              get().postLedger({
                kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: sid,
                memo: `场次解散（${reason}），${p.name} 全额退款`, operator: '店长',
              }),
            ),
          )
          set((s) => ({
            sessions: s.sessions.map((x) => (x.id === sid ? { ...x, status: '已解散' } : x)),
            bookings: s.bookings.map((b) => (b.sessionId === sid ? { ...b, status: '已取消', sessionId: undefined } : b)),
          }))
        },

        // ---------------- 工单 ----------------
        raiseTicket: ({ sessionId, bookingId, playerId, type, title, detail, raisedBy, refundAmount, depositDeduct }) => {
          const t: Ticket = {
            id: uid('t'), sessionId, bookingId, playerId, type, title, detail,
            status: refundAmount || depositDeduct || type === '结账争议' || type === '要求换本' ? '待店长审批' : '待处理',
            raisedBy, raisedAt: now(), refundAmount, depositDeduct,
            timeline: [{ at: now(), actor: raisedBy, action: `提交工单【${type}】：${title}` }],
          }
          set((s) => ({ tickets: [t, ...s.tickets] }))
        },

        progressTicket: (id, action, actor, patch) =>
          set((s) => ({
            tickets: s.tickets.map((t) =>
              t.id === id
                ? { ...t, ...patch, handler: actor, timeline: [...t.timeline, { at: now(), actor, action }] }
                : t,
            ),
          })),

        approveTicket: (id, manager, resolution) => {
          const st = get()
          const t = st.tickets.find((x) => x.id === id)!
          if (t.refundAmount && t.sessionId) {
            const target = t.playerId
              ? st.bookings.flatMap((b) => b.players).find((p) => p.id === t.playerId)
              : undefined
            get().postLedger({
              kind: t.type === '结账争议' ? '争议补偿' : '退款支出',
              amount: -Math.abs(t.refundAmount),
              playerId: target?.id, sessionId: t.sessionId, ticketId: id,
              memo: `${manager} 审批通过：${resolution}`, operator: manager,
            })
            if (target) {
              set((s) => ({
                bookings: s.bookings.map((b) => ({
                  ...b,
                  players: b.players.map((p) =>
                    p.id === target.id ? { ...p, paid: false, paidAmount: Math.max(0, p.paidAmount - Math.abs(t.refundAmount!)) } : p,
                  ),
                })),
              }))
            }
          }
          if (t.depositDeduct && t.sessionId) {
            get().postLedger({
              kind: '押金收入', amount: Math.abs(t.depositDeduct), sessionId: t.sessionId, ticketId: id,
              memo: `道具损耗扣押金（${manager} 审批）：${resolution}`, operator: manager,
            })
            set((s) => ({
              sessions: s.sessions.map((x) => (x.id === t.sessionId ? { ...x, depositCharged: x.depositCharged + Math.abs(t.depositDeduct!) } : x)),
            }))
          }
          set((s) => ({
            tickets: s.tickets.map((x) =>
              x.id === id
                ? { ...x, status: '已解决', handler: manager, resolution, resolvedAt: now(), timeline: [...x.timeline, { at: now(), actor: manager, action: `店长审批通过：${resolution}` }] }
                : x,
            ),
          }))
        },

        rejectTicket: (id, manager, reason) =>
          set((s) => ({
            tickets: s.tickets.map((t) =>
              t.id === id
                ? { ...t, status: '已驳回', handler: manager, resolution: reason, resolvedAt: now(), timeline: [...t.timeline, { at: now(), actor: manager, action: `店长驳回：${reason}` }] }
                : t,
            ),
          })),

        postLedger: (e) =>
          set((s) => ({ ledger: [{ ...e, id: uid('l'), at: now() }, ...s.ledger] })),

        // ---------------- 复盘 ----------------
        submitReview: (r) => {
          set((s) => ({ reviews: [{ ...r, id: uid('rv'), at: now() }, ...s.reviews] }))
          const ss = get().sessions.find((x) => x.id === r.sessionId)
          if (ss?.hostId) {
            set((s) => ({
              hosts: s.hosts.map((h) => {
                if (h.id !== ss.hostId) return h
                const total = h.reviewScore * h.reviewCount + r.hostScore
                const count = h.reviewCount + 1
                return { ...h, reviewScore: Math.round((total / count) * 10) / 10, reviewCount: count }
              }),
            }))
          }
        },

        submitDebrief: (d) => {
          set((s) => ({ debriefs: [{ ...d, id: uid('db'), at: now() }, ...s.debriefs] }))
          set((s) => ({
            hosts: s.hosts.map((h) => {
              if (h.id !== d.hostId) return h
              const cur = h.proficiency[d.scriptId] ?? 0
              return { ...h, proficiency: { ...h.proficiency, [d.scriptId]: Math.max(0, Math.min(5, cur + d.proficiencyDelta)) } }
            }),
            sessions: s.sessions.map((x) => (x.id === d.sessionId ? { ...x, status: '已复盘', reviewDone: true } : x)),
          }))
        },

        // ========================================================
        // 开场前异常处置：触发 → 方案计算 → 玩家确认 → 一次性锁定 → 退款/补偿/排班变更
        // ========================================================
        triggerDisruption: ({ sessionId, type, reason, detail, raisedBy }) => {
          const st = get()
          const ss = st.sessions.find((x) => x.id === sessionId)
          if (!ss) return { error: '场次不存在' }
          if (ss.disruptionId && st.disruptions.some((d) => d.id === ss.disruptionId && !['已改期', '已退款关闭', '已取消处置'].includes(d.status)))
            return { error: '该场次已有进行中的异常处置单，不能重复发起' }

          const id = uid('d')
          const d: Disruption = {
            id, sessionId, type, reason, detail, raisedBy, raisedAt: now(),
            status: '异常已触发', plans: [], rejectPolicy: '全额退款', lockIds: [],
            manualAlerts: [],
          }
          // 资源处置（不是简单取消）：
          //  - 主持缺勤：释放主持班次，记入请假档期
          //  - 房间不可用：释放房间并登记故障时段
          //  - 场次延迟：保留房间/主持，等待改期方案
          const patches: string[] = []
          if (type === '主持缺勤' && ss.hostId) {
            const h = st.hosts.find((x) => x.id === ss.hostId)!
            set((s) => ({
              hosts: s.hosts.map((x) => x.id === h.id ? { ...x, unavailable: Array.from(new Set([...x.unavailable, ss.startAt])) } : x),
            }))
            patches.push(`主持「${h.name}」班次已释放并登记请假（${ss.startAt}）`)
          }
          if (type === '房间不可用' && ss.roomId) {
            const r = st.rooms.find((x) => x.id === ss.roomId)!
            set((s) => ({
              rooms: s.rooms.map((x) => x.id === r.id ? { ...x, downSlots: Array.from(new Set([...x.downSlots, ss.startAt])) } : x),
            }))
            patches.push(`房间「${r.name}」登记故障停用（${ss.startAt}），等待工程确认`)
          }
          set((s) => ({
            disruptions: [d, ...s.disruptions],
            sessions: s.sessions.map((x) => x.id === sessionId
              ? { ...x, status: '待补位', disruptionId: id, hostId: type === '主持缺勤' ? undefined : x.hostId, roomId: type === '房间不可用' ? undefined : x.roomId }
              : x),
          }))
          get().raiseTicket({
            sessionId, type: '主持请假',
            title: `开场前异常【${type}】：处置单 ${id}`,
            detail: `原因：${reason}\n${detail}\n处置：场次转为「待补位」冻结名额（保留可售/候补状态），${patches.join('；') || '资源暂保留'}。店长需发起改期方案。`,
            raisedBy,
          })
          addEvent({
            at: now(), scope: id, sessionId, actor: raisedBy, category: '异常触发', level: 'error',
            action: `异常触发【${type}】：${reason}；场次冻结为「待补位」，名额/候补状态保留，${patches.join('；') || '原房间与主持班次暂保留'}`,
          })
          return id
        },

        cancelDisruption: (id, reason, actor) => {
          const st = get()
          const d = st.disruptions.find((x) => x.id === id)
          if (!d) return
          set((s) => ({
            disruptions: s.disruptions.map((x) => x.id === id ? { ...x, status: '已取消处置', resolvedAt: now(), resolution: reason } : x),
            sessions: s.sessions.map((x) => x.id === d.sessionId ? { ...x, status: '已成局', disruptionId: undefined } : x),
          }))
          addEvent({ at: now(), scope: id, sessionId: d.sessionId, actor, category: '系统', level: 'ok', action: `异常解除，撤回处置：${reason}；场次恢复「已成局」，可售/候补状态恢复` })
        },

        computePlans: (did) => {
          const st = get()
          const d = st.disruptions.find((x) => x.id === did)!
          const ss = st.sessions.find((x) => x.id === d.sessionId)!
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const groups = st.bookings.filter((b) => b.sessionId === ss.id).map((b) => ({
            booking: b,
            players: b.players.filter((p) => !p.quit),
          }))
          const allPlayers = groups.flatMap((g) => g.players)
          const memberWeight = (p: Player) => {
            const lv = st.members.find((m) => m.id === p.memberId)?.level
            return lv === '金卡' ? 3 : lv === '银卡' ? 2 : 1
          }

          const buildMigrationPlan = (kind: PlanKind, target: Session | undefined, storeId: string, startAt: string): ReschedulePlan => {
            const reasons: string[] = []
            const conflicts: string[] = []
            // 玩家可接受时段 + 整组（拼车不拆）
            const movingGroups = groups.map((g) => {
              const slotOk = g.players.every((p) => p.acceptableSlots.length === 0 || p.acceptableSlots.includes(startAt))
              return { ...g, slotOk }
            })
            const movers = movingGroups.filter((g) => g.slotOk).flatMap((g) => g.players)
            const blockedGroups = movingGroups.filter((g) => !g.slotOk)
            blockedGroups.forEach((g) => {
              const who = g.players.filter((p) => p.acceptableSlots.length > 0 && !p.acceptableSlots.includes(startAt)).map((p) => `${p.name}(${p.acceptableSlots.map((x) => x.slice(11)).join('/')})`)
              conflicts.push(`同行组「${g.booking.contactName}」${g.players.length} 人中 ${who.join('、')} 不接受 ${startAt.slice(11)}；拼车关系不可拆散，整组 ${g.players.length} 人无法随此方案迁移`)
            })

            // 房间
            const excludeIds = [ss.id, ...(target ? [target.id] : [])]
            let roomId = target?.roomId
            if (!roomId) {
              const rids = get().eligibleRooms(script.id, startAt, storeId).filter((rid) =>
                !roomBusyAt(st, rid, startAt, script.durationMin, excludeIds))
              roomId = rids.sort((a, b) => (st.rooms.find((r) => r.id === a)!.capacity) - (st.rooms.find((r) => r.id === b)!.capacity))[0]
            } else if (roomBusyAt(st, roomId, startAt, script.durationMin, excludeIds)) {
              conflicts.push(`目标房间「${st.rooms.find((r) => r.id === roomId)?.name}」该时段已被其他场次/锁定占用`)
            }
            const room = st.rooms.find((r) => r.id === roomId)
            if (room) reasons.push(`房间「${room.name}」容量 ${room.capacity} 人${room.horrorSet && script.horror !== '不恐怖' ? '、恐怖实景适配' : ''}`)
            else conflicts.push('该时段无容量满足且空闲的房间')

            // 主持技能匹配
            let hostId = target?.hostId
            if (!hostId) {
              hostId = get().eligibleHosts(script.id, startAt, storeId)[0]?.id
            } else if (hostBusyAt(st, hostId, startAt, script.durationMin, excludeIds)) {
              conflicts.push(`主持「${st.hosts.find((h) => h.id === hostId)?.name}」该时段班次冲突`)
              hostId = get().eligibleHosts(script.id, startAt, storeId)[0]?.id
            }
            const host = st.hosts.find((h) => h.id === hostId)
            const prof = host?.proficiency[script.id] ?? 0
            if (host) {
              if (prof >= 3) reasons.push(`主持「${host.name}」${host.level}，该本熟练度 ${prof}/5，技能匹配`)
              else conflicts.push(`候选主持「${host.name}」熟练度仅 ${prof}/5（要求 ≥3），技能不匹配`)
            } else conflicts.push('该时段无档期空闲主持')

            // 库存（迁出版次释放后）
            const stock = stockFeasible(st, storeId, script.id, startAt, ss.id, target?.id)
            if (stock.available >= 1) reasons.push(`盒装本库存充足（在开/锁定 ${stock.used} 套，共 ${stock.copies} 套）`)
            else conflicts.push(`盒装本库存不足（在开/锁定 ${stock.used} 套，共 ${stock.copies} 套）`)

            // 容量 + 角色性别/人数约束
            const existingCount = target ? st.bookings.filter((b) => b.sessionId === target.id).reduce((n, b) => n + b.players.filter((p) => !p.quit).length, 0) : 0
            const roles = (scriptRoles[script.id] ?? []) as RoleDef[]
            const remainingRoles = roles.slice(0, roles.length - existingCount)
            const afterCount = existingCount + movers.length
            if (room && afterCount > room.capacity) conflicts.push(`迁入后 ${afterCount} 人超过房间容量 ${room.capacity}`)
            if (afterCount > script.maxPlayers) conflicts.push(`迁入后 ${afterCount} 人超过剧本上限 ${script.maxPlayers}`)
            const roleMatch = matchRoles(movers, remainingRoles)
            if (!roleMatch.feasible) conflicts.push(...roleMatch.conflicts)

            const memberDesc = movers.map((p) => {
              const lv = st.members.find((m) => m.id === p.memberId)?.level
              return lv ? `${p.name}(${lv})` : ''
            }).filter(Boolean)
            if (movers.length) reasons.push(`可迁移 ${movers.length}/${allPlayers.length} 人${memberDesc.length ? `，含会员：${memberDesc.join('、')}（会员优先级计入候选排序）` : ''}`)
            else reasons.push('无玩家可随此方案迁移')
            if (target) reasons.push(`复用已排场次 ${target.id}（${target.startKey}）`)
            if (kind === '跨店迁移') {
              const tstore = st.stores.find((x) => x.id === storeId)!
              reasons.push(`跨店至「${tstore.name}」（${tstore.district}），费用随权益平移，跨店结算留痕`)
            }
            return {
              id: uid('p'), disruptionId: did, kind, sessionId: target?.id, storeId, roomId, hostId, startAt,
              status: '候选', createdAt: now(), reasons, conflicts,
              roleAssign: roleMatch.feasible ? roleMatch.assign : {},
              responses: {}, rejectPolicy: d.rejectPolicy,
            } satisfies ReschedulePlan
          }

          const slotKeys = script.startTime.split(' / ').map((t) => `${ss.date}T${t}`).filter((x) => x !== ss.startAt)
          const plans: ReschedulePlan[] = []

          // 同日换场：优先复用本店当日已排的其他场次，其次按空房+主持生成虚拟候选
          for (const slot of slotKeys) {
            const existing = st.sessions.find((x) =>
              x.storeId === ss.storeId && x.scriptId === ss.scriptId && x.startAt === slot && ACTIVE_STATUSES.includes(x.status))
            plans.push(buildMigrationPlan('同日换场', existing, ss.storeId, slot))
          }
          // 跨店迁移
          for (const store of st.stores.filter((x) => x.id !== ss.storeId)) {
            for (const slot of slotKeys) {
              const existing = st.sessions.find((x) =>
                x.storeId === store.id && x.scriptId === ss.scriptId && x.startAt === slot && ACTIVE_STATUSES.includes(x.status))
              plans.push(buildMigrationPlan('跨店迁移', existing, store.id, slot))
            }
          }
          // 全额退款 / 保留权益
          const paidTotal = allPlayers.filter((p) => p.paid).reduce((n, p) => n + p.paidAmount, 0)
          plans.push({
            id: uid('p'), disruptionId: did, kind: '全额退款', startAt: ss.startAt, status: '候选',
            createdAt: now(), rejectPolicy: d.rejectPolicy, responses: {}, roleAssign: {},
            reasons: [
              `门店原因导致无法成局，${allPlayers.length} 名玩家不受退款规则限制，全额原路退回，合计 ¥${paidTotal}`,
              '退款与方案执行同一事务，逐玩家幂等记账，杜绝重复退款',
              '原场次名额、主持/房间班次、库存全部释放回可售池',
            ],
            conflicts: [],
          })
          plans.push({
            id: uid('p'), disruptionId: did, kind: '保留权益待补位', startAt: ss.startAt, status: '候选',
            createdAt: now(), rejectPolicy: d.rejectPolicy, responses: {}, roleAssign: {},
            reasons: [
              `已付 ¥${paidTotal} 以权益形式保留（不退款、不重复扣款），玩家进入候补补位池`,
              '补位成功时权益核销、自动成局；按玩家策略区分「同意自动补位」与「仅接受指定时段」',
              '若 7 天内未补位，客服可一键转全额退款（逐玩家幂等）',
            ],
            conflicts: [],
          })

          // 排序：迁移类优先 → 无冲突优先 → 可迁移人数（会员加权）优先；退款/保留沉底
          plans.sort((a, b) => {
            const rank = (p: ReschedulePlan) => p.kind === '全额退款' ? 2 : p.kind === '保留权益待补位' ? 3 : 1
            if (rank(a) !== rank(b)) return rank(a) - rank(b)
            const cov = (p: ReschedulePlan) => {
              if (p.kind !== '同日换场' && p.kind !== '跨店迁移') return 0
              const groups2 = st.bookings.filter((bk) => bk.sessionId === ss.id)
              let w = 0
              groups2.forEach((bk) => {
                const ps = bk.players.filter((x) => !x.quit)
                if (ps.every((x) => x.acceptableSlots.length === 0 || x.acceptableSlots.includes(p.startAt)))
                  w += ps.reduce((n, x) => n + memberWeight(x), 0)
              })
              return w
            }
            const feas = (p: ReschedulePlan) => (p.conflicts.length === 0 ? 0 : 1)
            if (feas(a) !== feas(b)) return feas(a) - feas(b)
            return cov(b) - cov(a)
          })

          set((s) => ({
            disruptions: s.disruptions.map((x) => x.id === did
              ? { ...x, plans: [...plans, ...x.plans.filter((p) => p.status !== '候选')], status: '方案计算中' }
              : x),
          }))
          addEvent({ at: now(), scope: did, sessionId: ss.id, actor: '系统', category: '方案计算', level: 'info', action: `重新计算候选方案 ${plans.length} 个（同日换场/跨店迁移/全额退款/保留权益），已按可接受时段、拼车整组、会员优先级、容量、主持技能与库存排序并给出冲突解释` })
        },

        publishPlan: (did, planId, actor, deadlineMin = 30) => {
          const st = get()
          const d = st.disruptions.find((x) => x.id === did)!
          const plan = d.plans.find((p) => p.id === planId)
          if (!plan) return { error: '方案不存在' }
          if (d.publishedPlanId && d.status !== '已退款关闭') {
            const pub = d.plans.find((p) => p.id === d.publishedPlanId)
            if (pub && ['已发布', '已确认执行'].includes(pub.status)) return { error: '已有在确认倒计时中的方案，请先作废' }
          }
          const ss = st.sessions.find((x) => x.id === d.sessionId)!
          const players = st.bookings.filter((b) => b.sessionId === ss.id).flatMap((b) => b.players).filter((p) => !p.quit)
          const responses: Record<string, PlanResponse> = {}
          players.forEach((p) => { responses[p.id] = '待确认' })
          const deadline = new Date(Date.now() + deadlineMin * 60000).toISOString().slice(0, 19)
          set((s) => ({
            disruptions: s.disruptions.map((x) => x.id === did ? {
              ...x, status: '待玩家确认', publishedPlanId: planId,
              plans: x.plans.map((p) => p.id === planId
                ? { ...p, status: '已发布', publishedAt: now(), confirmDeadline: deadline, responses, rejectPolicy: x.rejectPolicy }
                : (p.status === '候选' ? { ...p, status: '已作废' } : p)),
            } : x),
          }))
          addEvent({
            at: now(), scope: did, sessionId: ss.id, actor, category: '玩家确认', level: 'warn',
            action: `发布【${plan.kind}】方案（目标 ${plan.startAt.replace('T', ' ')}${plan.storeId && plan.storeId !== ss.storeId ? `·${st.stores.find((x) => x.id === plan.storeId)?.name}` : ''}），向 ${players.length} 名玩家推送确认，倒计时 ${deadlineMin} 分钟（截止 ${deadline.slice(11, 16)}）；同行组需整组确认`,
          })
        },

        respondPlan: (planId, playerId, response, slots) => {
          const st = get()
          const plan = st.disruptions.flatMap((d) => d.plans).find((p) => p.id === planId)
          if (!plan || plan.status !== '已发布') return
          const p = st.bookings.flatMap((b) => b.players).find((x) => x.id === playerId)
          set((s) => ({
            disruptions: s.disruptions.map((d) => d.id !== plan.disruptionId ? d : {
              ...d,
              status: '部分已确认',
              plans: d.plans.map((x) => x.id !== planId ? x : {
                ...x,
                responses: { ...x.responses, [playerId]: response },
                roleAssign: response === '仅指定时段' && slots?.length
                  ? { ...x.roleAssign, [playerId]: `仅接受 ${slots.map((z) => z.slice(11)).join('/')}` }
                  : x.roleAssign,
              }),
            }),
            bookings: response === '仅指定时段' && slots?.length
              ? s.bookings.map((b) => ({ ...b, players: b.players.map((x) => x.id === playerId ? { ...x, acceptableSlots: Array.from(new Set([...x.acceptableSlots, ...slots])) } : x) }))
              : s.bookings,
          }))
          addEvent({
            at: now(), scope: plan.disruptionId, category: '玩家确认', actor: p?.name ?? playerId,
            level: response === '已接受' ? 'ok' : response === '已拒绝' ? 'error' : 'warn',
            action: `玩家「${p?.name ?? playerId}」对【${plan.kind}】方案回复：${response}${response === '仅指定时段' && slots?.length ? `（${slots.map((x) => x.slice(11)).join('/')}）` : ''}`,
          })
        },

        setRejectPolicy: (did, policy) =>
          set((s) => ({
            disruptions: s.disruptions.map((d) => d.id === did ? {
              ...d, rejectPolicy: policy,
              plans: d.plans.map((p) => d.publishedPlanId === p.id ? { ...p, rejectPolicy: policy } : p),
            } : d),
          })),

        voidPlan: (did, planId, actor, reason) => {
          const st = get()
          const d = st.disruptions.find((x) => x.id === did)
          const plan = d?.plans.find((p) => p.id === planId)
          if (!d || !plan || ['已执行', '已确认执行'].includes(plan.status)) return
          set((s) => ({
            disruptions: s.disruptions.map((x) => x.id !== did ? x : {
              ...x, status: '异常已触发', publishedPlanId: undefined,
              plans: x.plans.map((p) => p.id === planId ? { ...p, status: '已作废', executionNote: `店长作废：${reason}` } : p),
            }),
          }))
          addEvent({ at: now(), scope: did, sessionId: d.sessionId, actor, category: '方案计算', level: 'warn', action: `作废【${plan.kind}】方案：${reason}；场次保持「待补位」，可重新计算方案` })
        },

        confirmMigration: (did, actor, injectFailure) => {
          const st0 = get()
          const d0 = st0.disruptions.find((x) => x.id === did)
          if (!d0) return { ok: false, errors: ['处置单不存在'] }
          const plan = d0.plans.find((p) => p.id === d0.publishedPlanId)
          // 幂等：重复确认直接返回已执行结果，不重复扣款/迁移
          if (plan?.status === '已执行' || plan?.status === '已确认执行') {
            const ss2 = st0.sessions.find((x) => x.id === d0.sessionId)!
            return { ok: true, newSessionId: ss2.migratedTo?.newSessionId ?? plan.sessionId ?? '' }
          }
          if (!plan || plan.status !== '已发布') return { ok: false, errors: ['没有已发布、待执行的方案'] }
          const ss = st0.sessions.find((x) => x.id === d0.sessionId)!
          const script = st0.scripts.find((x) => x.id === ss.scriptId)!

          if (plan.kind === '全额退款') {
            return executeRefund(did, actor)
          }
          if (plan.kind === '保留权益待补位') {
            return executeRetain(did, actor)
          }

          // ---- 迁移类：整组规则判定实际迁移名单 ----
          const groups = planGroups(plan)
          const movingGroups = groups.filter((g) => g.move)
          const stuckGroups = groups.filter((g) => !g.move)
          if (movingGroups.length === 0) return { ok: false, errors: ['没有任何同行组整组确认接受（拼车关系不允许拆散），不能执行迁移；请改选方案或等待玩家确认'] }

          const movers = movingGroups.flatMap((g) => g.members)
          const stuck = stuckGroups.flatMap((g) => g.members)

          // ---- 第一步：在同一状态快照上校验四类资源（任一失效即整体回滚） ----
          const locks: ResourceLock[] = []
          const errors: string[] = []
          const mkLock = (kind: ResourceLock['kind'], refId: string, storeId: string, detail: string) => {
            const fail = injectFailure === kind
            locks.push({
              id: uid('lk'), disruptionId: did, planId: plan.id, kind, refId, storeId,
              startAt: plan.startAt, status: fail ? '锁定失败' : '已锁定',
              detail: fail ? `${detail} —— 并发确认中已被其他门店/场次抢占（模拟）` : detail,
              lockedAt: now(),
            })
            if (fail) errors.push(`【${kind}】${detail} 在并发确认中失效（已被别处抢占/锁定/停用）`)
          }

          // 1) 原场次名额：仍为待补位且归属本处置单、且未被其他方案提交
          const srcNow = get().sessions.find((x) => x.id === ss.id)!
          if (srcNow.status !== '待补位' || srcNow.disruptionId !== did) errors.push('原场次名额状态已变化（不再是待补位/归属本处置单）')
          mkLock('原场次名额', ss.id, ss.storeId, `冻结 ${movers.length} 个原场次名额（${script.name} ${ss.startKey}）`)

          // 2) 目标房间
          const roomId = plan.roomId
          const room = roomId ? get().rooms.find((r) => r.id === roomId) : undefined
          if (!roomId || !room) {
            errors.push('方案缺少可用目标房间（候选冲突未解除，请重算方案）')
          } else {
            if (room.downSlots.includes(plan.startAt)) errors.push(`目标房间「${room.name}」该时段已登记故障停用`)
            if (roomBusyAt(get(), roomId, plan.startAt, script.durationMin, [ss.id, ...(plan.sessionId ? [plan.sessionId] : [])])) errors.push(`目标房间「${room.name}」该时段已被占用`)
            mkLock('目标房间', roomId, plan.storeId!, `「${room.name}」容量 ${room.capacity} 人 @ ${plan.startAt.slice(11)}`)
          }

          // 3) 主持人班次
          const hostId = plan.hostId
          const host = hostId ? get().hosts.find((h) => h.id === hostId) : undefined
          if (!hostId || !host) {
            errors.push('方案缺少技能匹配的主持（候选冲突未解除，请重算方案）')
          } else {
            if (host.unavailable.includes(plan.startAt)) errors.push(`主持「${host.name}」已请假/不可用`)
            if (hostBusyAt(get(), hostId, plan.startAt, script.durationMin, [ss.id, ...(plan.sessionId ? [plan.sessionId] : [])])) errors.push(`主持「${host.name}」班次时段冲突`)
            if ((host.proficiency[script.id] ?? 0) < 3) errors.push(`主持「${host.name}」熟练度 ${host.proficiency[script.id] ?? 0}/5 不达标`)
            mkLock('主持人班次', hostId, plan.storeId!, `「${host.name}」${host.level}·熟练度 ${host.proficiency[script.id] ?? 0}/5`)
          }

          // 4) 剧本库存
          const stock = stockFeasible(get(), plan.storeId!, script.id, plan.startAt, ss.id, plan.sessionId)
          if (stock.available < 1) errors.push(`盒装本库存不足（在开/锁定 ${stock.used}/${stock.copies}）`)
          mkLock('剧本库存', `${plan.storeId}:${script.id}`, plan.storeId!, `《${script.name}》盒装本（在开/锁定 ${stock.used}/${stock.copies}）`)

          // 容量与角色人数约束（提交前最后一道闸）
          const target0 = plan.sessionId ? get().sessions.find((x) => x.id === plan.sessionId) : undefined
          const existingCount = target0
            ? get().bookings.filter((b) => b.sessionId === target0.id).reduce((n, b) => n + b.players.filter((p) => !p.quit).length, 0)
            : 0
          if (room && existingCount + movers.length > room.capacity) errors.push(`迁入 ${existingCount + movers.length} 人超出房间容量 ${room.capacity}`)
          if (existingCount + movers.length > script.maxPlayers) errors.push(`迁入 ${existingCount + movers.length} 人超出剧本上限 ${script.maxPlayers}`)
          const usedRoleNames = new Set(
            get().bookings.filter((b) => b.sessionId === target0?.id).flatMap((b) => b.players.map((p) => p.assignedRole)).filter(Boolean) as string[],
          )
          const remainRoles = ((scriptRoles[script.id] ?? []) as RoleDef[]).filter((r) => !usedRoleNames.has(r.name))
          const roleMatch = matchRoles(movers, remainRoles)
          if (!roleMatch.feasible) errors.push(...roleMatch.conflicts)

          // ---- 任一资源失效：整体回滚，原场次保留待补位（可售/候补状态不变），玩家权益分毫不动 ----
          if (errors.length || locks.some((l) => l.status === '锁定失败')) {
            const rolled = locks.map((l): ResourceLock => ({ ...l, status: l.status === '锁定失败' ? '锁定失败' : '已回滚' }))
            set((s) => ({
              locks: [...rolled, ...s.locks],
              disruptions: s.disruptions.map((x) => x.id === did ? {
                ...x, lockIds: [...x.lockIds, ...rolled.map((l) => l.id)],
                plans: x.plans.map((p) => p.id === plan.id ? {
                  ...p, status: '执行失败已回滚',
                  executionNote: `资源锁定失败，整体回滚，原场次保持「待补位」：${errors.join('；')}`,
                } : p),
              } : x),
            }))
            rolled.forEach((l) => addEvent({ at: now(), scope: did, sessionId: ss.id, actor: '系统', category: '资源锁定', level: 'error', action: `资源锁【${l.kind}】${l.status === '锁定失败' ? '锁定失败' : '已回滚'}：${l.detail}` }))
            addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '资源锁定', level: 'error', action: `确认迁移失败，四类资源整体回滚；原场次名额恢复可售/候补，未扣减任何玩家权益。原因：${errors.join('；')}` })
            return { ok: false, errors }
          }
          if (!room || !host) return { ok: false, errors }

          // ---- 第二步：全部锁定成功 → 提交（同一次 set 完成，避免中间态） ----
          const st1 = get()
          let target = plan.sessionId ? st1.sessions.find((x) => x.id === plan.sessionId) : undefined
          let newSessionId = target?.id ?? ''
          const movingBookingIds = movingGroups.map((g) => g.bookingId)

          // 角色预分配落到玩家
          const roleAssign = roleMatch.assign
          const applyRoles = (b: Booking): Booking => ({
            ...b,
            players: b.players.map((p) => (roleAssign[p.id] ? { ...p, assignedRole: roleAssign[p.id] } : p)),
          })

          if (!target) {
            target = {
              id: uid('ss'), storeId: plan.storeId!, scriptId: script.id,
              date: plan.startAt.slice(0, 10), startKey: plan.startAt.slice(11), startAt: plan.startAt,
              mode: ss.mode, roomId: room.id, hostId: host.id, status: '已成局',
              bookingIds: movingBookingIds, propIssues: [], depositCharged: 0,
              createdAt: now(), createdBy: `异常改期-${actor}`,
            }
            newSessionId = target.id
          }

          const committed = locks.map((l): ResourceLock => ({ ...l, status: '已提交' }))
          set((s) => ({
            locks: [...committed, ...s.locks],
            sessions: [
              ...(plan.sessionId ? [] : [target!]),
              ...s.sessions.map((x) => {
                if (x.id === ss.id) {
                  // 还有保留权益的玩家挂着时，源场次维持待补位；全员迁走则已改期
                  const retained = stuck.length > 0 && plan.rejectPolicy === '保留权益待补位'
                  return { ...x, status: retained ? '待补位' as SessionStatus : '已改期' as SessionStatus, roomId: undefined, hostId: undefined, migratedTo: retained ? undefined : { planId: plan.id, newSessionId: target!.id } }
                }
                if (plan.sessionId && x.id === plan.sessionId) {
                  return { ...x, roomId: room.id, hostId: host.id, status: '已成局' as SessionStatus, bookingIds: Array.from(new Set([...x.bookingIds, ...movingBookingIds])) }
                }
                return x
              }),
            ],
            bookings: s.bookings.map((b) => {
              if (movingBookingIds.includes(b.id)) return { ...applyRoles(b), sessionId: target!.id }
              return b
            }),
            disruptions: s.disruptions.map((x) => x.id === did ? {
              ...x, status: '已改期', resolvedAt: now(), lockIds: [...x.lockIds, ...committed.map((l) => l.id)],
              resolution: `迁移至 ${target!.startAt}（${st1.stores.find((z) => z.id === target!.storeId)?.name}）：${movers.length} 人随迁${stuck.length ? `，${stuck.length} 人按「${plan.rejectPolicy}」处理` : ''}`,
              plans: x.plans.map((p) => p.id === plan.id ? {
                ...p, status: '已确认执行', executedAt: now(), sessionId: target!.id,
                executionNote: `四类资源一次性锁定并提交：原场次名额/目标房间/主持班次/剧本库存；${movers.length} 人迁入 ${target!.id}`,
              } : p),
            } : x),
          }))

          committed.forEach((l) => addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '资源锁定', level: 'ok', action: `资源锁【${l.kind}】已锁定并提交：${l.detail}` }))
          addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '排班变更', level: 'ok', action: `排班变更：${movers.length} 人迁入场次 ${newSessionId}（${st1.stores.find((z) => z.id === plan.storeId)?.name} · ${room.name} · 主持${host.name} · ${plan.startAt.slice(11)}）；原场次名额释放，已预付费用随席位平移，无二次扣款` })
          if (plan.storeId !== ss.storeId) {
            get().postLedger({ kind: '跨店结算', amount: 0, sessionId: newSessionId, planId: plan.id, memo: `跨店迁移权益平移：${movers.map((p) => p.name).join('、')} 由「${st1.stores.find((z) => z.id === ss.storeId)?.name}」转至「${st1.stores.find((z) => z.id === plan.storeId)?.name}」，报名费按门店间结算，玩家无额外支付`, operator: actor })
          }

          // 未接受/超时玩家按策略处理
          if (stuck.length) {
            if (plan.rejectPolicy === '全额退款') {
              stuck.forEach((p) => {
                if (p.paid && p.paidAmount > 0) {
                  get().postLedger({ kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: ss.id, planId: plan.id, memo: `未接受/超时未响应改期方案，${p.name} 全额退款（幂等）`, operator: actor })
                  set((s) => ({
                    entitlements: [{ id: uid('en'), at: now(), playerId: p.id, playerName: p.name, kind: '退回', amount: p.paidAmount, sessionId: ss.id, planId: plan.id, memo: '方案未接受，权益以退款形式退回', operator: actor }, ...s.entitlements],
                    bookings: s.bookings.map((b) => ({ ...b, players: b.players.map((x) => x.id === p.id ? { ...x, paid: false, paidAmount: 0 } : x) })),
                  }))
                }
              })
              addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '退款补偿', level: 'warn', action: `对 ${stuck.map((p) => p.name).join('、')} 执行全额退款（逐玩家幂等，重复确认不会重复退款）` })
            } else {
              stuck.forEach((p) => {
                if (p.paid && p.paidAmount > 0) {
                  set((s) => ({
                    entitlements: [{ id: uid('en'), at: now(), playerId: p.id, playerName: p.name, kind: '保留', amount: p.paidAmount, sessionId: ss.id, planId: plan.id, memo: '方案未接受，权益保留待补位', operator: actor }, ...s.entitlements],
                  }))
                }
              })
              // 进入候补补位池（沿用其时段策略）
              stuck.forEach((p) => {
                const member = get().members.find((m) => m.id === p.memberId)
                const { score, parts } = computeWaitScore({ member, mode: p.waitlistMode, ageMinutes: 0, groupSize: 1 })
                const entry: WaitlistEntry = {
                  id: uid('w'), storeId: ss.storeId, scriptId: ss.scriptId, date: ss.date,
                  playerId: p.id, playerName: p.name, phone: p.phone, memberId: p.memberId,
                  score: score + 50, scoreParts: [{ label: '权益保留（已付费）', value: 50 }, ...parts],
                  groupKey: uid('g'), groupSize: 1, mode: p.waitlistMode,
                  acceptableSlots: p.acceptableSlots, status: '排队中', createdAt: now(),
                  note: `异常改期未接受，已付 ¥${p.paidAmount} 权益保留待补位`,
                }
                set((s) => ({ waitlist: [entry, ...s.waitlist] }))
              })
              addEvent({ at: now(), scope: did, sessionId: ss.id, actor, category: '退款补偿', level: 'warn', action: `对 ${stuck.map((p) => p.name).join('、')} 保留已付权益并转入候补补位池（不退款、不重复扣款，补位时核销）` })
            }
            // 未随迁预约单摘出源场次（全额退款→已取消；保留权益→待拼场候补）
            const stuckBookingIds = Array.from(new Set(stuckGroups.map((g) => g.bookingId)))
            set((s) => ({
              bookings: s.bookings.map((b) => stuckBookingIds.includes(b.id)
                ? { ...b, status: plan.rejectPolicy === '全额退款' ? '已取消' as const : '待拼场' as const, sessionId: undefined }
                : b),
            }))
          }

          // 关联工单闭环
          get().progressTicket(st0.tickets.find((t) => t.sessionId === ss.id && t.type === '主持请假' && t.status !== '已解决')?.id ?? '', `异常处置完成：迁移至 ${newSessionId}`, actor, { status: '已解决', resolution: `改期方案已执行，见处置单 ${did}` })
          return { ok: true, newSessionId }
        },

        tick: () => {
          const t = Date.now()
          // 方案确认倒计时
          get().disruptions.forEach((d) => {
            const plan = d.plans.find((p) => p.id === d.publishedPlanId && p.status === '已发布')
            if (plan?.confirmDeadline && new Date(plan.confirmDeadline).getTime() < t) {
              const timedOut = Object.entries(plan.responses).filter(([, v]) => v === '待确认').map(([pid]) => pid)
              if (timedOut.length) {
                set((s) => ({
                  disruptions: s.disruptions.map((x) => x.id === d.id ? {
                    ...x, status: '待执行迁移',
                    plans: x.plans.map((p) => p.id === plan.id ? {
                      ...p,
                      responses: Object.fromEntries(Object.entries(p.responses).map(([pid, v]) => [pid, v === '待确认' ? '超时未响应' : v])),
                    } : p),
                  } : x),
                }))
                const names = timedOut.map((pid) => get().bookings.flatMap((b) => b.players).find((p) => p.id === pid)?.name ?? pid).join('、')
                addEvent({ at: now(), scope: d.id, sessionId: d.sessionId, actor: '系统', category: '玩家确认', level: 'warn', action: `确认倒计时截止，${names} 超时未响应，按「${plan.rejectPolicy}」策略等待店长执行` })
              }
            }
          })
          // 候补通知倒计时
          get().waitlist.filter((w) => w.status === '已通知' && w.respondDeadline && new Date(w.respondDeadline).getTime() < t).forEach((w) => {
            set((s) => ({ waitlist: s.waitlist.map((x) => x.id === w.id ? { ...x, status: '超时未响应' } : x) }))
            addEvent({ at: now(), scope: `waitlist:${w.storeId}:${w.scriptId}:${w.date}`, sessionId: w.offeredSessionId, actor: '系统', category: '候补递补', level: 'warn', action: `候补玩家「${w.playerName}」超过时限未响应（截止 ${w.respondDeadline!.slice(11, 16)}），名额释放，按公开顺位顺延给下一位` })
          })
        },

        // ---------------- 候补 ----------------
        pinWaitlist: (id, reason, by) => {
          if (!reason.trim()) return
          set((s) => ({ waitlist: s.waitlist.map((w) => w.id === id ? { ...w, manualPin: { at: now(), by, reason } } : w) }))
          const w = get().waitlist.find((x) => x.id === id)!
          addEvent({ at: now(), scope: `waitlist:${w.storeId}:${w.scriptId}:${w.date}`, actor: by, category: '候补递补', level: 'warn', action: `店长手工置顶「${w.playerName}」（原因：${reason}）；置顶只改通知顺序，容量与角色约束仍由系统校验` })
        },

        notifyWaitlist: (id, sessionId, by) => {
          const st = get()
          const w = st.waitlist.find((x) => x.id === id)
          const ss = st.sessions.find((x) => x.id === sessionId)
          if (!w || !ss) return { error: '候补条目或场次不存在' }
          if (w.status !== '排队中') return { error: '该候补条目不在排队中' }
          if (w.mode === '仅指定时段' && !w.acceptableSlots.includes(ss.startAt))
            return { error: `该玩家仅接受 ${w.acceptableSlots.map((x) => x.slice(11)).join('/')}，不能通知 ${ss.startAt.slice(11)} 场次` }
          const script = st.scripts.find((x) => x.id === ss.scriptId)!
          const head = st.bookings.filter((b) => b.sessionId === sessionId).reduce((n, b) => n + b.players.filter((p) => !p.quit).length, 0)
          const room = st.rooms.find((r) => r.id === ss.roomId)
          if (head + w.groupSize > script.maxPlayers || (room && head + w.groupSize > room.capacity))
            return { error: `容量不足：当前 ${head} 人 + 同行 ${w.groupSize} 人超过上限` }
          const deadline = new Date(Date.now() + 15 * 60000).toISOString().slice(0, 19)
          set((s) => ({
            waitlist: s.waitlist.map((x) => x.id === id ? { ...x, status: '已通知', notifiedAt: now(), respondDeadline: deadline, offeredSessionId: sessionId } : x),
          }))
          addEvent({ at: now(), scope: `waitlist:${w.storeId}:${w.scriptId}:${w.date}`, sessionId, actor: by, category: '候补递补', level: 'info', action: `按公开顺位通知候补「${w.playerName}」${w.groupSize > 1 ? `等 ${w.groupSize} 人` : ''}补位 ${ss.startAt.slice(11)} 场，响应倒计时 15 分钟（截止 ${deadline.slice(11, 16)}）` })
        },

        respondWaitlist: (id, accept) => {
          const st = get()
          const w = st.waitlist.find((x) => x.id === id)
          if (!w || w.status !== '已通知') return { error: '该条目当前不可响应' }
          const ss = st.sessions.find((x) => x.id === w.offeredSessionId)!
          if (!accept) {
            set((s) => ({ waitlist: s.waitlist.map((x) => x.id === id ? { ...x, status: '已放弃' } : x) }))
            addEvent({ at: now(), scope: `waitlist:${w.storeId}:${w.scriptId}:${w.date}`, sessionId: ss.id, actor: w.playerName, category: '候补递补', level: 'warn', action: `候补玩家「${w.playerName}」放弃本次补位，回到队列末位/释放名额` })
            return
          }
          // 接受：再次校验容量与角色约束（防超卖/角色失衡）
          const script = st.scripts.find((x) => x.id === w.scriptId)!
          const room = st.rooms.find((r) => r.id === ss.roomId)
          const head = st.bookings.filter((b) => b.sessionId === ss.id).reduce((n, b) => n + b.players.filter((p) => !p.quit).length, 0)
          if (head + w.groupSize > script.maxPlayers || (room && head + w.groupSize > room.capacity))
            return { error: '确认补位失败：剩余名额已不足（并发抢占），名额顺延下一位' }
          const roles = (scriptRoles[w.scriptId] ?? []) as RoleDef[]
          const usedRoles = new Set(st.bookings.filter((b) => b.sessionId === ss.id).flatMap((b) => b.players.map((p) => p.assignedRole)).filter(Boolean) as string[])
          const freeRoles = roles.filter((r) => !usedRoles.has(r.name))
          const dummyPlayers: Player[] = Array.from({ length: w.groupSize }, (_, i) => ({
            id: `plw-${w.id}-${i}`, name: i === 0 ? w.playerName : `${w.playerName}的同伴${i + 1}`, phone: w.phone,
            memberId: i === 0 ? w.memberId : undefined, gender: '不便透露', rolePreference: '随意',
            acceptCrossGender: true, paid: false, paidAmount: 0, checkedIn: false,
            acceptableSlots: w.acceptableSlots, waitlistMode: w.mode,
          }))
          const match = matchRoles(dummyPlayers, freeRoles)
          if (!match.feasible) return { error: `确认补位失败：${match.conflicts.join('；')}` }

          // 权益核销：若该玩家有保留权益则抵报名费
          const entitlement = st.entitlements.find((e) => e.playerId === w.playerId && e.kind === '保留')
          const players: Player[] = dummyPlayers.map((p, i) => ({
            ...p,
            assignedRole: match.assign[p.id],
            paid: !!entitlement && i === 0,
            paidAmount: entitlement && i === 0 ? entitlement.amount : 0,
          }))
          const booking: Booking = {
            id: uid('b'), scriptId: w.scriptId, mode: '拼场', playersCount: w.groupSize,
            contactName: w.playerName, contactPhone: w.phone, memberId: w.memberId,
            note: `候补递补成局（${w.mode}）${entitlement ? '；保留权益已核销' : ''}`,
            expectedStart: ss.startAt, status: '已成局', createdAt: now(), players, sessionId: ss.id,
            payMethod: entitlement ? '在线预付' : '到店付',
          }
          set((s) => ({
            waitlist: s.waitlist.map((x) => x.id === id ? { ...x, status: '已补位' } : x),
            bookings: [booking, ...s.bookings],
            sessions: s.sessions.map((x) => x.id === ss.id ? { ...x, bookingIds: Array.from(new Set([...x.bookingIds, booking.id])) } : x),
          }))
          if (entitlement) {
            set((s) => ({
              entitlements: [{ id: uid('en'), at: now(), playerId: w.playerId, playerName: w.playerName, kind: '核销', amount: entitlement.amount, sessionId: ss.id, memo: '候补补位成功，保留权益核销抵扣报名费', operator: '系统' }, ...s.entitlements],
            }))
            get().postLedger({ kind: '权益核销', amount: 0, playerId: w.playerId, sessionId: ss.id, memo: `${w.playerName} 保留权益 ¥${entitlement.amount} 核销抵扣报名费（无重复扣款）`, operator: '系统' })
          }
          addEvent({ at: now(), scope: `waitlist:${w.storeId}:${w.scriptId}:${w.date}`, sessionId: ss.id, actor: w.playerName, category: '候补递补', level: 'ok', action: `候补补位成功：「${w.playerName}」${w.groupSize > 1 ? `等 ${w.groupSize} 人` : ''}确认加入 ${ss.startAt.slice(11)} 场，角色按性别/反串约束自动配角${entitlement ? `，保留权益 ¥${entitlement.amount} 已核销` : '，到店付款'}` })
        },

        manualFillWaitlist: (id, sessionId, reason, by) => {
          if (!reason.trim()) return { error: '手工调整必须填写原因' }
          const r = get().notifyWaitlist(id, sessionId, by)
          if (r && 'error' in r) return r
          // 手工补位：记录原因后直接按接受处理（容量/角色约束依然在 respondWaitlist 中强制校验）
          get().pinWaitlist(id, `手工补位：${reason}`, by)
          return get().respondWaitlist(id, true)
        },

        resetDemo: () =>
          set({
            stores: seedStores, scripts: seedScripts, hosts: seedHosts, rooms: seedRooms,
            stocks: seedStocks, members: seedMembers, bookings: seedBookings, sessions: seedSessions,
            tickets: seedTickets, ledger: seedLedger, reviews: [], debriefs: [],
            waitlist: seedWaitlist, disruptions: seedDisruptions, locks: [], entitlements: [],
            events: seedEvents, currentRole: 'manager',
          }),
      }
    }) as StateCreator<State>,
    {
      name: 'mystery-session-store-v2',
      // 旧缓存/未来新增字段缺省时以初始 state 补底，避免 undefined.map 崩溃
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<State>) }),
    },
  ),
)

// ---------- 派生选择器 ----------
export const sessionPlayers = (sessionId: string) => {
  const st = useStore.getState()
  return st.bookings.filter((b) => b.sessionId === sessionId).flatMap((b) => b.players).filter((p) => !p.quit)
}

export const allSessionPlayers = (sessionId: string) => {
  const st = useStore.getState()
  return st.bookings.filter((b) => b.sessionId === sessionId).flatMap((b) => b.players)
}

export const sessionHeadcount = (sessionId: string) => sessionPlayers(sessionId).length

/** 候补排序（公开规则：手工置顶 → 排队中 → 分数降序 → 报名先后） */
export function waitlistRanking(storeId?: string, scriptId?: string, date?: string) {
  const st = useStore.getState()
  return st.waitlist
    .filter((w) => (!storeId || w.storeId === storeId) && (!scriptId || w.scriptId === scriptId) && (!date || w.date === date))
    .slice()
    .sort((a, b) => {
      if (!!a.manualPin !== !!b.manualPin) return a.manualPin ? -1 : 1
      const rank = (s: WaitlistEntry['status']) => (s === '已通知' ? 0 : s === '排队中' ? 1 : 2)
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      if (b.score !== a.score) return b.score - a.score
      return a.createdAt.localeCompare(b.createdAt)
    })
}

/** 退款风险 */
export function sessionRisk(ss: Session) {
  const st = useStore.getState()
  const script = st.scripts.find((x) => x.id === ss.scriptId)
  const players = sessionPlayers(ss.id)
  const paid = players.filter((p) => p.paid).length
  const risks: string[] = []
  if (script && players.length < script.minPlayers && ss.status !== '已解散' && ss.status !== '待补位' && ss.status !== '已改期') risks.push(`人数未成局（${players.length}/${script.minPlayers}）`)
  if (!ss.hostId && ss.status !== '待补位') risks.push('无主持')
  const openTickets = st.tickets.filter((t) => t.sessionId === ss.id && (t.status === '待店长审批' || t.status === '待处理' || t.status === '处理中'))
  if (openTickets.some((t) => t.type === '结账争议')) risks.push('存在结账争议')
  if (openTickets.some((t) => t.refundAmount)) risks.push('有待批退款')
  return {
    formed: !!script && players.length >= script.minPlayers,
    paidCount: paid,
    total: players.length,
    hostReady: !!ss.hostId,
    roomReady: !!ss.roomId,
    refundAtRisk: players.filter((p) => p.paid).reduce((n, p) => n + p.paidAmount, 0),
    risks,
    openTickets,
  }
}

/** 玩家复购榜 */
export const repurchaseRanking = () =>
  useStore.getState().members.slice().sort((a, b) => b.visits - a.visits)

/** 剧本推荐 */
export function recommendScripts(memberId?: string) {
  const st = useStore.getState()
  const member = st.members.find((m) => m.id === memberId)
  return st.scripts.filter((s) => s.active).map((s) => {
    const debriefs = st.debriefs.filter((d) => d.scriptId === s.id)
    const damagePenalty = st.sessions.some((ss) =>
      ss.scriptId === s.id && ss.propIssues.some((p) => p.condition === '严重损耗' || p.condition === '丢失')) ? 0.5 : 0
    const beginnerBoost = member && member.visits <= 2 && s.beginnerFriendly ? 1 : 0
    const hostReady = st.hosts.some((h) => (h.proficiency[s.id] ?? 0) >= 4) ? 0.3 : 0
    return { script: s, score: 1 + beginnerBoost + hostReady - damagePenalty + debriefs.length * 0.1, reason: buildReason(s, member) }
  }).sort((a, b) => b.score - a.score)
}

function buildReason(s: Script, member?: Member) {
  const reasons: string[] = []
  if (member && member.visits <= 2 && s.beginnerFriendly) reasons.push('新手友好，适合你')
  if (s.horror === '重恐' || s.horror === '中恐') reasons.push('含恐怖环节，请阅读安全提示')
  const st = useStore.getState()
  if (st.hosts.some((h) => (h.proficiency[s.id] ?? 0) >= 4)) reasons.push('有金牌/资深熟练主持可排班')
  if (st.sessions.some((ss) => ss.scriptId === s.id && ss.propIssues.some((p) => p.condition === '严重损耗' || p.condition === '丢失')))
    reasons.push('近期道具损耗严重，排期已降权')
  const reviews = st.reviews.filter((r) => {
    const ss = st.sessions.find((x) => x.id === r.sessionId)
    return ss?.scriptId === s.id
  })
  if (reviews.length) {
    const avg = reviews.reduce((n, r) => n + r.score, 0) / reviews.length
    reasons.push(`玩家评分 ${avg.toFixed(1)}`)
  }
  return reasons.join('；') || '门店主推本'
}

/** 方案确认视图：按同行组聚合（整组接受才可迁移） */
export function planGroupView(planId: string) {
  const st = useStore.getState()
  const plan = st.disruptions.flatMap((d) => d.plans).find((p) => p.id === planId)
  if (!plan) return []
  const d = st.disruptions.find((x) => x.id === plan.disruptionId)!
  const ss = st.sessions.find((x) => x.id === d.sessionId)!
  return st.bookings.filter((b) => b.sessionId === ss.id).map((b) => {
    const players = b.players.filter((p) => !p.quit)
    const accepts = (p: Player) => {
      const r = plan.responses[p.id] ?? '待确认'
      return r === '已接受' || (r === '仅指定时段' && p.acceptableSlots.includes(plan.startAt))
    }
    return {
      bookingId: b.id,
      contact: b.contactName,
      players,
      rows: players.map((p) => ({ player: p, resp: plan.responses[p.id] ?? '待确认' as PlanResponse })),
      move: players.every((p) => accepts(p)) && players.every((p) => p.acceptableSlots.length === 0 || p.acceptableSlots.includes(plan.startAt)),
    }
  })
}

/** 异常处置时间线：事件流 + 关联工单，按时间统一排序 */
export function disruptionTimeline(disruptionId: string) {  const st = useStore.getState()
  const d = st.disruptions.find((x) => x.id === disruptionId)
  if (!d) return []
  const rows: { at: string; actor: string; category: IncidentEvent['category']; action: string; level?: IncidentEvent['level'] }[] = []
  st.events.filter((e) => e.scope === disruptionId).forEach((e) => rows.push({ at: e.at, actor: e.actor, category: e.category, action: e.action, level: e.level }))
  st.tickets.filter((t) => t.sessionId === d.sessionId).forEach((t) =>
    t.timeline.forEach((x) => rows.push({ at: x.at, actor: x.actor, category: '排班变更', action: `[工单] ${x.action}` })))
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}
