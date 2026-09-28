/**
 * 数据源 schema 子集 walker（content-completion 工单 02，spec §2）。
 *
 * 解析子集 = JSON Schema draft 2020-12 的 `properties` / `items` / `type` /
 * `description` 四关键词，零依赖 walker（不引 ajv）；`required` /
 * `additionalProperties` 等校验关键词服务于校验不服务于枚举，整体忽略。
 *
 * 声明契约（D1 钉定）：schema 声明即 `compile(canvas, dataset)` 收到的 data
 * 载荷形状——根上下文候选 = 载荷顶层键；根必须是带 properties 的对象声明。
 *
 * 声明期校验（免费拦截，前移运行期事故）：
 * - 根级键名为 `row` 或 `$` 前缀 → `reserved_root_key` 拒绝，对应填充期
 *   `CanvasHydrator::assertReservedRootKeys` 硬错误（{{row.x}} 的 row 段歧义）；
 *   仅根级保留，嵌套层同名键合法（对齐 PHP 只查根）。
 * - 形态非法（根非对象 / 根缺 properties 层级 / 四关键词形态不符）→
 *   `invalid_schema` 信号。schema 是辅助声明不作权威：消费侧
 *   （normalizeExpressionSchemaSource）降级为无候选 + console 警告，不弹错。
 *
 * D3 钉定：数组类型节点 items 键树下钻——与行上下文候选（rowsPath 数组
 * items）同一机制。properties 已声明的节点按对象形态走 properties，不回退
 * items；无 properties 时沿 items 链找对象形态（数组的数组穿透，与子候选枚举
 * 对称）；全链无 properties 的节点是叶子（该分支无子候选）。
 *
 * 全模块零 DOM、零内部依赖（editor-shared-isolation）；除
 * normalizeExpressionSchemaSource 的 console 警告收口（注入期一次）外均为纯函数。
 */

/** schema 子集节点（parse 归一化产物，properties 冻结为 Map 防宿主变异） */
export interface ExpressionSchemaNode {
    /** 主类型徽标数据：type 关键词归一（数组取首个非 null；未声明为 undefined） */
    type?: string
    description?: string
    properties?: ReadonlyMap<string, ExpressionSchemaNode>
    items?: ExpressionSchemaNode
}

/** schema 子集一条目（枚举子候选用：键名 + 节点元信息） */
export interface ExpressionSchemaChildEntry {
    key: string
    node: ExpressionSchemaNode
}

/** 声明期拒绝原因：reserved_root_key = 前移的填充期硬错误；invalid_schema = 形态非法 */
export type ExpressionSchemaRejectReason = 'reserved_root_key' | 'invalid_schema'

export type ExpressionSchemaParse =
    | { ok: true; schema: ExpressionSchemaNode }
    | { ok: false; reason: ExpressionSchemaRejectReason; detail: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** type 关键词归一：string 直取；string[] 取首个非 null/空串（全 null/空为 undefined）；其余调用方已拒 */
function normalizeSchemaType(value: string | readonly string[]): string | undefined {
    if (typeof value === 'string') return value === '' ? undefined : value
    const primary = value.find((entry) => entry !== 'null' && entry !== '')
    return primary
}

/**
 * 归一化单个节点（假定四关键词形态已由调用方校验）；
 * isRoot = 根节点（properties 必须声明，缺层级即形态非法）
 */
function normalizeSchemaNode(raw: Record<string, unknown>, isRoot: boolean): ExpressionSchemaNode | { invalid: string } {
    const node: {
        type?: string
        description?: string
        properties?: Map<string, ExpressionSchemaNode>
        items?: ExpressionSchemaNode
    } = {}

    const rawType = raw['type']
    if (rawType !== undefined) {
        if (typeof rawType !== 'string' && !Array.isArray(rawType)) return { invalid: 'type 必须是 string 或 string[]' }
        if (Array.isArray(rawType) && rawType.some((entry) => typeof entry !== 'string')) {
            return { invalid: 'type 数组元素必须是 string' }
        }
        const type = normalizeSchemaType(rawType)
        if (type !== undefined) node.type = type
    }

    const rawDescription = raw['description']
    if (rawDescription !== undefined) {
        if (typeof rawDescription !== 'string') return { invalid: 'description 必须是 string' }
        node.description = rawDescription
    }

    const rawProperties = raw['properties']
    if (rawProperties !== undefined || isRoot) {
        if (!isPlainObject(rawProperties)) {
            return { invalid: isRoot ? '根声明缺 properties 层级（schema 即载荷形状，必须声明顶层键）' : 'properties 必须是对象' }
        }
        const properties = new Map<string, ExpressionSchemaNode>()
        for (const [key, child] of Object.entries(rawProperties)) {
            if (!isPlainObject(child)) return { invalid: `properties.${key} 必须是 schema 对象` }
            const childNode = normalizeSchemaNode(child, false)
            if ('invalid' in childNode) return { invalid: `properties.${key}: ${childNode.invalid}` }
            properties.set(key, childNode)
        }
        node.properties = properties
    }

    const rawItems = raw['items']
    if (rawItems !== undefined) {
        if (!isPlainObject(rawItems)) return { invalid: 'items 必须是 schema 对象' }
        const itemsNode = normalizeSchemaNode(rawItems, false)
        if ('invalid' in itemsNode) return { invalid: `items: ${itemsNode.invalid}` }
        node.items = itemsNode
    }

    return node
}

/** 声明期校验 + 归一化：合法 → 节点树；根级保留键 → reserved_root_key；形态非法 → invalid_schema */
export function parseExpressionSchema(raw: unknown): ExpressionSchemaParse {
    if (!isPlainObject(raw)) {
        return { ok: false, reason: 'invalid_schema', detail: 'schema 根必须是对象声明' }
    }

    // 保留键检查先于形态细化：键名问题无需信任深层结构（对应填充期 reserved_root_key 硬错误）
    const rawProperties = raw['properties']
    if (isPlainObject(rawProperties)) {
        for (const key of Object.keys(rawProperties)) {
            if (key === 'row' || key.startsWith('$')) {
                return { ok: false, reason: 'reserved_root_key', detail: `根级键 "${key}" 保留（row. 前缀/$ 名与求值上下文冲突）` }
            }
        }
    }

    const node = normalizeSchemaNode(raw, true)
    if ('invalid' in node) {
        return { ok: false, reason: 'invalid_schema', detail: node.invalid }
    }
    return { ok: true, schema: node }
}

/**
 * 注入缝收口（工单 03 接线用）：parse 失败降级为 null + console.warn（含原因，
 * 不抛错不弹错）。注入期调用一次，枚举期拿 null 直接无候选、不再逐键告警。
 */
export function normalizeExpressionSchemaSource(raw: unknown): ExpressionSchemaNode | null {
    const parsed = parseExpressionSchema(raw)
    if (parsed.ok) return parsed.schema
    console.warn(
        `[canvas-next-editor] 数据源 schema 声明降级为无候选（${parsed.reason}: ${parsed.detail}）——补全是辅助声明不作权威，不弹错`,
    )
    return null
}

/**
 * 节点的对象形态视图（D3 唯一机制，下钻与子候选枚举共用）：properties 声明
 * 优先（声明而段未命中 = 死分支，不回退 items）；无 properties 时沿 items 链
 * 找首个带 properties 的节点（数组的数组穿透）；全链无 = null（叶子分支）。
 */
function objectShapeOf(node: ExpressionSchemaNode): ReadonlyMap<string, ExpressionSchemaNode> | null {
    let cursor: ExpressionSchemaNode | undefined = node
    while (cursor !== undefined) {
        if (cursor.properties !== undefined) return cursor.properties
        cursor = cursor.items
    }
    return null
}

/**
 * 点路径下钻 walker：逐段经对象形态视图解析（见 objectShapeOf）。全程不抛错：
 * schema 与数据源可能漂移，walker 只管声明树。
 */
export function schemaNodeAtPath(node: ExpressionSchemaNode, segments: readonly string[]): ExpressionSchemaNode | null {
    let current = node
    for (const segment of segments) {
        const child = objectShapeOf(current)?.get(segment)
        if (child === undefined) return null
        current = child
    }
    return current
}

/**
 * 一层子候选枚举：经对象形态视图取 properties 子项（按声明序），与下钻同一
 * 机制（D3，数组类型节点与行上下文候选一致）；叶子 = 无子候选。
 */
export function schemaChildEntries(node: ExpressionSchemaNode): readonly ExpressionSchemaChildEntry[] {
    const shape = objectShapeOf(node)
    if (shape === null) return []
    return [...shape].map(([key, child]) => ({ key, node: child }))
}

/**
 * 行上下文行键树解析（rowsPath 数组 items，CanvasHydrator 行注入 'row' 的形状
 * 本体）：rowsPath 走点路径下钻，命中数组节点取 items；节点无 items（schema
 * 未声明行形状或漂移）→ null（行子树无候选，结构头 row 仍可用）。
 * 嵌套模板表的行相对 rowsPath 以当前行 schema 为基准解析，由调用方传入对应根。
 */
export function resolveRowSchema(root: ExpressionSchemaNode, rowsPath: string): ExpressionSchemaNode | null {
    const segments = rowsPath.split('.')
    if (rowsPath === '' || segments.includes('')) return null
    const node = schemaNodeAtPath(root, segments)
    return node?.items ?? null
}
