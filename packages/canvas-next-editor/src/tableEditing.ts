/**
 * 表格容器结构编辑的内核语义（工单 12）。
 *
 * 重建路径与 graph 解码同源：decode.ts 镜像的 addRow/addCell/addContentLayer
 * 容器副作用在这里以 draft 变换原语复现，编辑器的行/格增删移动一律经这些原语
 * 落库——「add 同步语义」与「打开 graph 的强制同步」由同一份规则描述：
 *
 * - addRow：行宽 := 表宽、autoWidth 关；
 * - addCell：行高取最高单元格（只增长不收缩），增长时固化（autoHeight 关）；
 * - addContentLayer：内容宽 := 格宽、autoWidth 关；格 auto 高 → 采纳内容动态高
 *   并固化（autoHeight 关），格固定高 → 压平内容高并关内容 autoHeight。
 *
 * 解码在每次打开时重断言这些耦合（行宽=表宽、内容宽=格宽、固定格内容高=格高、
 * 行高 ≥ 最高格），因此编辑器的字段写入（updateSpec）在表格子树按同一组规则
 * 收口（canonicalizeTableSyncInDraft）——凡解码会强同步的耦合，写入后立即重断言，
 * encode→decode 往返恒等在任何编辑序列后不破；解码不强求的（行高收缩）同样
 * 不重算，「先 add 后改尺寸不重算」的既有语义在重建路径下成立。
 *
 * 带内容的格在解码后恒为固定高（auto 标志被采纳语义固化），因此格的 autoHeight
 * 切换不是裸标志写：开 = 采纳内容动态高（autowrap 文本即「行数×行高+padding」）
 * 并固化，空格 = 置标志（解码对无内容的格保留该标志，往返恒等不受影响）。
 *
 * 全模块纯 draft 变换、无 DOM；与 layerPanel.ts（工单 10 根层/行重排）分立。
 */
import { layerHeight, lineHeightPx, textLines, type Canvas, type Layer, type TableCellLayer, type TableRowLayer, type TextLayoutPolicies } from '@hankchen/canvas-next'
import type { Draft } from 'immer'

import { pathsEqual, resolveLayer, type LayerPath } from './layerPath'
import { createDefaultLayer, moveGuard } from './layerPanel'

type DraftRow = Draft<TableRowLayer>
type DraftCell = Draft<TableCellLayer>
type DraftContent = Draft<Layer>

/**
 * resolveLayer 的 draft 断言形态：immer draft 结构上兼容只读领域类型，navigate
 * 的下降逻辑同一套；返回值按 draft 断言以解除 readonly（写入侧专用）。
 */
function resolveDraft(root: Draft<Canvas>, path: LayerPath): DraftContent | null {
    return resolveLayer(root, path) as DraftContent | null
}

/** 归一 -0（PHP 整数域无 -0） */
function normZero(value: number): number {
    return value === 0 ? 0 : value
}

/**
 * 内容层的动态高（采纳语义的目标高度）：带内容的格在规范文档里恒为固定高
 * （内容高已被压平、autoHeight 已固化），「采纳」必须按内容自身的排版参数重算
 * 动态高——TextLayer autowrap = 行数×行高+padding、单行 = 行高+padding（空文本
 * 只剩 padding）；其余类型走 layerHeight（QR 按宽正方形、其余声明高）。
 */
function contentDynamicHeight(content: DraftContent, policies?: TextLayoutPolicies): number {
    if (content.type === 'TextLayer') {
        const padHeight = normZero(Math.trunc(content.shape.padding.top + content.shape.padding.bottom))
        if (content.autowrap) {
            return lineHeightPx(content) * textLines(content, policies).length + padHeight
        }
        return content.text === '' ? padHeight : lineHeightPx(content) + padHeight
    }
    return layerHeight(content, policies)
}

/** addRow 副作用：行宽同步表宽并关 autoWidth */
export function syncRowWidthInDraft(row: DraftRow, tableWidth: number): void {
    row.shape.width = tableWidth
    row.shape.autoWidth = false
}

/** addCell 副作用：行高取最高单元格（只增长不收缩），增长时固化（关 autoHeight） */
export function growRowToCellInDraft(row: DraftRow, cellHeight: number): void {
    if (row.shape.height < cellHeight) {
        row.shape.height = cellHeight
        row.shape.autoHeight = false
    }
}

/**
 * addContentLayer 副作用：内容宽同步格宽并关 autoWidth；格 auto 高 → 采纳内容
 * 动态高并固化（关 autoHeight），格固定高 → 压平内容高并关内容 autoHeight。
 * layerHeight 消费文本策略注入缝（与绘制/命中同一套度量）。
 */
export function syncContentIntoCellInDraft(content: DraftContent, cell: DraftCell, policies?: TextLayoutPolicies): void {
    content.shape.width = cell.shape.width
    content.shape.autoWidth = false
    if (cell.shape.autoHeight) {
        cell.shape.height = contentDynamicHeight(content, policies)
        cell.shape.autoHeight = false
    } else {
        content.shape.height = cell.shape.height
        content.shape.autoHeight = false
    }
}

/** 行内最高单元格（layerHeight 语义，与解码 addCell 逐格比较同源）；空行 0 */
function maxCellHeight(row: DraftRow, policies?: TextLayoutPolicies): number {
    let max = 0
    for (const cell of row.cells) {
        const height = layerHeight(cell, policies)
        if (height > max) max = height
    }
    return max
}

/** 格所在行的「行高取最高格」维持（只增长不收缩）；行路径悬空静默跳过 */
function growRowOfCellInDraft(cellPath: LayerPath, cellHeight: number, root: Draft<Canvas>): void {
    const row = resolveDraft(root, cellPath.slice(0, -2))
    if (row && row.type === 'TableRowLayer') growRowToCellInDraft(row, cellHeight)
}

/** 缺省格 + 缺省文本内容的重建装配：格宽取末格宽（无格取 fallbackWidth）、内容同步、行高取最高格 */
function buildDefaultCellIntoRowInDraft(row: DraftRow, fallbackWidth: number): DraftCell {
    const cells = row.cells as DraftCell[]
    const cell = createDefaultLayer('TableCellLayer') as DraftCell
    cell.shape.width = cells.length > 0 ? cells[cells.length - 1]!.shape.width : fallbackWidth
    const content = createDefaultLayer('TextLayer') as DraftContent
    syncContentIntoCellInDraft(content, cell)
    cell.content = content
    growRowToCellInDraft(row, cell.shape.height)
    return cell
}

/**
 * 新增行（draft 原位变换）：缺省行 + 缺省格（带缺省文本内容）走完整重建路径——
 * 行宽=表宽（addRow）→ 内容宽=格宽、固定格压平内容高（addContentLayer）→
 * 行高取最高格（addCell）。首格宽取行宽（单格行铺满），后续格宽随末格（均齐
 * 直觉）。返回新行下标；路径无法解析到表返回 null。
 */
export function addTableRowInDraft(draft: Draft<Canvas>, tablePath: LayerPath): number | null {
    const table = resolveDraft(draft, tablePath)
    if (!table || table.type !== 'TableLayer') return null
    const rows = table.rows as DraftRow[]

    const row = createDefaultLayer('TableRowLayer') as DraftRow
    syncRowWidthInDraft(row, table.shape.width)
    const cell = buildDefaultCellIntoRowInDraft(row, row.shape.width)
    row.cells = [cell]
    rows.push(row)
    return rows.length - 1
}

/**
 * 新增单元格（draft 原位变换）：缺省格 + 缺省文本内容走重建路径（内容同步 + 行高
 * 取最高格），格宽取末格宽（首格取行宽）。返回新格下标；路径无法解析到行返回 null。
 */
export function addTableCellInDraft(draft: Draft<Canvas>, rowPath: LayerPath): number | null {
    const row = resolveDraft(draft, rowPath)
    if (!row || row.type !== 'TableRowLayer') return null
    const cells = row.cells as DraftCell[]
    const cell = buildDefaultCellIntoRowInDraft(row, row.shape.width)
    cells.push(cell)
    return cells.length - 1
}

/** 跨容器移动的重映射凭据：源容器纯删除 + 目标容器纯插入（from = 原长、to = 落点） */
export interface MovedSubtreeRef {
    /** 移动前子树根路径（选择/悬停重挂基准） */
    fromPath: LayerPath
    /** 移动后子树根路径 */
    toPath: LayerPath
    source: { containerPath: LayerPath; key: 'rows' | 'cells'; from: number; to: number }
    target: { containerPath: LayerPath; key: 'rows' | 'cells'; from: number; to: number }
}

/**
 * 同行格重排（draft 原位变换）：直接改 cells 数组序——容器内嵌套数组序语义，格的
 * priority 不参与（与 moveTableRow 同款 moveGuard 语义）。from/to 为格序号（格 0
 * 在视觉左端），to 为「insert-before 原始序号」落点 ∈ [0, cells.length]。返回
 * (from, to)（to 为插入后最终下标，供路径重映射）；null = 无变化/入参不合法。
 */
export function moveTableCellInDraft(
    draft: Draft<Canvas>,
    rowPath: LayerPath,
    fromCell: number,
    toCell: number,
): { from: number; to: number } | null {
    const row = resolveDraft(draft, rowPath)
    if (!row || row.type !== 'TableRowLayer') return null
    const cells = row.cells as DraftCell[]
    const reduced = moveGuard(cells.length, fromCell, toCell)
    if (reduced === null) return null

    const [moved] = cells.splice(fromCell, 1)
    cells.splice(reduced, 0, moved!)
    return { from: fromCell, to: reduced }
}

/**
 * 行跨表移动（draft 原位变换）：从源表摘除、插入目标表 toIndex 处，addRow 副作用
 * 复现（行宽同步目标表宽）。toIndex ∈ [0, 目标 rows.length]（insert-before 落点，
 * 不需摘除调整——目标容器不含被移行）。同表重排返回 null（moveTableRow 的
 * moveGuard 语义，调用方分流）。
 */
export function moveTableRowToTableInDraft(
    draft: Draft<Canvas>,
    rowPath: LayerPath,
    targetTablePath: LayerPath,
    toIndex: number,
): MovedSubtreeRef | null {
    const sourceTablePath = rowPath.slice(0, -2)
    if (pathsEqual(sourceTablePath, targetTablePath)) return null
    const from = rowPath[rowPath.length - 1]
    if (typeof from !== 'number') return null
    const sourceTable = resolveDraft(draft, sourceTablePath)
    const targetTable = resolveDraft(draft, targetTablePath)
    if (!sourceTable || !targetTable || sourceTable.type !== 'TableLayer' || targetTable.type !== 'TableLayer') {
        return null
    }
    if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex > targetTable.rows.length) return null

    const sourceRows = sourceTable.rows as DraftRow[]
    if (from >= sourceRows.length) return null
    const [movedRaw] = sourceRows.splice(from, 1)
    const moved = movedRaw as DraftRow
    syncRowWidthInDraft(moved, targetTable.shape.width)

    const targetRows = targetTable.rows as DraftRow[]
    const finalTo = Math.min(toIndex, targetRows.length)
    targetRows.splice(finalTo, 0, moved)

    return {
        fromPath: rowPath,
        toPath: [...targetTablePath, 'rows', finalTo],
        source: { containerPath: sourceTablePath, key: 'rows', from, to: from },
        // 目标容器是纯插入：remap 的 from 取插入前长度（该长度不受源删除影响）
        target: { containerPath: targetTablePath, key: 'rows', from: targetRows.length - 1, to: finalTo },
    }
}

/**
 * 格跨行移动（draft 原位变换）：从源行摘除、插入目标行 toIndex 处，addCell 副作用
 * 复现（目标行高取最高格）+ addContentLayer 副作用重断言（内容层归属随格，宽/高
 * 同步幂等）。toIndex ∈ [0, 目标 cells.length]（insert-before 落点，不需摘除调整）。
 * 同行重排返回 null（moveTableCellInDraft 的 moveGuard 语义，调用方分流）。
 */
export function moveTableCellToRowInDraft(
    draft: Draft<Canvas>,
    cellPath: LayerPath,
    targetRowPath: LayerPath,
    toIndex: number,
    policies?: TextLayoutPolicies,
): MovedSubtreeRef | null {
    const sourceRowPath = cellPath.slice(0, -2)
    if (pathsEqual(sourceRowPath, targetRowPath)) return null
    const from = cellPath[cellPath.length - 1]
    if (typeof from !== 'number') return null
    const sourceRow = resolveDraft(draft, sourceRowPath)
    const targetRow = resolveDraft(draft, targetRowPath)
    if (!sourceRow || !targetRow || sourceRow.type !== 'TableRowLayer' || targetRow.type !== 'TableRowLayer') {
        return null
    }
    if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex > targetRow.cells.length) return null

    const sourceCells = sourceRow.cells as DraftCell[]
    if (from >= sourceCells.length) return null
    const [movedRaw] = sourceCells.splice(from, 1)
    const moved = movedRaw as DraftCell
    growRowToCellInDraft(targetRow, moved.shape.height)
    if (moved.content !== null) {
        syncContentIntoCellInDraft(moved.content, moved, policies)
    }

    const targetCells = targetRow.cells as DraftCell[]
    const finalTo = Math.min(toIndex, targetCells.length)
    targetCells.splice(finalTo, 0, moved)

    return {
        fromPath: cellPath,
        toPath: [...targetRowPath, 'cells', finalTo],
        source: { containerPath: sourceRowPath, key: 'cells', from, to: from },
        target: { containerPath: targetRowPath, key: 'cells', from: targetCells.length - 1, to: finalTo },
    }
}

/**
 * 格 autoHeight 切换（draft 原位变换）：开且带内容 = 采纳内容动态高并固化
 * （解码对带内容的格恒归一为固定高，标志保留会破坏往返恒等）；开且空格 = 置
 * 标志并把声明高归零（解码对 auto 标志恒清零声明高，PHP setHeight('auto') 同门）；
 * 关 = 清标志。采纳可能增高，行高取最高格的解码不变量随之维持（只增长不收缩）。
 * 路径无法解析到格返回 false。
 */
export function setCellAutoHeightInDraft(
    draft: Draft<Canvas>,
    cellPath: LayerPath,
    on: boolean,
    policies?: TextLayoutPolicies,
): boolean {
    const cell = resolveDraft(draft, cellPath)
    if (!cell || cell.type !== 'TableCellLayer') return false

    if (on && cell.content !== null) {
        cell.shape.height = contentDynamicHeight(cell.content, policies)
        cell.shape.autoHeight = false
        // 固定格归一：内容高随采纳后的格高压平（解码强同步，往返恒等要求）
        syncContentIntoCellInDraft(cell.content, cell, policies)
    } else if (on) {
        cell.shape.height = 0
        cell.shape.autoHeight = true
    } else {
        cell.shape.autoHeight = false
    }

    growRowOfCellInDraft(cellPath, cell.shape.height, draft)
    return true
}

/**
 * 字段写入后的解码不变量重断言：解码在每次打开时强同步表格耦合，编辑器写入后
 * 立即重断言同一组关系（往返恒等的编辑器侧镜像）——
 * - 表：shape.width/autoWidth 写入 → 全部行宽重同步（行宽=表宽）；
 * - 行：行宽恒归表宽（强同步字段的写入被覆写）、行高只增长到最高格；
 * - 格：内容宽/高按 addContentLayer 重同步（auto 采纳 / 固定压平）、行高取最高格；
 * - 内容：归属格的同步重断言（隐藏字段的直写被压回）。
 * key = updateSpec 的图层内字段路径；非表格子树路径原样返回（零 patch）。
 */
export function canonicalizeTableSyncInDraft(
    draft: Draft<Canvas>,
    path: LayerPath,
    key: readonly string[],
    policies?: TextLayoutPolicies,
): void {
    // 内容层：尾段 'content'，归属格 = 去掉尾段
    if (path[path.length - 1] === 'content') {
        const cellPath = path.slice(0, -1)
        const cell = resolveDraft(draft, cellPath)
        if (!cell || cell.type !== 'TableCellLayer' || cell.content === null) return
        syncContentIntoCellInDraft(cell.content, cell, policies)
        growRowOfCellInDraft(cellPath, cell.shape.height, draft)
        return
    }

    const containerKey = path[path.length - 2]
    if (containerKey === 'rows') {
        const row = resolveDraft(draft, path)
        if (!row || row.type !== 'TableRowLayer') return
        const table = resolveDraft(draft, path.slice(0, -2))
        if (table && table.type === 'TableLayer') syncRowWidthInDraft(row, table.shape.width)
        // auto 标志的解码归一：声明高归零（在增长判定之前——增长会合法覆写高度并固化）
        if (row.shape.autoHeight) row.shape.height = 0
        growRowToCellInDraft(row, maxCellHeight(row, policies))
        return
    }

    if (containerKey === 'cells') {
        const cell = resolveDraft(draft, path)
        if (!cell || cell.type !== 'TableCellLayer') return
        if (cell.content !== null) syncContentIntoCellInDraft(cell.content, cell, policies)
        else if (cell.shape.autoHeight) cell.shape.height = 0
        growRowOfCellInDraft(path, cell.shape.height, draft)
        return
    }

    // 根层表：仅 shape.width/autoWidth 写入联动行宽（其余字段与行无耦合）
    if (path[0] === 'layers' && typeof path[1] === 'number' && key[0] === 'shape' && (key[1] === 'width' || key[1] === 'autoWidth')) {
        const layer = draft.layers[path[1]] as DraftContent | undefined
        if (!layer || layer.type !== 'TableLayer') return
        if (layer.shape.autoHeight) layer.shape.height = 0
        for (const row of layer.rows as DraftRow[]) syncRowWidthInDraft(row, layer.shape.width)
    }
}
