/**
 * useLayerPanel：图层面板的响应式桥（工单 10）。usePropertyPanel 同款模式——
 * shallowRef 整体替换（禁深度 reactive 红线）、订阅随 effect scope 注销。
 *
 * - outline：面板大纲（内核 buildLayerOutline 的 computed 投影：根层逆序 =
 *   视觉顶在先，表格行/格保持数组序）。文档任意变更重算（图元量级小，O(n) 可忽略）。
 * - selection/hovered/renaming：与画布命中共享同一 ui 分支——面板点选与画布点选
 *   同源，面板行高亮即画布 gizmo 选中态的镜像；renaming 是行内重命名会话
 *   （工单 09，beginRename/commitRename 漏斗在内核）。
 * - outline 的 locked 投影入参 = ui.lockedPaths（canvas-web-layer-lock 工单 02）：
 *   锁定态住 ui 分支，经订阅随锁定/解锁实时喂进内核纯投影。
 * - 拖放落点判定的纯函数面（isUpperHalf/dropTargetIndex）随桥导出供单测。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import {
    buildLayerOutline,
    type Canvas,
    type LayerOutlineNode,
    type EditorSession,
    type LayerPath,
} from '@hankchen/canvas-next-editor'

export interface LayerPanelBinding {
    readonly outline: ComputedRef<readonly LayerOutlineNode[]>
    readonly selection: ComputedRef<LayerPath | null>
    readonly hovered: ComputedRef<LayerPath | null>
    /** 重命名会话（工单 09）：正在行内改名的根层路径；null = 非编辑态 */
    readonly renaming: ComputedRef<LayerPath | null>
}

export function useLayerPanel(editor: EditorSession): LayerPanelBinding {
    const doc = shallowRef<Canvas | null>(editor.store.doc)
    const selection = shallowRef<LayerPath | null>(editor.store.ui.selection)
    const hovered = shallowRef<LayerPath | null>(editor.store.ui.hovered)
    const renaming = shallowRef<LayerPath | null>(editor.store.ui.renaming)
    // 锁定集合（canvas-web-layer-lock 工单 02）：outline 的 locked 投影入参——
    // ui 分支态经这里喂进内核纯投影，锁定/解锁后大纲行立即翻转
    const lockedPaths = shallowRef<readonly LayerPath[]>(editor.store.ui.lockedPaths)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') doc.value = editor.store.doc
        else if (change.branch === 'selection') selection.value = editor.store.ui.selection
        else if (change.branch === 'hovered') hovered.value = editor.store.ui.hovered
        else if (change.branch === 'renaming') renaming.value = editor.store.ui.renaming
        else if (change.branch === 'lockedPaths') lockedPaths.value = editor.store.ui.lockedPaths
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    const outline = computed(() =>
        doc.value ? buildLayerOutline(doc.value, lockedPaths.value) : [],
    )

    return {
        outline,
        selection: computed(() => selection.value),
        hovered: computed(() => hovered.value),
        renaming: computed(() => renaming.value),
    }
}

/** dragover 落点判定：指针纵移落在目标行上半吗（行高退化时视为下半——jsdom/隐藏行兜底） */
export function isUpperHalf(offsetY: number, rowHeight: number): boolean {
    return rowHeight > 0 && offsetY < rowHeight / 2
}
