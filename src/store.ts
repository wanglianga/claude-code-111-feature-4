import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Script, Host, Room, Member, Booking, Session, Ticket, LedgerEntry,
  Review, HostDebrief, Player, SessionStatus, TicketType, TicketStatus,
  PropStatus, LedgerKind, StoreInfo, ScriptCopy, DisruptionCase, DisruptionType,
  ReschedulePlan, PlanKind, ResourceLock, WaitlistEntry, WaitlistAutoMode,
  BenefitVoucher, SessionEvent, SessionEventType, CaseNotification,
} from './types'
import {
  seedScripts, seedHosts, seedRooms, seedMembers, seedBookings,
  seedSessions, seedTickets, seedLedger, seedProps, seedStores, seedCopies,
  seedWaitlist, seedCases, seedEvents, scriptRoles,
} from './seed'
import {
  buildPlans, validatePlan, rankWaitlist, roleBalanceViolations,
  activePlayers, sessionBookings, sessionHeadcount, sessionVacancy,
  overlaps, type Domain, type SimClaim,
} from './disruption'

// ---------- 工具 ----------
let seq = 100
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`
export const now = () => new Date().toISOString().slice(0, 19)
const today = () => new Date().toISOString().slice(0, 10)
export const addMinutes = (iso: string, min: number) =>
  new Date(new Date(iso.length === 16 ? iso + ':00' : iso).getTime() + min * 60000).toISOString().slice(0, 19)

export const memberDiscount = (level?: Member['level']) =>
  level === '金卡' ? 0.9 : level === '银卡' ? 0.95 : 1

const DEFAULT_STORE = 'st1'

interface CommitResult { ok: boolean; error?: string; execution?: ReschedulePlan['execution'] }

interface State {
  scripts: Script[]
  stores: StoreInfo[]
  hosts: Host[]
  rooms: Room[]
  members: Member[]
  copies: ScriptCopy[]
  bookings: Booking[]
  sessions: Session[]
  tickets: Ticket[]
  ledger: LedgerEntry[]
  reviews: Review[]
  debriefs: HostDebrief[]
  // 异常处置
  cases: DisruptionCase[]
  plans: ReschedulePlan[]
  locks: ResourceLock[]
  waitlist: WaitlistEntry[]
  vouchers: BenefitVoucher[]
  events: SessionEvent[]
  notifications: CaseNotification[]
  simClaims: SimClaim[]
  currentRole: 'player' | 'frontdesk' | 'host' | 'manager' | 'service'
  currentMemberId?: string

  setRole: (r: State['currentRole'], memberId?: string) => void

  submitBooking: (input: {
    scriptId: string; mode: Booking['mode']; playersCount: number
    contactName: string; contactPhone: string; memberId?: string; note: string
    expectedStart: string; rolePreferences: string[]; acceptCross: boolean[]
    acknowledgedSafety: boolean; payMethod: Booking['payMethod']
  }) => string
  cancelBooking: (id: string) => void

  generateSession: (scriptId: string, date: string, startKey: string, mode: Session['mode'], storeId?: string) => string | { error: string }
  assignRoom: (sessionId: string, roomId: string, reason?: string) => { ok: boolean; error?: string }
  assignHost: (sessionId: string, hostId: string, reason?: string) => { ok: boolean; error?: string }
  eligibleHosts: (scriptId: string, startAt: string, storeId?: string) => Host[]
  eligibleRooms: (scriptId: string, startAt: string, storeId?: string) => Room[]

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

  raiseTicket: (input: {
    sessionId?: string; bookingId?: string; playerId?: string; type: TicketType
    title: string; detail: string; raisedBy: string; refundAmount?: number; depositDeduct?: number
  }) => void
  progressTicket: (id: string, action: string, actor: string, patch?: Partial<Ticket>) => void
  approveTicket: (id: string, manager: string, resolution: string) => void
  rejectTicket: (id: string, manager: string, reason: string) => void
  postLedger: (e: Omit<LedgerEntry, 'id' | 'at'>) => void

  submitReview: (r: Omit<Review, 'id' | 'at'>) => void
  submitDebrief: (d: Omit<HostDebrief, 'id' | 'at'>) => void

  // ---------- 开场前异常处置 ----------
  domain: () => Domain
  raiseDisruption: (input: { sessionId: string; type: DisruptionType; title: string; detail: string; raisedBy: string }) => string
  computePlans: (caseId: string) => void
  selectPlan: (caseId: string, planId: string, deadlineMin: number) => void
  respondPlan: (planId: string, bookingId: string, decision: '同意' | '拒绝', acceptedSlot?: string) => void
  expirePlanResponses: (planId: string) => void
  commitPlan: (planId: string) => CommitResult
  closeCase: (caseId: string) => void
  manualAdjust: (sessionId: string, patch: { roomId?: string; hostId?: string }, reason: string) => { ok: boolean; error?: string }
  sweepDeadlines: () => void

  // 候补
  joinWaitlist: (input: {
    scriptId: string; storeId?: string; contactName: string; contactPhone: string
    memberId?: string; partySize: number; prepaid: boolean; autoMode: WaitlistAutoMode
    acceptedSlots: string[]; rolePreferences: string[]; acceptCross: boolean[]
  }) => string
  setWaitlistMode: (id: string, autoMode: WaitlistAutoMode, acceptedSlots: string[]) => void
  inviteWaitlist: (entryId: string, sessionId: string, deadlineMin: number) => void
  respondWaitlist: (entryId: string, accept: boolean) => void
  autoFillWaitlist: (sessionId: string) => { promoted: string[]; skipped: { name: string; reason: string }[] }
  promoteWaitlistManual: (entryId: string, sessionId: string, reason: string) => { ok: boolean; error?: string }

  // 演示：并发抢占
  toggleSimClaim: (claim: Omit<SimClaim, 'id'>) => void

  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void

  resetDemo: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      // ---------- 内部工具 ----------
      const addEvent = (e: Omit<SessionEvent, 'id'>) =>
        set((s) => ({ events: [{ ...e, id: uid('ev') }, ...s.events] }))

      const notify = (n: Omit<CaseNotification, 'id' | 'at' | 'read'>) =>
        set((s) =>
          s.notifications.some((x) => x.dedupKey === n.dedupKey)
            ? s
            : { notifications: [{ ...n, id: uid('ntf'), at: now(), read: false }, ...s.notifications] },
        )

      /** 幂等流水：同 idemKey 绝不重复产生退款/补偿 */
      const ledgerPush = (ledger: LedgerEntry[], e: Omit<LedgerEntry, 'id' | 'at'> & { idemKey?: string }) => {
        if (e.idemKey && ledger.some((l) => l.idemKey === e.idemKey)) return ledger
        return [{ ...e, id: uid('l'), at: now() }, ...ledger]
      }

      const domainOf = (s: ReturnType<typeof useStore.getState>): Domain => ({
        stores: s.stores, scripts: s.scripts, hosts: s.hosts, rooms: s.rooms,
        members: s.members, bookings: s.bookings, sessions: s.sessions,
        copies: s.copies, waitlist: s.waitlist, locks: s.locks, simClaims: s.simClaims,
      })

      const state: State = {
        scripts: seedScripts,
        stores: seedStores,
        hosts: seedHosts,
        rooms: seedRooms,
        members: seedMembers,
        copies: seedCopies,
        bookings: seedBookings,
        sessions: seedSessions,
        tickets: seedTickets,
        ledger: seedLedger,
        reviews: [],
        debriefs: [],
        cases: seedCases,
        plans: [],
        locks: [],
        waitlist: seedWaitlist,
        vouchers: [],
        events: seedEvents,
        notifications: [],
        simClaims: [],
        currentRole: 'manager',

        setRole: (r, memberId) => set({ currentRole: r, currentMemberId: memberId }),

        domain: () => domainOf(get()),

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
              rolePreference: input.rolePreferences[i] || '随意',
              acceptCrossGender: input.acceptCross[i] ?? true,
              isBirthday: isContact && input.mode === '生日局',
              paid, paidAmount: paid ? price : 0, checkedIn: false,
            }
          })
          const booking: Booking = {
            id, scriptId: input.scriptId, storeId: DEFAULT_STORE, mode: input.mode,
            playersCount: input.playersCount, contactName: input.contactName,
            contactPhone: input.contactPhone, memberId: input.memberId, note: input.note,
            expectedStart: startAt, status: '待拼场', createdAt: now(), players,
            acknowledgedSafety: input.acknowledgedSafety, payMethod: input.payMethod,
          }
          set((s) => ({ bookings: [booking, ...s.bookings] }))
          if (input.payMethod === '在线预付') {
            let ledger = get().ledger
            for (const p of players) {
              ledger = ledgerPush(ledger, {
                kind: '报名费收入', amount: p.paidAmount, playerId: p.id, sessionId: '',
                memo: `${p.name}《${script.name}》预付报名费`, operator: input.contactName,
                idemKey: `pay:${p.id}`,
              })
            }
            set({ ledger })
          }
          return id
        },

        cancelBooking: (bid) => {
          const st = get()
          const b = st.bookings.find((x) => x.id === bid)
          if (!b || b.status === '已成局') return
          let ledger = st.ledger
          b.players.filter((p) => p.paid).forEach((p) => {
            ledger = ledgerPush(ledger, {
              kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: '',
              memo: `${p.name} 取消预约，原路退款`, operator: '系统', idemKey: `cancel-refund:${p.id}`,
            })
          })
          set((s) => ({
            bookings: s.bookings.map((x) => (x.id === bid ? { ...x, status: '已取消' } : x)),
            ledger,
          }))
        },

        // ---------------- 排班成局 ----------------
        eligibleHosts: (scriptId, startAt, storeId = DEFAULT_STORE) => {
          const s = get()
          const script = s.scripts.find((x) => x.id === scriptId)!
          return s.hosts
            .filter((h) => h.storeId === storeId || h.crossStore)
            .filter((h) => !h.unavailable.some((u) => u === startAt))
            .filter((h) => !s.sessions.some((ss) =>
              ss.hostId === h.id && !['已解散', '已复盘', '改期待补'].includes(ss.status) &&
              overlaps(ss.startAt, script.durationMin, startAt, script.durationMin)))
            .filter((h) => !s.locks.some((l) => l.status === '已锁定' && l.kind === '主持班次' && l.refId === h.id))
            .sort((a, b) => (b.proficiency[scriptId] ?? 0) - (a.proficiency[scriptId] ?? 0))
        },

        eligibleRooms: (scriptId, startAt, storeId = DEFAULT_STORE) => {
          const s = get()
          const script = s.scripts.find((x) => x.id === scriptId)!
          const inOutage = (r: Room) => r.outages.some((o) => {
            const t = new Date(startAt.length === 16 ? startAt + ':00' : startAt).getTime()
            return t < new Date(o.endAt).getTime() && new Date(o.startAt).getTime() < t + script.durationMin * 60000
          })
          return s.rooms
            .filter((r) => r.storeId === storeId)
            .filter((r) => r.capacity >= script.minPlayers && !inOutage(r))
            .filter((r) => !s.sessions.some((ss) =>
              ss.roomId === r.id && !['已解散', '已复盘', '改期待补'].includes(ss.status) &&
              overlaps(ss.startAt, script.durationMin, startAt, script.durationMin)))
            .filter((r) => !s.locks.some((l) => l.status === '已锁定' && l.kind === '目标房间' && l.refId === r.id))
            .sort((a, b) => a.capacity - b.capacity)
        },

        generateSession: (scriptId, date, startKey, mode, storeId = DEFAULT_STORE) => {
          const st = get()
          const script = st.scripts.find((s) => s.id === scriptId)!
          const startAt = `${date}T${startKey}`

          const pool = st.bookings.filter((b) =>
            b.scriptId === scriptId && b.storeId === storeId && b.status === '待拼场' &&
            (mode === '拼场' || b.mode === mode || mode === '生日局') &&
            b.expectedStart === startAt)
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
          const rooms = get().eligibleRooms(scriptId, startAt, storeId)
          if (!rooms.length) return { error: '该时段没有空闲房间（容量满足、未被占用且无故障）' }
          const copy = st.copies.find((c) =>
            c.scriptId === scriptId && c.storeId === storeId && c.status === '在库可排' &&
            !st.sessions.some((ss) => ss.copyId === c.id && !['已解散', '已复盘', '改期待补'].includes(ss.status) &&
              overlaps(ss.startAt, script.durationMin, startAt, script.durationMin)))
          if (!copy) return { error: `《${script.name}》在该门店无可用盒装库存（一店一盒，外借/损耗时不可重复排期）` }

          const id = uid('ss')
          const bestHost = hosts[0]
          const session: Session = {
            id, storeId, scriptId, date, startKey, startAt, mode,
            roomId: rooms[0].id, hostId: bestHost?.id, copyId: copy.id,
            status: bestHost && (bestHost.proficiency[scriptId] ?? 0) >= 3 ? '已成局' : '待成局',
            bookingIds: picked.map((b) => b.id),
            propIssues: [], depositCharged: 0, createdAt: now(), createdBy: '排班系统',
          }
          set((s) => ({
            sessions: [session, ...s.sessions],
            bookings: s.bookings.map((b) =>
              picked.some((p) => p.id === b.id) ? { ...b, status: '已成局', sessionId: id } : b),
          }))
          if (!bestHost) {
            get().raiseTicket({
              sessionId: id, type: '主持请假', title: `《${script.name}》${startKey} 场次无可用主持`,
              detail: '排班时所有主持该时段均无档期，需要店长调班或外借主持，否则建议发起开场前异常处置。',
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

        assignRoom: (sid, roomId, reason) => {
          const s = get()
          const ss = s.sessions.find((x) => x.id === sid)!
          const room = s.rooms.find((r) => r.id === roomId)
          if (!room) return { ok: false, error: '房间不存在' }
          if (room.storeId !== ss.storeId)
            return { ok: false, error: `手工调整被拦截：${room.name} 属于其他门店，跨店迁移必须走异常改期方案` }
          const head = sessionHeadcount(domainOf(s), sid)
          if (room.capacity < head) return { ok: false, error: `手工调整被容量约束拦截：${room.name} 仅 ${room.capacity} 座，当前 ${head} 人` }
          const script = s.scripts.find((x) => x.id === ss.scriptId)!
          if (room.outages.some((o) => {
            const t = new Date(ss.startAt.length === 16 ? ss.startAt + ':00' : ss.startAt).getTime()
            return t < new Date(o.endAt).getTime() && new Date(o.startAt).getTime() < t + script.durationMin * 60000
          })) return { ok: false, error: '手工调整被拦截：该房间在开场时段处于故障/不可用状态' }
          set((st) => ({ sessions: st.sessions.map((x) => (x.id === sid ? { ...x, roomId } : x)) }))
          if (reason) {
            addEvent({
              at: now(), type: '手工调整', actor: '店长', tone: 'amber',
              title: `店长手工调整房间 → ${room.name}`,
              detail: `调整原因（必填）：${reason}。已通过容量（${room.capacity}≥${head}）与角色人数约束校验。`,
              sessionId: sid, storeId: ss.storeId,
            })
          }
          return { ok: true }
        },

        assignHost: (sid, hostId, reason) => {
          const s = get()
          const ss = s.sessions.find((x) => x.id === sid)!
          const host = s.hosts.find((h) => h.id === hostId)
          if (!host) return { ok: false, error: '主持不存在' }
          if (host.storeId !== ss.storeId && !host.crossStore)
            return { ok: false, error: `手工调整被拦截：${host.name} 不支持跨店支援` }
          const script = s.scripts.find((x) => x.id === ss.scriptId)!
          if (host.unavailable.some((u) => u === ss.startAt))
            return { ok: false, error: '手工调整被拦截：该主持此时段请假/缺勤' }
          set((st) => ({ sessions: st.sessions.map((x) => (x.id === sid ? { ...x, hostId } : x)) }))
          if (reason) {
            addEvent({
              at: now(), type: '排班变更', actor: '店长', tone: 'amber',
              title: `店长手工调换主持 → ${host.name}（熟练度 ${host.proficiency[script.id] ?? 0}/5）`,
              detail: `调整原因（必填）：${reason}。角色人数/容量约束未被绕过。`,
              sessionId: sid, storeId: ss.storeId,
            })
          }
          return { ok: true }
        },

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
                : b),
          })),

        markLate: (sid, pid, late) =>
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid ? { ...b, players: b.players.map((p) => (p.id === pid ? { ...p, late } : p)) } : b),
          })),

        quitPlayer: (sid, pid, note) => {
          const st = get()
          const p = st.bookings.flatMap((b) => b.players).find((x) => x.id === pid)
          set((s) => ({
            bookings: s.bookings.map((b) =>
              b.sessionId === sid ? { ...b, players: b.players.map((x) => (x.id === pid ? { ...x, quit: true, checkedIn: false } : x)) } : b),
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
              b.sessionId === sid ? { ...b, players: b.players.map((p) => (p.id === pid ? { ...p, assignedRole: roleName } : p)) } : b),
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
              pool.find(() => p.acceptCrossGender) ||
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
          const issues = scriptProps.map((p) => ({ propId: p.id, name: p.name, returned: false, condition: '正常' as PropStatus }))
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
                : x),
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
          let ledger = st.ledger
          st.bookings.filter((b) => b.sessionId === sid).forEach((b) =>
            b.players.filter((p) => p.paid).forEach((p) => {
              ledger = ledgerPush(ledger, {
                kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: sid,
                memo: `场次解散（${reason}），${p.name} 全额退款`, operator: '店长',
                idemKey: `disband-refund:${sid}:${p.id}`,
              })
            }),
          )
          set((s) => ({
            sessions: s.sessions.map((x) => (x.id === sid ? { ...x, status: '已解散' } : x)),
            bookings: s.bookings.map((b) => (b.sessionId === sid ? { ...b, status: '已取消', sessionId: undefined } : b)),
            ledger,
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
                : t),
          })),

        approveTicket: (id, manager, resolution) => {
          const st = get()
          const t = st.tickets.find((x) => x.id === id)!
          if (t.refundAmount && t.sessionId) {
            const target = t.playerId
              ? st.bookings.flatMap((b) => b.players).find((p) => p.id === t.playerId)
              : undefined
            let ledger = st.ledger
            ledger = ledgerPush(ledger, {
              kind: t.type === '结账争议' ? '争议补偿' : '退款支出',
              amount: -Math.abs(t.refundAmount),
              playerId: target?.id, sessionId: t.sessionId, ticketId: id,
              memo: `${manager} 审批通过：${resolution}`, operator: manager,
              idemKey: `ticket:${id}`,
            })
            if (target) {
              set((s) => ({
                bookings: s.bookings.map((b) => ({
                  ...b,
                  players: b.players.map((p) =>
                    p.id === target.id ? { ...p, paid: false, paidAmount: Math.max(0, p.paidAmount - Math.abs(t.refundAmount!)) } : p),
                })),
                ledger,
              }))
            } else set({ ledger })
          }
          if (t.depositDeduct && t.sessionId) {
            let ledger = get().ledger
            ledger = ledgerPush(ledger, {
              kind: '押金收入', amount: Math.abs(t.depositDeduct), sessionId: t.sessionId, ticketId: id,
              memo: `道具损耗扣押金（${manager} 审批）：${resolution}`, operator: manager,
              idemKey: `ticket-deposit:${id}`,
            })
            set((s) => ({
              sessions: s.sessions.map((x) => (x.id === t.sessionId ? { ...x, depositCharged: x.depositCharged + Math.abs(t.depositDeduct!) } : x)),
              ledger,
            }))
          }
          set((s) => ({
            tickets: s.tickets.map((x) =>
              x.id === id
                ? { ...x, status: '已解决', handler: manager, resolution, resolvedAt: now(), timeline: [...x.timeline, { at: now(), actor: manager, action: `店长审批通过：${resolution}` }] }
                : x),
          }))
        },

        rejectTicket: (id, manager, reason) =>
          set((s) => ({
            tickets: s.tickets.map((t) =>
              t.id === id
                ? { ...t, status: '已驳回', handler: manager, resolution: reason, resolvedAt: now(), timeline: [...t.timeline, { at: now(), actor: manager, action: `店长驳回：${reason}` }] }
                : t),
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
        // 开场前异常处置
        // ========================================================
        raiseDisruption: ({ sessionId, type, title, detail, raisedBy }) => {
          const ss = get().sessions.find((x) => x.id === sessionId)!
          const id = uid('dc')
          const at = now()
          set((s) => ({
            cases: [{ id, sessionId, storeId: ss.storeId, type, title, detail, raisedAt: at, raisedBy, status: '异常已登记' }, ...s.cases],
          }))
          addEvent({
            at, type: '异常触发', actor: raisedBy, tone: 'red', sessionId, caseId: id, storeId: ss.storeId,
            title: `异常触发：${type} —— ${title}`,
            detail: `${detail} 原场次保持当前状态、名额冻结，不做简单取消；系统开始统筹已报名玩家、候补队列、主持排班、房间、剧本库存与会员权益。`,
          })
          notify({
            audience: 'manager', caseId: id, sessionId,
            title: `需人工介入：${type}`, body: `${title}。请在「异常改期中心」计算并发起改期方案。`,
            dedupKey: `case-new:${id}`,
          })
          return id
        },

        computePlans: (caseId) => {
          const s = get()
          const dc = s.cases.find((c) => c.id === caseId)!
          const fresh = buildPlans(domainOf(s), dc, now())
          set((st) => ({
            // 候选方案重新计算；已选方案（确认中/执行/回滚）保留
            plans: [...st.plans.filter((p) => p.caseId !== caseId || p.status !== '候选'), ...fresh],
            cases: st.cases.map((c) => c.id === caseId && ['异常已登记', '执行失败已回滚'].includes(c.status) ? { ...c, status: '方案计算中' } : c),
          }))
          addEvent({
            at: now(), type: '方案计算', actor: '系统', tone: 'blue', caseId, sessionId: dc.sessionId, storeId: dc.storeId,
            title: `重新计算 ${fresh.length} 个候选安排`,
            detail: `按玩家可接受时段、角色偏好、拼车/同行关系、会员优先级、房间容量与主持技能匹配计算；不可行候选标注冲突资源。可行：${fresh.filter((p) => p.feasible).length} 个。`,
          })
        },

        selectPlan: (caseId, planId, deadlineMin) => {
          const s = get()
          const plan = s.plans.find((p) => p.id === planId)!
          const dc = s.cases.find((c) => c.id === caseId)!
          if (!plan.feasible) return
          const deadline = addMinutes(now(), deadlineMin)
          const newCaseStatus: DisruptionCase['status'] = plan.requiresConfirm ? '待玩家确认' : '待店长执行'
          set((st) => ({
            plans: st.plans.map((p) =>
              p.caseId === caseId
                ? p.id === planId
                  ? { ...p, status: p.requiresConfirm ? '玩家确认中' : '满足执行条件', confirmDeadline: p.requiresConfirm ? deadline : undefined }
                  : (['候选', '玩家确认中', '满足执行条件'].includes(p.status) ? { ...p, status: '已作废' } : p)
                : p),
            cases: st.cases.map((c) => c.id === caseId ? { ...c, chosenPlanId: planId, status: newCaseStatus } : c),
          }))
          addEvent({
            at: now(), type: '玩家确认', actor: '店长', tone: 'purple', caseId, sessionId: dc.sessionId, storeId: dc.storeId,
            title: `店长发起方案：${plan.title}`,
            detail: plan.requiresConfirm
              ? `向 ${plan.responses.length} 个同行组下发确认，倒计时 ${deadlineMin} 分钟（截止 ${deadline.slice(11, 16)}）。未响应将按「超时未响应」保留权益，不随迁、不占座。`
              : '该方案无需逐组确认，可由店长直接执行。',
          })
          plan.responses.forEach((r) => {
            notify({
              audience: 'player', caseId, sessionId: dc.sessionId,
              title: `场次异常改期方案待确认：${plan.title}`,
              body: `请在 ${deadline.slice(5, 16).replace('T', ' ')} 前选择同意/拒绝；未响应将自动保留全额权益。`,
              dedupKey: `plan-selected:${planId}:${r.bookingId}`,
            })
          })
        },

        respondPlan: (planId, bookingId, decision, acceptedSlot) => {
          const s = get()
          const plan = s.plans.find((p) => p.id === planId)
          if (!plan) return
          const resp = plan.responses.find((r) => r.bookingId === bookingId)
          if (!resp || resp.decision !== '待响应') return // 幂等：重复确认不产生重复效果/通知
          const at = now()
          set((st) => ({
            plans: st.plans.map((p) => {
              if (p.id !== planId) return p
              const responses = p.responses.map((r) => r.bookingId === bookingId ? { ...r, decision, at, acceptedSlot } : r)
              const done = responses.every((r) => r.decision !== '待响应')
              return { ...p, responses, status: done ? '满足执行条件' : p.status }
            }),
          }))
          // 若这是最后一个响应 → 异常单进入待执行
          const updated = get().plans.find((p) => p.id === planId)!
          if (updated.responses.every((r) => r.decision !== '待响应')) {
            set((st) => ({ cases: st.cases.map((c) => c.chosenPlanId === planId ? { ...c, status: '待店长执行' } : c) }))
          }
          const dc = s.cases.find((c) => c.id === plan.caseId)!
          addEvent({
            at, type: '玩家确认', actor: `玩家·${s.bookings.find((b) => b.id === bookingId)?.contactName ?? ''}`,
            tone: decision === '同意' ? 'green' : 'red', caseId: plan.caseId, sessionId: dc.sessionId, storeId: dc.storeId,
            title: `同行组（${resp.partyNames.join('、')}）${decision}方案`,
            detail: decision === '拒绝'
              ? '该组不随迁：提交时按门店原因全额退款，不扣占位费。'
              : acceptedSlot ? `同意，仅接受指定时段：${acceptedSlot}` : '同意按方案迁移，权益将随场次平移。',
          })
          notify({
            audience: 'manager', caseId: plan.caseId, sessionId: dc.sessionId,
            title: `玩家${decision}：${resp.partyNames.join('、')}`,
            body: decision === '同意' ? '该同行组同意迁移，等待其余组确认后可原子提交。' : '该同行组拒绝迁移，提交时将全额退款。',
            dedupKey: `plan-response:${planId}:${bookingId}`,
          })
        },

        expirePlanResponses: (planId) => {
          const s = get()
          const plan = s.plans.find((p) => p.id === planId)
          if (!plan || !plan.responses.some((r) => r.decision === '待响应')) return
          const at = now()
          const timedOut = plan.responses.filter((r) => r.decision === '待响应')
          set((st) => ({
            plans: st.plans.map((p) => p.id === planId ? {
              ...p,
              responses: p.responses.map((r) => r.decision === '待响应' ? { ...r, decision: '超时未响应' as const, at } : r),
              status: '满足执行条件',
            } : p),
            cases: st.cases.map((c) => c.chosenPlanId === planId ? { ...c, status: '待店长执行' } : c),
          }))
          addEvent({
            at, type: '玩家确认', actor: '系统', tone: 'amber', caseId: plan.caseId,
            title: `确认倒计时结束：${timedOut.length} 个同行组超时未响应`,
            detail: '按公开规则：超时未响应组不随迁、不占新场座位，已付金额转为「全额权益保留」，等待补位。',
          })
          timedOut.forEach((r) => notify({
            audience: 'player', caseId: plan.caseId,
            title: '确认超时：已为你保留全额权益',
            body: '你未在倒计时内响应，付款已转为全额权益券；名额释放继续可售/候补，补位时优先通知你。',
            dedupKey: `plan-timeout:${planId}:${r.bookingId}`,
          }))
        },

        commitPlan: (planId) => {
          const s0 = get()
          const plan0 = s0.plans.find((p) => p.id === planId)
          const dc0 = s0.cases.find((c) => c.id === plan0?.caseId)
          if (!plan0 || !dc0) return { ok: false, error: '方案不存在' }
          // 幂等：重复提交直接返回首次执行结果，绝不重复退款/重复迁移
          if (plan0.status === '已执行' && plan0.execution) {
            addEvent({
              at: now(), type: '执行成功', actor: '店长', tone: 'green', caseId: dc0.id, sessionId: dc0.sessionId,
              title: '重复确认已被幂等拦截', detail: `该方案已于 ${plan0.executedAt} 执行（事务 ${plan0.execution.txId}），未产生重复退款或重复座位。`,
            })
            return { ok: true, execution: plan0.execution }
          }
          if (!['满足执行条件'].includes(plan0.status) && !(!plan0.requiresConfirm && ['候选'].includes(plan0.status)))
            return { ok: false, error: `方案当前状态为「${plan0.status}」，不满足提交条件` }

          // —— 阶段 0：终检（原场次名额 → 目标余量 → 房间 → 主持 → 库存）——
          const stages = validatePlan(domainOf(s0), dc0, plan0)
          const failed = stages.filter((x) => !x.ok)
          if (failed.length) {
            const error = failed.map((f) => `【${f.stage}】${f.error}`).join('；')
            const at = now()
            failed.forEach((f) => addEvent({
              at, type: '资源失效', actor: '系统', tone: 'red', caseId: dc0.id, sessionId: dc0.sessionId, storeId: dc0.storeId,
              title: `资源失效：${f.stage}`, detail: f.error ?? '',
            }))
            set((st) => ({
              plans: st.plans.map((p) => p.id === planId ? { ...p, status: '已回滚', lastCommitError: error } : p),
              cases: st.cases.map((c) => c.id === dc0.id ? { ...c, status: '执行失败已回滚' } : c),
            }))
            addEvent({
              at, type: '资源回滚', actor: '系统', tone: 'red', caseId: dc0.id, sessionId: dc0.sessionId, storeId: dc0.storeId,
              title: '整体回滚：本次确认未生效',
              detail: '原场次保持可售/候补状态；玩家权益未扣减、未产生退款流水、未产生座位；可重新计算方案或清除并发抢占后重试。',
            })
            notify({
              audience: 'all', caseId: dc0.id, sessionId: dc0.sessionId,
              title: '改期确认失败，已整体回滚', body: error,
              dedupKey: `commit-fail:${planId}:${failed.map((f) => f.stage).join('|')}`,
            })
            return { ok: false, error }
          }

          // —— 阶段 1：一次性锁定四类资源并在同一次状态更新内提交（原子）——
          const txId = uid('tx')
          const at = now()
          const origin = s0.sessions.find((x) => x.id === dc0.sessionId)!
          const script = s0.scripts.find((x) => x.id === origin.scriptId)!
          const plan = plan0
          const consentBookings = plan.responses.filter((r) => r.decision === '同意')
            .map((r) => s0.bookings.find((b) => b.id === r.bookingId)!).filter(Boolean)
          const refusedBookings = plan.responses.filter((r) => r.decision === '拒绝')
            .map((r) => s0.bookings.find((b) => b.id === r.bookingId)!).filter(Boolean)
          const timeoutBookings = plan.responses.filter((r) => r.decision === '超时未响应')
            .map((r) => s0.bookings.find((b) => b.id === r.bookingId)!).filter(Boolean)

          let ledger = s0.ledger
          let sessions = s0.sessions
          let bookings = s0.bookings
          let locks = s0.locks
          let vouchers = s0.vouchers
          let cases = s0.cases
          let plans = s0.plans
          let waitlist = s0.waitlist
          const newLocks: ResourceLock[] = []
          const execution: NonNullable<ReschedulePlan['execution']> = {
            txId, at, movedBookingIds: consentBookings.map((b) => b.id), refunds: [], voucherIds: [], lockIds: [],
          }
          const mkLock = (kind: ResourceLock['kind'], refId: string, label: string, detail: string, storeId: string) => {
            const l: ResourceLock = {
              id: uid('lk'), caseId: dc0.id, planId, kind, refId, label, detail,
              storeId, status: '已锁定', since: at, expireAt: plan.confirmDeadline,
            }
            newLocks.push(l); locks = [...locks, l]; execution.lockIds.push(l.id)
          }

          const refundBooking = (b: Booking, reason: string) => {
            for (const p of b.players) {
              if (!p.paid || p.paidAmount <= 0) continue
              const idem = `case-refund:${dc0.id}:${p.id}`
              const before = ledger.length
              ledger = ledgerPush(ledger, {
                kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: origin.id,
                memo: `${reason}：${p.name} 全额退款 ¥${p.paidAmount}（门店原因，不扣占位费）`,
                operator: '店长', idemKey: idem,
              })
              if (ledger.length !== before) execution.refunds.push({ bookingId: b.id, amount: p.paidAmount, ledgerId: ledger[0].id })
              bookings = bookings.map((x) => x.id === b.id
                ? { ...x, players: x.players.map((pp) => pp.id === p.id ? { ...pp, paid: false, paidAmount: 0 } : pp) }
                : x)
            }
          }
          const grantVoucher = (p: Player, kind: BenefitVoucher['kind'], amount: number, note: string) => {
            if (amount <= 0) return
            const v: BenefitVoucher = {
              id: uid('v'), playerId: p.id, playerName: p.name, memberId: p.memberId,
              kind, amount, sourceCaseId: dc0.id, sourceSessionId: origin.id,
              status: '待使用', issuedAt: at, note,
            }
            vouchers = [...vouchers, v]; execution.voucherIds.push(v.id)
          }

          // 锁 1：原场次名额
          mkLock('原场次名额', origin.id, `原场次 ${origin.id} 名额`,
            `一次性锁定 ${origin.bookingIds.length} 组玩家的迁移/退款/保留资格，防止多方案并发抢占`, origin.storeId)

          let newSessionId: string | undefined
          let targetRoom: Room | undefined
          let targetHost: Host | undefined
          let targetCopy: ScriptCopy | undefined
          if (plan.kind === '同日换场' || plan.kind === '跨店迁移') {
            const targetStore = s0.stores.find((x) => x.id === plan.targetStoreId)!
            targetRoom = s0.rooms.find((r) => r.id === plan.targetRoomId)!
            targetHost = s0.hosts.find((h) => h.id === plan.targetHostId)!
            targetCopy = s0.copies.find((c) => c.id === plan.targetCopyId)!
            mkLock('目标房间', targetRoom.id, targetRoom.name,
              `${targetStore.shortName} ${plan.targetStartAt?.slice(11, 16)} 场次房间预占`, targetStore.id)
            mkLock('主持班次', targetHost.id, `主持 ${targetHost.name} 班次`,
              `${targetStore.shortName} ${plan.targetStartAt?.slice(11, 16)} 主持班次（熟练度 ${targetHost.proficiency[script.id] ?? 0}/5）`, targetStore.id)
            mkLock('剧本库存', targetCopy.id, `盒装 ${targetCopy.code}`,
              `《${script.name}》盒装库存一次性锁定（${targetStore.shortName}）`, targetStore.id)

            if (plan.targetSessionId) {
              // 并入已有场次
              newSessionId = plan.targetSessionId
              sessions = sessions.map((x) => x.id === newSessionId
                ? { ...x, bookingIds: [...x.bookingIds, ...consentBookings.map((b) => b.id)] }
                : x)
            } else {
              // 新建目标场次
              const ns: Session = {
                id: uid('ss'), storeId: targetStore.id, scriptId: script.id,
                date: plan.targetStartAt!.slice(0, 10), startKey: plan.targetStartAt!.slice(11, 16),
                startAt: plan.targetStartAt!, mode: origin.mode,
                roomId: targetRoom.id, hostId: targetHost.id, copyId: targetCopy.id,
                status: '已成局', bookingIds: consentBookings.map((b) => b.id),
                propIssues: [], depositCharged: 0, createdAt: at, createdBy: `异常改期 ${dc0.id}`,
              }
              newSessionId = ns.id
              sessions = [ns, ...sessions]
            }
            // 同意组迁入
            bookings = bookings.map((b) => consentBookings.some((x) => x.id === b.id)
              ? { ...b, sessionId: newSessionId, storeId: targetStore.id, status: '已改期' }
              : b)
            // 跨店迁移：发放交通补偿；拒绝组全额退款
            const cross = plan.kind === '跨店迁移'
            consentBookings.flatMap((b) => b.players).forEach((p) => {
              if (cross) grantVoucher(p, '异常补偿券', 20, '跨店迁移交通补偿券')
            })
            // 超时组：全额权益保留券
            timeoutBookings.forEach((b) => b.players.forEach((p) => {
              if (p.paid) grantVoucher(p, '全额权益保留', p.paidAmount, '确认超时未响应：全额权益保留，等待补位')
            }));
            // 拒绝/超时组标记：拒绝退款并移出原场次；超时保留在原场次
            refusedBookings.forEach((b) => {
              refundBooking(b, '拒绝跨场/跨店迁移')
              bookings = bookings.map((x) => x.id === b.id ? { ...x, status: '已取消', sessionId: undefined } : x)
            })
            bookings = bookings.map((b) => timeoutBookings.some((x) => x.id === b.id)
              ? { ...b, players: b.players.map((p) => ({ ...p, benefitStatus: '权益保留中' as const })) } : b)

            // 原场次 → 改期待补（名额继续可售/可候补）
            sessions = sessions.map((x) => x.id === origin.id
              ? { ...x, status: '改期待补', bookingIds: x.bookingIds.filter((id) => !consentBookings.some((b) => b.id === id) && !refusedBookings.some((b) => b.id === id)) }
              : x)
          } else if (plan.kind === '全额退款') {
            const all = sessionBookings(domainOf({ ...s0, sessions, bookings }), origin.id)
            all.forEach((b) => {
              refundBooking(b, '异常改期方案：全额退款')
              bookings = bookings.map((x) => x.id === b.id ? { ...x, status: '已取消', sessionId: undefined } : x)
            })
            sessions = sessions.map((x) => x.id === origin.id ? { ...x, status: '改期待补', bookingIds: [] } : x)
          } else {
            // 保留权益待补位
            const remain = sessionBookings(domainOf({ ...s0, sessions, bookings }), origin.id)
            remain.forEach((b) => b.players.forEach((p) => {
              if (p.paid) grantVoucher(p, '全额权益保留', p.paidAmount, '门店异常：付款转全额权益，等待补位优先核销')
            }))
            bookings = bookings.map((b) => b.sessionId === origin.id
              ? { ...b, players: b.players.map((p) => ({ ...p, benefitStatus: '权益保留中' as const })) } : b)
            sessions = sessions.map((x) => x.id === origin.id ? { ...x, status: '改期待补' } : x)
            void waitlist
          }

          // 锁生效
          locks = locks.map((l) => newLocks.some((n) => n.id === l.id) ? { ...l, status: '已生效' } : l)
          plans = plans.map((p) => p.id === planId
            ? { ...p, status: '已执行', executedAt: at, execution, contentions: [] }
            : p)
          const finalStatus: DisruptionCase['status'] =
            plan.kind === '全额退款' ? '已退款' : plan.kind === '保留权益待补位' ? '已保留权益' : '已改期'
          cases = cases.map((c) => c.id === dc0.id ? { ...c, status: finalStatus, chosenPlanId: planId, resolvedAt: at } : c)

          set({ sessions, bookings, ledger, locks, vouchers, cases, plans, waitlist })

          // —— 事件时间线 ——
          addEvent({
            at, type: '资源锁定', actor: '系统', tone: 'gold', caseId: dc0.id, sessionId: origin.id, storeId: dc0.storeId,
            title: `原子提交：一次性锁定 ${newLocks.length} 项资源`,
            detail: newLocks.map((l) => `${l.kind}（${l.label}）`).join('；') + `；事务号 ${txId}`,
          })
          if (newSessionId) {
            addEvent({
              at, type: '排班变更', actor: '系统', tone: 'blue', caseId: dc0.id, sessionId: newSessionId, storeId: plan.targetStoreId,
              title: plan.kind === '跨店迁移' ? `跨店迁移完成：${consentBookings.length} 组并入/新开场次 ${newSessionId}` : `同日换场完成：新场次 ${newSessionId}`,
              detail: `目标：${s0.stores.find((x) => x.id === plan.targetStoreId)?.shortName} ${plan.targetStartAt?.slice(11, 16)}，房间 ${targetRoom!.name}，主持 ${targetHost!.name}，盒装 ${targetCopy!.code}。角色配置按偏好整体平移。`,
            })
          }
          execution.refunds.forEach((r) => {
            const b = s0.bookings.find((x) => x.id === r.bookingId)
            addEvent({
              at, type: '退款', actor: '系统', tone: 'green', caseId: dc0.id, sessionId: origin.id,
              title: `全额退款 ¥${r.amount}（${b?.contactName ?? r.bookingId}组）`,
              detail: `门店原因，原路全额退回、不扣占位费；幂等键 case-refund:${dc0.id}:*，重复确认不会重复退款。`,
            })
          })
          execution.voucherIds.forEach((vid) => {
            const v = vouchers.find((x) => x.id === vid)!
            addEvent({
              at, type: '补偿', actor: '系统', tone: 'gold', caseId: dc0.id, sessionId: origin.id,
              title: `${v.kind}：${v.playerName} ¥${v.amount}`, detail: v.note,
            })
          })
          addEvent({
            at, type: '执行成功', actor: '店长', tone: 'green', caseId: dc0.id, sessionId: origin.id, storeId: dc0.storeId,
            title: `方案执行成功：${plan.title}`,
            detail: `原场次 ${origin.id} 转为「改期待补」，名额继续可售/可候补；${execution.lockIds.length} 项资源锁生效，事务 ${txId} 完成。`,
          })
          notify({
            audience: 'all', caseId: dc0.id, sessionId: origin.id,
            title: `改期方案已执行：${plan.title}`,
            body: `迁移 ${execution.movedBookingIds.length} 组 · 退款 ${execution.refunds.length} 笔 · 权益 ${execution.voucherIds.length} 张，原场次保持可候补。`,
            dedupKey: `commit-ok:${planId}`,
          })
          return { ok: true, execution }
        },

        closeCase: (caseId) =>
          set((s) => ({ cases: s.cases.map((c) => c.id === caseId ? { ...c, status: '已关闭', resolvedAt: now() } : c) })),

        manualAdjust: (sessionId, patch, reason) => {
          if (!reason.trim()) return { ok: false, error: '手工调整必须填写原因' }
          if (patch.roomId) {
            const r = get().assignRoom(sessionId, patch.roomId, reason)
            if (!r.ok) return r
          }
          if (patch.hostId) {
            const r = get().assignHost(sessionId, patch.hostId, reason)
            if (!r.ok) return r
          }
          return { ok: true }
        },

        sweepDeadlines: () => {
          const t = now()
          get().plans.forEach((p) => {
            if (p.status === '玩家确认中' && p.confirmDeadline && p.confirmDeadline < t) get().expirePlanResponses(p.id)
          })
          // 预占锁 TTL 到期释放（与确认倒计时一致）
          set((s) => ({
            locks: s.locks.map((l) => l.status === '已锁定' && l.expireAt && l.expireAt < t
              ? { ...l, status: '已释放', releasedAt: t } : l),
          }))
        },

        // ---------------- 候补 ----------------
        joinWaitlist: (input) => {
          const id = uid('wl')
          const entry: WaitlistEntry = {
            id, storeId: input.storeId ?? DEFAULT_STORE, scriptId: input.scriptId,
            contactName: input.contactName, contactPhone: input.contactPhone, memberId: input.memberId,
            partySize: input.partySize, prepaid: input.prepaid, autoMode: input.autoMode,
            acceptedSlots: input.acceptedSlots, rolePreferences: input.rolePreferences,
            acceptCross: input.acceptCross, status: '候补中', joinedAt: now(),
            priorityRules: [], priorityScore: 0,
          }
          set((s) => ({ waitlist: [...s.waitlist, entry] }))
          const ranked = rankWaitlist(domainOf(get()), input.scriptId, input.storeId ?? DEFAULT_STORE)
          const mine = ranked.find((r) => r.id === id)
          addEvent({
            at: now(), type: '候补', actor: `玩家·${input.contactName}`, tone: 'blue',
            title: `${input.contactName} 等 ${input.partySize} 人进入候补队列`,
            detail: `公开优先级：${mine?.scoreRules.join('；')}；当前优先级分 ${mine?.score}，排队第 ${ranked.findIndex((r) => r.id === id) + 1} 位。`,
            storeId: input.storeId ?? DEFAULT_STORE,
          })
          return id
        },

        setWaitlistMode: (id, autoMode, acceptedSlots) =>
          set((s) => ({
            waitlist: s.waitlist.map((w) => w.id === id ? { ...w, autoMode, acceptedSlots } : w),
          })),

        inviteWaitlist: (entryId, sessionId, deadlineMin) => {
          const s = get()
          const w = s.waitlist.find((x) => x.id === entryId)
          const ss = s.sessions.find((x) => x.id === sessionId)
          if (!w || !ss) return
          const deadline = addMinutes(now(), deadlineMin)
          set((st) => ({
            waitlist: st.waitlist.map((x) => x.id === entryId
              ? { ...x, status: '已邀约', invitedAt: now(), respondDeadline: deadline, promotedSessionId: sessionId } : x),
          }))
          addEvent({
            at: now(), type: '候补', actor: '系统', tone: 'amber', sessionId,
            title: `向候补玩家 ${w.contactName}（${w.partySize} 人）发送补位邀约`,
            detail: `仅限 ${ss.startKey} 场次，倒计时 ${deadlineMin} 分钟；超时未响应自动顺延下一位。`,
          })
          notify({
            audience: 'player',
            title: '候补补位邀约', body: `《${s.scripts.find((x) => x.id === w.scriptId)?.name}》${ss.startKey} 有空位，请在 ${deadline.slice(11, 16)} 前响应。`,
            dedupKey: `wl-invite:${entryId}:${sessionId}`,
          })
        },

        respondWaitlist: (entryId, accept) => {
          const s = get()
          const w = s.waitlist.find((x) => x.id === entryId)
          if (!w || w.status !== '已邀约') return
          if (!accept) {
            set((st) => ({ waitlist: st.waitlist.map((x) => x.id === entryId ? { ...x, status: '已放弃' } : x) }))
            return
          }
          const r = get().promoteWaitlistManual(entryId, w.promotedSessionId!, '玩家接受候补邀约')
          if (!r.ok) set((st) => ({ waitlist: st.waitlist.map((x) => x.id === entryId ? { ...x, status: '候补中' } : x) }))
        },

        autoFillWaitlist: (sessionId) => {
          const s = get()
          const ss = s.sessions.find((x) => x.id === sessionId)!
          const script = s.scripts.find((x) => x.id === ss.scriptId)!
          const room = s.rooms.find((r) => r.id === ss.roomId)
          const cap = Math.min(script.maxPlayers, room?.capacity ?? script.maxPlayers)
          const seats0 = cap - sessionHeadcount(domainOf(s), sessionId)
          let seats = seats0
          const promoted: string[] = []
          const skipped: { name: string; reason: string }[] = []
          const ranked = rankWaitlist(domainOf(s), ss.scriptId, ss.storeId)
          for (const w of ranked) {
            if (w.autoMode === '仅接受指定时段' && !w.acceptedSlots.includes(ss.startKey)) {
              skipped.push({ name: w.contactName, reason: `仅接受 ${w.acceptedSlots.join('/')}，不接受 ${ss.startKey}` })
              continue
            }
            if (w.autoMode === '暂不自动补位') { skipped.push({ name: w.contactName, reason: '设置为暂不自动补位' }); continue }
            if (w.partySize > seats) { skipped.push({ name: w.contactName, reason: `整组 ${w.partySize} 人 > 剩余 ${seats} 席，不拆散同行组` }); continue }
            const r = get().promoteWaitlistManual(w.id, sessionId, '系统按公开优先级自动递补')
            if (r.ok) { promoted.push(w.contactName); seats -= w.partySize }
            else skipped.push({ name: w.contactName, reason: r.error ?? '补位失败' })
          }
          return { promoted, skipped }
        },

        promoteWaitlistManual: (entryId, sessionId, reason) => {
          const s0 = get()
          const w = s0.waitlist.find((x) => x.id === entryId)
          const ss = s0.sessions.find((x) => x.id === sessionId)
          if (!w || !ss) return { ok: false, error: '候补/场次不存在' }
          if (w.status === '补位成功') return { ok: false, error: '该候补已补位（幂等拦截）' }
          if (!reason.trim()) return { ok: false, error: '手工递补必须填写原因' }
          const script = s0.scripts.find((x) => x.id === w.scriptId)!
          const room = s0.rooms.find((r) => r.id === ss.roomId)
          const cap = Math.min(script.maxPlayers, room?.capacity ?? script.maxPlayers)
          const head = sessionHeadcount(domainOf(s0), sessionId)
          if (head + w.partySize > cap)
            return { ok: false, error: `容量约束拦截：现有 ${head} 人 + 整组 ${w.partySize} 人超过 ${cap} 座上限` }
          const existing = sessionBookings(domainOf(s0), sessionId).flatMap((b) => b.players)
          const violations = roleBalanceViolations(script, [...existing, ...Array.from({ length: w.partySize }, (_, i) => ({
            rolePreference: w.rolePreferences[i] ?? '随意', acceptCrossGender: w.acceptCross[i] ?? true,
          } as Player))], { requireMin: false })
          if (violations.length) return { ok: false, error: `角色人数约束拦截：${violations.join('；')}` }

          const price = Math.round(script.price * memberDiscount(s0.members.find((m) => m.id === w.memberId)?.level))
          const players: Player[] = Array.from({ length: w.partySize }, (_, i) => ({
            id: uid('pl'),
            name: i === 0 ? w.contactName : `${w.contactName}的同行${i + 1}`,
            phone: i === 0 ? w.contactPhone : '',
            memberId: i === 0 ? w.memberId : undefined,
            rolePreference: w.rolePreferences[i] ?? '随意',
            acceptCrossGender: w.acceptCross[i] ?? true,
            paid: w.prepaid, paidAmount: w.prepaid ? price : 0, checkedIn: false,
          }))
          const booking: Booking = {
            id: uid('b'), scriptId: w.scriptId, storeId: ss.storeId, mode: '拼场',
            playersCount: w.partySize, contactName: w.contactName, contactPhone: w.contactPhone,
            memberId: w.memberId, note: '候补递补成局', expectedStart: ss.startAt,
            status: '已成局', createdAt: now(), players, sessionId, groupId: w.groupId,
            payMethod: w.prepaid ? '在线预付' : '到店付',
          }
          let ledger = s0.ledger
          if (w.prepaid) {
            for (const p of players) {
              ledger = ledgerPush(ledger, {
                kind: '报名费收入', amount: p.paidAmount, playerId: p.id, sessionId,
                memo: `${p.name} 候补递补（报名时在线预付）`, operator: '系统', idemKey: `wl-pay:${w.id}:${p.id}`,
              })
            }
          }
          set((st) => ({
            bookings: [booking, ...st.bookings],
            sessions: st.sessions.map((x) => x.id === sessionId ? { ...x, bookingIds: [...x.bookingIds, booking.id] } : x),
            waitlist: st.waitlist.map((x) => x.id === entryId ? { ...x, status: '补位成功', promotedSessionId: sessionId } : x),
            ledger,
          }))
          addEvent({
            at: now(), type: '候补', actor: reason.includes('系统') ? '系统' : '店长', tone: 'green', sessionId, storeId: ss.storeId,
            title: `候补递补成功：${w.contactName} 整组 ${w.partySize} 人`,
            detail: `依据公开优先级（${w.status === '已邀约' ? '玩家响应邀约' : reason}）；优先级规则：会员等级/到店次数/预付/登记次序，同行整组不拆分；容量与角色人数约束已通过。`,
          })
          return { ok: true }
        },

        toggleSimClaim: (claim) => {
          const exists = get().simClaims.find((c) => c.kind === claim.kind && c.refId === claim.refId && c.startAt === claim.startAt)
          if (exists) {
            set((s) => ({ simClaims: s.simClaims.filter((c) => c.id !== exists.id) }))
            addEvent({ at: now(), type: '资源回滚', actor: '店长', tone: 'blue', title: `已解除模拟抢占：${claim.kind} ${claim.refId}`, detail: claim.by, })
          } else {
            const c: SimClaim = { ...claim, id: uid('claim') }
            set((s) => ({ simClaims: [...s.simClaims, c] }))
            addEvent({ at: now(), type: '资源失效', actor: '店长', tone: 'red', title: `模拟多店同时抢占：${claim.kind} 被「${claim.by}」锁定`, detail: '下一次原子确认将在该阶段终检失败并整体回滚。' })
          }
        },

        markNotificationRead: (id) =>
          set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) })),
        markAllNotificationsRead: () =>
          set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

        resetDemo: () =>
          set({
            scripts: seedScripts, stores: seedStores, hosts: seedHosts, rooms: seedRooms,
            members: seedMembers, copies: seedCopies, bookings: seedBookings, sessions: seedSessions,
            tickets: seedTickets, ledger: seedLedger, reviews: [], debriefs: [],
            cases: seedCases, plans: [], locks: [], waitlist: seedWaitlist, vouchers: [],
            events: seedEvents, notifications: [], simClaims: [], currentRole: 'manager',
          }),
      }
      return state
    },
    { name: 'mystery-session-store-v2' },
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

export const sessionHeadcountSel = (sessionId: string) => sessionPlayers(sessionId).length

export function sessionRisk(ss: Session) {
  const st = useStore.getState()
  const script = st.scripts.find((x) => x.id === ss.scriptId)
  const players = sessionPlayers(ss.id)
  const paid = players.filter((p) => p.paid).length
  const risks: string[] = []
  if (script && players.length < script.minPlayers && !['已解散', '改期待补'].includes(ss.status)) risks.push(`人数未成局（${players.length}/${script.minPlayers}）`)
  if (!ss.hostId) risks.push('无主持')
  const openTickets = st.tickets.filter((t) => t.sessionId === ss.id && (t.status === '待店长审批' || t.status === '待处理' || t.status === '处理中'))
  if (openTickets.some((t) => t.type === '结账争议')) risks.push('存在结账争议')
  if (openTickets.some((t) => t.refundAmount)) risks.push('有待批退款')
  const openCase = st.cases.find((c) => c.sessionId === ss.id && !['已改期', '已退款', '已保留权益', '已关闭'].includes(c.status))
  if (openCase) risks.push(`开场前异常处置中（${openCase.type}）`)
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

export const repurchaseRanking = () =>
  useStore.getState().members.slice().sort((a, b) => b.visits - a.visits)

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

export { today }
