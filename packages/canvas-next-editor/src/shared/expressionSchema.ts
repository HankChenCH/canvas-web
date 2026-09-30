/**
 * 数据源 schema 方言编译器（content-completion 工单 02/08，spec §2 + §6 D6–D8）。
 *
 * D6 钉定：注入边界一次性转译为内部形状树（不在查询期惰性解析原始 schema，
 * 行业惯例见 schema-completion-research.md）。方言子集 = JSON Schema draft-07 的
 * 结构关键词（`properties` / `items` / `type`）+ 注解关键词（`description` /
 * `title` / `additionalProperties: true`）+ 引用关键词（`$ref` 内部 JSON Pointer、
 * `definitions`/`$defs` 命名池）；其余关键词（`required`/`format`/`enum`/`const`/
 * `allOf` 族/`patternProperties`/`$schema`/`$id` 及一切未识别键）宽松忽略，节点按
 * 已识别字段归一（可能变叶子）。
 *
 * 声明契约（D1 钉定）：schema 声明即 `compile(canvas, dataset)` 收到的 data
 * 载荷形状——根上下文候选 = 载荷顶层键；根必须是带 properties 的对象声明。
 *
 * 降级分级（D7）：
 * - **整份拒绝**仅保留根级结构性问题（在原始文档上判定，拒绝面与 walker 时代
 *   全等）：根非对象 / 根缺 properties 层级（含根级 `$ref`——根不解引用）/
 *   `reserved_root_key`（根级键 `row` 或 `$` 前缀，前移填充期硬错误，对应
 *   `CanvasHydrator::assertReservedRootKeys`；仅根级保留，嵌套层同名键合法）。
 * - **局部故障**（`$ref` 断链 / 外部指针 / 环引用（活跃路径 seen-set 判定）/
 *   目标形态不符）→ 该节点降级为叶子（保留本地 type/description/title 注解）+
 *   diagnostics 逐条记录，树其余部分照常服务；注入期由
 *   normalizeExpressionSchemaSource 汇总 console.warn 一次（D12 单点收口，
 *   诊断明细可经 parseExpressionSchema 直取，工单 11 面板展示）。
 * - 深层识别关键词**形态不符**（如 type: 3 / property 子声明非对象）视同未识别
 *   键宽松忽略：不诊断不降级，节点按剩余字段归一（可能变叶子）。
 *
 * $ref 语义（D7）：任意内部 `#/` JSON Pointer（先整段百分号解码——`%25`→`%` 等，
 * 解码失败记 broken_ref——再按 `/` 切段、逐段 `~1`→`/`、`~0`→`~` 反转义），
 * definitions/$defs 命名池只作指针目标不进候选树；外部/远程指针不支持，归宿主
 * 预内联。目标为基底，本地 `description` 覆盖目标同名注解（对 draft-07 兄弟语义
 * 的唯一偏离——兄弟 description 是现成候选说明，严格性无收益；其余兄弟关键词按
 * draft-07 忽略）。环引用防环用活跃路径 seen-set（对齐 VS Code
 * resolveSchemaContent 范式）：seen 只含当前 DFS 祖先链，菱形引用不误判；
 * 该守卫兼防宿主程序化构造的对象别名自嵌套（JSON 文档天然无环）。
 *
 * D3 钉定（2026-09-30 由 D9 修订）：数组类型节点 items 键树下钻保留在**下钻层**
 * （schemaNodeAtPath / resolveRowSchema，rowsPath 行 schema 解析与 `row.*`/`$index`
 * 机制零影响）；**枚举层**（schemaChildEntries 候选视图）已分叉——数组节点
 * （type 声明为 array 或声明了 items）收敛为叶子、不沿 items 链穿透：具名段下钻
 * 数组在求值器（InterpolationEvaluator::navigateValue）是静默空串（缺字段信号），
 * 补全不得怂恿写渲染为空白的表达式；类型徽标仍显示 array 本身，不特供「供表格
 * rowsPath 使用」文案（为表达式内置函数留前瞻口，spec D9）。open 节点
 * （additionalProperties: true）即随枚举结果携带 open 信号（D10，供工单 10 浮层
 * 占位提示；信号面与候选空否无关）。
 *
 * 全模块零 DOM、零内部依赖（editor-shared-isolation）；除
 * normalizeExpressionSchemaSource 的 console 警告收口（注入期汇总一次）外均为纯函数。
 */

/** schema 方言形状树节点（parse 归一化产物，properties 冻结为 Map 防宿主变异） */
export interface ExpressionSchemaNode {
    /** 主类型徽标数据：type 关键词归一（数组取首个非 null；未声明为 undefined） */
    type?: string
    /** 展示回落注解（D8）：浮层取 description ?? title */
    title?: string
    description?: string
    /** 开放映射标记（D10）：`additionalProperties: true`；动态字段实际键由宿主合入 properties */
    open?: boolean
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

/** 局部故障诊断码（D7 四类，全部 $ref 解析面；节点降叶子 + 树其余照常服务） */
export type ExpressionSchemaDiagnosticCode = 'broken_ref' | 'external_ref' | 'circular_ref' | 'target_shape_mismatch'

/** 一条局部故障诊断：path = 降级节点在原始 schema 文档中的声明路径（JSON Pointer 风格） */
export interface ExpressionSchemaDiagnostic {
    path: string
    code: ExpressionSchemaDiagnosticCode
    detail: string
}

export type ExpressionSchemaParse =
    | { ok: true; schema: ExpressionSchemaNode; diagnostics: readonly ExpressionSchemaDiagnostic[] }
    | { ok: false; reason: ExpressionSchemaRejectReason; detail: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** type 关键词归一：string 直取；string[] 取首个非 null/空串（全 null/空为 undefined） */
function normalizeSchemaType(value: string | readonly string[]): string | undefined {
    if (typeof value === 'string') return value === '' ? undefined : value
    const primary = value.find((entry) => entry !== 'null' && entry !== '')
    return primary
}

/** 节点注解子形状（降级叶子 = 仅注解） */
type SchemaAnnotations = Pick<ExpressionSchemaNode, 'type' | 'description' | 'title'>

/** 节点注解的宽松提取：形态不符的键视同未识别忽略（工单 08 宽松面） */
function annotationsOf(raw: Record<string, unknown>): SchemaAnnotations {
    const node: SchemaAnnotations = {}
    const rawType = raw['type']
    if (typeof rawType === 'string') {
        const type = normalizeSchemaType(rawType)
        if (type !== undefined) node.type = type
    } else if (Array.isArray(rawType)) {
        // spec §2：string[] 取首个非 null；非 string 元素宽松剔除（形态不符不整体作废）
        const type = normalizeSchemaType(rawType.filter((entry): entry is string => typeof entry === 'string'))
        if (type !== undefined) node.type = type
    }
    const rawDescription = raw['description']
    if (typeof rawDescription === 'string') node.description = rawDescription
    const rawTitle = raw['title']
    if (typeof rawTitle === 'string') node.title = rawTitle
    return node
}

/** 声明路径段转义（JSON Pointer 键级 ~0/~1），仅供诊断 path 展示 */
function pointerEscape(key: string): string {
    return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** JSON Pointer 键级反转义（RFC 6901）：单趟左到右，~1→/、~0→~；未跟 0/1 的 ~ 按字面保留 */
function unescapePointerToken(token: string): string {
    let out = ''
    for (let i = 0; i < token.length; i += 1) {
        const ch = token[i]
        if (ch === '~' && (token[i + 1] === '0' || token[i + 1] === '1')) {
            out += token[i + 1] === '0' ? '~' : '/'
            i += 1
        } else {
            out += ch
        }
    }
    return out
}

type InternalRefResolution = { ok: true; target: unknown } | { ok: false; why: string }

/**
 * 内部 `#/` 指针解析（仅纯对象键导航）：先整段百分号解码（URI 片段层，`%25`→`%`；
 * 无效编码=作者错误，显式断链不静默），再切段、逐段反转义。空片段（`#`）= 根文档。
 */
function resolveInternalRef(ref: string, root: Record<string, unknown>): InternalRefResolution {
    let fragment = ref.slice(1)
    try {
        fragment = decodeURIComponent(fragment)
    } catch {
        return { ok: false, why: '指针片段含无效百分号编码' }
    }
    // 剥掉前导 '/'（JSON Pointer 以 / 起段）；空片段（#）= 根文档零段
    const tokens = fragment === '' ? [] : fragment.replace(/^\//, '').split('/')
    let current: unknown = root
    for (const token of tokens) {
        if (!isPlainObject(current)) return { ok: false, why: `指针途经非对象（段 "${token}"）` }
        const key = unescapePointerToken(token)
        if (!(key in current)) return { ok: false, why: `指针段未命中（"${token}"）` }
        current = current[key]
    }
    return { ok: true, target: current }
}

interface CompileContext {
    /** 原始 schema 文档（$ref 指针导航根） */
    root: Record<string, unknown>
    diagnostics: ExpressionSchemaDiagnostic[]
    /** 活跃路径 seen-set：当前 DFS 祖先链上的原始对象（环引用判定，菱形不误判） */
    activePath: Set<object>
}

/**
 * 局部故障统一落点（D7）：记一条诊断 + 该节点降级为叶子——结构丢弃（$ref 目标
 * 本该提供），保留本地注解（type/description/title）供候选展示。
 */
function degradeWithDiagnostic(
    ctx: CompileContext,
    raw: Record<string, unknown>,
    path: string,
    code: ExpressionSchemaDiagnosticCode,
    detail: string,
): ExpressionSchemaNode {
    ctx.diagnostics.push({ path, code, detail })
    return annotationsOf(raw)
}

function compileSchemaNode(raw: Record<string, unknown>, declPath: string, ctx: CompileContext): ExpressionSchemaNode {
    if (ctx.activePath.has(raw)) {
        // $ref 环由引用点先行判定落诊断（path 指向引用者更可定位）；此守卫兜住
        // 无 $ref 的对象别名自嵌套（程序化构造才可能，JSON 文档天然无环）
        return degradeWithDiagnostic(ctx, raw, declPath, 'circular_ref', '节点在活跃路径上重入（环引用），降级为叶子')
    }
    ctx.activePath.add(raw)
    try {
        const rawRef = raw['$ref']
        if (rawRef !== undefined) return compileRefNode(raw, rawRef, declPath, ctx)
        return compileInlineNode(raw, declPath, ctx)
    } finally {
        ctx.activePath.delete(raw)
    }
}

/** $ref 节点（D7）：目标为基底，本地 description 覆盖；解析失败按故障分类降叶子 */
function compileRefNode(raw: Record<string, unknown>, rawRef: unknown, declPath: string, ctx: CompileContext): ExpressionSchemaNode {
    if (typeof rawRef !== 'string') {
        return degradeWithDiagnostic(ctx, raw, declPath, 'broken_ref', '$ref 必须是 string，节点降级为叶子')
    }
    if (!rawRef.startsWith('#')) {
        return degradeWithDiagnostic(
            ctx,
            raw,
            declPath,
            'external_ref',
            `$ref 指向外部/远程目标 "${rawRef}"（仅支持内部 #/ 指针，归宿主预内联），节点降级为叶子`,
        )
    }
    const resolved = resolveInternalRef(rawRef, ctx.root)
    if (!resolved.ok) {
        return degradeWithDiagnostic(ctx, raw, declPath, 'broken_ref', `$ref 内部指针解析失败（${resolved.why}），节点降级为叶子`)
    }
    if (!isPlainObject(resolved.target)) {
        return degradeWithDiagnostic(ctx, raw, declPath, 'target_shape_mismatch', `$ref 目标不是 schema 对象，节点降级为叶子`)
    }
    if (ctx.activePath.has(resolved.target)) {
        return degradeWithDiagnostic(ctx, raw, declPath, 'circular_ref', `$ref 目标在活跃路径上（环引用）"${rawRef}"，节点降级为叶子`)
    }
    // 基底编译（诊断 path 沿引用指针走，指向定义本体）；每次 deref 独立编译，无共享可变状态
    const base = compileSchemaNode(resolved.target, rawRef, ctx)
    const localDescription = raw['description']
    if (typeof localDescription === 'string') base.description = localDescription
    return base
}

/** 无 $ref 节点：注解 + open 标记 + 结构关键词（形态不符的键宽松忽略） */
function compileInlineNode(raw: Record<string, unknown>, declPath: string, ctx: CompileContext): ExpressionSchemaNode {
    const node: ExpressionSchemaNode = annotationsOf(raw)

    if (raw['additionalProperties'] === true) node.open = true

    const rawProperties = raw['properties']
    if (isPlainObject(rawProperties)) {
        const properties = new Map<string, ExpressionSchemaNode>()
        for (const [key, child] of Object.entries(rawProperties)) {
            if (!isPlainObject(child)) continue // 子声明非对象宽松跳过，兄弟键照常
            properties.set(key, compileSchemaNode(child, `${declPath}/properties/${pointerEscape(key)}`, ctx))
        }
        node.properties = properties
    }

    const rawItems = raw['items']
    if (isPlainObject(rawItems)) node.items = compileSchemaNode(rawItems, `${declPath}/items`, ctx)

    return node
}

/**
 * 声明期编译（D6 注入边界一次性转译）：合法 → 节点树 + diagnostics（局部故障
 * 逐条，可为空）；根级保留键 → reserved_root_key；根级结构非法 → invalid_schema。
 * 根级判定在原始文档上进行（根级 `$ref` 不解引用，拒绝面与 walker 时代全等）。
 */
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
    if (!isPlainObject(rawProperties)) {
        return { ok: false, reason: 'invalid_schema', detail: '根声明缺 properties 层级（schema 即载荷形状，必须声明顶层键）' }
    }

    const diagnostics: ExpressionSchemaDiagnostic[] = []
    const schema = compileSchemaNode(raw, '#', { root: raw, diagnostics, activePath: new Set() })
    return { ok: true, schema, diagnostics }
}

/**
 * 注入缝收口（工单 03 接线用）：parse 失败降级为 null + console.warn（含原因，
 * 不抛错不弹错）；编译成功而存在局部故障诊断 → 汇总 warn **恰一次**（D7/D12：
 * 内核单点收口，不逐条告警；诊断明细可经 parseExpressionSchema 直取供工单 11
 * 面板展示）。注入期调用一次，枚举期拿 null 直接无候选、不再逐键告警。
 */
export function normalizeExpressionSchemaSource(raw: unknown): ExpressionSchemaNode | null {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) {
        console.warn(
            `[canvas-next-editor] 数据源 schema 声明降级为无候选（${parsed.reason}: ${parsed.detail}）——补全是辅助声明不作权威，不弹错`,
        )
        return null
    }
    if (parsed.diagnostics.length > 0) {
        const lines = parsed.diagnostics.map((diagnostic) => `- ${diagnostic.path}：${diagnostic.code}——${diagnostic.detail}`)
        console.warn(
            `[canvas-next-editor] 数据源 schema 编译诊断 ${parsed.diagnostics.length} 条（局部降级为叶子，树其余部分照常服务）：\n${lines.join('\n')}`,
        )
    }
    return parsed.schema
}

/**
 * 节点的对象形态视图（下钻层专用机制，D3；枚举层候选视图已按 D9 分叉——见
 * schemaChildEntries）：properties 声明优先（声明而段未命中 = 死分支，不回退
 * items）；无 properties 时沿 items 链找首个带 properties 的节点（数组的数组
 * 穿透，rowsPath 行 schema 解析依赖此链）；全链无 = null（叶子分支）。
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
 * 一层子候选枚举结果（D9 候选视图的返回面）：候选条目 + open 信号。信号走结果
 * 面扩展，不污染候选条目契约（ExpressionSchemaChildEntry 不加字段）。
 */
export interface ExpressionSchemaChildView {
    /** 一层子候选（按声明序）；数组节点收敛为叶子 = 空（D9） */
    entries: readonly ExpressionSchemaChildEntry[]
    /** 开放映射信号（D10）：节点标 open（additionalProperties: true）时为 true；非 open 恒缺省 */
    open?: boolean
}

/**
 * 一层子候选枚举（枚举层候选视图，D9 分叉点）：数组节点（type 声明为 array 或
 * 声明了 items）**一律**收敛为叶子——具名段下钻数组在求值器是静默空串
 * （navigateValue 缺字段信号），补全不得怂恿写渲染为空白的表达式（spec §2 D9，
 * 2026-09-30 修订 D3）；声明自相矛盾（type array 而又带 properties/items）时从疑
 * 同样收敛，对齐 D7 疑点降叶哲学。其余节点取**自身** properties（按声明序），
 * 不沿 items 链穿透。open 信号（D10）随视图透出，供浮层占位提示（工单 10）。
 * 下钻层（schemaNodeAtPath/resolveRowSchema）机制不动，rowsPath/`row.*`/`$index`
 * 零影响（数组的数组穿透不回归）。
 */
export function schemaChildEntries(node: ExpressionSchemaNode): ExpressionSchemaChildView {
    if (node.type === 'array' || node.items !== undefined) return { entries: [] }
    const entries =
        node.properties !== undefined ? [...node.properties].map(([key, child]) => ({ key, node: child })) : []
    return node.open === true ? { entries, open: true } : { entries }
}

/**
 * 行上下文行键树解析（rowsPath 数组 items，CanvasHydrator 行注入 'row' 的形状
 * 本体）：rowsPath 走点路径下钻（下钻层 items 链机制，D9 分叉不影响——数组的
 * 数组穿透不回归），命中数组节点取 items；节点无 items（schema 未声明行形状或
 * 漂移）→ null（行子树无候选，结构头 row 仍可用）。
 * 嵌套模板表的行相对 rowsPath 以当前行 schema 为基准解析，由调用方传入对应根。
 */
export function resolveRowSchema(root: ExpressionSchemaNode, rowsPath: string): ExpressionSchemaNode | null {
    const segments = rowsPath.split('.')
    if (rowsPath === '' || segments.includes('')) return null
    const node = schemaNodeAtPath(root, segments)
    return node?.items ?? null
}
