// @vitest-environment jsdom
/**
 * addMenu 数据面单测（editor-top-toolbar 工单 03；template-table-drag-create
 * 工单 03 收入模板表项）：ADD_MENU 从 LayerPanel.vue 抽出后，面板＋与工具栏
 * 「＋插入▾」共用的同源契约在此钉住——层型项四类（type 与注册表武装动作映射
 * 消费面一致）、模板表项收尾；ADD_LAYER_MENU 派生视图五项同序（工具栏同序收入
 * 模板表，spec 决策 5），顺序与 title 随 ADD_MENU 单点维护。
 * 面板树形 IA（canvas-web-preset-submenu 工单 03，spec 决策 4）：PANEL_ADD_MENU
 * 平铺改树——一级 5 行与工具栏同构，文本层/图片层挂预设二级，其余行无 children。
 * 带档名分发提示句 armLayerCreatePresetHint（评审整改 F1 自 shared/shortcutsHelp
 * 迁入——面板菜单文案面）的句式断言随迁此侧。
 */
import { describe, expect, it } from 'vitest'

import { ADD_LAYER_MENU, ADD_MENU, PANEL_ADD_MENU, armLayerCreatePresetHint } from '../../src/layer-panel/addMenu'

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

describe('addMenu：面板树形 IA（canvas-web-preset-submenu 工单 03，spec 决策 4）', () => {
    /** 层型项取用（谓词窄化出 children 可选形态；序错即抛） */
    function layerEntryAt(index: number): { type: string; children?: readonly unknown[] } {
        const entry = PANEL_ADD_MENU[index]
        if (entry === undefined || entry.kind !== 'layer') throw new Error(`面板第 ${index} 项不是层型项`)
        return entry
    }

    it('一级 5 行与工具栏「＋插入▾」同构：文本层/图片层/二维码层/表格/模板表（ADD_MENU 恒等派生基座）', () => {
        expect(PANEL_ADD_MENU.map((entry) => entry.kind)).toEqual([
            'layer',
            'layer',
            'layer',
            'layer',
            'template-table',
        ])
        expect(PANEL_ADD_MENU.filter((entry) => entry.kind === 'layer').map((entry) => entry.type)).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
    })

    it('children 只挂文本层（3 档）与图片层（5 档）；二维码层/表格无 children（模板表形态本无此字段）', () => {
        expect(layerEntryAt(0).type).toBe('TextLayer')
        expect(layerEntryAt(0).children).toHaveLength(3)
        expect(layerEntryAt(1).type).toBe('ImageLayer')
        expect(layerEntryAt(1).children).toHaveLength(5)
        expect(layerEntryAt(2).type).toBe('QrCodeLayer')
        expect(layerEntryAt(2).children).toBeUndefined()
        expect(layerEntryAt(3).type).toBe('TableLayer')
        expect(layerEntryAt(3).children).toBeUndefined()
        // 二维码/表格无预设（spec 决策 5 豁免面）；模板表是表单入口非预设宿主
        const templateTable = PANEL_ADD_MENU[4]
        expect(templateTable?.kind).toBe('template-table')
    })

    it('工具栏豁免（类型面保证）：ADD_LAYER_MENU 平铺无 children——预设只属面板二级', () => {
        // AddMenuKind 无 children 字段，恒等派生结构性免预设；此处钉运行时面防误挂
        for (const entry of ADD_LAYER_MENU) {
            expect('children' in entry).toBe(false)
        }
    })
})

describe('armLayerCreatePresetHint：武装提示·带档变体（canvas-web-preset-submenu 工单 03，评审整改 F1 自 shared 迁入）', () => {
    it('「画拉建{层型}（{档名}）」句式 + 现句尾：档名入句、操作指引保留（尾句复用 shared ARM_LAYER_CREATE_HINT）', () => {
        expect(armLayerCreatePresetHint('图片层', '1:1')).toBe('画拉建图片层（1:1），画拉或点击落层，Esc 取消')
        expect(armLayerCreatePresetHint('文本层', '标题')).toBe('画拉建文本层（标题），画拉或点击落层，Esc 取消')
    })
})
