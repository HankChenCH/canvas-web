// @vitest-environment jsdom
/**
 * 编辑浮层工具条 + 表达式补全画布接线集成测试（canvas-web-edit-overlay-toolbar
 * 工单 03；前身 contentPill.mount.test.ts——内容类型切换浮层原地演进为工具条首段）。
 *
 * 全链路（真实候选源 = 内核枚举器，非桩）：工具条骨架随编辑会话开合（此时仅内容
 * 类型一段，选中态不显示）；切换仅翻会话标志（零文档变更零历史步、textarea 实况
 * 保持）；屏幕恒定定位换算（图层框上缘中点的屏幕折算锚点、无 scale 变换——尺寸
 * 恒定可读可点，锚点随相机/缩放跟随；上缘放不下翻框下缘、水平钳制画布视口）；
 * 豁免集两目标（textarea + 整条工具条）；Esc 双态分流（浮层开着只关浮层）与
 * Ctrl/Cmd+Enter 提交优先于候选接受（监听次序钉住）；补全绑定 enabled 随会话
 * 模式翻转与候选源同源；锚点 scale 折算消费（zoom 传入 measureCursorAnchor）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import {
    createTemplateTable,
    EditorSession,
    type FrameScheduler,
    type LayerPath,
} from '@hankchen/canvas-editor'

// 锚点测量打桩透传（包真实实现）：钉「画布 zoom 进 scale 参数」的接线面——
// 折算公式归 completionAnchor.test（工单 02），本文件只钉 composable 的消费
vi.mock('../../src/shared/completionAnchor', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/completionAnchor')>()
    return { ...actual, measureCursorAnchor: vi.fn(actual.measureCursorAnchor) }
})
import { measureCursorAnchor } from '../../src/shared/completionAnchor'

import { textLayer } from '../../../canvas-editor/tests/support/fixtures'
import CanvasSurface from '../../src/canvas/CanvasSurface.vue'
import TextEditingOverlay from '../../src/canvas/TextEditingOverlay.vue'

// jsdom 不实现 matchMedia：补最小桩（测试环境 dpr 恒 1，change 永不触发）
if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

// CanvasSurface 呈现环境桩（canvasSurface.mount.test 同款）：jsdom 无 ResizeObserver
// 与 pointer capture
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
if (typeof globalThis.ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub
}
if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: () => {}, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => false, configurable: true })
}

/**
 * 工具条屏幕恒定尺寸桩：jsdom 无布局（offsetWidth/Height 恒 0），翻转/钳制/水平
 * 居中的换算断言需要确定尺寸——原型 getter 按根类名返回桩值（精确 token 匹配，
 * 其余元素照旧 0；本文件环境隔离，不外泄）。实现经 offsetWidth/offsetHeight 实测
 * （真实浏览器由 ResizeObserver 跟随），桩值即替身。
 */
const TOOLBAR_SIZE = { width: 240, height: 28 }
for (const prop of ['offsetWidth', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) {
            if (!this.classList.contains('cn-edit-toolbar')) return 0
            return prop === 'offsetWidth' ? TOOLBAR_SIZE.width : TOOLBAR_SIZE.height
        },
    })
}

const nullScheduler: FrameScheduler = () => () => {}

/** 载荷形态 schema（与面板接线测试同款键树；order.items = 行数组） */
const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        order: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: '订单行明细',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: '商品名称' },
                            quantity: { type: 'number', description: '数量' },
                        },
                    },
                },
            },
        },
    },
}

type OverlayWrapper = ReturnType<typeof mountOverlay>

// 清理数组只消费 unmount（类型不回指 mountOverlay，避免 ReturnType 循环推导）
const wrappers: { unmount(): void }[] = []

function makeEditor(layers: Parameters<EditorSession['openDocument']>[0]['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    // 画布视口尺寸（翻转/钳制边界）：真实装配里由 CanvasSurface 呈现环境同步
    editor.setSurfaceSize(800, 600)
    return editor
}

function mountOverlay(editor: EditorSession) {
    // 挂进宿主容器：getHost = 根元素 parentElement（真实装配里宿主 = surface 根 div）
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(TextEditingOverlay, { props: { editor }, attachTo: hostEl })
    wrappers.push(wrapper)
    return wrapper
}

/**
 * 进入编辑并等初值注入落定：进入 watch 的 async 续体（textarea 挂载后写初值/
 * 聚焦/全选）比首个 nextTick 晚一拍微任务——textEditingOverlay.mount.test
 * 「全选保持」用例同款 setTimeout 口径；落定后才允许直写 textarea 实况
 * （非受控契约：晚到的初值注入不得覆盖编辑内容，测试亦然）。
 */
async function beginEditing(wrapper: OverlayWrapper, path: LayerPath): Promise<void> {
    expect(wrapper.vm.beginTextEdit(path)).toBe(true)
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
}

/** 模拟在编辑 textarea 输入：直设 DOM 值 + 光标再派发 input（面板接线测试同款） */
async function type(wrapper: OverlayWrapper, value: string, cursor: number): Promise<void> {
    const field = wrapper.find('textarea')
    field.element.value = value
    ;(field.element as HTMLTextAreaElement).setSelectionRange(cursor, cursor)
    await field.trigger('input')
}

const toolbar = (wrapper: OverlayWrapper) => wrapper.find('[data-edit-toolbar]')
const pill = (wrapper: OverlayWrapper) => wrapper.find('[data-content-pill]')
const pillButton = (wrapper: OverlayWrapper, kind: 'static' | 'expression') =>
    wrapper.find(`[data-pill-${kind}]`)
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null
const optionSegments = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-completion__option')).map(
        (option) => option.querySelector('.cn-completion__segment')?.textContent ?? '',
    )

async function clickPill(wrapper: OverlayWrapper, kind: 'static' | 'expression'): Promise<void> {
    await pillButton(wrapper, kind).trigger('click')
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

beforeEach(() => {
    vi.mocked(measureCursorAnchor).mockClear()
})

describe('工具条骨架随编辑会话开合（此时仅内容类型一段）', () => {
    it('非编辑态不渲染工具条', () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)

        expect(toolbar(wrapper).exists()).toBe(false)
    })

    it('选中态（非编辑）不渲染工具条：工具条仅编辑会话期在场', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 40, y: 30 } })])
        const wrapper = mountOverlay(editor)

        editor.setSelection(['layers', 0])
        await nextTick()

        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(toolbar(wrapper).exists()).toBe(false)
    })

    it('字面层进入编辑：工具条挂载且静态项激活（骨架期仅内容类型一段）；提交退出随 textarea 同卸载', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)

        await beginEditing(wrapper, ['layers', 0])

        expect(toolbar(wrapper).exists()).toBe(true)
        expect(toolbar(wrapper).attributes('role')).toBe('toolbar')
        expect(pill(wrapper).exists()).toBe(true)
        // 骨架期单段：工具条内只有内容类型段一组子件（工单 04 续接五组样式段）
        expect(toolbar(wrapper).element.children).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(true)
        expect(pillButton(wrapper, 'static').attributes('aria-pressed')).toBe('true')
        expect(pillButton(wrapper, 'expression').attributes('aria-pressed')).toBe('false')

        // 提交退出（串未变化零历史）：工具条与 textarea 同生共死
        await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(editor.store.ui.editing).toBeNull()
        expect(toolbar(wrapper).exists()).toBe(false)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('标记层进入编辑：表达式项激活（进入瞬间锚定，激活态 = 提交去向权威视图）', async () => {
        const editor = makeEditor([textLayer({ text: '{{orderNo}}', expression: '{{orderNo}}' })])
        const wrapper = mountOverlay(editor)

        await beginEditing(wrapper, ['layers', 0])

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })
        expect(pillButton(wrapper, 'expression').attributes('aria-pressed')).toBe('true')
        expect(pillButton(wrapper, 'static').attributes('aria-pressed')).toBe('false')
    })
})

describe('内容类型段切换：仅翻会话标志（零文档变更零历史步）', () => {
    it('字面会话点表达式：会话标志翻转、层文档零变更、零历史步、textarea 实况保持', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const textarea = wrapper.find('textarea')
        textarea.element.value = '草稿{{'

        await clickPill(wrapper, 'expression')

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })
        expect(editor.store.history).toHaveLength(0)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('你好画布')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(pillButton(wrapper, 'expression').attributes('aria-pressed')).toBe('true')
        expect(textarea.element.value).toBe('草稿{{')

        // 切回静态：同一会话内往返，仍零历史步
        await clickPill(wrapper, 'static')
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(editor.store.history).toHaveLength(0)
    })

    it('标记会话点静态：会话标志翻转、层标记保持（文档未动，提交去向随会话）', async () => {
        const editor = makeEditor([textLayer({ text: '{{orderNo}}', expression: '{{orderNo}}' })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        await clickPill(wrapper, 'static')

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(editor.store.history).toHaveLength(0)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo}}')
        expect(pillButton(wrapper, 'static').attributes('aria-pressed')).toBe('true')
    })

    it('切换后的激活态即提交去向：表达式会话提交含合法片段串保持标记', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        await clickPill(wrapper, 'expression')
        const textarea = wrapper.find('textarea')
        textarea.element.value = '{{orderNo}}'
        await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true })
        await nextTick()

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo}}')
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{orderNo}}')
        expect(editor.store.history).toHaveLength(1)
    })
})

describe('屏幕恒定定位：上缘中点锚随图层框与相机，尺寸不随 zoom（ADR 0019 两套换算系分叉）', () => {
    /**
     * 断言口径（stub 工具条 240×28、画布视口 800×600、间隙 4、cam 默认 (0,0)）：
     * 左 = clamp(锚x − 120, 0, 560)；上 = 锚上y − 32（上缘放不下翻框下缘，见翻转
     * describe）。无 transform：屏幕坐标定位，无 scale 变换 = 尺寸恒定的换算面。
     */
    const expectPlacedAt = (wrapper: OverlayWrapper, left: number, top: number) => {
        const style = toolbar(wrapper).attributes('style') ?? ''
        expect(style).toContain(`left: ${left}px`)
        expect(style).toContain(`top: ${top}px`)
        expect(style).not.toContain('transform')
        expect(style).not.toContain('scale')
    }

    it('zoom 1：工具条水平居中悬挂图层框上缘中点上方（间隙 4px）', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 200, y: 100 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        // 盒 (200,100,100,50)：上缘中点 (250,100) → 左 250−120=130、上 100−4−28=68
        expectPlacedAt(wrapper, 130, 68)
    })

    it.each([
        [0.2, 600, 200, 10, 8],
        [2, 200, 100, 380, 168],
        [5, 60, 100, 430, 468],
    ])('zoom %s：锚点按 zoom 折算、无 scale 变换（0.2×/5× 下尺寸恒定可读可点）', async (zoom, x, y, left, top) => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x, y } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        editor.zoomAt(0, 0, zoom)
        await nextTick()

        expectPlacedAt(wrapper, left, top)
    })

    it('相机平移跟随：锚点随 cam 实时折算（元素不重建）', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 200, y: 100 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const el = toolbar(wrapper).element

        editor.panBy(-10, -20) // cam += (10, 20)
        await nextTick()

        // 锚点 (250−10, 100−20) = (240, 80) → 左 120、上 48
        expectPlacedAt(wrapper, 120, 48)
        expect(toolbar(wrapper).element).toBe(el)
    })
})

describe('翻转与水平钳制：上缘放不下翻框下缘，水平钳画布视口', () => {
    const styleOf = (wrapper: OverlayWrapper) => toolbar(wrapper).attributes('style') ?? ''

    it('图层框贴画布上缘：工具条翻到框下缘（悬挂框下缘中点下方，间隙 4px）', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 200, y: 20 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        // 锚上y 20：上缘空间 20 − 4 < 28 放不下 → 翻框下缘：上 = (20+50)+4 = 74
        expect(styleOf(wrapper)).toContain('left: 130px')
        expect(styleOf(wrapper)).toContain('top: 74px')
    })

    it('zoom 0.2 贴上缘小盒：翻转 + 左钳 0（复合边界）', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 200, y: 20 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        editor.zoomAt(0, 0, 0.2)
        await nextTick()

        // 锚上y 4 放不下 → 翻：上 = 70×0.2+4 = 18；锚x 50 − 120 < 0 → 左钳 0
        expect(styleOf(wrapper)).toContain('left: 0px')
        expect(styleOf(wrapper)).toContain('top: 18px')
    })

    it('窄盒贴左缘：水平钳制在画布视口左边界', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 0, y: 100 }, shape: { width: 40 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        // 锚x 20 − 120 < 0 → 左钳 0；上缘 100 放得下：上 = 68
        expect(styleOf(wrapper)).toContain('left: 0px')
        expect(styleOf(wrapper)).toContain('top: 68px')
    })

    it('窄盒贴右缘：水平钳制在画布视口右边界（视口宽 − 工具条宽）', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 760, y: 100 }, shape: { width: 40 } })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        // 锚x 780 − 120 = 660 > 800 − 240 = 560 → 右钳 560
        expect(styleOf(wrapper)).toContain('left: 560px')
        expect(styleOf(wrapper)).toContain('top: 68px')
    })

    it('画布视口窄于工具条：钳 0 而不出负位', async () => {
        const editor = makeEditor([textLayer({ position: { anchor: 'top-left', x: 200, y: 100 } })])
        editor.setSurfaceSize(200, 600)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        // 视口宽 200 < 条宽 240：右界 max(0, 200−240) = 0 → 左钳 0
        expect(styleOf(wrapper)).toContain('left: 0px')
        expect(styleOf(wrapper)).toContain('top: 68px')
    })
})

describe('豁免集：textarea + 整条工具条（表面组件指针分流用）', () => {
    it('ownsEventTarget 覆盖 textarea 与工具条内目标，外部元素除外', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        expect(wrapper.vm.ownsEventTarget(wrapper.find('textarea').element)).toBe(true)
        expect(wrapper.vm.ownsEventTarget(toolbar(wrapper).element)).toBe(true)
        expect(wrapper.vm.ownsEventTarget(pillButton(wrapper, 'expression').element)).toBe(true)
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        expect(wrapper.vm.ownsEventTarget(outside)).toBe(false)
    })

    it('表面组件 pointerdown 命中工具条：不提交（commitNow）、不点选（selectAt）、会话保持', async () => {
        // 编辑层上方再放一层：豁免失效时 pointerdown 会提交并顺路点选上方层
        const surfaceEditor = new EditorSession({ scheduleFrame: nullScheduler })
        surfaceEditor.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ position: { anchor: 'top-left', x: 65, y: 0 }, priority: 20 }),
                textLayer({ position: { anchor: 'top-left', x: 40, y: 30 }, priority: 10 }),
            ],
        })
        // 表面装配（CanvasSurface 自同步呈现环境，jsdom 下视口 0×0）：断言只吃
        // 指针分流语义，不吃工具条落位
        const hostEl = document.createElement('div')
        document.body.appendChild(hostEl)
        const surface = mount(CanvasSurface, { props: { editor: surfaceEditor }, attachTo: hostEl })
        wrappers.push(surface)

        expect(surfaceEditor.beginTextEdit(['layers', 1])).toBe(true)
        await nextTick()
        surfaceEditor.setSelection(['layers', 1])

        const button = surface.find('[data-pill-static]')
        expect(button.exists()).toBe(true)
        const event = new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
        })
        button.element.dispatchEvent(event)
        await nextTick()

        expect(event.defaultPrevented).toBe(true) // 不夺焦（免 blur 提交路径）
        expect(surfaceEditor.store.ui.editing).toEqual({ path: ['layers', 1], expression: false })
        expect(surfaceEditor.store.ui.selection).toEqual(['layers', 1]) // 未点选换层
        expect(surfaceEditor.store.ui.drag).toBeNull() // 未开拖动会话
        expect(surfaceEditor.store.history).toHaveLength(0)
    })
})

describe('Esc 合流：双态分流', () => {
    const markedDoc = () => [textLayer({ text: '{{', expression: '{{' })]

    it('补全浮层开着：Esc 只关浮层（会话保持零提交）；再按 Esc 才提交退出', async () => {
        const editor = makeEditor(markedDoc())
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(true)

        await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(popupOpen()).toBe(false)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })
        expect(editor.store.history).toHaveLength(0)
        expect(wrapper.find('textarea').exists()).toBe(true)

        // 浮层关着：Esc 走既有提交路径（表达式会话含合法片段 → 保持标记）
        await type(wrapper, '{{orderNo}}', 12)
        await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
        await nextTick()
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo}}')
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it.each([
        ['Ctrl', { ctrlKey: true }],
        ['Cmd', { metaKey: true }],
    ])('%s+Enter 提交优先于候选接受：浮层开着提交实况串（候选未被接受），监听次序钉住', async (_label, mods) => {
        const editor = makeEditor(markedDoc())
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        await type(wrapper, '{{or', 5)
        expect(popupOpen()).toBe(true)

        // 浮层开着 Ctrl/Cmd+Enter：提交先落（高亮候选 orderNo 不被接受）——提交串 =
        // 实况 '{{or'（无合法闭合片段 → 表达式会话回落字面写解标，工单 01 提交矩阵）
        await wrapper.find('textarea').trigger('keydown', { key: 'Enter', ...mods })
        await nextTick()

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{or')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('点画布路径（exposed commitEditing）：浮层开着提交编辑，浮层随会话收口各走各的', async () => {
        const editor = makeEditor(markedDoc())
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        await type(wrapper, '{{or', 5)
        expect(popupOpen()).toBe(true)

        wrapper.vm.commitEditing()
        await nextTick()

        // 提交走表面漏斗（一步历史、退出编辑），关浮层随会话收口（enabled 翻转
        // → composable watcher）——spec 决策 7「点画布 = 关浮层 + 提交各走各的」
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.ui.editing).toBeNull()
        expect(popupOpen()).toBe(false)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })
})

describe('补全绑定：enabled 随会话模式翻转、候选源与面板同源', () => {
    it('静态会话恒闭：输入 {{ 零补全零配对；工具条切表达式后实时开（配对 + 根候选集）', async () => {
        const editor = makeEditor([textLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(false)
        expect(wrapper.find('textarea').element.value).toBe('{{') // 零配对（静态 {{ 是字面）

        // 工具条切表达式：enabled 实时翻转，同一 textarea 内 {{ 即配对出 }} 并弹候选
        await clickPill(wrapper, 'expression')
        await type(wrapper, '{{', 2)
        expect(wrapper.find('textarea').element.value).toBe('{{}}')
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root'])
    })

    it('工具条切静态：开着的浮层即时关（enabled watcher 关浮层）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(true)

        await clickPill(wrapper, 'static')
        expect(popupOpen()).toBe(false)
        expect(wrapper.find('textarea').exists()).toBe(true)
    })

    it('模板格内容层：row. 上下文自动正确（与面板同源，行候选集下钻 items 键树）', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const contentPath: LayerPath = ['layers', 0, 'template', 'cells', 0, 'content']
        editor.updateDataExpression(contentPath, '{{row.')
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, contentPath)
        expect(editor.store.ui.editing).toEqual({ path: contentPath, expression: true })
        expect(wrapper.find('textarea').exists()).toBe(true)

        await type(wrapper, '{{row.', 6)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['name', 'quantity'])
    })

    it('锚点 scale 折算消费：补全重定位把画布 zoom 传入 measureCursorAnchor', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        editor.zoomAt(0, 0, 2)
        await nextTick()
        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(true)

        const textarea = wrapper.find('textarea').element
        expect(vi.mocked(measureCursorAnchor)).toHaveBeenCalledWith(textarea, 2)
    })
})
