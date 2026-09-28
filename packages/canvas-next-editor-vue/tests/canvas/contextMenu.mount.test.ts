// @vitest-environment jsdom
/**
 * ContextMenu 组件集成测试（工单 14）：
 * - openAt 以视口（表面本地）坐标定位；打开后钳位进宿主边界
 * - 可用态按选中路径裁剪：删除=有选择；副本=可复制类型；置顶/置底=根层
 * - 动作经内核 action 执行并关闭菜单；禁用项不动作
 * - 菜单根拦截 pointerdown 冒泡（不触发画布点选关闭路径误动作）
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type Layer } from '@hankchen/canvas-next-editor'

import ContextMenu from '../../src/canvas/ContextMenu.vue'
import { cellLayer, rowLayer, tableLayer, textLayer } from '../../../canvas-next-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: readonly Layer[]): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [...layers] })
    return editor
}

// jsdom 无布局：宿主尺寸用属性桩、菜单尺寸用 getBoundingClientRect 桩（钳位数学可验）
const HOST_WIDTH = 800
const HOST_HEIGHT = 600
const MENU_WIDTH = 140
const MENU_HEIGHT = 130

beforeAll(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() =>
        ({ width: MENU_WIDTH, height: MENU_HEIGHT, top: 0, left: 0, right: MENU_WIDTH, bottom: MENU_HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    )
})

afterAll(() => {
    vi.restoreAllMocks()
})

const mountMenu = (editor: EditorSession) => {
    // VTU attachTo 会在目标内再包一层自己的容器：菜单钳位按 parentElement 取
    // 边界（真实装配里 = surface 宿主），给这层实际父容器打上尺寸桩
    const wrapper = mount(ContextMenu, { props: { editor }, attachTo: document.body })
    const parent = (wrapper.element as HTMLElement).parentElement
    if (parent) {
        Object.defineProperty(parent, 'clientWidth', { value: HOST_WIDTH })
        Object.defineProperty(parent, 'clientHeight', { value: HOST_HEIGHT })
    }
    return wrapper
}

const itemButtons = (wrapper: ReturnType<typeof mountMenu>) =>
    wrapper.findAll('button[role="menuitem"]')

describe('ContextMenu：定位与钳位', () => {
    it('openAt 以视口坐标定位（style left/top 直用）', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(120, 80)
        const root = wrapper.find('.cn-context-menu')
        expect(root.exists()).toBe(true)
        expect(root.attributes('style')).toContain('left: 120px')
        expect(root.attributes('style')).toContain('top: 80px')
        wrapper.unmount()
    })

    it('近右下边缘打开时钳位进宿主边界', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(HOST_WIDTH - 10, HOST_HEIGHT - 10)
        const style = wrapper.find('.cn-context-menu').attributes('style') ?? ''
        const left = Number(/left: ([\d.]+)px/.exec(style)?.[1] ?? 0)
        const top = Number(/top: ([\d.]+)px/.exec(style)?.[1] ?? 0)
        // 钳位：left + 菜单宽 ≤ 800−2、top + 菜单高 ≤ 600−2（jsdom 桩尺寸 140×130）
        expect(left).toBeCloseTo(HOST_WIDTH - MENU_WIDTH - 2)
        expect(top).toBeCloseTo(HOST_HEIGHT - MENU_HEIGHT - 2)
        wrapper.unmount()
    })

    it('close 关闭菜单', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        expect(wrapper.find('.cn-context-menu').exists()).toBe(true)
        wrapper.vm.close()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('ContextMenu：可用态裁剪（v1 单选 + 根层语义）', () => {
    it('根层文本层：五项全可用（显示/隐藏按当前态出标签）', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const buttons = itemButtons(wrapper)
        expect(buttons).toHaveLength(5)
        expect(buttons.map((b) => b.text())).toEqual(['隐藏', '创建副本', '置顶', '置底', '删除'])
        expect(buttons.every((b) => !b.attributes('disabled'))).toBe(true)
        wrapper.unmount()
    })

    it('表格行：删除可用，显示/隐藏/副本/置顶/置底禁用；转换项按所属表出现（spec §2.3）', async () => {
        const editor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(null, { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        editor.setSelection(['layers', 0, 'rows', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const disabled = itemButtons(wrapper).map((b) => b.attributes('disabled') !== undefined)
        // [隐藏, 副本, 置顶, 置底, 转为模板表…（所属 V1 表末行有格 → 可用）, 删除]
        expect(disabled).toEqual([true, true, true, true, false, false])
        const labels = itemButtons(wrapper).map((b) => b.text())
        expect(labels).toContain('转为模板表…')
        wrapper.unmount()
    })

    it('格内容（文本层）：删除/副本可用，显示/隐藏/置顶/置底禁用', async () => {
        const editor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(textLayer({ text: '甲' }), { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        editor.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const disabled = itemButtons(wrapper).map((b) => b.attributes('disabled') !== undefined)
        // [隐藏, 副本, 置顶, 置底, 转为模板表…（所属表判定，spec §2.3）, 删除]
        expect(disabled).toEqual([true, false, true, true, false, false])
        wrapper.unmount()
    })

    it('无选择：全部禁用', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        expect(itemButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true)
        wrapper.unmount()
    })
})

describe('ContextMenu：动作执行', () => {
    it('删除：执行 deleteLayer 并关闭菜单', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '删除')!.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        wrapper.unmount()
    })

    it('副本：执行 duplicateSelection（+20 偏移、置顶）并关闭', async () => {
        const editor = makeEditor([textLayer({ priority: 10, position: { x: 0, y: 0 } })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '创建副本')!.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(2)
        expect(editor.store.doc!.layers[1]!.position.x).toBe(20)
        expect(editor.store.ui.selection).toEqual(['layers', 1])
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        wrapper.unmount()
    })

    it('置顶/置底：重排根层（priority 中点语义）', async () => {
        const editor = makeEditor([
            textLayer({ priority: 30, text: '底' }),
            textLayer({ priority: 20, text: '中' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        editor.setSelection(['layers', 0]) // 底
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '置顶')!.trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['中', '顶', '底'])
        expect(editor.store.doc!.layers[2]!.priority).toBe(9)

        editor.setSelection(['layers', 2]) // 底（移动后；max 已被置顶改为 20）
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '置底')!.trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['底', '中', '顶'])
        expect(editor.store.doc!.layers[0]!.priority).toBe(21) // 现表 max(20) + 1
        wrapper.unmount()
    })

    it('禁用项点击不产生副作用', async () => {
        const editor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(null, { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        editor.setSelection(['layers', 0, 'rows', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '置顶')!.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.canUndo).toBe(false)
        wrapper.unmount()
    })
})

describe('ContextMenu：显示/隐藏（工单 10）', () => {
    it('可见根层：菜单项「隐藏」→ 点击 toggleLayerVisibility（visible=false、一步历史）并关闭', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '隐藏')!.trigger('click')

        expect(editor.store.doc!.layers[0]!.visible).toBe(false)
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        wrapper.unmount()
    })

    it('隐藏根层：重开菜单项标签翻转为「显示」→ 点击恢复 visible=true', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.toggleLayerVisibility(['layers', 0])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        expect(itemButtons(wrapper)[0]!.text()).toBe('显示')

        await itemButtons(wrapper)[0]!.trigger('click')
        expect(editor.store.doc!.layers[0]!.visible).toBe(true)
        expect(editor.store.history).toHaveLength(2) // 预置隐藏 1 步 + 恢复 1 步
        wrapper.unmount()
    })

    it('行选择时菜单项禁用：点击不产生历史步', async () => {
        const editor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(null, { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        editor.setSelection(['layers', 0, 'rows', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '隐藏')!.trigger('click')
        expect(editor.canUndo).toBe(false)
        wrapper.unmount()
    })
})
