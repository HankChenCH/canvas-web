/**
 * 锁定图层（canvas-web-layer-lock 工单 01）：会话级锁定态与 guard 面。
 *
 * - EditorUi.lockedPaths ui 分支：只读路径集合，openDocument 重置、永不进历史；
 * - toggleLayerLock：双向翻转、仅根层、非根/悬空空转、ui 变更零历史步；
 * - isLocked 谓词收口（isLockedPath 纯函数 + EditorSession.isLocked 读取口），
 *   防各处手写路径比对；
 * - guard 现有入口：beginDrag 手势起点、deleteLayer 空转（方向键微调尚未实现，
 *   kbd-nav 工单 02 建动作时接入同一谓词；缩放手势待 resize feature）；放行面
 *   （属性提交/duplicate/显隐/改名/z 序/文本编辑面板通道）不加 guard；
 * - hitTest 锁定过滤经 EditorSession.hitTest 一条缝（selectAt/hoverAt 同源）；
 * - remap/prune：锁「胶在层上」走过 splice 平移、跨容器移动不误伤、undo 跨
 *   结构步悬空解锁（已知限制：只有 prune 无平移，spec §3 记档不修）。
 */
import { describe, expect, it, vi } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { EditorStore } from '../../src/session/store'
import { isLockedPath, type LayerPath } from '../../src/shared/layerPath'
import { cellLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: Parameters<EditorSession['openDocument']>[0]['layers']) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers })
    return session
}

/** 双层画布：底层 (0,0) 100×50，顶层 (50,0) 100×50，重叠区 (50..100) */
const twoLayerSession = () =>
    makeSession([
        textLayer({ name: '底', position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 50 } }),
        textLayer({ name: '顶', position: { anchor: 'top-left', x: 50, y: 0 }, shape: { width: 100, height: 50 } }),
    ])

describe('EditorUi.lockedPaths 分支（store 直测）', () => {
    it('初始为空集合；setLockedPaths 替换并以 {scope: ui, branch: lockedPaths} 通知', () => {
        const store = new EditorStore()
        expect(store.ui.lockedPaths).toEqual([])

        const changes: unknown[] = []
        store.subscribe((c) => changes.push(c))
        const locked: readonly LayerPath[] = [['layers', 1]]
        store.setLockedPaths(locked)

        expect(store.ui.lockedPaths).toEqual([['layers', 1]])
        expect(changes).toEqual([{ scope: 'ui', branch: 'lockedPaths' }])
    })

    it('内容等短路：相同集合（新引用）不重复通知', () => {
        const store = new EditorStore()
        store.setLockedPaths([['layers', 0]])
        const listener = vi.fn()
        store.subscribe(listener)

        store.setLockedPaths([['layers', 0]])
        expect(listener).not.toHaveBeenCalled()
    })

    it('openDocument 重置（锁定是文档内容防护，跨文档路径悬空会误锁他人——guides 同门）', () => {
        const store = new EditorStore()
        store.openDocument({ width: 100, height: 80, layers: [] })
        store.setLockedPaths([['layers', 0], ['layers', 1]])

        store.openDocument({ width: 100, height: 80, layers: [] })
        expect(store.ui.lockedPaths).toEqual([])
    })

    it('不进历史：加锁/解锁零 undo 步（红线 3 同门）', () => {
        const store = new EditorStore()
        store.openDocument({ width: 100, height: 80, layers: [] })
        store.setLockedPaths([['layers', 0]])
        store.setLockedPaths([])
        expect(store.history).toHaveLength(0)
    })
})

describe('toggleLayerLock：翻转与空转', () => {
    it('双向翻转：未锁 → 入集合，已锁 → 出集合；全程零历史步', () => {
        const session = twoLayerSession()

        session.toggleLayerLock(['layers', 1])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
        expect(session.isLocked(['layers', 1])).toBe(true)
        expect(session.store.history).toHaveLength(0)

        session.toggleLayerLock(['layers', 1])
        expect(session.store.ui.lockedPaths).toEqual([])
        expect(session.isLocked(['layers', 1])).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })

    it('多路径集合并存；翻不存在的锁只解除不新增（空转无副作用）', () => {
        const session = twoLayerSession()

        session.toggleLayerLock(['layers', 0])
        session.toggleLayerLock(['layers', 1])
        expect(session.store.ui.lockedPaths).toHaveLength(2)

        session.toggleLayerLock(['layers', 0])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
    })

    it('仅根层：行/格/内容路径空转（锁定语义只在 LayerBase 面，与显隐同门）', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
            textLayer({ priority: 10 }),
        ])

        session.toggleLayerLock(['layers', 0, 'rows', 0])
        session.toggleLayerLock(['layers', 0, 'rows', 0, 'cells', 0])
        session.toggleLayerLock(['layers', 0, 'rows', 0, 'cells', 0, 'content'])

        expect(session.store.ui.lockedPaths).toEqual([])
        expect(session.store.history).toHaveLength(0)
    })

    it('悬空路径空转：越界下标与文档未打开不抛错、集合不动', () => {
        const session = twoLayerSession()

        session.toggleLayerLock(['layers', 9])
        expect(session.store.ui.lockedPaths).toEqual([])

        const empty = new EditorSession({ scheduleFrame: nullScheduler })
        expect(() => empty.toggleLayerLock(['layers', 0])).not.toThrow()
        expect(empty.store.ui.lockedPaths).toEqual([])
    })

    it('ui 通知面：翻转以 {scope: ui, branch: lockedPaths} 通知（gizmo/面板投影订阅源）', () => {
        const session = twoLayerSession()
        const changes: unknown[] = []
        session.subscribe((c) => changes.push(c))

        session.toggleLayerLock(['layers', 0])
        expect(changes).toEqual([{ scope: 'ui', branch: 'lockedPaths' }])
    })
})

describe('isLocked 谓词收口', () => {
    it('纯函数前缀判定：锁定根路径 → 子树路径全锁定；非前缀路径不受影响', () => {
        expect(isLockedPath(['layers', 1], [['layers', 1]])).toBe(true)
        expect(isLockedPath(['layers', 1, 'rows', 0, 'cells', 0], [['layers', 1]])).toBe(true)
        expect(isLockedPath(['layers', 1, 'rows', 0, 'cells', 0, 'content'], [['layers', 1]])).toBe(true)
        expect(isLockedPath(['layers', 0], [['layers', 1]])).toBe(false)
        expect(isLockedPath(['layers', 1], [])).toBe(false)
    })

    it('session 谓词：null 选择为 false，翻转随集合联动', () => {
        const session = twoLayerSession()

        expect(session.isLocked(null)).toBe(false)
        expect(session.isLocked(['layers', 0])).toBe(false)

        session.toggleLayerLock(['layers', 0])
        expect(session.isLocked(['layers', 0])).toBe(true)
        session.toggleLayerLock(['layers', 0])
        expect(session.isLocked(['layers', 0])).toBe(false)
    })
})

describe('guard：拖动起点与删除空转', () => {
    it('beginDrag 锁定层返回 false：无 drag 会话、无历史步；解锁后恢复', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1])

        expect(session.beginDrag(['layers', 1], 75, 25)).toBe(false)
        expect(session.store.ui.drag).toBeNull()
        expect(session.store.history).toHaveLength(0)

        session.toggleLayerLock(['layers', 1])
        expect(session.beginDrag(['layers', 1], 75, 25)).toBe(true)
        expect(session.store.ui.drag).not.toBeNull()
    })

    it('beginDrag 锁定表的格内容路径同样拒绝（前缀 guard，画布手势起点收口）', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
        ])
        session.toggleLayerLock(['layers', 0])

        expect(session.beginDrag(['layers', 0, 'rows', 0, 'cells', 0, 'content'], 10, 10)).toBe(false)
        expect(session.store.ui.drag).toBeNull()
    })

    it('deleteLayer 锁定根层空转：文档引用不变、无历史步、层仍在', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1])
        const before = session.store.doc

        session.deleteLayer(['layers', 1])

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers).toHaveLength(2)
    })

    it('deleteLayer 锁定表的行/格路径同样空转（子树同锁）', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
        ])
        session.toggleLayerLock(['layers', 0])
        const before = session.store.doc

        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 0])
        session.deleteLayer(['layers', 0, 'rows', 0])

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('Delete 快捷键通道同受 guard（内核空转为权威）', () => {
        const session = twoLayerSession()
        session.setSelection(['layers', 1])
        session.toggleLayerLock(['layers', 1])
        const before = session.store.doc

        session.executeShortcut('delete')

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('guard 放行面：刻意通道不受限', () => {
    it('属性提交管线放行：锁定层 position/text 照常可写（含 x/y）', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1])

        session.updateSpec(['layers', 1], ['position', 'x'], 123)
        expect(session.store.doc!.layers[1]!.position.x).toBe(123)
        expect(session.store.history).toHaveLength(1)

        session.updateData(['layers', 1], '新文本')
        const layer = session.store.doc!.layers[1]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('新文本')
        expect(session.store.history).toHaveLength(2)
    })

    it('duplicateSelection 放行且副本无锁：lockedPaths 原样（副本新路径天然无锁）', () => {
        const session = twoLayerSession()
        session.setSelection(['layers', 1])
        session.toggleLayerLock(['layers', 1])

        const copy = session.duplicateSelection()

        expect(copy).toEqual(['layers', 2])
        expect(session.store.history).toHaveLength(1)
        // 锁集合不动：仍只锁原层（index 1），副本 index 2 天然无锁
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
        expect(session.isLocked(['layers', 1])).toBe(true)
        expect(session.isLocked(['layers', 2])).toBe(false)
    })

    it('显隐/改名放行：锁定不挡 LayerBase 面的刻意通道', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 0])

        session.toggleLayerVisibility(['layers', 0])
        expect(session.store.doc!.layers[0]!.visible).toBe(false)

        session.renameLayer(['layers', 0], '改名了')
        expect(session.store.doc!.layers[0]!.name).toBe('改名了')
        expect(session.store.history).toHaveLength(2)
    })

    it('z 序放行且锁胶住原层：moveRootLayer 平移后锁随层走到新下标', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1]) // 锁「顶」

        // 面板坐标 0 = 视觉最上 = 数组尾；移到面板 2（视觉垫底）= 数组头
        session.moveRootLayer(0, 2)

        const movedTo = session.store.doc!.layers.findIndex(
            (l) => l.type === 'TextLayer' && l.name === '顶',
        )
        expect(movedTo).toBe(0)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
        expect(session.isLocked(['layers', 0])).toBe(true)
        expect(session.isLocked(['layers', 1])).toBe(false)
    })

    it('文本编辑面板通道放行：锁定文本层可进入编辑会话（画布双击已被 hitTest 挡住）', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1])

        expect(session.beginTextEdit(['layers', 1])).toBe(true)
    })
})

describe('hitTest 一条缝（session 级）：locked 集合经 EditorSession.hitTest 传入', () => {
    it('锁定层退出命中面：hitTest/hoverAt/selectAt 同源，解锁恢复', () => {
        const session = twoLayerSession()
        // 未锁：重叠区命中顶层
        expect(session.hitTest(75, 25)).toEqual(['layers', 1])

        session.toggleLayerLock(['layers', 1])
        expect(session.hitTest(75, 25)).toEqual(['layers', 0]) // 重叠区穿透下方层
        expect(session.hitTest(120, 25)).toBeNull() // 仅锁定层覆盖处无命中

        session.hoverAt(120, 25)
        expect(session.store.ui.hovered).toBeNull() // 锁定层无 hover 高亮
        session.hoverAt(75, 25)
        expect(session.store.ui.hovered).toEqual(['layers', 0]) // 穿透到下方层

        session.setSelection(['layers', 1]) // 面板选中仍可（刻意通道）
        expect(session.selectAt(75, 25)).toEqual(['layers', 0])

        session.toggleLayerLock(['layers', 1])
        expect(session.hitTest(75, 25)).toEqual(['layers', 1])
    })
})

describe('remap：锁胶在层上走过结构变更', () => {
    it('兄弟删除平移：锁仍指原层（下标随 splice 收缩）', () => {
        const session = twoLayerSession()
        session.toggleLayerLock(['layers', 1])

        session.deleteLayer(['layers', 0])

        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
        expect(session.isLocked(['layers', 0])).toBe(true)
    })

    it('跨容器格移动不误伤：锁定的表路径不受 rows/cells splice 影响', () => {
        const session = makeSession([
            tableLayer(
                [rowLayer([cellLayer(textLayer({ text: '甲' })), cellLayer(textLayer({ text: '乙' }))])],
                { priority: 20, position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 600, height: 90 } },
            ),
            tableLayer(
                [rowLayer([cellLayer(textLayer({ text: '丙' }))])],
                { priority: 10, position: { anchor: 'top-left', x: 0, y: 200 }, shape: { width: 300, height: 90 } },
            ),
        ])
        session.toggleLayerLock(['layers', 0])

        // 表 0 行 0 格 0 → 表 1 行 0（insert-before 原始序号 0）
        session.moveTableCellToRow(['layers', 0, 'rows', 0, 'cells', 0], ['layers', 1, 'rows', 0], 0)

        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
        expect(session.isLocked(['layers', 0])).toBe(true)
    })

    it('undo 跨结构步悬空解锁：锁定层被撤销删除后锁清空（prune 语义）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.addRootLayer('TextLayer') // 新层 index 1
        session.toggleLayerLock(['layers', 1])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])

        session.undo() // 撤销新增：index 1 悬空

        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.ui.lockedPaths).toEqual([])
    })

    it('已知限制（spec §3 记档不修）：undo 跨结构步只有 prune 无平移，锁可能错位', () => {
        const session = makeSession([
            textLayer({ name: 'A', priority: 30 }),
            textLayer({ name: 'B', priority: 20 }),
            textLayer({ name: 'C', priority: 10 }),
        ])
        session.toggleLayerLock(['layers', 2]) // 锁 C
        session.deleteLayer(['layers', 0]) // 删 A：锁平移到 index 1（C），正确胶住
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])

        session.undo() // 撤销删除：A 回来了，index 1 现在是 B——锁错位

        // prune 无法察觉（['layers', 1] 仍可解析）：错位保留，锁定钮常显可目视纠正
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
        const mispointed = session.store.doc!.layers[1]!
        expect(mispointed.type === 'TextLayer' && mispointed.name).toBe('B')
    })
})
