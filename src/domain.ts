// ============ 纯领域逻辑（无状态、可单测）：角色约束匹配 / 候补优先级评分 ============
import type { Member, Player } from './types'

export interface RoleDef { name: string; gender: string; hint: string }

/** 判断玩家能否承担某角色（性别建议 + 反串意愿） */
export function canTakeRole(player: Player, role: RoleDef): boolean {
  if (role.gender === '不限') return true
  if (player.gender === role.gender) return true
  // 角色有性别建议而玩家性别不符：必须明确接受反串
  return player.acceptCrossGender
}

export interface RoleMatchResult {
  feasible: boolean
  assign: Record<string, string>
  conflicts: string[]
}

/**
 * 角色人数/性别约束校验：人数不能超过角色数；
 * 性别受限玩家（不接受反串）优先匹配同性角色，再用反串/不限角色补位。
 * 保证“角色配置不失衡”——无法完成一一配角即判定不可行。
 */
export function matchRoles(players: Player[], roles: RoleDef[]): RoleMatchResult {
  const conflicts: string[] = []
  if (players.length > roles.length) {
    conflicts.push(`目标场次仅剩 ${roles.length} 个角色位，无法容纳 ${players.length} 名玩家（角色人数约束）`)
    return { feasible: false, assign: {}, conflicts }
  }
  const assign: Record<string, string> = {}
  const used = new Set<string>()
  // 第一轮：不接受反串者优先拿同性角色
  const ordered = [...players].sort((a, b) => Number(a.acceptCrossGender) - Number(b.acceptCrossGender))
  for (const p of ordered) {
    const role = roles.find((r) => !used.has(r.name) && canTakeRole(p, r))
    if (!role) {
      conflicts.push(`玩家「${p.name}」（${p.gender}${p.acceptCrossGender ? '' : '·不接受反串'}）找不到可承担的剩余角色`)
      continue
    }
    used.add(role.name)
    assign[p.id] = role.name
  }
  const feasible = Object.keys(assign).length === players.length
  if (!feasible) conflicts.push('按性别建议与反串意愿无法完成全员配角，强行迁移会造成角色配置失衡')
  return { feasible, assign, conflicts }
}

/**
 * 候补优先级（规则对玩家完全公开）：
 *  会员等级（金卡 40 / 银卡 25）+ 自动补位 20（仅指定时段 5）
 *  + 报名先后（排队每分钟 0.1 分，封顶 20）+ 历史履约（到店次数，封顶 10）+ 同行成组 5。
 */
export function computeWaitScore(input: {
  member?: Member
  mode: Player['waitlistMode']
  ageMinutes: number
  groupSize: number
}): { score: number; parts: { label: string; value: number }[] } {
  const levelPt = input.member?.level === '金卡' ? 40 : input.member?.level === '银卡' ? 25 : 0
  const modePt = input.mode === '自动补位' ? 20 : 5
  const queuePt = Math.min(20, Math.round(input.ageMinutes * 0.1))
  const visitPt = Math.min(10, input.member?.visits ?? 0)
  const groupPt = input.groupSize > 1 ? 5 : 0
  const parts = [
    { label: `会员等级（${input.member?.level ?? '普通'}）`, value: levelPt },
    { label: input.mode === '自动补位' ? '同意自动补位' : '仅接受指定时段', value: modePt },
    { label: '报名先后', value: queuePt },
    { label: `历史履约（到店 ${input.member?.visits ?? 0} 次）`, value: visitPt },
  ]
  if (groupPt) parts.push({ label: '同行成组', value: groupPt })
  return { score: levelPt + modePt + queuePt + visitPt + groupPt, parts }
}

/** 两个时长区间是否重叠（分钟） */
export function overlaps(startA: string, durMinA: number, startB: string, durMinB: number): boolean {
  const t1 = new Date(startA).getTime()
  const t2 = new Date(startB).getTime()
  return t1 < t2 + durMinB * 60000 && t2 < t1 + durMinA * 60000
}

/** 简单倒计时文本 */
export function countdownText(deadlineIso: string, nowMs: number): { text: string; overdue: boolean } {
  const ms = new Date(deadlineIso).getTime() - nowMs
  if (ms <= 0) return { text: '已截止', overdue: true }
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const h = Math.floor(m / 60)
  return { text: h > 0 ? `${h}小时${m % 60}分${s}秒` : `${m}分${s}秒`, overdue: false }
}
