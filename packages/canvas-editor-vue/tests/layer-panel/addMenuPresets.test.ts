// @vitest-environment jsdom
/**
 * addMenu 文本预设数据面单测（text-defaults 工单 02，spec 决策 5）：预设三项只
 * 属面板——ADD_TEXT_PRESET_MENU 独立清单、PANEL_ADD_MENU 面板完整序（预设插在
 * 「文本层」之后），工具栏派生视图 ADD_LAYER_MENU 保持四类层型不含预设。
 */
import { describe, expect, it } from 'vitest'

import { TEXT_PRESETS } from '@hankchen/canvas-editor'

import { ADD_LAYER_MENU, ADD_MENU, ADD_TEXT_PRESET_MENU, PANEL_ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu 文本预设：面板专用清单（text-defaults 工单 02）', () => {
    it('ADD_TEXT_PRESET_MENU 三档：heading/subheading/body，文案与 title 非空', () => {
        expect(ADD_TEXT_PRESET_MENU.map((entry) => entry.preset)).toEqual(['heading', 'subheading', 'body'])
        expect(ADD_TEXT_PRESET_MENU.every((entry) => entry.label !== '' && entry.title !== '')).toBe(true)
        expect(ADD_TEXT_PRESET_MENU.map((entry) => entry.label)).toEqual(['标题', '副标题', '正文'])
    })

    it('title 字号从内核 TEXT_PRESETS 派生（单一事实源，评审合流——内核改档位文案自动跟随）', () => {
        for (const entry of ADD_TEXT_PRESET_MENU) {
            const source = TEXT_PRESETS.find((preset) => preset.id === entry.preset)
            expect(source).toBeDefined()
            expect(entry.title).toContain(`字号 ${source!.fontSize}`)
        }
    })

    it('PANEL_ADD_MENU 面板完整序：预设三项插在「文本层」之后、比例六档平铺在「图片层」之后（image-ratio-preset 工单 02）、模板表仍收尾', () => {
        expect(
            PANEL_ADD_MENU.map((entry) =>
                entry.kind === 'text-preset'
                    ? `preset:${entry.preset}`
                    : entry.kind === 'ratio-preset'
                        ? `ratio:${entry.preset}`
                        : entry.kind === 'layer'
                            ? `layer:${entry.type}`
                            : 'template-table',
            ),
        ).toEqual([
            'layer:TextLayer',
            'preset:heading',
            'preset:subheading',
            'preset:body',
            'layer:ImageLayer',
            'ratio:free',
            'ratio:1:1',
            'ratio:4:3',
            'ratio:3:4',
            'ratio:16:9',
            'ratio:9:16',
            'layer:QrCodeLayer',
            'layer:TableLayer',
            'template-table',
        ])
    })

    it('工具栏视图不受影响：ADD_LAYER_MENU 仍恰四类层型、无预设项', () => {
        expect(ADD_LAYER_MENU.map((entry) => entry.type)).toEqual(['TextLayer', 'ImageLayer', 'QrCodeLayer', 'TableLayer'])
        expect(ADD_MENU.map((entry) => entry.kind)).toEqual(['layer', 'layer', 'layer', 'layer', 'template-table'])
    })
})
