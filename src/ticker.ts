import { useEffect, useState } from 'react'
import { useStore } from './store'

/** 全局秒级心跳：驱动确认倒计时显示，并顺手扫描超时的玩家确认 / 预占锁 */
export function useTicker(ms = 1000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setTick((x) => x + 1)
      useStore.getState().sweepDeadlines()
    }, ms)
    return () => clearInterval(t)
  }, [ms])
  return tick
}

export const remainSecs = (deadline?: string) => {
  if (!deadline) return 0
  return Math.max(0, Math.floor((new Date(deadline.length === 16 ? deadline + ':00' : deadline).getTime() - Date.now()) / 1000))
}
export const fmtCountdown = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
