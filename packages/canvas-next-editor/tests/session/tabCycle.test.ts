/**
 * Tab/⇧Tab 循环选层（kbd-nav 工单 03，CONTEXT「循环选层」词条 / spec 决策 4）：
 * - selectNextLayer/selectPrevLayer 沿面板序（面板顶 = 视觉最上层 = 数组尾）在
 *   根层间移动 store.ui.selection：Tab 朝更垫底方向、⇧Tab 反向，端点 wrap 回绕；
 * - 空选从视觉最上层（面板首行）开始（两方向同起点，spec 决策 4 字面口径）；
 * - 子层选中以根祖先为基准取相邻根层（不下钻表格）；
 * - 跳过面与命中面同门（hitTest 同款判定）：visible=false 整跳（排除语义）、
 *   锁定整跳（isLocked 谓词收口——layer-lock 已合入，随谓词自动生效）；
 *   全部根层被跳过时空转；单根层 wrap 自身无害；
 * - 选中变更走 setSelection：ui 分支零历史步（undo 不回退选中）。
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    DEFAULT_EDITOR_SHORTCUTS,
    classifyEditorShortcut,
    type EditorShortcutAction,
    type EditorShortcutInput,
} from '../../src/session/shortcuts'
import { isRootLayerPath, resolveLayer } from '../../src/shared/layerPath'
import { cellLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeCycleSession = (layers: readonly Layer[]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers: [...layers] })
    return session
}

/** 数组序 [底(pri 30), 中(pri 20), 顶(pri 10)]：面板序 = 顶(0) → 中(1) → 底(2)，名字即断言标识 */
const makeThreeSession = (): EditorSession =>
    makeCycleSession([
        textLayer({ priority: 30, name: '底' }),
        textLayer({ priority: 20, name: '中' }),
        textLayer({ priority: 10, name: '顶' }),
    ])

/** 选中根层的名字标识；非根路径/悬空/空选归 null（「只落根路径」的隐式断言面） */
const selectedRootName = (session: EditorSession): string | null => {
    const path = session.store.ui.selection
    if (path === null || !isRootLayerPath(path)) return null
    return resolveLayer(session.store.doc!, path)?.name ?? null
}

const input = (overrides: Partial<EditorShortcutInput> = {}): EditorShortcutInput => ({
    key: 'Tab',
    mod: false,
    shift: false,
    composing: false,
    editing: false,
    editableTarget: false,
    ...overrides,
})

describe('方向与 wrap（Tab 朝垫底方向、⇧Tab 反向、端点回绕）', () => {
    it('Tab 沿面板序向垫底方向移动：顶→中→底→wrap 回顶', () => {
        const session = makeThreeSession()
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('中')
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('底')
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶') // 端点 wrap 回绕
    })

    it('⇧Tab 反向：空选顶→wrap 底→中→顶', () => {
        const session = makeThreeSession()
        session.selectPrevLayer()
        expect(selectedRootName(session)).toBe('顶') // 空选从面板首行开始
        expect(session.selectPrevLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('底') // 端点 wrap 回绕
        expect(session.selectPrevLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('中')
        expect(session.selectPrevLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
    })

    it('有选中时 ⇧Tab 从相邻更上层继续：中→顶→wrap 底', () => {
        const session = makeThreeSession()
        session.selectNextLayer() // 顶
        session.selectNextLayer() // 中
        session.selectPrevLayer()
        expect(selectedRootName(session)).toBe('顶')
        session.selectPrevLayer()
        expect(selectedRootName(session)).toBe('底') // wrap
    })
})

describe('空选起点（视觉最上层 = 面板首行）', () => {
    it('空选两方向都从视觉最上层开始（spec 决策 4 字面口径）', () => {
        const next = makeThreeSession()
        expect(next.selectNextLayer()).toBe(true)
        expect(selectedRootName(next)).toBe('顶')

        const prev = makeThreeSession()
        expect(prev.selectPrevLayer()).toBe(true)
        expect(selectedRootName(prev)).toBe('顶')
    })
})

describe('跳过隐藏（visible=false 整跳，命中面同门）', () => {
    it('中间层隐藏：Tab 巡检整跳隐藏层，wrap 同样绕开', () => {
        const session = makeCycleSession([
            textLayer({ priority: 30, name: '底', visible: false }),
            textLayer({ priority: 20, name: '中' }),
            textLayer({ priority: 10, name: '顶' }),
        ])
        session.selectNextLayer() // 顶
        session.selectNextLayer()
        expect(selectedRootName(session)).toBe('中') // 底隐藏整跳
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶') // wrap 绕开隐藏底
    })

    it('空选起点（视觉最上层）自身隐藏：落到下一可见层', () => {
        const session = makeCycleSession([
            textLayer({ priority: 30, name: '底' }),
            textLayer({ priority: 20, name: '中' }),
            textLayer({ priority: 10, name: '顶', visible: false }),
        ])
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('中')
    })
})

describe('子层根祖先基准（不下钻表格）', () => {
    const makeTableSession = (): EditorSession =>
        makeCycleSession([
            textLayer({ priority: 30, name: '底' }),
            tableLayer([rowLayer([cellLayer(textLayer({ name: '格内容' }))])], { priority: 20, name: '表' }),
            textLayer({ priority: 10, name: '顶' }),
        ])

    it('选中表格格内容：Tab/⇧Tab 取根祖先（表）的相邻根层', () => {
        const session = makeTableSession()
        session.setSelection(['layers', 1, 'rows', 0, 'cells', 0, 'content'])
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('底') // 表（面板 1）的下一面板行 = 底
        session.setSelection(['layers', 1, 'rows', 0, 'cells', 0, 'content'])
        expect(session.selectPrevLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶') // 表的上一面板行 = 顶
    })

    it('循环全程只落根路径：连按一整圈回到表的根路径，无 rows/cells/content 身份', () => {
        const session = makeTableSession()
        session.setSelection(['layers', 1, 'rows', 0, 'cells', 0, 'content'])
        session.selectNextLayer() // 底
        session.selectNextLayer() // 顶
        session.selectNextLayer() // 表
        expect(session.store.ui.selection).toEqual(['layers', 1])
        expect(selectedRootName(session)).toBe('表')
    })
})

describe('全部隐藏空转', () => {
    it('全部根层隐藏：两方向 false、选中不动（含已有选中）', () => {
        const session = makeCycleSession([
            textLayer({ priority: 20, name: '甲', visible: false }),
            textLayer({ priority: 10, name: '乙', visible: false }),
        ])
        expect(session.selectNextLayer()).toBe(false)
        expect(session.selectPrevLayer()).toBe(false)
        expect(session.store.ui.selection).toBeNull()

        session.setSelection(['layers', 0])
        expect(session.selectNextLayer()).toBe(false)
        expect(session.selectPrevLayer()).toBe(false)
        expect(selectedRootName(session)).toBe('甲') // 选中不动
    })

    it('无文档 / 空画布空转', () => {
        const noDoc = new EditorSession({ scheduleFrame: nullScheduler })
        expect(noDoc.selectNextLayer()).toBe(false)
        expect(noDoc.selectPrevLayer()).toBe(false)
        const blank = makeCycleSession([])
        expect(blank.selectNextLayer()).toBe(false)
        expect(blank.selectPrevLayer()).toBe(false)
    })
})

describe('不进历史（选中变更走 setSelection，undo 不回退选中）', () => {
    it('连续循环零历史步', () => {
        const session = makeThreeSession()
        session.selectNextLayer()
        session.selectNextLayer()
        session.selectPrevLayer()
        expect(session.store.history).toHaveLength(0)
        expect(session.canUndo).toBe(false)
    })

    it('undo 只回退文档不回退选中：nudge 后循环选中，undo 后选中保持', () => {
        const session = makeThreeSession()
        session.setSelection(['layers', 0])
        session.nudge(5, 0) // 一步文档历史
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
        session.undo()
        expect(session.store.doc!.layers[0]!.position.x).toBe(0) // 文档回退
        expect(selectedRootName(session)).toBe('顶') // 选中不被 undo 回退
    })
})

describe('锁定跳过（isLocked 谓词收口，layer-lock 已合入随谓词生效）', () => {
    it('锁定根层整跳：巡检绕开锁定层，解锁后回归（关闭态回归测试）', () => {
        const session = makeThreeSession()
        session.toggleLayerLock(['layers', 1]) // 锁「中」
        session.selectNextLayer() // 顶
        session.selectNextLayer()
        expect(selectedRootName(session)).toBe('底') // 中锁定整跳
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('顶') // wrap 同样绕开
        session.toggleLayerLock(['layers', 1]) // 解锁
        session.selectNextLayer()
        expect(selectedRootName(session)).toBe('中') // 解锁后回归可达
    })

    it('空选起点层被锁定：落到下一未锁层', () => {
        const session = makeThreeSession()
        session.toggleLayerLock(['layers', 2]) // 锁「顶」（视觉最上层）
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('中')
    })
})

describe('单根层 wrap 自身无害', () => {
    it('唯一根层：wrap 回自身，值等短路零通知、零历史步', () => {
        const session = makeCycleSession([textLayer({ priority: 10, name: '独苗' })])
        const selectionNotifications: number[] = []
        session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'selection') selectionNotifications.push(1)
        })
        expect(session.selectNextLayer()).toBe(true)
        expect(selectedRootName(session)).toBe('独苗')
        expect(session.selectNextLayer()).toBe(true) // wrap 自身
        expect(selectedRootName(session)).toBe('独苗')
        expect(selectionNotifications).toHaveLength(1) // 第二次值等短路不通知（无害）
        expect(session.store.history).toHaveLength(0)
    })
})

describe('注册表 2 条目与 dispatcher 2 case（kbd-nav 工单 03）', () => {
    it('executeShortcut 分派循环选层；全部隐藏为 false', () => {
        const session = makeThreeSession()
        expect(session.executeShortcut('selectNextLayer')).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
        expect(session.executeShortcut('selectNextLayer')).toBe(true)
        expect(selectedRootName(session)).toBe('中')
        expect(session.executeShortcut('selectPrevLayer')).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
        expect(session.executeShortcut('selectPrevLayer')).toBe(true)
        expect(selectedRootName(session)).toBe('底') // wrap

        const hidden = makeCycleSession([
            textLayer({ priority: 20, name: '甲', visible: false }),
            textLayer({ priority: 10, name: '乙', visible: false }),
        ])
        expect(hidden.executeShortcut('selectNextLayer')).toBe(false)
        expect(hidden.executeShortcut('selectPrevLayer')).toBe(false)
    })

    it('端到端：Tab 分类为 selectNextLayer 并经分派面移动选中', () => {
        const session = makeThreeSession()
        const action = classifyEditorShortcut(input({ key: 'Tab', shift: false }))
        expect(action).toBe('selectNextLayer')
        expect(session.executeShortcut(action!)).toBe(true)
        expect(selectedRootName(session)).toBe('顶')
        const prev = classifyEditorShortcut(input({ key: 'Tab', shift: true }))
        expect(prev).toBe('selectPrevLayer')
    })

    it('分类：Tab → selectNextLayer、⇧Tab → selectPrevLayer（shift 精确匹配先例）', () => {
        expect(classifyEditorShortcut(input({ key: 'Tab', shift: false }))).toBe('selectNextLayer')
        expect(classifyEditorShortcut(input({ key: 'Tab', shift: true }))).toBe('selectPrevLayer')
        expect(classifyEditorShortcut(input({ key: 'Tab', shift: true }))).not.toBe('selectNextLayer')
        expect(classifyEditorShortcut(input({ key: 'Tab', shift: false }))).not.toBe('selectPrevLayer')
    })

    it('mod/alt 修饰不入表（⌘Tab/⌥Tab 浏览器与系统既有语义不抢）', () => {
        expect(classifyEditorShortcut(input({ key: 'Tab', mod: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Tab', alt: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'Tab', mod: true, shift: true }))).toBeNull()
    })

    it('分类器既有守卫天然让路：editableTarget/editing/composing 中 Tab 不被劫持', () => {
        expect(classifyEditorShortcut(input({ editableTarget: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ editing: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ composing: true }))).toBeNull()
    })

    it('条目元数据：label「循环选下一层/循环选上一层」+ group layer（对外命名只用「循环选层」）', () => {
        const labelsOf = (action: EditorShortcutAction): string[] =>
            DEFAULT_EDITOR_SHORTCUTS.filter((binding) => binding.action === action).map((binding) => binding.label)
        expect(labelsOf('selectNextLayer')).toEqual(['循环选下一层'])
        expect(labelsOf('selectPrevLayer')).toEqual(['循环选上一层'])
        for (const action of ['selectNextLayer', 'selectPrevLayer'] as const) {
            for (const binding of DEFAULT_EDITOR_SHORTCUTS.filter((entry) => entry.action === action)) {
                expect(binding.group).toBe('layer')
                for (const forbidden of ['遍历', '焦点', '顺序选择']) {
                    expect(binding.label.includes(forbidden)).toBe(false)
                }
            }
        }
    })

    it('无文档经分派面空转为 false（可用态口径）', () => {
        const noDoc = new EditorSession({ scheduleFrame: nullScheduler })
        expect(noDoc.executeShortcut('selectNextLayer')).toBe(false)
        expect(noDoc.executeShortcut('selectPrevLayer')).toBe(false)
    })
})
