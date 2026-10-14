/**
 * 图层字段权威写的 mergeKey 约定（属性面板工单 09 ∩ 编辑浮层工具条
 * edit-overlay-toolbar 工单 04 两域共用）：`sel:<路径点分>:<字段键点分>`。
 * 双入口同键是「连续操作（含跨入口交替）合并一步历史」的根基——格式必须
 * 逐字节一致，故收口 shared 单点，消费方不再各自拼串。
 */
import type { LayerPath } from '@hankchen/canvas-editor'

export function selectionFieldMergeKey(path: LayerPath, key: readonly string[]): string {
    return `sel:${path.join('.')}:${key.join('.')}`
}
