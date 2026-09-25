import { describe, expect, it } from 'vitest'

import { classifyHistoryShortcut } from '../src/historyShortcut'

const input = (overrides: Partial<Parameters<typeof classifyHistoryShortcut>[0]> = {}) => ({
    key: 'z',
    mod: true,
    shift: false,
    composing: false,
    ...overrides,
})

describe('classifyHistoryShortcut：撤销/重做键意图（纯函数，DOM 解码在绑定层）', () => {
    it('Ctrl/Cmd+Z = 撤销，Shift 变体 = 重做（key 大小写随 Shift，归一化后匹配）', () => {
        expect(classifyHistoryShortcut(input())).toBe('undo')
        expect(classifyHistoryShortcut(input({ key: 'Z', shift: true }))).toBe('redo')
        expect(classifyHistoryShortcut(input({ key: 'Z' }))).toBe('undo') // 大写锁定时 key 仍为 'Z'
    })

    it('Ctrl/Cmd+Y = 重做（Shift+Y 同键异形，归一化后仍重做）', () => {
        expect(classifyHistoryShortcut(input({ key: 'y' }))).toBe('redo')
        expect(classifyHistoryShortcut(input({ key: 'Y', shift: true }))).toBe('redo')
    })

    it('无 Ctrl/Cmd 修饰不触发（裸 z/y、单 Shift、单 Alt 均不属于文档历史）', () => {
        expect(classifyHistoryShortcut(input({ mod: false }))).toBeNull()
        expect(classifyHistoryShortcut(input({ mod: false, key: 'y' }))).toBeNull()
    })

    it('输入法合成中不触发（与工单 11 的守卫协同：候选窗里的快捷键属输入法）', () => {
        expect(classifyHistoryShortcut(input({ composing: true }))).toBeNull()
        expect(classifyHistoryShortcut(input({ composing: true, key: 'Z', shift: true }))).toBeNull()
    })

    it('其它按键返回 null（如 Ctrl+S、Ctrl+C 不劫持）', () => {
        expect(classifyHistoryShortcut(input({ key: 's' }))).toBeNull()
        expect(classifyHistoryShortcut(input({ key: 'c' }))).toBeNull()
        expect(classifyHistoryShortcut(input({ key: 'Escape' }))).toBeNull()
    })
})
