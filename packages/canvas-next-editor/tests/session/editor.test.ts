import { describe, expect, it, vi } from 'vitest'

import type { Canvas, RenderBackend, TextLayer } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler, type OverlayPainter } from '../../src/session/editor'
import type { EditorChange } from '../../src/session/store'
import { textLayer } from '../support/fixtures'

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

describe('挂起帧同步排空（flushPendingFrames，canvas-web-render-perf 工单 01）', () => {
    it('有挂起帧：同步执行重绘（不经调度器 flush），挂起标记复位', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())

        session.invalidate('both')
        expect(scheduler.pending()).toBe(1)
        session.flushPendingFrames()
        expect(backend.beginCount()).toBe(1)
        expect(painter).toHaveBeenCalledTimes(1)
        expect(scheduler.pending()).toBe(0)
    })

    it('幂等：连排两次只绘一次；无挂起帧空转', () => {
        const { session } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())

        session.invalidate('content')
        session.flushPendingFrames()
        session.flushPendingFrames() // 第二次无挂起：空转
        expect(backend.beginCount()).toBe(1)

        session.flushPendingFrames() // 从未排定：同样空转不抛
        expect(backend.beginCount()).toBe(1)
    })

    it('排空走分层脏标：只脏覆盖层时不触内容层', () => {
        const { session } = makeSession()
        const backend = recordingBackend()
        const painter = vi.fn<OverlayPainter>()
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument(doc())
        session.flushPendingFrames() // 组装期脏标先落一帧
        backend.resetBeginCount()
        painter.mockClear()

        session.invalidate('overlay')
        session.flushPendingFrames()
        expect(backend.beginCount()).toBe(0)
        expect(painter).toHaveBeenCalledTimes(1)
    })

    it('排空后新 invalidate 正常再排一帧（不丢帧、不双绘）', () => {
        const { session, scheduler } = makeSession()
        const backend = recordingBackend()
        session.attachContentBackend(backend)
        session.openDocument(doc())

        session.invalidate('content')
        session.flushPendingFrames()
        session.invalidate('content')
        expect(scheduler.pending()).toBe(1)
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

    it('panToBox：出视最小平移入视且保 zoom（查找导航的视口跟随，canvas-web-find-replace 工单 02）', () => {
        const { session } = makeSession()
        session.setSurfaceSize(1000, 750)
        session.zoomAt(500, 375, 2)
        expect(session.store.ui.viewport).toEqual({ x: 250, y: 187.5, zoom: 2 })

        session.panToBox({ x: 2000, y: 1000, width: 200, height: 100 })
        // x：可行带 [1706, 1994] 钳近端 lo；y：可行带 [731, 994] 钳近端 lo；zoom 恒 2
        expect(session.store.ui.viewport).toEqual({ x: 1706, y: 731, zoom: 2 })
    })

    it('panToBox：视内不动零通知（纯函数恒等短路，不惊动订阅方）', () => {
        const { session } = makeSession()
        session.setSurfaceSize(1000, 750)
        const changes: EditorChange[] = []
        session.subscribe((change) => changes.push(change))

        session.panToBox({ x: 100, y: 100, width: 300, height: 150 })
        expect(changes).toEqual([])
        expect(session.store.ui.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    })

    it('panToBox：出视通知走 ui.viewport 分支且不进历史（相机动作全族先例）', () => {
        const { session } = makeSession()
        session.openDocument(doc())
        session.updateCanvasProp('width', 2500) // 一步历史作底
        session.setSurfaceSize(1000, 750)
        const changes: EditorChange[] = []
        session.subscribe((change) => changes.push(change))

        session.panToBox({ x: 5000, y: 5000, width: 100, height: 100 })
        expect(changes).toEqual([{ scope: 'ui', branch: 'viewport' }])
        expect(session.store.history).toHaveLength(1)
    })

    it('panToBox：表面尺寸未知 no-op', () => {
        const { session } = makeSession()
        session.panToBox({ x: 5000, y: 5000, width: 100, height: 100 })
        expect(session.store.ui.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    })
})

describe('前移/后移（bringForward/sendBackward）：面板序 ±1 的 z 序单格重排（kbd-nav 工单 01）', () => {
    const threeLayers = (): Canvas => ({
        width: 800,
        height: 600,
        layers: [
            textLayer({ priority: 30, text: '底' }),
            textLayer({ priority: 20, text: '中' }),
            textLayer({ priority: 10, text: '顶' }),
        ],
    })
    const texts = (session: EditorSession): string[] =>
        session.store.doc!.layers.map((layer) => (layer as TextLayer).text)

    it('前移一格：中间层向视觉顶层挪一格，priority = min−1，选择跟随重映射', () => {
        const { session } = makeSession()
        session.openDocument(threeLayers())
        session.setSelection(['layers', 1]) // 中（面板序 1）
        expect(session.bringForward()).toBe(true)
        expect(texts(session)).toEqual(['底', '顶', '中'])
        expect(session.store.doc!.layers[2]!.priority).toBe(9)
        expect(session.store.ui.selection).toEqual(['layers', 2])
    })

    it('后移一格：顶层向视觉底层挪一格，双邻整数间隙取中点插值', () => {
        const { session } = makeSession()
        session.openDocument(threeLayers())
        session.setSelection(['layers', 2]) // 顶（面板序 0）
        expect(session.sendBackward()).toBe(true)
        expect(texts(session)).toEqual(['底', '顶', '中'])
        expect(session.store.doc!.layers[1]!.priority).toBe(25) // ⌊(30+20)/2⌋
        expect(session.store.ui.selection).toEqual(['layers', 1])
    })

    it('已最前/最后：空转（返回 false，无历史步）', () => {
        const { session } = makeSession()
        session.openDocument(threeLayers())
        session.setSelection(['layers', 2]) // 顶
        expect(session.bringForward()).toBe(false)
        expect(texts(session)).toEqual(['底', '中', '顶'])
        expect(session.canUndo).toBe(false)
        session.setSelection(['layers', 0]) // 底
        expect(session.sendBackward()).toBe(false)
        expect(texts(session)).toEqual(['底', '中', '顶'])
        expect(session.canUndo).toBe(false)
    })

    it('仅根层：行/格/无选择/无文档空转（无历史步）', () => {
        const { session } = makeSession()
        session.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10, text: '甲' })] })
        const prioritiesBefore = session.store.doc!.layers.map((layer) => layer.priority)
        session.setSelection(['layers', 0, 'rows', 0])
        expect(session.bringForward()).toBe(false)
        expect(session.sendBackward()).toBe(false)
        session.setSelection(null)
        expect(session.bringForward()).toBe(false)
        expect(session.sendBackward()).toBe(false)
        expect(session.store.doc!.layers.map((layer) => layer.priority)).toEqual(prioritiesBefore)
        expect(session.canUndo).toBe(false)

        const headless = makeSession().session
        expect(headless.bringForward()).toBe(false)
        expect(headless.sendBackward()).toBe(false)
    })

    it('连按各成一步历史：两次前移两步，undo 一次只回一步', () => {
        const { session } = makeSession()
        session.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 40, text: '丁' }),
                textLayer({ priority: 30, text: '丙' }),
                textLayer({ priority: 20, text: '乙' }),
                textLayer({ priority: 10, text: '甲' }),
            ],
        })
        session.setSelection(['layers', 0]) // 丁（面板底）
        expect(session.bringForward()).toBe(true)
        expect(session.bringForward()).toBe(true)
        expect(texts(session)).toEqual(['丙', '乙', '丁', '甲'])
        expect(session.store.history).toHaveLength(2)
        session.undo()
        expect(texts(session)).toEqual(['丙', '丁', '乙', '甲'])
        expect(session.canRedo).toBe(true)
        session.redo()
        expect(texts(session)).toEqual(['丙', '乙', '丁', '甲'])
    })

    it('无整数间隙时全表归一化兜底（按视觉序 (N−1−i)×1024 重赋）', () => {
        const { session } = makeSession()
        session.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 10, text: '甲' }),
                textLayer({ priority: 10, text: '乙' }),
                textLayer({ priority: 10, text: '丙' }),
                textLayer({ priority: 10, text: '丁' }),
            ],
        })
        session.setSelection(['layers', 3]) // 丁（面板顶）
        expect(session.sendBackward()).toBe(true) // 落乙丙之间，双邻同值无间隙 → 归一化
        expect(texts(session)).toEqual(['甲', '乙', '丁', '丙'])
        expect(session.store.doc!.layers.map((layer) => layer.priority)).toEqual([3072, 2048, 1024, 0])
    })

    it('锁定层 z 序放行（刻意通道）：锁定选中根层后前移照常生效，锁随层重映射', () => {
        const { session } = makeSession()
        session.openDocument(threeLayers())
        session.setSelection(['layers', 1])
        session.toggleLayerLock(['layers', 1])
        expect(session.bringForward()).toBe(true)
        expect(texts(session)).toEqual(['底', '顶', '中'])
        expect(session.store.ui.lockedPaths).toEqual([['layers', 2]])
    })
})

describe('resetZoom（缩放复位 100%：视口中心为锚，kbd-nav 工单 01）', () => {
    it('zoom→1，视口中心的场景点不动（平移不跳变）', () => {
        const { session } = makeSession()
        session.openDocument(doc())
        session.setSurfaceSize(800, 600)
        session.zoomAt(200, 150, 2)
        const before = session.store.ui.viewport
        const centerBefore = {
            x: 400 / before.zoom + before.x,
            y: 300 / before.zoom + before.y,
        }
        session.resetZoom()
        const after = session.store.ui.viewport
        expect(after.zoom).toBe(1)
        expect(400 / after.zoom + after.x).toBeCloseTo(centerBefore.x, 10)
        expect(300 / after.zoom + after.y).toBeCloseTo(centerBefore.y, 10)
    })

    it('已在 100% 时复位为恒等（视口数值不变）', () => {
        const { session } = makeSession()
        session.openDocument(doc())
        session.setSurfaceSize(800, 600)
        const before = session.store.ui.viewport
        session.resetZoom()
        expect(session.store.ui.viewport).toEqual(before)
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

describe('layerBoxAt 生效面（autowidth-content-injection 工单 03）：宽自适应文本层盒立即贴合文本', () => {
    it('打开 autoWidth 的文本层盒宽 = 自然宽（不再是声明 0 宽塌缩），高自适应同步', () => {
        const { session } = makeSession()
        // 夹具缺省 '你好画布' @16：启发式自然宽 = 4 × 16 = 64；行高 ceil(16 × 1.2) = 20
        session.openDocument({
            width: 800,
            height: 600,
            layers: [textLayer({ shape: { width: 0, autoWidth: true, autoHeight: true } })],
        })

        // gizmo 选择框/命中/适应选区/面板同源（layerBoxAt 单一几何来源）
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({
            width: 64,
            height: 20,
            contentWidth: 64,
            contentHeight: 20,
        })
    })
})
