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
 *   ['layers', i, 'template', 'cells', k]             行模板格（无下标的 template 段）
 *   ['layers', i, 'template']                         行模板替身（表级，spec §2.2）
 *
 * 于是「对选中层改字段」= path 拼上字段段（如 + ['position', 'x']）直接得到
 * patch path；选择态住 ui 分支（不进历史），文档写入一律经路径导航。
 * 全模块纯函数、无 DOM。
 */
import { resolveChildAt, resolveLayerBox, type Canvas, type Layer, type LayerBox, type TextLayoutPolicies } from '@hankchen/canvas-next'

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

    // 下降序列固定：rows → cells → content（可省前段，不可乱序/重复）。行模板
    // 子树以无下标的 'template' 段替代 rows 段（spec §2.2）：template 可后接
    // cells 下钻（预览行选中），也可作路径收尾——收尾形态是**行模板替身路径**
    // （大纲模板子树选中/容器解析用），不是普通选择身份。
    const descent = ['rows', 'cells', 'content']
    let stage = 0
    let i = 2
    while (i < value.length) {
        const key = value[i]
        if (stage === 0 && key === 'template') {
            if (i === value.length - 1) return true
            if (value[i + 1] !== 'cells') return false
            stage = 1
            i += 1
            continue
        }
        const expected = descent[stage]
        if (key !== expected) return false
        if (expected === 'content') return i === value.length - 1
        if (!isIndexSegment(value[i + 1])) return false
        stage += 1
        i += 2
    }
    return true
}

/** 路径是否落在行模板子树内（含 'template' 段；选中/属性写入的模板态分流用） */
export function isTemplateSubtreePath(path: LayerPath): boolean {
    return path.includes('template')
}

/**
 * 根层路径判定（工单 14）：置顶/置底等 priority 语义只作用于根层（容器内行/格
 * 是数组序语义，priority 不参与排序）——右键菜单与快捷键入口据此裁剪动作可用态。
 */
export function isRootLayerPath(path: LayerPath): boolean {
    return isLayerPath(path) && path.length === 2
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

/**
 * 前缀判定：path 落在 prefix 子树内（含相等）。跨容器移动后重挂选择路径用
 * （工单 12）——子树整体换容器时，移动前捕获的路径按前缀重挂到新位置。
 */
export function pathStartsWith(path: LayerPath, prefix: LayerPath): boolean {
    if (path.length < prefix.length) return false
    for (let i = 0; i < prefix.length; i += 1) {
        if (path[i] !== prefix[i]) return false
    }
    return true
}

/** 沿路径导航（根可为 immer draft：同一套下降逻辑同时服务只读解析与事务写入） */
function navigate(root: unknown, path: LayerPath): unknown {
    // (属性名, 索引) 成对推进；'template' 与尾段 'content' 无索引，落到节点本身
    let current: unknown = root
    let i = 0
    while (i < path.length) {
        const container = current as Record<string, unknown> | null
        if (container === null || typeof container !== 'object') return null
        const key = path[i]
        if (typeof key !== 'string') return null
        current = container[key]
        if (current === null || current === undefined) return null
        if (key === 'template') {
            i += 1
            continue
        }
        if (i + 1 >= path.length) break
        const list = current as readonly unknown[]
        const index = path[i + 1]
        if (!Array.isArray(list) || typeof index !== 'number') return null
        current = list[index]
        if (current === null || current === undefined) return null
        i += 2
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
 * 路径所属根层（layer-panel-ux 工单 10）：LayerBase 面字段（visible 等）只作用
 * 根层，任意深度的路径第 2 段即根层下标——gizmo 隐藏过滤与右键菜单显隐标签等
 * 绑定层读取位共用，收口「path[1] 是根层」的路径结构知识。越界返回 null。
 */
export function rootLayerOf(doc: Canvas, path: LayerPath): Layer | null {
    const index = path[1]
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return null
    return doc.layers[index] ?? null
}

/**
 * 级联归属链（结构纯函数，无需文档）：格内容 → 格 → 行 → 表；根层无父级。
 * Escape 升级沿此链逐级取父，链尽即清空选择。模板子树链（spec §2.2）：模板格
 * 内容 → 模板格 → 行模板（替身路径，可选中）→ 表——行模板是链上正式一级。
 */
export function selectionParentPath(path: LayerPath): LayerPath | null {
    if (path.length < 2) return null
    if (path[path.length - 1] === 'content') return path.slice(0, -1)
    // 行模板替身收尾：template 段无下标容器对，父级 = 表
    if (path[path.length - 1] === 'template') return path.slice(0, -1)
    if (path.length > 2) {
        // 模板格的父级 = 行模板替身路径（保留 template 段，不再跳过）
        return path.slice(0, -2)
    }
    return null
}

/**
 * 路径处图层的绝对盒（下钻几何经 canvas-next 的 resolveChildAt，与渲染模板
 * walkLayer 同一套推进公式：行纵向累加、格横向累加、格内容与格同原点）。
 * gizmo 选择框、命中测试、适应选区共用，保证与绘制不漂移。
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
    let layer: Layer = root
    let box = resolveLayerBox(root, 0, 0, doc.width, doc.height, policies)

    // 逐段下钻：每段经共享几何解析目标孩子（越界/形态不符返回 null）；
    // 'template' 段无下标，盒与首行同位（resolveChildAt 同一推进公式）
    let i = 2
    while (i < path.length) {
        const key = path[i] as 'rows' | 'cells' | 'content' | 'template'
        if (key === 'template') {
            const child = resolveChildAt(layer, box, 'template', 0, policies)
            if (!child) return null
            layer = child.layer
            box = child.box
            i += 1
            continue
        }
        const index = path[i + 1] as number
        const child = resolveChildAt(layer, box, key, index, policies)
        if (!child) return null
        layer = child.layer
        box = child.box
        i += 2
    }
    return box
}

/**
 * 结构变更后的路径重映射（纯函数，工单 10）：containerPath 容器的 key 子列表发生
 * 「摘除 from 处 1 项、插回 to 处」（to = 插入后的最终下标；to === from 即纯删除）。
 * 前缀匹配容器外的路径原样返回；被移出容器的子树返回 null（调用方落地为清除选择）。
 */
export function remapPathAfterSplice(
    path: LayerPath,
    containerPath: LayerPath,
    key: 'layers' | 'rows' | 'cells',
    from: number,
    to: number,
): LayerPath | null {
    if (path.length < containerPath.length + 2) return path
    for (let i = 0; i < containerPath.length; i += 1) {
        if (path[i] !== containerPath[i]) return path
    }
    if (path[containerPath.length] !== key) return path
    const index = path[containerPath.length + 1]
    if (typeof index !== 'number') return path
    const rest = path.slice(containerPath.length + 2)
    const head: LayerPath = [...containerPath, key]

    if (from === to) {
        if (index === from) return null
        return index > from ? [...head, index - 1, ...rest] : path
    }
    if (index === from) return [...head, to, ...rest]
    if (from < index && index <= to) return [...head, index - 1, ...rest]
    if (to <= index && index < from) return [...head, index + 1, ...rest]
    return path
}
