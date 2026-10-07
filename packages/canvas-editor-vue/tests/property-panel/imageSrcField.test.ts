// @vitest-environment jsdom
/**
 * ImageSrcField（imageSrc 控件）：图片资源地址的上传形态——缩略图常显当前 src
 * （点击替换）、上传经注入缝走内核 uploadImage 动作（change 收口提交引用）、
 * 紧凑路径行复用 TextField 语义（外链/相对路径手写通道）、清除 = 提交空串。
 * 降级语义与 FontField 同门：未注入上传缝或 canUpload=false 或表达式态 →
 * 纯路径输入（上传写字面会清表达式标记，表达式态不提供上传通道）。
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import type { UploadFile } from '@hankchen/canvas-editor'

import ImageSrcField from '../../src/property-panel/fields/ImageSrcField.vue'
import { IMAGE_UPLOAD_KEY, type ImageUploadContext } from '../../src/property-panel/imageUpload'
import type { FieldDef } from '../../src/property-panel/fieldSchema'

const field: FieldDef = { key: ['src'], label: '资源地址', control: 'imageSrc', data: true }

const domFile = (name = 'a.png', mime = 'image/png'): File =>
    new File([new Uint8Array([1, 2, 3])], name, { type: mime })

function uploadContext(overrides: Partial<ImageUploadContext> = {}): ImageUploadContext {
    return {
        canUpload: true,
        uploadImage: async () => 'data:image/png;base64,AAA',
        ...overrides,
    }
}

const mountedWith = (context: ImageUploadContext | null, modelValue: string | null = null, extraProps: Record<string, unknown> = {}) =>
    mount(ImageSrcField, {
        props: { field, modelValue, ...extraProps },
        global: context ? { provide: { [IMAGE_UPLOAD_KEY as symbol]: context } } : {},
    })

describe('ImageSrcField：降级形态（未注入/不可上传/表达式态 = 纯路径输入）', () => {
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

    it('表达式态：即使可上传也不渲染上传通道（写引用会字面接管清标记）', () => {
        const wrapper = mountedWith(uploadContext(), '{{row.fileUrl}}', { dataMode: 'expression' })
        expect(wrapper.find('input[type="text"]').exists()).toBe(true)
        expect(wrapper.find('.cn-imagesrc__thumb').exists()).toBe(false)
        expect(wrapper.find('input[type="file"]').exists()).toBe(false)
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
