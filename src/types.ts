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
export type LedgerKind = '报名费收入' | '押金收入' | '押金退还' | '退款支出' | '换本差价' | '争议补偿'
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
  capacity: number
  horrorSet: boolean // 是否恐怖实景房
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
