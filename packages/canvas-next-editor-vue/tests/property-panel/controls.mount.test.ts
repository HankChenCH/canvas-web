// @vitest-environment jsdom
/**
 * 控件挂载测试（工单 09）：每种控件一枚——挂载渲染、实时/收口事件语义、
 * 取值钳位与结构化对象的组装。控件提交语义 = input 实时（面板合步）+
 * change 收口（一步历史定格）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { Border, Padding } from '@hankchen/canvas-next-editor'

import AnchorDisclosureField from '../../src/property-panel/fields/AnchorDisclosureField.vue'
import BooleanField from '../../src/property-panel/fields/BooleanField.vue'
import BorderField from '../../src/property-panel/fields/BorderField.vue'
import ColorField from '../../src/property-panel/fields/ColorField.vue'
import NumberField from '../../src/property-panel/fields/NumberField.vue'
import PaddingField from '../../src/property-panel/fields/PaddingField.vue'
import PairField from '../../src/property-panel/fields/PairField.vue'
import SelectField from '../../src/property-panel/fields/SelectField.vue'
import TextField from '../../src/property-panel/fields/TextField.vue'
import TextareaField from '../../src/property-panel/fields/TextareaField.vue'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const numField: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
const padding = (v: number): Padding => ({ top: v, bottom: v, left: v, right: v })
const noBorder = (): Border => ({ top: null, bottom: null, left: null, right: null })

describe('NumberField', () => {
    it('挂载渲染当前值；input 实时发出整数化数值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        expect((input.element as HTMLInputElement).value).toBe('10')

        // 直设 DOM 值再发 input（setValue 会连发 input+change，非逐键语义）
        input.element.value = '25.7'
        await input.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([25])
        expect(wrapper.emitted('change')).toBeUndefined() // 实时事件不收口
    })

    it('change 收口发出最终值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = '30'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([30])
    })

    it('空串/清空不提交（Number("") 不得误作 0），非法收口回显文档值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = ''
        await input.trigger('input')
        expect(wrapper.emitted('input')).toBeUndefined()

        input.element.value = '18'
        await input.trigger('input')
        input.element.value = ''
        await input.trigger('blur')
        expect(wrapper.emitted('change')).toBeUndefined()
        expect((input.element as HTMLInputElement).value).toBe('10') // 回显文档值
    })

    it('blur 收口发出当前草稿值（change 未触发也有收口）', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = '44'
        await input.trigger('blur')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([44])
    })

    it('min 钳位', async () => {
        const wrapper = mount(NumberField, {
            props: { field: { ...numField, min: 0 }, modelValue: 5 },
        })
        wrapper.find('input').element.value = '-8'
        await wrapper.find('input').trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([0])
    })
})

describe('TextField', () => {
    const field: FieldDef = { key: ['src'], label: '资源地址', control: 'text' }

    it('挂载渲染；input 实时发出输入串', async () => {
        const wrapper = mount(TextField, { props: { field, modelValue: '/a.png' } })
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('/a.png')
        await wrapper.find('input').setValue('/b.png')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['/b.png'])
    })

    it('change 收口发出最终值', async () => {
        const wrapper = mount(TextField, { props: { field, modelValue: '/a.png' } })
        await wrapper.find('input').setValue('/final.png')
        await wrapper.find('input').trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['/final.png'])
    })
})

describe('TextareaField', () => {
    it('挂载渲染多行内容；input 实时发出', async () => {
        const field: FieldDef = { key: ['text'], label: '内容', control: 'textarea', data: true }
        const wrapper = mount(TextareaField, { props: { field, modelValue: '第一行' } })
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('第一行')
        await wrapper.find('textarea').setValue('第一行\n第二行')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['第一行\n第二行'])
    })
})

describe('ColorField', () => {
    it('非 nullable 渲染取色器 + 文本框；文本 change 收口', async () => {
        const field: FieldDef = { key: ['fontColor'], label: '字色', control: 'color' }
        const wrapper = mount(ColorField, { props: { field, modelValue: '#112233' } })
        const inputs = wrapper.findAll('input[type="text"]')
        expect(inputs).toHaveLength(1)
        expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

        const textInput = inputs[0]!.element as HTMLInputElement
        textInput.value = 'rgba(1, 2, 3, 0.5)'
        await inputs[0]!.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['rgba(1, 2, 3, 0.5)'])
    })

    it('nullable：null 禁用输入；启用切换发出 change', async () => {
        const field: FieldDef = { key: ['shape', 'backgroundColor'], label: '背景色', control: 'color', nullable: true }
        const wrapper = mount(ColorField, { props: { field, modelValue: null } })
        expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('input[type="color"]').element as HTMLInputElement).disabled).toBe(true)

        await wrapper.find('input[type="checkbox"]').setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['#000000'])

        await wrapper.setProps({ modelValue: '#336699' })
        expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
        await wrapper.find('input[type="checkbox"]').setValue(false)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([null])
    })

    it('取色器拖动实时提交（input），change 收口', async () => {
        const field: FieldDef = { key: ['shape', 'backgroundColor'], label: '背景色', control: 'color' }
        const wrapper = mount(ColorField, { props: { field, modelValue: '#000000' } })
        await wrapper.find('input[type="color"]').setValue('#abcdef')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['#abcdef'])
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['#abcdef'])
    })
})

describe('SelectField', () => {
    it('按 domain 渲染选项；change 发出所选值', async () => {
        const field: FieldDef = {
            key: ['align', 'horizontal'],
            label: '水平',
            control: 'select',
            domain: ['left', 'center', 'right'],
        }
        const wrapper = mount(SelectField, { props: { field, modelValue: 'left' } })
        const options = wrapper.findAll('option')
        expect(options.map((o) => o.element.value)).toEqual(['left', 'center', 'right'])

        await wrapper.find('select').setValue('center')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['center'])
    })
})

describe('BooleanField', () => {
    it('渲染勾选态；切换发出 change', async () => {
        const wrapper = mount(BooleanField, {
            props: { field: { key: ['autowrap'], label: '自动换行', control: 'boolean' }, modelValue: false },
        })
        expect(wrapper.find('input').element.checked).toBe(false)
        await wrapper.find('input').setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([true])
    })

    it('modelValue 不变的回同步：内核把标志归一回原值时 DOM 勾选态跟回（工单 12 采纳语义）', async () => {
        const wrapper = mount(BooleanField, {
            props: { field: { key: ['shape', 'autoHeight'], label: '高自适应', control: 'boolean' }, modelValue: false },
        })
        // 用户点开（DOM checked=true，change 已发），内核采纳后标志固化回 false——
        // VDOM :checked 值未变（false → false），组件须自行把 DOM 勾选态拉回去
        const input = wrapper.find('input')
        input.element.checked = true
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([true])

        await wrapper.setProps({ modelValue: false })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('input').element.checked).toBe(false)
    })
})

describe('AnchorDisclosureField（块级折叠区，layer-panel-ux 工票 03）', () => {
    const field: FieldDef = { key: ['position', 'anchor'], label: '锚点', control: 'anchor' }

    it('收起态：九宫不在场，微缩图 svg 在场且点亮当前锚点，aria-expanded=false', () => {
        const wrapper = mount(AnchorDisclosureField, { props: { field, modelValue: 'center', expanded: false } })
        expect(wrapper.findAll('.cn-anchor__cell')).toHaveLength(0)
        const svg = wrapper.find('svg')
        expect(svg.exists()).toBe(true)
        // center = 行优先下标 4 的点被点亮（fill accent），其余弱化
        const dots = svg.findAll('circle')
        expect(dots).toHaveLength(9)
        expect(dots[4]!.classes()).toContain('fill-cn-accent')
        expect(dots[0]!.classes()).not.toContain('fill-cn-accent')
        expect(wrapper.find('.cn-anchor-disclosure__header').attributes('aria-expanded')).toBe('false')
    })

    it('微缩图点亮位按锚点名映射（单词形态 top/left/right/center 同款规则）', async () => {
        const litIndex = (anchor: string): number => {
            const wrapper = mount(AnchorDisclosureField, {
                props: { field, modelValue: anchor as never, expanded: false },
            })
            const index = wrapper.findAll('circle').findIndex((d) => d.classes().includes('fill-cn-accent'))
            wrapper.unmount()
            return index
        }
        expect(litIndex('top-left')).toBe(0)
        expect(litIndex('top')).toBe(1) // 顶行中列
        expect(litIndex('left')).toBe(3) // 中行左列
        expect(litIndex('center')).toBe(4)
        expect(litIndex('right')).toBe(5)
        expect(litIndex('bottom-right')).toBe(8)
    })

    it('点击标题行只报 toggle（开合归 store ui 分支）；expanded 后九宫在场', async () => {
        const wrapper = mount(AnchorDisclosureField, { props: { field, modelValue: 'top-left', expanded: false } })
        await wrapper.find('.cn-anchor-disclosure__header').trigger('click')
        expect(wrapper.emitted('toggle')).toHaveLength(1)
        expect(wrapper.emitted('change')).toBeUndefined() // 开合不是锚点提交

        await wrapper.setProps({ expanded: true })
        const cells = wrapper.findAll('.cn-anchor__cell')
        expect(cells).toHaveLength(9)
        expect(cells[0]!.classes()).toContain('cn-anchor__cell--active')
    })

    it('展开后点击九宫即最终提交对应锚点', async () => {
        const wrapper = mount(AnchorDisclosureField, { props: { field, modelValue: 'top-left', expanded: true } })
        await wrapper.findAll('.cn-anchor__cell')[8]!.trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['bottom-right'])
    })
})

describe('PairField（两列语义行 + 自适应 prefix，layer-panel-ux 工票 03）', () => {
    const sizeField: FieldDef = {
        key: ['shape'],
        label: '尺寸',
        control: 'pair',
        items: [
            { key: ['width'], label: '宽', control: 'number', integer: true, min: 0, auto: { key: ['autoWidth'], placeholder: '自动' } },
            { key: ['height'], label: '高', control: 'number', integer: true, min: 0, auto: { key: ['autoHeight'] } },
        ],
    }
    const shape = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        ...overrides,
    })

    it('渲染两列并回显各子字段值', () => {
        const wrapper = mount(PairField, { props: { field: sizeField, modelValue: shape() } })
        const inputs = wrapper.findAll('input[type="number"]')
        expect(inputs).toHaveLength(2)
        expect((inputs[0]!.element as HTMLInputElement).value).toBe('100')
        expect((inputs[1]!.element as HTMLInputElement).value).toBe('50')
    })

    it('子字段提交上抛图层根绝对键（前缀 = pair.key），input 实时 / change 收口', async () => {
        const wrapper = mount(PairField, { props: { field: sizeField, modelValue: shape() } })
        const widthInput = wrapper.find('input[aria-label="宽"]')

        ;(widthInput.element as HTMLInputElement).value = '120'
        await widthInput.trigger('input')
        let emission = wrapper.emitted('sub-commit')!.at(-1)!
        expect(emission[0]).toMatchObject({ key: ['shape', 'width'] })
        expect(emission[1]).toBe(120)
        expect(emission[2]).toBe(false) // 实时

        await widthInput.trigger('change')
        emission = wrapper.emitted('sub-commit')!.at(-1)!
        expect(emission[2]).toBe(true) // 收口
        void widthInput
    })

    it('自适应开：本列禁用——宽显「自动」占位，高显 displays 解析值', async () => {
        const wrapper = mount(PairField, {
            props: {
                field: sizeField,
                modelValue: shape({ autoWidth: true, autoHeight: true }),
                displays: { 'shape.height': { value: 137.5, preview: false } },
            },
        })
        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        const heightInput = wrapper.find('input[aria-label="高"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        expect(widthInput.placeholder).toBe('自动')
        expect(widthInput.value).toBe('')
        expect(heightInput.disabled).toBe(true)
        expect(heightInput.value).toBe('137.5')

        // 禁用列不产生提交
        await wrapper.find('input[aria-label="宽"]').trigger('input')
        expect(wrapper.emitted('sub-commit')).toBeUndefined()
    })

    it('模板子树预览值：preview 标记驱动 cn-field--preview 区分展示 + 悬停说明', () => {
        const wrapper = mount(PairField, {
            props: {
                field: sizeField,
                modelValue: shape({ autoHeight: true }),
                displays: { 'shape.height': { value: 66, preview: true } },
            },
        })
        const heightInput = wrapper.find('input[aria-label="高"]')
        expect(heightInput.classes()).toContain('cn-field--preview')
        expect(heightInput.attributes('title')).toContain('预览盒')
    })

    it('prefix 钮点击上抛自适应布尔的绝对键（一次切换 = 一步历史语义的 final 提交）', async () => {
        const wrapper = mount(PairField, { props: { field: sizeField, modelValue: shape() } })
        const toggles = wrapper.findAll('.cn-props__auto-toggle')
        expect(toggles).toHaveLength(2)
        expect(toggles[0]!.attributes('aria-pressed')).toBe('false')

        await toggles[0]!.trigger('click')
        const [emittedField, value, final] = wrapper.emitted('sub-commit')!.at(-1)!
        expect(emittedField).toMatchObject({ key: ['shape', 'autoWidth'], control: 'boolean' })
        expect(value).toBe(true)
        expect(final).toBe(true)
    })
})

describe('PaddingField', () => {
    const field: FieldDef = { key: ['shape', 'padding'], label: '内边距', control: 'padding' }

    it('渲染四键并回显各边值', () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: padding(8) } })
        const inputs = wrapper.findAll('input[type="number"]')
        expect(inputs).toHaveLength(4)
        expect(inputs.every((i) => (i.element as HTMLInputElement).value === '8')).toBe(true)
    })

    it('改一边发出整个 Padding 对象（input 实时 / change 收口）', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: padding(8) } })
        const inputs = wrapper.findAll('input[type="number"]')

        // 直设 DOM 值再发 input（逐键实时语义）；change 收口后按真实接线回填 props
        // （面板提交后 modelValue 跟随，后续 patch 基于最新值组装）
        const topInput = inputs[0]!.element as HTMLInputElement
        topInput.value = '12'
        await inputs[0]!.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([{ top: 12, bottom: 8, left: 8, right: 8 }])

        topInput.value = '12'
        await inputs[0]!.trigger('change')
        const settled = wrapper.emitted('change')!.at(-1)![0] as Padding
        expect(settled).toEqual({ top: 12, bottom: 8, left: 8, right: 8 })
        await wrapper.setProps({ modelValue: settled })

        const leftInput = inputs[2]!.element as HTMLInputElement
        leftInput.value = '20'
        await inputs[2]!.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([{ top: 12, bottom: 8, left: 20, right: 8 }])
    })
})

describe('BorderField', () => {
    const field: FieldDef = { key: ['shape', 'border'], label: '边框', control: 'border' }
    const bordered = (): Border => ({
        top: { width: 2, color: '#334155' },
        bottom: null,
        left: null,
        right: null,
    })

    it('四边各渲染启用/宽/色；null 边禁用输入', () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: bordered() } })
        expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(4)
        const numbers = wrapper.findAll('input[type="number"]')
        expect((numbers[0]!.element as HTMLInputElement).value).toBe('2')
        expect((numbers[1]!.element as HTMLInputElement).disabled).toBe(true) // bottom null
    })

    it('启用边发出完整 Border（width1 黑默认）；禁用置 null', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: noBorder() } })
        const toggles = wrapper.findAll('input[type="checkbox"]')

        await toggles[0]!.setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([
            { top: { width: 1, color: '#000000' }, bottom: null, left: null, right: null },
        ])

        await wrapper.setProps({ modelValue: bordered() })
        await toggles[0]!.setValue(false)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([noBorder()])
    })

    it('宽度实时提交整个对象；宽度 0 视为关闭该边', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: bordered() } })
        const numbers = wrapper.findAll('input[type="number"]')

        await numbers[0]!.setValue('5')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([
            { top: { width: 5, color: '#334155' }, bottom: null, left: null, right: null },
        ])

        await numbers[0]!.setValue('0')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([noBorder()])
    })
})
