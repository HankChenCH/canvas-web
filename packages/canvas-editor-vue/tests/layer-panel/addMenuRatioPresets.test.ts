// @vitest-environment jsdom
/**
 * addMenu 比例预设数据面单测（image-ratio-preset 工单 02，spec 决策 2）：六档
 * 只属面板——ADD_RATIO_PRESET_MENU 从内核 RATIO_PRESETS 派生（比例与顺序单一
 * 事实源，内核改档位自动跟随），PANEL_ADD_MENU 面板完整序（档位平铺在「图片层」
 * 之后），工具栏派生视图 ADD_LAYER_MENU 不含档位（文本预设先例：预设只属面板）。
 */
import { describe, expect, it } from 'vitest'

import { RATIO_PRESETS } from '@hankchen/canvas-editor'

import { ADD_LAYER_MENU, ADD_RATIO_PRESET_MENU, PANEL_ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu 比例预设：面板专用清单（image-ratio-preset 工单 02）', () => {
    it('ADD_RATIO_PRESET_MENU 六档：id 与顺序随内核 RATIO_PRESETS，label = 自由/1:1/4:3/3:4/16:9/9:16', () => {
        expect(ADD_RATIO_PRESET_MENU.map((entry) => entry.preset)).toEqual(RATIO_PRESETS.map((preset) => preset.id))
        expect(ADD_RATIO_PRESET_MENU.map((entry) => entry.label)).toEqual(['自由', '1:1', '4:3', '3:4', '16:9', '9:16'])
        expect(ADD_RATIO_PRESET_MENU.every((entry) => entry.kind === 'ratio-preset')).toBe(true)
    })

    it('title 带比例说明（从内核 ratio 派生）与画拉提示；Shift 临时反转语义随档位（自由档反向提示）', () => {
        for (const entry of ADD_RATIO_PRESET_MENU) {
            const source = RATIO_PRESETS.find((preset) => preset.id === entry.preset)
            expect(source).toBeDefined()
            expect(entry.title).toContain('点击后在画布拖拽定落位与尺寸')
            expect(entry.title).toContain('Shift')
            if (source!.ratio === null) {
                expect(entry.title).toContain('任意宽高')
                expect(entry.title).toContain('临时锁 1:1')
            } else {
                const aspect = source!.ratio.w === source!.ratio.h ? '正方形' : source!.ratio.w > source!.ratio.h ? '横向' : '纵向'
                expect(entry.title).toContain(aspect)
                expect(entry.title).toContain('临时自由')
            }
        }
    })

    it('PANEL_ADD_MENU 面板完整序：文本预设插在「文本层」之后、比例六档平铺在「图片层」之后、模板表仍收尾', () => {
        expect(
            PANEL_ADD_MENU.map((entry) =>
                entry.kind === 'text-preset'
                    ? `text:${entry.preset}`
                    : entry.kind === 'ratio-preset'
                        ? `ratio:${entry.preset}`
                        : entry.kind === 'layer'
                            ? `layer:${entry.type}`
                            : 'template-table',
            ),
        ).toEqual([
            'layer:TextLayer',
            'text:heading',
            'text:subheading',
            'text:body',
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

    it('工具栏视图不受影响：ADD_LAYER_MENU 无任何预设档位（模板表同序收尾，template-table-drag-create 工单 03）', () => {
        expect(ADD_LAYER_MENU.filter((entry) => entry.kind === 'layer').map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
        // 模板表同序收尾（template-table-drag-create 工单 03）；类型面本就排除了
        // ratio-preset 档位，此处钉序列防视图收窄回层型子集
        expect(ADD_LAYER_MENU.map((entry) => entry.kind)).toEqual([
            'layer',
            'layer',
            'layer',
            'layer',
            'template-table',
        ])
    })
})
