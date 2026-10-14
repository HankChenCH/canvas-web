// @vitest-environment jsdom
/**
 * 表达式语法诊断接线集成测试（expression-syntax-diagnostics 工单 02）：
 * 表达式态数据字段实时标错——控件红边 + 提示行（文案 = kind 中文映射，多处取
 * 首条带计数）；点击提示聚焦控件并选中出错子范围；静态态/合法表达式零提示。
 * 诊断对 props.value 直算（面板 input 实时 commit，value 即最新文本）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import { textLayer, qrLayer } from '../../../canvas-editor/tests/support/fixtures'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'

const nullScheduler: FrameScheduler = () => () => {}

const wrappers: VueWrapper[] = []

function makeEditor(layers: Parameters<EditorSession['openDocument']>[0]['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    // attachTo：点击定位断言依赖 document.activeElement（detached 元素 focus 无效）
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: hostEl })
    wrappers.push(wrapper)
    return wrapper
}

/** 模拟在面板内容输入框输入：直设 DOM 值再派发 input（completionWiring.mount 同款） */
async function type(wrapper: VueWrapper, value: string): Promise<void> {
    const field = wrapper.find('textarea')
    field.element.value = value
    await field.trigger('input')
    await nextTick()
}

const errorHint = (wrapper: VueWrapper) => wrapper.find('.cn-prop-field__hint--error')
const invalidField = (wrapper: VueWrapper) => wrapper.find('.cn-field--invalid')

/** 用户实案模板（第二处 date 格式串缺收尾引号） */
const BROKEN = "{{row.name}} {{date(row.end_date, 'YYYY年MM月DD日)}}"

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('表达式态数据字段：语法错误实时标错', () => {
    it('用户实案：缺收尾引号 → 控件红边 + 提示行（unterminated_string 文案）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, BROKEN)

        expect(invalidField(wrapper).exists()).toBe(true)
        expect(errorHint(wrapper).text()).toBe('表达式语法错误：字符串字面量未闭合')
    })

    it('多处错误：提示取首条带计数（非法路径在前）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{row..x}}{{date(y,)}}')

        expect(errorHint(wrapper).text()).toBe('2 处表达式语法错误：非法路径')
    })

    it('点击提示：聚焦控件并选中出错子范围（at 模板坐标）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, BROKEN)
        const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
        await errorHint(wrapper).trigger('click')

        expect(document.activeElement).toBe(textarea)
        expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("'YYYY年MM月DD日)")
    })

    it('合法表达式零提示零红边（含未知函数名——名单面不校验）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, "{{row.name}} {{date(row.d, 'YYYY年MM月DD日')}} {{foo(row.x)}}")

        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
    })

    it('修正后提示即时消失', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, BROKEN)
        expect(errorHint(wrapper).exists()).toBe(true)

        await type(wrapper, "{{row.name}} {{date(row.end_date, 'YYYY年MM月DD日')}}")
        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
    })

    it('静态态不标错（{{ 是字面，非表达式）', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, BROKEN)

        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
    })
})

describe('资源字段：资源单值门诊断（resource-expression-single-ref 工单 03，ADR 0020）', () => {
    /** QR 内容字段走 text 控件；表达式态带 cn-field--expression 标识（色值/字体的
     *  text input 不带，定位精确到内容字段） */
    function qrField(wrapper: VueWrapper) {
        return wrapper.find('input.cn-field--expression')
    }

    async function typeQr(wrapper: VueWrapper, value: string): Promise<void> {
        const field = qrField(wrapper)
        ;(field.element as HTMLInputElement).value = value
        await field.trigger('input')
        await nextTick()
    }

    async function mountQr(): Promise<VueWrapper> {
        const editor = makeEditor([qrLayer({ value: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()
        return wrapper
    }

    it('片段外字面（尾缀）→ 单值门标错（资源教学文案，非片段扫描文案）', async () => {
        const wrapper = await mountQr()
        await typeQr(wrapper, '{{orderNo}}-qr')

        expect(invalidField(wrapper).exists()).toBe(true)
        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容必须是单个字段路径，不支持拼接文字')
    })

    it('函数调用 → 资源面禁函数（独立 kind 文案）', async () => {
        const wrapper = await mountQr()
        await typeQr(wrapper, '{{number(orderNo, 2)}}')

        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容不支持函数调用')
    })

    it('多片段拼接（文本面合法形态）在资源面被拦——门是整串判定', async () => {
        const wrapper = await mountQr()
        await typeQr(wrapper, '{{orderNo}}{{orderNo}}')

        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容必须是单个字段路径，不支持拼接文字')
    })

    it('合法单值裸路径零提示零红边', async () => {
        const wrapper = await mountQr()
        await typeQr(wrapper, '{{orderNo}}')

        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
    })

    it('文本层多片段插值照旧零标错（文本字段走既有诊断不动）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{row.a}}{{row.b}}')

        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
    })

    it('点击提示：聚焦控件并选中整串（门诊断 span = 整个模板串）', async () => {
        const wrapper = await mountQr()
        await typeQr(wrapper, '{{orderNo}}-qr')

        const input = qrField(wrapper).element as HTMLInputElement
        await errorHint(wrapper).trigger('click')

        expect(document.activeElement).toBe(input)
        // HTMLInputElement 的 selection 可空（textarea 型非空，lib.dom 5.9）；选中态已断言在先
        expect(input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)).toBe('{{orderNo}}-qr')
    })
})
