// @vitest-environment jsdom
/**
 * CanvasSurface 呈现环境加固（工单 15，M3.8 验收项）：
 * - contextlost：preventDefault() 声明可恢复（MDN——不拦即永久丢失，restored 不会来）
 * - contextrestored：恢复后绘图缓冲被清空 → 强制全量重绘（内容层 begin 恰一次 +
 *   覆盖层画笔被调），两层各自挂了监听
 * - DPR 变更（跨屏拖动/系统缩放）：分辨率媒体查询自再注册 → setDevicePixelRatio
 *   传导进会话（覆盖层收到的 dpr = 新值），双层重绘；画布坐标语义不变（不漂移）
 *
 * jsdom 无真实 2D context/ResizeObserver/matchMedia，按组件契约补最小桩：
 * 重绘驱动用手动帧调度器，呈现结果经录制后端与覆盖层画笔读数断言。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type OverlayPainter } from '@hankchen/canvas-next-editor'

import CanvasSurface from '../src/CanvasSurface.vue'

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

function mountSurface() {
    const scheduler = manualScheduler()
    const editor = new EditorSession({ scheduleFrame: scheduler })
    const backend = recordingBackend()
    const overlayDprs: number[] = []
    const overlayPainter: OverlayPainter = (args) => overlayDprs.push(args.dpr)

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

    it('同帧合帧：未 flush 前连续两次 dpr 变更合并为一帧重绘（终值生效）', () => {
        const { scheduler, overlayDprs, cleanup } = mountSurface()

        setDevicePixelRatio(2)
        fireDprChange()
        setDevicePixelRatio(3)
        fireDprChange()
        scheduler.flush()

        expect(overlayDprs).toEqual([3])
        cleanup()
    })
})
