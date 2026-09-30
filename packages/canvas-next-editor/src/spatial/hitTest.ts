/**
 * 命中测试纯函数（工单 06，spec「渲染与交互」）：
 * 从视觉最上层向下命中——图层数组尾（后画在上）→ 头线性遍历 + 矩形包含，
 * 表格递归下钻（格内容 → 格 → 行 → 表）。盒几何与渲染模板共用
 * （resolveLayerBox + resolveChildAt，与 walkLayer 同一套推进公式），
 * 负溢出（盒出画布）照常包含，不做空间索引（图元量级小）。
 */
import { resolveChildAt, resolveLayerBox, type Canvas, type Layer, type LayerBox, type TextLayoutPolicies } from '@hankchen/canvas-next'

import { isLockedPath, type LayerPath } from '../shared/layerPath'

/** 半开区间包含 [x, x+w) × [y, y+h)：相邻格边界恰好归一格，零尺寸不可命中 */
function contains(box: LayerBox, x: number, y: number): boolean {
    return box.width > 0
        && box.height > 0
        && x >= box.x
        && x < box.x + box.width
        && y >= box.y
        && y < box.y + box.height
}

/** 命中选项：过滤集合由调用方注入（内核 ui 分支只读投影，纯函数不自取状态） */
export interface HitTestOptions {
    /**
     * 锁定根层路径集合（canvas-web-layer-lock 工单 01）：锁定的根层整子树退出
     * 命中面、命中穿透下方层，与 visible 过滤同门；与底图豁免叠加时锁优先
     * （豁免只跳自身盒，锁整子树退出）。
     */
    readonly lockedPaths?: readonly LayerPath[]
}

/**
 * 全幅判定：底层自身盒 ⊇ 画布矩形（负溢出照算），与视口/缩放无关。
 * spec「渲染与交互」2026-09-27 拍板的底图豁免（Fabric backgroundImage 不入命中图、
 * Konva listening(false) 同构）：只作用于数组头根层——「数组按 priority 降序、
 * 头先画垫底」的叠放不变量决定了它是唯一的视觉垫底层。
 */
function coversCanvas(box: LayerBox, canvasWidth: number, canvasHeight: number): boolean {
    return box.x <= 0
        && box.y <= 0
        && box.x + box.width >= canvasWidth
        && box.y + box.height >= canvasHeight
}

function hitWalk(
    layer: Layer,
    path: LayerPath,
    box: LayerBox,
    x: number,
    y: number,
    policies?: TextLayoutPolicies,
    skipOwnBox = false,
): LayerPath | null {
    // 子层后画在上：先下钻（尾→头），都未中再试自身盒（次序不动——豁免只跳自身盒）
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

    return !skipOwnBox && contains(box, x, y) ? path : null
}

/**
 * 场景坐标命中：返回视觉最上被中图层的路径（未中返回 null）。
 * 隐藏根层（layer-panel-ux 工单 10）与锁定根层（canvas-web-layer-lock 工单 01）
 * 整子树退出命中面——渲染端整层跳过 / 锁定层只退交互面（渲染照常），不可见/
 * 被锁定即不可点选，命中穿透其下方的层。
 */
export function hitTest(
    canvas: Canvas,
    sceneX: number,
    sceneY: number,
    policies?: TextLayoutPolicies,
    options?: HitTestOptions,
): LayerPath | null {
    const lockedPaths = options?.lockedPaths
    for (let i = canvas.layers.length - 1; i >= 0; i -= 1) {
        const layer = canvas.layers[i]!
        if (layer.visible === false) continue
        const rootPath: LayerPath = ['layers', i]
        if (lockedPaths !== undefined && isLockedPath(rootPath, lockedPaths)) continue
        const box = resolveLayerBox(layer, 0, 0, canvas.width, canvas.height, policies)
        // 全幅底层豁免只跳过自身盒测试（不能对整层 continue）：全幅底表的行/格/格内容照常可命中
        const skipOwnBox = i === 0 && coversCanvas(box, canvas.width, canvas.height)
        const hit = hitWalk(layer, rootPath, box, sceneX, sceneY, policies, skipOwnBox)
        if (hit) return hit
    }
    return null
}
