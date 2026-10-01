import React from 'react'
import type { SessionStatus, TicketStatus, PayStatus } from './types'

export const cn = (...xs: (string | false | undefined | null)[]) => xs.filter(Boolean).join(' ')

export function Badge({ tone, children }: { tone?: 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'gold'; children: React.ReactNode }) {
  return <span className={cn('badge', tone)}>{children}</span>
}

const sessionTone: Record<SessionStatus, 'amber' | 'green' | 'blue' | 'purple' | 'red' | 'gold'> = {
  待成局: 'amber',
  已成局: 'green',
  改期待补: 'amber',
  已签到: 'blue',
  角色已分: 'purple',
  道具已发: 'purple',
  进行中: 'gold',
  休息中: 'amber',
  已结账: 'green',
  已复盘: 'green',
  已解散: 'red',
}
export const SessionBadge = ({ s }: { s: SessionStatus }) => <Badge tone={sessionTone[s]}><span className="dot" />{s}</Badge>

const ticketTone: Record<TicketStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  待处理: 'amber',
  处理中: 'blue',
  待店长审批: 'red',
  已解决: 'green',
  已驳回: 'red',
}
export const TicketBadge = ({ s }: { s: TicketStatus }) => <Badge tone={ticketTone[s]}>{s}</Badge>

export const PayBadge = ({ s }: { s: PayStatus }) =>
  <Badge tone={s === '已支付' ? 'green' : s === '未支付' ? 'red' : s === '部分退款' ? 'amber' : 'blue'}>{s}</Badge>

export function Modal({ title, wide, onClose, children, footer }: {
  title: React.ReactNode; wide?: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('modal', wide && 'wide')}>
        <div className="spread">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>✕ 关闭</button>
        </div>
        <div>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Stars({ n, size }: { n: number; size?: number }) {
  return <span className="stars" style={{ fontSize: size ? `${size}px` : undefined }}>
    {'★★★★★'.slice(0, Math.round(n))}<span style={{ color: '#4a3f5c' }}>{'★★★★★'.slice(Math.round(n))}</span>
  </span>
}

export const fmtMoney = (n: number) => `¥${Math.abs(n).toFixed(0)}`

export function useModal() {
  const [node, setNode] = React.useState<React.ReactNode>(null)
  const open = (n: React.ReactNode) => setNode(n)
  const close = () => setNode(null)
  return { node, open, close }
}
