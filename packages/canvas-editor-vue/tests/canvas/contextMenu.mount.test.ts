// @vitest-environment jsdom
/**
 * ContextMenu 组件集成测试（工单 14）：
 * - openAt 以视口（表面本地）坐标定位；打开后钳位进宿主边界
 * - 可用态按选中路径裁剪：删除=有选择；副本=可复制类型；置顶/置底=根层
 * - 动作经内核 action 执行并关闭菜单；禁用项不动作
 * - 菜单根拦截 pointerdown 冒泡（不触发画布点选关闭路径误动作）
 * - 样式复制/粘贴两项（canvas-web-style-paste 工单 02）：渲染/可用态/置灰
 *   title/分发（内核只读查询口 + 动作口；样式槽无响应式足迹，打开时重算）
 * - 键位提示文案（复制样式/锁定解锁）按宿主平台渲染两形态（shortcutsHelp
 *   平台 helper 直查注册表，文案不另抄键位）
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type Layer, type TextLayer } from '@hankchen/canvas-editor'

import ContextMenu from '../../src/canvas/ContextMenu.vue'
import { cellLayer, rowLayer, rowTemplateLayer, tableLayer, textLayer } from '../../../canvas-editor/tests/support/fixtures'

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
    it('根层文本层：九项渲染，粘贴样式因槽空置灰（复制样式非根同门不禁用）', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const buttons = itemButtons(wrapper)
        expect(buttons).toHaveLength(9)
        expect(buttons.map((b) => b.text())).toEqual([
            '隐藏',
            '创建副本',
            '复制样式',
            '粘贴样式',
            '前移一层',
            '后移一层',
            '置顶',
            '置底',
            '删除',
        ])
        const disabled = buttons.map((b) => b.attributes('disabled') !== undefined)
        // 粘贴样式置灰（样式槽空）；其余全可用
        expect(disabled).toEqual([false, false, false, true, false, false, false, false, false])
        const paste = buttons.find((b) => b.text() === '粘贴样式')!
        // 键位提示按平台渲染（jsdom navigator.platform 为空 → win 文本系；mac 形态另测）
        expect(paste.attributes('title')).toContain('Ctrl+Alt+C')
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
        // [隐藏, 副本, 复制样式（行有样式面）, 粘贴样式, 前移, 后移, 置顶, 置底, 转为模板表…（所属 V1 表末行有格 → 可用）, 删除]
        expect(disabled).toEqual([true, true, false, true, true, true, true, true, false, false])
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
        // [隐藏, 副本, 复制样式（内容层有样式面）, 粘贴样式, 前移, 后移, 置顶, 置底, 转为模板表…（所属表判定，spec §2.3）, 删除]
        expect(disabled).toEqual([true, false, false, true, true, true, true, true, false, false])
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

    it('前移一层/后移一层：单格重排（kbd-nav 工单 05，直调内核 bringForward/sendBackward）', async () => {
        const editor = makeEditor([
            textLayer({ priority: 30, text: '底' }),
            textLayer({ priority: 20, text: '中' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        const wrapper = mountMenu(editor)

        // 前移：视觉底层的「底」上挪一格（与「中」换位）
        editor.setSelection(['layers', 0]) // 底
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '前移一层')!.trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['中', '底', '顶'])
        expect(editor.canUndo).toBe(true)
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)

        // 后移：视觉顶层的「顶」下挪一格（panel [顶,底,中] → [底,顶,中]）
        editor.setSelection(['layers', 2]) // 顶
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '后移一层')!.trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['中', '顶', '底'])
        wrapper.unmount()
    })

    it('前移/后移：非根置灰 + title 同置顶/置底现状；边界不置灰（内核空转为权威）', async () => {
        const editor = makeEditor([
            textLayer({ priority: 20, text: '甲' }),
            textLayer({ priority: 10, text: '乙' }),
        ])
        const wrapper = mountMenu(editor)

        // 边界不置灰：视觉顶层「乙」的前移一层仍可点，点击内核空转（无历史步）
        editor.setSelection(['layers', 1]) // 乙（视觉最上层）
        await wrapper.vm.openAt(10, 10)
        const forward = itemButtons(wrapper).find((b) => b.text() === '前移一层')!
        expect(forward.attributes('disabled')).toBeUndefined()
        await forward.trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['甲', '乙'])
        expect(editor.canUndo).toBe(false)
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        wrapper.unmount()

        // 非根置灰 + title（行选择）
        const tableEditor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(null, { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        tableEditor.setSelection(['layers', 0, 'rows', 0])
        const tableWrapper = mountMenu(tableEditor)
        await tableWrapper.vm.openAt(10, 10)
        for (const label of ['前移一层', '后移一层']) {
            const item = itemButtons(tableWrapper).find((b) => b.text() === label)!
            expect(item.attributes('disabled')).toBeDefined()
            expect(item.attributes('title')).toContain('根图层')
        }
        await itemButtons(tableWrapper).find((b) => b.text() === '前移一层')!.trigger('click')
        expect(tableEditor.canUndo).toBe(false)
        tableWrapper.unmount()
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

describe('ContextMenu：锁定层删除项置灰（canvas-web-layer-lock 工单 02）', () => {
    it('锁定根层选中：删除项 disabled + title 说明，其余项不受累；解锁恢复', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.toggleLayerLock(['layers', 0]) // 内核空转为权威——锁定层退出命中面，
        editor.setSelection(['layers', 0]) // 画布右键够不到；面板选中后菜单可达（spec §2）
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const del = itemButtons(wrapper).find((b) => b.text() === '删除')!
        expect(del.attributes('disabled')).toBeDefined()
        // 键位提示按平台渲染（jsdom 缺省 win 文本系）
        expect(del.attributes('title')).toBe('图层已锁定（Ctrl+Shift+L 解锁后可删除）')
        // 锁定只挡误操作：显隐/置顶照常可用（刻意通道不受限）
        expect(itemButtons(wrapper)[0]!.attributes('disabled')).toBeUndefined()
        wrapper.unmount()

        editor.toggleLayerLock(['layers', 0])
        const wrapper2 = mountMenu(editor)
        await wrapper2.vm.openAt(10, 10)
        expect(itemButtons(wrapper2).find((b) => b.text() === '删除')!.attributes('disabled')).toBeUndefined()
        wrapper2.unmount()
    })

    it('键位提示 mac 形态（navigator 桩）：粘贴样式 ⌥⌘C、锁定删除 ⇧⌘L', async () => {
        const original = window.navigator
        Object.defineProperty(window, 'navigator', { value: { platform: 'MacIntel' }, configurable: true })
        try {
            const editor = makeEditor([textLayer({ priority: 10 })])
            editor.toggleLayerLock(['layers', 0])
            editor.setSelection(['layers', 0])
            const wrapper = mountMenu(editor)
            await wrapper.vm.openAt(10, 10)
            const buttons = itemButtons(wrapper)
            expect(buttons.find((b) => b.text() === '粘贴样式')!.attributes('title')).toBe('先 ⌥⌘C 复制样式')
            expect(buttons.find((b) => b.text() === '删除')!.attributes('title')).toBe('图层已锁定（⇧⌘L 解锁后可删除）')
            wrapper.unmount()
        } finally {
            Object.defineProperty(window, 'navigator', { value: original, configurable: true })
        }
    })

    it('锁定根层的行/格子树：右键不可达路径兜底（面板选中行）删除项同样 disabled', async () => {
        const editor = makeEditor([
            tableLayer(
                [rowLayer([cellLayer(null, { shape: { width: 200, height: 60 } })], { shape: { width: 200, height: 60 } })],
                { shape: { width: 200, height: 60 } },
            ),
        ])
        editor.toggleLayerLock(['layers', 0])
        editor.setSelection(['layers', 0, 'rows', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const del = itemButtons(wrapper).find((b) => b.text() === '删除')!
        expect(del.attributes('disabled')).toBeDefined()
        // 点击零历史步（disabled 拦截 + 内核 deleteLayer 空转双保险）
        await del.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.canUndo).toBe(false)
        wrapper.unmount()
    })
})

describe('ContextMenu：样式复制/粘贴（canvas-web-style-paste 工单 02）', () => {
    it('复制样式：点击分发内核 copyStyle（填槽、不进历史）并关闭菜单', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '复制样式')!.trigger('click')
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)
        // 槽填充的内核可见面：粘贴转可用；复制不进历史（剪贴板态不是文档态）
        expect(editor.canPasteStyle).toBe(true)
        expect(editor.canUndo).toBe(false)
        wrapper.unmount()
    })

    it('粘贴样式：槽填充后重开菜单转可用（⌥⌘C 同槽填充不经 store，打开时重算兜底）', async () => {
        const editor = makeEditor([
            textLayer({ priority: 20, font: 'Georgia', fontSize: 33 }),
            textLayer({ priority: 10 }),
        ])
        // 目标层选中且全程不变——槽变化无响应式足迹，只有 open 依赖能触发重算
        editor.setSelection(['layers', 1])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        expect(itemButtons(wrapper).find((b) => b.text() === '粘贴样式')!.attributes('disabled')).toBeDefined()

        editor.copyStyle(['layers', 0]) // ⌥⌘C 同门：槽填充，无 store 变更、无选择变更
        await wrapper.vm.$nextTick()
        expect(itemButtons(wrapper).find((b) => b.text() === '粘贴样式')!.attributes('disabled')).toBeDefined()

        wrapper.vm.close()
        await wrapper.vm.openAt(10, 10)
        const paste = itemButtons(wrapper).find((b) => b.text() === '粘贴样式')!
        expect(paste.attributes('disabled')).toBeUndefined()
        expect(paste.attributes('title')).toBeUndefined()
        wrapper.unmount()
    })

    it('粘贴样式：点击按交集落地（字体族全套）+ 一步历史并关闭菜单', async () => {
        const editor = makeEditor([
            textLayer({ priority: 20, font: 'Georgia', fontSize: 33, fontColor: '#ef4444', align: { horizontal: 'center' } }),
            textLayer({ priority: 10 }),
        ])
        editor.copyStyle(['layers', 0])
        editor.setSelection(['layers', 1])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        await itemButtons(wrapper).find((b) => b.text() === '粘贴样式')!.trigger('click')
        expect(wrapper.find('.cn-context-menu').exists()).toBe(false)

        const target = editor.store.doc!.layers[1] as TextLayer
        expect(target.font).toBe('Georgia')
        expect(target.fontSize).toBe(33)
        expect(target.fontColor).toBe('#ef4444')
        expect(target.align.horizontal).toBe('center')
        expect(editor.store.history).toHaveLength(1)
        wrapper.unmount()
    })

    it('行模板替身：复制样式置灰 + title（适用面为空，内核 canCopyStyle 守卫同门）', async () => {
        const editor = makeEditor([
            tableLayer([], {
                rowsPath: 'data.rows',
                template: rowTemplateLayer([cellLayer(textLayer({ text: '第2026期' }), { shape: { width: 200, height: 60 } })]),
            }),
        ])
        editor.setSelection(['layers', 0, 'template'])
        const wrapper = mountMenu(editor)
        await wrapper.vm.openAt(10, 10)
        const copy = itemButtons(wrapper).find((b) => b.text() === '复制样式')!
        expect(copy.attributes('disabled')).toBeDefined()
        expect(copy.attributes('title')).toContain('行模板')
        wrapper.unmount()
    })
})
