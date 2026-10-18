// @vitest-environment jsdom
/**
 * ImageSrcField（imageSrc 控件）：图片资源地址的上传形态——缩略图常显当前 src
 * （点击替换）、上传经注入缝走内核 uploadImage 动作（change 收口提交引用）、
 * 紧凑路径行复用 TextField 语义（外链/相对路径手写通道）、清除 = 提交空串。
 * 降级语义与 FontField 同门：未注入上传缝或 canUpload=false → 纯路径输入。
 * 表达式态（resource-expression-single-ref 工单 05）：资源表达式必须恰为单个
 * 裸路径片段——退化 TextField 换装级联路径选择器（resourceValue 控件同款拆装
 * 壳：{{path}} ⇄ 裸路径，菜单点选整值替换，不设手输缝）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import { parseExpressionSchema, type ExpressionSchemaNode, type UploadFile } from '@hankchen/canvas-editor'

import ImageSrcField from '../../src/property-panel/fields/ImageSrcField.vue'
import { IMAGE_UPLOAD_KEY, type ImageUploadContext } from '../../src/property-panel/imageUpload'
import type { FieldDef } from '../../src/property-panel/fieldSchema'
import { expressionCompletionSource } from '../../src/shared/expressionContext'

const field: FieldDef = { key: ['src'], label: '资源地址', control: 'imageSrc', data: true, resource: true }

const RAW_SCHEMA = {
    type: 'object',
    properties: {
        cover: { type: 'string', description: '封面图' },
    },
}

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const source = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'root', rowSchema: null })

const domFile = (name = 'a.png', mime = 'image/png'): File =>
    new File([new Uint8Array([1, 2, 3])], name, { type: mime })

function uploadContext(overrides: Partial<ImageUploadContext> = {}): ImageUploadContext {
    return {
        canUpload: true,
        uploadImage: async () => 'data:image/png;base64,AAA',
        ...overrides,
    }
}

const wrappers: VueWrapper[] = []

const mountedWith = (context: ImageUploadContext | null, modelValue: string | null = null, extraProps: Record<string, unknown> = {}) => {
    const wrapper = mount(ImageSrcField, {
        props: { field, modelValue, source, ...extraProps },
        attachTo: document.body,
        global: context ? { provide: { [IMAGE_UPLOAD_KEY as symbol]: context } } : {},
    })
    wrappers.push(wrapper)
    return wrapper
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('ImageSrcField：降级形态（未注入/不可上传 = 纯路径输入）', () => {
    it('未注入上传缝：渲染文本框（手写通道），无缩略图与 file input', async () => {
        const wrapper = mountedWith(null, '/a.png')
        const input = wrapper.find('input[type="text"]')
        expect(input.exists()).toBe(true)
        expect((input.element as HTMLInputElement).value).toBe('/a.png')
        expect(wrapper.find('.cn-imagesrc__thumb').exists()).toBe(false)
        expect(wrapper.find('input[type="file"]').exists()).toBe(false)
        // 路径行语义与 TextField 同门：change 收口
        ;(input.element as HTMLInputElement).value = '/b.png'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['/b.png'])
    })

    it('canUpload=false（宿主未注入 uploadHandler）：同款退化', () => {
        const wrapper = mountedWith(uploadContext({ canUpload: false }), '/a.png')
        expect(wrapper.find('input[type="text"]').exists()).toBe(true)
        expect(wrapper.find('.cn-imagesrc__thumb').exists()).toBe(false)
        expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    })
})

describe('ImageSrcField：表达式态 = 级联路径选择器（工单 05 换装）', () => {
    it('表达式态：即使可上传也不渲染上传通道（写引用会字面接管清标记）', () => {
        const wrapper = mountedWith(uploadContext(), '{{cover}}', { dataMode: 'expression' })
        expect(wrapper.find('.cn-imagesrc__thumb').exists()).toBe(false)
        expect(wrapper.find('input[type="file"]').exists()).toBe(false)
        expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    })

    it('拆装回显与菜单点选：{{cover}} ⇄ cover，点选提交包壳模板（不设手输缝）', async () => {
        const wrapper = mountedWith(uploadContext(), '{{cover}}', { dataMode: 'expression' })
        // 拆壳回显裸路径
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('cover')
        // 菜单点选（真实候选源）：头部候选 cover 叶子 → 提交包壳模板
        await wrapper.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        const leaf = document.body.querySelector<HTMLElement>('.cn-pathpicker__option')!
        await leaf.click()
        await nextTick()
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['{{cover}}'])
    })

    it('存量违例拆不动：原文只读回显（诊断红边归 PropertyField resource 门）', () => {
        const wrapper = mountedWith(uploadContext(), '{{a}}{{b}}', { dataMode: 'expression' })
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('{{a}}{{b}}')
    })

    it('无 source（未绑声明）：选择器只读不渲染菜单钮', () => {
        const wrapper = mount(ImageSrcField, {
            props: { field, modelValue: '{{cover}}', source: null, dataMode: 'expression' },
            attachTo: document.body,
            global: { provide: { [IMAGE_UPLOAD_KEY as symbol]: uploadContext() } },
        })
        wrappers.push(wrapper)
        expect(wrapper.find('.cn-pathpicker__value').exists()).toBe(true)
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })
})

describe('ImageSrcField：上传通道（canUpload 形态）', () => {
    const pickFile = async (wrapper: ReturnType<typeof mountedWith>, file: File): Promise<void> => {
        const input = wrapper.find('input[type="file"]')
        Object.defineProperty(input.element, 'files', { value: [file] })
        await input.trigger('change')
        await flushPromises()
    }

    it('canUpload=true：渲染上传入口（缩略图占位框，空值无 img）与隐藏 file input（accept=image/*）', () => {
        const wrapper = mountedWith(uploadContext(), null)
        expect(wrapper.find('.cn-imagesrc__thumb').exists()).toBe(true)
        expect(wrapper.find('.cn-imagesrc__thumb img').exists()).toBe(false)
        const fileInput = wrapper.find('input[type="file"]')
        expect(fileInput.exists()).toBe(true)
        expect(fileInput.attributes('accept')).toBe('image/*')
    })

    it('选文件 → uploadImage 收到 DOM 无关 UploadFile → change 收口发出引用', async () => {
        const uploaded: Array<{ name: string; mime: string }> = []
        const wrapper = mountedWith(
            uploadContext({
                uploadImage: async (file: UploadFile) => {
                    uploaded.push({ name: file.name, mime: file.mime })
                    return 'https://cdn.example.com/b.png'
                },
            }),
        )
        await pickFile(wrapper, domFile('poster.png'))
        expect(uploaded).toEqual([{ name: 'poster.png', mime: 'image/png' }])
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['https://cdn.example.com/b.png'])
    })

    it('上传失败不上报 change，错误挂入口提示（data-upload-error）', async () => {
        const wrapper = mountedWith(
            uploadContext({
                uploadImage: async () => {
                    throw new Error('存储不可用')
                },
            }),
        )
        await pickFile(wrapper, domFile())
        expect(wrapper.emitted('change')).toBeUndefined()
        expect(wrapper.find('.cn-imagesrc__thumb').attributes('data-upload-error')).toBe('存储不可用')
    })

    it('uploadImage 返回 null（文档未打开防御语义）不上报 change', async () => {
        const wrapper = mountedWith(uploadContext({ uploadImage: async () => null }))
        await pickFile(wrapper, domFile())
        expect(wrapper.emitted('change')).toBeUndefined()
    })
})

describe('ImageSrcField：缩略图回显与替换/清除', () => {
    it('有值：img 常显当前 src（打开旧 graph 也回显），占位文案退场，清除钮在场', () => {
        const wrapper = mountedWith(uploadContext(), '/demo-cover.svg')
        const img = wrapper.find('.cn-imagesrc__thumb img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('/demo-cover.svg')
        expect(wrapper.find('.cn-imagesrc__clear').exists()).toBe(true)
    })

    it('点缩略图 = 替换：触发 file input（重新上传通道）', async () => {
        const wrapper = mountedWith(uploadContext(), '/a.png')
        const spy = vi.spyOn(wrapper.find('input[type="file"]').element as HTMLInputElement, 'click')
        await wrapper.find('.cn-imagesrc__thumb').trigger('click')
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('清除 = 提交空串（内核 updateData 把空串落为 null），一步收口语义', async () => {
        const wrapper = mountedWith(uploadContext(), '/a.png')
        await wrapper.find('.cn-imagesrc__clear').trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([''])
    })

    it('路径行与缩略图并存：手写外链/相对路径通道保留（change 收口）', async () => {
        const wrapper = mountedWith(uploadContext(), '/demo-cover.svg')
        const input = wrapper.find('input[type="text"]')
        ;(input.element as HTMLInputElement).value = 'https://example.com/x.png'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['https://example.com/x.png'])
    })
})

describe('ImageSrcField：物化状态角标（与画布失败标识同源）', () => {
    it('pending → 装载中角标；failed → 失败角标', () => {
        const pending = mountedWith(uploadContext(), '/a.png', { resourceStatus: 'pending' })
        expect(pending.find('.cn-imagesrc__status').text()).toContain('装载中')
        pending.unmount()

        const failed = mountedWith(uploadContext(), '/a.png', { resourceStatus: 'failed' })
        expect(failed.find('.cn-imagesrc__status').text()).toContain('失败')
        failed.unmount()
    })

    it('done/无记录（宿主未桥接）不渲染角标（不可知不假报）', () => {
        const done = mountedWith(uploadContext(), '/a.png', { resourceStatus: 'done' })
        expect(done.find('.cn-imagesrc__status').exists()).toBe(false)
        done.unmount()

        const bare = mountedWith(uploadContext(), '/a.png')
        expect(bare.find('.cn-imagesrc__status').exists()).toBe(false)
    })
})

describe('ImageSrcField：源图内在尺寸读数（image-fit 工单 05 搭车项）', () => {
    const loadThumb = async (
        wrapper: ReturnType<typeof mountedWith>,
        width: number,
        height: number,
    ): Promise<void> => {
        const img = wrapper.find('.cn-imagesrc__thumb img')
        // configurable：同一 img 元素复用（src 换图不换节点），读数需可重复打桩
        Object.defineProperty(img.element, 'naturalWidth', { value: width, configurable: true })
        Object.defineProperty(img.element, 'naturalHeight', { value: height, configurable: true })
        await img.trigger('load')
        await nextTick()
    }

    it('装载完成后显示像素与宽高比；装载前无读数行', async () => {
        const wrapper = mountedWith(uploadContext(), '/hd.png')
        expect(wrapper.find('.cn-imagesrc__intrinsic').exists()).toBe(false)
        await loadThumb(wrapper, 1920, 1080)
        expect(wrapper.find('.cn-imagesrc__intrinsic').text()).toBe('源图 1920×1080 · 16:9')
    })

    it('src 变更即撤读数（旧图读数不残留），重装载后按新图更新', async () => {
        const wrapper = mountedWith(uploadContext(), '/a.png')
        await loadThumb(wrapper, 800, 600)
        expect(wrapper.find('.cn-imagesrc__intrinsic').exists()).toBe(true)

        await wrapper.setProps({ modelValue: '/b.png' })
        expect(wrapper.find('.cn-imagesrc__intrinsic').exists()).toBe(false)

        await loadThumb(wrapper, 640, 361)
        expect(wrapper.find('.cn-imagesrc__intrinsic').text()).toContain('1.77:1')
    })

    it('装载失败（@error）不显示读数', async () => {
        const wrapper = mountedWith(uploadContext(), '/broken.png')
        await wrapper.find('.cn-imagesrc__thumb img').trigger('error')
        expect(wrapper.find('.cn-imagesrc__intrinsic').exists()).toBe(false)
    })

    it('降级/表达式形态无缩略图即无读数行（读数随装载通道在场）', () => {
        const degraded = mountedWith(null, '/a.png')
        expect(degraded.find('.cn-imagesrc__intrinsic').exists()).toBe(false)
        degraded.unmount()

        const expression = mountedWith(uploadContext(), '{{cover}}', { dataMode: 'expression' })
        expect(expression.find('.cn-imagesrc__intrinsic').exists()).toBe(false)
    })
})
