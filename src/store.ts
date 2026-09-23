import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Script, Host, Room, Member, Booking, Session, Ticket, LedgerEntry,
  Review, HostDebrief, Player, SessionStatus, TicketType, TicketStatus,
  PropIssue, PropStatus, LedgerKind,
} from './types'
import {
  seedScripts, seedHosts, seedRooms, seedMembers, seedBookings,
  seedSessions, seedTickets, seedLedger, seedProps, scriptRoles,
} from './seed'

// ---------- 工具 ----------
let seq = 100
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`
const now = () => new Date().toISOString().slice(0, 19)
const today = () => new Date().toISOString().slice(0, 10)

export const memberDiscount = (level?: Member['level']) =>
  level === '金卡' ? 0.9 : level === '银卡' ? 0.95 : 1

interface State {
  scripts: Script[]
  hosts: Host[]
  rooms: Room[]
  members: Member[]
  bookings: Booking[]
  sessions: Session[]
  tickets: Ticket[]
  ledger: LedgerEntry[]
  reviews: Review[]
  debriefs: HostDebrief[]
  currentRole: 'player' | 'frontdesk' | 'host' | 'manager' | 'service'
  currentMemberId?: string

  // 角色切换
  setRole: (r: State['currentRole'], memberId?: string) => void

  // 玩家：提交预约
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
    acknowledgedSafety: boolean
    payMethod: Booking['payMethod']
  }) => string

  cancelBooking: (id: string) => void

  // 门店：排班生成
  /** 为某剧本某开场自动生成场次（按拼场人数/房间/主持档期/熟练度） */
  generateSession: (scriptId: string, date: string, startKey: string, mode: Session['mode']) => string | { error: string }
  assignRoom: (sessionId: string, roomId: string) => void
  assignHost: (sessionId: string, hostId: string) => void
  /** 查询某开场可用主持（档期空闲 + 熟练度排序） */
  eligibleHosts: (scriptId: string, startAt: string) => Host[]
  eligibleRooms: (scriptId: string, startAt: string) => Room[]

  // 场次状态机推进
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
    sessionId?: string
    bookingId?: string
    playerId?: string
    type: TicketType
    title: string
    detail: string
    raisedBy: string
    refundAmount?: number
    depositDeduct?: number
  }) => void
  progressTicket: (id: string, action: string, actor: string, patch?: Partial<Ticket>) => void
  approveTicket: (id: string, manager: string, resolution: string) => void
  rejectTicket: (id: string, manager: string, reason: string) => void

  // 收退款
  postLedger: (e: Omit<LedgerEntry, 'id' | 'at'>) => void

  // 复盘
  submitReview: (r: Omit<Review, 'id' | 'at'>) => void
  submitDebrief: (d: Omit<HostDebrief, 'id' | 'at'>) => void

  resetDemo: () => void
}

// 场次时间是否重叠（粗略：按剧本时长）
const overlaps = (a: { startAt: string; durationMin: number }, bStartAt: string, bDur: number) => {
  const t1 = new Date(a.startAt).getTime()
  const t2 = new Date(bStartAt).getTime()
  return t1 < t2 + bDur * 60000 && t2 < t1 + a.durationMin * 60000
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      scripts: seedScripts,
      hosts: seedHosts,
      rooms: seedRooms,
      members: seedMembers,
      bookings: seedBookings,
      sessions: seedSessions,
      tickets: seedTickets,
      ledger: seedLedger,
      reviews: [],
      debriefs: [],
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
            rolePreference: input.rolePreferences[i] || '随意',
            acceptCrossGender: input.acceptCross[i] ?? true,
            isBirthday: isContact && input.mode === '生日局',
            paid,
            paidAmount: paid ? price : 0,
            checkedIn: false,
          }
        })
        const booking: Booking = {
          id,
          scriptId: input.scriptId,
          mode: input.mode,
          playersCount: input.playersCount,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          memberId: input.memberId,
          note: input.note,
          expectedStart: startAt,
          status: '待拼场',
          createdAt: now(),
          players,
          acknowledgedSafety: input.acknowledgedSafety,
          payMethod: input.payMethod,
        }
        set((st) => ({ bookings: [booking, ...st.bookings] }))

        // 在线预付 → 报名费收入流水
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
        // 未排场次：预付玩家原路退款
        b.players.filter((p) => p.paid).forEach((p) =>
          get().postLedger({
            kind: '退款支出', amount: -p.paidAmount, playerId: p.id, sessionId: '',
            memo: `${p.name} 取消预约，原路退款`, operator: '系统',
          }),
        )
        set((s) => ({
          bookings: s.bookings.map((x) => (x.id === bid ? { ...x, status: '已取消' } : x)),
        }))
      },

      // ---------------- 排班成局 ----------------
      eligibleHosts: (scriptId, startAt) => {
        const s = get()
        const script = s.scripts.find((x) => x.id === scriptId)!
        return s.hosts
          .filter((h) => !h.unavailable.includes(startAt))
          .filter((h) => !s.sessions.some((ss) =>
            ss.hostId === h.id && ss.status !== '已解散' && ss.status !== '已复盘' &&
            overlaps({ startAt: ss.startAt, durationMin: script.durationMin }, startAt, script.durationMin)))
          .sort((a, b) => (b.proficiency[scriptId] ?? 0) - (a.proficiency[scriptId] ?? 0))
      },

      eligibleRooms: (scriptId, startAt) => {
        const s = get()
        const script = s.scripts.find((x) => x.id === scriptId)!
        return s.rooms
          .filter((r) => r.capacity >= script.minPlayers)
          .filter((r) => !s.sessions.some((ss) =>
            ss.roomId === r.id && ss.status !== '已解散' && ss.status !== '已复盘' &&
            overlaps({ startAt: ss.startAt, durationMin: script.durationMin }, startAt, script.durationMin)))
          .sort((a, b) => a.capacity - b.capacity)
      },

      generateSession: (scriptId, date, startKey, mode) => {
        const st = get()
        const script = st.scripts.find((s) => s.id === scriptId)!
        const startAt = `${date}T${startKey}`

        // 拼场：归集同剧本同开场、未成局的预约
        const pool = st.bookings.filter((b) =>
          b.scriptId === scriptId && b.status === '待拼场' &&
          (mode === '拼场' || b.mode === mode || mode === '生日局') &&
          b.expectedStart === startAt,
        )
        // 包场：需单条预约人数达到下限（包场不拼陌生人）
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

        const hosts = get().eligibleHosts(scriptId, startAt)
        const rooms = get().eligibleRooms(scriptId, startAt)
        if (!rooms.length) return { error: '该时段没有空闲房间（容量满足且未被占用）' }

        const id = uid('ss')
        const bestHost = hosts[0]
        const session: Session = {
          id,
          scriptId,
          date,
          startKey,
          startAt,
          mode,
          roomId: rooms[0].id,
          hostId: bestHost?.id, // 主持可能档期全满 → undefined，等待人工调班
          status: bestHost && (bestHost.proficiency[scriptId] ?? 0) >= 3 ? '已成局' : '待成局',
          bookingIds: picked.map((b) => b.id),
          propIssues: [],
          depositCharged: 0,
          createdAt: now(),
          createdBy: '排班系统',
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
          refundAmount: p?.paid ? Math.round(p.paidAmount * 0.7) : undefined, // 默认扣 30% 占位费
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
        // 已手动分配的角色保留；按角色偏好（C位/推理位/情感位…）匹配 hint，余下轮询
        const used = new Set(players.map((p) => p.assignedRole).filter(Boolean) as string[])
        for (const p of players) {
          if (p.assignedRole) continue
          const pool = roles.filter((r) => !used.has(r.name))
          const key = p.rolePreference.replace(/位/g, '')
          const pref = pool.find((r) => r.hint.includes(key) || key.includes(r.hint[0] ?? '___'))
          // 有明确性别建议的角色尽量留给未声明接受反串之外的人：简化为优先把不限性别角色分给不接受反串者
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
        // 押金流水（按人数收，演示简化为按场次收一笔）
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
        const b = st.bookings.find((bk) => bk.id === ss.bookingIds[0] || bk.players.some((p) => p.id === pid))
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
        void b
      },

      checkoutSession: (sid) => {
        const st = get()
        const ss = st.sessions.find((x) => x.id === sid)!
        const script = st.scripts.find((x) => x.id === ss.scriptId)!
        // 结账：未支付玩家 → 先在 UI 阻止，这里兜底；退剩余押金（扣除损耗）
        const totalDeposit = script.deposit
        const back = totalDeposit - ss.depositCharged
        if (back > 0) {
          get().postLedger({ kind: '押金退还', amount: -back, sessionId: sid, memo: `道具验收后退还押金（扣损耗 ¥${ss.depositCharged}）`, operator: '前台' })
        }
        // 会员复购 +1
        const memberIds = st.bookings.filter((b) => b.sessionId === sid).flatMap((b) => b.players.map((p) => p.memberId)).filter(Boolean) as string[]
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === sid ? { ...x, status: '已结账' } : x)),
          members: s.members.map((m) => (memberIds.includes(m.id) ? { ...m, visits: m.visits + 1 } : m)),
        }))
      },

      disbandSession: (sid, reason) => {
        const st = get()
        const ss = st.sessions.find((x) => x.id === sid)!
        // 全额退款给已支付玩家
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
          raisedBy, raisedAt: now(),
          refundAmount, depositDeduct,
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
        // 执行退款 / 扣押金
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
        // 主持表现回写到主持均分
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
        // 熟练度调整 → 影响下一轮排班排序
        set((s) => ({
          hosts: s.hosts.map((h) => {
            if (h.id !== d.hostId) return h
            const cur = h.proficiency[d.scriptId] ?? 0
            return { ...h, proficiency: { ...h.proficiency, [d.scriptId]: Math.max(0, Math.min(5, cur + d.proficiencyDelta)) } }
          }),
          sessions: s.sessions.map((x) => (x.id === d.sessionId ? { ...x, status: '已复盘', reviewDone: true } : x)),
        }))
      },

      resetDemo: () =>
        set({
          scripts: seedScripts, hosts: seedHosts, rooms: seedRooms, members: seedMembers,
          bookings: seedBookings, sessions: seedSessions, tickets: seedTickets,
          ledger: seedLedger, reviews: [], debriefs: [], currentRole: 'manager',
        }),
    }),
    { name: 'mystery-session-store-v1' },
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

/** 退款风险：已支付人数多 + 人数不足/主持缺席/争议工单 */
export function sessionRisk(ss: Session) {
  const st = useStore.getState()
  const script = st.scripts.find((x) => x.id === ss.scriptId)
  const players = sessionPlayers(ss.id)
  const paid = players.filter((p) => p.paid).length
  const risks: string[] = []
  if (script && players.length < script.minPlayers && ss.status !== '已解散') risks.push(`人数未成局（${players.length}/${script.minPlayers}）`)
  if (!ss.hostId) risks.push('无主持')
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

/** 剧本推荐：新手优先新手友好本；老玩家按复盘难度反馈调权 */
export function recommendScripts(memberId?: string) {
  const st = useStore.getState()
  const member = st.members.find((m) => m.id === memberId)
  const reviewAvg: Record<string, number> = {}
  st.reviews.forEach((r) => {
    reviewAvg[r.sessionId] = r.score
  })
  void reviewAvg
  return st.scripts.filter((s) => s.active).map((s) => {
    const debriefs = st.debriefs.filter((d) => d.scriptId === s.id)
    // 损耗严重的剧本降低推荐（道具成本高）
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
