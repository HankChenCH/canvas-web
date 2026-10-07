/**
 * 资源物化状态的内核切片形态与图片层占位态判定（placeholder-padding-hint 工单 02）。
 *
 * 物化状态住内核 store 的 ui 分支（红线 3 的编辑器延伸：物化状态永不写 graph），
 * 由宿主从渲染端物化状态机的散列键切片桥接注入——整体替换、内容等短路。键取
 * 图片 src 原串：键反解（散列键 → src）在宿主桥完成，内核零散列依赖。
 *
 * 占位态判定是「padding 调了看不到像素变化」的内核权威面：图片层内容绘制发生在
 * drawImage 分支，凡 drawImage 被跳过的层 padding 与像素无关（排查记录
 * canvas-web/layer-padding-research.md 根因 3）。四种未绘制形态：
 * ① 表达式标记图片——设计态预览把 src 置 null（preview.ts 占位盒语义），编辑器最常见；
 * ② 静态空引用/物化未达 done——render 源引用 null 只画盒、后端查不到已物化位图
 *   只画盒（pending/failed 同族）；无记录 = 不可知，不假报（宿主未桥接不误报）；
 * ③ 声明尺寸为零的自适应图片（解码清零）与极端 padding——内容盒 ≤ 0，后端
 *   drawImage ≤0 防护恒跳过。判定取内容盒条件本身（忠实渲染面），auto 标志只是
 *   清零的常见来路（编辑器内打开 auto 不清零声明值，按标志判会误报）。
 *
 * 纯函数、零 DOM；QR/文本层占位不在本判定面（工单范围是图片层）。
 */
import { contentHeight, contentWidth } from '@hankchen/canvas-next'
import type { Layer } from '@hankchen/canvas-next'

/** 单条资源的物化态（与渲染端物化状态机的三态同构，宿主桥按值透传） */
export type ResourceStatus = 'pending' | 'done' | 'failed'

/**
 * 资源物化状态切片（store ui 分支 `resourceStatuses` 的形态）：key = 图片 src
 * 原串，value = 物化态。整体替换语义，只住会话态——不进历史、不写 graph、
 * wire 零键；openDocument 换文档重置（资源态描述当次文档）。
 */
export type ResourceStatusMap = Readonly<Record<string, ResourceStatus>>

/**
 * 图片层设计态内容未绘制（占位态）判定：命中即「当前层内容未绘制，padding 不
 * 影响预览」。非图片层恒 false；statuses 缺省/无记录时物化维度不参与（不可知
 * 不假报——headless 用法与未桥接宿主的静态可加载层不误报）。
 */
export function isImageContentUndrawn(layer: Layer, statuses?: ResourceStatusMap): boolean {
    if (layer.type !== 'ImageLayer') return false
    // ① 标记态文档 src 恒镜像表达式原文（非可物化引用），预览视图置空走占位盒
    if (layer.expression !== null) return true
    // ② 静态空引用：render 源引用 null 只画盒（未物化/未加载占位语义同族）
    if (layer.src === null) return true
    // ③ 内容盒 ≤ 0：后端 drawImage 的 ≤0 防护恒跳过（自适应解码清零/极端 padding）
    if (contentWidth(layer) <= 0 || contentHeight(layer) <= 0) return true
    // ② 物化维度：宿主桥接切片里该 src 未达 done（pending/failed = 内容未绘制）
    if (statuses !== undefined) {
        const status = statuses[layer.src]
        if (status !== undefined && status !== 'done') return true
    }
    return false
}
