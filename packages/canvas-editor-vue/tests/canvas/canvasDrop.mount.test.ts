// @vitest-environment jsdom
/**
 * CanvasSurface 拖文件入画布（kbd-nav 工单 05，spec 决策 6）mount 测试：
 * - mime 过滤：只收 image/*，非图片静默忽略（不建层不反馈）；
 * - 落点折算：释放点经 toScenePoint 折算，图层盒左上角对准场景点；
 * - 1:1 自然尺寸：DOM Image 解码传入 size，不缩放；
 * - 多文件级联：按序循环上传、逐个 +16 场景 px 偏移；
 * - canUpload=false：drop 静默忽略 + 状态栏瞬时反馈（上传语义）；
 * - 编辑态先提交：drop 前先落文本编辑会话（右键菜单同款前置）；
 * - dragover 高亮 overlay 显隐与 drop 后清除。
 *
 * jsdom 无 DragEvent/DataTransfer/Image 实载：事件用 Event + dataTransfer 手工
 * 桩、自然尺寸解码用 FakeImage 桩（同步回 naturalWidth/Height）。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { EditorSession, type FrameScheduler, type UploadFile, type UploadHandler } from '@hankchen/canvas-editor'

import CanvasSurface from '../../src/canvas/CanvasSurface.vue'
import { useTransientFeedback } from '../../src/shared/useTransientFeedback'

const nullScheduler: FrameScheduler = () => () => {}

// ---- DOM 桩：matchMedia / ResizeObserver / Image 解码 / objectURL ----

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

/** 解码桩的自然尺寸（测试逐案改写） */
let decodedSize = { width: 300, height: 200 }
class FakeImage {
    naturalWidth = 0
    naturalHeight = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) {
        this.naturalWidth = decodedSize.width
        this.naturalHeight = decodedSize.height
        queueMicrotask(() => this.onload?.())
    }
}

beforeAll(() => {
    vi.stubGlobal('Image', FakeImage)
    // jsdom 环境的 URL.createObjectURL 是 Node 实现，不认 jsdom File（直接抛错）：
    // 解码桩统一替换为假 URL（真实浏览器行为不受影响）
    ;(URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:mock'
    ;(URL as unknown as Record<string, unknown>).revokeObjectURL = () => {}
})
afterAll(() => {
    vi.unstubAllGlobals()
})

afterEach(() => {
    // 瞬时反馈是模块级单例：显式清态免跨测试串扰（TTL 4s 内不自然过期）
    useTransientFeedback().clear()
    decodedSize = { width: 300, height: 200 }
})

// ---- 装配与事件桩 ----

const pngFile = (name = 'photo.png'): File => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
const txtFile = (name = 'notes.txt'): File => new File([new Uint8Array([4])], name, { type: 'text/plain' })

interface DragInit {
    clientX?: number
    clientY?: number
    relatedTarget?: Node | null
}

/** jsdom 无 DragEvent：普通 Event + dataTransfer 手工桩（items 供 dragover 过滤、files 供 drop 取字节） */
function dragEvent(type: 'dragover' | 'drop' | 'dragleave', files: readonly File[], init: DragInit = {}): DragEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'clientX', { value: init.clientX ?? 0 })
    Object.defineProperty(event, 'clientY', { value: init.clientY ?? 0 })
    if (init.relatedTarget !== undefined) Object.defineProperty(event, 'relatedTarget', { value: init.relatedTarget })
    Object.defineProperty(event, 'dataTransfer', {
        value: {
            dropEffect: 'none',
            items: files.map((f) => ({ kind: 'file', type: f.type })),
            files: [...files],
        },
    })
    return event
}

function mountSurface(uploadHandler?: UploadHandler) {
    const editor = new EditorSession({ scheduleFrame: nullScheduler, uploadHandler })
    editor.openDocument({ width: 800, height: 600, layers: [] })
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(CanvasSurface, { props: { editor }, attachTo: hostEl })
    const host = wrapper.element as HTMLElement
    const dispatch = (event: Event) => {
        host.dispatchEvent(event)
        return event
    }
    return {
        editor,
        /** 画布宿主（事件桥挂点） */
        host,
        drop: (files: readonly File[], init: DragInit = {}) => dispatch(dragEvent('drop', files, init)),
        dragover: (files: readonly File[], init: DragInit = {}) => dispatch(dragEvent('dragover', files, init)),
        dragleave: (init: DragInit = {}) => dispatch(dragEvent('dragleave', [], init)),
        cleanup() {
            wrapper.unmount()
            hostEl.remove()
            editor.dispose()
        },
    }
}

describe('drop：mime 过滤', () => {
    it('只收 image/*：混合文件只传图片；纯非图片静默忽略（无层、无反馈）', async () => {
        const handler = vi.fn(async (_file: UploadFile) => 'data:image/png;base64,AAA')
        const surface = mountSurface(handler)
        surface.drop([txtFile(), pngFile()], { clientX: 10, clientY: 10 })
        await flushPromises()
        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0]![0].name).toBe('photo.png')
        expect(surface.editor.store.doc!.layers).toHaveLength(1)

        const handler2 = vi.fn(async () => 'data:image/png;base64,AAA')
        const surface2 = mountSurface(handler2)
        surface2.drop([txtFile()], { clientX: 10, clientY: 10 })
        await flushPromises()
        expect(handler2).not.toHaveBeenCalled()
        expect(surface2.editor.store.doc!.layers).toHaveLength(0)
        expect(useTransientFeedback().message.value).toBe('')
        surface2.cleanup()
        surface.cleanup()
    })
})

describe('drop：落点折算与 1:1 自然尺寸', () => {
    it('缺省相机：图层盒左上角对准释放点（场景 = 屏幕），自然尺寸 1:1 不缩放', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        decodedSize = { width: 640, height: 480 }
        surface.drop([pngFile()], { clientX: 100, clientY: 50 })
        await flushPromises()
        const layer = surface.editor.store.doc!.layers[0]!
        expect(layer.position).toEqual({ anchor: 'top-left', x: 100, y: 50 })
        expect(layer.shape.width).toBe(640)
        expect(layer.shape.height).toBe(480)
        expect(surface.editor.store.ui.selection).toEqual(['layers', 0])
        expect(surface.editor.canUndo).toBe(true)
        surface.cleanup()
    })

    it('平移缩放下按场景点落盒（toScenePoint 折算，非屏幕点直用）', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        surface.editor.panBy(30, 40)
        surface.editor.zoomAt(0, 0, 2)
        const scene = surface.editor.toScenePoint(100, 50)
        expect(scene).not.toEqual({ x: 100, y: 50 }) // 折算确有发生的前提
        surface.drop([pngFile()], { clientX: 100, clientY: 50 })
        await flushPromises()
        expect(surface.editor.store.doc!.layers[0]!.position).toEqual({
            anchor: 'top-left',
            x: scene.x,
            y: scene.y,
        })
        surface.cleanup()
    })
})

describe('drop：多文件按序级联', () => {
    it('逐个 +16 场景 px 偏移、按序上传', async () => {
        const handler = vi.fn(async (file: { name: string }) => `data:image/png;base64,${file.name}`)
        const surface = mountSurface(handler as unknown as UploadHandler)
        surface.drop([pngFile('a.png'), pngFile('b.png'), pngFile('c.png')], { clientX: 100, clientY: 50 })
        await flushPromises()
        expect(handler).toHaveBeenCalledTimes(3)
        expect(handler.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual(['a.png', 'b.png', 'c.png'])
        const positions = surface.editor.store.doc!.layers.map((l) => l.position)
        expect(positions).toEqual([
            { anchor: 'top-left', x: 100, y: 50 },
            { anchor: 'top-left', x: 116, y: 66 },
            { anchor: 'top-left', x: 132, y: 82 },
        ])
        surface.cleanup()
    })
})

describe('drop：canUpload=false 降级', () => {
    it('未注入上传实现：静默忽略（无层无历史）+ 状态栏瞬时反馈（上传语义）', async () => {
        const surface = mountSurface(undefined)
        surface.drop([pngFile()], { clientX: 10, clientY: 10 })
        await flushPromises()
        expect(surface.editor.store.doc!.layers).toHaveLength(0)
        expect(surface.editor.canUndo).toBe(false)
        expect(useTransientFeedback().message.value).toContain('上传不可用')
        surface.cleanup()
    })

    it('编辑态 + 未注入上传实现：drop 全程静默——编辑会话保持不提交（忽略 = 零副作用）', async () => {
        const surface = mountSurface(undefined)
        surface.editor.openDocument({
            width: 800,
            height: 600,
            layers: [
                {
                    type: 'TextLayer',
                    name: '',
                    visible: true,
                    priority: 0,
                    shape: {
                        width: 200,
                        height: 60,
                        autoWidth: false,
                        autoHeight: false,
                        lineHeight: 1.2,
                        padding: { top: 0, bottom: 0, left: 0, right: 0 },
                        border: { top: null, bottom: null, left: null, right: null },
                        backgroundColor: null,
                    },
                    align: { horizontal: 'left', vertical: 'top' },
                    position: { anchor: 'top-left', x: 0, y: 0 },
                    text: '原标题',
                    expression: null,
                    font: '',
                    fontSize: 24,
                    fontColor: '#111827',
                    angle: 0,
                    autowrap: false,
                },
            ],
        })
        expect(surface.editor.beginTextEdit(['layers', 0])).toBe(true)
        await flushPromises()
        surface.drop([pngFile()], { clientX: 10, clientY: 10 })
        await flushPromises()
        expect(surface.editor.store.ui.editing).not.toBeNull() // 未上传 = 不做编辑前置
        expect(useTransientFeedback().message.value).toContain('上传不可用')
        surface.cleanup()
    })
})

describe('drop：编辑态先提交', () => {
    it('文本编辑中 drop：先落编辑会话再上传建层', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        surface.editor.openDocument({
            width: 800,
            height: 600,
            layers: [
                {
                    type: 'TextLayer',
                    name: '',
                    visible: true,
                    priority: 0,
                    shape: {
                        width: 200,
                        height: 60,
                        autoWidth: false,
                        autoHeight: false,
                        lineHeight: 1.2,
                        padding: { top: 0, bottom: 0, left: 0, right: 0 },
                        border: { top: null, bottom: null, left: null, right: null },
                        backgroundColor: null,
                    },
                    align: { horizontal: 'left', vertical: 'top' },
                    position: { anchor: 'top-left', x: 0, y: 0 },
                    text: '原标题',
                    expression: null,
                    font: '',
                    fontSize: 24,
                    fontColor: '#111827',
                    angle: 0,
                    autowrap: false,
                },
            ],
        })
        expect(surface.editor.beginTextEdit(['layers', 0])).toBe(true)
        await flushPromises()
        const textarea = document.querySelector('textarea')
        expect(textarea).not.toBeNull()
        textarea!.value = '改过的标题'
        surface.drop([pngFile()], { clientX: 10, clientY: 10 })
        await flushPromises()
        expect(surface.editor.store.ui.editing).toBeNull()
        const first = surface.editor.store.doc!.layers[0]!
        expect(first.type === 'TextLayer' && first.text).toBe('改过的标题')
        expect(surface.editor.store.doc!.layers).toHaveLength(2) // 图片层已追加
        surface.cleanup()
    })
})

describe('dragover：高亮 overlay 显隐', () => {
    it('携带图片文件的拖拽：preventDefault 接管 + 高亮 overlay 显示', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        const event = surface.dragover([pngFile()])
        expect(event.defaultPrevented).toBe(true)
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).not.toBeNull()
        surface.cleanup()
    })

    it('非图片拖拽：不接管（浏览器缺省语义）且不高亮', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        const event = surface.dragover([txtFile()])
        expect(event.defaultPrevented).toBe(false)
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).toBeNull()
        surface.cleanup()
    })

    it('drop 后清除高亮；dragleave 离开宿主也清除', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        surface.dragover([pngFile()])
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).not.toBeNull()

        surface.drop([], { clientX: 10, clientY: 10 })
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).toBeNull()

        surface.dragover([pngFile()])
        await nextTick()
        surface.dragleave({ relatedTarget: null })
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).toBeNull()
        surface.cleanup()
    })

    it('宿主内子元素间移动的 dragleave 不撤高亮（relatedTarget 仍在宿主内）', async () => {
        const surface = mountSurface(async () => 'data:image/png;base64,AAA')
        surface.dragover([pngFile()])
        await nextTick()
        surface.dragleave({ relatedTarget: surface.host.firstElementChild })
        await nextTick()
        expect(surface.host.querySelector('[data-drop-hint]')).not.toBeNull()
        surface.cleanup()
    })
})
