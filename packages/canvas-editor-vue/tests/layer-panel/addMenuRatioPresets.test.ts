// @vitest-environment jsdom
/**
 * addMenu 比例预设二级单测（image-ratio-preset 工单 02 引入；canvas-web-preset-
 * submenu 工单 03 树形化，ADR 0021）：具名五档只属面板——挂「图片层」二级
 * children，形状后缀走底座 shortcut 灰字槽；free 档不入二级（「自由」不经预设
 * 进入——一级图片层本体即自由）；工具栏派生视图 ADD_LAYER_MENU 保持平铺不含档位。
 */
import { describe, expect, it } from 'vitest'

import { RATIO_PRESETS } from '@hankchen/canvas-editor'

import { ADD_LAYER_MENU, ADD_RATIO_PRESET_MENU, PANEL_ADD_MENU } from '../../src/layer-panel/addMenu'

describe('addMenu 比例预设二级（canvas-web-preset-submenu 工单 03 树形化）', () => {
    it('ADD_RATIO_PRESET_MENU 五档：具名档随内核 RATIO_PRESETS 序，label = 1:1/4:3/3:4/16:9/9:16；free 不入清单', () => {
        expect(ADD_RATIO_PRESET_MENU.map((entry) => entry.preset)).toEqual(
            RATIO_PRESETS.filter((preset) => preset.id !== 'free').map((preset) => preset.id),
        )
        expect(ADD_RATIO_PRESET_MENU.map((entry) => entry.label)).toEqual(['1:1', '4:3', '3:4', '16:9', '9:16'])
        expect(ADD_RATIO_PRESET_MENU.every((entry) => entry.kind === 'ratio-preset')).toBe(true)
    })

    it('形状后缀（shortcut 灰字槽）与 title 比例说明从内核 ratio 派生；Shift 临时自由提示随档', () => {
        for (const entry of ADD_RATIO_PRESET_MENU) {
            const source = RATIO_PRESETS.find((preset) => preset.id === entry.preset)
            expect(source).toBeDefined()
            const aspect = source!.ratio!.w === source!.ratio!.h ? '正方形' : source!.ratio!.w > source!.ratio!.h ? '横向' : '纵向'
            expect(entry.shortcut).toBe(aspect)
            expect(entry.title).toContain('点击后在画布拖拽定落位与尺寸')
            expect(entry.title).toContain('Shift')
            expect(entry.title).toContain('临时自由')
            expect(entry.title).toContain(aspect)
        }
    })

    it('自由档不入二级（ADR 0021「自由不经预设进入」）：PANEL_ADD_MENU 全树无 free 档', () => {
        expect(ADD_RATIO_PRESET_MENU.map((entry) => entry.preset)).not.toContain('free')
        for (const entry of PANEL_ADD_MENU) {
            if (entry.kind === 'layer' && entry.children !== undefined) {
                expect(entry.children.map((child) => child.preset)).not.toContain('free')
            }
        }
    })

    it('PANEL_ADD_MENU：五档挂「图片层」children（序 = 内核具名档序），不再平铺在一级', () => {
        const imageEntry = PANEL_ADD_MENU[1]
        if (imageEntry === undefined || imageEntry.kind !== 'layer' || imageEntry.type !== 'ImageLayer') {
            throw new Error('面板第 2 项应是图片层')
        }
        expect(imageEntry.children).toEqual(ADD_RATIO_PRESET_MENU)
        // 一级不再有档位项：5 行 = 层型 ×4 + 模板表
        expect(PANEL_ADD_MENU).toHaveLength(5)
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
