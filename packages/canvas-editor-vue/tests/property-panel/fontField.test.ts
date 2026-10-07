// @vitest-environment jsdom
/**
 * FontField（工单 13）：字体清单选择控件——清单经 provide 注入（宿主接线内核
 * FontCatalog），未注入时退化为文本输入（降级语义：宿主没接清单也能手输引用）；
 * canUpload 时提供「上传字体」入口，上传完成以 change 收口提交引用；上传失败
 * 不上报 change、错误挂按钮提示。
 */
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

import type { FontCatalogEntry } from '@hankchen/canvas-editor'

import FontField from '../../src/property-panel/fields/FontField.vue'
import { FONT_PICKER_KEY, type FontPickerContext } from '../../src/property-panel/fontPicker'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const field: FieldDef = { key: ['font'], label: '字体', control: 'font' }

const entries = (extra: FontCatalogEntry[] = []): FontCatalogEntry[] => [
    { label: 'Open Sans', ref: '/fonts/open-sans.ttf' },
    ...extra,
]

function pickerContext(overrides: Partial<FontPickerContext> = {}): FontPickerContext {
    return {
        entries: ref(entries()),
        canUpload: false,
        uploadFont: async () => '',
        ...overrides,
    }
}

const mountedWith = (context: FontPickerContext | null, modelValue = '') =>
    mount(FontField, {
        props: { field, modelValue },
        global: context ? { provide: { [FONT_PICKER_KEY as symbol]: context } } : {},
    })

describe('FontField：无注入时退化为文本输入（降级语义）', () => {
    it('渲染文本框并可编辑原始引用，不渲染清单下拉与上传按钮', async () => {
        const wrapper = mountedWith(null, '/a/font.ttf')
        const input = wrapper.find('input[type="text"]')
        expect(input.exists()).toBe(true)
        expect(wrapper.find('select').exists()).toBe(false)
        ;(input.element as HTMLInputElement).value = '/b/font.ttf'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['/b/font.ttf'])
    })
})

describe('FontField：清单注入后的选择语义', () => {
    it('下拉 = 内置默认 + 清单条目；当前值不在清单时原样附加（不静默改写）', () => {
        const wrapper = mountedWith(pickerContext(), '/somewhere/other.ttf')
        const options = wrapper.findAll('option')
        expect(options.map((o) => (o.element as HTMLOptionElement).value)).toEqual([
            '',
            '/fonts/open-sans.ttf',
            '/somewhere/other.ttf',
        ])
        expect(options[0]!.text()).toContain('内置默认')
        expect(options[2]!.text()).toContain('other.ttf')
    })

    it('切换清单项以 change 收口发出引用', async () => {
        const wrapper = mountedWith(pickerContext())
        await wrapper.find('select').setValue('/fonts/open-sans.ttf')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['/fonts/open-sans.ttf'])
    })

    it('清单更新（自定义上传追加）联动下拉选项', async () => {
        const entriesRef = ref(entries())
        const wrapper = mountedWith(pickerContext({ entries: entriesRef }))
        expect(wrapper.findAll('option')).toHaveLength(2)
        entriesRef.value = [...entriesRef.value, { label: 'Brand', ref: 'data:font/ttf;base64,AA' }]
        await nextTick()
        const values = wrapper.findAll('option').map((o) => (o.element as HTMLOptionElement).value)
        expect(values).toContain('data:font/ttf;base64,AA')
    })
})

describe('FontField：上传自定义字体（canUpload 时）', () => {
    const pickFile = async (wrapper: ReturnType<typeof mountedWith>, name: string): Promise<void> => {
        const input = wrapper.find('input[type="file"]')
        Object.defineProperty(input.element, 'files', {
            value: [new File([new Uint8Array([1, 2, 3])], name, { type: 'font/ttf' })],
        })
        await input.trigger('change')
        await flushPromises()
    }

    it('canUpload=false 不渲染上传按钮（但保留下拉）', () => {
        const wrapper = mountedWith(pickerContext())
        expect(wrapper.find('select').exists()).toBe(true)
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('选文件 → uploadFont → 以 change 收口发出新引用', async () => {
        const uploaded: Array<{ name: string; mime: string }> = []
        const wrapper = mountedWith(
            pickerContext({
                canUpload: true,
                uploadFont: async (file) => {
                    uploaded.push({ name: file.name, mime: file.mime })
                    return 'data:font/ttf;base64,AA'
                },
            }),
        )
        expect(wrapper.find('button').exists()).toBe(true)

        await pickFile(wrapper, 'brand.ttf')
        expect(uploaded).toEqual([{ name: 'brand.ttf', mime: 'font/ttf' }])
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['data:font/ttf;base64,AA'])
    })

    it('上传失败不上报 change，错误消息挂按钮提示（data-upload-error）', async () => {
        const wrapper = mountedWith(
            pickerContext({
                canUpload: true,
                uploadFont: async () => {
                    throw new Error('存储不可用')
                },
            }),
        )
        await pickFile(wrapper, 'x.ttf')
        expect(wrapper.emitted('change')).toBeUndefined()
        const button = wrapper.find('button')
        expect(button.attributes('data-upload-error')).toBe('存储不可用')
    })
})
