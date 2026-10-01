// UI 冒烟：在 Node 中 renderToString 渲染整个 App（含异常中心/玩家/看板等所有 tab）
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
}

const React = require('react')
const { renderToString } = require('react-dom/server')
const { default: App } = require('../src/App.tsx')
const { useStore } = require('../src/store.ts')
const { DisruptionCenterPage } = require('../src/pages/DisruptionPages.tsx')

const roles = ['player', 'frontdesk', 'host', 'manager', 'service'] as const
let bad = 0
for (const role of roles) {
  useStore.getState().setRole(role)
  try {
    const html = renderToString(React.createElement(App))
    const ok = html.includes('入局') && html.length > 2000
    console.log(`${ok ? '✅' : '❌'} ${role} 视图渲染成功（${html.length} chars）`)
    if (!ok) bad++
  } catch (e) {
    bad++
    console.error(`❌ ${role} 视图渲染抛错：`, e)
  }
}
// 异常改期中心（计算候选后）
useStore.getState().setRole('manager')
useStore.getState().computePlans('dc-1')
try {
  const html = renderToString(React.createElement(DisruptionCenterPage))
  const ok = html.includes('候选')
  console.log(`${ok ? '✅' : '❌'} 异常改期中心渲染（${html.length} chars）`)
  if (!ok) bad++
} catch (e) { bad++; console.error('❌ 异常改期中心渲染抛错：', e) }

process.exit(bad ? 1 : 0)
