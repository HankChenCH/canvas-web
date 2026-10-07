/**
 * 图层路径的展示格式化（工单 14 状态栏）：['layers', 1, 'rows', 0, 'cells', 2,
 * 'content'] → 「图层 1 · 行 0 · 格 2 · 格内容」。纯字符串投影（无文档依赖、
 * 无 DOM），playground 的选中读数与 StatusBar 共用同一格式。
 * 模板子树（spec §2.2）：template 段无下标 → 「行模板」；替身收尾即止于行模板。
 */
import type { LayerPath } from '@hankchen/canvas-editor'

export function formatLayerPath(path: LayerPath): string {
    let label = `图层 ${String(path[1])}`
    for (let i = 2; i < path.length; i += 1) {
        const key = path[i]
        if (key === 'template') {
            label += ' · 行模板'
            continue
        }
        if (key === 'rows') {
            label += ` · 行 ${String(path[i + 1])}`
            i += 1
        } else if (key === 'cells') {
            label += ` · 格 ${String(path[i + 1])}`
            i += 1
        } else if (key === 'content') {
            label += ' · 格内容'
        }
    }
    return label
}
