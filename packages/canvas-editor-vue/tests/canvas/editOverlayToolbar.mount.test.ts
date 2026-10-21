// @vitest-environment jsdom
/**
 * 编辑浮层工具条 + 表达式补全画布接线集成测试（canvas-web-edit-overlay-toolbar
 * 工单 03/04；edit-toolbar-declutter 工票 03 下拉化——前身 contentPill.mount.test.ts，
 * 内容类型 pill 与对齐两段三键分别换装为下拉，七段折六段）。
 *
 * 全链路（真实候选源 = 内核枚举器，非桩）：工具条随编辑会话开合（六段单行，选中态
 * 不显示）；切换仅翻会话标志（零文档变更零历史步、textarea 实况保持）；屏幕恒定
 * 定位换算（图层框上缘中点的屏幕折算锚点、无 scale 变换——尺寸恒定可读可点，锚点
 * 随相机/缩放跟随；上缘放不下翻框下缘、水平钳制画布视口）；豁免集两目标（textarea +
 * 整条工具条）；Esc 双态分流（浮层开着只关浮层）与 Ctrl/Cmd+Enter 提交优先于候选
 * 接受（监听次序钉住）；补全绑定 enabled 随会话模式翻转与候选源同源；锚点 scale
 * 折算消费（zoom 传入 measureCursorAnchor）。
 *
 * 工票 03（下拉化 + Tooltip 化）：内容类型下拉（触发钮 = 当前态文字 + ▾，菜单两条
 * 纯文字项当前项打勾）与对齐两下拉（触发钮 = 当前值图标 + ▾，菜单项 = 图标 + 文字
 * + 当前项打勾）的交互全走「点触发钮开菜单 → 点菜单项」两步；aria-pressed 断言改
 * aria-checked（触发钮改 aria-expanded）；触发钮归输入件同门（@pointerdown.stop
 * 放行夺焦——夺焦 blur 落豁免窗、会话保持；「pointerdown 不夺焦」断言迁到自动换
 * 行钮）。写入门语义零变化：面板同门权威写（updateSpec + `sel:path:key`
 * mergeKey）、步进合并、拾色 input/change 收口、字体注入缝、双入口并步、新层样式
 * 槽、表格格内容会话同等适用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'

import {
    createTemplateTable,
    EditorSession,
    resolveLayer,
    type FrameScheduler,
    type LayerPath,
} from '@hankchen/canvas-editor'

import { FONT_PICKER_KEY, type FontPickerContext } from '../../src/shared/fontPicker'

// 锚点测量打桩透传（包真实实现）：钉「画布 zoom 进 scale 参数」的接线面——
// 折算公式归 completionAnchor.test（工单 02），本文件只钉 composable 的消费
vi.mock('../../src/shared/completionAnchor', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/completionAnchor')>()
    return { ...actual, measureCursorAnchor: vi.fn(actual.measureCursorAnchor) }
})
import { measureCursorAnchor } from '../../src/shared/completionAnchor'

import type { DOMWrapper } from '@vue/test-utils'

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
 * （真实浏览器由 ResizeObserver 跟随），桩值即替身。真实条变窄（工票 03 六段）
 * 不影响桩断言，RO 跟随是运行时行为。
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
    editor.openDocument({ width: 800, height: 600, background: null, layers })
    // 画布视口尺寸（翻转/钳制边界）：真实装配里由 CanvasSurface 呈现环境同步
    editor.setSurfaceSize(800, 600)
    return editor
}

function mountOverlay(editor: EditorSession, options: { fontPicker?: FontPickerContext } = {}) {
    // 挂进宿主容器：getHost = 根元素 parentElement（真实装配里宿主 = surface 根 div）
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(TextEditingOverlay, {
        props: { editor },
        attachTo: hostEl,
        // 字体清单缝（工单 04 字体下拉段的注入形态；playground 同款 provide 面）
        global: options.fontPicker ? { provide: { [FONT_PICKER_KEY as symbol]: options.fontPicker } } : undefined,
    })
    wrappers.push(wrapper)
    return wrapper
}

/**
 * 进入编辑并等初值注入落定：进入 watch 的 async 续体（textarea 挂载后写初值/
 * 聚焦/全选）比首个 nextTick 晚一拍微任务——textEditingOverlay.mount.test
 * 「全选保持」用例同款 setTimeout 口径；落定后才允许直写 textarea 实况
 * （非受控契约：晚到的初值注入不得覆盖编辑内容，测试亦然）。返回 textarea
 * 包装（工单 04 起样式联动断言直接消费）。
 */
async function beginEditing(wrapper: OverlayWrapper, path: LayerPath): Promise<DOMWrapper<HTMLTextAreaElement>> {
    expect(wrapper.vm.beginTextEdit(path)).toBe(true)
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    return wrapper.find('textarea')
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
/** 内容类型触发钮（下拉化形态；data-content-pill 钩子留在段上，触发钮经 a11y 属性定位） */
const contentTrigger = (wrapper: OverlayWrapper) => wrapper.find('[data-content-pill] [aria-haspopup="menu"]')
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null
const optionSegments = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-completion__option')).map(
        (option) => option.querySelector('.cn-completion__segment')?.textContent ?? '',
    )

/**
 * 开一个下拉菜单（真实指针手势的四拍）：触发钮是输入件同门（@pointerdown.stop
 * 放行夺焦），pointerdown 先经窗口捕获桥置 blur 豁免 → click 开菜单、焦点入菜单
 * （夺焦 blur 落在豁免窗，会话保持）→ 宏任务排干微任务链等焦点落定 → pointerup
 * 复位豁免窗。缺 pointerdown 时焦点入菜单引发的 textarea blur 会走延迟提交、
 * 会话当场退出（正是工票 03 时序约束的测试面）。
 */
async function openMenu(trigger: DOMWrapper<Element>): Promise<void> {
    await trigger.trigger('pointerdown')
    await trigger.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await trigger.trigger('pointerup')
    await nextTick()
}

/** 内容类型两步交互：点触发钮开菜单 → 点菜单项 */
async function pickContentType(wrapper: OverlayWrapper, kind: 'static' | 'expression'): Promise<void> {
    await openMenu(contentTrigger(wrapper))
    await wrapper.find(`[data-pill-${kind}]`).trigger('click')
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

beforeEach(() => {
    vi.mocked(measureCursorAnchor).mockClear()
})

describe('工具条骨架随编辑会话开合（六段单行，工票 03 下拉化形态）', () => {
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

    it('字面层进入编辑：工具条挂载且内容类型触发钮显示当前态（静态 + ▾）；提交退出随 textarea 同卸载', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)

        await beginEditing(wrapper, ['layers', 0])

        expect(toolbar(wrapper).exists()).toBe(true)
        expect(toolbar(wrapper).attributes('role')).toBe('toolbar')
        expect(pill(wrapper).exists()).toBe(true)
        // 工票 03 起六段单行（段数断言见「六段单行」用例）
        expect(toolbar(wrapper).element.children).toHaveLength(6)
        expect(wrapper.find('textarea').exists()).toBe(true)
        // 触发钮 = 当前态文字 + ▾，a11y 两属性（aria-haspopup + :aria-expanded）
        const trigger = contentTrigger(wrapper)
        expect(trigger.attributes('aria-haspopup')).toBe('menu')
        expect(trigger.attributes('aria-expanded')).toBe('false')
        expect(trigger.text()).toContain('静态')

        // 提交退出（串未变化零历史）：工具条与 textarea 同生共死
        await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(editor.store.ui.editing).toBeNull()
        expect(toolbar(wrapper).exists()).toBe(false)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('标记层进入编辑：触发钮显示表达式（进入瞬间锚定，触发钮文字 = 提交去向权威视图）', async () => {
        const editor = makeEditor([textLayer({ text: '{{orderNo}}', expression: '{{orderNo}}' })])
        const wrapper = mountOverlay(editor)

        await beginEditing(wrapper, ['layers', 0])

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })
        expect(contentTrigger(wrapper).text()).toContain('表达式')
    })

    it('字面层进入编辑：工具条六段单行（工票 03：对齐两下拉同组，根段 7→6）', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)

        await beginEditing(wrapper, ['layers', 0])

        // 六段左→右：内容类型｜字体｜字号步进｜字色｜对齐组（两下拉）｜自动换行
        const root = toolbar(wrapper).element
        expect(root.children).toHaveLength(6)
        expect(wrapper.find('[data-content-pill]').element).toBe(root.children[0])
        expect(wrapper.find('[data-toolbar-font]').exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-font-size]').exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-font-size-dec]').exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-font-size-inc]').exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-font-color]').exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-autowrap]').exists()).toBe(true)
        // 对齐轴钩子挂触发钮（语义从「段」改挂「轴触发钮」，spec 决策 7）
        expect(wrapper.find('[data-toolbar-align-horizontal]').attributes('aria-haspopup')).toBe('menu')
        expect(wrapper.find('[data-toolbar-align-vertical]').attributes('aria-haspopup')).toBe('menu')
        // 菜单收起时菜单项不在场（data-align-* 钩子挂菜单项，随开随现）
        expect(wrapper.find('[data-align-h="left"]').exists()).toBe(false)
        expect(wrapper.find('[data-pill-static]').exists()).toBe(false)
    })

    it('对齐触发钮开菜单：当前值 aria-checked 打勾、aria-expanded 随开合；自动换行开关 aria-pressed 随文档现值', async () => {
        const editor = makeEditor([
            textLayer({ align: { horizontal: 'center', vertical: 'bottom' }, autowrap: true }),
        ])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        const hTrigger = wrapper.find('[data-toolbar-align-horizontal]')
        expect(hTrigger.attributes('aria-expanded')).toBe('false')
        await openMenu(hTrigger)
        expect(hTrigger.attributes('aria-expanded')).toBe('true')
        expect(wrapper.find('[data-align-h="center"]').attributes('aria-checked')).toBe('true')
        expect(wrapper.find('[data-align-h="left"]').attributes('aria-checked')).toBe('false')

        // 收起再开垂直轴
        await hTrigger.trigger('click')
        await nextTick()
        expect(hTrigger.attributes('aria-expanded')).toBe('false')
        await openMenu(wrapper.find('[data-toolbar-align-vertical]'))
        expect(wrapper.find('[data-align-v="bottom"]').attributes('aria-checked')).toBe('true')
        expect(wrapper.find('[data-align-v="top"]').attributes('aria-checked')).toBe('false')

        expect(wrapper.find('[data-toolbar-autowrap]').attributes('aria-pressed')).toBe('true')
    })
})

describe('内容类型段切换：仅翻会话标志（零文档变更零历史步）', () => {
    it('字面会话点表达式：会话标志翻转、层文档零变更、零历史步、textarea 实况保持', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const textarea = wrapper.find('textarea')
        textarea.element.value = '草稿{{'

        await pickContentType(wrapper, 'expression')

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })
        expect(editor.store.history).toHaveLength(0)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('你好画布')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(contentTrigger(wrapper).text()).toContain('表达式')
        expect(textarea.element.value).toBe('草稿{{')

        // 开菜单看当前项打勾：表达式项 aria-checked=true
        await openMenu(contentTrigger(wrapper))
        expect(wrapper.find('[data-pill-expression]').attributes('aria-checked')).toBe('true')
        expect(wrapper.find('[data-pill-static]').attributes('aria-checked')).toBe('false')

        // 切回静态：同一会话内往返，仍零历史步
        await wrapper.find('[data-pill-static]').trigger('click')
        await nextTick()
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(editor.store.history).toHaveLength(0)
    })

    it('标记会话点静态：会话标志翻转、层标记保持（文档未动，提交去向随会话）', async () => {
        const editor = makeEditor([textLayer({ text: '{{orderNo}}', expression: '{{orderNo}}' })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        await pickContentType(wrapper, 'static')

        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(editor.store.history).toHaveLength(0)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo}}')
        expect(contentTrigger(wrapper).text()).toContain('静态')
    })

    it('切换后的激活态即提交去向：表达式会话提交含合法片段串保持标记', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        await pickContentType(wrapper, 'expression')
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
    it('ownsEventTarget 覆盖 textarea、触发钮与开菜单后的菜单项，外部元素除外', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        expect(wrapper.vm.ownsEventTarget(wrapper.find('textarea').element)).toBe(true)
        expect(wrapper.vm.ownsEventTarget(toolbar(wrapper).element)).toBe(true)
        expect(wrapper.vm.ownsEventTarget(contentTrigger(wrapper).element)).toBe(true)
        // 开菜单后菜单项仍在工具条 DOM 子树内（fixed 定位不改变包含关系）
        await openMenu(contentTrigger(wrapper))
        expect(wrapper.vm.ownsEventTarget(wrapper.find('[data-pill-expression]').element)).toBe(true)
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        expect(wrapper.vm.ownsEventTarget(outside)).toBe(false)
    })

    it('表面组件 pointerdown 命中工具条（自动换行钮）：不夺焦（defaultPrevented）、不提交（commitNow）、不点选（selectAt）、会话保持', async () => {
        // 编辑层上方再放一层：豁免失效时 pointerdown 会提交并顺路点选上方层
        const surfaceEditor = new EditorSession({ scheduleFrame: nullScheduler })
        surfaceEditor.openDocument({
            width: 800,
            height: 600,
            background: null,
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

        // 「pointerdown 不夺焦（defaultPrevented）」断言迁到纯按钮（自动换行开关
        // ——按钮类走根拦 pointerdown 路径；触发钮是输入件同门，见输入件夺焦 describe）
        const button = surface.find('[data-toolbar-autowrap]')
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

// ---- 五组样式控件（面板同门权威写 + 实时联动；对齐两步交互） ----

describe('样式段权威写：面板同门（updateSpec + sel:path:key mergeKey）', () => {
    it('水平/垂直对齐下拉：点菜单项写 align、textarea 实时跟随、一次变更收口一步；重复选当前值零历史', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])

        await openMenu(wrapper.find('[data-toolbar-align-horizontal]'))
        await wrapper.find('[data-align-h="center"]').trigger('click')
        await nextTick()
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.align.horizontal).toBe('center')
        expect(textarea.element.style.textAlign).toBe('center')
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull() // 一次变更 = 收口一步

        await openMenu(wrapper.find('[data-toolbar-align-vertical]'))
        await wrapper.find('[data-align-v="bottom"]').trigger('click')
        await nextTick()
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.align.vertical).toBe('bottom')
        expect(editor.store.history).toHaveLength(2)

        // 重复选当前值（开菜单 → 点当前项）：不上报（免冗余历史步，AlignField 同门）
        await openMenu(wrapper.find('[data-toolbar-align-horizontal]'))
        await wrapper.find('[data-align-h="center"]').trigger('click')
        expect(editor.store.history).toHaveLength(2)
    })

    it('自动换行开关：切换写 autowrap，whiteSpace pre ↔ pre-wrap 随动', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])
        const toggle = wrapper.find('[data-toolbar-autowrap]')

        await toggle.trigger('click')
        await nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ autowrap: true })
        expect(textarea.element.style.whiteSpace).toBe('pre-wrap')
        expect(toggle.attributes('aria-pressed')).toBe('true')
        expect(editor.store.history).toHaveLength(1)

        await toggle.trigger('click')
        await nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ autowrap: false })
        expect(textarea.element.style.whiteSpace).toBe('pre')
        expect(editor.store.history).toHaveLength(2)
    })

    it('字色拾色：input 拖动实时合并（开放键）、change 收口一步历史', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])
        const color = wrapper.find<HTMLInputElement>('[data-toolbar-font-color]')

        color.element.value = '#ff0000'
        await color.trigger('input')
        await nextTick()
        expect(textarea.element.style.color).toBe('rgb(255, 0, 0)')
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBe('sel:layers.0:fontColor') // 拖动中开放

        // 继续拖动：并入同一步
        color.element.value = '#00ff00'
        await color.trigger('input')
        expect(editor.store.history).toHaveLength(1)

        // 抬手收口：一步闭合
        await color.trigger('change')
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontColor: '#00ff00' })
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
    })

    it('字体下拉（注入清单缝）：内置默认 + 清单项 + 清单外当前引用；change 写 font 一步', async () => {
        const editor = makeEditor([textLayer({ font: 'https://fonts.example/other.woff2' })])
        const wrapper = mountOverlay(editor, {
            fontPicker: {
                entries: shallowRef([{ label: '手写体', ref: 'https://fonts.example/hand.ttf' }]),
                canUpload: false,
                uploadFont: async () => '',
            },
        })
        const textarea = await beginEditing(wrapper, ['layers', 0])
        const select = wrapper.find<HTMLSelectElement>('[data-toolbar-font]')

        const options = Array.from(select.element.options)
        expect(options.map((option) => option.value)).toEqual([
            '',
            'https://fonts.example/hand.ttf',
            'https://fonts.example/other.woff2',
        ])

        select.element.value = 'https://fonts.example/hand.ttf'
        await select.trigger('change')
        await nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ font: 'https://fonts.example/hand.ttf' })
        expect(textarea.element.style.fontFamily).toContain('canvas-font-')
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
    })

    it('字体下拉（未注入清单缝）：退化内置默认 + 当前引用两态可选', async () => {
        const editor = makeEditor([textLayer({ font: 'https://fonts.example/other.woff2' })])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const select = wrapper.find<HTMLSelectElement>('[data-toolbar-font]')

        const options = Array.from(select.element.options)
        expect(options.map((option) => option.value)).toEqual(['', 'https://fonts.example/other.woff2'])

        select.element.value = ''
        await select.trigger('change')
        expect(editor.store.doc!.layers[0]).toMatchObject({ font: '' })
        expect(editor.store.history).toHaveLength(1)
    })

    it('字号步进 +/-：连续点按合并一步历史（nudge 同门开放键）、编辑框实时跟随', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])

        await wrapper.find('[data-toolbar-font-size-inc]').trigger('click')
        await wrapper.find('[data-toolbar-font-size-inc]').trigger('click')
        await wrapper.find('[data-toolbar-font-size-inc]').trigger('click')
        await nextTick()

        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 19 })
        expect(textarea.element.style.fontSize).toBe('19px')
        // 连续点按合并为一步；开放键 nudge 同门（靠收口/其它事务断开，不即时闭合）
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBe('sel:layers.0:fontSize')
        // 读数跟随（未聚焦草稿随文档同步）
        expect((wrapper.find('[data-toolbar-font-size]').element as HTMLInputElement).value).toBe('19')

        // 跨控件插入事务断开：再次步进另起一步
        await wrapper.find('[data-toolbar-autowrap]').trigger('click')
        await wrapper.find('[data-toolbar-font-size-dec]').trigger('click')
        expect(editor.store.history).toHaveLength(3)
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 18 })
    })

    it('字号输入框：input 实时合并、change 收口；非法中间态不提交且回显', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])
        const size = wrapper.find('[data-toolbar-font-size]')
        const input = size.element as HTMLInputElement

        input.value = '20'
        await size.trigger('input')
        await nextTick()
        expect(textarea.element.style.fontSize).toBe('20px')
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBe('sel:layers.0:fontSize')

        // 非法中间态（空串会被 Number 归 0，须排除）：不提交
        input.value = ''
        await size.trigger('input')
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 20 })
        await size.trigger('change')
        expect(input.value).toBe('20') // 回显文档值

        // 合法收口：一步闭合
        input.value = '24'
        await size.trigger('input')
        await size.trigger('change')
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 24 })
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
    })

    it('双入口交替操作：工具条步进后面板同键写并入同一步；面板写后工具条读数跟随', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const size = wrapper.find('[data-toolbar-font-size]')
        const input = size.element as HTMLInputElement

        // 工具条 + 1（开放键）→ 面板 live 写同键 → 并入同一步 → 面板收口
        await wrapper.find('[data-toolbar-font-size-inc]').trigger('click')
        editor.updateSpec(['layers', 0], ['fontSize'], 24, { mergeKey: 'sel:layers.0:fontSize' })
        expect(editor.store.history).toHaveLength(1)
        editor.store.closeMerge('sel:layers.0:fontSize')
        expect(editor.store.history[0]!.mergeKey).toBeNull()
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 24 })

        // 面板写（同门权威写）→ 工具条读数实时跟随（layout 现算）
        editor.updateSpec(['layers', 0], ['fontSize'], 32, { mergeKey: 'sel:layers.0:fontSize' })
        await nextTick()
        expect(input.value).toBe('32')

        // 反向续接：面板开放键上工具条点按并入同一步（同门写不分叉）
        await wrapper.find('[data-toolbar-font-size-dec]').trigger('click')
        expect(editor.store.history).toHaveLength(2)
        expect(editor.store.history[1]!.mergeKey).toBe('sel:layers.0:fontSize')
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 31 })
    })
})

describe('字号框显示场景像素值（屏幕恒定尺寸下读数仍是场景值）', () => {
    it('zoom 2×/0.5×：字号框读数恒为文档场景值，不随缩放折算', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])
        const input = wrapper.find('[data-toolbar-font-size]').element as HTMLInputElement

        expect(input.value).toBe('16')
        editor.zoomAt(0, 0, 2)
        await nextTick()
        expect(input.value).toBe('16')

        editor.zoomAt(0, 0, 0.5)
        await nextTick()
        expect(input.value).toBe('16')
    })
})

describe('新层样式槽随工具条权威写更新（与面板写不分叉）', () => {
    it('工具条改字色/字号/换行 → nextTextStyle 捕获；新建文本层继承', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        await beginEditing(wrapper, ['layers', 0])

        const color = wrapper.find<HTMLInputElement>('[data-toolbar-font-color]')
        color.element.value = '#ff0000'
        await color.trigger('change')
        await wrapper.find('[data-toolbar-font-size-inc]').trigger('click')
        await wrapper.find('[data-toolbar-autowrap]').trigger('click')
        await nextTick()

        expect(editor.store.ui.nextTextStyle).toMatchObject({ fontColor: '#ff0000', fontSize: 17, autowrap: true })

        // 调整样式后新建文本层继承（addRootLayer 消费槽，text-defaults 同门）
        const before = editor.store.doc!.layers[0]
        editor.addRootLayer('TextLayer')
        const added = editor.store.doc!.layers.find((l) => l !== before && l.type === 'TextLayer')
        expect(added).toMatchObject({ fontColor: '#ff0000', fontSize: 17, autowrap: true })
    })
})

describe('表格格内容文本会话同等适用（工具条与写入路径）', () => {
    it('模板格内容编辑：工具条在场，对齐/字色写落在格内容层且编辑框实时跟随', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        const wrapper = mountOverlay(editor)
        const contentPath: LayerPath = ['layers', 0, 'template', 'cells', 0, 'content']
        const textarea = await beginEditing(wrapper, contentPath)

        expect(toolbar(wrapper).exists()).toBe(true)
        expect(wrapper.find('[data-toolbar-font-size]').exists()).toBe(true)

        await openMenu(wrapper.find('[data-toolbar-align-horizontal]'))
        await wrapper.find('[data-align-h="center"]').trigger('click')
        await nextTick()
        const content = resolveLayer(editor.store.doc!, contentPath)
        expect(content !== null && content.type === 'TextLayer' && content.align.horizontal).toBe('center')
        expect(textarea.element.style.textAlign).toBe('center')
        // 一次变更 = 收口一步（mergeKey 同门 `sel:path:key`，收口后置 null）
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
    })
})

describe('工具条输入件夺焦：blur 豁免（会话保持）', () => {
    it('pointerdown 字体下拉后 textarea blur：不提交不退出；pointerup 复位后恢复既有提交路径', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])
        textarea.element.value = '未提交的草稿'
        await textarea.trigger('input')
        const select = wrapper.find<HTMLSelectElement>('[data-toolbar-font]')

        // 下拉夺焦（窗口捕获桥置豁免 → blur 不提交，点面板同门）
        await select.trigger('pointerdown')
        textarea.element.blur()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(wrapper.find('textarea').exists()).toBe(true)

        // pointerup 复位豁免：焦点先落回 textarea，再 blur 走既有提交路径（一步、
        // 草稿落库）——textarea 已失焦后的二次 blur 不再发事件，故先 focus 复原
        textarea.element.focus()
        await select.trigger('pointerup')
        textarea.element.blur()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '未提交的草稿' })
        expect(editor.store.ui.editing).toBeNull()
    })

    it('下拉触发钮（输入件同门）：pointerdown 不拦默认（放行夺焦），夺焦 blur 不提交、会话保持', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountOverlay(editor)
        const textarea = await beginEditing(wrapper, ['layers', 0])
        textarea.element.value = '未提交的草稿'
        await textarea.trigger('input')
        const trigger = wrapper.find('[data-toolbar-align-horizontal]')

        // 触发钮 @pointerdown.stop：根的 prevent 不生效（defaultPrevented=false，
        // 真实浏览器由此夺焦），窗口捕获桥照常置豁免 → 夺焦 blur 不提交
        const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
        trigger.element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        textarea.element.blur()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(wrapper.find('textarea').exists()).toBe(true)

        // pointerup 复位豁免：焦点先落回 textarea，再 blur 走既有提交路径
        textarea.element.focus()
        trigger.element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
        textarea.element.blur()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '未提交的草稿' })
        expect(editor.store.ui.editing).toBeNull()
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
        await pickContentType(wrapper, 'expression')
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

        await pickContentType(wrapper, 'static')
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
