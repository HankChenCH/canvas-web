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

describe('资源字段：资源单值门诊断（工单 03 门 + 工单 05 选择器换装面）', () => {
    /** QR 内容字段表达式态 = 级联路径选择器（resourceValue 控件，工单 05）：违例
     *  形态（旧拼接/函数/尾缀字面）是文档存量，非选择器可产出——经内核写入口
     *  构造；诊断红边落选择器根盒（fallthrough），提示行纯展示（div 根无从落
     *  选区）。无 schema 注入 → 选择器无菜单钮（引用以声明为门，只读回显）。 */
    async function mountQr(template: string): Promise<VueWrapper> {
        const editor = makeEditor([qrLayer({ value: template, expression: template })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()
        return wrapper
    }

    it('片段外字面（尾缀）→ 单值门标错（资源教学文案）+ 选择器原文只读回显', async () => {
        const wrapper = await mountQr('{{orderNo}}-qr')

        expect(invalidField(wrapper).exists()).toBe(true)
        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容必须是单个字段路径，不支持拼接文字')
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('{{orderNo}}-qr')
        // 提示行纯展示（div 根无从落选区，不渲染可点击暗示）
        expect(errorHint(wrapper).classes()).not.toContain('cursor-pointer')
        // 无 schema（引用以声明为门）：菜单钮不渲染，整体只读
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })

    it('函数调用 → 资源面禁函数（独立 kind 文案）', async () => {
        const wrapper = await mountQr('{{number(orderNo, 2)}}')

        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容不支持函数调用')
    })

    it('多片段拼接（文本面合法形态）在资源面被拦——门是整串判定', async () => {
        const wrapper = await mountQr('{{orderNo}}{{orderNo}}')

        expect(errorHint(wrapper).text()).toBe('表达式语法错误：资源内容必须是单个字段路径，不支持拼接文字')
    })

    it('合法单值裸路径零提示零红边 + 选择器拆壳回显裸路径', async () => {
        const wrapper = await mountQr('{{orderNo}}')

        expect(errorHint(wrapper).exists()).toBe(false)
        expect(invalidField(wrapper).exists()).toBe(false)
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('orderNo')
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
})
