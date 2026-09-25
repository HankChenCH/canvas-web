/**
 * 命中测试纯函数（工单 06，spec「渲染与交互」）：
 * 从视觉最上层向下命中——图层数组尾（后画在上）→ 头线性遍历 + 矩形包含，
 * 表格递归下钻（格内容 → 格 → 行 → 表）。盒几何与渲染模板共用
 * （resolveLayerBox），负溢出（盒出画布）照常包含，不做空间索引（图元量级小）。
 */
import {
    layerHeight,
    layerWidth,
    resolveLayerBox,
    type Canvas,
    type Layer,
    type LayerBox,
    type TextLayoutPolicies,
} from '@hankchen/canvas-next'

import type { LayerPath } from './layerPath'

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
    x: number,
    y: number,
    originX: number,
    originY: number,
    parentWidth: number,
    parentHeight: number,
    policies?: TextLayoutPolicies,
): LayerPath | null {
    const box = resolveLayerBox(layer, originX, originY, parentWidth, parentHeight, policies)

    // 子层后画在上：先下钻（尾→头），都未中再试自身盒
    switch (layer.type) {
        case 'TableLayer': {
            // 行纵向堆叠：先按绘制序前推各行的 y 原点，再倒序探测
            const rowOrigins: number[] = []
            let posy = box.y
            for (const row of layer.rows) {
                rowOrigins.push(posy)
                posy += layerHeight(row, policies)
            }
            for (let i = layer.rows.length - 1; i >= 0; i -= 1) {
                const hit = hitWalk(layer.rows[i]!, [...path, 'rows', i], x, y, box.x, rowOrigins[i]!, box.width, box.height, policies)
                if (hit) return hit
            }
            break
        }
        case 'TableRowLayer': {
            // 单元格横向排布：同款前推 x 原点后倒序探测
            const cellOrigins: number[] = []
            let posx = box.x
            for (const cell of layer.cells) {
                cellOrigins.push(posx)
                posx += layerWidth(cell)
            }
            for (let i = layer.cells.length - 1; i >= 0; i -= 1) {
                const hit = hitWalk(layer.cells[i]!, [...path, 'cells', i], x, y, cellOrigins[i]!, box.y, box.width, box.height, policies)
                if (hit) return hit
            }
            break
        }
        case 'TableCellLayer':
            // 内容层与单元格同原点，最上优先
            if (layer.content) {
                const hit = hitWalk(layer.content, [...path, 'content'], x, y, box.x, box.y, box.width, box.height, policies)
                if (hit) return hit
            }
            break
        case 'ImageLayer':
        case 'TextLayer':
        case 'QrCodeLayer':
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
        const hit = hitWalk(canvas.layers[i]!, ['layers', i], sceneX, sceneY, 0, 0, canvas.width, canvas.height, policies)
        if (hit) return hit
    }
    return null
}
