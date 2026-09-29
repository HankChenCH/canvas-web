// @vitest-environment jsdom
/**
 * StatusBar 组件集成测试（工单 14 + playground-canvas-first 工单 01）：读数随 store/prop 实时更新。
 * - 缩放百分比：ui.viewport 分支通知驱动（含四舍五入取整）；
 * - 选中图层路径：ui.selection 分支驱动 + formatLayerPath 展示；无选择回落文案；
 * - 物化进行数：宿主注入 prop，>0 显示该段、归零隐藏（响应式）；
 * - 坐标尺寸段：组件内部由文档 position + layerBoxAt 解析盒计算，随选择出现、
 *   未选中隐藏，拖动文档事务实时联动；
 * - 资源/保存/反馈段：宿主注入 prop（资源就绪/保存态/动作结果），缺省隐藏；
 * - schema 声明态段：组件直读 ui 分支（已注入顶层 N 键 / 无候选）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import StatusBar from '../../src/status-bar/StatusBar.vue'
import { textLayer } from '../../../canvas-next-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
    return editor
}

type BarProps = {
    pendingCount?: number
    resourceNote?: string
    saveState?: 'dirty' | 'clean'
    feedback?: string
}

const mountBar = (editor: EditorSession, barProps: BarProps = {}) =>
    mount(StatusBar, { props: { editor, ...barProps }, attachTo: document.body })

describe('StatusBar：缩放百分比', () => {
    it('随视口分支实时更新（zoom 1.5 → 150%）', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-zoom]').text()).toBe('100%')

        editor.store.setViewport({ x: 0, y: 0, zoom: 1.5 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-zoom]').text()).toBe('150%')
        wrapper.unmount()
    })

    it('取整：zoom 0.755 → 76%', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        editor.store.setViewport({ x: 0, y: 0, zoom: 0.755 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-zoom]').text()).toBe('76%')
        wrapper.unmount()
    })
})

describe('StatusBar：选中图层路径', () => {
    it('随选择分支实时更新：根层/格内容路径格式化', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-selection]').text()).toBe('未选中图层')

        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-selection]').text()).toBe('图层 0')

        editor.setSelection(['layers', 0, 'rows', 2, 'cells', 1, 'content'])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-selection]').text()).toBe('图层 0 · 行 2 · 格 1 · 格内容')
        wrapper.unmount()
    })

    it('打开文档复位选择后回落「未选中图层」', async () => {
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-selection]').text()).toBe('图层 0')

        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-selection]').text()).toBe('未选中图层')
        wrapper.unmount()
    })
})

describe('StatusBar：物化进行数（宿主注入）', () => {
    it('>0 显示该段，归零后隐藏', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor, { pendingCount: 3 })
        expect(wrapper.find('[data-pending]').text()).toBe('物化中 3')

        await wrapper.setProps({ pendingCount: 0 })
        expect(wrapper.find('[data-pending]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('缺省 0：无物化段', () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-pending]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('StatusBar：坐标尺寸段（组件内部计算）', () => {
    it('未选中隐藏，选中后出现：x/y/锚点读文档 position，宽高读解析盒', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-geometry]').exists()).toBe(false)

        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        // 缺省夹具：position {x:0, y:0, anchor:'top-left'}，shape 100×50
        expect(wrapper.find('[data-geometry]').text()).toBe('x=0 y=0 · 100×50 · 左上锚')
        wrapper.unmount()
    })

    it('锚点与小数取整：bottom-right + 浮点 position 按整数展示', async () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [textLayer({ position: { anchor: 'bottom-right', x: 120.4, y: 80.6 } })],
        })
        const wrapper = mountBar(editor)
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-geometry]').text()).toBe('x=120 y=81 · 100×50 · 右下锚')
        wrapper.unmount()
    })

    it('拖动文档事务实时联动（无需选择变更）', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        editor.setSelection(['layers', 0])
        await wrapper.vm.$nextTick()

        editor.beginDrag(['layers', 0], 0, 0)
        editor.dragTo(30.6, 40.4)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-geometry]').text()).toBe('x=31 y=40 · 100×50 · 左上锚')

        editor.endDrag()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-geometry]').text()).toBe('x=31 y=40 · 100×50 · 左上锚')
        wrapper.unmount()
    })

    it('打开文档复位选择后隐藏', async () => {
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-geometry]').exists()).toBe(true)

        editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-geometry]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('StatusBar：资源状态段（宿主注入）', () => {
    it('缺省隐藏，随 resourceNote 出现/更新/消失', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-resource]').exists()).toBe(false)

        await wrapper.setProps({ resourceNote: '资源物化中（在途 2）…' })
        expect(wrapper.find('[data-resource]').text()).toBe('资源物化中（在途 2）…')

        await wrapper.setProps({ resourceNote: '资源就绪，已渲染' })
        expect(wrapper.find('[data-resource]').text()).toBe('资源就绪，已渲染')

        await wrapper.setProps({ resourceNote: '' })
        expect(wrapper.find('[data-resource]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('StatusBar：保存态段（宿主注入）', () => {
    it('缺省隐藏，dirty 显示 ● 未保存', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-save]').exists()).toBe(false)

        await wrapper.setProps({ saveState: 'dirty' })
        expect(wrapper.find('[data-save]').text()).toBe('● 未保存')
        wrapper.unmount()
    })

    it('clean 显示 ○ 已保存', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor, { saveState: 'dirty' })
        await wrapper.setProps({ saveState: 'clean' })
        expect(wrapper.find('[data-save]').text()).toBe('○ 已保存')
        wrapper.unmount()
    })
})

describe('StatusBar：schema 声明态段（组件直读 ui 分支）', () => {
    it('未注入显示无候选，注入后显示顶层键数，清除后回落', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-schema]').text()).toBe('schema 无候选')

        editor.setDataSourceSchema({
            type: 'object',
            properties: {
                orderNo: { type: 'string', description: '订单编号' },
                assets: { type: 'object', properties: { banner: { type: 'string' } } },
                order: { type: 'object', properties: { items: { type: 'array' } } },
            },
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-schema]').text()).toBe('schema 已注入顶层 3 键')

        editor.setDataSourceSchema(null)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-schema]').text()).toBe('schema 无候选')
        wrapper.unmount()
    })
})

describe('StatusBar：瞬时反馈段（宿主注入）', () => {
    it('缺省隐藏，随 feedback 出现/消失', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-feedback]').exists()).toBe(false)

        await wrapper.setProps({ feedback: '已保存 graph JSON（canvas.graph.json）' })
        expect(wrapper.find('[data-feedback]').text()).toBe('已保存 graph JSON（canvas.graph.json）')

        await wrapper.setProps({ feedback: '' })
        expect(wrapper.find('[data-feedback]').exists()).toBe(false)
        wrapper.unmount()
    })
})
