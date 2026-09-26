/**
 * @hankchen/canvas-next-editor headless 内核公共出口。
 *
 * src 按 session（会话门面/store/快捷键）→ spatial（视口几何/拾取/滚轮）→
 * editing（剪贴板/图层/表格/字体/上传）→ shared（layerPath 寻址原语）分层，
 * 下层禁止反向引用上层（dependency-cruiser 域隔离规则 editor-*-isolation 锁定）。
 * 内核只保留根 barrel 单出口：EditorSession 门面是宿主唯一 API，域目录是
 * 内部组织，不开子路径导出，避免宿主绕过门面拼装内核。
 * 红线：内核不依赖任何 UI 绑定层（Vue/React），无 DOM lib，测试全部在
 * Node 无 DOM 环境运行。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor' as const

export * from './session'
export * from './spatial'
export * from './editing'
export * from './shared'
// 领域常量与类型的公共再出口：绑定层（editor-vue）按红线不得直连 canvas-next，
// 字段描述注册表等消费面从这里取（工单 09 起）
export {
    ANCHORS,
    HORIZONTAL_ALIGNS,
    LAYER_TYPES,
    VERTICAL_ALIGNS,
    type Anchor,
    type Border,
    type BorderSide,
    type HorizontalAlign,
    type LayerType,
    type Padding,
    type VerticalAlign,
} from '@hankchen/canvas-next'
export type {
    Canvas,
    Layer,
    LayerBox,
    TableLayer,
    TableCellLayer,
    TableRowLayer,
    TextLayer,
} from '@hankchen/canvas-next'
// 纯函数的公共再出口：文本编辑 overlay 的字体族解析（工单 11）——与 loadCanvasFont
// 同一派生，编辑中 textarea 与内容层 canvas 呈现同一字体；绑定层经内核取用
export { canvasFontCssFamily } from '@hankchen/canvas-next-browser-renderer'
