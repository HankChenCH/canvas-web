/**
 * 图层面板「＋」新增菜单的数据面（工单 10/12 引入；drag-create 工单 03 起四类
 * 图层项 = 武装画拉、模板表项保持表单直建）。editor-top-toolbar 工单 03 起从
 * LayerPanel.vue 抽出为独立模块：工具栏「＋插入▾」与面板＋同源消费（文案与
 * title 单点维护，改这里两处入口自动跟随），模板表项只属面板、不进工具栏。
 */
import type { LayerType } from '@hankchen/canvas-next-editor'

/** 新增菜单项（spec §2.1）：四类图层武装画拉（drag-create 工单 03）；模板表带 rowsPath 必填表单 */
export type AddMenuKind =
    | { kind: 'layer'; type: LayerType; label: string; title: string }
    | { kind: 'template-table'; label: string; title: string }

export const ADD_MENU: readonly AddMenuKind[] = [
    { kind: 'layer', type: 'TextLayer', label: '文本层', title: '画拉建文本层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'ImageLayer', label: '图片层', title: '画拉建图片层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'QrCodeLayer', label: '二维码层', title: '画拉建二维码层（点击后在画布拖拽定落位与尺寸，恒方形，Esc 取消）' },
    { kind: 'layer', type: 'TableLayer', label: '表格', title: '画拉建表格（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'template-table', label: '模板表', title: '新增模板表（行模板 + 数据行展开）' },
]

/** 层型项视图（工具栏「＋插入▾」消费，editor-top-toolbar 工单 03）：ADD_MENU 的
 *  四类图层项，模板表项不进工具栏 */
export const ADD_LAYER_MENU: readonly Extract<AddMenuKind, { kind: 'layer' }>[] = ADD_MENU.filter(
    (entry): entry is Extract<AddMenuKind, { kind: 'layer' }> => entry.kind === 'layer',
)
