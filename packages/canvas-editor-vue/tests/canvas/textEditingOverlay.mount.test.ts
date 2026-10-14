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

import { EditorSession, type Canvas, type FrameScheduler } from '@hankchen/canvas-editor'

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
const base = { name: '', visible: true, priority: 10, shape: shape(), align: { horizontal: 'left' as const, vertical: 'top' as const }, position: { anchor: 'top-left' as const, x: 40, y: 30 } }

/** 同 doc() 但覆写文档文本（草稿接管用例的替换基准） */
const docWithText = (text: string): Canvas['layers'] => [
    { ...base, type: 'TextLayer', text, expression: null, font: '', fontSize: 16, fontColor: '#111827', angle: 0, autowrap: false },
]

const doc = (): Canvas['layers'] => docWithText('你好画布')

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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })

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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })

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
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
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

describe('会话期 live 联动（ADR 0019）：面板样式/几何写 → 编辑框实时跟随', () => {
    /** 面板同门的权威写（usePropertyPanel.commit 同一内核漏斗与 mergeKey 约定） */
    const spec = (editor: EditorSession, key: readonly string[], value: unknown) =>
        editor.updateSpec(['layers', 0], key, value, { mergeKey: `sel:layers.0:${key.join('.')}` })

    it('样式字段写（字号/字色/字体/换行/行高/内边距/水平/垂直对齐）→ textarea 样式即时变化', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element

        spec(editor, ['fontSize'], 24)
        await wrapper.vm.$nextTick()
        expect(el.style.fontSize).toBe('24px')
        expect(el.style.lineHeight).toBe('29px') // ceil(24 × 1.2)
        // 元素不重建（key 只随路径）：草稿与光标保持
        expect(wrapper.find('textarea').element).toBe(el)

        spec(editor, ['fontColor'], '#ff0000')
        await wrapper.vm.$nextTick()
        expect(el.style.color).toBe('rgb(255, 0, 0)')

        spec(editor, ['font'], 'https://fonts.example/hand.ttf')
        await wrapper.vm.$nextTick()
        expect(el.style.fontFamily).toContain('canvas-font-')

        spec(editor, ['align', 'horizontal'], 'center')
        await wrapper.vm.$nextTick()
        expect(el.style.textAlign).toBe('center')

        // 纵向对齐写 → 锚点现算 padding-top（单行、盒高 50）：center 锚
        // trunc(50/2) = 25 → padding-top = 25 − 29/2 = 10.5
        spec(editor, ['align', 'vertical'], 'center')
        await wrapper.vm.$nextTick()
        expect(el.style.paddingTop).toBe('10.5px')

        // 行高写 → 行盒与锚点折算同步现算：ceil(24 × 1.5) = 36、锚 25 不变
        // → padding-top = 25 − 36/2 = 7
        spec(editor, ['shape', 'lineHeight'], 1.5)
        await wrapper.vm.$nextTick()
        expect(el.style.lineHeight).toBe('36px')
        expect(el.style.paddingTop).toBe('7px')

        // 内边距写 → 内容盒与锚点随之现算：内容高 trunc(50−3) = 47、
        // 锚 = 1 + trunc(47/2) = 24 → padding-top = 24 − 18 = 6
        spec(editor, ['shape', 'padding'], { top: 1, bottom: 2, left: 8, right: 3 })
        await wrapper.vm.$nextTick()
        expect(el.style.paddingLeft).toBe('8px')
        expect(el.style.paddingTop).toBe('6px')

        spec(editor, ['autowrap'], true)
        await wrapper.vm.$nextTick()
        expect(el.style.whiteSpace).toBe('pre-wrap')
    })

    it('位置/尺寸写 → 编辑框几何实时跟随', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element

        spec(editor, ['position', 'x'], 90)
        spec(editor, ['shape', 'width'], 200)
        await wrapper.vm.$nextTick()

        expect(el.style.transform).toBe('translate(90px, 30px) scale(1)')
        expect(el.style.width).toBe('200px')
    })

    it('样式写入 + 退出提交：各自成步恰两步历史（会话期写入不合入文本提交）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        spec(editor, ['fontSize'], 24)
        editor.store.closeMerge('sel:layers.0:fontSize') // 面板 final 收口同门
        textarea.element.value = '改了文本'
        await textarea.trigger('keydown', { key: 'Escape' })
        await wrapper.vm.$nextTick()

        expect(editor.store.history).toHaveLength(2)
        // 样式步已被面板 final 收口闭合（closeMerge 置 null），文本提交步独立无 mergeKey
        expect(editor.store.history[0]!.mergeKey).toBeNull()
        expect(editor.store.history[1]!.mergeKey).toBeNull()
        expect(editor.store.doc!.layers[0]).toMatchObject({ fontSize: 24, text: '改了文本' })
    })

    it('键入模拟（input，零文档变更）→ 布局与纵向锚点零变化', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element
        const before = {
            transform: el.style.transform,
            width: el.style.width,
            height: el.style.height,
            paddingTop: el.style.paddingTop,
            lineHeight: el.style.lineHeight,
        }

        el.value = '键入了很多很多文字'
        await textarea.trigger('input')
        await wrapper.vm.$nextTick()

        // live 文本只住 textarea 草稿不落文档：零历史、文档文本不动
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布' })
        // 布局与纵向锚点零变化（锚点不随键入跳动）
        expect(el.style.transform).toBe(before.transform)
        expect(el.style.width).toBe(before.width)
        expect(el.style.height).toBe(before.height)
        expect(el.style.paddingTop).toBe(before.paddingTop)
        expect(el.style.lineHeight).toBe(before.lineHeight)
    })
})

describe('表达式语法诊断提示条（expression-syntax-diagnostics 工单 02）', () => {
    /** 表达式标记层（text = expression 镜像）：初值即含语法错（格式串缺收尾引号） */
    const brokenExpr = "{{row.name}} {{date(row.d, 'YYYY)}}"
    const exprDoc = (): Canvas['layers'] => [
        {
            ...base,
            type: 'TextLayer',
            text: brokenExpr,
            expression: brokenExpr,
            font: '',
            fontSize: 16,
            fontColor: '#111827',
            angle: 0,
            autowrap: false,
        },
    ]

    /** 诊断链路含跨 tick 的初值注入同步（composable attach 的 nextTick 补拍），多等两拍 */
    async function settle(wrapper: ReturnType<typeof mountOverlay>) {
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()
        return wrapper.find('.cn-text-overlay__diagnostic')
    }

    it('表达式态会话初值即含语法错：提示条在场（文案 + 锚定图层框左角上方）', async () => {
        const editor = makeEditor(exprDoc())
        const wrapper = mountOverlay(editor)
        await enterEditing(wrapper)

        const hint = await settle(wrapper)
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toBe('表达式语法错误：字符串字面量未闭合')
        // 与 pill 同换算系：盒左上 (40,30) 上方（translateY 负向偏移），scale 随 zoom
        expect(hint.attributes('style')).toContain('translate(40px, 30px) scale(1)')
    })

    it('修好语法：提示条消失', async () => {
        const editor = makeEditor(exprDoc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = "{{row.name}} {{date(row.d, 'YYYY')}}"
        await textarea.trigger('input')
        const hint = await settle(wrapper)

        expect(hint.exists()).toBe(false)
    })

    it('静态会话不提示（无表达式标记）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        await enterEditing(wrapper)

        const hint = await settle(wrapper)

        expect(hint.exists()).toBe(false)
    })
})

describe('草稿接管（会话内容独占工单 02）：旁门内容写 → textarea 全量接管新值', () => {
    /** 接管 watch 是 async 续体（回调内再等一拍 nextTick）：宏任务边界排干微任务链 */
    async function settle(wrapper: ReturnType<typeof mountOverlay>) {
        await wrapper.vm.$nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()
    }

    it('查找替换命中编辑层：textarea 草稿被替换为文档新值（替换结果出现在正在编辑的框里）', async () => {
        const editor = makeEditor(docWithText('证书甲姓名'))
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element
        // 用户先键入草稿（live 文本不落文档）
        el.value = '用户正在打字'
        await textarea.trigger('input')

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        expect(editor.replaceAll()).toBe(1)
        await settle(wrapper)

        // 全量接管：草稿 = 文档新值（用户未提交的键入被接管覆盖——独占语义）
        expect(el.value).toBe('奖状甲姓名')
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '奖状甲姓名' })

        // 接管后退出：串与文档一致零提交步（接管步即唯一一步历史）
        await textarea.trigger('keydown', { key: 'Escape' })
        await settle(wrapper)
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.ui.editing).toBeNull()
    })

    it('表达式会话旁门标记写：草稿接管镜像新值 + 诊断即时刷新（提示条随新值消失）', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        editor.toggleDataMode(['layers', 0]) // 翻表达式会话（零文档变更）
        // 用户键入含语法错的片段：提示条在场
        textarea.element.value = "{{row.name}} {{date(row.d, 'YYYY)}}"
        await textarea.trigger('input')
        await settle(wrapper)
        expect(wrapper.find('.cn-text-overlay__diagnostic').exists()).toBe(true)

        // 旁门程序化标记写：文档落库 + 草稿接管（合法表达式）+ 诊断刷新
        editor.updateDataExpression(['layers', 0], "{{row.name}} {{date(row.d, 'YYYY')}}")
        await settle(wrapper)

        expect(textarea.element.value).toBe("{{row.name}} {{date(row.d, 'YYYY')}}")
        expect(wrapper.find('.cn-text-overlay__diagnostic').exists()).toBe(false)
    })

    it('接管后清空退出：删层且可撤销（与画布侧同语义）', async () => {
        const editor = makeEditor(docWithText('证书甲姓名'))
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        editor.replaceAll()
        await settle(wrapper)
        expect(textarea.element.value).toBe('奖状甲姓名')

        textarea.element.value = ''
        await textarea.trigger('keydown', { key: 'Escape' })
        await settle(wrapper)

        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.history).toHaveLength(2) // 替换步 + 删层步

        editor.undo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '奖状甲姓名' })
        editor.undo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '证书甲姓名' })
    })

    it('pill 翻标志（非内容写）不接管：textarea 草稿保持', async () => {
        const editor = makeEditor(doc())
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)

        textarea.element.value = '草稿{{'
        await textarea.trigger('input')
        editor.toggleDataMode(['layers', 0])
        await settle(wrapper)

        expect(textarea.element.value).toBe('草稿{{')
        expect(editor.store.ui.editing).toMatchObject({ expression: true })
    })

    it('接管后经真 pill 路径翻标志：draftSeq 保留，不误触发接管（草稿实况保持）', async () => {
        const editor = makeEditor(docWithText('证书甲姓名'))
        const wrapper = mountOverlay(editor)
        const textarea = await enterEditing(wrapper)
        const el = textarea.element

        // 先发生一次接管（draftSeq = 1）
        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        editor.replaceAll()
        await settle(wrapper)
        expect(el.value).toBe('奖状甲姓名')

        // 真 pill 路径（ContentTypePill → setExpressionMode）翻标志：若丢 draftSeq
        // （1 → undefined），接管 watch 会误触发并全量替换草稿
        await wrapper.find('[data-pill-expression]').trigger('click')
        await settle(wrapper)

        expect(editor.store.ui.editing).toMatchObject({ expression: true, draftSeq: 1 })
        expect(el.value).toBe('奖状甲姓名')
        expect(editor.store.history).toHaveLength(1) // 标志翻转零文档变更
    })
})
