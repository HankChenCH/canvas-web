// @vitest-environment jsdom
/**
 * addMenu 数据面单测（editor-top-toolbar 工单 03；template-table-drag-create
 * 工单 03 收入模板表项）：ADD_MENU 从 LayerPanel.vue 抽出后，面板＋与工具栏
 * 「＋插入▾」共用的同源契约在此钉住——层型项四类（type 与注册表武装动作映射
 * 消费面一致）、模板表项收尾；ADD_LAYER_MENU 派生视图五项同序（工具栏同序收入
 * 模板表，spec 决策 5），顺序与 title 随 ADD_MENU 单点维护。
 */
import { describe, expect, it } from 'vitest'

import { ADD_LAYER_MENU, ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu：面板＋与工具栏插入▾ 的同源数据面', () => {
    it('ADD_MENU 五项：四类图层（武装画拉）+ 模板表（表单确认改武装，只属面板）', () => {
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

    it('ADD_LAYER_MENU 派生视图：五项同序（四图层项 + 模板表收尾，spec 决策 5），label/title 随 ADD_MENU 单点维护', () => {
        expect(ADD_LAYER_MENU.map((entry) => entry.kind)).toEqual([
            'layer',
            'layer',
            'layer',
            'layer',
            'template-table',
        ])
        expect(ADD_LAYER_MENU.filter((entry) => entry.kind === 'layer').map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
        // 同序派生：工具栏视图与面板清单逐项同 label 同 title（文案单点在 ADD_MENU）
        expect(ADD_LAYER_MENU.map((entry) => ({ label: entry.label, title: entry.title }))).toEqual(
            ADD_MENU.map((entry) => ({ label: entry.label, title: entry.title })),
        )
    })
})
