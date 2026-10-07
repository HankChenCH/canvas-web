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

import { cellLayer, rowLayer, tableLayer } from '../../../canvas-next-editor/tests/support/fixtures'
import PropertyField from '../../src/property-panel/PropertyField.vue'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'
import NumberField from '../../src/property-panel/fields/NumberField.vue'
import { controlRegistry } from '../../src/property-panel/controls'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const nullScheduler: FrameScheduler = () => () => {}

/** padding 行静态文案（placeholder-padding-hint 工单 01，与 fieldSchema.test 同源字面） */
const PADDING_COPY = '内边距作用于内容盒，不改变图层尺寸'

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
            'align',
            'padding',
            'border',
        ]
        for (const kind of kinds) {
            const component = controlRegistry[kind]
            expect(component, kind).toBeTruthy()
        }
    })
})

describe('PropertyField：行解剖布局（面板布局优化：标签列定宽 + 数据字段上下两行）', () => {
    it('普通字段行 = 固定标签列网格（60px 列），label 与控件各占一列（弹性 justify-between 退役）', () => {
        const field: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
        const wrapper = mount(PropertyField, { props: { field, value: 7 } })
        const root = wrapper.find('.cn-prop-field')
        expect(root.classes()).toContain('grid')
        expect(root.classes()).toContain('grid-cols-[60px_minmax(0,1fr)]')
        expect(root.classes()).not.toContain('justify-between')
        expect(wrapper.find('.cn-prop-field__label').text()).toBe('X')
        // 非数据字段控件不跨列
        expect(wrapper.findComponent(NumberField).classes()).not.toContain('col-span-2')
    })

    it('pair 行 = 全宽块级（列标签自描述，不进双列网格）', () => {
        const field: FieldDef = {
            key: ['position'],
            label: '位置',
            control: 'pair',
            items: [
                { key: ['x'], label: 'X', control: 'number', integer: true },
                { key: ['y'], label: 'Y', control: 'number', integer: true },
            ],
        }
        const wrapper = mount(PropertyField, { props: { field, value: { x: 1, y: 2 } } })
        const root = wrapper.find('.cn-prop-field')
        expect(root.classes()).toContain('block')
        expect(root.classes()).not.toContain('grid-cols-[60px_minmax(0,1fr)]')
    })

    it('数据字段 = 上下两行：取值方式分段占第一行，输入控件 col-span-2 跨全宽', () => {
        const field: FieldDef = { key: ['text'], label: '内容', control: 'textarea', data: true }
        const wrapper = mount(PropertyField, { props: { field, value: '甲', dataMode: 'static' } })
        // 第一行：标签 + 分段选择器（非 col-span-2，落右端列）
        expect(wrapper.find('.cn-prop-field__label').text()).toBe('内容')
        expect(wrapper.find('.cn-valuetype').exists()).toBe(true)
        // 第二行：输入控件跨标签列 + 控件列（撑满面板宽）
        expect(wrapper.find('textarea').classes()).toContain('col-span-2')
    })

    it('字段级悬停提示：FieldDef.title 落标签 title 属性（placeholder-padding-hint 工单 01），缺省不渲染', () => {
        const withTitle: FieldDef = {
            key: ['shape', 'padding'],
            label: '内边距',
            control: 'padding',
            title: PADDING_COPY,
        }
        const titled = mount(PropertyField, {
            props: { field: withTitle, value: { top: 0, bottom: 0, left: 0, right: 0 } },
        })
        expect(titled.find('.cn-prop-field__label').attributes('title')).toBe(PADDING_COPY)
        titled.unmount()

        const bare = mount(PropertyField, {
            props: {
                field: { key: ['position', 'x'], label: 'X', control: 'number', integer: true } satisfies FieldDef,
                value: 7,
            },
        })
        expect(bare.find('.cn-prop-field__label').attributes('title')).toBeUndefined()
        bare.unmount()
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

    it('宽自适应开 → 宽框禁用显示 layerBoxAt 解析值（工单 04：自然宽求值落地，与高自适应同源），高不受影响', async () => {
        const editor = makeEditor([textLayer({ shape: { width: 120, height: 80, autoWidth: true, autoHeight: false, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        // 解析值与 EditorSession.layerBoxAt 同源（同一布局求值，不漂移）——不再是「自动」占位
        expect(widthInput.value).toBe(String(editor.layerBoxAt(['layers', 0])!.width))
        expect(widthInput.value).not.toBe('')
        expect((wrapper.find('input[aria-label="高"]').element as HTMLInputElement).disabled).toBe(false)
        wrapper.unmount()
    })

    it('宽高自适应同开 → 两列各显各的解析值（auto.key → 盒维度映射，注册表推导不硬编码键串）', async () => {
        const editor = makeEditor([textLayer({ shape: { width: 0, height: 0, autoWidth: true, autoHeight: true, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const box = editor.layerBoxAt(['layers', 0])!
        expect((wrapper.find('input[aria-label="宽"]').element as HTMLInputElement).value).toBe(String(box.width))
        expect((wrapper.find('input[aria-label="高"]').element as HTMLInputElement).value).toBe(String(box.height))
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

describe('数据字段取值方式分段选择器（静态 | 表达式，layer-panel-ux 工单 06）', () => {
    it('未选中：画布级字段组无取值方式分段选择器', async () => {
        const editor = makeEditor([textLayer()])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(false)
        wrapper.unmount()
    })

    it('静态态：两段渲染、静态段 accent 高亮，编辑走 updateData（保持未标记）', async () => {
        const editor = makeEditor([textLayer({ text: '甲' })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const segments = wrapper.findAll('.cn-valuetype__option')
        expect(segments).toHaveLength(2)
        expect(segments[0]!.text()).toBe('静态')
        expect(segments[1]!.text()).toBe('表达式')
        expect(segments[0]!.classes()).toContain('cn-valuetype__option--active')
        expect(segments[1]!.classes()).not.toContain('cn-valuetype__option--active')
        expect(wrapper.find('textarea.cn-field--expression').exists()).toBe(false)

        const area = wrapper.find('textarea')
        area.element.value = '新字面'
        await area.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('新字面')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        wrapper.unmount()
    })

    it('表达式态：表达式段高亮 + 输入框标识，编辑保持标记（镜像字面更新）', async () => {
        const expression = '{{certCode}}'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        const segments = wrapper.findAll('.cn-valuetype__option')
        expect(segments[1]!.classes()).toContain('cn-valuetype__option--active')
        expect(segments[0]!.classes()).not.toContain('cn-valuetype__option--active')
        expect(wrapper.find('textarea.cn-field--expression').exists()).toBe(true)

        const area = wrapper.find('textarea')
        area.element.value = '{{personProfile.name}}'
        await area.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{personProfile.name}}')
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{personProfile.name}}')
        wrapper.unmount()
    })

    it('点击分段双向换态：语义与升级前一致（各一步、不丢字面、undo 可回）', async () => {
        const expression = '{{certCode}}'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        // 表达式 → 静态：字面接管（一步历史）
        await wrapper.findAll('.cn-valuetype__option')[0]!.trigger('click')
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        expect(editor.store.history).toHaveLength(1)
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll('.cn-valuetype__option')[0]!.classes()).toContain('cn-valuetype__option--active')

        // 静态 → 表达式：初值 = 当前字面（不自动包裹），undo 回静态再 redo 复原
        await wrapper.findAll('.cn-valuetype__option')[1]!.trigger('click')
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe(expression)
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        expect(editor.store.history).toHaveLength(2)

        editor.undo()
        await wrapper.vm.$nextTick()
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(wrapper.findAll('.cn-valuetype__option')[0]!.classes()).toContain('cn-valuetype__option--active')

        editor.redo()
        await wrapper.vm.$nextTick()
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe(expression)
        expect(wrapper.findAll('.cn-valuetype__option')[1]!.classes()).toContain('cn-valuetype__option--active')
        wrapper.unmount()
    })

    it('点击当前态分段不产生冗余历史步', async () => {
        const editor = makeEditor([textLayer({ expression: null })])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        await wrapper.findAll('.cn-valuetype__option')[0]!.trigger('click') // 静态已是当前态
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.expression).toBeNull()
        wrapper.unmount()
    })

    it('三内容层对称：text/src/value 行都带分段选择器', async () => {
        const editor = makeEditor([
            textLayer(),
            { ...textLayer(), type: 'ImageLayer', src: null } as Layer,
            { ...textLayer(), type: 'QrCodeLayer', value: '甲' } as Layer,
        ])
        const wrapper = mount(PropertyPanel, { props: { editor } })

        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(true)

        editor.setSelection(['layers', 1])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(true)

        editor.setSelection(['layers', 2])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(true)
        wrapper.unmount()
    })

    it('格内容层路径生效、行模板子树不渲染（现状保持）', async () => {
        // 共享造数器（包 AGENTS.md：跨包 fixture 经 ../../.. 取 canvas-next-editor tests/support）
        const table = tableLayer([
            rowLayer([cellLayer(textLayer({ text: '姓名：{{row.name}}', expression: null }))]),
        ])
        const editor = makeEditor([table])
        const wrapper = mount(PropertyPanel, { props: { editor } })

        // 格内容层：数据字段 + 分段选择器在场
        editor.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(true)
        expect(wrapper.find('textarea').exists()).toBe(true)

        // 表格根层无数据字段：无分段选择器（行模板子树本就无字段组，schema 层已锁）
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-valuetype').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('对齐分段图标按钮组（layer-panel-ux 工单 05：两排分段替代 select 下拉）', () => {
    async function mountWithSelection(layers: readonly Layer[]) {
        const editor = makeEditor(layers)
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        return { editor, wrapper }
    }

    it('对齐 section 渲染两排分段组（水平/垂直各 3 枚图标钮），无 select 下拉', async () => {
        const { wrapper } = await mountWithSelection([textLayer()])
        const groups = wrapper.findAll('.cn-align')
        expect(groups).toHaveLength(2)
        expect(groups[0]!.attributes('aria-label')).toBe('水平')
        expect(groups[1]!.attributes('aria-label')).toBe('垂直')
        for (const group of groups) {
            expect(group.findAll('.cn-align__option')).toHaveLength(3)
            expect(group.findAll('.cn-align__option svg')).toHaveLength(3)
        }
        expect(wrapper.find('select').exists()).toBe(false)
        wrapper.unmount()
    })

    it('一次点击精准切换：提交正确枚举值（updateSpec 管线），一步历史', async () => {
        const { editor, wrapper } = await mountWithSelection([textLayer()])
        const groups = wrapper.findAll('.cn-align')

        // 水平 → 右
        await groups[0]!.findAll('.cn-align__option')[2]!.trigger('click')
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.align.horizontal).toBe('right')
        expect(editor.store.history).toHaveLength(1)

        // 垂直 → 底（另一轴独立提交，互不合并）
        await groups[1]!.findAll('.cn-align__option')[2]!.trigger('click')
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.align.vertical).toBe('bottom')
        expect(editor.store.history).toHaveLength(2)
        wrapper.unmount()
    })

    it('点击已选中分段不产生冗余历史步', async () => {
        const { editor, wrapper } = await mountWithSelection([textLayer()])
        await wrapper.findAll('.cn-align')[0]!.findAll('.cn-align__option')[0]!.trigger('click') // 水平已是 left
        expect(editor.store.history).toHaveLength(0)
        wrapper.unmount()
    })

    it('选中态渲染跟随文档值：提交后高亮迁移，undo 回归到旧值高亮', async () => {
        const { editor, wrapper } = await mountWithSelection([textLayer()])
        const segments = () => wrapper.findAll('.cn-align')[1]!.findAll('.cn-align__option')
        const activeTitle = () =>
            segments()
                .find((s) => s.classes().includes('cn-align__option--active'))
                ?.attributes('title')
        expect(activeTitle()).toBe('垂直：顶对齐')

        await segments()[2]!.trigger('click') // 垂直 → 底
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.align.vertical).toBe('bottom')
        expect(activeTitle()).toBe('垂直：底对齐')

        editor.undo() // 回归：撤销一步，文档与高亮同步复原
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.align.vertical).toBe('top')
        expect(activeTitle()).toBe('垂直：顶对齐')
        wrapper.unmount()
    })
})

describe('形状：内边距/边框简写控件（layer-panel-ux 工单 04）', () => {
    const pad = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right })
    const shapeWith = (overrides: Record<string, unknown>): Record<string, unknown> => ({
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: pad(0, 0, 0, 0),
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
        ...overrides,
    })
    const side = (width: number, color: string) => ({ width, color })

    async function mountWithLayers(layers: readonly Layer[]) {
        const editor = makeEditor(layers)
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        return { editor, wrapper }
    }

    it('内边距初始模式由数据推导；选择切换随层重推导（不保留上次 UI 态）', async () => {
        const editor = makeEditor([
            textLayer({ shape: shapeWith({ padding: pad(8, 3, 5, 7) }) as never }),
            textLayer({ shape: shapeWith({ padding: pad(6, 6, 2, 2) }) as never }),
        ])
        const wrapper = mount(PropertyPanel, { props: { editor } })
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-padding').findAll('input[type="number"]')).toHaveLength(4)

        editor.setSelection(['layers', 1])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-padding').findAll('input[type="number"]')).toHaveLength(2)
        wrapper.unmount()
    })

    it('padding 行标签带内容盒语义悬停文案（placeholder-padding-hint 工单 01：schema 驱动，非组件硬编码）', async () => {
        const { wrapper } = await mountWithLayers([textLayer()])
        const row = wrapper.findAll('.cn-prop-field').find((r) => r.find('.cn-padding').exists())!
        const label = row.find('.cn-prop-field__label')
        expect(label.text()).toBe('内边距')
        expect(label.attributes('title')).toBe(PADDING_COPY)
        wrapper.unmount()
    })

    it('模式 1 编辑经 updateSpec 写全四边（input 实时生效，一步历史）', async () => {
        const { editor, wrapper } = await mountWithLayers([textLayer()])
        const input = wrapper.find('.cn-padding input[type="number"]')
        ;(input.element as HTMLInputElement).value = '9'
        await input.trigger('input')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.shape.padding).toEqual(pad(9, 9, 9, 9))
        expect(editor.store.history).toHaveLength(1)

        await input.trigger('change')
        expect(editor.store.history).toHaveLength(1) // 收口不另起步
        wrapper.unmount()
    })

    it('循环展开 1→2：纯 UI 不进历史、文档不动', async () => {
        const { editor, wrapper } = await mountWithLayers([textLayer()])
        await wrapper.find('.cn-padding .cn-props__mode-toggle').trigger('click')
        expect(wrapper.find('.cn-padding').findAll('input[type="number"]')).toHaveLength(2)
        expect(editor.store.history).toHaveLength(0)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.shape.padding).toEqual(pad(0, 0, 0, 0))
        wrapper.unmount()
    })

    it('循环收缩 4→1：立即写回规整一步历史，undo 复原且模式重推导回四框', async () => {
        const { editor, wrapper } = await mountWithLayers([
            textLayer({ shape: shapeWith({ padding: pad(8, 3, 5, 7) }) as never }),
        ])
        await wrapper.find('.cn-padding .cn-props__mode-toggle').trigger('click') // 4→1
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.shape.padding).toEqual(pad(8, 8, 8, 8))
        expect(editor.store.history).toHaveLength(1)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-padding').findAll('input[type="number"]')).toHaveLength(1)

        editor.undo()
        await wrapper.vm.$nextTick()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.shape.padding).toEqual(pad(8, 3, 5, 7))
        expect(wrapper.find('.cn-padding').findAll('input[type="number"]')).toHaveLength(4) // 数据变了重推导
        wrapper.unmount()
    })

    it('边框收缩 4→1 且上为 null → 全 null（无边框），undo 复原', async () => {
        const { editor, wrapper } = await mountWithLayers([
            textLayer({
                shape: shapeWith({
                    border: { top: null, bottom: side(2, '#000000'), left: side(6, '#0ea5e9'), right: null },
                }) as never,
            }),
        ])
        expect(wrapper.find('.cn-border').findAll('input[type="number"]')).toHaveLength(4)

        await wrapper.find('.cn-border .cn-props__mode-toggle').trigger('click') // 4→1
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.shape.border).toEqual({
            top: null,
            bottom: null,
            left: null,
            right: null,
        })
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        await wrapper.vm.$nextTick()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.shape.border).toEqual({
            top: null,
            bottom: side(2, '#000000'),
            left: side(6, '#0ea5e9'),
            right: null,
        })
        expect(wrapper.find('.cn-border').findAll('input[type="number"]')).toHaveLength(4)
        wrapper.unmount()
    })

    it('边框模式 1 空框输入正宽度 = 四边开启（默认黑），一步历史', async () => {
        const { editor, wrapper } = await mountWithLayers([textLayer()])
        const width = wrapper.find('.cn-border input[type="number"]')
        expect((width.element as HTMLInputElement).value).toBe('') // 无边框空显示

        ;(width.element as HTMLInputElement).value = '3'
        await width.trigger('input')
        await width.trigger('change')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.shape.border).toEqual({
            top: side(3, '#000000'),
            bottom: side(3, '#000000'),
            left: side(3, '#000000'),
            right: side(3, '#000000'),
        })
        expect(editor.store.history).toHaveLength(1)
        wrapper.unmount()
    })
})
