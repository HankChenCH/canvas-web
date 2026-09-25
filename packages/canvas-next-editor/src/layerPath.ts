/**
 * 选择身份 = 图层路径（工单 06）。
 *
 * graph 无 id 字段且往返恒等契约禁止私加（spec「内核（store 与历史）」），
 * 选中身份用「从画布根到图层的数组路径」表达，语法即 immer patch path 前缀：
 *
 *   ['layers', i]                                     根层
 *   ['layers', i, 'rows', j]                          表行
 *   ['layers', i, 'rows', j, 'cells', k]              单元格
 *   ['layers', i, 'rows', j, 'cells', k, 'content']   格内容层
 *
 * 于是「对选中层改字段」= path 拼上字段段（如 + ['position', 'x']）直接得到
 * patch path；选择态住 ui 分支（不进历史），文档写入一律经路径导航。
 * 全模块纯函数、无 DOM。
 */
import { layerHeight, layerWidth, resolveLayerBox, type Canvas, type Layer, type LayerBox, type TextLayoutPolicies } from '@hankchen/canvas-next'

/** 图层路径：patch path 前缀形态的只读数组（语法由 isLayerPath 校验） */
export type LayerPath = readonly (string | number)[]

/** 索引段必须是安全非负整数 */
function isIndexSegment(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** 结构校验（不触文档）：只回答「像不像一条图层路径」；越界由 resolveLayer 判定 */
export function isLayerPath(value: unknown): value is LayerPath {
    if (!Array.isArray(value) || value.length < 2) return false
    if (value[0] !== 'layers' || !isIndexSegment(value[1])) return false

    // 下降序列固定：rows → cells → content（可省前段，不可乱序/重复）
    const descent = ['rows', 'cells', 'content']
    for (let i = 2; i < value.length; i += 2) {
        const expected = descent[(i - 2) / 2]
        if (value[i] !== expected) return false
        if (expected === 'content') return i === value.length - 1
        if (!isIndexSegment(value[i + 1])) return false
    }
    return true
}

/** 路径值相等（选择态变更短路依赖它；引用比较对每次新造的数组无效） */
export function pathsEqual(a: LayerPath | null, b: LayerPath | null): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/** 沿路径导航（根可为 immer draft：同一套下降逻辑同时服务只读解析与事务写入） */
function navigate(root: unknown, path: LayerPath): unknown {
    // (属性名, 索引) 成对推进；尾段 'content' 无索引，落到内容层本身
    let current: unknown = root
    for (let i = 0; i < path.length; i += 2) {
        const container = current as Record<string, unknown> | null
        if (container === null || typeof container !== 'object') return null
        const key = path[i]
        if (typeof key !== 'string') return null
        current = container[key]
        if (current === null || current === undefined) return null
        if (i + 1 < path.length) {
            const list = current as readonly unknown[]
            const index = path[i + 1]
            if (!Array.isArray(list) || typeof index !== 'number') return null
            current = list[index]
            if (current === null || current === undefined) return null
        }
    }
    return current
}

/** 对文档解析路径：越界/形态与文档不符返回 null（doc 侧校验） */
export function resolveLayer(doc: Canvas, path: LayerPath): Layer | null {
    if (!isLayerPath(path)) return null
    const layer = navigate(doc, path)
    if (layer === null || typeof layer !== 'object' || !('type' in layer)) return null
    return layer as Layer
}

/**
 * 级联归属链（结构纯函数，无需文档）：格内容 → 格 → 行 → 表；根层无父级。
 * Escape 升级沿此链逐级取父，链尽即清空选择。
 */
export function selectionParentPath(path: LayerPath): LayerPath | null {
    if (path.length < 2) return null
    if (path[path.length - 1] === 'content') return path.slice(0, -1)
    return path.length > 2 ? path.slice(0, -2) : null
}

/**
 * 路径处图层的绝对盒（镜像 render.walkLayer 的下钻几何：行纵向累加、格横向累加、
 * 格内容与格同原点）。gizmo 选择框、命中测试、适应选区共用，保证与绘制不漂移。
 */
export function layerBoxByPath(
    doc: Canvas,
    path: LayerPath,
    policies?: TextLayoutPolicies,
): LayerBox | null {
    if (!isLayerPath(path)) return null

    const rootIndex = path[1] as number
    const root = doc.layers[rootIndex]
    if (root === undefined) return null
    let box = resolveLayerBox(root, 0, 0, doc.width, doc.height, policies)
    let layer: Layer = root

    // 逐段下钻：每段先按容器布局推进到目标孩子，再解孩子的盒
    for (let i = 2; i < path.length; i += 2) {
        const key = path[i]
        const index = path[i + 1] as number
        if (key === 'content') {
            if (layer.type !== 'TableCellLayer' || layer.content === null) return null
            layer = layer.content
            box = resolveLayerBox(layer, box.x, box.y, box.width, box.height, policies)
            break
        }

        const children: readonly Layer[] = key === 'rows' && layer.type === 'TableLayer'
            ? layer.rows
            : key === 'cells' && layer.type === 'TableRowLayer'
                ? layer.cells
                : []
        if (index >= children.length) return null

        // 与 walkLayer 同款推进：行按高累加 y，格按宽累加 x
        let originX = box.x
        let originY = box.y
        for (let c = 0; c <= index; c += 1) {
            const child = children[c]
            if (child === undefined) return null
            if (c === index) {
                layer = child
                box = resolveLayerBox(child, originX, originY, box.width, box.height, policies)
            } else if (key === 'rows') {
                originY += layerHeight(child, policies)
            } else {
                originX += layerWidth(child)
            }
        }
    }
    return box
}
