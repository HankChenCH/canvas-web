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

    it('锁定/显隐：⇧⌘L / ⇧⌘H（canvas-web-layer-lock 工单 02，行业趋同键位；mod+shift 精确匹配）', () => {
        expect(classifyEditorShortcut(input({ key: 'l', mod: true, shift: true }))).toBe('toggleLayerLock')
        expect(classifyEditorShortcut(input({ key: 'L', mod: true, shift: true }))).toBe('toggleLayerLock')
        expect(classifyEditorShortcut(input({ key: 'h', mod: true, shift: true }))).toBe('toggleLayerVisibility')
        expect(classifyEditorShortcut(input({ key: 'H', mod: true, shift: true }))).toBe('toggleLayerVisibility')
        // 裸键 / 只 mod / 只 shift 不入表（⌘L 浏览器地址栏、⌘H 浏览器历史不抢）
        expect(classifyEditorShortcut(input({ key: 'l', mod: true, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'l', mod: false, shift: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'h', mod: true, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'h', mod: false, shift: true }))).toBeNull()
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
                { combo: { key: 'k', mod: true, shift: false }, action: 'duplicate', label: '副本', group: 'clipboard' },
            ]),
        ).toBe('duplicate')
    })

    it('缺省集本身不因注入被修改', () => {
        classifyEditorShortcut(input({ key: 'q', mod: true }), [
            { combo: { key: 'q', mod: true, shift: false }, action: 'delete', label: '删除', group: 'layer' },
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

    it('toggleLayerLock 分派锁定翻转（ui 变更零历史步）；无选择/非根为 false（工单 02）', () => {
        const session = makeSession()
        expect(session.executeShortcut('toggleLayerLock')).toBe(false) // 无选择空转
        expect(session.store.ui.lockedPaths).toEqual([])
        session.setSelection(['layers', 0])
        expect(session.executeShortcut('toggleLayerLock')).toBe(true)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
        expect(session.store.history).toHaveLength(0) // ui 变更不进历史
        expect(session.executeShortcut('toggleLayerLock')).toBe(true)
        expect(session.store.ui.lockedPaths).toEqual([]) // 再按解锁
        // 非根形状空转（kernel 面向根层，分派口按可用态裁剪返回 false）
        session.setSelection(['layers', 0, 'rows', 0])
        expect(session.executeShortcut('toggleLayerLock')).toBe(false)
        expect(session.store.ui.lockedPaths).toEqual([])
        // 悬空根路径同样空转为 false（prune 窗口外的兜底，分派口与内核空转同口径）
        session.setSelection(['layers', 9])
        expect(session.executeShortcut('toggleLayerLock')).toBe(false)
        expect(session.store.ui.lockedPaths).toEqual([])
    })

    it('toggleLayerVisibility 分派显隐翻转（一步历史）；无选择/非根为 false（工单 02 挂账补位）', () => {
        const session = makeSession()
        expect(session.executeShortcut('toggleLayerVisibility')).toBe(false)
        session.setSelection(['layers', 0])
        expect(session.executeShortcut('toggleLayerVisibility')).toBe(true)
        expect(session.store.doc!.layers[0]!.visible).toBe(false)
        expect(session.store.history).toHaveLength(1)
        session.setSelection(['layers', 0, 'rows', 0])
        expect(session.executeShortcut('toggleLayerVisibility')).toBe(false)
        expect(session.store.doc!.layers[0]!.visible).toBe(false)
        session.setSelection(['layers', 9])
        expect(session.executeShortcut('toggleLayerVisibility')).toBe(false)
        expect(session.store.doc!.layers[0]!.visible).toBe(false)
    })
})

describe('注册表新键位（kbd-nav 工单 01）：z 序与缩放', () => {
    it('z 序键位：⌘]/⌘[ key 匹配前移/后移（mod 精确）', () => {
        expect(classifyEditorShortcut(input({ key: ']', mod: true, shift: false }))).toBe('bringForward')
        expect(classifyEditorShortcut(input({ key: '[', mod: true, shift: false }))).toBe('sendBackward')
        expect(classifyEditorShortcut(input({ key: ']', mod: true, shift: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: ']', mod: false, shift: false }))).toBeNull()
    })

    it('置顶/置底按 code 匹配（mac ⌥ 下 event.key 变体字符，key 匹配不可靠）', () => {
        expect(
            classifyEditorShortcut(input({ key: '®', mod: true, shift: false, alt: true, code: 'BracketRight' })),
        ).toBe('bringToFront')
        expect(
            classifyEditorShortcut(input({ key: 'œ', mod: true, shift: false, alt: true, code: 'BracketLeft' })),
        ).toBe('sendToBack')
        // 桥未折算 code（undefined）时不匹配——code 条目的唯一匹配通道
        expect(classifyEditorShortcut(input({ key: ']', mod: true, shift: false, alt: true }))).toBeNull()
        // 无 alt 的 ⌘] 仍 key 匹配前移，不串到置顶（alt 精确匹配）
        expect(
            classifyEditorShortcut(input({ key: ']', mod: true, shift: false, alt: false, code: 'BracketRight' })),
        ).toBe('bringForward')
    })

    it('缩放键位：⌘0 复位、⇧1/⇧2 适应画布/选区（⇧ 数字 key 变体，按 code 匹配）', () => {
        expect(classifyEditorShortcut(input({ key: '0', mod: true, shift: false }))).toBe('zoomReset')
        expect(classifyEditorShortcut(input({ key: '0', mod: true, shift: true }))).toBeNull()
        // US 布局 Shift+1 的 event.key 是 '!'、法国布局是 '1'——两形态都经 code 命中
        expect(classifyEditorShortcut(input({ key: '!', mod: false, shift: true, code: 'Digit1' }))).toBe(
            'fitToSurface',
        )
        expect(classifyEditorShortcut(input({ key: '1', mod: false, shift: true, code: 'Digit1' }))).toBe(
            'fitToSurface',
        )
        expect(classifyEditorShortcut(input({ key: '@', mod: false, shift: true, code: 'Digit2' }))).toBe(
            'fitToSelection',
        )
        expect(classifyEditorShortcut(input({ key: '2', mod: false, shift: true, code: 'Digit2' }))).toBe(
            'fitToSelection',
        )
        // 无 shift 的裸 1/2 不入表
        expect(classifyEditorShortcut(input({ key: '1', mod: false, shift: false, code: 'Digit1' }))).toBeNull()
    })

    it('alt 缺省视作 false：未声明 alt 的既有条目不因按下 ⌥ 失配之外串扰（⇧⌘L + ⌥ 不命中）', () => {
        expect(classifyEditorShortcut(input({ key: 'l', mod: true, shift: true, alt: false }))).toBe(
            'toggleLayerLock',
        )
        expect(classifyEditorShortcut(input({ key: 'l', mod: true, shift: true, alt: true }))).toBeNull()
    })
})

describe('helpShortcuts 条目（kbd-nav 工单 04）：⌘/ 快捷键帮助（UI 面动作）', () => {
    it('⌘/ 分类为 helpShortcuts（mod 精确；无 mod / ⇧ 变体不入表）', () => {
        expect(classifyEditorShortcut(input({ key: '/', mod: true, shift: false }))).toBe('helpShortcuts')
        expect(classifyEditorShortcut(input({ key: '/', mod: true, shift: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: '/', mod: false, shift: false }))).toBeNull()
        // US 布局 ⇧/ 的 key 变体 '?' 同样不入表（shift 精确匹配）
        expect(classifyEditorShortcut(input({ key: '?', mod: true, shift: true }))).toBeNull()
    })

    it('条目元数据：label「快捷键帮助」+ group help（帮助面板分节的展示数据底座）', () => {
        const binding = DEFAULT_EDITOR_SHORTCUTS.find((entry) => entry.action === 'helpShortcuts')
        expect(binding?.label).toBe('快捷键帮助')
        expect(binding?.group).toBe('help')
    })

    it('UI 面动作不经内核 dispatcher：executeShortcut 恒 false（绑定层桥拦截路由帮助面板）', () => {
        const session = makeSession()
        expect(session.executeShortcut('helpShortcuts')).toBe(false)
    })
})

describe('findReplace 条目（canvas-web-find-replace 工单 01）：⌘F 查找替换', () => {
    it('⌘F 分类为 findReplace（mod+shift 精确匹配先例：⇧⌘F/裸 F/⌥⌘F 不命中）', () => {
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, shift: false }))).toBe('findReplace')
        // key 大小写归一（大写锁定/Shift 折算同形）
        expect(classifyEditorShortcut(input({ key: 'F', mod: true, shift: false }))).toBe('findReplace')
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, shift: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'f', mod: false, shift: false }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, shift: false, alt: true }))).toBeNull()
    })

    it('让路规则先行：编辑态/输入态/合成中 ⌘F 放行（textarea 与查找条输入框原生编辑优先）', () => {
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, editing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, editableTarget: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'f', mod: true, composing: true }))).toBeNull()
    })

    it('条目元数据：label「查找替换」（不造「全局搜索」变体）+ group text', () => {
        const binding = DEFAULT_EDITOR_SHORTCUTS.find((entry) => entry.action === 'findReplace')
        expect(binding?.label).toBe('查找替换')
        expect(binding?.label.includes('全局搜索')).toBe(false)
        expect(binding?.group).toBe('text')
    })

    it('端到端：⌘F 分类分派 beginFind 开会话（面板开合归内核会话态，Esc 关归 Vue）', () => {
        const session = makeSession()
        const action = classifyEditorShortcut(input({ key: 'f', mod: true, shift: false }))
        expect(action).toBe('findReplace')
        expect(session.executeShortcut(action!)).toBe(true)
        expect(session.store.ui.find.open).toBe(true)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('注册表元数据（kbd-nav 工单 01）：label/group 数据完备性', () => {
    const GROUPS = new Set(['history', 'clipboard', 'layer', 'text', 'view', 'help'])

    it('每条绑定都有非空 label 与合法 group', () => {
        for (const binding of DEFAULT_EDITOR_SHORTCUTS) {
            expect(binding.label.trim().length).toBeGreaterThan(0)
            expect(GROUPS.has(binding.group)).toBe(true)
        }
    })

    it('z 序四条目命名只用「前移/后移/置顶/置底」（不用上移/下移/提升/降低）', () => {
        const labelsOf = (action: string): string[] =>
            DEFAULT_EDITOR_SHORTCUTS.filter((binding) => binding.action === action).map((binding) => binding.label)
        expect(labelsOf('bringForward')).toEqual(['前移一层'])
        expect(labelsOf('sendBackward')).toEqual(['后移一层'])
        expect(labelsOf('bringToFront')).toEqual(['置顶'])
        expect(labelsOf('sendToBack')).toEqual(['置底'])
        for (const action of ['bringForward', 'sendBackward', 'bringToFront', 'sendToBack']) {
            for (const label of labelsOf(action)) {
                for (const forbidden of ['上移', '下移', '提升', '降低']) {
                    expect(label.includes(forbidden)).toBe(false)
                }
            }
        }
    })
})

describe('executeShortcut：z 序与缩放分派（kbd-nav 工单 01）', () => {
    const makeZSession = () => {
        const session = makeSession()
        session.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 30, text: '底' }),
                textLayer({ priority: 20, text: '中' }),
                textLayer({ priority: 10, text: '顶' }),
            ],
        })
        return session
    }
    const texts = (session: ReturnType<typeof makeZSession>): string[] =>
        session.store.doc!.layers.map((layer) => (layer as { text: string }).text)

    it('bringForward/sendBackward 分派前移/后移；无选择为 false', () => {
        const session = makeZSession()
        expect(session.executeShortcut('bringForward')).toBe(false)
        expect(session.executeShortcut('sendBackward')).toBe(false)
        session.setSelection(['layers', 1])
        expect(session.executeShortcut('bringForward')).toBe(true)
        expect(texts(session)).toEqual(['底', '顶', '中'])
        expect(session.executeShortcut('sendBackward')).toBe(true)
        expect(texts(session)).toEqual(['底', '中', '顶'])
    })

    it('bringToFront/sendToBack 经分派面生效（注册表动作全覆盖）', () => {
        const session = makeZSession()
        session.setSelection(['layers', 1])
        expect(session.executeShortcut('bringToFront')).toBe(true)
        expect(texts(session)).toEqual(['底', '顶', '中'])
        expect(session.store.doc!.layers[2]!.priority).toBe(9)
        expect(session.executeShortcut('sendToBack')).toBe(true)
        expect(texts(session)).toEqual(['中', '底', '顶'])
    })

    it('zoomReset/fitToSurface/fitToSelection 分派相机动作（不进历史）', () => {
        const session = makeZSession()
        session.setSurfaceSize(800, 600)
        session.zoomAt(100, 100, 3)
        expect(session.executeShortcut('zoomReset')).toBe(true)
        expect(session.store.ui.viewport.zoom).toBe(1)
        expect(session.store.history).toHaveLength(0)
        expect(session.executeShortcut('fitToSurface')).toBe(true)
        expect(session.executeShortcut('fitToSelection')).toBe(true) // 无选择回落适应画布
    })
})
