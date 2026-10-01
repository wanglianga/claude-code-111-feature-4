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
  | '已取消'
/** 场次状态（状态机） */
export type SessionStatus =
  | '待成局' // 已生成但人数不足/排班未确认
  | '已成局' // 人数达标、房间主持确认
  | '已签到' // 前台完成签到
  | '角色已分' // 角色分配完成
  | '道具已发' // 道具发放、押金收取
  | '进行中' // 主持开场
  | '休息中' // 中途休息
  | '已结账' // 体验结束完成结账
  | '已复盘' // 收集完评价/损耗/复盘
  | '已解散' // 人数不足等原因解散（触发退款）
  | '待补位' // 开场前异常处置中：名额暂挂，可售/候补状态冻结保留
  | '已改期' // 已迁移到其他场次（本体保留为事件凭证）
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
export type LedgerKind = '报名费收入' | '押金收入' | '押金退还' | '退款支出' | '换本差价' | '争议补偿' | '权益保留' | '权益核销' | '跨店结算'
/** 道具状态 */
export type PropStatus = '正常' | '轻微损耗' | '严重损耗' | '丢失'
/** 角色身份 */
export type Role = 'player' | 'frontdesk' | 'host' | 'manager' | 'service'

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
  storeId: string
  level: '初级主持' | '资深主持' | '金牌主持'
  /** 剧本熟练度 scriptId -> 0~5 */
  proficiency: Record<string, number>
  /** 档期：'2026-09-23T13:00' 这样的开场键 -> true 表示请假/不可用 */
  unavailable: string[]
  reviewScore: number // 复盘累计均分
  reviewCount: number
}

/** 房间 */
export interface Room {
  id: string
  name: string
  storeId: string
  capacity: number
  horrorSet: boolean // 是否恐怖实景房
  /** 不可用时段（设备故障/被征用），开场键数组，跨店迁移时必须避开 */
  downSlots: string[]
}

/** 门店 */
export interface Store {
  id: string
  name: string
  district: string
  phone: string
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
  gender: '男' | '女' | '不便透露'
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
  /** 可接受开场时间键（异常改期时采集/使用，空表示听从安排） */
  acceptableSlots: string[]
  /** 候补补位策略：同意自动补位 / 仅接受指定时段 */
  waitlistMode: '自动补位' | '仅指定时段'
}

/** 预约单（玩家侧） */
export interface Booking {
  id: string
  scriptId: string
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
  /** 改期方案执行时的幂等键：同一方案同一玩家不会重复退款 */
  planId?: string
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
  status: SessionStatus
  bookingIds: string[]
  propIssues: PropIssue[]
  depositCharged: number // 已扣押金（道具损耗）
  hostInterruptNote?: string // 主持中断记录（客服串联用）
  createdAt: string
  createdBy: string
  reviewDone?: boolean
  /** 当前关联的异常处置单（处置中场次名额冻结，保留可售/候补状态） */
  disruptionId?: string
  /** 改期迁移完成后的去向 */
  migratedTo?: { planId: string; newSessionId: string }
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

// ============ 开场前异常处置（改期 / 候补 / 资源锁定） ============

/** 剧本库存（盒装本，按门店）；库存为 0 的门店不能作为迁移目标 */
export interface ScriptStock {
  storeId: string
  scriptId: string
  copies: number // 可同时开的盒装本数量
}

/** 异常类型 */
export type DisruptionType = '主持缺勤' | '场次延迟' | '房间不可用'

/** 异常处置单状态 */
export type DisruptionStatus =
  | '异常已触发' // 资源受影响，等待店长发方案
  | '方案计算中'
  | '待玩家确认' // 方案已发布，倒计时中
  | '部分已确认'
  | '待执行迁移' // 确认达标，等待一次性锁定
  | '已改期'
  | '已退款关闭' // 全员全额退款关闭
  | '已取消处置' // 资源恢复，撤回处置

/** 候补条目 */
export interface WaitlistEntry {
  id: string
  storeId: string
  scriptId: string
  date: string // 想补的日期
  playerId: string
  playerName: string
  phone: string
  memberId?: string
  /** 公开优先级分（分值越高越靠前，构成规则在页面公开） */
  score: number
  scoreParts: { label: string; value: number }[]
  groupKey: string // 同行/拼车组：同组一起进一起出
  groupSize: number
  mode: Player['waitlistMode'] // 自动补位 / 仅指定时段
  acceptableSlots: string[] // 仅指定时段时使用
  status: '排队中' | '已通知' | '已补位' | '超时未响应' | '已放弃'
  /** 已通知倒计时截止时间 */
  notifiedAt?: string
  respondDeadline?: string
  offeredSessionId?: string
  createdAt: string
  note?: string
  /** 店长手工置顶（必须填写原因），排序时优先于分数 */
  manualPin?: { at: string; by: string; reason: string }
}

/** 玩家对方案的确认状态 */
export type PlanResponse = '待确认' | '已接受' | '仅指定时段' | '已拒绝' | '超时未响应'

/** 方案类型 */
export type PlanKind = '同日换场' | '跨店迁移' | '全额退款' | '保留权益待补位'

/** 候选安排（方案计算的最小单元：去哪个场次） */
export interface PlanTarget {
  kind: PlanKind
  /** 同日换场/跨店迁移 指向目标场次；退款/保留权益时为空 */
  sessionId?: string
  storeId?: string
  roomId?: string
  hostId?: string
  startAt: string
  /** 可解释：命中/冲突说明 */
  reasons: string[]
  conflicts: string[]
  /** 该安排的角色预分配（playerId -> 角色名），用于角色人数/性别约束解释 */
  roleAssign: Record<string, string>
  /** 接受该安排的玩家（组）。未列入的玩家走拒绝分支（退款或保留权益） */
  acceptedPlayerIds: string[]
  rejectedPlayerIds: string[]
  /** 权益变化摘要 */
  entitlementDelta: string[]
}

/** 改期方案（一次计算可给多个候选；发布其中一个供玩家确认） */
export interface ReschedulePlan {
  id: string
  disruptionId: string
  kind: PlanKind
  sessionId?: string
  storeId?: string
  roomId?: string
  hostId?: string
  startAt: string
  status: '候选' | '已发布' | '已确认执行' | '已执行' | '执行失败已回滚' | '已作废'
  createdAt: string
  publishedAt?: string
  confirmDeadline?: string
  executedAt?: string
  reasons: string[]
  conflicts: string[]
  roleAssign: Record<string, string>
  responses: Record<string, PlanResponse> // playerId -> 状态
  /** 执行/回滚留痕 */
  executionNote?: string
  /** 拒绝/超时玩家的处理方式 */
  rejectPolicy: '全额退款' | '保留权益待补位'
}

/** 资源锁（确认迁移时对四类资源一次性锁定） */
export interface ResourceLock {
  id: string
  disruptionId: string
  planId: string
  kind: '原场次名额' | '目标房间' | '主持人班次' | '剧本库存'
  refId: string // roomId / hostId / sessionId / `${storeId}:${scriptId}`
  storeId: string
  startAt: string
  status: '已锁定' | '锁定失败' | '已提交' | '已回滚'
  detail: string
  lockedAt: string
}

/** 权益变动日志（保留/核销，防重复退款与权益丢失） */
export interface EntitlementLog {
  id: string
  at: string
  playerId: string
  playerName: string
  kind: '保留' | '核销' | '退回'
  amount: number
  sessionId?: string
  planId?: string
  memo: string
  operator: string
}

/** 场次事件时间线条目（异常触发→方案→确认→锁定→退款补偿→排班变更 统一流水） */
export interface IncidentEvent {
  id: string
  at: string
  scope: string // disruptionId 或 sessionId
  sessionId?: string
  actor: string
  category: '异常触发' | '方案计算' | '玩家确认' | '资源锁定' | '退款补偿' | '排班变更' | '候补递补' | '系统'
  action: string
  level?: 'info' | 'warn' | 'ok' | 'error'
}

/** 异常处置单 */
export interface Disruption {
  id: string
  sessionId: string
  type: DisruptionType
  detail: string
  reason: string // 发起必填原因
  raisedBy: string
  raisedAt: string
  status: DisruptionStatus
  /** 候选方案 */
  plans: ReschedulePlan[]
  publishedPlanId?: string
  /** 拒绝/超时玩家的默认处理 */
  rejectPolicy: '全额退款' | '保留权益待补位'
  /** 关联锁 */
  lockIds: string[]
  resolvedAt?: string
  resolution?: string
  /** 需人工介入事项 */
  manualAlerts: string[]
}
