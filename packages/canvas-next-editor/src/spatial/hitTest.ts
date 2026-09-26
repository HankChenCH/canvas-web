/**
 * 命中测试纯函数（工单 06，spec「渲染与交互」）：
 * 从视觉最上层向下命中——图层数组尾（后画在上）→ 头线性遍历 + 矩形包含，
 * 表格递归下钻（格内容 → 格 → 行 → 表）。盒几何与渲染模板共用
 * （resolveLayerBox + resolveChildAt，与 walkLayer 同一套推进公式），
 * 负溢出（盒出画布）照常包含，不做空间索引（图元量级小）。
 */
import { resolveChildAt, resolveLayerBox, type Canvas, type Layer, type LayerBox, type TextLayoutPolicies } from '@hankchen/canvas-next'

import type { LayerPath } from '../shared/layerPath'

/** 半开区间包含 [x, x+w) × [y, y+h)：相邻格边界恰好归一格，零尺寸不可命中 */
function contains(box: LayerBox, x: number, y: number): boolean {
    return box.width > 0
        && box.height > 0
        && x >= box.x
        && x < box.x + box.width
        && y >= box.y
        && y < box.y + box.height
}

function hitWalk(
    layer: Layer,
    path: LayerPath,
    box: LayerBox,
    x: number,
    y: number,
    policies?: TextLayoutPolicies,
): LayerPath | null {
    // 子层后画在上：先下钻（尾→头），都未中再试自身盒
    switch (layer.type) {
        case 'TableLayer':
            for (let i = layer.rows.length - 1; i >= 0; i -= 1) {
                const child = resolveChildAt(layer, box, 'rows', i, policies)
                if (!child) continue
                const hit = hitWalk(child.layer, [...path, 'rows', i], child.box, x, y, policies)
                if (hit) return hit
            }
            break
        case 'TableRowLayer':
            for (let i = layer.cells.length - 1; i >= 0; i -= 1) {
                const child = resolveChildAt(layer, box, 'cells', i, policies)
                if (!child) continue
                const hit = hitWalk(child.layer, [...path, 'cells', i], child.box, x, y, policies)
                if (hit) return hit
            }
            break
        case 'TableCellLayer':
            // 内容层与单元格同原点，最上优先
            if (layer.content) {
                const child = resolveChildAt(layer, box, 'content', 0, policies)
                if (child) {
                    const hit = hitWalk(child.layer, [...path, 'content'], child.box, x, y, policies)
                    if (hit) return hit
                }
            }
            break
        case 'ImageLayer':
        case 'TextLayer':
        case 'QrCodeLayer':
        case 'TableRowTemplate':
            // 行模板子树不在 rows/cells/content 内，命中面天然为空（工票 02 穷举补臂）
            break
    }

    return contains(box, x, y) ? path : null
}

/** 场景坐标命中：返回视觉最上被中图层的路径（未中返回 null） */
export function hitTest(
    canvas: Canvas,
    sceneX: number,
    sceneY: number,
    policies?: TextLayoutPolicies,
): LayerPath | null {
    for (let i = canvas.layers.length - 1; i >= 0; i -= 1) {
        const layer = canvas.layers[i]!
        const box = resolveLayerBox(layer, 0, 0, canvas.width, canvas.height, policies)
        const hit = hitWalk(layer, ['layers', i], box, sceneX, sceneY, policies)
        if (hit) return hit
    }
    return null
}
