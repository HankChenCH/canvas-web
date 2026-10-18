// @vitest-environment jsdom
/**
 * CanvasSurface 右键底图命中解析（canvas-background 工单 05）mount 测试：
 * - 命中未中时按底图候选兜底：豁免使头根覆盖图片层自身盒退出正常命中面，
 *   右键空白处（只有底图垫着）解析出该层并开菜单——「转为画布背景」的入口前提；
 * - 无底图候选的未中照旧关菜单（存量行为零改动）；左键路径不经过这里
 *   （pointerdown 点选照旧穿透，hitTest 豁免保留不动）。
 *
 * jsdom 无 2D context/ResizeObserver/matchMedia，按组件契约补最小桩；重绘用
 * 手动帧调度器（不泵帧，呈现零驱动，断言面在内核态与菜单 DOM）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import CanvasSurface from '../../src/canvas/CanvasSurface.vue'
import { baseImageLayer, textLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

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
// jsdom 无 pointer capture（拖动/平移手势抓取依赖）：补不抛错的空实现
if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => false, configurable: true })
}

beforeAll(() => {
    // 菜单钳位量测（openAt 打开后按实际尺寸钳位）；jsdom rect 恒零即可（不断言位置）
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    )
})
afterAll(() => {
    vi.restoreAllMocks()
})

function mountSurface(layers: Parameters<EditorSession['openDocument']>[0]['layers']) {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, background: null, layers: [...layers] })
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(CanvasSurface, { props: { editor }, attachTo: hostEl })
    const host = wrapper.element as HTMLElement
    const contextmenu = (clientX: number, clientY: number) => {
        host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }))
    }
    return { editor, host, contextmenu, cleanup() { wrapper.unmount(); hostEl.remove(); editor.dispose() } }
}

describe('右键底图命中解析（canvas-background 工单 05）', () => {
    it('命中未中且底图垫底：解析出底图并开菜单（转换入口前提）', async () => {
        const surface = mountSurface([baseImageLayer(), textLayer({ priority: 20, position: { anchor: 'top-left', x: 40, y: 40 } })])
        // 点在底图自身盒区域（内容层之外）——正常命中面拿不到任何层
        surface.contextmenu(700, 500)
        await vi.waitFor(() => {
            expect(document.body.querySelector('.cn-context-menu')).not.toBeNull()
        })
        expect(surface.editor.store.ui.selection).toEqual(['layers', 0])
        // 菜单带转换项（可用态由内核门裁定：条件内 → 可点）
        const item = Array.from(document.body.querySelectorAll('button[role="menuitem"]')).find(
            (b) => b.textContent === '转为画布背景',
        ) as HTMLButtonElement
        expect(item).toBeDefined()
        expect(item.disabled).toBe(false)
        surface.cleanup()
    })

    it('未中且无底图候选：照旧关菜单、清选择（存量行为零改动）', async () => {
        const surface = mountSurface([baseImageLayer({ shape: { width: 400, height: 300 } })])
        surface.contextmenu(700, 500)
        await vi.waitFor(() => {
            expect(document.body.querySelector('.cn-context-menu')).toBeNull()
        })
        expect(surface.editor.store.ui.selection).toBeNull()
        surface.cleanup()
    })

    it('左键点选不经过底图解析：豁免照旧穿透（点底图空白处不选中它）', () => {
        const surface = mountSurface([baseImageLayer()])
        surface.host.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 700, clientY: 500 }))
        surface.host.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: 700, clientY: 500 }))
        expect(surface.editor.store.ui.selection).toBeNull()
        surface.cleanup()
    })
})
