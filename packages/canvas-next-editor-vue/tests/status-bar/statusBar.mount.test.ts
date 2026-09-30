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
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import StatusBar from '../../src/status-bar/StatusBar.vue'
import { useShortcutsHelp } from '../../src/shared/useShortcutsHelp'
import { useTransientFeedback } from '../../src/shared/useTransientFeedback'
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

describe('StatusBar：缩放控件（kbd-nav 工单 04，只读 % 段升级弹层菜单）', () => {
    beforeEach(() => {
        useShortcutsHelp().close()
    })

    /** 开菜单的挂载：surface 已设尺寸（放大/缩小的视口中心锚需要）；await 渲染完成 */
    const mountWithMenu = async (editor: EditorSession) => {
        editor.setSurfaceSize(800, 600)
        const wrapper = mountBar(editor)
        await wrapper.find('[data-zoom]').trigger('click')
        return wrapper
    }

    it('% 段可点击：弹层菜单五项齐现（data-zoom-* 钩子沿浮条命名迁入）', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(false)

        await wrapper.find('[data-zoom]').trigger('click')
        const menu = wrapper.find('[data-zoom-menu]')
        expect(menu.exists()).toBe(true)
        expect(wrapper.find('[data-zoom]').attributes('aria-expanded')).toBe('true')
        for (const hook of ['data-zoom-100', 'data-zoom-fit', 'data-zoom-fit-selection', 'data-zoom-in', 'data-zoom-out']) {
            expect(wrapper.find(`[${hook}]`).exists()).toBe(true)
        }
        wrapper.unmount()
    })

    it('分发：放大 = 视口中心 ×1.25，缩小 = ÷1.25，读数联动', async () => {
        const editor = makeEditor()
        const wrapper = await mountWithMenu(editor)

        await wrapper.find('[data-zoom-in]').trigger('click')
        expect(editor.store.ui.viewport.zoom).toBeCloseTo(1.25, 9)
        expect(wrapper.find('[data-zoom]').text()).toBe('125%') // 读数联动

        // 菜单已随分发收起，重开再缩小
        await wrapper.find('[data-zoom]').trigger('click')
        await wrapper.find('[data-zoom-out]').trigger('click')
        expect(editor.store.ui.viewport.zoom).toBeCloseTo(1, 9)
        expect(wrapper.find('[data-zoom]').text()).toBe('100%')
        wrapper.unmount()
    })

    it('分发：100% 复位（视口中心为锚、平移不跳变）', async () => {
        const editor = makeEditor()
        editor.store.setViewport({ x: 0, y: 0, zoom: 2 })
        const wrapper = await mountWithMenu(editor)
        // 平移不跳变 = 复位前后屏幕中心下的场景点不动（resetZoom 中心锚语义）
        const centerSceneBefore = editor.toScenePoint(400, 300)

        await wrapper.find('[data-zoom-100]').trigger('click')
        expect(editor.store.ui.viewport.zoom).toBe(1)
        expect(editor.toScenePoint(400, 300)).toEqual(centerSceneBefore)
        expect(wrapper.find('[data-zoom]').text()).toBe('100%')
        wrapper.unmount()
    })

    it('分发：适应画布整页可见；适应选区按选中盒放大', async () => {
        const editor = makeEditor()
        editor.zoomAt(100, 100, 3)
        const wrapper = await mountWithMenu(editor)

        await wrapper.find('[data-zoom-fit]').trigger('click')
        expect(editor.store.ui.viewport.zoom).toBeCloseTo(1, 9) // 800×600 画布配 800×600 表面
        expect(wrapper.find('[data-zoom]').text()).toBe('100%')

        editor.setSelection(['layers', 0]) // 缺省盒 100×50 → fit 后放大（上限 8）
        await wrapper.find('[data-zoom]').trigger('click')
        await wrapper.find('[data-zoom-fit-selection]').trigger('click')
        expect(editor.store.ui.viewport.zoom).toBeCloseTo(8, 9)
        expect(wrapper.find('[data-zoom]').text()).toBe('800%')
        wrapper.unmount()
    })

    it('收菜单：点项即收；点外收；Escape 收', async () => {
        const editor = makeEditor()
        const wrapper = await mountWithMenu(editor)
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(true)

        // 点外（window pointerdown）收
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(false)

        // 重开后 Escape 收
        await wrapper.find('[data-zoom]').trigger('click')
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(true)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(false)

        // 重开后点项分发即收
        await wrapper.find('[data-zoom]').trigger('click')
        await wrapper.find('[data-zoom-in]').trigger('click')
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('未打开时不触发收菜单监听：Escape 落在注册表外原样放行', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-zoom-menu]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('StatusBar：「快捷键」段按钮（kbd-nav 工单 04，帮助面板第二入口）', () => {
    beforeEach(() => {
        useShortcutsHelp().close()
    })

    it('点击开帮助面板单例态，再点收（与 ⌘/ 入口共享同一 open）', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        const help = useShortcutsHelp()
        expect(wrapper.find('[data-help]').text()).toBe('快捷键')

        await wrapper.find('[data-help]').trigger('click')
        expect(help.open.value).toBe(true)

        await wrapper.find('[data-help]').trigger('click')
        expect(help.open.value).toBe(false)
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

describe('StatusBar：瞬时反馈段（包内单例补位，kbd-nav 工单 05）', () => {
    it('宿主沉默时显示 useTransientFeedback 瞬时文案（canvas 域拖放降级等），清空即隐藏', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-feedback]').exists()).toBe(false)

        const feedback = useTransientFeedback()
        feedback.show('上传不可用：未接入上传实现，图片未添加')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-feedback]').text()).toBe('上传不可用：未接入上传实现，图片未添加')

        feedback.clear()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-feedback]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('宿主注入文案优先（两路并存不互相覆盖），宿主清空后瞬时文案补位', async () => {
        const editor = makeEditor()
        const feedback = useTransientFeedback()
        feedback.show('包内瞬时')
        const wrapper = mountBar(editor, { feedback: '宿主动作读数' })
        expect(wrapper.find('[data-feedback]').text()).toBe('宿主动作读数')

        await wrapper.setProps({ feedback: '' })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-feedback]').text()).toBe('包内瞬时')
        wrapper.unmount()
    })
})
