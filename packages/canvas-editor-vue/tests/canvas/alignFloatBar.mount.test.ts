// @vitest-environment jsdom
/**
 * AlignFloatBar 组件集成测试（layer-align-snap 工单 02）：
 * - 存在性：常显——未选中也在文档流，不 v-if 摘除；
 * - 三段分组与键数：居中×2 ｜ 贴边×4 ｜ 贴角×4，段间分隔线，逐键
 *   data-align-* 目验钩子（工单 03 的自动化锚点）与 title/aria-label；
 * - 未选中整条置灰禁用：全部键 disabled + 根 aria-disabled，点击不动作；
 *   选中后全部可用；
 * - 点击直调内核 action：mode 逐键对位，corner 系带缺省边距 40；
 *   真实接线一例：贴右上后盒坐标 = 右距 40 / 上距 40（内核公式落地）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import {
    ALIGN_CORNER_MARGIN_PX,
    EditorSession,
    type FrameScheduler,
} from '@hankchen/canvas-editor'

import AlignFloatBar from '../../src/canvas/AlignFloatBar.vue'
import { textLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
    return editor
}

const mountBar = (editor: EditorSession) =>
    mount(AlignFloatBar, { props: { editor }, attachTo: document.body })

/** 三段分组的键序（spec 决策 2）：居中×2 ｜ 贴边×4 ｜ 贴角×4 */
const MODES_IN_ORDER = [
    'h-center',
    'v-center',
    'left',
    'right',
    'top',
    'bottom',
    'corner-tl',
    'corner-tr',
    'corner-bl',
    'corner-br',
] as const

describe('AlignFloatBar：存在性（常显）', () => {
    it('未选中也渲染：toolbar 根 + aria-label，不 v-if 摘除', () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        const root = wrapper.find('[data-align-float]')
        expect(root.exists()).toBe(true)
        expect(root.attributes('role')).toBe('toolbar')
        expect(root.attributes('aria-label')).toBe('对齐画布')
        wrapper.unmount()
    })
})

describe('AlignFloatBar：三段分组与键数', () => {
    it('三段 10 键：每组键数 2/4/4，段间分隔线两条', () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        const groups = wrapper.findAll('.cn-align-float__group')
        expect(groups).toHaveLength(3)
        expect(groups.map((g) => g.findAll('button').length)).toEqual([2, 4, 4])
        expect(wrapper.findAll('.cn-align-float__divider')).toHaveLength(2)
        expect(wrapper.findAll('button.cn-align-float__key')).toHaveLength(10)
        wrapper.unmount()
    })

    it('逐键 data-align-* 钩子按组序排列', () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        const modes = wrapper
            .findAll('button.cn-align-float__key')
            .map(
                (b) =>
                    MODES_IN_ORDER.find((m) => b.attributes(`data-align-${m}`) !== undefined) ??
                    'missing-hook',
            )
        expect(modes).toEqual([...MODES_IN_ORDER])
        wrapper.unmount()
    })

    it('每键 title + aria-label 齐备（非空）', () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        for (const button of wrapper.findAll('button.cn-align-float__key')) {
            expect(button.attributes('title')).toBeTruthy()
            expect(button.attributes('aria-label')).toBeTruthy()
        }
        wrapper.unmount()
    })
})

describe('AlignFloatBar：未选中置灰禁用', () => {
    it('未选中：全部键 disabled + 根 aria-disabled，点击不动作', async () => {
        const editor = makeEditor()
        const spy = vi.spyOn(editor, 'alignToCanvas')
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-align-float]').attributes('aria-disabled')).toBe('true')
        const buttons = wrapper.findAll('button.cn-align-float__key')
        expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true)
        // trigger 直接派发事件（越过了 disabled 的激活行为拦截）——组件内仍须空转
        await wrapper.find('[data-align-left]').trigger('click')
        expect(spy).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('选中后：根恢复可用，全部键 enabled', async () => {
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-align-float]').attributes('aria-disabled')).toBeUndefined()
        const buttons = wrapper.findAll('button.cn-align-float__key')
        expect(buttons.every((b) => b.attributes('disabled') === undefined)).toBe(true)
        wrapper.unmount()
    })
})

describe('AlignFloatBar：点击直调内核 action', () => {
    it('十键逐一对位：mode 正确，corner 系带缺省边距 40', async () => {
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        const spy = vi.spyOn(editor, 'alignToCanvas')
        const wrapper = mountBar(editor)
        for (const mode of MODES_IN_ORDER) {
            spy.mockClear()
            await wrapper.find(`[data-align-${mode}]`).trigger('click')
            expect(spy).toHaveBeenCalledTimes(1)
            if (mode.startsWith('corner-')) {
                expect(spy).toHaveBeenCalledWith(['layers', 0], mode, {
                    margin: ALIGN_CORNER_MARGIN_PX,
                })
            } else {
                expect(spy).toHaveBeenCalledWith(['layers', 0], mode)
            }
        }
        wrapper.unmount()
    })

    it('真实接线：贴右上后盒坐标 = 右距 40 / 上距 40（内核公式落地）', async () => {
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        const wrapper = mountBar(editor)
        await wrapper.find('[data-align-corner-tr]').trigger('click')
        // 缺省夹具盒 100×50：x = 800−100−40、y = 40
        expect(editor.layerBoxAt(['layers', 0])).toMatchObject({ x: 660, y: 40 })
        wrapper.unmount()
    })
})
