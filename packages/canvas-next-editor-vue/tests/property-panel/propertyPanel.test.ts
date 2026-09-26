// @vitest-environment jsdom
/**
 * PropertyField 分发与 PropertyPanel 集成测试（工单 09）：
 * - <component :is> 注册表分发、markRaw 组件对象
 * - 画布级/图层级目标切换、权威字段过滤（未知字段不渲染不告警）
 * - 提交链路：控件事件 → commit → 内核 action → mergeKey 合步
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type Layer } from '@hankchen/canvas-next-editor'

import PropertyField from '../../src/property-panel/PropertyField.vue'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'
import NumberField from '../../src/property-panel/fields/NumberField.vue'
import { controlRegistry } from '../../src/property-panel/controls'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: readonly Layer[]): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

const textLayer = (overrides: Record<string, unknown> = {}): Layer => ({
    type: 'TextLayer',
    priority: 10,
    shape: {
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
    },
    align: { horizontal: 'left', vertical: 'top' },
    position: { anchor: 'top-left', x: 0, y: 0 },
    text: '甲',
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
    ...overrides,
} as Layer)

describe('PropertyField：<component :is> 注册表分发', () => {
    it('按 control 类型分发到注册表组件', () => {
        const field: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
        const wrapper = mount(PropertyField, { props: { field, value: 7 } })
        expect(wrapper.findComponent(NumberField).exists()).toBe(true)
        expect(wrapper.text()).toContain('X')
    })

    it('控件 input/change 原样上抛为字段值', async () => {
        const field: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
        const wrapper = mount(PropertyField, { props: { field, value: 7 } })
        const input = wrapper.find('input')
        input.element.value = '9'
        await input.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([9])
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([9])
    })

    it('注册表覆盖全部控件种类且值为组件对象（markRaw 不进 reactive）', () => {
        const kinds: FieldDef['control'][] = [
            'number',
            'text',
            'textarea',
            'color',
            'select',
            'boolean',
            'anchor',
            'padding',
            'border',
        ]
        for (const kind of kinds) {
            const component = controlRegistry[kind]
            expect(component, kind).toBeTruthy()
        }
    })
})

describe('PropertyPanel：schema 驱动表单', () => {
    it('未选中：画布级属性（宽/高），编辑写画布', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        expect(wrapper.text()).toContain('画布属性')
        const numbers = wrapper.findAll('input[type="number"]')
        expect(numbers).toHaveLength(2) // 宽 + 高

        const widthInput = numbers[0]!.element as HTMLInputElement
        widthInput.value = '1024'
        await numbers[0]!.trigger('input')
        await numbers[0]!.trigger('change')
        expect(editor.store.doc!.width).toBe(1024)
        wrapper.unmount()
    })

    it('选中图层：按注册表渲染表单，编辑实时写文档', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('图层属性')
        expect(wrapper.text()).toContain('锚点')
        // 九宫锚点选择器：点击即最终提交
        const anchorCells = wrapper.findAll('.cn-anchor__cell')
        expect(anchorCells).toHaveLength(9)
        await anchorCells[4]!.trigger('click')
        expect(editor.store.doc!.layers[0]!.position.anchor).toBe('center')
        expect(editor.store.history).toHaveLength(1)

        // 文本内容 textarea 实时生效
        const area = wrapper.find('textarea')
        area.element.value = '新文案'
        await area.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('新文案')
        wrapper.unmount()
    })

    it('连续改动合并为一步历史，blur 收口后另起新步', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        // 找到 X 数值框（位置 section 第一个 number 输入 = 锚点是按钮，X 是首个 number）
        const numbers = wrapper.findAll('input[type="number"]')
        expect(numbers.length).toBeGreaterThanOrEqual(2)

        const xInput = numbers[0]!.element as HTMLInputElement
        xInput.value = '11'
        await numbers[0]!.trigger('input')
        xInput.value = '22'
        await numbers[0]!.trigger('input')
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.doc!.layers[0]!.position.x).toBe(22)

        await numbers[0]!.trigger('change')
        expect(editor.store.history).toHaveLength(1) // 收口不另起步

        xInput.value = '33'
        await numbers[0]!.trigger('input')
        expect(editor.store.history).toHaveLength(2) // 收口后的新会话 → 新步
        wrapper.unmount()
    })

    it('权威字段过滤：未知字段不渲染、不告警刷屏', async () => {
        const warnSpy = vi.spyOn(console, 'warn')
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        // 注册表没有的字段（如 TextLayer 的 priority 之外的面板未注册字段）不出现：
        // 用 autoWidth 开着的形态验证 width 隐藏
        editor.updateSpec(['layers', 0], ['shape', 'autoWidth'], true)
        await wrapper.vm.$nextTick()
        const labels = wrapper.findAll('.cn-prop-field__label').map((n) => n.text())
        expect(labels).not.toContain('宽')
        expect(labels).toContain('高')

        // 全程无 console.warn（未知/悬空字段静默跳过）
        expect(warnSpy).not.toHaveBeenCalled()
        warnSpy.mockRestore()
        wrapper.unmount()
    })

    it('选择切换：表单随选中层重挂载（渲染键含选中路径）', async () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        const area = wrapper.find('textarea')
        expect((area.element as HTMLTextAreaElement).value).toBe('甲')

        editor.setSelection(['layers', 1])
        await wrapper.vm.$nextTick()
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('乙')
        wrapper.unmount()
    })
})
