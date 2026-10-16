// @vitest-environment jsdom
/**
 * addMenu 文本预设二级单测（text-defaults 工单 02 引入；canvas-web-preset-submenu
 * 工单 03 树形化）：预设三档只属面板——挂「文本层」二级 children（平铺插入退役），
 * 字号后缀走底座 shortcut 灰字槽；工具栏派生视图 ADD_LAYER_MENU 保持平铺不含预设。
 */
import { describe, expect, it } from 'vitest'

import { TEXT_PRESETS } from '@hankchen/canvas-editor'

import { ADD_LAYER_MENU, ADD_TEXT_PRESET_MENU, PANEL_ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu 文本预设二级（canvas-web-preset-submenu 工单 03 树形化）', () => {
    it('ADD_TEXT_PRESET_MENU 三档：heading/subheading/body，label = 标题/副标题/正文', () => {
        expect(ADD_TEXT_PRESET_MENU.map((entry) => entry.preset)).toEqual(['heading', 'subheading', 'body'])
        expect(ADD_TEXT_PRESET_MENU.map((entry) => entry.label)).toEqual(['标题', '副标题', '正文'])
        expect(ADD_TEXT_PRESET_MENU.every((entry) => entry.title !== '')).toBe(true)
    })

    it('字号后缀（shortcut 灰字槽）与 title 字号从内核 TEXT_PRESETS 派生（单一事实源，不抄写字面量）', () => {
        for (const entry of ADD_TEXT_PRESET_MENU) {
            const source = TEXT_PRESETS.find((preset) => preset.id === entry.preset)
            expect(source).toBeDefined()
            expect(entry.shortcut).toBe(`${source!.fontSize}号`)
            expect(entry.title).toContain(`字号 ${source!.fontSize}`)
        }
    })

    it('PANEL_ADD_MENU：三档挂「文本层」children（序 = 内核 TEXT_PRESETS 序），不再平铺在一级', () => {
        const textEntry = PANEL_ADD_MENU[0]
        if (textEntry === undefined || textEntry.kind !== 'layer' || textEntry.type !== 'TextLayer') {
            throw new Error('面板第 1 项应是文本层')
        }
        expect(textEntry.children).toEqual(ADD_TEXT_PRESET_MENU)
        // 一级不再有预设项：5 行 = 层型 ×4 + 模板表
        expect(PANEL_ADD_MENU).toHaveLength(5)
    })

    it('工具栏视图不受影响：ADD_LAYER_MENU 无预设项（模板表同序收尾，template-table-drag-create 工单 03）', () => {
        expect(ADD_LAYER_MENU.filter((entry) => entry.kind === 'layer').map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
        // 模板表同序收尾（template-table-drag-create 工单 03）；类型面本就排除了
        // text-preset 档位，此处钉序列防视图收窄回层型子集
        expect(ADD_LAYER_MENU.map((entry) => entry.kind)).toEqual([
            'layer',
            'layer',
            'layer',
            'layer',
            'template-table',
        ])
    })
})
