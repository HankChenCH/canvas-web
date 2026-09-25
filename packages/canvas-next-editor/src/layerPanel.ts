/**
 * 图层面板的内核语义（工单 10）。
 *
 * 顺序映射（spec「Vue 绑定与面板」拍板，防反直觉）：
 * - 渲染顺序 = graph.layers 数组序 = priority 降序（数组头先画垫底，越大越垫底）；
 * - 面板从上到下 = 数组逆序：面板顶 = 视觉最上层 = 数组尾 = 最小 priority。
 *
 * 两套重排语义分立：
 * - 根层重排走 priority 中点插值（保持「数组按 priority 降序」的契约语义，
 *   保存再打开顺序不变）；插到上下邻之间 → priority = ⌊(上邻 + 下邻) / 2⌋，
 *   置顶 = min − 1、置底 = max + 1；priority 恒为整数（wire 解码 intval 同门，
 *   小数会在保存→打开时漂移），无整数间隙/同值冲突时对全表做一次按视觉序的
 *   带间隙阶梯归一化重赋（patch 大，仅兜底）。
 * - 表格行重排直接改 rows 数组序（行/格/内容是嵌套数组序语义，绘制按序遍历，
 *   priority 字段在容器内不参与排序）。
 *
 * 全模块纯函数、无 DOM；draft 侧变换经 immer 事务落库，查询侧只读。
 */
import type { Canvas, Layer, LayerType, TableCellLayer, TableRowLayer } from '@hankchen/canvas-next'
import type { Draft } from 'immer'

import { isLayerPath, resolveLayer, type LayerPath } from './layerPath'

/** 图层在容器树里的角色（决定面板缩进与可拖动性） */
export type LayerOutlineRole = 'root' | 'row' | 'cell' | 'content'

/** 面板大纲节点：领域子树的纯投影（无文档写语义） */
export interface LayerOutlineNode {
    readonly type: LayerType
    readonly path: LayerPath
    readonly role: LayerOutlineRole
    readonly children: readonly LayerOutlineNode[]
}

/** 容器子层清单：type → (key, 孩子取法)；content 单叶 */
function childLists(layer: Layer): { key: 'rows' | 'cells' | 'content'; layers: readonly Layer[] }[] {
    switch (layer.type) {
        case 'TableLayer':
            return [{ key: 'rows', layers: layer.rows }]
        case 'TableRowLayer':
            return [{ key: 'cells', layers: layer.cells }]
        case 'TableCellLayer':
            return layer.content ? [{ key: 'content', layers: [layer.content] }] : []
        case 'ImageLayer':
        case 'TextLayer':
        case 'QrCodeLayer':
            return []
    }
}

function outlineWalk(layer: Layer, path: LayerPath, role: LayerOutlineRole): LayerOutlineNode {
    const children: LayerOutlineNode[] = []
    for (const { key, layers } of childLists(layer)) {
        // content 段无索引（路径语法 [..., 'cells', k, 'content']），其余 (key, index) 成对
        for (let i = 0; i < layers.length; i += 1) {
            const roleOfChild: LayerOutlineRole = key === 'rows' ? 'row' : key === 'cells' ? 'cell' : 'content'
            const childPath: LayerPath = key === 'content' ? [...path, 'content'] : [...path, key, i]
            children.push(outlineWalk(layers[i]!, childPath, roleOfChild))
        }
    }
    return { type: layer.type, path, role, children }
}

/**
 * 面板大纲：根层按视觉层级排列（数组逆序——面板顶部 = 视觉最上层 = 数组尾），
 * 表格内行/格/内容保持数组序（行 0 在视觉顶部、格 0 在左）。
 */
export function buildLayerOutline(doc: Canvas): readonly LayerOutlineNode[] {
    const roots: LayerOutlineNode[] = []
    for (let i = doc.layers.length - 1; i >= 0; i -= 1) {
        roots.push(outlineWalk(doc.layers[i]!, ['layers', i], 'root'))
    }
    return roots
}

// ---- 新增图层：编辑器缺省形态 ----

/**
 * 编辑器新建图层的缺省形态：可见尺寸（0×0 无法命中/抓取）、top-left 摆位、
 * 中性配色。与 wire 解码缺省是两回事（那是「手写 JSON 宽进」语义），这里是
 * 编辑器 UX 语义；priority 统一由 addRootLayer 按「置顶 min−1」赋值。
 */
export function createDefaultLayer(type: LayerType): Layer {
    const base = {
        priority: 0,
        shape: {
            width: 0,
            height: 0,
            autoWidth: false,
            autoHeight: false,
            lineHeight: 1.2,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            border: { top: null, bottom: null, left: null, right: null },
            backgroundColor: null,
        },
        align: { horizontal: 'left', vertical: 'top' } as const,
        position: { anchor: 'top-left', x: 0, y: 0 } as const,
    }
    switch (type) {
        case 'TextLayer':
            return {
                ...base,
                type,
                shape: { ...base.shape, width: 200, height: 60 },
                text: '文本',
                font: '',
                fontSize: 24,
                fontColor: '#111827',
                angle: 0,
                autowrap: false,
            }
        case 'ImageLayer':
            return { ...base, type, shape: { ...base.shape, width: 200, height: 150 }, src: null }
        case 'QrCodeLayer':
            return { ...base, type, shape: { ...base.shape, width: 120, height: 120 }, value: 'canvas-web' }
        case 'TableLayer':
            return { ...base, type, shape: { ...base.shape, width: 400, height: 120 }, rows: [] }
        case 'TableRowLayer':
            return { ...base, type, shape: { ...base.shape, width: 400, height: 60 }, cells: [] }
        case 'TableCellLayer':
            return { ...base, type, shape: { ...base.shape, width: 200, height: 60 }, content: null }
    }
}

// ---- draft 侧结构变换（EditorSession 的 action 在 transact 内调用） ----

/**
 * 「insert-before 原始序号 to」移动的公共守卫与落点折算：from/to 须为安全整数、
 * from ∈ [0, n)、to ∈ [0, n]；to ∈ {from, from+1}（原位/相邻落点）为无操作。
 * 返回摘除自身后的插入下标；null = 无操作（n < 2 时任何入参都落入无操作集）。
 * 工单 12 的同行格重排复用同一守卫（与行重排同款语义）。
 */
export function moveGuard(n: number, from: number, to: number): number | null {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null
    if (from < 0 || from >= n || to < 0 || to > n) return null
    if (to === from || to === from + 1) return null
    return to <= from ? to : to - 1
}

/**
 * 根层重排（draft 原位变换）：面板坐标（0 = 视觉最上）折算数组坐标做 splice，
 * 再对移动层做 priority 中点插值。from 为被拖面板序号，to 为「insert-before
 * 原始面板序号」落点（∈ [0, N]；to = N 即面板底）；to ∈ {from, from+1} 或越界
 * 为无操作。数组序全程保持 priority 降序（渲染/解码同源的不变量）。
 * 返回移动的 (from, to) 数组下标（供选择路径重映射）；null = 无变化。
 */
export function moveRootLayerInDraft(
    draft: Draft<Canvas>,
    fromPanel: number,
    toPanel: number,
): { from: number; to: number } | null {
    const layers = draft.layers
    const n = layers.length
    // 面板坐标 0 = 视觉最上 = 数组尾：数组下标 = n − 1 − 面板序号（含摘除后的落点折算）
    const reduced = moveGuard(n, fromPanel, toPanel)
    if (reduced === null) return null
    const arrFrom = n - 1 - fromPanel
    const arrTo = n - 1 - reduced

    const [movedRaw] = layers.splice(arrFrom, 1)
    const moved = movedRaw as Draft<Layer>
    layers.splice(arrTo, 0, moved)

    // 插值：落点的下邻（数组左，视觉垫底侧，priority 更大）/上邻（数组右，视觉最上侧，更小）。
    // priority 必须保持整数——wire 解码按 PHP intval 语义取整，小数 priority 在
    // 保存→打开时值漂移、往返恒等即破（工单 13）：中间落点只在「下邻−上邻 ≥ 2」
    // （存在整数间隙）时取整数中点；置顶/置底恒为整数（max+1 / min−1）。
    const below = arrTo > 0 ? layers[arrTo - 1]! : null
    const above = arrTo < n - 1 ? layers[arrTo + 1]! : null
    let priority: number | null = null
    if (below !== null && above !== null) {
        if (below.priority - above.priority >= 2) {
            priority = Math.floor((below.priority + above.priority) / 2)
        }
    } else if (below !== null) {
        priority = below.priority - 1 // 数组尾 = 视觉最上：min − 1
    } else {
        // n ≥ 2 保证落点至少一侧有邻居：无下邻即数组头，上邻必在
        priority = above!.priority + 1 // 数组头 = 视觉垫底：max + 1
    }

    // 无整数间隙（相邻整数/同值，含搬入同值邻居之间）→ 全表归一化兜底：
    // 按视觉序带间隙重赋，恢复整数间隔并为后续插值留出余量
    if (priority !== null) {
        moved.priority = priority
    } else {
        normalizeRootPriorities(layers)
    }
    return { from: arrFrom, to: arrTo }
}

/**
 * 全表归一化：按数组序（头=垫底）重赋带间隙的整数阶梯（(N−1−i) × GAP），
 * 恢复整数间隔并为后续中点插值留余量；仅作「无整数间隙」时的兜底。
 */
const ROOT_PRIORITY_GAP = 1024

function normalizeRootPriorities(layers: Draft<Layer>[]): void {
    for (let i = 0; i < layers.length; i += 1) {
        layers[i]!.priority = (layers.length - 1 - i) * ROOT_PRIORITY_GAP
    }
}

/**
 * 表格行重排（draft 原位变换）：直接改 rows 数组序——容器内是嵌套数组序语义，
 * 行的 priority 不参与排序、不插值（与根层重排语义分立）。from/to 为行序号
 * （行 0 在视觉顶部），to 为「insert-before 原始序号」落点 ∈ [0, rows.length]。
 * 返回 (from, to)（to 为插入后最终下标，供路径重映射）；null = 无变化/入参不合法。
 */
export function moveTableRowInDraft(
    draft: Draft<Canvas>,
    tablePath: LayerPath,
    fromRow: number,
    toRow: number,
): { from: number; to: number } | null {
    const table = resolveLayer(draft, tablePath)
    if (!table || table.type !== 'TableLayer') return null
    const rows = table.rows as Draft<TableRowLayer>[]
    const reduced = moveGuard(rows.length, fromRow, toRow)
    if (reduced === null) return null

    const [moved] = rows.splice(fromRow, 1)
    rows.splice(reduced, 0, moved!)
    return { from: fromRow, to: reduced }
}

/**
 * 新增根层（draft 原位变换）：工厂缺省形态 + priority = min − 1（空画布取 0），
 * push 到数组尾（视觉最上层）。返回新层的数组下标。
 */
export function addRootLayerInDraft(draft: Draft<Canvas>, type: LayerType): number {
    let min = Number.POSITIVE_INFINITY
    for (const existing of draft.layers) min = Math.min(min, existing.priority)
    const layer = createDefaultLayer(type) as Draft<Layer>
    layer.priority = Number.isFinite(min) ? min - 1 : 0
    draft.layers.push(layer)
    return draft.layers.length - 1
}

/** 删除定位：list = 容器列表 splice（roots/rows/cells），content = 格内容置 null */
export type DeletedLayerRef =
    | { kind: 'list'; containerPath: LayerPath; key: 'layers' | 'rows' | 'cells'; index: number }
    | { kind: 'content'; path: LayerPath }

/**
 * 删除图层（draft 原位变换）：根层连子树整删、行/格走列表 splice、格内容置 null
 * （镜像 impl 研究 §2.8「条目操作」）。路径越界/形态不符/内容已空返回 null（无操作）。
 */
export function deleteLayerInDraft(draft: Draft<Canvas>, path: LayerPath): DeletedLayerRef | null {
    if (!isLayerPath(path)) return null

    // 格内容：content 段无索引，父 cell 路径 = 去掉尾段
    if (path[path.length - 1] === 'content') {
        const cell = resolveLayer(draft, path.slice(0, -1))
        if (!cell || cell.type !== 'TableCellLayer' || cell.content === null) return null
        ;(cell as Draft<TableCellLayer>).content = null
        return { kind: 'content', path }
    }

    // 根层：路径 ['layers', i]，尾段即数字下标
    if (path.length === 2) {
        const index = path[1]
        const layers = draft.layers as Draft<Layer>[]
        if (typeof index !== 'number' || index >= layers.length) return null
        layers.splice(index, 1)
        return { kind: 'list', containerPath: [], key: 'layers', index }
    }

    // 行/格：路径 (key, index) 成对收尾——尾段是下标，倒数第二段是键 'rows' | 'cells'
    const index = path[path.length - 1]
    const key = path[path.length - 2]
    if (typeof index !== 'number' || (key !== 'rows' && key !== 'cells')) return null

    if (key === 'rows') {
        const table = resolveLayer(draft, path.slice(0, -2))
        if (!table || table.type !== 'TableLayer' || index >= table.rows.length) return null
        ;(table.rows as Draft<TableRowLayer>[]).splice(index, 1)
        return { kind: 'list', containerPath: path.slice(0, -2), key: 'rows', index }
    }
    const row = resolveLayer(draft, path.slice(0, -2))
    if (!row || row.type !== 'TableRowLayer' || index >= row.cells.length) return null
    ;(row.cells as Draft<TableCellLayer>[]).splice(index, 1)
    return { kind: 'list', containerPath: path.slice(0, -2), key: 'cells', index }
}
