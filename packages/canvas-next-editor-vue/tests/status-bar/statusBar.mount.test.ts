// @vitest-environment jsdom
/**
 * StatusBar 组件集成测试（工单 14）：三项信息随 store 实时更新。
 * - 缩放百分比：ui.viewport 分支通知驱动（含四舍五入取整）；
 * - 选中图层路径：ui.selection 分支驱动 + formatLayerPath 展示；无选择回落文案；
 * - 物化进行数：宿主注入 prop，>0 显示该段、归零隐藏（响应式）。
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

const mountBar = (editor: EditorSession, pendingCount?: number) =>
    mount(StatusBar, { props: pendingCount === undefined ? { editor } : { editor, pendingCount }, attachTo: document.body })

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
        const wrapper = mountBar(editor, 3)
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
