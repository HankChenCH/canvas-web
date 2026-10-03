// @vitest-environment jsdom
/**
 * addMenu 数据面单测（editor-top-toolbar 工单 03）：ADD_MENU 从 LayerPanel.vue
 * 抽出后，面板＋与工具栏「＋插入▾」共用的同源契约在此钉住——层型项四类（type
 * 与注册表武装动作映射消费面一致）、模板表项只属面板、ADD_LAYER_MENU 派生视图
 * 不含模板表且顺序 = 面板声明序。
 */
import { describe, expect, it } from 'vitest'

import { ADD_LAYER_MENU, ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu：面板＋与工具栏插入▾ 的同源数据面', () => {
    it('ADD_MENU 五项：四类图层（武装画拉）+ 模板表（表单直建，只属面板）', () => {
        expect(ADD_MENU.map((entry) => entry.kind)).toEqual([
            'layer',
            'layer',
            'layer',
            'layer',
            'template-table',
        ])
        expect(ADD_MENU.filter((entry) => entry.kind === 'layer').map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
    })

    it('ADD_LAYER_MENU 派生视图：恰为四类图层项（模板表不进工具栏），顺序与 title 随 ADD_MENU', () => {
        expect(ADD_LAYER_MENU.map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
        expect(ADD_LAYER_MENU.every((entry) => entry.label !== '' && entry.title !== '')).toBe(true)
        const templateEntry = ADD_MENU.find((entry) => entry.kind === 'template-table')
        expect(ADD_LAYER_MENU.some((entry) => entry.label === templateEntry?.label)).toBe(false)
    })
})
