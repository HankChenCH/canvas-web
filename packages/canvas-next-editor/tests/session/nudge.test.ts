/**
 * 方向键微调（kbd-nav 工单 02）：
 * - nudge(deltaX, deltaY)：选中层 position 按场景增量位移，作用面与拖动同门
 *   （选中什么微调什么，位置写法与 dragTo 同一语义，拖不动的空转）；
 * - 基础步 1 场景 px、Shift 大步 10 px 固定（注册表 8 条目归并到同一实现）；
 * - 不吸附（纯定量位移，不调 resolveSnap）——吸附是拖动过程的连续行为
 *   （CONTEXT.md「微调」词条边界）；
 * - 连续微调合并一条历史（mergeKey 含选中层路径、方向无关）：undo 一次回连按前；
 *   换层换步、undo/redo 走 store 既有断开规则；
 * - 守卫：无选中空转；锁定（含子树路径）空转——layer-lock 工单 01 的挂账兑现
 *   （isLocked 谓词已合入，接入同一谓词）。
 */
import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    DEFAULT_EDITOR_SHORTCUTS,
    classifyEditorShortcut,
    type EditorShortcutAction,
    type EditorShortcutInput,
} from '../../src/session/shortcuts'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

/**
 * 双层画布：index 0 是吸附源（盒 100,100 起）、index 1 是受微调层（盒 95,0 起
 * ——右缘距源层左缘 100 为 5，在拖动吸附阈值 6 内，供「纯位移不吸附」对照）。
 */
const makePairSession = (): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({
        width: 800,
        height: 600,
        layers: [
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 95, y: 0 } }),
        ],
    })
    return session
}

const input = (overrides: Partial<EditorShortcutInput> = {}): EditorShortcutInput => ({
    key: 'ArrowUp',
    mod: false,
    shift: false,
    composing: false,
    editing: false,
    editableTarget: false,
    ...overrides,
})

describe('nudge：方向与步长（位置写法与 dragTo 同门）', () => {
    it('四方向基础步 ±1：nudge(deltaX, deltaY) 增量原样落到 position', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        expect(session.nudge(1, 0)).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 96, y: 0 })
        expect(session.nudge(-1, 0)).toBe(true)
        expect(session.nudge(0, 1)).toBe(true)
        expect(session.nudge(0, -1)).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 0 })
    })

    it('executeShortcut 八动作归并同一实现：方向 ×±1、大步 ×±10', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        expect(session.executeShortcut('nudgeRight')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 96, y: 0 })
        expect(session.executeShortcut('nudgeLeft')).toBe(true)
        expect(session.executeShortcut('nudgeDown')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 1 })
        expect(session.executeShortcut('nudgeUp')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 0 })

        expect(session.executeShortcut('nudgeRightCoarse')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 105, y: 0 })
        expect(session.executeShortcut('nudgeLeftCoarse')).toBe(true)
        expect(session.executeShortcut('nudgeDownCoarse')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 10 })
        expect(session.executeShortcut('nudgeUpCoarse')).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 0 })
    })

    it('端到端：⇧+→ 分类为大步右移并经分派面位移 10px', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        const action = classifyEditorShortcut(input({ key: 'ArrowRight', shift: true }))
        expect(action).toBe('nudgeRightCoarse')
        expect(session.executeShortcut(action!)).toBe(true)
        expect(session.store.doc!.layers[1]!.position.x).toBe(105)
    })
})

describe('nudge：合并历史（连按一条，undo 一次回连按前）', () => {
    it('连按跨方向合并一步：undo 一次回连按前，redo 复原整串', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        session.nudge(1, 0)
        session.nudge(1, 0)
        session.nudge(0, 1) // mergeKey 方向无关：同层继续并步
        expect(session.store.history).toHaveLength(1)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 97, y: 1 })

        session.undo()
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 95, y: 0 })
        expect(session.store.canRedo).toBe(true)

        session.redo()
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 97, y: 1 })
    })

    it('换层断开：mergeKey 含选中层路径，各层各成一步，undo 只回退当层', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        session.nudge(1, 0)
        session.nudge(1, 0)
        session.setSelection(['layers', 0])
        session.nudge(1, 0)
        expect(session.store.history).toHaveLength(2)

        session.undo() // 只回退 index 0 的一步，index 1 的连按串保留
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 100, y: 100 })
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 97, y: 0 })
    })

    it('undo 断开：撤销后再微调另起一步（redo 分支按 Figma 语义弃用）', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        session.nudge(1, 0)
        session.undo()
        session.nudge(1, 0)
        expect(session.store.history).toHaveLength(1)
        expect(session.store.canRedo).toBe(false)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 96, y: 0 })
    })
})

describe('nudge：守卫空转', () => {
    it('无选中空转：nudge 与 executeShortcut 均 false、零历史步、文档引用不动', () => {
        const session = makePairSession()
        const before = session.store.doc
        expect(session.nudge(1, 0)).toBe(false)
        expect(session.executeShortcut('nudgeUp')).toBe(false)
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('锁定空转：锁定根层不位移；解锁后恢复（isLocked 谓词接入，layer-lock 挂账兑现）', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        session.toggleLayerLock(['layers', 1])
        const before = session.store.doc
        expect(session.nudge(1, 0)).toBe(false)
        expect(session.executeShortcut('nudgeUpCoarse')).toBe(false)
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)

        session.toggleLayerLock(['layers', 1])
        expect(session.nudge(1, 0)).toBe(true)
        expect(session.store.doc!.layers[1]!.position.x).toBe(96)
    })

    it('锁定子树路径同锁：选中锁定表的格内容路径亦空转（前缀判定同门）', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1, 'rows', 0])
        session.toggleLayerLock(['layers', 1])
        expect(session.nudge(1, 0)).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })

    it('悬空选择空转（拖不动的同门）：路径不可解析不产生事务', () => {
        const session = makePairSession()
        session.setSelection(['layers', 9])
        expect(session.nudge(1, 0)).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })

    it('拖动会话进行中空转：微调不插入事务打断开放的 drag 合并步（一次拖动 = 一步历史）', () => {
        const session = makePairSession()
        session.setSelection(['layers', 1])
        expect(session.beginDrag(['layers', 1], 95, 0)).toBe(true)
        session.dragTo(96, 0)
        expect(session.store.history).toHaveLength(1) // 拖动合并步已开放

        expect(session.nudge(1, 0)).toBe(false)
        expect(session.executeShortcut('nudgeUp')).toBe(false)
        // 微调零插入：历史仍是唯一一步 drag（若不守卫，nudge 步会插队拆分 drag 合并）
        expect(session.store.history).toHaveLength(1)
        expect(session.store.history[0]!.mergeKey).toBe('drag')

        session.endDrag()
        expect(session.store.history).toHaveLength(1) // drag 合并步完整未被拆分
    })
})

describe('nudge：纯位移（不吸附，CONTEXT「微调」词条边界）', () => {
    it('落进拖动吸附阈值的位移照直生效：不调 resolveSnap、无命中轴回显', () => {
        const session = makePairSession()
        // 对照：同一几何走拖动会吸——dragSnap 先例（暂定缘距源缘 4 < 阈值 6 → 修正到 100）
        session.beginDrag(['layers', 1], 95, 0)
        session.dragTo(96, 0)
        expect(session.store.doc!.layers[1]!.position.x).toBe(100)
        session.endDrag()
        session.undo() // 复位到 95

        // 微调同几何不吸：95 + 1 = 96 照直落（拖动同点位会修正到 100）
        session.setSelection(['layers', 1])
        expect(session.nudge(1, 0)).toBe(true)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 96, y: 0 })
        expect(session.listSnapAxes()).toEqual([])
    })
})

describe('注册表 8 条目（kbd-nav 工单 02）：方向键 ×步长', () => {
    it('裸方向键 → 基础步四向；⇧+方向键 → 大步四向（shift 精确匹配）', () => {
        expect(classifyEditorShortcut(input({ key: 'ArrowUp', shift: false }))).toBe('nudgeUp')
        expect(classifyEditorShortcut(input({ key: 'ArrowDown', shift: false }))).toBe('nudgeDown')
        expect(classifyEditorShortcut(input({ key: 'ArrowLeft', shift: false }))).toBe('nudgeLeft')
        expect(classifyEditorShortcut(input({ key: 'ArrowRight', shift: false }))).toBe('nudgeRight')
        expect(classifyEditorShortcut(input({ key: 'ArrowUp', shift: true }))).toBe('nudgeUpCoarse')
        expect(classifyEditorShortcut(input({ key: 'ArrowDown', shift: true }))).toBe('nudgeDownCoarse')
        expect(classifyEditorShortcut(input({ key: 'ArrowLeft', shift: true }))).toBe('nudgeLeftCoarse')
        expect(classifyEditorShortcut(input({ key: 'ArrowRight', shift: true }))).toBe('nudgeRightCoarse')
        // shift 精确匹配先例（undo/redo 同款）：⇧+方向不落基础条目、裸方向不落大步条目
        expect(classifyEditorShortcut(input({ key: 'ArrowUp', shift: true }))).not.toBe('nudgeUp')
        expect(classifyEditorShortcut(input({ key: 'ArrowUp', shift: false }))).not.toBe('nudgeUpCoarse')
        // mod/alt 修饰不入表：⌘←/→（浏览器历史导航）与 ⌥+方向既有语义不抢
        expect(classifyEditorShortcut(input({ key: 'ArrowLeft', mod: true }))).toBeNull()
        expect(classifyEditorShortcut(input({ key: 'ArrowLeft', alt: true }))).toBeNull()
    })

    it('八条目 label：基础步用「微调」、大步用「大步」，不造新词', () => {
        const labelsOf = (action: EditorShortcutAction): string[] =>
            DEFAULT_EDITOR_SHORTCUTS.filter((binding) => binding.action === action).map((binding) => binding.label)
        expect(labelsOf('nudgeUp')).toEqual(['微调上移'])
        expect(labelsOf('nudgeDown')).toEqual(['微调下移'])
        expect(labelsOf('nudgeLeft')).toEqual(['微调左移'])
        expect(labelsOf('nudgeRight')).toEqual(['微调右移'])
        expect(labelsOf('nudgeUpCoarse')).toEqual(['大步上移'])
        expect(labelsOf('nudgeDownCoarse')).toEqual(['大步下移'])
        expect(labelsOf('nudgeLeftCoarse')).toEqual(['大步左移'])
        expect(labelsOf('nudgeRightCoarse')).toEqual(['大步右移'])
    })

    it('无选中时分类仍命中但不产生事务（分类与会话态解耦）', () => {
        const session = makePairSession()
        const action = classifyEditorShortcut(input({ key: 'ArrowUp', shift: false }))
        expect(action).toBe('nudgeUp')
        expect(session.executeShortcut(action!)).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })
})
