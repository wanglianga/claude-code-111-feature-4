import type {
  Script, Host, Room, Member, Booking, Session, Ticket, LedgerEntry,
  StoreInfo, ScriptCopy, WaitlistEntry, DisruptionCase, SessionEvent, Player,
} from './types'

/** 演示主日期：所有“开场前”场景发生在该日（相对今日 2026-10-01 为次日） */
export const DEMO_DATE = '2026-10-02'

// ============ 门店 ============
export const seedStores: StoreInfo[] = [
  { id: 'st1', name: '入局·人民广场旗舰店', shortName: '人广旗舰店', district: '黄浦区', address: '上海市黄浦区南京东路 88 号 6F' },
  { id: 'st2', name: '入局·静安寺分店', shortName: '静安分店', district: '静安区', address: '上海市静安区愚园路 28 号 3F' },
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
    refundRule: '开场前 24h 可全额退款；24h 内退款扣 30% 占位费；开场后不支持退款，可改签一次。门店原因导致改期/取消的，全额退款且不扣占位费。',
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
    refundRule: '开场前 12h 可全额退款；12h 内扣 20%；拼场未成局自动全额退款。门店原因改期可免费改签。',
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
    id: 'h1', name: '阿哲', storeId: 'st1', crossStore: false, level: '金牌主持',
    proficiency: { s1: 5, s2: 4, s3: 3, s4: 4, s5: 5 },
    // 演示：阿哲开场当日突发高烧，全天场次均无法主持
    unavailable: [`${DEMO_DATE}T15:30`, `${DEMO_DATE}T19:00`, `${DEMO_DATE}T21:30`],
    reviewScore: 4.9, reviewCount: 126,
  },
  {
    id: 'h2', name: '小鹿', storeId: 'st1', crossStore: false, level: '资深主持',
    proficiency: { s1: 3, s2: 4, s3: 5, s4: 5, s5: 2 },
    unavailable: [], reviewScore: 4.7, reviewCount: 88,
  },
  {
    id: 'h3', name: 'KK', storeId: 'st1', crossStore: false, level: '初级主持',
    proficiency: { s1: 1, s2: 2, s3: 4, s4: 4, s5: 1 },
    unavailable: [], reviewScore: 4.3, reviewCount: 21,
  },
  {
    id: 'h4', name: '周岩', storeId: 'st2', crossStore: true, level: '资深主持',
    proficiency: { s1: 4, s2: 5, s3: 3, s4: 4, s5: 3 },
    unavailable: [], reviewScore: 4.8, reviewCount: 64,
  },
  {
    id: 'h5', name: 'Mia', storeId: 'st2', crossStore: false, level: '初级主持',
    proficiency: { s1: 2, s2: 3, s3: 4, s4: 5, s5: 2 },
    unavailable: [], reviewScore: 4.4, reviewCount: 18,
  },
]

export const seedRooms: Room[] = [
  // 人广旗舰店
  {
    id: 'r1', storeId: 'st1', name: '雾港实景房', capacity: 8, horrorSet: true,
    // 演示：开场前空调故障，19:00 场不可用
    outages: [{ startAt: `${DEMO_DATE}T18:00`, endAt: `${DEMO_DATE}T23:30`, reason: '中央空调故障，工程抢修中' }],
  },
  { id: 'r2', storeId: 'st1', name: '唐风大厅', capacity: 10, horrorSet: false, outages: [] },
  { id: 'r3', storeId: 'st1', name: '校园教室', capacity: 6, horrorSet: false, outages: [] },
  { id: 'r4', storeId: 'st1', name: '囍字婚房', capacity: 6, horrorSet: true, outages: [] },
  { id: 'r5', storeId: 'st1', name: '欢乐多功能厅', capacity: 12, horrorSet: false, outages: [] },
  // 静安分店
  { id: 'r6', storeId: 'st2', name: '雾港实景·B 馆', capacity: 7, horrorSet: true, outages: [] },
  { id: 'r7', storeId: 'st2', name: '推理大厅', capacity: 9, horrorSet: false, outages: [] },
  { id: 'r8', storeId: 'st2', name: '欢乐多功能厅 B', capacity: 10, horrorSet: false, outages: [] },
]

/** 剧本盒装库存（跨店迁移 / 同日换场必须锁定对应门店的盒装） */
export const seedCopies: ScriptCopy[] = [
  { id: 's1-c1', scriptId: 's1', storeId: 'st1', code: 'WG-01', status: '在库可排' },
  { id: 's1-c2', scriptId: 's1', storeId: 'st2', code: 'WG-02', status: '在库可排' },
  { id: 's2-c1', scriptId: 's2', storeId: 'st1', code: 'CA-01', status: '在库可排' },
  { id: 's2-c2', scriptId: 's2', storeId: 'st2', code: 'CA-02', status: '在库可排' },
  { id: 's3-c1', scriptId: 's3', storeId: 'st1', code: 'QS-01', status: '在库可排' },
  { id: 's4-c1', scriptId: 's4', storeId: 'st1', code: 'MJ-01', status: '在库可排' },
  { id: 's4-c2', scriptId: 's4', storeId: 'st2', code: 'MJ-02', status: '在库可排' },
  { id: 's5-c1', scriptId: 's5', storeId: 'st1', code: 'HJ-01', status: '在库可排' },
  // 演示：静安分店《红嫁衣》盒装因道具损耗停用，跨店迁移该本会卡在库存
  { id: 's5-c2', scriptId: 's5', storeId: 'st2', code: 'HJ-02', status: '损耗停用', note: '婚服道具破损待补' },
]

export const seedMembers: Member[] = [
  { id: 'm1', name: '林小夏', phone: '13800000001', level: '金卡', visits: 14 },
  { id: 'm2', name: '陈默', phone: '13800000002', level: '银卡', visits: 7 },
  { id: 'm3', name: '王胖子', phone: '13800000003', level: '普通', visits: 2 },
  { id: 'm4', name: '苏晴', phone: '13800000004', level: '银卡', visits: 9 },
  { id: 'm5', name: '赵雨桐', phone: '13800000005', level: '普通', visits: 1 },
  { id: 'm6', name: '李大强', phone: '13800000006', level: '普通', visits: 3 },
  { id: 'm7', name: '周敏', phone: '13800000007', level: '金卡', visits: 20 },
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

// ============ 玩家/预约构造小工具 ============
type G = '男' | '女'
interface PSeed {
  id: string; name: string; phone?: string; memberId?: string; gender: G
  pref: string; cross: boolean; paid: boolean; birthday?: boolean
}

function mkPlayers(scriptId: string, price: number, xs: PSeed[]): Player[] {
  return xs.map((x) => ({
    id: x.id,
    name: x.name,
    phone: x.phone ?? '',
    memberId: x.memberId,
    rolePreference: x.pref,
    acceptCrossGender: x.cross,
    isBirthday: x.birthday,
    paid: x.paid,
    paidAmount: x.paid ? price : 0,
    checkedIn: false,
  }))
}

const priceOf = (scriptId: string, memberId?: string) => {
  const s = seedScripts.find((x) => x.id === scriptId)!
  const m = seedMembers.find((x) => x.id === memberId)
  const disc = m?.level === '金卡' ? 0.9 : m?.level === '银卡' ? 0.95 : 1
  return Math.round(s.price * disc)
}

// ============ 10-02 场次与预约 ============

// —— 重点场次：人广旗舰店《雾港惊魂夜》19:00，6 人已成局（两个同行组）——
const wgPrice = (m?: string) => priceOf('s1', m)
const bWgA: Booking = {
  id: 'b-wg-a', scriptId: 's1', storeId: 'st1', mode: '拼场', playersCount: 4,
  contactName: '林小夏', contactPhone: '13800000001', memberId: 'm1', groupId: 'g-wg-a',
  note: '4 人同行（同事局），林小夏要 C 位；两个女生不反串。',
  expectedStart: `${DEMO_DATE}T19:00`, status: '已成局', createdAt: '2026-09-28T11:20:00',
  sessionId: 'ss-wg-1900', payMethod: '在线预付', acknowledgedSafety: true,
  players: mkPlayers('s1', 168, [
    { id: 'pl-wg-1', name: '林小夏', phone: '13800000001', memberId: 'm1', gender: '女', pref: 'C位', cross: false, paid: true },
    { id: 'pl-wg-2', name: '赵宇', gender: '男', pref: '推理位', cross: true, paid: true },
    { id: 'pl-wg-3', name: '钱朵朵', gender: '女', pref: '氛围位', cross: false, paid: true },
    { id: 'pl-wg-4', name: '孙然', gender: '男', pref: '随意', cross: true, paid: true },
  ]).map((p) => ({ ...p, paidAmount: wgPrice(p.memberId) })),
}
const bWgB: Booking = {
  id: 'b-wg-b', scriptId: 's1', storeId: 'st1', mode: '拼场', playersCount: 2,
  contactName: '李大强', contactPhone: '13800000006', memberId: 'm6', groupId: 'g-wg-b',
  note: '拼车 2 人同行，要在一起，不接受拆分。',
  expectedStart: `${DEMO_DATE}T19:00`, status: '已成局', createdAt: '2026-09-29T09:40:00',
  sessionId: 'ss-wg-1900', payMethod: '在线预付', acknowledgedSafety: true,
  players: mkPlayers('s1', 168, [
    { id: 'pl-wg-5', name: '李大强', phone: '13800000006', memberId: 'm6', gender: '男', pref: 'C位', cross: true, paid: true },
    { id: 'pl-wg-6', name: '周敏', phone: '13800000007', memberId: 'm7', gender: '女', pref: '氛围位', cross: false, paid: true },
  ]).map((p) => ({ ...p, paidAmount: wgPrice(p.memberId) })),
}

const ssWg: Session = {
  id: 'ss-wg-1900', storeId: 'st1', scriptId: 's1', date: DEMO_DATE, startKey: '19:00',
  startAt: `${DEMO_DATE}T19:00`, mode: '拼场', roomId: 'r1', hostId: 'h1', copyId: 's1-c1',
  status: '已成局', bookingIds: ['b-wg-a', 'b-wg-b'], propIssues: [], depositCharged: 0,
  createdAt: '2026-09-29T10:02:00', createdBy: '排班系统',
}

// —— 跨店迁移目标：静安分店同剧本 19:00，仅 1 人成局中，余 6 席 ——
const bWgX: Booking = {
  id: 'b-wg-x', scriptId: 's1', storeId: 'st2', mode: '拼场', playersCount: 1,
  contactName: '陈默', contactPhone: '13800000002', memberId: 'm2',
  note: '一个人拼场，推理位。',
  expectedStart: `${DEMO_DATE}T19:00`, status: '已成局', createdAt: '2026-09-30T21:10:00',
  sessionId: 'ss-wg2-1900', payMethod: '在线预付', acknowledgedSafety: true,
  players: mkPlayers('s1', 168, [
    { id: 'pl-wg-x1', name: '陈默', phone: '13800000002', memberId: 'm2', gender: '男', pref: '推理位', cross: true, paid: true },
  ]).map((p) => ({ ...p, paidAmount: wgPrice(p.memberId) })),
}
const ssWg2: Session = {
  id: 'ss-wg2-1900', storeId: 'st2', scriptId: 's1', date: DEMO_DATE, startKey: '19:00',
  startAt: `${DEMO_DATE}T19:00`, mode: '拼场', roomId: 'r6', hostId: 'h4', copyId: 's1-c2',
  status: '已成局', bookingIds: ['b-wg-x'], propIssues: [], depositCharged: 0,
  createdAt: '2026-09-30T21:12:00', createdBy: '排班系统',
}

// —— 人广 21:30 雾港：留空（同日换场候选需新建场次）；制造一个占用 r4 的场次以演示房间冲突选项 ——
const ssHong: Session = {
  id: 'ss-hj-2130', storeId: 'st1', scriptId: 's5', date: DEMO_DATE, startKey: '21:30',
  startAt: `${DEMO_DATE}T21:30`, mode: '拼场', roomId: 'r4', hostId: 'h1', copyId: 's5-c1',
  status: '已成局', bookingIds: ['b-hj-1'], propIssues: [], depositCharged: 0,
  createdAt: '2026-09-27T15:00:00', createdBy: '排班系统',
}
const bHong: Booking = {
  id: 'b-hj-1', scriptId: 's5', storeId: 'st1', mode: '拼场', playersCount: 4,
  contactName: '吴迪', contactPhone: '13900000008',
  note: '4 人拼场红嫁衣。',
  expectedStart: `${DEMO_DATE}T21:30`, status: '已成局', createdAt: '2026-09-27T14:30:00',
  sessionId: 'ss-hj-2130', payMethod: '在线预付', acknowledgedSafety: true,
  players: [
    { id: 'pl-hj-1', name: '吴迪', phone: '13900000008', rolePreference: 'C位', acceptCrossGender: false, paid: true, paidAmount: 148, checkedIn: false },
    { id: 'pl-hj-2', name: '郑恺', phone: '', rolePreference: '推理位', acceptCrossGender: true, paid: true, paidAmount: 148, checkedIn: false },
    { id: 'pl-hj-3', name: '冯璐', phone: '', rolePreference: '氛围位', acceptCrossGender: true, paid: true, paidAmount: 148, checkedIn: false },
    { id: 'pl-hj-4', name: '何俊', phone: '', rolePreference: '随意', acceptCrossGender: true, paid: true, paidAmount: 148, checkedIn: false },
  ],
}

// —— 人广 20:00 欢乐麻将馆 9 人满员场（演示房间/主持档期忙碌） ——
const ssMj: Session = {
  id: 'ss-mj-2000', storeId: 'st1', scriptId: 's4', date: DEMO_DATE, startKey: '20:00',
  startAt: `${DEMO_DATE}T20:00`, mode: '拼场', roomId: 'r5', hostId: 'h3', copyId: 's4-c1',
  status: '已成局', bookingIds: ['b-mj-1', 'b-mj-2'], propIssues: [], depositCharged: 0,
  createdAt: '2026-09-26T10:00:00', createdBy: '排班系统',
}
const bMj1: Booking = {
  id: 'b-mj-1', scriptId: 's4', storeId: 'st1', mode: '拼场', playersCount: 5,
  contactName: '团建-马经理', contactPhone: '13700000009', groupId: 'g-mj-1',
  note: '公司团建 5 人。', expectedStart: `${DEMO_DATE}T20:00`, status: '已成局',
  createdAt: '2026-09-26T09:30:00', sessionId: 'ss-mj-2000', payMethod: '在线预付',
  players: Array.from({ length: 5 }, (_, i) => ({
    id: `pl-mj-${i + 1}`, name: i === 0 ? '马经理' : `同事${i + 1}`, phone: i === 0 ? '13700000009' : '',
    rolePreference: '随意', acceptCrossGender: true,
    paid: true, paidAmount: 98, checkedIn: false,
  })),
}
const bMj2: Booking = {
  id: 'b-mj-2', scriptId: 's4', storeId: 'st1', mode: '拼场', playersCount: 4,
  contactName: '石磊', contactPhone: '13600000010', groupId: 'g-mj-2',
  note: '4 人拼车。', expectedStart: `${DEMO_DATE}T20:00`, status: '已成局',
  createdAt: '2026-09-26T12:00:00', sessionId: 'ss-mj-2000', payMethod: '在线预付',
  players: Array.from({ length: 4 }, (_, i) => ({
    id: `pl-mj-${i + 6}`, name: i === 0 ? '石磊' : `石友${i + 1}`, phone: i === 0 ? '13600000010' : '',
    rolePreference: '随意', acceptCrossGender: true,
    paid: true, paidAmount: 98, checkedIn: false,
  })),
}

// —— 人广 13:00 长安十二时辰（让小鹿 13:00 有班，不影响晚间） ——
const ssCa: Session = {
  id: 'ss-ca-1300', storeId: 'st1', scriptId: 's2', date: DEMO_DATE, startKey: '13:00',
  startAt: `${DEMO_DATE}T13:00`, mode: '拼场', roomId: 'r2', hostId: 'h2', copyId: 's2-c1',
  status: '已成局', bookingIds: ['b-ca-1'], propIssues: [], depositCharged: 0,
  createdAt: '2026-09-25T10:00:00', createdBy: '排班系统',
}
const bCa: Booking = {
  id: 'b-ca-1', scriptId: 's2', storeId: 'st1', mode: '拼场', playersCount: 6,
  contactName: '推理社-韩社长', contactPhone: '13500000011', groupId: 'g-ca-1',
  note: '高校推理社 6 人。', expectedStart: `${DEMO_DATE}T13:00`, status: '已成局',
  createdAt: '2026-09-25T09:00:00', sessionId: 'ss-ca-1300', payMethod: '在线预付',
  players: Array.from({ length: 6 }, (_, i) => ({
    id: `pl-ca-${i + 1}`, name: i === 0 ? '韩社长' : `社员${i + 1}`, phone: i === 0 ? '13500000011' : '',
    rolePreference: i === 0 ? 'C位' : '随意', acceptCrossGender: true,
    paid: true, paidAmount: 158, checkedIn: false,
  })),
}

export const seedBookings: Booking[] = [bWgA, bWgB, bWgX, bHong, bMj1, bMj2, bCa]
export const seedSessions: Session[] = [ssWg, ssWg2, ssHong, ssMj, ssCa]

// ============ 候补队列：人广《雾港惊魂夜》19:00 ============
export const seedWaitlist: WaitlistEntry[] = [
  {
    id: 'wl-1', storeId: 'st1', scriptId: 's1', contactName: '苏晴', contactPhone: '13800000004',
    memberId: 'm4', partySize: 2, groupId: 'g-wl-1', prepaid: true,
    autoMode: '同意自动补位', acceptedSlots: ['19:00', '21:30'],
    rolePreferences: ['C位', '随意'], acceptCross: [false, true],
    status: '候补中', joinedAt: '2026-09-28T12:00:00',
    priorityRules: [], priorityScore: 0,
  },
  {
    id: 'wl-2', storeId: 'st1', scriptId: 's1', contactName: '王胖子', contactPhone: '13800000003',
    memberId: 'm3', partySize: 1, prepaid: true,
    autoMode: '仅接受指定时段', acceptedSlots: ['19:00'],
    rolePreferences: ['欢乐位'], acceptCross: [true],
    status: '候补中', joinedAt: '2026-09-29T08:30:00',
    priorityRules: [], priorityScore: 0,
  },
  {
    id: 'wl-3', storeId: 'st1', scriptId: 's1', contactName: '赵雨桐', contactPhone: '13800000005',
    memberId: 'm5', partySize: 1, prepaid: false,
    autoMode: '同意自动补位', acceptedSlots: ['19:00', '21:30'],
    rolePreferences: ['随意'], acceptCross: [true],
    status: '候补中', joinedAt: '2026-09-30T19:45:00',
    priorityRules: [], priorityScore: 0,
  },
  {
    id: 'wl-4', storeId: 'st1', scriptId: 's1', contactName: '吴迪', contactPhone: '13900000012',
    partySize: 1, prepaid: true,
    autoMode: '同意自动补位', acceptedSlots: ['19:00', '21:30', '15:30'],
    rolePreferences: ['推理位'], acceptCross: [true],
    status: '候补中', joinedAt: '2026-10-01T09:10:00',
    priorityRules: [], priorityScore: 0,
  },
]

// ============ 预置异常单：10-02 19:00《雾港惊魂夜》开场前异常 ============
export const seedCases: DisruptionCase[] = [
  {
    id: 'dc-1',
    sessionId: 'ss-wg-1900',
    storeId: 'st1',
    type: '主持缺勤',
    title: '主持阿哲临时缺勤；雾港实景房空调故障 19:00 场不可用',
    detail: '10-01 晚 20:00 接到阿哲请假（突发高烧）；同时物业通知雾港实景房中央空调故障，预计 23:30 前无法修复。6 名玩家（两个同行组）已全部在线预付，需在开场前给出改期/迁移/退款/保留权益方案。',
    raisedAt: '2026-10-01T20:00:00',
    raisedBy: '值班店长',
    status: '异常已登记',
  },
]

export const seedEvents: SessionEvent[] = [
  {
    id: 'ev-1', at: '2026-10-01T20:00:00', type: '异常触发', actor: '值班店长',
    title: '开场前异常登记：主持缺勤 + 房间不可用',
    detail: '主持人阿哲请假（高烧），雾港实景房空调故障 18:00-23:30 停用。原场次暂保持「已成局」，名额冻结等待方案，不直接取消。',
    sessionId: 'ss-wg-1900', caseId: 'dc-1', storeId: 'st1', tone: 'red',
  },
]

export const seedTickets: Ticket[] = []

// ============ 收退款流水（按已预付玩家生成报名费收入） ============
function buildSeedLedger(): LedgerEntry[] {
  const out: LedgerEntry[] = []
  let seq = 1
  for (const b of seedBookings) {
    for (const p of b.players) {
      if (!p.paid || p.paidAmount <= 0) continue
      out.push({
        id: `l-seed-${seq++}`,
        at: `${b.createdAt.slice(0, 16)}:${String(seq).padStart(2, '0')}`,
        kind: '报名费收入', amount: p.paidAmount, playerId: p.id,
        sessionId: b.sessionId ?? '',
        memo: `${p.name}《${seedScripts.find((s) => s.id === b.scriptId)!.name}》报名费`,
        operator: '系统',
      })
    }
  }
  return out
}
export const seedLedger: LedgerEntry[] = buildSeedLedger()
