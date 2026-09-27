import { describe, expect, it, vi } from 'vitest'

import type { Canvas, RenderBackend } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler, type OverlayPainter } from '../../src/session/editor'

/** 录制后端：只数 begin（每次内容重绘恰一次），其余原语空实现 */
function recordingBackend(): RenderBackend & { beginCount: () => number; resetBeginCount: () => void } {
    let begins = 0
    return {
        begin() {
            begins += 1
        },
        end() {},
        drawRect() {},
        drawImage() {},
        drawText() {},
        beginCount: () => begins,
        resetBeginCount: () => {
            begins = 0
        },
    }
}

/** 手动帧调度器：捕获回调，测试里手动 flush，可观察取消（本身可调用） */
function manualScheduler(): FrameScheduler & { flush: () => void; pending: () => number } {
    let queued: (() => void) | null = null
    return Object.assign(
        (cb: () => void) => {
            queued = cb
            return () => {
                queued = null
            }
        },
        {
            flush() {
                const cb = queued
                queued = null
                cb?.()
            },
            pending: () => (queued ? 1 : 0),
        },
    )
}

const doc = (width = 2400, height = 1500): Canvas => ({
    width,
    height,
    layers: [
        {
            type: 'TextLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: {
                width: 100,
                height: 40,
                autoWidth: false,
                autoHeight: false,
                lineHeight: 1.2,
                padding: { top: 0, bottom: 0, left: 0, right: 0 },
                border: { top: null, bottom: null, left: null, right: null },
                backgroundColor: null,
            },
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 10, y: 10 },
            text: 'hi',
            expression: null,
            font: '',
            fontSize: 16,
            fontColor: '#000000',
            angle: 0,
            autowrap: false,
        },
    ],
})

function makeSession(overrides: Partial<{ zoomMax: number; zoomMin: number }> = {}) {
    const scheduler = manualScheduler()
    const session = new EditorSession({
        scheduleFrame: scheduler,
        zoomBounds: {
            min: overrides.zoomMin ?? 0.05,
            max: overrides.zoomMax ?? 8,
        },
    })
    return { session, scheduler }
}

describe('合帧（rAF 语义由注入调度器承接）', () => {
    it('连续多次 invalidate 只 flush 一帧', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())

        session.invalidate()
        session.invalidate('content')
        session.invalidate('overlay')
        expect(backend.beginCount()).toBe(0)
        expect(painter).not.toHaveBeenCalled()
        expect(scheduler.pending()).toBe(1)

        scheduler.flush()
        expect(backend.beginCount()).toBe(1)
        expect(painter).toHaveBeenCalledTimes(1)
        expect(scheduler.pending()).toBe(0)
    })

    it('覆盖层重绘不触发内容层（分层脏标）', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())
        scheduler.flush() // 组装期脏标先落一帧，与断言隔开
        backend.resetBeginCount()
        painter.mockClear()

        session.invalidate('overlay')
        scheduler.flush()
        expect(backend.beginCount()).toBe(0)
        expect(painter).toHaveBeenCalledTimes(1)
    })

    it('内容层重绘不触发覆盖层', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())
        scheduler.flush() // 组装期脏标先落一帧，与断言隔开
        backend.resetBeginCount()
        painter.mockClear()

        session.invalidate('content')
        scheduler.flush()
        expect(backend.beginCount()).toBe(1)
        expect(painter).not.toHaveBeenCalled()
    })

    it('同帧内多次脏标合并；flush 后新脏标开启新帧', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())

        session.invalidate('content')
        session.invalidate('overlay')
        scheduler.flush()
        session.invalidate('content')
        scheduler.flush()
        expect(backend.beginCount()).toBe(2)
    })
})

describe('store 变更 → 分层脏标映射', () => {
    it('打开文档 → 内容层重绘', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())
        scheduler.flush()
        expect(backend.beginCount()).toBe(1)
    })

    it('视口变更 → 双层都重绘', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())

        session.panBy(-10, 0)
        scheduler.flush()
        expect(backend.beginCount()).toBe(1)
        expect(painter).toHaveBeenCalledTimes(1)
    })
})

describe('相机动作（经纯函数 + store.setViewport，不进历史）', () => {
    it('panBy 按 zoom 折算并更新 ui.viewport', () => {
        const { session } = makeSession()
        session.panBy(-30, 20)
        expect(session.store.ui.viewport).toEqual({ x: 30, y: -20, zoom: 1 })
    })

    it('zoomAt 以指针为中心：指针下场景点不动', () => {
        const { session } = makeSession()
        const pointer = { x: 400, y: 300 }
        const before = {
            x: pointer.x / 1 + session.store.ui.viewport.x,
            y: pointer.y / 1 + session.store.ui.viewport.y,
        }
        session.zoomAt(pointer.x, pointer.y, 4)
        const viewport = session.store.ui.viewport
        const after = {
            x: pointer.x / viewport.zoom + viewport.x,
            y: pointer.y / viewport.zoom + viewport.y,
        }
        expect(after.x).toBeCloseTo(before.x, 10)
        expect(after.y).toBeCloseTo(before.y, 10)
    })

    it('zoomByWheel 走滚轮曲线并钳位到可配置范围', () => {
        const { session } = makeSession({ zoomMax: 2 })
        session.zoomByWheel(500, 500, -100)
        expect(session.store.ui.viewport.zoom).toBeCloseTo(1.1, 12)
        for (let i = 0; i < 50; i += 1) session.zoomByWheel(500, 500, -100)
        expect(session.store.ui.viewport.zoom).toBe(2)
        for (let i = 0; i < 200; i += 1) session.zoomByWheel(500, 500, 100)
        expect(session.store.ui.viewport.zoom).toBe(0.05)
    })

    it('fitToSurface：整页可见居中；表面尺寸未知时 no-op', () => {
        const { session } = makeSession()
        session.openDocument(doc(2400, 1500))
        session.fitToSurface()
        expect(session.store.ui.viewport).toEqual({ x: 0, y: 0, zoom: 1 })

        session.setSurfaceSize(1200, 750)
        session.fitToSurface()
        expect(session.store.ui.viewport.zoom).toBeCloseTo(0.5, 12)
        const center = {
            x: 600 / session.store.ui.viewport.zoom + session.store.ui.viewport.x,
            y: 375 / session.store.ui.viewport.zoom + session.store.ui.viewport.y,
        }
        expect(center.x).toBeCloseTo(1200, 6)
        expect(center.y).toBeCloseTo(750, 6)
    })
})

describe('撤销/重做（工单 08）：会话透传 store，doc 变更驱动双层重绘', () => {
    it('canUndo/canRedo 随事务与 undo/redo 联动；undo 恢复文档', () => {
        const { session } = makeSession()
        session.openDocument(doc())
        expect(session.canUndo).toBe(false)
        expect(session.canRedo).toBe(false)

        session.beginDrag(['layers', 0], 0, 0)
        session.dragTo(50, 0)
        session.endDrag()
        expect(session.canUndo).toBe(true)

        session.undo()
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 10, y: 10 })
        expect(session.canUndo).toBe(false)
        expect(session.canRedo).toBe(true)

        session.redo()
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 60, y: 10 })
    })

    it('undo/redo 走 doc 分支通知 → 内容层与覆盖层都重绘', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())
        scheduler.flush()
        backend.resetBeginCount()
        painter.mockClear()

        session.undo()
        scheduler.flush()
        expect(backend.beginCount()).toBe(0) // 空栈 undo 不产生通知与重绘

        session.store.transact((draft) => {
            draft.layers[0]!.priority = 99
        })
        scheduler.flush()
        const afterTransact = backend.beginCount()

        session.undo()
        scheduler.flush()
        expect(backend.beginCount()).toBe(afterTransact + 1)
        expect(painter).toHaveBeenCalledTimes(2)
    })
})

describe('呈现参数与防御', () => {
    it('未打开文档/未挂后端时 flush 不绘制不报错', () => {
        const { session, scheduler } = makeSession()
        session.invalidate()
        scheduler.flush()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.invalidate('overlay')
        scheduler.flush()
        expect(backend.beginCount()).toBe(0)
    })

    it('dpr/尺寸变更置双脏；内容重绘前以物理像素对齐的视口喂给覆盖层', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const seen: { x: number; y: number; zoom: number; dpr: number }[] = []
        session.attachContentBackend(backend)
        session.setOverlayPainter((args) => seen.push({ ...args.viewport, dpr: args.dpr }))
        session.openDocument(doc())
        session.panBy(-100.037, 0)
        session.setDevicePixelRatio(2)
        scheduler.flush()
        expect(seen).toHaveLength(1)
        expect(seen[0]!.dpr).toBe(2)
        // cam * zoom * dpr 为整数（物理像素网格）
        expect(seen[0]!.x * seen[0]!.zoom * 2).toBeCloseTo(Math.round(seen[0]!.x * 2), 10)
    })

    it('dispose 取消挂起帧并停订 store', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())
        session.invalidate()
        session.dispose()
        expect(scheduler.pending()).toBe(0)
        scheduler.flush()
        expect(backend.beginCount()).toBe(0)
    })

    it('detachSurfaces 后 flush 空转，可重新挂载', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())
        session.detachSurfaces()
        scheduler.flush()
        expect(backend.beginCount()).toBe(0)

        session.attachContentBackend(backend)
        session.invalidate('content')
        scheduler.flush()
        expect(backend.beginCount()).toBe(1)
    })

    it('订阅随 session 转发（ui.viewport 分支可辨）', () => {
        const { session } = makeSession()
        const changes: unknown[] = []
        session.subscribe((c) => changes.push(c))
        session.panBy(-5, 0)
        expect(changes).toEqual([{ scope: 'ui', branch: 'viewport' }])
    })
})
