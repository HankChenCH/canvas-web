// @vitest-environment jsdom
/**
 * 补全浮层三字段接线 + 上下文感知集成测试（content-completion 工单 05）。
 *
 * 面板全链路（真实候选源 = 内核枚举器，非桩）：表达式态输入 `{{` 自动弹出 →
 * 候选集随上下文切换（根层 = 载荷顶层键 + $root；模板格内容层 = + row/$index，
 * row. 下钻 items 键树）→ Enter 接受 = 补全剩余路径段走既有 input+change 提交
 * （表达式 + 镜像同改、一步历史、undo 恢复镜像）；静态态/未注入 schema 零补全。
 * 提交管线零改动（valueType 分段派生、updateDataExpression 分键复用）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { createTemplateTable, EditorSession, type FrameScheduler, type LayerPath } from '@hankchen/canvas-next-editor'

import { imageLayer, textLayer } from '../../../canvas-next-editor/tests/support/fixtures'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'

const nullScheduler: FrameScheduler = () => () => {}

/** 载荷形态 schema（与内核枚举器测试同款键树；order.items = 行数组） */
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

const wrappers: VueWrapper[] = []

function makeEditor(layers: Parameters<EditorSession['openDocument']>[0]['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    const wrapper = mount(PropertyPanel, { props: { editor } })
    wrappers.push(wrapper)
    return wrapper
}

/** 模拟在面板输入框输入：直设 DOM 值 + 光标再派发 input（expressionCompletion.mount.test 同款） */
async function type(wrapper: VueWrapper, value: string, cursor: number): Promise<void> {
    const field = wrapper.find('textarea')
    field.element.value = value
    ;(field.element as HTMLTextAreaElement).setSelectionRange(cursor, cursor)
    await field.trigger('input')
}

const optionSegments = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-completion__option')).map(
        (option) => option.querySelector('.cn-completion__segment')?.textContent ?? '',
    )
const optionTexts = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-completion__option')).map((option) => option.textContent ?? '')
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null

async function pressEnter(wrapper: VueWrapper): Promise<void> {
    wrapper.find('textarea').element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await nextTick()
}

async function pressBackspace(wrapper: VueWrapper): Promise<void> {
    wrapper.find('textarea').element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('三字段接线：表达式态生效、静态态不生效', () => {
    it('根层文本字段：{{ 自动弹出根候选集（无 row/$index），partial 前缀过滤', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{or', 5)
        expect(popupOpen()).toBe(true)
        // 根上下文：orderNo/order 命中前缀；row/$index 不给（行外求值必炸）
        expect(optionSegments()).toEqual(['orderNo', 'order'])
    })

    it('静态态零补全：输入 {{ 不弹浮层，字面提交管线不变（表达式标记保持 null）', async () => {
        const editor = makeEditor([textLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(false)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('未注入 schema：表达式态零补全（辅助声明缺席 = 无候选态）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{o', 3)
        expect(popupOpen()).toBe(false)
    })
})

describe('上下文感知：候选集随选中位置切换', () => {
    it('模板格内容层 = 行候选集：头部含 row/$index，row. 下钻 items 键树', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const contentPath: LayerPath = ['layers', 0, 'template', 'cells', 0, 'content']
        editor.updateDataExpression(contentPath, '{{row.')
        const wrapper = mountPanel(editor)
        editor.setSelection(contentPath)
        await nextTick()

        await type(wrapper, '{{row.', 6)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['name', 'quantity'])

        // 光标回到空表达式态：头部候选切换出行上下文结构头
        await type(wrapper, '{{', 2)
        const segments = optionSegments()
        expect(segments).toContain('row')
        expect(segments).toContain('$index')
    })

    it('同一面板内根层 ↔ 格内容层切换，候选集随上下文换面（根层无 row）', async () => {
        const editor = makeEditor([
            textLayer({ text: '{{', expression: '{{' }),
            createTemplateTable({ rowsPath: 'order.items' }),
        ])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const contentPath: LayerPath = ['layers', 1, 'template', 'cells', 0, 'content']
        editor.updateDataExpression(contentPath, '{{')
        const wrapper = mountPanel(editor)

        editor.setSelection(['layers', 0])
        await nextTick()
        await type(wrapper, '{{', 2)
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root'])

        editor.setSelection(contentPath)
        await nextTick()
        await type(wrapper, '{{', 2)
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root', 'row', '$index'])
    })
})

describe('开放映射占位提示 + title 回落（工单 10，真实候选源全链路）', () => {
    /** open 节点 schema（D10/D8）：根与 extra 子树标 open，certCode 仅 title、certName 双注解 */
    const OPEN_SCHEMA = {
        type: 'object',
        additionalProperties: true,
        properties: {
            extra: { type: 'object', additionalProperties: true, title: '扩展字段' },
            certCode: { type: 'string', title: '证书编号' },
            certName: { type: 'string', description: '证书名称', title: '名称标题' },
        },
    }

    it('头部层 open（根节点）：候选照常枚举 + 提示行并存（信号与候选空否无关）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(OPEN_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{', 2)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['extra', 'certCode', 'certName', '$root'])
        expect(document.body.querySelector('.cn-completion__hint')?.textContent?.trim()).toBe('动态字段，键由模板定义')
    })

    it('下钻层 open（extra.）：空候选只显示提示行；Esc 照常收口', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(OPEN_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{extra.', 8)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual([])
        expect(document.body.querySelector('.cn-completion__hint')?.textContent?.trim()).toBe('动态字段，键由模板定义')

        wrapper.find('textarea').element.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
        await nextTick()
        expect(popupOpen()).toBe(false)
    })

    it('title 回落：仅 title 显示 title，description 优先于 title', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(OPEN_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{cert', 6)
        expect(optionSegments()).toEqual(['certCode', 'certName'])
        expect(optionTexts()[0]).toContain('证书编号')
        expect(optionTexts()[1]).toContain('证书名称')
        expect(optionTexts()[1]).not.toContain('名称标题')
    })
})

describe('{{ 自动配对（工单 07）：配对文本与手工输入同路', () => {
    it('键入 {{ 补出 }} → 接受候选出完整片段，mergeKey 合步一步历史、undo 一步回配对前', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{', 2)
        const fieldEl = wrapper.find('textarea').element as HTMLTextAreaElement
        expect(fieldEl.value).toBe('{{}}')
        expect(fieldEl.selectionStart).toBe(2)
        expect(popupOpen()).toBe(true)

        await pressEnter(wrapper)
        expect(popupOpen()).toBe(false)

        // 配对只发 input（实时合步）：原生 {{ 键入与补出 }} 同并入接受的 change——
        // 与手工连打同粒度，一步历史
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo}}')
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{orderNo}}')
        expect(editor.store.history).toHaveLength(1)

        // undo 一步：标记与镜像一并回退到配对前（重标镜像语义）
        editor.undo()
        await nextTick()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.expression).toBe('{{')
        expect(restored.type === 'TextLayer' && restored.text).toBe('{{')
    })

    it('空片段退格整对删除 → 表达式回字面态（无残壳），历史零推进（change 归失焦）', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{', 2)
        await pressBackspace(wrapper)
        const fieldEl = wrapper.find('textarea').element as HTMLTextAreaElement
        expect(fieldEl.value).toBe('')
        expect(popupOpen()).toBe(false)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('')
        expect(layer.type === 'TextLayer' && layer.text).toBe('')

        // 配对 + 删对并入同一 mergeKey 会话（只发 input，与手工连打同粒度）：
        // 一个合并步、undo 一步回配对前
        expect(editor.store.history).toHaveLength(1)
        editor.undo()
        await nextTick()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.expression).toBe('{{')
        expect(restored.type === 'TextLayer' && restored.text).toBe('{{')
    })

    it('静态态键入 {{ 不配对：字面提交管线不变（表达式标记保持 null）', async () => {
        const editor = makeEditor([textLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{', 2)
        const fieldEl = wrapper.find('textarea').element as HTMLTextAreaElement
        expect(fieldEl.value).toBe('{{')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })
})

describe('接受与历史：与手工输入同路（一步历史、镜像恢复）', () => {
    it('Enter 接受补全剩余段 → 表达式 + 镜像同改，一步历史 undo 恢复镜像', async () => {
        const editor = makeEditor([textLayer({ text: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await type(wrapper, '{{or', 5)
        expect(popupOpen()).toBe(true)
        await pressEnter(wrapper)
        expect(popupOpen()).toBe(false)

        // 接受 = 既有 input+change 提交：表达式与镜像字面同改（合并键一步历史）
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{orderNo')
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{orderNo')
        expect(editor.store.history).toHaveLength(1)

        // undo 一步：标记与镜像一并回退（重标镜像语义）
        editor.undo()
        await nextTick()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.expression).toBe('{{')
        expect(restored.type === 'TextLayer' && restored.text).toBe('{{')
    })

    it('src/value 字段同面接线：图片层资源地址表达式态同样弹出', async () => {
        const editor = makeEditor([imageLayer({ src: '{{', expression: '{{' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        // 表达式态标识类唯一定位数据字段输入（前面还有 position/color 等输入控件）
        const fieldEl = wrapper.find('input.cn-field--expression').element as HTMLInputElement
        fieldEl.value = '{{or'
        fieldEl.setSelectionRange(5, 5)
        fieldEl.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['orderNo', 'order'])
    })
})
