/// <reference lib="dom" />

/**
 * 物化状态标识（覆盖层）：pending → 灰叉（对角交叉占位）、failed → 红叉 + 红框
 * （失败态标识）。研究文档 §2.9 的落点是把标识画在覆盖层而非内容层——内容层保持
 * PHP 镜像语义（物化完成前只有背景/边框盒）。工单 05 的 gizmo 覆盖层建立后由
 * 编辑器管线接管调用，本函数只依赖文档与资源状态切片，编辑器/playground 通用。
 */
import { forEachLayerBox } from '@hankchen/canvas'
import type { Canvas as CanvasDoc } from '@hankchen/canvas'

import { resourceRefOf } from './materializer'
import type { ResourceState } from './materializer'

const PENDING_STROKE = 'rgba(100, 116, 139, 0.6)'
const FAILED_STROKE = '#ef4444'
const FAILED_LINE_WIDTH = 2

/** 在覆盖层上按资源状态画标识：failed 红叉+红框、pending 灰叉，done/无状态零笔画 */
export function drawResourceMarkers(
    ctx: CanvasRenderingContext2D,
    doc: CanvasDoc,
    state: ResourceState,
): void {
    forEachLayerBox(doc, (layer, box) => {
        const ref = resourceRefOf(layer)
        if (ref === null) return

        const entry = state[ref.key]
        if (!entry || entry.status === 'done') return

        if (entry.status === 'failed') {
            ctx.strokeStyle = FAILED_STROKE
            ctx.lineWidth = FAILED_LINE_WIDTH
            crossAt(ctx, box.x, box.y, box.width, box.height)
            // 红框内缩 1px，避免与图层自身边框叠线
            ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2)
        } else {
            ctx.strokeStyle = PENDING_STROKE
            ctx.lineWidth = 1
            crossAt(ctx, box.x, box.y, box.width, box.height)
        }
    })
}

/** 对角交叉：beginPath + 两条对角线 + stroke（笔画按调用序可录断言） */
function crossAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
): void {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + width, y + height)
    ctx.moveTo(x + width, y)
    ctx.lineTo(x, y + height)
    ctx.stroke()
}
