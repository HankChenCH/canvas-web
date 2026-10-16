/**
 * 图层面板「＋」新增菜单的数据面（工单 10/12 引入；drag-create 工单 03 起四类
 * 图层项 = 武装画拉；template-table-drag-create 工单 02 起模板表项 = 表单确认
 * 改武装）。editor-top-toolbar 工单 03 起从
 * LayerPanel.vue 抽出为独立模块：工具栏「＋插入▾」与面板＋同源消费（文案与
 * title 单点维护，改这里两处入口自动跟随）；template-table-drag-create 工单 03
 * 起模板表项同序收入工具栏派生视图（spec 决策 5：四图层项后收尾，点击 = 弹层
 * 表单 → 确认武装）。
 * 面板树形 IA（canvas-web-preset-submenu 工单 03，spec 决策 4 + ADR 0021）：
 * PANEL_ADD_MENU 平铺改树——一级 5 行与工具栏「＋插入▾」同构（ADD_MENU 恒等
 * 派生基座），文本层/图片层换装两段式条目挂预设二级（文本 3 档带字号后缀、
 * 图片具名 5 档带形状后缀，「自由」不经预设进入——一级图片层本体即自由）；
 * 二维码层/表格/模板表无 children。预设条目在此只定数据面（label/后缀/title/
 * 目验 dataAttrs 素材），run 分发与底座 DropdownMenuEntry 装配归消费面
 * （LayerPanel.vue）。
 */
import { RATIO_PRESETS, TEXT_PRESETS, type LayerType, type RatioPresetId, type TextPresetId } from '@hankchen/canvas-editor'

/** 新增菜单项（spec §2.1）：四类图层武装画拉（drag-create 工单 03）；模板表带
 *  rowsPath 必填表单。层型项不带 children——工具栏派生视图 ADD_LAYER_MENU 的
 *  类型面天然平铺（预设只属面板二级） */
export type AddMenuKind =
    | { kind: 'layer'; type: LayerType; label: string; title: string }
    | { kind: 'template-table'; label: string; title: string }

/** 文本预设子项（工单 03 树形化）：「文本层」二级条目数据面——档位说明灰字后缀
 *  走底座 shortcut 槽（字号「40号」式），分发（armLayerCreate 带 preset）归消费面 */
export type AddTextPresetKind = {
    kind: 'text-preset'
    preset: TextPresetId
    label: string
    /** 档位说明灰字后缀（底座 DropdownMenuItem.shortcut 同缝） */
    shortcut: string
    title: string
}

/** 比例预设子项（工单 03 树形化）：「图片层」二级条目数据面——形状说明灰字后缀
 *  （正方形/横向/纵向），free 档不入清单（ADR 0021「自由不经预设进入」） */
export type AddRatioPresetKind = {
    kind: 'ratio-preset'
    preset: RatioPresetId
    label: string
    /** 档位说明灰字后缀（底座 DropdownMenuItem.shortcut 同缝） */
    shortcut: string
    title: string
}

/** 面板树形条目（工单 03）：层型项可携预设二级 children（文本/图片两行），模板表
 *  沿 AddMenuKind 原形态（表单入口非预设宿主） */
export type PanelAddMenuEntry =
    | (Extract<AddMenuKind, { kind: 'layer' }> & { children?: readonly (AddTextPresetKind | AddRatioPresetKind)[] })
    | Extract<AddMenuKind, { kind: 'template-table' }>

export const ADD_MENU: readonly AddMenuKind[] = [
    { kind: 'layer', type: 'TextLayer', label: '文本层', title: '画拉建文本层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'ImageLayer', label: '图片层', title: '画拉建图片层（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'layer', type: 'QrCodeLayer', label: '二维码层', title: '画拉建二维码层（点击后在画布拖拽定落位与尺寸，恒方形，Esc 取消）' },
    { kind: 'layer', type: 'TableLayer', label: '表格', title: '画拉建表格（点击后在画布拖拽定落位与尺寸，Esc 取消）' },
    { kind: 'template-table', label: '模板表', title: '新增模板表（行模板 + 数据行展开）' },
]

/** 文本预设档位中文标签（text-defaults 工单 02）：档位 id 的 UI 文案映射 */
const TEXT_PRESET_LABELS: Record<TextPresetId, string> = { heading: '标题', subheading: '副标题', body: '正文' }

/** 文本预设三档（text-defaults 工单 02 引入，spec 决策 4）：从内核 TEXT_PRESETS
 *  派生（字号单一事实源，内核改档位文案自动跟随），v1 只定字号——字体缺口由
 *  新层样式槽补；后缀 = 档位字号（40号/28号/16号，同源自派生不抄写） */
export const ADD_TEXT_PRESET_MENU: readonly AddTextPresetKind[] = TEXT_PRESETS.map(({ id, fontSize }) => ({
    kind: 'text-preset' as const,
    preset: id,
    label: TEXT_PRESET_LABELS[id],
    shortcut: `${fontSize}号`,
    title: `画拉建${TEXT_PRESET_LABELS[id]}文本层（字号 ${fontSize}，点击后在画布拖拽定落位与尺寸，Esc 取消）`,
}))

/** 档位形状说明（image-ratio-preset 工单 02）：从内核 ratio 派生，比例改档自动跟随 */
function ratioAspectText(ratio: Readonly<{ w: number; h: number }> | null): string {
    if (ratio === null) return '任意宽高'
    if (ratio.w === ratio.h) return '正方形'
    return ratio.w > ratio.h ? '横向' : '纵向'
}

/** 比例预设五档（image-ratio-preset 工单 02 引入；工单 03 树形化收二级，ADR 0021）：
 *  具名档从内核 RATIO_PRESETS 派生（比例与顺序单一事实源）——free 档不入清单
 *  （「自由」不经预设进入，一级图片层本体即自由）；档位 id 即上屏文案，后缀 =
 *  形状说明（同源自派生）。title 带比例说明与画拉提示；Shift 手势瞬时反转随档位
 *  给反向提示（具名档按 Shift 临时自由） */
export const ADD_RATIO_PRESET_MENU: readonly AddRatioPresetKind[] = RATIO_PRESETS.flatMap(({ id, ratio }) =>
    id === 'free'
        ? []
        : [
              {
                  kind: 'ratio-preset' as const,
                  preset: id,
                  label: id,
                  shortcut: ratioAspectText(ratio),
                  title: `画拉建 ${id} 图片层（${ratioAspectText(ratio)}，画拉中按住 Shift 临时自由；点击后在画布拖拽定落位与尺寸，Esc 取消）`,
              },
          ],
)

/** 面板「＋」树形序（工单 03，spec 决策 4）：ADD_MENU 恒等派生基座上映射 children
 *  ——文本层挂文本预设三档、图片层挂比例具名五档，其余行原样（无二级）；一级
 *  与工具栏「＋插入▾」同构。工具栏派生视图 ADD_LAYER_MENU = ADD_MENU 平铺不变
 *  （预设只属面板二级） */
export const PANEL_ADD_MENU: readonly PanelAddMenuEntry[] = ADD_MENU.map((entry): PanelAddMenuEntry => {
    if (entry.kind !== 'layer') return entry
    if (entry.type === 'TextLayer') return { ...entry, children: ADD_TEXT_PRESET_MENU }
    if (entry.type === 'ImageLayer') return { ...entry, children: ADD_RATIO_PRESET_MENU }
    return entry
})

/** 层型项视图（工具栏「＋插入▾」消费，editor-top-toolbar 工单 03）：ADD_MENU 的
 *  四类图层项。template-table-drag-create 工单 03 起模板表项同序收入（spec 决策
 *  5，四图层项后收尾）——视图 = ADD_MENU 全量恒等派生，工具栏与面板一级同序同
 *  文案；分发差异（模板表项弹层表单、四图层项直接武装）归消费面（LayerPanel /
 *  宿主）；工具栏不加预设（spec 决策 5 豁免，类型面无 children 结构性保证） */
export const ADD_LAYER_MENU: readonly AddMenuKind[] = ADD_MENU
