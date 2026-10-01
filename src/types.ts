// ============ 领域类型定义 ============

/** 恐怖程度 */
export type HorrorLevel = '不恐怖' | '微恐' | '中恐' | '重恐'
/** 推理难度 */
export type Difficulty = '新手友好' | '入门' | '进阶' | '烧脑'
/** 角色性别建议 */
export type GenderAdvice = '不限' | '建议男' | '建议女' | '需男女搭配'
/** 场次模式 */
export type SessionMode = '拼场' | '包场' | '生日局'
/** 预约状态 */
export type BookingStatus =
  | '待拼场' // 刚提交，等待成局
  | '已成局' // 已排入场次
  | '候补中' // 进入候补队列
  | '已改期' // 经异常处置迁入新场次（旧预约保留记录）
  | '已取消'
/** 场次状态（状态机） */
export type SessionStatus =
  | '待成局' // 已生成但人数不足/排班未确认
  | '已成局' // 人数达标、房间主持确认
  | '改期待补' // 异常改期：原场次玩家迁出，名额继续可售/可候补
  | '已签到' // 前台完成签到
  | '角色已分' // 角色分配完成
  | '道具已发' // 道具发放、押金收取
  | '进行中' // 主持开场
  | '休息中' // 中途休息
  | '已结账' // 体验结束完成结账
  | '已复盘' // 收集完评价/损耗/复盘
  | '已解散' // 人数不足等原因解散（触发退款）
/** 支付状态 */
export type PayStatus = '未支付' | '已支付' | '部分退款' | '已退款'
/** 工单类型 */
export type TicketType =
  | '玩家迟到'
  | '人数不足'
  | '临时退出'
  | '主持请假'
  | '要求换本'
  | '中途不适'
  | '结账争议'
  | '退款申请'
/** 工单状态 */
export type TicketStatus = '待处理' | '处理中' | '待店长审批' | '已解决' | '已驳回'
/** 收支类型 */
export type LedgerKind =
  | '报名费收入'
  | '押金收入'
  | '押金退还'
  | '退款支出'
  | '换本差价'
  | '争议补偿'
  | '异常补偿' // 异常改期发放的补偿金
/** 道具状态 */
export type PropStatus = '正常' | '轻微损耗' | '严重损耗' | '丢失'
/** 角色身份 */
export type Role = 'player' | 'frontdesk' | 'host' | 'manager' | 'service'

// ============ 多门店 ============
export interface StoreInfo {
  id: string
  name: string
  shortName: string
  district: string
  address: string
}

/** 剧本盒装库存（同一剧本在不同门店各有盒装） */
export type CopyStatus = '在库可排' | '外借中' | '损耗停用'
export interface ScriptCopy {
  id: string
  scriptId: string
  storeId: string
  code: string // 盒装编号
  status: CopyStatus
  lockedBy?: string // 占用方：场次号 / 并发抢占标记
  note?: string
}

/** 剧本 */
export interface Script {
  id: string
  name: string
  genre: string // 题材：硬核推理 / 情感 / 恐怖 / 欢乐 ...
  minPlayers: number
  maxPlayers: number
  durationMin: number
  horror: HorrorLevel
  difficulty: Difficulty
  genderAdvice: GenderAdvice
  beginnerFriendly: boolean
  startTime: string // 每日开场时间，如 "13:00 / 15:30 / 19:00 / 21:00"
  price: number
  deposit: number // 道具押金
  refundRule: string // 退款规则
  safetyNote?: string // 恐怖本安全提示
  desc: string
  active: boolean
}

/** 主持人 */
export interface Host {
  id: string
  name: string
  level: '初级主持' | '资深主持' | '金牌主持'
  storeId: string // 所属门店
  crossStore: boolean // 是否支持跨店支援
  /** 剧本熟练度 scriptId -> 0~5 */
  proficiency: Record<string, number>
  /** 档期：'2026-09-23T13:00' 这样的开场键 -> true 表示请假/不可用 */
  unavailable: string[]
  reviewScore: number // 复盘累计均分
  reviewCount: number
}

/** 房间故障/不可用时段 */
export interface RoomOutage {
  startAt: string
  endAt: string
  reason: string
}

/** 房间 */
export interface Room {
  id: string
  storeId: string
  name: string
  capacity: number
  horrorSet: boolean // 是否恐怖实景房
  outages: RoomOutage[] // 故障/不可用时段
}

/** 会员 */
export interface Member {
  id: string
  name: string
  phone: string
  level: '普通' | '银卡' | '金卡'
  visits: number // 历史到店次数（复购）
}

/** 玩家（一条预约里的玩家信息） */
export interface Player {
  id: string
  name: string
  phone: string
  memberId?: string
  rolePreference: string // 角色偏好：C位/推理位/氛围位/随意
  acceptCrossGender: boolean // 是否接受反串
  isBirthday?: boolean
  paid: boolean
  paidAmount: number
  checkedIn: boolean
  checkInAt?: string
  late?: boolean
  quit?: boolean // 临时退出
  assignedRole?: string // 分配到的剧本角色名
  benefitStatus?: '权益保留中' | '已迁回' // 异常处置后的权益状态
}

/** 预约单（玩家侧） */
export interface Booking {
  id: string
  scriptId: string
  storeId: string
  mode: SessionMode
  playersCount: number
  contactName: string
  contactPhone: string
  memberId?: string
  note: string
  expectedStart: string // 期望开场键
  status: BookingStatus
  createdAt: string
  players: Player[]
  sessionId?: string
  /** 拼车/同行关系：同一 groupId 的预约必须整组迁移、整组补位 */
  groupId?: string
  acknowledgedSafety?: boolean // 恐怖本安全提示已确认
  payMethod: '在线预付' | '到店付'
}

/** 道具实例 */
export interface PropItem {
  id: string
  name: string
  scriptId?: string
}

/** 道具发放记录 */
export interface PropIssue {
  propId: string
  name: string
  playerId?: string
  returned: boolean
  condition: PropStatus
  damageNote?: string
}

/** 收退款流水 */
export interface LedgerEntry {
  id: string
  at: string
  kind: LedgerKind
  amount: number // 正=门店收入，负=支出/退款
  playerId?: string
  sessionId: string
  ticketId?: string
  /** 幂等键：同一异常改期/同一玩家不允许重复退款 */
  idemKey?: string
  memo: string
  operator: string
}

/** 异常工单 */
export interface Ticket {
  id: string
  sessionId?: string
  bookingId?: string
  type: TicketType
  title: string
  detail: string
  status: TicketStatus
  raisedBy: string // 提交人角色
  raisedAt: string
  handler?: string
  resolution?: string
  resolvedAt?: string
  /** 是否需要店长审批/押金扣减/退款等，关联金额 */
  refundAmount?: number
  depositDeduct?: number
  playerId?: string
  timeline: { at: string; actor: string; action: string }[]
}

/** 玩家评价（复盘） */
export interface Review {
  id: string
  sessionId: string
  playerId: string
  playerName: string
  score: number // 1-5 整体体验
  hostScore: number // 主持表现 1-5
  difficultyFeel: '偏简单' | '刚好' | '偏难'
  scriptRecommend: boolean
  comment: string
  at: string
}

/** 场次（门店排班生成） */
export interface Session {
  id: string
  storeId: string
  scriptId: string
  date: string // YYYY-MM-DD
  startKey: string // HH:mm
  startAt: string // 完整时间键
  mode: SessionMode
  roomId?: string
  hostId?: string
  copyId?: string // 使用的剧本盒装库存
  status: SessionStatus
  bookingIds: string[]
  propIssues: PropIssue[]
  depositCharged: number // 已扣押金（道具损耗）
  hostInterruptNote?: string // 主持中断记录（客服串联用）
  createdAt: string
  createdBy: string
  reviewDone?: boolean
  /** 并发抢占标记（仅演示）：他店/临时包场在原子确认中抢占了该资源 */
  contention?: boolean
}

/** 主持复盘记录 */
export interface HostDebrief {
  id: string
  sessionId: string
  hostId: string
  scriptId: string
  note: string
  proficiencyDelta: number // 本场后建议熟练度调整 -1~+1
  at: string
}

// ============ 开场前异常 · 改期处置 ============

/** 异常类型 */
export type DisruptionType = '主持缺勤' | '场次延迟' | '房间不可用'

/** 异常单状态 */
export type DisruptionStatus =
  | '异常已登记' // 异常触发，原场次保持
  | '方案计算中'
  | '待玩家确认' // 已选方案，等待玩家在倒计时内响应
  | '待店长执行' // 玩家确认完成，等待店长原子确认
  | '已改期'
  | '已退款'
  | '已保留权益'
  | '执行失败已回滚'
  | '已关闭'

/** 方案类型：店长可发起的四类改期方案 */
export type PlanKind = '同日换场' | '跨店迁移' | '全额退款' | '保留权益待补位'

/** 方案状态 */
export type PlanStatus =
  | '候选' // 系统计算出的可解释候选
  | '玩家确认中' // 店长选中，等待玩家确认
  | '满足执行条件' // 玩家确认完成，可原子提交
  | '已执行'
  | '已回滚' // 原子确认中资源失效，整体回滚
  | '已作废' // 异常单选了别的方案 / 手动释放

/** 玩家（按预约整组）对方案的响应 */
export interface PlanResponse {
  bookingId: string
  /** 组内玩家名 */
  partyNames: string[]
  decision: '待响应' | '同意' | '拒绝' | '超时未响应'
  at?: string
  /** “仅接受指定时段”时玩家填写的可接受时段 */
  acceptedSlot?: string
}

/** 候选方案的一条可行性检查（可解释） */
export interface PlanFitItem {
  label: string
  ok: boolean
  detail: string
}

/** 执行结果留痕（退款/补偿/锁定，保证幂等） */
export interface PlanExecution {
  txId: string
  at: string
  movedBookingIds: string[]
  newSessionId?: string
  /** 已退款（拒绝迁移者） */
  refunds: { bookingId: string; amount: number; ledgerId: string }[]
  /** 已发权益券（超时未响应 / 保留权益 / 补偿金） */
  voucherIds: string[]
  lockIds: string[]
}

/** 改期方案 */
export interface ReschedulePlan {
  id: string
  caseId: string
  kind: PlanKind
  title: string
  /** 目标门店 / 目标场次（并入已有场次）/ 目标开场 */
  targetStoreId?: string
  targetSessionId?: string
  targetStartAt?: string
  targetRoomId?: string
  targetHostId?: string
  targetCopyId?: string
  /** 目标场次余量（迁移类方案） */
  targetVacancy?: number
  targetExistingHeadcount?: number
  /** 候选是否可行（无资源冲突） */
  feasible: boolean
  /** 冲突资源 / 不可行原因 */
  blockers: string[]
  /** 可解释说明 */
  explanations: string[]
  fit: PlanFitItem[]
  /** 综合适配分（同分时排序） */
  fitScore: number
  requiresConfirm: boolean
  confirmDeadline?: string
  responses: PlanResponse[]
  status: PlanStatus
  lastCommitError?: string
  /** 演示用：并发抢占标记，提交时必然整体回滚 */
  contentions: Array<'房间' | '主持' | '库存'>
  executedAt?: string
  execution?: PlanExecution
  createdAt: string
}

/** 异常单 */
export interface DisruptionCase {
  id: string
  sessionId: string
  storeId: string
  type: DisruptionType
  title: string
  detail: string
  raisedAt: string
  raisedBy: string
  status: DisruptionStatus
  chosenPlanId?: string
  resolvedAt?: string
}

/** 资源锁类型：原场次名额 / 目标房间 / 主持班次 / 剧本库存 */
export type LockKind = '原场次名额' | '目标房间' | '主持班次' | '剧本库存'
export type LockStatus = '已锁定' | '已生效' | '已释放' | '已失效'
export interface ResourceLock {
  id: string
  caseId: string
  planId: string
  kind: LockKind
  storeId: string
  /** roomId / hostId / copyId / sessionId */
  refId: string
  label: string
  detail: string
  status: LockStatus
  since: string
  /** 预占锁 TTL（与玩家确认倒计时一致，超时自动释放） */
  expireAt?: string
  releasedAt?: string
}

// ============ 候补队列 ============

/** 自动补位策略 */
export type WaitlistAutoMode = '同意自动补位' | '仅接受指定时段' | '暂不自动补位'
export type WaitlistStatus = '候补中' | '已邀约' | '补位成功' | '超时未响应' | '已放弃'

export interface WaitlistEntry {
  id: string
  storeId: string
  scriptId: string
  contactName: string
  contactPhone: string
  memberId?: string
  partySize: number // 同行人数（整组补位）
  groupId?: string
  prepaid: boolean // 是否已在线预付（公开优先级因子）
  autoMode: WaitlistAutoMode
  /** 仅接受指定时段：可接受开场键列表 */
  acceptedSlots: string[]
  rolePreferences: string[]
  acceptCross: boolean[]
  status: WaitlistStatus
  joinedAt: string
  invitedAt?: string
  respondDeadline?: string
  promotedSessionId?: string
  /** 优先级解释（公开规则） */
  priorityRules: string[]
  priorityScore: number
}

// ============ 会员权益 ============

export type VoucherKind = '全额权益保留' | '改期改签券' | '异常补偿券'
export type VoucherStatus = '待使用' | '已锁定' | '已使用'
export interface BenefitVoucher {
  id: string
  playerId: string
  playerName: string
  memberId?: string
  kind: VoucherKind
  amount: number
  sourceCaseId?: string
  sourceSessionId?: string
  status: VoucherStatus
  issuedAt: string
  note: string
}

// ============ 场次事件时间线 & 站内通知 ============

export type SessionEventType =
  | '异常触发'
  | '方案计算'
  | '玩家确认'
  | '资源锁定'
  | '资源失效'
  | '资源回滚'
  | '执行成功'
  | '退款'
  | '补偿'
  | '排班变更'
  | '候补'
  | '手工调整'

export interface SessionEvent {
  id: string
  at: string
  type: SessionEventType
  actor: string
  title: string
  detail: string
  sessionId?: string
  caseId?: string
  storeId?: string
  tone: 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'gold'
}

export interface CaseNotification {
  id: string
  at: string
  audience: 'player' | 'manager' | 'all'
  playerId?: string
  caseId?: string
  sessionId?: string
  title: string
  body: string
  read: boolean
  /** 幂等键：重复确认 / 延迟重发不会产生重复通知 */
  dedupKey: string
}
