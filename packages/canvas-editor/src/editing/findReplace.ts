/**
 * 查找替换的内核纯函数（canvas-web-find-replace 工单 01，CONTEXT「查找替换」词条）。
 *
 * 扫描（scanTextMatches）：沿视觉序遍历全画布未标记（expression === null）的
 * TextLayer.text，大小写敏感子串匹配——数组尾→头（hitTest 同门：视觉最上先命中）、
 * 表格递归下钻（rows/cells 尾→头、content 收尾），两形态都参与（V1 rows 格内容 +
 * 模板态 template.cells 格内容，template ⊕ rows 恰存其一）；隐藏层参与（隐藏是
 * 渲染排除语义非保护语义）；标记字段整字段豁免（字面前缀也不替换——改走双形态
 * 编辑器既有通道：解标→改→重标），QrCode.value / ImageLayer.src / 层名不参与。
 *
 * 替换（replaceHitsInDraft）：in-draft 助手按「原文快照命中」应用——命中（path +
 * 偏移对）在事务前一次算定，同字段多命中按偏移降序写入（前面的偏移不受后面长度
 * 变化影响）、替换产物不重扫（replacement 含查询串不死循环）；写值 text 直写 +
 * expression 保持 null（与文本编辑提交 updateData 同门——参与者本就未标记，
 * expression=null 副作用为零）。
 *
 * 全模块纯函数、无 DOM。
 */
import type { Canvas, Layer, TextLayer } from '@hankchen/canvas'
import type { Draft } from 'immer'

import { resolveLayer, type LayerPath } from '../shared/layerPath'

/** 一处命中：字段路径 + 文本偏移对 [start, end)（同字段多命中按序不重叠） */
export interface FindTextHit {
    readonly path: LayerPath
    readonly start: number
    readonly end: number
}

/** 单字段收集全部命中：非重叠推进（步过命中段，"aaa" 查 "aa" 得一处） */
function collectFieldHits(layer: TextLayer, path: LayerPath, query: string, out: FindTextHit[]): void {
    let from = 0
    for (;;) {
        const index = layer.text.indexOf(query, from)
        if (index === -1) return
        out.push({ path, start: index, end: index + query.length })
        from = index + query.length
    }
}

/** 视觉序下钻（与 hitTest 的 hitWalk 同一门：子层后画在上，尾→头遍历） */
function collectLayerHits(layer: Layer, path: LayerPath, query: string, out: FindTextHit[]): void {
    switch (layer.type) {
        case 'TableLayer':
            // 模板态格内容参与（V1 rows 格内容 + 模板格内容两形态；XOR 恰存其一）
            if (layer.template) {
                for (let i = layer.template.cells.length - 1; i >= 0; i -= 1) {
                    collectLayerHits(layer.template.cells[i]!, [...path, 'template', 'cells', i], query, out)
                }
            }
            for (let i = layer.rows.length - 1; i >= 0; i -= 1) {
                collectLayerHits(layer.rows[i]!, [...path, 'rows', i], query, out)
            }
            break
        case 'TableRowLayer':
            for (let i = layer.cells.length - 1; i >= 0; i -= 1) {
                collectLayerHits(layer.cells[i]!, [...path, 'cells', i], query, out)
            }
            break
        case 'TableRowTemplate':
            // 独立出现的行模板属非法 wire（契约禁止）；宽容扫过不崩溃
            for (let i = layer.cells.length - 1; i >= 0; i -= 1) {
                collectLayerHits(layer.cells[i]!, [...path, 'cells', i], query, out)
            }
            break
        case 'TableCellLayer':
            if (layer.content) collectLayerHits(layer.content, [...path, 'content'], query, out)
            break
        case 'TextLayer':
            // 仅未标记（纯静态）字段参与——豁免判定零成本：expression === null 即静态
            if (layer.expression === null) collectFieldHits(layer, path, query, out)
            break
        case 'ImageLayer':
        case 'QrCodeLayer':
            // src（资源引用语义）/ value（URL 语义）不参与
            break
    }
}

/**
 * 全画布静态文本扫描：query 为空串恒零命中（查找条初态空转）。返回视觉序命中
 * 列表（同字段多命中按偏移升序），每次从 doc 现算、不驻留（免失配维护）。
 */
export function scanTextMatches(doc: Canvas, query: string): FindTextHit[] {
    const hits: FindTextHit[] = []
    if (query === '') return hits
    for (let i = doc.layers.length - 1; i >= 0; i -= 1) {
        collectLayerHits(doc.layers[i]!, ['layers', i], query, hits)
    }
    return hits
}

/**
 * in-draft 替换：应用事务前算定的原文快照命中，返回实际应用处数。同字段命中
 * 聚组后按偏移降序写入；快照失效（路径不可解析/类型不符/偏移越界）的命中静默
 * 跳过（文档在快照后被结构编辑的防御分支）。零应用时不产生文档变更（immer 对
 * 同值写不记 patch，事务空转不进历史）。
 */
export function replaceHitsInDraft(
    draft: Draft<Canvas>,
    hits: readonly FindTextHit[],
    replacement: string,
): number {
    const byPath = new Map<string, FindTextHit[]>()
    for (const hit of hits) {
        const key = hit.path.map(String).join('\u0000')
        const group = byPath.get(key)
        if (group) group.push(hit)
        else byPath.set(key, [hit])
    }
    let applied = 0
    for (const group of byPath.values()) {
        const layer = resolveLayer(draft, group[0]!.path) as Draft<TextLayer> | null
        if (!layer || layer.type !== 'TextLayer') continue
        let text = layer.text
        for (const { start, end } of [...group].sort((a, b) => b.start - a.start)) {
            if (start < 0 || end > text.length || start > end) continue
            text = text.slice(0, start) + replacement + text.slice(end)
            applied += 1
        }
        layer.text = text
        layer.expression = null
    }
    return applied
}
