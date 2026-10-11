/**
 * 编辑器状态导出与恢复（project-data 工单 01，spec §5）：
 * - 内核以 EditorSession 实例方法承载「单画布切片 + 偏好 + 版本常量」——内核
 *   帧盲，frames 容器（帧名 → 切片）归宿主拼装；
 * - exportEditorState / getEditorPrefs + applyEditorPrefs / restoreEditorState /
 *   openDocument 可选参的「开了就恢复」原子应用；
 * - restore 轻结构校验（形状不合法整体拒）→ 悬空锁路径 prune（合法但内容悬空
 *   不算拒）→ guide id 重排（防与新会话 guideIdSeq 撞号致 removeGuide 误删）；
 * - 同门红线（addGuide/toggleLayerLock 同族）：ui 分支写、不进历史、不写 graph。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas'

import { EDITOR_STATE_SCHEMA_VERSION as BARREL_SCHEMA_VERSION } from '../../src/index'
import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    EDITOR_STATE_SCHEMA_VERSION,
    type CanvasEditorState,
} from '../../src/session/editorState'
import type { EditorChange } from '../../src/session/store'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const doc = (): Canvas => ({
    width: 800,
    height: 600,
    layers: [
        textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
        textLayer({ priority: 10, position: { anchor: 'top-left', x: 300, y: 200 } }),
    ],
})

const makeSession = (): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(doc())
    return session
}

/** 带既有切片的会话（一条参考线 + 一把锁）：校验拒用例的「整体不动」基准 */
const seededSession = (): EditorSession => {
    const session = makeSession()
    session.addGuide({ orientation: 'vertical', position: 205 })
    session.toggleLayerLock(['layers', 1])
    return session
}

describe('内核导出（barrel 单出口）', () => {
    it('EDITOR_STATE_SCHEMA_VERSION = 1，根 barrel 与模块同值', () => {
        expect(EDITOR_STATE_SCHEMA_VERSION).toBe(1)
        expect(BARREL_SCHEMA_VERSION).toBe(1)
    })
})

describe('exportEditorState：当前画布切片', () => {
    it('guides 原样带出（id 会话内自增值）、lockedPaths 原样', () => {
        const session = seededSession()
        const state = session.exportEditorState()
        expect(state.guides).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
        expect(state.lockedPaths).toEqual([['layers', 1]])
    })

    it('无文档也可导出（ui 分支自成事实，与 addGuide 无 doc 守卫同门）', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        session.addGuide({ orientation: 'horizontal', position: 42 })
        const state = session.exportEditorState()
        expect(state.guides).toHaveLength(1)
        expect(state.lockedPaths).toEqual([])
    })

    it('导出的是切片不是聚合：只有 guides/lockedPaths 两键——版本常量与 frames 容器归宿主', () => {
        const session = makeSession()
        expect(Object.keys(session.exportEditorState()).sort()).toEqual(['guides', 'lockedPaths'])
    })

    it('导出零历史步、doc 引用不动（ui 分支只读）', () => {
        const session = seededSession()
        const before = session.store.doc
        session.exportEditorState()
        expect(session.canUndo).toBe(false)
        expect(session.store.doc).toBe(before)
    })
})

describe('prefs 读写成对（getEditorPrefs / applyEditorPrefs）', () => {
    it('缺省偏好：标尺常显、锚点区收起', () => {
        expect(makeSession().getEditorPrefs()).toEqual({ rulersVisible: true, anchorExpanded: false })
    })

    it('整体替换：会话内翻转态被写入值覆盖', () => {
        const session = makeSession()
        session.toggleRulers() // → false
        session.store.setAnchorExpanded(true)
        session.applyEditorPrefs({ rulersVisible: true, anchorExpanded: false })
        expect(session.getEditorPrefs()).toEqual({ rulersVisible: true, anchorExpanded: false })
    })

    it('写偏好不进历史、不写 graph（同门红线）', () => {
        const session = makeSession()
        const before = session.store.doc
        session.applyEditorPrefs({ rulersVisible: false, anchorExpanded: true })
        expect(session.getEditorPrefs()).toEqual({ rulersVisible: false, anchorExpanded: true })
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc).toBe(before)
    })

    it('openDocument 换文档偏好保留（内核自持，prefs 不随切帧重放）', () => {
        const session = makeSession()
        session.applyEditorPrefs({ rulersVisible: false, anchorExpanded: true })
        session.openDocument(doc())
        expect(session.getEditorPrefs()).toEqual({ rulersVisible: false, anchorExpanded: true })
    })
})

describe('restoreEditorState：轻结构校验拒（形状不合法整体拒）', () => {
    it('非对象载荷整体拒：null/原始值/数组返 false', () => {
        const session = seededSession()
        for (const bad of [null, undefined, 'x', 42, true, []]) {
            expect(session.restoreEditorState(bad as unknown as CanvasEditorState)).toBe(false)
        }
        expect(session.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
    })

    it('载荷键缺一或非数组整体拒：guides/lockedPaths 两键缺一不可', () => {
        const session = seededSession()
        const bads: unknown[] = [
            { lockedPaths: [] },
            { guides: [] },
            { guides: {}, lockedPaths: [] },
            { guides: [], lockedPaths: 'x' },
            { guides: [], lockedPaths: null },
        ]
        for (const bad of bads) {
            expect(session.restoreEditorState(bad as CanvasEditorState)).toBe(false)
        }
        expect(session.listGuides()).toHaveLength(1)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
    })

    it('guide 条目形状不合法整体拒：非对象 / 未知取向 / 坐标缺省或非有限数', () => {
        const session = seededSession()
        const bads: unknown[] = [
            { guides: [null], lockedPaths: [] },
            { guides: [7], lockedPaths: [] },
            { guides: [{ orientation: 'diagonal', position: 5 }], lockedPaths: [] },
            { guides: [{ position: 5 }], lockedPaths: [] },
            { guides: [{ orientation: 'vertical' }], lockedPaths: [] },
            { guides: [{ orientation: 'vertical', position: '5' }], lockedPaths: [] },
            { guides: [{ orientation: 'vertical', position: Number.NaN }], lockedPaths: [] },
            { guides: [{ orientation: 'vertical', position: Number.POSITIVE_INFINITY }], lockedPaths: [] },
        ]
        for (const bad of bads) {
            expect(session.restoreEditorState(bad as CanvasEditorState)).toBe(false)
        }
        expect(session.listGuides()).toHaveLength(1)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
    })

    it('锁定路径条目非数组整体拒（外壳校验层）；内容可解析性归 prune 不在此拒', () => {
        const session = seededSession()
        expect(
            session.restoreEditorState({
                guides: [],
                lockedPaths: [['layers', 0], 'layers-1'] as unknown as CanvasEditorState['lockedPaths'],
            }),
        ).toBe(false)
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
    })

    it('宽容读：未知键忽略、guide id 缺省可恢复（快照 id 无持久语义）', () => {
        const session = seededSession()
        const lenient = {
            junk: '未知键',
            guides: [{ orientation: 'vertical', position: 300, junk: true }],
            lockedPaths: [],
        } as unknown as CanvasEditorState
        expect(session.restoreEditorState(lenient)).toBe(true)
        expect(session.listGuides()).toEqual([{ id: 2, orientation: 'vertical', position: 300 }])
    })
})

describe('restoreEditorState：应用与 prune（悬空锁路径剔除）', () => {
    it('整体替换：旧切片让位新切片（guides 与 lockedPaths 全量换血）', () => {
        const session = seededSession()
        expect(
            session.restoreEditorState({
                guides: [{ id: 7, orientation: 'horizontal', position: 300 }],
                lockedPaths: [['layers', 0]],
            }),
        ).toBe(true)
        // id 重取：快照 id 7 丢弃，同会话续号（既有 guide 已占 1）＝ 2
        expect(session.listGuides()).toEqual([{ id: 2, orientation: 'horizontal', position: 300 }])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
    })

    it('悬空锁路径剔除：合法但内容悬空不算拒，返 true（prune 兜底，重映射-滤除同型语义）', () => {
        const session = makeSession()
        expect(
            session.restoreEditorState({
                guides: [],
                lockedPaths: [['layers', 0], ['layers', 5], ['layers', 1, 'rows', 0]],
            }),
        ).toBe(true)
        // 越界根层与非根层路径解析不出图层 → 剔除；可解析的 ['layers', 0] 保留
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
    })

    it('guide id 重排：快照 id 丢弃按会话序重取，后续 addGuide 顺延不撞号、removeGuide 不误删', () => {
        const session = makeSession()
        expect(
            session.restoreEditorState({
                guides: [
                    { id: 100, orientation: 'vertical', position: 100 },
                    { id: 200, orientation: 'horizontal', position: 200 },
                ],
                lockedPaths: [],
            }),
        ).toBe(true)
        expect(session.listGuides().map((g) => g.id)).toEqual([1, 2])
        // 若快照 id 原样入栈（seq=0），此处 addGuide 必发出 id 1 与存量撞号
        const added = session.addGuide({ orientation: 'vertical', position: 500 })!
        expect(added.id).toBe(3)
        // 按 id 寻址删除恰命中一条（撞号时 filter 会双杀）
        expect(session.removeGuide(1)).toBe(true)
        expect(session.listGuides().map((g) => g.id)).toEqual([2, 3])
    })

    it('撞号陷阱的现实形态：会话 A 快照（id 1/2）→ 新会话恢复 → 取号从 3 续', () => {
        const first = makeSession()
        first.addGuide({ orientation: 'vertical', position: 1 })
        first.addGuide({ orientation: 'vertical', position: 2 })
        const snapshot = first.exportEditorState()

        const revived = makeSession()
        expect(revived.restoreEditorState(snapshot)).toBe(true)
        expect(revived.listGuides().map((g) => g.id)).toEqual([1, 2])
        expect(revived.addGuide({ orientation: 'vertical', position: 3 })!.id).toBe(3)
        expect(revived.removeGuide(1)).toBe(true)
        expect(revived.listGuides()).toHaveLength(2)
    })
})

describe('restoreEditorState：历史栈与 graph 零接触（同门红线）', () => {
    it('restore 不产生历史步、不写 graph（doc 引用与图层零改动）', () => {
        const session = makeSession()
        const before = session.store.doc
        expect(
            session.restoreEditorState({
                guides: [{ id: 5, orientation: 'vertical', position: 100 }],
                lockedPaths: [['layers', 1]],
            }),
        ).toBe(true)
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc).toBe(before)
        expect(session.store.doc!.layers.map((l) => l.priority)).toEqual([20, 10])
    })

    it('已有历史步的会话 restore 后历史不变（canUndo 保持）', () => {
        const session = makeSession()
        session.updateSpec(['layers', 0], ['position', 'x'], 123)
        expect(session.canUndo).toBe(true)
        expect(session.restoreEditorState({ guides: [], lockedPaths: [] })).toBe(true)
        expect(session.store.history).toHaveLength(1)
        expect(session.canUndo).toBe(true)
    })

    it('变更以纯 ui 分支通知广播（零 doc 通知——graph 零接触的通知面自证）', () => {
        const session = makeSession()
        const changes: EditorChange[] = []
        session.subscribe((c) => changes.push(c))
        session.restoreEditorState({
            guides: [{ id: 1, orientation: 'vertical', position: 100 }],
            lockedPaths: [['layers', 0]],
        })
        expect(changes.length).toBeGreaterThan(0)
        expect(changes.every((c) => c.scope === 'ui')).toBe(true)
    })
})

describe('openDocument(canvas, state?)：开了就恢复的组合应用', () => {
    it('可选参原子应用：reset（历史/会话态清空）→ 切片就位', () => {
        const session = seededSession()
        session.updateSpec(['layers', 0], ['position', 'x'], 123) // 旧文档历史步
        expect(session.canUndo).toBe(true)

        const next = doc()
        session.openDocument(next, {
            guides: [{ id: 9, orientation: 'horizontal', position: 300 }],
            lockedPaths: [['layers', 1]],
        })

        expect(session.store.doc).toBe(next)
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
        expect(session.listGuides().map((g) => ({ orientation: g.orientation, position: g.position })))
            .toEqual([{ orientation: 'horizontal', position: 300 }])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 1]])
        expect(session.isLocked(['layers', 1])).toBe(true)
    })

    it('切片对新开文档 prune 兜底：悬空锁路径剔除（原子管线 = reset → apply → prune）', () => {
        const session = makeSession()
        session.openDocument(doc(), {
            guides: [],
            lockedPaths: [['layers', 0], ['layers', 7]],
        })
        expect(session.store.ui.lockedPaths).toEqual([['layers', 0]])
    })

    it('切片形状不合法：文档照常打开、整体拒回落默认态，不抛错', () => {
        const session = makeSession()
        const next = doc()
        expect(() =>
            session.openDocument(next, { guides: 'x' } as unknown as CanvasEditorState),
        ).not.toThrow()
        expect(session.store.doc).toBe(next)
        expect(session.listGuides()).toEqual([])
        expect(session.store.ui.lockedPaths).toEqual([])
    })

    it('单参调用零破坏：reset 语义不变（切片清空、偏好保留）', () => {
        const session = seededSession()
        session.applyEditorPrefs({ rulersVisible: false, anchorExpanded: true })

        session.openDocument(doc())

        expect(session.listGuides()).toEqual([])
        expect(session.store.ui.lockedPaths).toEqual([])
        expect(session.getEditorPrefs()).toEqual({ rulersVisible: false, anchorExpanded: true })
        expect(session.canUndo).toBe(false)
    })

    it('组合应用零历史步：openDocument+切片后与 fresh 打开一致', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        session.openDocument(doc(), {
            guides: [{ id: 1, orientation: 'vertical', position: 100 }],
            lockedPaths: [['layers', 1]],
        })
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('导出 → 恢复往返（宿主切帧/跨会话的内核面）', () => {
    it('同文档异会话往返：切片内容保持、id 重取、锁原样生效', () => {
        const first = makeSession()
        first.addGuide({ orientation: 'vertical', position: 205 })
        first.toggleLayerLock(['layers', 1])
        const slice = first.exportEditorState()

        const second = makeSession()
        expect(second.restoreEditorState(slice)).toBe(true)
        expect(second.listGuides().map((g) => ({ orientation: g.orientation, position: g.position })))
            .toEqual([{ orientation: 'vertical', position: 205 }])
        expect(second.store.ui.lockedPaths).toEqual([['layers', 1]])
        expect(second.isLocked(['layers', 1])).toBe(true)
    })
})
