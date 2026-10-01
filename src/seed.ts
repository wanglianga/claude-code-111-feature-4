import type {
  Script, Host, Room, Member, Booking, Session, Ticket, LedgerEntry, Store,
  ScriptStock, WaitlistEntry, Disruption, IncidentEvent,
} from './types'
import { computeWaitScore } from './domain'

// ===== 门店 =====
export const seedStores: Store[] = [
  { id: 'st1', name: '入局·城西旗舰店', district: '城西万象城 B1', phone: '0571-88001001' },
  { id: 'st2', name: '入局·滨江星光店', district: '滨江星光大道 3F', phone: '0571-88001002' },
]

export const seedScripts: Script[] = [
  {
    id: 's1',
    name: '雾港惊魂夜',
    genre: '恐怖沉浸',
    minPlayers: 5,
    maxPlayers: 7,
    durationMin: 240,
    horror: '重恐',
    difficulty: '进阶',
    genderAdvice: '需男女搭配',
    beginnerFriendly: false,
    startTime: '15:30 / 19:00 / 21:30',
    price: 168,
    deposit: 100,
    refundRule: '开场前 24h 可全额退款；24h 内退款扣 30% 占位费；开场后不支持退款，可改签一次。门店原因导致的改期/取消不受此限，全额退款或权益保留。',
    safetyNote:
      '【恐怖本安全提示】含 NPC 追逐、突然声光惊吓与密闭空间环节；孕妇、心脏病/高血压/哮喘患者及 16 岁以下不建议参与；店内设安全词「开灯」，说出即暂停并亮灯；惊吓环节请勿推搡 NPC。',
    desc: '浓雾封锁的港口旅店，住客接连失踪。真人 NPC 实景追逐，重恐沉浸。',
    active: true,
  },
  {
    id: 's2',
    name: '长安十二时辰局',
    genre: '硬核推理',
    minPlayers: 6,
    maxPlayers: 8,
    durationMin: 300,
    horror: '不恐怖',
    difficulty: '烧脑',
    genderAdvice: '不限',
    beginnerFriendly: false,
    startTime: '13:00 / 18:30',
    price: 158,
    deposit: 80,
    refundRule: '开场前 12h 可全额退款；12h 内扣 20%；拼场未成局自动全额退款。',
    desc: '盛唐长安城十二个时辰内连环命案，强逻辑、长案卷，推理位高光本。',
    active: true,
  },
  {
    id: 's3',
    name: '那年夏天的情书',
    genre: '情感沉浸',
    minPlayers: 4,
    maxPlayers: 6,
    durationMin: 210,
    horror: '不恐怖',
    difficulty: '入门',
    genderAdvice: '需男女搭配',
    beginnerFriendly: true,
    startTime: '14:00 / 19:30',
    price: 128,
    deposit: 50,
    refundRule: '开场前 6h 可全额退款；逾期可免费改签一次；生日局赠送合影与甜品。',
    desc: '校园题材情感本，文笔细腻、重沉浸轻推理，适合新手与生日局。',
    active: true,
  },
  {
    id: 's4',
    name: '欢乐麻将馆',
    genre: '欢乐机制',
    minPlayers: 5,
    maxPlayers: 9,
    durationMin: 180,
    horror: '不恐怖',
    difficulty: '新手友好',
    genderAdvice: '不限',
    beginnerFriendly: true,
    startTime: '13:30 / 16:30 / 20:00',
    price: 98,
    deposit: 30,
    refundRule: '开场前 3h 可全额退款；包场需预付 50% 定金，提前 24h 取消可退。',
    desc: '全程爆笑机制本，人数弹性大，拼场破冰、公司团建包场首选。',
    active: true,
  },
  {
    id: 's5',
    name: '红嫁衣',
    genre: '中式恐怖',
    minPlayers: 4,
    maxPlayers: 6,
    durationMin: 240,
    horror: '中恐',
    difficulty: '进阶',
    genderAdvice: '建议女',
    beginnerFriendly: false,
    startTime: '19:00 / 21:30',
    price: 148,
    deposit: 100,
    refundRule: '开场前 24h 全额退款；24h 内扣 30%；受惊吓无法继续可申请改签，由店长审批。',
    safetyNote:
      '【恐怖本安全提示】含婚俗灵异元素、贴脸杀与单线任务；单人任务可申请陪同；安全词「开灯」；身体不适请立即示意主持。',
    desc: '冥婚题材中式恐怖，单人搜证环节氛围拉满，建议有恐怖本经验。',
    active: true,
  },
]

export const seedHosts: Host[] = [
  {
    id: 'h1',
    name: '阿哲',
    storeId: 'st1',
    level: '金牌主持',
    proficiency: { s1: 5, s2: 4, s3: 3, s4: 4, s5: 5 },
    // 2026-10-01 19:00 场次开场前突发高烧缺勤（异常触发时写入，演示排班变更留痕）
    unavailable: ['2026-10-01T19:00'],
    reviewScore: 4.9,
    reviewCount: 126,
  },
  {
    id: 'h2',
    name: '小鹿',
    storeId: 'st1',
    level: '资深主持',
    proficiency: { s1: 3, s2: 4, s3: 5, s4: 5, s5: 2 },
    unavailable: [],
    reviewScore: 4.7,
    reviewCount: 88,
  },
  {
    id: 'h3',
    name: 'KK',
    storeId: 'st1',
    level: '初级主持',
    proficiency: { s1: 1, s2: 2, s3: 4, s4: 4, s5: 1 },
    unavailable: [],
    reviewScore: 4.3,
    reviewCount: 21,
  },
  {
    id: 'h4',
    name: '阿K',
    storeId: 'st2',
    level: '初级主持',
    proficiency: { s1: 1, s2: 2, s3: 3, s4: 4, s5: 1 },
    unavailable: [],
    reviewScore: 4.2,
    reviewCount: 12,
  },
  {
    id: 'h5',
    name: '老周',
    storeId: 'st2',
    level: '金牌主持',
    proficiency: { s1: 4, s2: 5, s3: 3, s4: 4, s5: 4 },
    unavailable: [],
    reviewScore: 4.8,
    reviewCount: 97,
  },
]

export const seedRooms: Room[] = [
  { id: 'r1', name: '雾港实景房', storeId: 'st1', capacity: 8, horrorSet: true, downSlots: [] },
  { id: 'r2', name: '唐风大厅', storeId: 'st1', capacity: 10, horrorSet: false, downSlots: [] },
  { id: 'r3', name: '校园教室', storeId: 'st1', capacity: 6, horrorSet: false, downSlots: [] },
  { id: 'r4', name: '囍字婚房', storeId: 'st1', capacity: 6, horrorSet: true, downSlots: [] },
  { id: 'r5', name: '欢乐多功能厅', storeId: 'st1', capacity: 12, horrorSet: false, downSlots: [] },
  { id: 'r6', name: '小推理室', storeId: 'st2', capacity: 6, horrorSet: false, downSlots: [] },
  { id: 'r7', name: '深水港实景房', storeId: 'st2', capacity: 8, horrorSet: true, downSlots: [] },
  { id: 'r8', name: '星光多功能厅', storeId: 'st2', capacity: 12, horrorSet: false, downSlots: [] },
]

export const seedMembers: Member[] = [
  { id: 'm1', name: '林小夏', phone: '13800000001', level: '金卡', visits: 14 },
  { id: 'm2', name: '陈默', phone: '13800000002', level: '银卡', visits: 7 },
  { id: 'm3', name: '王胖子', phone: '13800000003', level: '普通', visits: 2 },
  { id: 'm4', name: '顾晓萌', phone: '13800000004', level: '银卡', visits: 5 },
  { id: 'm5', name: '李大壮', phone: '13800000005', level: '普通', visits: 1 },
]

/** 盒装本库存（可同时开的副本数，按门店） */
export const seedStocks: ScriptStock[] = [
  { storeId: 'st1', scriptId: 's1', copies: 2 },
  { storeId: 'st1', scriptId: 's2', copies: 1 },
  { storeId: 'st1', scriptId: 's3', copies: 2 },
  { storeId: 'st1', scriptId: 's4', copies: 2 },
  { storeId: 'st1', scriptId: 's5', copies: 1 },
  { storeId: 'st2', scriptId: 's1', copies: 1 },
  { storeId: 'st2', scriptId: 's2', copies: 1 },
  { storeId: 'st2', scriptId: 's3', copies: 1 },
  { storeId: 'st2', scriptId: 's4', copies: 2 },
  { storeId: 'st2', scriptId: 's5', copies: 1 },
]

// 角色名模板（简化：按剧本给一份角色表）
export const scriptRoles: Record<string, { name: string; gender: string; hint: string }[]> = {
  s1: [
    { name: '旅店老板', gender: '男', hint: '信息位' },
    { name: '神秘住客', gender: '女', hint: 'C 位' },
    { name: '渔船船长', gender: '男', hint: '推理位' },
    { name: '驻唱歌手', gender: '女', hint: '氛围位' },
    { name: '背包客', gender: '不限', hint: '欢乐位' },
    { name: '警长', gender: '男', hint: '推进位' },
    { name: '哑仆', gender: '不限', hint: '隐藏位' },
  ],
  s2: [
    { name: '大理寺卿', gender: '男', hint: '主持位' },
    { name: '女刺客', gender: '女', hint: 'C 位' },
    { name: '胡商', gender: '男', hint: '信息位' },
    { name: '道姑', gender: '女', hint: '推理位' },
    { name: '书生', gender: '男', hint: '气氛位' },
    { name: '店小二', gender: '不限', hint: '机制位' },
    { name: '捕头', gender: '男', hint: '推进位' },
    { name: '贵妇', gender: '女', hint: '情感位' },
  ],
  s3: [
    { name: '班长', gender: '男', hint: '男主' },
    { name: '转学生', gender: '女', hint: '女主' },
    { name: '体育委员', gender: '男', hint: '守护位' },
    { name: '文艺委员', gender: '女', hint: '情感位' },
    { name: '复读生', gender: '不限', hint: '反转位' },
    { name: '班主任', gender: '不限', hint: 'NPC 视角' },
  ],
  s4: [
    { name: '馆长老王', gender: '不限', hint: 'DM 位' },
    { name: '老千', gender: '不限', hint: '机制位' },
    { name: '福星', gender: '不限', hint: '欢乐位' },
    { name: '杠精', gender: '不限', hint: '搞笑位' },
    { name: '小白', gender: '不限', hint: '新手位' },
    { name: '富婆', gender: '不限', hint: '资金位' },
    { name: '保安', gender: '不限', hint: '搅局位' },
    { name: '服务生', gender: '不限', hint: '游走位' },
    { name: '神秘来客', gender: '不限', hint: '彩蛋位' },
  ],
  s5: [
    { name: '新娘', gender: '女', hint: '主角/C 位' },
    { name: '新郎', gender: '男', hint: '核心位' },
    { name: '媒婆', gender: '女', hint: '氛围位' },
    { name: '道士', gender: '男', hint: '推理位' },
    { name: '丫鬟', gender: '女', hint: '单线位' },
    { name: '老爷', gender: '男', hint: '信息位' },
  ],
}

export const seedProps: { id: string; name: string; scriptId?: string }[] = [
  { id: 'p1', name: '煤油灯', scriptId: 's1' },
  { id: 'p2', name: '船票道具', scriptId: 's1' },
  { id: 'p3', name: '案卷竹简', scriptId: 's2' },
  { id: 'p4', name: '情书信封', scriptId: 's3' },
  { id: 'p5', name: '麻将牌组', scriptId: 's4' },
  { id: 'p6', name: '红盖头', scriptId: 's5' },
  { id: 'p7', name: '纸质纸钱', scriptId: 's5' },
]

// ===== 历史演示场次（09-23 生日局，走完签到→结账流程用） =====
export const seedBookings: Booking[] = [
  {
    id: 'b-demo-1',
    scriptId: 's3',
    mode: '生日局',
    playersCount: 4,
    contactName: '林小夏',
    contactPhone: '13800000001',
    memberId: 'm1',
    note: '生日局，希望安排情感本主持，已告知同伴会哭。',
    expectedStart: '2026-09-23T19:30',
    status: '已成局',
    createdAt: '2026-09-21T10:12:00',
    sessionId: 'ss-demo-1',
    payMethod: '在线预付',
    players: [
      { id: 'pl-d1', name: '林小夏', phone: '13800000001', memberId: 'm1', gender: '女', rolePreference: 'C位', acceptCrossGender: false, isBirthday: true, paid: true, paidAmount: 128, checkedIn: true, checkInAt: '2026-09-23T19:05:00', assignedRole: '转学生', acceptableSlots: [], waitlistMode: '自动补位' },
      { id: 'pl-d2', name: '赵宇', phone: '13800000004', gender: '男', rolePreference: '随意', acceptCrossGender: true, paid: true, paidAmount: 128, checkedIn: true, checkInAt: '2026-09-23T19:08:00', assignedRole: '班长', acceptableSlots: [], waitlistMode: '自动补位' },
      { id: 'pl-d3', name: '钱朵朵', phone: '13800000005', gender: '女', rolePreference: '情感位', acceptCrossGender: false, paid: true, paidAmount: 128, checkedIn: true, checkInAt: '2026-09-23T19:10:00', assignedRole: '文艺委员', acceptableSlots: [], waitlistMode: '自动补位' },
      { id: 'pl-d4', name: '孙然', phone: '13800000006', gender: '男', rolePreference: '推理位', acceptCrossGender: true, paid: false, paidAmount: 0, checkedIn: false, acceptableSlots: [], waitlistMode: '自动补位' },
    ],
  },
  // ===== 10-01 19:00《雾港惊魂夜》6 人满员场（主持缺勤异常处置演示） =====
  {
    id: 'b-demo-2',
    scriptId: 's1',
    mode: '拼场',
    playersCount: 4,
    contactName: '林小夏',
    contactPhone: '13800000001',
    memberId: 'm1',
    note: '4 人同行（林小夏组），不要拆散拼车。',
    expectedStart: '2026-10-01T19:00',
    status: '已成局',
    createdAt: '2026-09-28T21:10:00',
    sessionId: 'ss-demo-2',
    payMethod: '在线预付',
    players: [
      { id: 'pl-e1', name: '林小夏', phone: '13800000001', memberId: 'm1', gender: '女', rolePreference: 'C位', acceptCrossGender: false, paid: true, paidAmount: 151, checkedIn: false, acceptableSlots: ['2026-10-01T19:30', '2026-10-01T21:30'], waitlistMode: '自动补位' },
      { id: 'pl-e2', name: '周岩', phone: '13800000007', gender: '男', rolePreference: '推理位', acceptCrossGender: true, paid: true, paidAmount: 168, checkedIn: false, acceptableSlots: ['2026-10-01T21:30'], waitlistMode: '自动补位' },
      { id: 'pl-e3', name: '吴悠', phone: '13800000008', gender: '女', rolePreference: '氛围位', acceptCrossGender: false, paid: true, paidAmount: 168, checkedIn: false, acceptableSlots: ['2026-10-01T19:30', '2026-10-01T21:30'], waitlistMode: '自动补位' },
      { id: 'pl-e4', name: '郑凯', phone: '13800000009', gender: '男', rolePreference: '随意', acceptCrossGender: true, paid: true, paidAmount: 168, checkedIn: false, acceptableSlots: [], waitlistMode: '自动补位' },
    ],
  },
  {
    id: 'b-demo-3',
    scriptId: 's1',
    mode: '拼场',
    playersCount: 2,
    contactName: '陈默',
    contactPhone: '13800000002',
    memberId: 'm2',
    note: '2 人同行（陈默组）。',
    expectedStart: '2026-10-01T19:00',
    status: '已成局',
    createdAt: '2026-09-29T09:31:00',
    sessionId: 'ss-demo-2',
    payMethod: '在线预付',
    players: [
      { id: 'pl-e5', name: '陈默', phone: '13800000002', memberId: 'm2', gender: '男', rolePreference: '信息位', acceptCrossGender: true, paid: true, paidAmount: 160, checkedIn: false, acceptableSlots: ['2026-10-01T19:30', '2026-10-01T21:30'], waitlistMode: '自动补位' },
      { id: 'pl-e6', name: '苏晴', phone: '13800000010', gender: '女', rolePreference: '随意', acceptCrossGender: true, paid: true, paidAmount: 168, checkedIn: false, acceptableSlots: ['2026-10-01T21:30', '2026-10-02T19:00'], waitlistMode: '仅指定时段' },
    ],
  },
]

export const seedSessions: Session[] = [
  {
    id: 'ss-demo-1',
    storeId: 'st1',
    scriptId: 's3',
    date: '2026-09-23',
    startKey: '19:30',
    startAt: '2026-09-23T19:30',
    mode: '生日局',
    roomId: 'r3',
    hostId: 'h2',
    status: '角色已分',
    bookingIds: ['b-demo-1'],
    propIssues: [],
    depositCharged: 0,
    createdAt: '2026-09-22T15:00:00',
    createdBy: '前台-小周',
  },
  // 10-01 19:00 异常场次：6 人满员、已预付；主持阿哲缺勤 → 待补位冻结
  {
    id: 'ss-demo-2',
    storeId: 'st1',
    scriptId: 's1',
    date: '2026-10-01',
    startKey: '19:00',
    startAt: '2026-10-01T19:00',
    mode: '拼场',
    roomId: 'r1',
    hostId: undefined, // 缺勤主持已被释放，等待方案
    status: '待补位',
    bookingIds: ['b-demo-2', 'b-demo-3'],
    propIssues: [],
    depositCharged: 0,
    createdAt: '2026-09-28T21:12:00',
    createdBy: '前台-小周',
    disruptionId: 'd-demo-1',
  },
  // 同日 21:30 空场（0 人），是候补递补与「同日换场」的目标
  {
    id: 'ss-demo-3',
    storeId: 'st1',
    scriptId: 's1',
    date: '2026-10-01',
    startKey: '21:30',
    startAt: '2026-10-01T21:30',
    mode: '拼场',
    roomId: 'r1',
    hostId: 'h2',
    status: '待成局',
    bookingIds: [],
    propIssues: [],
    depositCharged: 0,
    createdAt: '2026-09-29T10:00:00',
    createdBy: '排班系统',
  },
]

export const seedTickets: Ticket[] = [
  {
    id: 't-demo-1',
    sessionId: 'ss-demo-1',
    bookingId: 'b-demo-1',
    type: '玩家迟到',
    title: '玩家「孙然」开场前未签到',
    detail: '已电话联系，称堵车预计迟到 20 分钟。其余 3 人已签到，是否准时开场？',
    status: '处理中',
    raisedBy: 'frontdesk',
    raisedAt: '2026-09-23T19:12:00',
    handler: '前台-小周',
    timeline: [
      { at: '2026-09-23T19:12:00', actor: '前台-小周', action: '登记迟到：孙然 ETA 19:30，电话已确认' },
      { at: '2026-09-23T19:15:00', actor: '主持-小鹿', action: '建议先发放道具、做开场前破冰，预留 15 分钟' },
    ],
  },
  {
    id: 't-demo-2',
    sessionId: 'ss-demo-2',
    type: '主持请假',
    title: '主持「阿哲」19:00 场开场前突发高烧缺勤',
    detail: '17:40 接到电话，高烧无法到场；备班主持需要跨店协调。已发起异常处置单 d-demo-1，原场次名额冻结为「待补位」，不会直接取消。',
    status: '处理中',
    raisedBy: '前台-小周',
    raisedAt: '2026-10-01T17:45:00',
    handler: '店长-老K',
    timeline: [
      { at: '2026-10-01T17:40:00', actor: '主持-阿哲', action: '电话请假：高烧 39 度，今晚无法到场' },
      { at: '2026-10-01T17:45:00', actor: '前台-小周', action: '发起异常处置：原场次进入待补位，主持班次释放' },
    ],
  },
]

// ===== 候补队列（s1 / st1 / 2026-10-01） =====
function wl(
  id: string, name: string, phone: string, memberId: string | undefined,
  mode: WaitlistEntry['mode'], groupSize: number, createdAt: string,
  slots: string[], status: WaitlistEntry['status'], extra: Partial<WaitlistEntry> = {},
): WaitlistEntry {
  const member = seedMembers.find((m) => m.id === memberId)
  const ageMinutes = Math.max(0, Math.round((new Date('2026-10-01T18:50:00').getTime() - new Date(createdAt).getTime()) / 60000))
  const { score, parts } = computeWaitScore({ member, mode, ageMinutes, groupSize })
  return {
    id,
    storeId: 'st1',
    scriptId: 's1',
    date: '2026-10-01',
    playerId: `pl-${id}`,
    playerName: name,
    phone,
    memberId,
    score,
    scoreParts: parts,
    groupKey: `g-${id}`,
    groupSize,
    mode,
    acceptableSlots: slots,
    status,
    createdAt,
    ...extra,
  }
}

export const seedWaitlist: WaitlistEntry[] = [
  // 17:05 排队，银卡 2 人同行、自动补位
  wl('w-d1', '顾晓萌', '13800000011', 'm4', '自动补位', 2, '2026-10-01T17:05:00', [], '排队中'),
  // 17:36 排队，普通会员、仅接受 21:30
  wl('w-d2', '李大壮', '13800000012', 'm5', '仅指定时段', 1, '2026-10-01T17:36:00', ['2026-10-01T21:30'], '排队中'),
  // 18:20 已收到 21:30 补位通知，倒计时至 21:00（演示「已通知未响应」与超时）
  wl('w-d3', '韩梅', '13800000013', undefined, '自动补位', 1, '2026-10-01T18:20:00', [], '已通知', {
    offeredSessionId: 'ss-demo-3',
    notifiedAt: '2026-10-01T20:45:00',
    respondDeadline: '2026-10-01T21:00:00',
    note: '21:30 场放出名额，按候补顺序通知。',
  }),
  // 18:25 排队，非会员，自动补位
  wl('w-d4', '苏柠', '13800000014', undefined, '自动补位', 1, '2026-10-01T18:25:00', [], '排队中'),
]

// ===== 异常处置单 =====
export const seedDisruptions: Disruption[] = [
  {
    id: 'd-demo-1',
    sessionId: 'ss-demo-2',
    type: '主持缺勤',
    reason: '主持阿哲 17:40 来电高烧 39 度无法到场，电话联系备班暂无人可接 19:00',
    detail: '6 名玩家均已在线预付，其中林小夏/陈默两组同行不可拆散；苏晴为「仅指定时段」候补策略玩家。需在同日换场 / 跨店迁移 / 全额退款 / 保留权益间给出可解释方案。',
    raisedBy: '前台-小周',
    raisedAt: '2026-10-01T17:45:00',
    status: '异常已触发',
    plans: [],
    rejectPolicy: '全额退款',
    lockIds: [],
    manualAlerts: [
      '候补队列中李大壮选择「仅接受 21:30」，递补时不能自动派到其他时段',
      '韩梅的 21:30 补位通知 21:00 截止，超时后名额顺延给下一位',
      '若 21:00 前主持人选仍无法确认，建议直接执行全额退款，避免玩家到店空跑',
    ],
  },
]

export const seedEvents: IncidentEvent[] = [
  {
    id: 'ev-d1',
    at: '2026-10-01T17:45:00',
    scope: 'd-demo-1',
    sessionId: 'ss-demo-2',
    actor: '前台-小周',
    category: '异常触发',
    level: 'error',
    action: '主持缺勤：阿哲高烧请假，19:00《雾港惊魂夜》主持班次释放，场次转为「待补位」，名额与候补状态冻结保留，不直接取消',
  },
]

export const seedLedger: LedgerEntry[] = [
  { id: 'l-d1', at: '2026-09-21T10:12:30', kind: '报名费收入', amount: 128, playerId: 'pl-d1', sessionId: 'ss-demo-1', memo: '林小夏 生日局报名费（金卡 9 折后）', operator: '系统' },
  { id: 'l-d2', at: '2026-09-21T10:20:00', kind: '报名费收入', amount: 128, playerId: 'pl-d2', sessionId: 'ss-demo-1', memo: '赵宇 报名费', operator: '系统' },
  { id: 'l-d3', at: '2026-09-21T11:02:00', kind: '报名费收入', amount: 128, playerId: 'pl-d3', sessionId: 'ss-demo-1', memo: '钱朵朵 报名费', operator: '系统' },
  // ss-demo-2 六笔预付
  { id: 'l-e1', at: '2026-09-28T21:10:10', kind: '报名费收入', amount: 151, playerId: 'pl-e1', sessionId: 'ss-demo-2', memo: '林小夏 10-01 19:00《雾港惊魂夜》报名费（金卡 9 折）', operator: '系统' },
  { id: 'l-e2', at: '2026-09-28T21:10:11', kind: '报名费收入', amount: 168, playerId: 'pl-e2', sessionId: 'ss-demo-2', memo: '周岩 报名费', operator: '系统' },
  { id: 'l-e3', at: '2026-09-28T21:10:12', kind: '报名费收入', amount: 168, playerId: 'pl-e3', sessionId: 'ss-demo-2', memo: '吴悠 报名费', operator: '系统' },
  { id: 'l-e4', at: '2026-09-28T21:10:13', kind: '报名费收入', amount: 168, playerId: 'pl-e4', sessionId: 'ss-demo-2', memo: '郑凯 报名费', operator: '系统' },
  { id: 'l-e5', at: '2026-09-29T09:31:20', kind: '报名费收入', amount: 160, playerId: 'pl-e5', sessionId: 'ss-demo-2', memo: '陈默 报名费（银卡 95 折）', operator: '系统' },
  { id: 'l-e6', at: '2026-09-29T09:31:21', kind: '报名费收入', amount: 168, playerId: 'pl-e6', sessionId: 'ss-demo-2', memo: '苏晴 报名费', operator: '系统' },
]
