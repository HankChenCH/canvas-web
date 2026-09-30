/**
 * 快捷键注册表（工单 14）：键位→action 的集中声明与让路规则。
 *
 * - 注册表 = 数据（combo → action 的声明式条目），分类器只做匹配；宿主可注入
 *   自定义绑定集（缺省集跟随 excalidraw 惯例并按 v1 单选裁剪：工具切换/全选
 *   不适用，剪切未纳入——复制/粘贴/副本/删除/撤销/重做）。
 * - 让路规则（有测试锁定）：输入法合成中、文本编辑态（焦点路由进 textarea——
 *   Delete 不得删图层、Ctrl+Z 撤「输入」而非文档）、焦点在可编辑元素
 *   （input/textarea/select/contentEditable，属性面板的输入框优先原生编辑）。
 * - executeShortcut 是 action → 会话动作的分派面：分类与分派都可在 Node 无 DOM
 *   环境测试（绑定层只做 KeyboardEvent → 输入的折算）。
 */
import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    DEFAULT_EDITOR_SHORTCUTS,
    classifyEditorShortcut,
    type EditorShortcutInput,
} from '../../src/session/shortcuts'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = () => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10, text: '甲' })] })
    return session
}

const input = (overrides: Partial<EditorShortcutInput> = {}): EditorShortcutInput => ({
    key: 'z',
    mod: true,
    shift: false,
    composing: false,
    editing: false,
    editableTarget: false,
    ...overrides,
})

describe('classifyEditorShortcut：缺省注册表（excalidraw 惯例、v1 单选裁剪）', () => {
    it('撤销/重做：Ctrl/Cmd+Z 与 Shift 变体、Ctrl+Y（Windows 惯例）', () => {
        expect(classifyEditorShortcut(input({ key: 'z', mod: true, shift: false }))).toBe('undo')
        expect(classifyEditorShortcut(input({ key: 'z', mod: true, shift: true }))).toBe('redo')
        expect(classifyEditorShortcut(input({ key: 'y', mod: true, shift: false }))).toBe('redo')
        expect(classifyEditorShortcut(input({ key: 'y', mod: true, shift: true }))).toBeNull()
    })

    it('剪贴板三件套：Ctrl/Cmd+C/V/D（mod 必需）', () => {
        expect(classifyEditorShortcut(input({ key: 'c', mod: true }))).toBe('copy')
        expect(classifyEditorShortcut(input({ key: 'v', mod: true }))).toBe('paste')
        expect(classifyEditorShortcut(input({ key: 'd', mod: true }))).toBe('duplicate')
        expect(classifyEditorShortcut(input({ key: 'c', mod: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'v', mod: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'd', mod: false }))).toBeNull()
    })

    it('删除：Delete / Backspace（无修饰键）', () => {
        expect(classifyEditorShortcut(input({ key: 'Delete', mod: false, shift: false }))).toBe('delete')
        expect(classifyEditorShortcut(input({ key: 'Backspace', mod: false, shift: false }))).toBe('delete')
        expect(classifyEditorShortcut(input({ key: 'Delete', mod: true }))).toBeNull()
    })

    it('重命名：F2（无修饰键；key 大小写归一后匹配）', () => {
        expect(classifyEditorShortcut(input({ key: 'F2', mod: false, shift: false }))).toBe('rename')
        expect(classifyEditorShortcut(input({ key: 'F2', mod: true, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'F2', mod: false, shift: true }))).toBeNull()
    })

    it('标尺开关：⇧R（裸键 + shift，ruler-guides-snap 工单 01）', () => {
        expect(classifyEditorShortcut(input({ key: 'r', mod: false, shift: true }))).toBe('toggleRulers')
        // Shift 折算的大写形态同样命中（key 归一）
        expect(classifyEditorShortcut(input({ key: 'R', mod: false, shift: true }))).toBe('toggleRulers')
        // 裸 R / Ctrl+R / Ctrl+⇧R 不入表（不抢浏览器刷新等既有语义）
        expect(classifyEditorShortcut(input({ key: 'r', mod: false, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'r', mod: true, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'r', mod: true, shift: true }))).toBeNull()
    })

    it('key 大小写归一（大写锁定/Shift 折算后匹配）', () => {
        expect(classifyEditorShortcut(input({ key: 'Z', mod: true, shift: false }))).toBe('undo')
        expect(classifyEditorShortcut(input({ key: 'C', mod: true, shift: false }))).toBe('copy')
    })

    it('未声明的键返回 null（v1 单选：全选/工具切换不入表）', () => {
        expect(classifyEditorShortcut(input({ key: 'a', mod: true, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'v', mod: false, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Escape', mod: false, shift: false }))).toBeNull()
    })
})

describe('classifyEditorShortcut：让路规则（编辑态/输入态/输入法）', () => {
    it('输入法合成中（isComposing/keyCode 229 折算）不触发任何快捷键', () => {
        expect(classifyEditorShortcut(input({ composing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Delete', composing: true }))).toBeNull()
    })

    it('文本编辑态全部让路：焦点路由进 textarea（原生编辑与原生 undo）', () => {
        expect(classifyEditorShortcut(input({ editing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Delete', editing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Backspace', editing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'c', mod: true, editing: true }))).toBeNull()
    })

    it('焦点在可编辑元素（属性面板输入框）让路：原生编辑优先', () => {
        expect(classifyEditorShortcut(input({ editableTarget: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Delete', editableTarget: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'z', mod: true, editableTarget: true }))).toBeNull()
    })

    it('让路优先于匹配：编辑态即使键位命中也不出 action', () => {
        const order = classifyEditorShortcut(input({ key: 'z', mod: true, editing: true, composing: true }))
        expect(order).toBeNull()
    })
})

describe('自定义注册表：宿主可注入绑定集（注册表即数据）', () => {
    it('注入空表 = 全部放行（宿主完全接管）；注入自定义键位生效', () => {
        expect(classifyEditorShortcut(input({ key: 'z', mod: true }), [])).toBeNull()
        expect(
            classifyEditorShortcut(input({ key: 'k', mod: true }), [
                { combo: { key: 'k', mod: true, shift: false }, action: 'duplicate' },
            ]),
        ).toBe('duplicate')
    })

    it('缺省集本身不因注入被修改', () => {
        classifyEditorShortcut(input({ key: 'q', mod: true }), [
            { combo: { key: 'q', mod: true, shift: false }, action: 'delete' },
        ])
        expect(classifyEditorShortcut(input({ key: 'q', mod: true }))).toBeNull()
        expect(DEFAULT_EDITOR_SHORTCUTS.length).toBeGreaterThan(0)
    })
})

describe('executeShortcut：action → 会话动作分派', () => {
    it('delete 分派 deleteLayer（含子树），无选择为 false', () => {
        const session = makeSession()
        session.setSelection(['layers', 0])
        expect(session.executeShortcut('delete')).toBe(true)
        expect(session.store.doc!.layers).toHaveLength(0)
        expect(session.store.ui.selection).toBeNull()
        expect(session.executeShortcut('delete')).toBe(false)
    })

    it('undo/redo 分派历史导航', () => {
        const session = makeSession()
        session.setSelection(['layers', 0])
        session.executeShortcut('delete')
        expect(session.store.doc!.layers).toHaveLength(0)
        session.executeShortcut('undo')
        expect(session.store.doc!.layers).toHaveLength(1)
        session.executeShortcut('redo')
        expect(session.store.doc!.layers).toHaveLength(0)
    })

    it('copy/paste/duplicate 分派剪贴板动作（空剪贴板粘贴为 false）', () => {
        const session = makeSession()
        expect(session.executeShortcut('paste')).toBe(false)
        session.setSelection(['layers', 0])
        expect(session.executeShortcut('copy')).toBe(true)
        expect(session.executeShortcut('paste')).toBe(true)
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.executeShortcut('duplicate')).toBe(true)
        expect(session.store.doc!.layers).toHaveLength(3)
    })

    it('端到端：文本编辑态按 Delete 分类让路，图层不删（工单验收项）', () => {
        const session = makeSession()
        session.setSelection(['layers', 0])
        expect(session.beginTextEdit(['layers', 0])).toBe(true)
        // 绑定层的折算：editing 取自 ui.editing，分类让路 → 不调 executeShortcut
        const action = classifyEditorShortcut(
            input({ key: 'Delete', mod: false, shift: false, editing: session.store.ui.editing !== null }),
        )
        expect(action).toBeNull()
        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.ui.editing).not.toBeNull()
    })

    it('端到端：F2 分类为 rename 分派开重命名会话（工单 09）', () => {
        const session = makeSession()
        session.setSelection(['layers', 0])
        const action = classifyEditorShortcut(input({ key: 'F2', mod: false, shift: false }))
        expect(action).toBe('rename')
        expect(session.executeShortcut(action!)).toBe(true)
        expect(session.store.ui.renaming).toEqual(['layers', 0])
    })

    it('端到端：⇧R 分类为 toggleRulers 分派翻转标尺显隐（ruler-guides-snap 工单 01）', () => {
        const session = makeSession()
        const action = classifyEditorShortcut(input({ key: 'r', mod: false, shift: true }))
        expect(action).toBe('toggleRulers')
        expect(session.executeShortcut(action!)).toBe(true)
        expect(session.store.ui.rulersVisible).toBe(false)
        expect(session.executeShortcut(action!)).toBe(true)
        expect(session.store.ui.rulersVisible).toBe(true)
    })
})
