// @vitest-environment jsdom
/**
 * 控件挂载测试（工单 09）：每种控件一枚——挂载渲染、实时/收口事件语义、
 * 取值钳位与结构化对象的组装。控件提交语义 = input 实时（面板合步）+
 * change 收口（一步历史定格）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import {
    HORIZONTAL_ALIGNS,
    VERTICAL_ALIGNS,
    type Border,
    type Padding,
} from '@hankchen/canvas-editor'

import AlignField from '../../src/property-panel/fields/AlignField.vue'
import AnchorDisclosureField from '../../src/property-panel/fields/AnchorDisclosureField.vue'
import BooleanField from '../../src/property-panel/fields/BooleanField.vue'
import BorderField from '../../src/property-panel/fields/BorderField.vue'
import BorderWidthInput from '../../src/property-panel/fields/BorderWidthInput.vue'
import ColorField from '../../src/property-panel/fields/ColorField.vue'
import NumberField from '../../src/property-panel/fields/NumberField.vue'
import PaddingField from '../../src/property-panel/fields/PaddingField.vue'
import PairField from '../../src/property-panel/fields/PairField.vue'
import SelectField from '../../src/property-panel/fields/SelectField.vue'
import TextField from '../../src/property-panel/fields/TextField.vue'
import TextareaField from '../../src/property-panel/fields/TextareaField.vue'
import ValueTypeSegmented from '../../src/property-panel/fields/ValueTypeSegmented.vue'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const numField: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
const noBorder = (): Border => ({ top: null, bottom: null, left: null, right: null })
/** 数值输入框计数（简写控件的模式框数 = 1/2/4） */
const inputCount = (wrapper: { findAll(selector: string): readonly unknown[] }): number =>
    wrapper.findAll('input[type="number"]').length

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

describe('AlignField（对齐分段图标按钮组，layer-panel-ux 工单 05）', () => {
    const hField: FieldDef = {
        key: ['align', 'horizontal'],
        label: '水平',
        control: 'align',
        domain: HORIZONTAL_ALIGNS,
    }
    const vField: FieldDef = {
        key: ['align', 'vertical'],
        label: '垂直',
        control: 'align',
        domain: VERTICAL_ALIGNS,
    }

    it('按 domain 渲染分段（水平 3 枚），每枚是带图标的按钮，无 select 下拉', () => {
        const wrapper = mount(AlignField, { props: { field: hField, modelValue: 'left' } })
        const segments = wrapper.findAll('.cn-align__option')
        expect(segments).toHaveLength(3)
        expect(segments.every((s) => s.find('svg').exists())).toBe(true)
        expect(wrapper.find('select').exists()).toBe(false)
    })

    it('选中态 accent 高亮：aria-pressed 与激活类只落在当前值分段上', () => {
        const wrapper = mount(AlignField, { props: { field: hField, modelValue: 'center' } })
        const segments = wrapper.findAll('.cn-align__option')
        expect(segments[0]!.attributes('aria-pressed')).toBe('false')
        expect(segments[1]!.attributes('aria-pressed')).toBe('true')
        expect(segments[1]!.classes()).toContain('cn-align__option--active')
        expect(segments[0]!.classes()).not.toContain('cn-align__option--active')
        expect(segments[2]!.classes()).not.toContain('cn-align__option--active')
    })

    it('一次点击精准切换：change 发出所选枚举值；点击已选中分段不重复提交', async () => {
        const wrapper = mount(AlignField, { props: { field: hField, modelValue: 'left' } })
        const segments = wrapper.findAll('.cn-align__option')

        await segments[2]!.trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['right'])

        // 面板回声：提交落文档后 modelValue 跟进（隔离挂载需手动模拟）
        await wrapper.setProps({ modelValue: 'right' })
        await segments[2]!.trigger('click') // 已是当前值：不产生冗余提交（不进历史）
        expect(wrapper.emitted('change')).toHaveLength(1)
    })

    it('悬停文案按轴区分：水平左/中/右、垂直上/中/下', () => {
        const h = mount(AlignField, { props: { field: hField, modelValue: 'left' } })
        const hTitles = h.findAll('.cn-align__option').map((s) => s.attributes('title'))
        expect(hTitles).toEqual(['水平：左对齐', '水平：居中对齐', '水平：右对齐'])

        const v = mount(AlignField, { props: { field: vField, modelValue: 'top' } })
        const vTitles = v.findAll('.cn-align__option').map((s) => s.attributes('title'))
        expect(vTitles).toEqual(['垂直：顶对齐', '垂直：居中对齐', '垂直：底对齐'])
    })

    it('垂直轴渲染 top/center/bottom 三分段且选中态跟随', () => {
        const wrapper = mount(AlignField, { props: { field: vField, modelValue: 'bottom' } })
        const segments = wrapper.findAll('.cn-align__option')
        expect(segments).toHaveLength(3)
        expect(segments[2]!.attributes('aria-pressed')).toBe('true')
        expect(segments[2]!.classes()).toContain('cn-align__option--active')
    })

    it('未知取值域退化为文字分段（注册表宽容口的控件侧对位）', async () => {
        const field: FieldDef = { key: ['align', 'horizontal'], label: '水平', control: 'align', domain: ['start', 'end'] }
        const wrapper = mount(AlignField, { props: { field, modelValue: 'start' } })
        const segments = wrapper.findAll('.cn-align__option')
        expect(segments).toHaveLength(2)
        expect(segments.every((s) => !s.find('svg').exists())).toBe(true)
        expect(segments[0]!.text()).toBe('start')

        await segments[1]!.trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['end'])
    })
})

describe('ValueTypeSegmented（valueType 分段选择器：静态 | 表达式，layer-panel-ux 工单 06）', () => {
    it('渲染两段（静态 | 表达式），当前段 accent 高亮 + aria-pressed，容器带组语义', () => {
        const wrapper = mount(ValueTypeSegmented, { props: { mode: 'static' } })
        expect(wrapper.find('[role="group"][aria-label="取值方式"]').exists()).toBe(true)
        const segments = wrapper.findAll('.cn-valuetype__option')
        expect(segments).toHaveLength(2)
        expect(segments[0]!.text()).toBe('静态')
        expect(segments[1]!.text()).toBe('表达式')
        expect(segments[0]!.classes()).toContain('cn-valuetype__option--active')
        expect(segments[0]!.attributes('aria-pressed')).toBe('true')
        expect(segments[1]!.attributes('aria-pressed')).toBe('false')
        expect(segments[1]!.classes()).not.toContain('cn-valuetype__option--active')
    })

    it('表达式态：高亮与 aria-pressed 迁移到表达式段', () => {
        const wrapper = mount(ValueTypeSegmented, { props: { mode: 'expression' } })
        const segments = wrapper.findAll('.cn-valuetype__option')
        expect(segments[1]!.classes()).toContain('cn-valuetype__option--active')
        expect(segments[1]!.attributes('aria-pressed')).toBe('true')
        expect(segments[0]!.attributes('aria-pressed')).toBe('false')
    })

    it('点击另一段发出 change（目标态）；点击当前段零事件（无冗余提交，不进历史）', async () => {
        const wrapper = mount(ValueTypeSegmented, { props: { mode: 'static' } })
        const segments = wrapper.findAll('.cn-valuetype__option')

        await segments[1]!.trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['expression'])

        // 面板回声：提交落文档后 mode 跟进（隔离挂载需手动模拟）
        await wrapper.setProps({ mode: 'expression' })
        await segments[1]!.trigger('click') // 已是当前态：不产生冗余提交
        expect(wrapper.emitted('change')).toHaveLength(1)
    })

    it('两段各有悬停 tooltip：静态讲字面直显；表达式含插值子集说明（{{路径}} / {{$index}} / {{$root.*}}）', () => {
        const wrapper = mount(ValueTypeSegmented, { props: { mode: 'static' } })
        const titles = wrapper.findAll('.cn-valuetype__option').map((s) => s.attributes('title'))
        expect(titles[0]).toContain('静态值')
        expect(titles[0]).toContain('字面')
        expect(titles[1]).toContain('表达式')
        expect(titles[1]).toContain('{{路径}}')
        expect(titles[1]).toContain('{{$index}}')
        expect(titles[1]).toContain('{{$root.*}}')
        // 未激活段带切换提示；激活段是当前态说明
        expect(titles[1]).toContain('点击切换')
        expect(titles[0]).not.toContain('点击切换')
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

    it('自适应开：本列禁用——displays 在场显解析值（工单 04 起宽列同语言），缺显示条目的列回落「自动」占位', async () => {
        const wrapper = mount(PairField, {
            props: {
                field: sizeField,
                modelValue: shape({ autoWidth: true, autoHeight: true }),
                displays: {
                    'shape.width': { value: 464, preview: false },
                    'shape.height': { value: 137.5, preview: false },
                },
            },
        })
        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        const heightInput = wrapper.find('input[aria-label="高"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        expect(widthInput.value).toBe('464')
        expect(heightInput.disabled).toBe(true)
        expect(heightInput.value).toBe('137.5')

        // 禁用列不产生提交
        await wrapper.find('input[aria-label="宽"]').trigger('input')
        expect(wrapper.emitted('sub-commit')).toBeUndefined()
    })

    it('盒未解析（面板缺 displays 条目）：禁用列空值回落「自动」占位', async () => {
        const wrapper = mount(PairField, {
            props: {
                field: sizeField,
                modelValue: shape({ autoWidth: true }),
            },
        })
        const widthInput = wrapper.find('input[aria-label="宽"]').element as HTMLInputElement
        expect(widthInput.disabled).toBe(true)
        expect(widthInput.value).toBe('')
        expect(widthInput.placeholder).toBe('自动')
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

describe('PaddingField（简写 1/2/4 模式循环，工单 04）', () => {
    const field: FieldDef = { key: ['shape', 'padding'], label: '内边距', control: 'padding' }
    const pad = (top: number, bottom: number, left: number, right: number): Padding => ({
        top,
        bottom,
        left,
        right,
    })

    it('初始模式由数据推导：全等→1 单框、成对→2 两框、异值→4 四框', () => {
        expect(inputCount(mount(PaddingField, { props: { field, modelValue: pad(8, 8, 8, 8) } }))).toBe(1)
        expect(inputCount(mount(PaddingField, { props: { field, modelValue: pad(8, 8, 4, 4) } }))).toBe(2)
        expect(inputCount(mount(PaddingField, { props: { field, modelValue: pad(8, 3, 5, 7) } }))).toBe(4)
    })

    it('模式 1 编辑一框发出全等对象（input 实时 / change 收口）', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 8, 8, 8) } })
        const input = wrapper.find('input[type="number"]')
        ;(input.element as HTMLInputElement).value = '12'
        await input.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([pad(12, 12, 12, 12)])
        expect(wrapper.emitted('change')).toBeUndefined() // 实时事件不收口

        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([pad(12, 12, 12, 12)])
    })

    it('模式 2 编辑上下只写上下，左右保留现值', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 8, 4, 4) } })
        const inputs = wrapper.findAll('input[type="number"]')
        expect(inputs).toHaveLength(2)

        ;(inputs[0]!.element as HTMLInputElement).value = '10'
        await inputs[0]!.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([pad(10, 10, 4, 4)])

        ;(inputs[1]!.element as HTMLInputElement).value = '6'
        await inputs[1]!.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([pad(8, 8, 6, 6)])
    })

    it('循环钮展开 1→2→4：框数递增、数据不动（无提交），四框回显各边现值', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 8, 8, 8) } })
        const cycleButton = wrapper.find('.cn-props__mode-toggle')

        await cycleButton.trigger('click') // 1→2
        expect(inputCount(wrapper)).toBe(2)
        expect(wrapper.emitted('input')).toBeUndefined()
        expect(wrapper.emitted('change')).toBeUndefined()

        await cycleButton.trigger('click') // 2→4
        expect(inputCount(wrapper)).toBe(4)
        expect(wrapper.emitted('change')).toBeUndefined()
        const values = wrapper.findAll('input[type="number"]').map((i) => (i.element as HTMLInputElement).value)
        expect(values).toEqual(['8', '8', '8', '8'])
    })

    it('循环收缩 4→1：立即提交规整（全取上），框合为单框回显', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 3, 5, 7) } })
        expect(inputCount(wrapper)).toBe(4)

        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 4→1
        expect(wrapper.emitted('change')!.at(-1)).toEqual([pad(8, 8, 8, 8)])
        await wrapper.setProps({ modelValue: pad(8, 8, 8, 8) })
        expect(inputCount(wrapper)).toBe(1)
        expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('8')
    })

    it('数据变更即重推导模式（循环覆盖失效，不保留上次 UI 态）', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 8, 8, 8) } })
        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 1→2（纯 UI，数据不动）
        expect(inputCount(wrapper)).toBe(2)

        await wrapper.setProps({ modelValue: pad(1, 2, 3, 4) }) // 外部变更（撤销/拖动）
        expect(inputCount(wrapper)).toBe(4)
    })

    it('modelValue 引用一变覆盖即失效：同推导值的另一图层也不保留上次 UI 态', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: pad(8, 8, 4, 4) } })
        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 2→4（纯 UI）
        expect(inputCount(wrapper)).toBe(4)

        // 切到另一图层：同为成对数据（推导仍 2），覆盖不得跨数据残留
        await wrapper.setProps({ modelValue: pad(6, 6, 2, 2) })
        expect(inputCount(wrapper)).toBe(2)
    })
})

describe('BorderField（简写 1/2/4 模式 + null 语义，工单 04）', () => {
    const field: FieldDef = { key: ['shape', 'border'], label: '边框', control: 'border' }
    const side = (width: number, color: string) => ({ width, color })
    const borderAll = (s: { width: number; color: string }): Border => ({
        top: { ...s },
        bottom: { ...s },
        left: { ...s },
        right: { ...s },
    })
    const bordered = (): Border => ({ top: side(2, '#334155'), bottom: null, left: null, right: null })
    const lopsided = (): Border => ({
        top: null,
        bottom: side(2, '#000000'),
        left: side(6, '#0ea5e9'),
        right: null,
    })

    it('初始模式：全 null→单框空显示、全等→单框显宽、成对→两框、异值→四框', () => {
        const none = mount(BorderField, { props: { field, modelValue: noBorder() } })
        expect(inputCount(none)).toBe(1)
        expect((none.find('input[type="number"]').element as HTMLInputElement).value).toBe('')
        expect((none.find('input[type="color"]').element as HTMLInputElement).disabled).toBe(true) // 无边框色票禁用

        const uniform = mount(BorderField, { props: { field, modelValue: borderAll(side(2, '#334155')) } })
        expect(inputCount(uniform)).toBe(1)
        expect((uniform.find('input[type="number"]').element as HTMLInputElement).value).toBe('2')

        const paired = mount(BorderField, {
            props: { field, modelValue: { top: side(2, '#a'), bottom: side(2, '#a'), left: null, right: null } },
        })
        expect(inputCount(paired)).toBe(2)

        expect(inputCount(mount(BorderField, { props: { field, modelValue: bordered() } }))).toBe(4)
    })

    it('模式 1 空框输入正宽度 = 四边开启（默认黑），input 实时 / change 收口', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: noBorder() } })
        const width = wrapper.find('input[type="number"]')

        ;(width.element as HTMLInputElement).value = '3'
        await width.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([borderAll({ width: 3, color: '#000000' })])

        await width.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([borderAll({ width: 3, color: '#000000' })])
    })

    it('模式 1 宽度归 0 = 全部关闭（实时提交全 null）', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: borderAll(side(2, '#334155')) } })
        const width = wrapper.find('input[type="number"]')
        ;(width.element as HTMLInputElement).value = '0'
        await width.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([noBorder()])
    })

    it('颜色编辑保留宽度（仅启用框可改）', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: borderAll(side(2, '#334155')) } })
        const color = wrapper.find('input[type="color"]')
        ;(color.element as HTMLInputElement).value = '#abcdef'
        await color.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([borderAll(side(2, '#abcdef'))])
    })

    it('循环收缩 4→1 且上为 null → 提交全 null（无边框），单框空显示', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: lopsided() } })
        expect(inputCount(wrapper)).toBe(4)

        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 4→1
        expect(wrapper.emitted('change')!.at(-1)).toEqual([noBorder()])
        await wrapper.setProps({ modelValue: noBorder() })
        expect(inputCount(wrapper)).toBe(1)
        expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('')
    })

    it('循环收缩 4→1：四边全取上（宽+色）', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: bordered() } }) // 仅上边 {2,#334155}
        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 4→1
        expect(wrapper.emitted('change')!.at(-1)).toEqual([borderAll(side(2, '#334155'))])
    })

    it('循环展开 1→2→4：框数递增、无提交（数据不动）', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: noBorder() } })
        const cycleButton = wrapper.find('.cn-props__mode-toggle')

        await cycleButton.trigger('click') // 1→2
        expect(inputCount(wrapper)).toBe(2)
        expect(wrapper.emitted('input')).toBeUndefined()
        expect(wrapper.emitted('change')).toBeUndefined()

        await cycleButton.trigger('click') // 2→4
        expect(inputCount(wrapper)).toBe(4)
        expect(wrapper.emitted('change')).toBeUndefined()
        // null 框空显示、值框回显现值
        const values = wrapper.findAll('input[type="number"]').map((i) => (i.element as HTMLInputElement).value)
        expect(values).toEqual(['', '', '', ''])
    })

    it('modelValue 引用一变覆盖即失效：同推导值的另一图层也不保留上次 UI 态', async () => {
        const paired = (): Border => ({ top: side(2, '#a'), bottom: side(2, '#a'), left: null, right: null })
        const wrapper = mount(BorderField, { props: { field, modelValue: paired() } })
        await wrapper.find('.cn-props__mode-toggle').trigger('click') // 2→4（纯 UI）
        expect(inputCount(wrapper)).toBe(4)

        // 切到另一图层：同为上下边框（推导仍 2），覆盖不得跨数据残留
        await wrapper.setProps({ modelValue: { top: side(3, '#b'), bottom: side(3, '#b'), left: null, right: null } })
        expect(inputCount(wrapper)).toBe(2)
    })
})

describe('BorderWidthInput（null 空显示的宽度输入，工单 04）', () => {
    it('null 显示空串；input 实时发出钳位值（负值→0）', async () => {
        const wrapper = mount(BorderWidthInput, { props: { value: null, label: '上下' } })
        const input = wrapper.find('input')
        expect((input.element as HTMLInputElement).value).toBe('')

        input.element.value = '-4'
        await input.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([0])
    })

    it('change/blur 收口：成形值回显草稿、0 归空显示、非法回显文档值', async () => {
        const wrapper = mount(BorderWidthInput, { props: { value: 2, label: '上' } })
        const input = wrapper.find('input')

        input.element.value = '5'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([5])
        expect((input.element as HTMLInputElement).value).toBe('5')

        input.element.value = '0'
        await input.trigger('blur')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([0])
        expect((input.element as HTMLInputElement).value).toBe('') // 0 = 关 → 空显示

        await wrapper.setProps({ value: null }) // 面板回声：该边已关
        input.element.value = 'abc'
        await input.trigger('blur')
        expect((input.element as HTMLInputElement).value).toBe('') // 回显文档值（null）
    })

    it('未聚焦时的外部变更回同步草稿（null → 空）', async () => {
        const wrapper = mount(BorderWidthInput, { props: { value: 2, label: '上' } })
        await wrapper.setProps({ value: null })
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    })
})
