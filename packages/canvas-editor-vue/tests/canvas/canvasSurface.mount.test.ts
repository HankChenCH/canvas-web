// @vitest-environment jsdom
/**
 * CanvasSurface 呈现环境加固（工单 15，M3.8 验收项）：
 * - contextlost：preventDefault() 声明可恢复（MDN——不拦即永久丢失，restored 不会来）
 * - contextrestored：恢复后绘图缓冲被清空 → 强制全量重绘（内容层 begin 恰一次 +
 *   覆盖层画笔被调），两层各自挂了监听
 * - DPR 变更（跨屏拖动/系统缩放）：分辨率媒体查询自再注册 → setDevicePixelRatio
 *   传导进会话（覆盖层收到的 dpr = 新值），双层重绘；画布坐标语义不变（不漂移）
 * - 内挂 FindBar（find-replace 工单 03）：随会话开合呈现；焦点漂出输入框后
 *   Esc 经窗口监听转发关闭（浮层先例协议，ContextMenu 同款）
 *
 * jsdom 无真实 2D context/ResizeObserver/matchMedia，按组件契约补最小桩：
 * 重绘驱动用手动帧调度器，呈现结果经录制后端与覆盖层画笔读数断言。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type OverlayPainter } from '@hankchen/canvas-editor'

import CanvasSurface from '../../src/canvas/CanvasSurface.vue'
import { drawCreateRubberBand } from '../../src/canvas/createBand'
import { cellLayer, rowLayer, tableLayer, textLayer } from '../../../canvas-editor/tests/support/fixtures'

// ---- jsdom 环境桩 ----

/** 分辨率媒体查询桩：登记监听供测试手动触发（真机由浏览器在 dpr 变化瞬间回调） */
const dprListeners = new Set<() => void>()
if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => dprListeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => dprListeners.delete(listener),
        addListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
if (typeof globalThis.ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub
}

/** jsdom 无 pointer capture（拖动手势抓取依赖）：补不抛错的空实现（抓取语义无断言面） */
if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => false, configurable: true })
}

function setDevicePixelRatio(value: number): void {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value })
}
function fireDprChange(): void {
    for (const listener of [...dprListeners]) listener()
}

// ---- 录制设施 ----

/** 录制后端：数 begin（每次内容重绘恰一次），其余原语空实现（形状由 attachContentBackend 参数面校验） */
function recordingBackend() {
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
        reset: () => {
            begins = 0
        },
    }
}

/** 手动帧调度器：捕获回调，测试里手动 flush（模拟 rAF 时机） */
function manualScheduler(): FrameScheduler & { flush: () => void } {
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
        },
    )
}

const emptyDoc = { width: 400, height: 300, layers: [] }

function mountSurface(painterFactory?: (editor: EditorSession) => OverlayPainter) {
    const scheduler = manualScheduler()
    const editor = new EditorSession({ scheduleFrame: scheduler })
    const backend = recordingBackend()
    const overlayDprs: number[] = []
    const overlayPainter: OverlayPainter = painterFactory
        ? painterFactory(editor)
        : (args) => overlayDprs.push(args.dpr)

    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(CanvasSurface, { props: { editor }, attachTo: hostEl })

    editor.attachContentBackend(backend)
    editor.setOverlayPainter(overlayPainter)
    editor.openDocument(emptyDoc)
    scheduler.flush() // 挂载期 setSurfaceSize 触发的首帧
    backend.reset()
    overlayDprs.length = 0

    const ready = wrapper.emitted('ready')
    expect(ready).toHaveLength(1)
    const canvases = ready![0]![0] as { contentCanvas: HTMLCanvasElement; overlayCanvas: HTMLCanvasElement }

    return {
        editor,
        backend,
        scheduler,
        overlayDprs,
        contentCanvas: canvases.contentCanvas,
        overlayCanvas: canvases.overlayCanvas,
        cleanup() {
            wrapper.unmount()
            hostEl.remove()
            editor.dispose()
        },
    }
}

afterEach(() => {
    setDevicePixelRatio(1)
    fireDprChange()
})

describe('contextlost / contextrestored（工单 15）', () => {
    it('contextlost：preventDefault 声明可恢复（MDN：不拦 = 永久丢失）', () => {
        const { contentCanvas, overlayCanvas, cleanup } = mountSurface()

        for (const canvas of [contentCanvas, overlayCanvas]) {
            const lost = new Event('contextlost', { cancelable: true })
            canvas.dispatchEvent(lost)
            expect(lost.defaultPrevented).toBe(true)
        }
        cleanup()
    })

    it('contextrestored：恢复后强制全量重绘——合帧后内容层 begin 恰一次、覆盖层画笔被调；两层各自挂监听', () => {
        const { contentCanvas, overlayCanvas, backend, scheduler, overlayDprs, cleanup } = mountSurface()

        contentCanvas.dispatchEvent(new Event('contextlost')) // lost 本身不触发重绘
        overlayCanvas.dispatchEvent(new Event('contextlost'))
        expect(backend.beginCount()).toBe(0)
        expect(overlayDprs).toHaveLength(0)

        // 两层的 restored 各自强制重绘；同一帧内合帧为一次全量重绘
        contentCanvas.dispatchEvent(new Event('contextrestored'))
        overlayCanvas.dispatchEvent(new Event('contextrestored'))
        scheduler.flush()

        expect(backend.beginCount()).toBe(1)
        expect(overlayDprs).toHaveLength(1)
        cleanup()
    })
})

describe('DPR/屏幕变更即时适配（工单 15）', () => {
    it('dpr 变更：setDevicePixelRatio 传导进会话，覆盖层收到新 dpr（画布坐标语义不变）', () => {
        const { scheduler, backend, overlayDprs, cleanup } = mountSurface()

        setDevicePixelRatio(2)
        fireDprChange()
        scheduler.flush()

        expect(overlayDprs).toEqual([2])
        expect(backend.beginCount()).toBe(1) // 双层都重绘：内容层 begin 恰一次

        cleanup()
    })

    it('媒体查询自再注册：dpr 1→2→3 连续变更每次都跟进（旧查询失配后换新查询监听）', () => {
        const { scheduler, overlayDprs, cleanup } = mountSurface()

        setDevicePixelRatio(2)
        fireDprChange()
        scheduler.flush()
        setDevicePixelRatio(3)
        fireDprChange()
        scheduler.flush()

        expect(overlayDprs).toEqual([2, 3])
        cleanup()
    })

    it('dpr 变更背靠背补绘（canvas-web-render-perf 工单 01）：每次变更同步排空挂起帧，清屏后无空白窗口期', () => {
        const { overlayDprs, cleanup } = mountSurface()

        // resizeBuffers 清空物理缓冲后同步排空（不等 rAF）——ResizeObserver/dpr 回调
        // 在帧生命周期中晚于 rAF，等下一帧重绘必现一帧空白
        setDevicePixelRatio(2)
        fireDprChange()
        expect(overlayDprs).toEqual([2])
        setDevicePixelRatio(3)
        fireDprChange()
        expect(overlayDprs).toEqual([2, 3])
        cleanup()
    })
})

describe('内挂 FindBar：随会话开合与 Esc 转发关闭（find-replace 工单 03）', () => {
    it('⌘F 分派开会话后条即呈现；焦点漂出输入框（画布/正文）按 Esc 经窗口监听关闭', async () => {
        const { editor, cleanup } = mountSurface()
        expect(document.querySelector('[data-find-bar]')).toBeNull()

        editor.beginFind()
        await nextTick()
        expect(document.querySelector('[data-find-bar]')).not.toBeNull()

        // 焦点在正文（非可编辑目标）：窗口级 Escape 转发 close——ContextMenu 同款协议
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(document.querySelector('[data-find-bar]')).toBeNull()
        expect(editor.store.ui.find.open).toBe(false)
        cleanup()
    })
})

describe('Alt+拖快速复制：altKey 读取传递（alt-drag-paste 工单 01）', () => {
    // jsdom 无 PointerEvent/布局：MouseEvent 按类型直发（ruler.mount.test 同款）；
    // 视口缺省 {0,0,1} → 场景点 == 客户端像素；文本层 fixture 定盒 (0,0,100,50)
    const surfaceHost = () => document.querySelector('.cn-surface')!
    const dispatchPointer = (type: string, init: MouseEventInit = {}) =>
        surfaceHost().dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))

    it('pointerdown 携 altKey 且命中可复制层 → beginDrag 收到 copy 标记；首移越阈副本落地并自动选中', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [textLayer({ priority: 10 })],
        })

        dispatchPointer('pointerdown', { button: 0, clientX: 50, clientY: 25, altKey: true })
        expect(editor.store.ui.drag?.copy).toBe(true)
        expect(editor.store.ui.drag?.copyPending).toBe(true)
        expect(editor.store.ui.selection).toEqual(['layers', 0])

        // 中途松 Alt（move 事件 altKey=false）：修饰键起点一次性判定——副本照常落下
        dispatchPointer('pointermove', { clientX: 60, clientY: 35, altKey: false }) // 位移 (10,10) 越过 4px 死区
        expect(editor.store.doc!.layers).toHaveLength(2)
        expect(editor.store.ui.selection).toEqual(['layers', 1]) // 副本自动选中

        dispatchPointer('pointerup', { clientX: 60, clientY: 35 })
        expect(editor.store.ui.drag).toBeNull()
        cleanup()
    })

    it('未按 Alt 走普通拖动：无 copy 标记、首移移动源层不插副本', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [textLayer({ priority: 10 })],
        })

        dispatchPointer('pointerdown', { button: 0, clientX: 50, clientY: 25 })
        expect(editor.store.ui.drag?.copy).toBeFalsy()

        dispatchPointer('pointermove', { clientX: 60, clientY: 35 })
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.store.doc!.layers[0]!.position).toMatchObject({ x: 10, y: 10 }) // 源自己位移

        dispatchPointer('pointerup', { clientX: 60, clientY: 35 })
        cleanup()
    })
})

describe('八柄缩放接线（工单 07）：柄面优先于图层命中', () => {
    // jsdom 无 PointerEvent/布局：MouseEvent 按类型直发；视口缺省 {0,0,1} →
    // 场景点 == 客户端像素；文本层 fixture 定盒 (0,0,100,50)，se 柄中心 = (100,50)
    const surfaceHost = () => document.querySelector('.cn-surface')!
    const dispatchPointer = (type: string, init: MouseEventInit = {}) =>
        surfaceHost().dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))

    it('点 se 柄开缩放会话：位移写回宽高，抬手闭合且一步历史', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
        editor.setSelection(['layers', 0])

        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 50 })
        expect(editor.store.ui.resize?.handle).toBe('se')
        expect(editor.store.ui.drag).toBeNull() // 不进拖动

        dispatchPointer('pointermove', { clientX: 130, clientY: 80 }) // 位移 (30,30)
        expect(editor.store.doc!.layers[0]!.shape).toMatchObject({ width: 130, height: 80 })

        dispatchPointer('pointerup', { clientX: 130, clientY: 80 })
        expect(editor.store.ui.resize).toBeNull()
        expect(editor.store.history).toHaveLength(1) // 一次手势 = 一步历史
        cleanup()
    })

    it('柄下叠着别的层：点柄缩放不改选（柄面优先），松手保持原选中', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 10 }),
                textLayer({ priority: 20, position: { anchor: 'top-left', x: 90, y: 40 } }),
            ],
        })
        editor.setSelection(['layers', 0])

        // se 柄 (100,50) 落在 layer1（视觉更上）内：柄面优先 → 仍缩放 layer0
        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 50 })
        expect(editor.store.ui.resize?.path).toEqual(['layers', 0])
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        dispatchPointer('pointerup', { clientX: 100, clientY: 50 })
        cleanup()
    })

    it('行层（宽强同步）只有 n/s 柄：点原 se 柄位置不开缩放、照常改选', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [tableLayer([rowLayer([cellLayer(textLayer())])])],
        })
        // 行 fixture 在 (0,0)——其 se 柄位不存在，点 (100,50) 命中表格（改选）
        editor.setSelection(['layers', 0, 'rows', 0])
        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 50 })
        expect(editor.store.ui.resize).toBeNull()
        dispatchPointer('pointerup', { clientX: 100, clientY: 50 })
        cleanup()
    })
})

describe('画拉建层接线（drag-create 工单 02）：武装态手势 + Esc 守卫 + 橡皮筋呈现', () => {
    // jsdom 无 PointerEvent/布局：MouseEvent 按类型直发；视口缺省 {0,0,1} →
    // 场景点 == 客户端像素
    const surfaceHost = () => document.querySelector('.cn-surface')!
    const dispatchPointer = (type: string, init: MouseEventInit = {}) =>
        surfaceHost().dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
    const dispatchKey = (key: string, init: KeyboardEventInit = {}) =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))

    /** 橡皮筋画笔的录制 ctx：记虚线矩形笔画、气泡文本与清屏次数（缩放恒 1 口径） */
    function bandRecorder() {
        return {
            strokes: [] as string[],
            texts: [] as string[],
            canvas: { width: 800, height: 600 },
            setTransform() {},
            clearRect() {},
            setLineDash() {},
            fillRect() {},
            strokeRect(...args: number[]) {
                this.strokes.push(`stroke:${args.join(',')}`)
            },
            beginPath() {},
            roundRect() {},
            fill() {},
            fillText(text: string) {
                this.texts.push(text)
            },
            measureText() {
                return { width: 40 }
            },
        }
    }

    it('武装态左键按下开画拉：不平移、不改选、不开拖动/缩放会话；move 求位、up 落库选中解除武装', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
        editor.setSelection(['layers', 0])
        editor.armLayerCreate('TableLayer')

        dispatchPointer('pointerdown', { button: 0, clientX: 300, clientY: 200 })
        // 优先开画拉：压过空白平移（视口不动）、图层命中/柄面（选中不变、无 drag/resize 会话）
        expect(editor.store.ui.create?.startScene).toEqual({ x: 300, y: 200 })
        expect(editor.store.ui.drag).toBeNull()
        expect(editor.store.ui.resize).toBeNull()
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(editor.store.ui.viewport).toEqual({ x: 0, y: 0, zoom: 1 })

        dispatchPointer('pointermove', { clientX: 360, clientY: 240 })
        expect(editor.store.ui.create?.rect).toEqual({ x: 300, y: 200, width: 60, height: 40 })

        dispatchPointer('pointerup', { clientX: 360, clientY: 240 })
        expect(editor.store.doc!.layers).toHaveLength(2) // 落库
        expect(editor.store.ui.selection).toEqual(['layers', 1]) // 自动选中新层
        expect(editor.store.ui.armedCreate).toBeNull() // 解除武装
        expect(editor.store.ui.create).toBeNull()
        expect(editor.store.history).toHaveLength(1) // 一次手势 = 一步历史
        cleanup()
    })

    it('非武装态行为回归不变：空白按下拖拽仍平移、不建层', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })

        dispatchPointer('pointerdown', { button: 0, clientX: 300, clientY: 200 })
        expect(editor.store.ui.create).toBeNull()
        dispatchPointer('pointermove', { clientX: 320, clientY: 210 })
        expect(editor.store.ui.viewport).toEqual({ x: -20, y: -10, zoom: 1 }) // 空白平移
        dispatchPointer('pointerup', { clientX: 320, clientY: 210 })
        expect(editor.store.doc!.layers).toHaveLength(1)
        cleanup()
    })

    it('武装态空格+左键 / 中键平移不受影响（wantPan 先于武装分派）', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [] })
        editor.armLayerCreate('TableLayer')

        // 中键平移
        dispatchPointer('pointerdown', { button: 1, clientX: 300, clientY: 200 })
        dispatchPointer('pointermove', { clientX: 310, clientY: 210 })
        expect(editor.store.ui.create).toBeNull()
        expect(editor.store.ui.viewport).toEqual({ x: -10, y: -10, zoom: 1 })
        dispatchPointer('pointerup', { clientX: 310, clientY: 210 })

        // 空格 + 左键平移（空格按住跟踪在窗口级）
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
        dispatchPointer('pointerdown', { button: 0, clientX: 300, clientY: 200 })
        dispatchPointer('pointermove', { clientX: 320, clientY: 200 })
        expect(editor.store.ui.create).toBeNull()
        expect(editor.store.ui.viewport).toEqual({ x: -30, y: -10, zoom: 1 }) // 纯横向拖：y 不变
        dispatchPointer('pointerup', { clientX: 320, clientY: 200 })
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
        cleanup()
    })

    it('Esc 解除武装（待命态）：零副作用，不走 escapeSelection 选择升级链', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
        editor.setSelection(['layers', 0]) // 根层选中：escapeSelection 会清空选择
        editor.armLayerCreate('TableLayer')

        dispatchKey('Escape')
        expect(editor.store.ui.armedCreate).toBeNull()
        expect(editor.store.ui.selection).toEqual(['layers', 0]) // 选择升级链未走
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.store.history).toHaveLength(0)
        cleanup()
    })

    it('Esc 取消画拉（画拉态）：会话清除零文档写入，随后的抬手空转', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [] })
        editor.armLayerCreate('TextLayer')

        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
        dispatchPointer('pointermove', { clientX: 200, clientY: 160 })
        dispatchKey('Escape')
        expect(editor.store.ui.create).toBeNull()
        expect(editor.store.ui.armedCreate).toBeNull()
        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.history).toHaveLength(0)

        dispatchPointer('pointerup', { clientX: 200, clientY: 160 }) // 会话已清：空转
        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.ui.editing).toBeNull()
        cleanup()
    })

    it('文本层画完自动进入编辑会话（spec 决策 6「画框即打字」）', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [] })
        editor.armLayerCreate('TextLayer')

        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
        dispatchPointer('pointermove', { clientX: 200, clientY: 160 })
        dispatchPointer('pointerup', { clientX: 200, clientY: 160 })
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(editor.store.ui.editing?.path).toEqual(['layers', 0])
        cleanup()
    })

    it('非文本层仅选中不进编辑', () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [] })
        editor.armLayerCreate('QrCodeLayer')

        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
        dispatchPointer('pointermove', { clientX: 200, clientY: 160 })
        dispatchPointer('pointerup', { clientX: 200, clientY: 160 })
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(editor.store.ui.editing).toBeNull()
        cleanup()
    })

    it('武装态 crosshair 光标：待命即现、画拉中保持、落库解除随武装清空', async () => {
        const { editor, cleanup } = mountSurface()
        editor.openDocument({ width: 800, height: 600, layers: [] })
        const host = () => surfaceHost() as HTMLElement

        editor.armLayerCreate('TextLayer')
        await nextTick() // 光标经响应式桥 → 样式绑定，等待渲染刷新
        expect(host().style.cursor).toBe('crosshair') // 武装待命

        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
        dispatchPointer('pointermove', { clientX: 200, clientY: 160 })
        await nextTick()
        expect(host().style.cursor).toBe('crosshair') // 画拉中一次定死

        dispatchPointer('pointerup', { clientX: 200, clientY: 160 })
        await nextTick()
        expect(host().style.cursor).toBe('') // 建层解除武装，光标还原
        cleanup()
    })

    it('橡皮筋呈现（gizmo 同缝组合画笔）：虚线矩形 + W×H 气泡随会话，落库即撤', () => {
        const bandCtx = bandRecorder()
        const { editor, scheduler, cleanup } = mountSurface((editor) => (args) =>
            drawCreateRubberBand(bandCtx as unknown as CanvasRenderingContext2D, editor, args),
        )
        editor.openDocument({ width: 800, height: 600, layers: [] })
        editor.armLayerCreate('TextLayer')

        // 按下即建会话但零尺寸不画；合帧语义下 move 后的 flush 画的是最新 rect
        dispatchPointer('pointerdown', { button: 0, clientX: 100, clientY: 100 })
        dispatchPointer('pointermove', { clientX: 180, clientY: 140 })
        scheduler.flush()
        expect(bandCtx.strokes).toEqual(['stroke:100,100,80,40'])
        expect(bandCtx.texts).toEqual(['80 × 40'])

        dispatchPointer('pointermove', { clientX: 220, clientY: 200 })
        scheduler.flush()
        expect(bandCtx.texts).toEqual(['80 × 40', '120 × 100']) // 气泡跟随橡皮筋

        dispatchPointer('pointerup', { clientX: 220, clientY: 200 })
        scheduler.flush()
        expect(bandCtx.texts).toEqual(['80 × 40', '120 × 100']) // 会话清空：不再画
        expect(bandCtx.strokes).toHaveLength(2) // 落库帧只有清屏（无新笔画）
        cleanup()
    })
})
