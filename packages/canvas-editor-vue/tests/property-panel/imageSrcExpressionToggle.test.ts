// @vitest-environment jsdom
/**
 * ImageSrcField 表达式切换旅程（ADR 0020 资源表达式单值门的面板级行为锁定）：
 *
 * 切换初值语义（死端态整改条目 4，内核 toggleDataMode）：静态 → 表达式的打标
 * 初值——合法单引用字面镜像保留（静态 ⇆ 表达式往返无损），违例字面（URL 等）
 * 落「未选择」空态，切换自身不再制造必违例初值。存量违例（历史文档已标记 /
 * 旁路写入）经内核写入口构造，红边 + 只读回显仍由资源门判出。
 *
 * 呈现面（整改条目 1/2a/3）：空串不判违例（占位文案表达未选择态）；选择器无
 * 手输缝（设计）；菜单入口以声明为门（source=null 不渲染菜单钮），绑定门弱
 * 提示说明缺席原因；错误提示按修复通道分流（有菜单指向点选、无菜单指向绑定），
 * 不走「语法错误」框架。已绑合法声明时菜单在场，点选即整值替换（红边清除）。
 * 对照面：文本层空文本切表达式不标红（片段扫描对空串零诊断）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type Layer } from '@hankchen/canvas-editor'

import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'
import { imageLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

/** 合法 draft-07 载荷（setDataSourceSchema 收原始载荷，内核一次性编译归一） */
const RAW_SCHEMA = {
    type: 'object',
    properties: {
        cover: { type: 'string', description: '封面图' },
    },
}

const LEGACY_URL = 'https://cdn.example.com/photo.jpg'

/** 空文本文本层（对照面：空值切表达式不标红） */
function emptyTextLayer(): Layer {
    return {
        type: 'TextLayer',
        name: '',
        visible: true,
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
        text: '',
        expression: null,
        font: '',
        fontSize: 16,
        fontColor: '#000000',
        angle: 0,
        autowrap: false,
    } as Layer
}

const wrappers: VueWrapper[] = []

/** 挂真实面板：图片层 src = 静态 URL（上传后的典型现态），选中第 0 层 */
function mountPanel(schema: unknown | null) {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({
        width: 800,
        height: 600,
        background: null,
        layers: [imageLayer({ src: LEGACY_URL }) as Layer],
    })
    editor.setSelection(['layers', 0])
    if (schema !== null) editor.setDataSourceSchema(schema)
    const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
    wrappers.push(wrapper)
    return { editor, wrapper }
}

/** 「资源地址」字段行（行根 .cn-prop-field，标签文本定位） */
function srcRow(wrapper: VueWrapper): DOMWrapper<Element> {
    const row = wrapper.findAll('.cn-prop-field').find((row) => row.text().includes('资源地址'))
    expect(row, '资源地址行未渲染').toBeDefined()
    return row!
}

/** 用户点「表达式」段（ValueTypeSegmented 的表达式钮） */
async function toggleExpression(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('[data-mode-expression]').trigger('click')
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('ImageSrcField 表达式切换旅程（静态 URL 起笔）', () => {
    it('静态态：路径手输通道在场，无诊断红边', () => {
        const { wrapper } = mountPanel(null)
        const row = srcRow(wrapper)
        expect(row.find('input[type="text"]').exists()).toBe(true)
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
    })

    it('静态 URL 切表达式：落「未选择」空态不镜像违例字面（内核 toggle 条目 4）', async () => {
        const { editor, wrapper } = mountPanel(RAW_SCHEMA)
        await toggleExpression(wrapper)

        // 打标初值：URL 字面不是合法单引用 → 落空态（旧值撤销一步可回）
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('')
        expect(layer.type === 'ImageLayer' && layer.src).toBe('')

        const row = srcRow(wrapper)
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
        expect(row.find('.cn-pathpicker__value').text()).toBe('未选择字段')
        // 菜单在场（声明已绑）：直接点选即可
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(true)
    })

    it('存量违例（历史文档已标记的 URL 表达式）+ 已绑声明：红边 + 只读回显 + 菜单点选即替换', async () => {
        // 违例态经内核写入口构造（旧版本/旁路写入的存量，切换动作已不再产出）
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({
            width: 800,
            height: 600,
            background: null,
            layers: [imageLayer({ src: LEGACY_URL, expression: LEGACY_URL }) as Layer],
        })
        editor.setSelection(['layers', 0])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        const row = srcRow(wrapper)
        expect(row.find('.cn-field--invalid').exists()).toBe(true)
        expect(row.find('.cn-pathpicker__value').text()).toBe(LEGACY_URL)
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(true)
        // 有菜单：错误提示指向菜单点选（不走「语法错误」框架）
        expect(row.find('.cn-prop-field__hint--error').text()).toBe('资源内容需为单个字段引用，点击右侧按钮选择数据字段')

        await row.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        const leaf = Array.from(document.body.querySelectorAll<HTMLElement>('.cn-pathpicker__option')).find(
            (el) => el.getAttribute('aria-label') === 'cover',
        )
        expect(leaf, '候选菜单缺 cover 叶子').toBeDefined()
        leaf!.click()
        await nextTick()
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe('{{cover}}')
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('{{cover}}')
        expect(srcRow(wrapper).find('.cn-field--invalid').exists()).toBe(false)
        expect(srcRow(wrapper).find('.cn-prop-field__hint--error').exists()).toBe(false)
    })

    it('存量违例 + 未绑声明：红边 + 只读回显 + 无菜单钮 + 绑定指引（死端态）', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({
            width: 800,
            height: 600,
            background: null,
            layers: [imageLayer({ src: LEGACY_URL, expression: LEGACY_URL }) as Layer],
        })
        editor.setSelection(['layers', 0])
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        const row = srcRow(wrapper)
        // 资源单值门判违例：URL 无 {{}} 片段 → resource_not_single_ref 红边
        expect(row.find('.cn-field--invalid').exists()).toBe(true)
        // 选择器无手输缝：字段行内无 text input，原文只读回显
        expect(row.find('input[type="text"]').exists()).toBe(false)
        expect(row.find('.cn-pathpicker__value').exists()).toBe(true)
        expect(row.find('.cn-pathpicker__value').text()).toBe(LEGACY_URL)
        // 引用以声明为门：source=null 不渲染菜单钮，无修复通道
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(false)
        // 错误提示按修复通道分流（无菜单）：指向绑定，不走「语法错误」框架
        expect(row.find('.cn-prop-field__hint--error').text()).toBe('当前内容不是字段引用，绑定数据源后可选择字段')
    })

    it('静态合法引用字面切表达式：镜像保留（静态 ⇆ 表达式往返无损）', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({
            width: 800,
            height: 600,
            background: null,
            layers: [imageLayer({ src: '{{cover}}' }) as Layer],
        })
        editor.setSelection(['layers', 0])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        await toggleExpression(wrapper)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('{{cover}}')

        const row = srcRow(wrapper)
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
        // 拆壳回显裸路径
        expect(row.find('.cn-pathpicker__value').text()).toBe('cover')
    })

    it('新建图片层（src=null）+ 已绑声明：空值切表达式不标红（未选择态，用户反馈①）', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({ width: 800, height: 600, background: null, layers: [imageLayer() as Layer] })
        editor.setSelection(['layers', 0])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        await toggleExpression(wrapper)
        // 打标初值 = src ?? '' = 空串（内核 toggleDataMode 语义）
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('')

        const row = srcRow(wrapper)
        // 空串 = 未选择态：占位回显，不判违例（红框保留给「有内容但拆不出单引用」）
        expect(row.find('.cn-pathpicker__value').text()).toBe('未选择字段')
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
        expect(row.find('.cn-prop-field__hint--error').exists()).toBe(false)
        // 菜单在场（声明已绑）：直接点选即可
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(true)
    })

    it('清空内容后切表达式 + 已绑声明：同样不标红（用户反馈②）', async () => {
        const { editor, wrapper } = mountPanel(RAW_SCHEMA)
        // 清空（清除钮/路径行清空同一写路径：updateData 空串落 null）再切表达式
        editor.updateData(['layers', 0], '')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe(null)
        await toggleExpression(wrapper)

        const row = srcRow(wrapper)
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
        expect(row.find('.cn-prop-field__hint--error').exists()).toBe(false)
        expect(row.find('.cn-pathpicker__value').text()).toBe('未选择字段')
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(true)
    })

    it('空值切表达式 + 未绑声明：不标红但给绑定门弱提示（菜单缺席的原因说明）', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({ width: 800, height: 600, background: null, layers: [imageLayer() as Layer] })
        editor.setSelection(['layers', 0])
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        await toggleExpression(wrapper)

        const row = srcRow(wrapper)
        expect(row.find('.cn-field--invalid').exists()).toBe(false)
        expect(row.find('.cn-prop-field__hint--error').exists()).toBe(false)
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(false)
        expect(row.find('.cn-prop-field__hint:not(.cn-prop-field__hint--error)').text()).toBe('绑定数据源后可选择字段')
    })

    it('对照（文本层）：空文本切表达式不标红——片段扫描对空串零诊断，与资源门不对称', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({ width: 800, height: 600, background: null, layers: [emptyTextLayer()] })
        editor.setSelection(['layers', 0])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mount(PropertyPanel, { props: { editor }, attachTo: document.body })
        wrappers.push(wrapper)

        await toggleExpression(wrapper)
        const textRow = wrapper.findAll('.cn-prop-field').find((row) => row.text().includes('内容'))
        expect(textRow, '文本内容行未渲染').toBeDefined()
        expect(textRow!.find('.cn-field--invalid').exists()).toBe(false)
    })
})
