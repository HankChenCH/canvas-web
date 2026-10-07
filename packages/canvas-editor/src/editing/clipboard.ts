/**
 * 剪贴板内核语义（工单 14）：复制/粘贴/创建副本的纯函数面。
 *
 * - 剪贴板是**会话级**（不碰 OS 剪贴板、不跨会话）：条目 = 选中层子树的深拷贝
 *   快照 + 复制时点的绝对盒（粘贴落位的基准）。graph 领域类型是纯 JSON 形态
 *   （往返恒等契约），深拷贝用 JSON 往返——与源文档树彻底断开引用，复制后的
 *   原件编辑不影响粘贴产物。
 * - 可复制类型 = 可落根层的类型（文/图/码/表）。行/格是容器内结构（数组序语义、
 *   priority 不参与根层排序），v1 粘贴统一落根层，故不可复制；格内容（文本/图片/
 *   码）可复制——粘贴出表成为根层。
 * - 粘贴落位（alt-drag-paste 工单 02 真原位）：目标盒左上 = 复制时点绝对盒 +
 *   偏移，按**根层语义**反解 position（锚点补偿用画布尺寸，见 pastePosition）——
 *   格内容的 position 是格内相对值，直接平移会落到画布左上；根层源在此式下退化
 *   为 position + 偏移。⌘V 粘贴偏移入参恒为零（重复粘贴同位叠放，递增偏移链已
 *   删）：dx=0 时根层源 position 恒等原位（offset 相消）、格内容源落其视觉位置；
 *   PASTE_OFFSET_PX 保留给 ⌘D/副本。z 序紧邻源层由消费面（editor.pasteFromClipboard
 *   解析 sourcePath）选择 insertRootLayerAdjacentInDraft / 退化置顶。
 * - 创建副本 = 复制态 + 固定一格偏移，**不覆盖剪贴板**（excalidraw 同款语义）；
 *   连续副本基于当前选中的副本链式偏移，天然不重叠。
 */

import { anchorOffset, type Anchor, type Canvas, type Layer, type LayerBox, type LayerType } from '@hankchen/canvas'

import { resolveLayer, type LayerPath } from '../shared/layerPath'

/** 粘贴/副本的位置偏移基数（场景像素，整数） */
export const PASTE_OFFSET_PX = 20

/** 可落根层的类型（= 可复制类型）：容器内的行/格除外 */
const ROOT_PASTEABLE_TYPES: ReadonlySet<LayerType> = new Set([
    'TextLayer',
    'ImageLayer',
    'QrCodeLayer',
    'TableLayer',
])

/** 类型是否可粘贴为根层（= 是否可复制） */
export function isRootPasteableType(type: LayerType): boolean {
    return ROOT_PASTEABLE_TYPES.has(type)
}

/**
 * 会话剪贴板条目（工单 14；alt-drag-paste 工单 02 收窄）：源子树深拷贝 + 复制
 * 时点绝对盒（粘贴落位基准，格内容的格内相对 position 据此换算画布绝对落位）+
 * 源路径（粘贴时紧邻插入的解析凭据；已删/悬空/属他文档失配退化置顶）。
 */
export interface ClipboardEntry {
    layer: Layer
    sourceBox: LayerBox
    sourcePath: LayerPath
}

/** 路径处图层是否可复制（可解析且类型可落根层）；剪贴板入口与菜单可用态共用 */
export function canCopyLayerAt(doc: Canvas, path: LayerPath): boolean {
    const layer = resolveLayer(doc, path)
    return layer !== null && isRootPasteableType(layer.type)
}

/**
 * 子树深拷贝：JSON 往返（领域类型纯 JSON 形态）。输入可能是 immer draft（复制
 * 发生在文档树读取时），JSON 序列化天然产出普通对象，与 draft/源树断开引用。
 */
export function cloneLayerSubtree<T extends Layer>(layer: T): T {
    return JSON.parse(JSON.stringify(layer)) as T
}

/**
 * 粘贴落位的 position 反解：目标盒左上 = 源绝对盒左上 + (dx, dy)，按根层语义
 * （父盒 = 画布）回推 position = 目标 − anchorOffset(锚点, 画布尺寸, 盒尺寸)。
 * 根层源退化为 position + 偏移（offset 相消）；格内容源把格内相对 position 换算
 * 成画布绝对落位——副本出现在源内容视觉位置附近而非画布左上。
 */
export function pastePosition(
    sourceBox: LayerBox,
    anchor: Anchor,
    docWidth: number,
    docHeight: number,
    dx: number,
    dy: number,
): { x: number; y: number } {
    const offset = anchorOffset(anchor, docWidth, docHeight, sourceBox.width, sourceBox.height)
    return { x: sourceBox.x + dx - offset.x, y: sourceBox.y + dy - offset.y }
}

/**
 * 粘贴产物准备：深拷贝 + 按源绝对盒反解根层 position（语义见 pastePosition）。
 * 锚点保持不变（副本忠实于源），盒尺寸用复制时点的布局结果（autoHeight 文本
 * 与副本的布局结果一致）。
 */
export function prepareRootPaste<T extends Layer>(
    layer: T,
    sourceBox: LayerBox,
    docWidth: number,
    docHeight: number,
    dx: number,
    dy: number,
): T {
    const copy = cloneLayerSubtree(layer)
    const position = pastePosition(sourceBox, copy.position.anchor, docWidth, docHeight, dx, dy)
    return { ...copy, position: { ...copy.position, ...position } } as T
}
