// @vitest-environment jsdom
/**
 * TextEditingOverlay 组件集成测试（工单 11）：
 * - 双击入口（beginAt）：命中 TextLayer 才进入；textarea 初值/聚焦/样式换算
 * - IME 守卫：合成中（isComposing/keyCode 229）Esc/Enter 不误提交不误退出
 * - 提交漏斗：Esc / Ctrl+Enter / blur / 画布点按（exposed commitEditing）各恰好一步
 * - 空文本提交 = 删除图层，可撤销；blur 对外部指针交互豁免（延迟提交语义）
 * - zoom 变更：元素不重建、transform 跟随、光标 selection 不丢
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type Canvas, type FrameScheduler } from '@hankchen/canvas-next-editor'

import TextEditingOverlay from '../src/TextEditingOverlay.vue'

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

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: Canvas['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function mountOverlay(editor: EditorSession) {
    // 挂进宿主容器：overlay 的 getHost = 根元素 parentElement，须与「外部交互元素」
    // 区分开（真实装配里宿主 = surface 根 div，面板/工具栏在其外）
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(TextEditingOverlay, {
        props: { editor },
        attachTo: hostEl,
    })
    return wrapper
}

const shape = (width = 100, height = 50) => ({
    width,
    height,
    autoWidth: false,
    autoHeight: false,
    lineHeight: 1.2,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
})
const base = { priority: 10, shape: shape(), align: { horizontal: 'left' as const, vertical: 'top' as const }, position: { anchor: 'top-left' as const, x: 40, y: 30 } }

const doc = (): Canvas['layers'] => [
    { ...base, type: 'TextLayer', text: '你好画布', expression: null, font: '', fontSize: 16, fontColor: '#111827', angle: 0, autowrap: false },
]

const imageDoc = (): Canvas['layers'] => [{ ...base, type: 'ImageLayer', src: null, expression: null }]

/** 图层盒 100×50 @ (40,30)：中心点场景坐标 */
const layerCenter = { x: 40 + 50, y: 30 + 25 }

async function enterEditing(wrapper: ReturnType<typeof mountOverlay>) {
    expect(wrapper.vm.beginAt(layerCenter.x, layerCenter.y)).toBe(true)
    await wrapper.vm.$nextTick()
    return wrapper.find('textarea')
}

describe('beginAt：双击进入编辑', () => {
    it('命中文本层：textarea 挂载、聚焦、初值 = 文档文本', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)

        const textarea = await enterEditing(wrapper)

        expect(textarea.exists()).toBe(true)
        expect(textarea.element.value).toBe('你好画布')
        expect(document.activeElement).toBe(textarea.element)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })
    })

    it('进入编辑全选保持：样式 watch 的 selection 恢复不得回打入口全选（旧样式为 null 跳过）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        // 等 post-flush 的样式 watch 续体跑完（回归：曾把全选恢复成 0,0）
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()

        expect(textarea.element.selectionStart).toBe(0)
        expect(textarea.element.selectionEnd).toBe(textarea.element.value.length)
    })

    it('样式换算：translate 按呈现视口折算屏幕像素、scale 补缩放，字号/行高为场景像素', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        const style = textarea.element.style
        // cam (0,0) zoom 1：盒左上 (40,30) → translate(40px, 30px) scale(1)
        expect(style.transform).toBe('translate(40px, 30px) scale(1)')
        expect(style.transformOrigin).toBe('0 0')
        expect(style.width).toBe('100px')
        expect(style.height).toBe('50px')
        expect(style.fontSize).toBe('16px')
        expect(style.lineHeight).toBe('20px') // ceil(16 × 1.2)
        expect(style.textAlign).toBe('left')
        expect(style.whiteSpace).toBe('pre')
        expect(style.color).toBe('rgb(17, 24, 39)') // jsdom 将 #111827 归一化
        expect(style.fontFamily).toBe('sans-serif') // 内置默认字体
        expect(style.paddingTop).toBe('0px')
    })

    it('center 纵向锚点按 CSS 行盒模型折算 padding-top（字形盒心 = 锚点，不差半行）', async () => {
        const editor = makeEditor([
            {
                ...base,
                shape: { ...shape(), padding: { top: 2, bottom: 3, left: 4, right: 5 } },
                align: { horizontal: 'center', vertical: 'center' },
                type: 'TextLayer',
                text: '你好画布',
                expression: null,
                font: '',
                fontSize: 16,
                fontColor: '#111827',
                angle: 0,
                autowrap: false,
            },
        ])
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        // 锚点 = padding.top 2 + textOrigin.y 22（contentHeight 45 单行）= 24；
        // center：字形盒心 = padding + 行高/2 → padding = 24 − 20/2 = 14
        //（与 canvas 渲染字形盒心对位，enter/exit 不跳变；jsdom 无度量走回落 FH）
        expect(textarea.element.style.paddingTop).toBe('14px')
        expect(textarea.element.style.paddingRight).toBe('5px')
        expect(textarea.element.style.textAlign).toBe('center')
    })

    it('top 对齐：padding-top = 锚点 − 半行距，负值钳 0（jsdom 回落 FH = 1.2em 时恰为 0）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        // 锚点 = padding.top + textOrigin.y(top) = 0；半行距 = (20 − 16×1.2)/2 = 0.4
        // → padding = −0.4 → 钳 0（CSS padding 非负；误差 ≤ 半行距）
        expect(textarea.element.style.paddingTop).toBe('0px')
        expect(textarea.element.style.paddingLeft).toBe('0px')
    })

    it('命中非文本层/空白处：不进入编辑', async () => {
        const editor = makeEditor(imageDoc())
        const wrapper = mountOverlay(editor)

        expect(wrapper.vm.beginAt(layerCenter.x, layerCenter.y)).toBe(false)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('textarea').exists()).toBe(false)

        // 空白处（画布右下角外）
        expect(wrapper.vm.beginAt(7000, 7000)).toBe(false)
        expect(editor.store.ui.editing).toBeNull()
    })
})

describe('提交漏斗：四路退出各恰好一步历史', () => {
    it('Escape：提交文本入一步历史，textarea 卸载', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '改好了'
        await textarea.trigger('keydown', { key: 'Escape', isComposing: false })
        await wrapper.vm.$nextTick()

        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '改好了' })
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
        expect(editor.store.ui.editing).toBeNull()
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('Ctrl+Enter：提交；plain Enter 不提交（换行交给 textarea 默认）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '两行'
        await textarea.trigger('keydown', { key: 'Enter' })
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })

        await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true })
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '两行' })
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('IME 守卫：合成中（isComposing/keyCode 229）Esc 与 Ctrl+Enter 不提交不退出', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '候选中的文本'
        // 拼音候选窗里的 Esc = 取消候选，不是退出编辑
        await textarea.trigger('keydown', { key: 'Escape', isComposing: true })
        await textarea.trigger('keydown', { key: 'Escape', keyCode: 229 })
        await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
        await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true, keyCode: 229 })

        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布' })
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })
        expect(wrapper.find('textarea').exists()).toBe(true)
    })

    it('画布点按路径（exposed commitEditing）：提交且同一指针继续点选语义', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '点画布提交'
        wrapper.vm.commitEditing()
        await wrapper.vm.$nextTick()

        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '点画布提交' })
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('IME 守卫覆盖画布点按分支：合成中 commitEditing 暂存，compositionend 才落', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '合成中点画布'
        await textarea.trigger('compositionstart')
        wrapper.vm.commitEditing()
        await wrapper.vm.$nextTick()
        // 意图暂存：不吞预编辑串、不退出编辑
        expect(editor.store.history).toHaveLength(0)
        expect(wrapper.find('textarea').exists()).toBe(true)

        // 合成收束（点画布令浏览器提交合成）后，暂存意图落文档
        await textarea.trigger('compositionend')
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '合成中点画布' })
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('候选窗 Esc 只取消候选：无提交意图的 compositionend 不提交不退出', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        await textarea.trigger('compositionstart')
        await textarea.trigger('compositionend')
        await wrapper.vm.$nextTick()

        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布' })
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })
        expect(wrapper.find('textarea').exists()).toBe(true)
    })

    it('合成中 blur：延迟提交暂存到 compositionend', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '合成中失焦'
        await textarea.trigger('compositionstart')
        textarea.element.blur()
        await new Promise((resolve) => setTimeout(resolve, 0))
        // 合成中：blur 延迟提交暂存
        expect(editor.store.history).toHaveLength(0)

        await textarea.trigger('compositionend')
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '合成中失焦' })
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('blur：延迟一个宏任务提交（延迟提交语义）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '失焦提交'
        textarea.element.blur() // DOM blur：焦点真实移出（activeElement → body）
        // 宏任务未到：尚未提交
        expect(editor.store.history).toHaveLength(0)
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()

        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '失焦提交' })
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('blur 豁免：外部指针交互（属性面板/工具栏）引发的 blur 不提交，编辑会话保持', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        // 模拟点属性面板：宿主外元素上的 pointerdown（窗口捕获）先于 blur
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        textarea.element.blur()
        outside.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()

        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布' })
        // 编辑会话保持：textarea 仍挂载（blurred），点回画布才提交
        expect(wrapper.find('textarea').exists()).toBe(true)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })

        outside.remove()
    })

    it('blur 后焦点落回 textarea：同一宏任务内取消提交', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '回来继续写'
        textarea.element.blur()
        textarea.element.focus()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0] })
    })
})

describe('空文本提交 = 删除图层', () => {
    it('Esc 提交空文本：图层删除、textarea 卸载，undo 恢复', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = ''
        await textarea.trigger('keydown', { key: 'Escape' })
        await wrapper.vm.$nextTick()

        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('textarea').exists()).toBe(false)

        editor.undo()
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布' })
    })
})

describe('zoom 变更：字号视觉恒定、元素不重建、光标 selection 不丢', () => {
    it('缩放后 transform 跟随、同一 textarea 元素、selectionStart/End 保持', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element

        el.setSelectionRange(2, 4)
        editor.zoomAt(0, 0, 2)
        await wrapper.vm.$nextTick()

        // translate 按新 zoom 折算：盒左上 (40,30)、cam 0 → (80px, 60px) scale(2)
        expect(el.style.transform).toBe('translate(80px, 60px) scale(2)')
        // 元素未重建（v-if 不翻转、key 不变）：selection 保持
        expect(wrapper.find('textarea').element).toBe(el)
        expect(el.selectionStart).toBe(2)
        expect(el.selectionEnd).toBe(4)
    })

    it('平移后 translate 跟随（camera 变化实时跟随）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        editor.panBy(-10, -20) // cam += (10, 20)/zoom
        await wrapper.vm.$nextTick()

        expect(textarea.element.style.transform).toBe('translate(30px, 10px) scale(1)')
    })
})
