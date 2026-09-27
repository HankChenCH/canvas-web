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
            'pair',
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
        // 锚点默认收起：展开折叠区后九宫可选，点击即最终提交
        expect(wrapper.findAll('.cn-anchor__cell')).toHaveLength(0)
        await wrapper.find('.cn-anchor-disclosure__header').trigger('click')
        await wrapper.vm.$nextTick()
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

        // 注册表没有的字段不出现：autoWidth 开启后宽输入仍在但禁用（禁用态归
        // 控件层，工票 03），高不受影响
        editor.updateSpec(['layers', 0], ['shape', 'autoWidth'], true)
        await wrapper.vm.$nextTick()
        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        expect(widthInput.placeholder).toBe('自动')
        expect((wrapper.find('input[aria-label="高"]').element as HTMLInputElement).disabled).toBe(false)

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

describe('位置与尺寸组（layer-panel-ux 工票 03：两列行 + auto prefix + 折叠锚点 + angle 迁入）', () => {
    it('X|Y 与 宽|高 各为一行两列，宽/高列带自适应 prefix 钮', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const section = wrapper.findAll('.cn-props__section')[0]!
        expect(section.text()).toContain('位置与尺寸')
        // 前两行 = 位置 pair 与 尺寸 pair：每行两个数值输入，列自描述 X/Y/宽/高；
        // 行级标签不复述（code-review 整改：无「尺寸 尺寸」双 label）
        const fieldRows = section.findAll('.cn-prop-field')
        expect(fieldRows[0]!.text()).toContain('X')
        expect(fieldRows[0]!.text()).toContain('Y')
        expect(fieldRows[0]!.text()).not.toContain('位置')
        expect(fieldRows[0]!.findAll('input[type="number"]')).toHaveLength(2)
        expect(fieldRows[1]!.text()).toContain('宽')
        expect(fieldRows[1]!.text()).toContain('高')
        expect(fieldRows[1]!.text()).not.toContain('尺寸')
        expect(fieldRows[1]!.findAll('input[type="number"]')).toHaveLength(2)
        // pair 行根不是 label（列各有 label，嵌套 label 非法）
        expect(fieldRows[0]!.element.tagName).toBe('DIV')
        expect(fieldRows[0]!.find('label label').exists()).toBe(false)
        // 宽/高列各一枚「自」prefix 钮；X/Y 行无
        const toggles = section.findAll('.cn-props__auto-toggle')
        expect(toggles).toHaveLength(2)
        wrapper.unmount()
    })

    it('高自适应开 → 高框禁用显示 layerBoxAt 解析值（gizmo 同源），宽不受影响', async () => {
        const editor = makeEditor([textLayer({ shape: { width: 120, height: 80, autoWidth: false, autoHeight: true, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const heightInput = wrapper.find('input[aria-label="高"]').element as HTMLInputElement
        expect(heightInput.disabled).toBe(true)
        // 解析值与 EditorSession.layerBoxAt 同源（同一布局求值，不漂移）
        expect(heightInput.value).toBe(String(editor.layerBoxAt(['layers', 0])!.height))
        expect((wrapper.find('input[aria-label="宽"]').element as HTMLInputElement).disabled).toBe(false)
        wrapper.unmount()
    })

    it('宽自适应开 → 宽框禁用显「自动」占位（布局求值缺失不显解析值）', async () => {
        const editor = makeEditor([textLayer({ shape: { width: 120, height: 80, autoWidth: true, autoHeight: false, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        expect(widthInput.placeholder).toBe('自动')
        expect(widthInput.value).toBe('') // 不显声明值（会误导为已生效）
        wrapper.unmount()
    })

    it('prefix 钮点击切自适应：写 shape.autoWidth/autoHeight，一步历史', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const toggles = wrapper.findAll('.cn-props__auto-toggle')
        await toggles[0]!.trigger('click') // 宽自适应
        await toggles[1]!.trigger('click') // 高自适应
        const shape = editor.store.doc!.layers[0]!.shape
        expect(shape.autoWidth).toBe(true)
        expect(shape.autoHeight).toBe(true)
        expect(editor.store.history).toHaveLength(2) // 两次独立切换 = 两步
        wrapper.unmount()
    })

    it('锚点折叠区：默认收起（微缩图在场），展开后九宫可选；开合写 store ui 分支（会话记忆）', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        // 收起态：九宫不在场、微缩图 svg 在场、aria-expanded=false
        const header = wrapper.find('.cn-anchor-disclosure__header')
        expect(header.attributes('aria-expanded')).toBe('false')
        expect(header.find('svg').exists()).toBe(true)
        expect(wrapper.findAll('.cn-anchor__cell')).toHaveLength(0)
        expect(editor.store.ui.anchorExpanded).toBe(false)

        await header.trigger('click')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-anchor-disclosure__header').attributes('aria-expanded')).toBe('true')
        expect(wrapper.findAll('.cn-anchor__cell')).toHaveLength(9)
        expect(editor.store.ui.anchorExpanded).toBe(true)
        expect(editor.store.history).toHaveLength(0) // 开合不进历史

        // 会话内记忆：面板重挂载（同一 editor）仍展开
        wrapper.unmount()
        const remounted = mount(PropertyPanel, { props: { editor } })
        expect(remounted.findAll('.cn-anchor__cell')).toHaveLength(9)
        remounted.unmount()
    })

    it('angle 迁入位置与尺寸组：TextLayer 有旋转角且提交走 updateSpec，ImageLayer 无', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('旋转角')

        const angleInput = wrapper.find('input[aria-label="旋转角"]')
        ;(angleInput.element as HTMLInputElement).value = '45'
        await angleInput.trigger('input')
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.angle).toBe(45)
        wrapper.unmount()

        const imageEditor = makeEditor([{ ...textLayer(), type: 'ImageLayer', src: null } as Layer])
        const imagePanel = mount(PropertyPanel, { props: { editor: imageEditor } })
        imageEditor.setSelection(['layers', 0])
        await imagePanel.vm.$nextTick()
        expect(imagePanel.text()).not.toContain('旋转角')
        imagePanel.unmount()
    })
})

describe('数据字段取值方式切换（静态值/表达式，工单 02）', () => {
    it('未选中：画布级字段组无取值方式切换钮', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-props__data-toggle').exists()).toBe(false)
        wrapper.unmount()
    })

    it('静态态：切换钮未激活，编辑走 updateData（保持未标记）', async () => {
        const editor = makeEditor([textLayer({ text: '甲' })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const chip = wrapper.find('.cn-props__data-toggle')
        expect(chip.exists()).toBe(true)
        expect(chip.classes()).not.toContain('cn-props__data-toggle--active')
        expect(wrapper.find('textarea.cn-field--expression').exists()).toBe(false)

        const area = wrapper.find('textarea')
        area.element.value = '新字面'
        await area.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('新字面')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        wrapper.unmount()
    })

    it('表达式态：切换钮激活 + 输入框标识，编辑保持标记（镜像字面更新）', async () => {
        const expression = '{{certCode}}'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.cn-props__data-toggle').classes()).toContain('cn-props__data-toggle--active')
        expect(wrapper.find('textarea.cn-field--expression').exists()).toBe(true)

        const area = wrapper.find('textarea')
        area.element.value = '{{personProfile.name}}'
        await area.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{personProfile.name}}')
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{personProfile.name}}')
        wrapper.unmount()
    })

    it('点击切换钮双向换态：表达式→静态字面接管，静态→表达式初值取当前字面', async () => {
        const expression = '{{certCode}}'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        // 表达式 → 静态：字面接管
        await wrapper.find('.cn-props__data-toggle').trigger('click')
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-props__data-toggle').classes()).not.toContain('cn-props__data-toggle--active')

        // 静态 → 表达式：初值 = 当前字面（不自动包裹）
        await wrapper.find('.cn-props__data-toggle').trigger('click')
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe(expression)
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-props__data-toggle').classes()).toContain('cn-props__data-toggle--active')
        wrapper.unmount()
    })
})
