/**
 * 图层面板「＋」新增菜单的数据面（工单 10/12 引入；drag-create 工单 03 起四类
 * 图层项 = 武装画拉；template-table-drag-create 工单 02 起模板表项 = 表单确认
 * 改武装）。editor-top-toolbar 工单 03 起从
 * LayerPanel.vue 抽出为独立模块：工具栏「＋插入▾」与面板＋同源消费（文案与
 * title 单点维护，改这里两处入口自动跟随）；template-table-drag-create 工单 03
 * 起模板表项同序收入工具栏派生视图（spec 决策 5：四图层项后收尾，点击 = 弹层
 * 表单 → 确认武装）。
 */
import { RATIO_PRESETS, TEXT_PRESETS, type LayerType, type RatioPresetId, type TextPresetId } from '@hankchen/canvas-editor'

/** 新增菜单项（spec §2.1）：四类图层武装画拉（drag-create 工单 03）；模板表带 rowsPath 必填表单 */
export type AddMenuKind =
    | { kind: 'layer'; type: LayerType; label: string; title: string }
    | { kind: 'template-table'; label: string; title: string }

/** 文本预设项（text-defaults 工单 02，spec 决策 5）：面板专用入口——应用即写新层样式槽 + 武装画拉 */
export type AddTextPresetKind = { kind: 'text-preset'; preset: TextPresetId; label: string; title: string }

/** 比例预设项（image-ratio-preset 工单 02，spec 决策 2）：面板专用入口——应用即写建层比例槽 + 武装画拉 */
export type AddRatioPresetKind = { kind: 'ratio-preset'; preset: RatioPresetId; label: string; title: string }

export const ADD_MENU: readonly AddMenuKind[] = [
    { kind: 'layer', type: 'TextLayer', label: '文本层', title: '画拉建文本层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'ImageLayer', label: '图片层', title: '画拉建图片层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'QrCodeLayer', label: '二维码层', title: '画拉建二维码层（点击后在画布拖拽定落位与尺寸，恒方形，Esc 取消）' },
    { kind: 'layer', type: 'TableLayer', label: '表格', title: '画拉建表格（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'template-table', label: '模板表', title: '新增模板表（行模板 + 数据行展开）' },
]

/** 预设档位中文标签（text-defaults 工单 02）：档位 id 的 UI 文案映射 */
const TEXT_PRESET_LABELS: Record<TextPresetId, string> = { heading: '标题', subheading: '副标题', body: '正文' }

/** 文本预设三项（text-defaults 工单 02，spec 决策 4）：从内核 TEXT_PRESETS 派生
 *  （字号单一事实源，内核改档位文案自动跟随），v1 只定字号——字体缺口由新层样式槽补 */
export const ADD_TEXT_PRESET_MENU: readonly AddTextPresetKind[] = TEXT_PRESETS.map(({ id, fontSize }) => ({
    kind: 'text-preset' as const,
    preset: id,
    label: TEXT_PRESET_LABELS[id],
    title: `画拉建${TEXT_PRESET_LABELS[id]}文本层（字号 ${fontSize}，点击后在画布拖拽定落位与尺寸，Esc 取消）`,
}))

/** 比例档位中文标签（image-ratio-preset 工单 02）：档位 id 的 UI 文案映射 */
const RATIO_PRESET_LABELS: Record<RatioPresetId, string> = {
    free: '自由',
    '1:1': '1:1',
    '4:3': '4:3',
    '3:4': '3:4',
    '16:9': '16:9',
    '9:16': '9:16',
}

/** 档位形状说明（image-ratio-preset 工单 02）：从内核 ratio 派生，比例改档自动跟随 */
function ratioAspectText(ratio: Readonly<{ w: number; h: number }> | null): string {
    if (ratio === null) return '任意宽高'
    if (ratio.w === ratio.h) return '正方形'
    return ratio.w > ratio.h ? '横向' : '纵向'
}

/** 比例预设六档（image-ratio-preset 工单 02，spec 决策 2）：从内核 RATIO_PRESETS
 *  派生（比例与顺序单一事实源）。title 带比例说明与画拉提示；Shift 手势瞬时反转
 *  槽态随档位给反向提示——具名档按 Shift 临时自由、自由档按 Shift 临时钳 1:1 */
export const ADD_RATIO_PRESET_MENU: readonly AddRatioPresetKind[] = RATIO_PRESETS.map(({ id, ratio }) => ({
    kind: 'ratio-preset' as const,
    preset: id,
    label: RATIO_PRESET_LABELS[id],
    title:
        id === 'free'
            ? '画拉建自由比例图片层（任意宽高，画拉中按住 Shift 临时锁 1:1；点击后在画布拖拽定落位与尺寸，Esc 取消）'
            : `画拉建 ${id} 图片层（${ratioAspectText(ratio)}，画拉中按住 Shift 临时自由；点击后在画布拖拽定落位与尺寸，Esc 取消）`,
}))

/** 平铺插入助手（image-ratio-preset 工单 02 自文本预设插入收拢）：插在命中项之后 */
function insertAfter<T>(list: readonly T[], items: readonly T[], match: (entry: T) => boolean): readonly T[] {
    const index = list.findIndex(match)
    return [...list.slice(0, index + 1), ...items, ...list.slice(index + 1)]
}

const isLayerOfType = (type: LayerType) => (entry: AddMenuKind | AddTextPresetKind | AddRatioPresetKind) =>
    entry.kind === 'layer' && entry.type === type

/** 面板「＋」完整序（text-defaults 工单 02 + image-ratio-preset 工单 02，spec 决策 2/5）：
 *  文本预设三项插在「文本层」之后、比例六档平铺在「图片层」之后；工具栏派生视图
 *  ADD_LAYER_MENU 不含预设（预设只属面板） */
export const PANEL_ADD_MENU: readonly (AddMenuKind | AddTextPresetKind | AddRatioPresetKind)[] = insertAfter(
    insertAfter(ADD_MENU, ADD_TEXT_PRESET_MENU, isLayerOfType('TextLayer')),
    ADD_RATIO_PRESET_MENU,
    isLayerOfType('ImageLayer'),
)

/** 层型项视图（工具栏「＋插入▾」消费，editor-top-toolbar 工单 03）：ADD_MENU 的
 *  四类图层项。template-table-drag-create 工单 03 起模板表项同序收入（spec 决策
 *  5，四图层项后收尾）——视图 = ADD_MENU 全量恒等派生，工具栏与面板同序同文案；
 *  分发差异（模板表项弹层表单、四图层项直接武装）归消费面（LayerPanel / 宿主） */
export const ADD_LAYER_MENU: readonly AddMenuKind[] = ADD_MENU
