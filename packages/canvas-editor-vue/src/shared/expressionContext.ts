/**
 * 补全上下文判定 + 候选源适配（content-completion 工单 05，spec §1 生效面/§2 规则表）。
 *
 * shared 域切片（表达式就地编辑 spec 决策 5 迁入）：属性面板与画布文本编辑两域
 * 共用——候选源与面板同源（模板格内容 row. 上下文自动正确）。
 *
 * 上下文判定对齐 PHP 权威（CanvasHydrator 行上下文注入点）：rowNamespace 只在
 * 模板表实例化子树内注入——面板可达面里即「模板格内容层」为行上下文，根层三
 * 字段与 V1 rows 格内容层都是根上下文（V1 格内容写 row. 在填充期报
 * expression_row_outside_loop，候选不给）。
 *
 * 行 schema 解析沿路径上每个 template 段逐级下钻：外层表 rowsPath 对根 schema、
 * 嵌套模板表 rowsPath 对当前行 schema（行相对取数，hydrateTemplateNode 同门）；
 * 任一层解析不出（rowsPath 无 items 声明/漂移）→ rowSchema null——结构头 row
 * 仍由枚举器给出（辅助声明不作权威）。
 *
 * 候选源适配 = 内核 enumerateExpressionCandidates → 工单 04 浮层的 CompletionSource
 * 契约（ExpressionCandidate 结构兼容 CompletionItem；ok:false = null 无补全态）。
 * 本模块纯函数、零 Vue 零 DOM（fieldSchema 同款，Node 环境测试）。
 */
import {
    enumerateExpressionCandidates,
    isTemplateSubtreePath,
    resolveLayer,
    resolveRowSchema,
    type Canvas,
    type ExpressionContextKind,
    type ExpressionSchemaNode,
    type LayerPath,
} from '@hankchen/canvas-editor'

import type { CompletionSource } from './completion'

/** 数据字段所在位置的补全上下文（kind = 候选分表面；rowSchema 仅行上下文在场） */
export interface ExpressionFieldContext {
    readonly kind: ExpressionContextKind
    /** 行键树 schema（rowsPath 数组 items）；根上下文/解析不出为 null */
    readonly rowSchema: ExpressionSchemaNode | null
}

/** 沿路径每个 template 段逐级解析行 schema：外层对根 schema、嵌套对当前行 schema */
function rowSchemaAlongPath(doc: Canvas, path: LayerPath, rootSchema: ExpressionSchemaNode): ExpressionSchemaNode | null {
    let current: ExpressionSchemaNode | null = null
    for (let i = 0; i < path.length; i += 1) {
        if (path[i] !== 'template') continue
        const table = resolveLayer(doc, path.slice(0, i) as LayerPath)
        if (table === null || table.type !== 'TableLayer') return null
        current = resolveRowSchema(current ?? rootSchema, table.rowsPath)
        if (current === null) return null
    }
    return current
}

/**
 * 模板格内容层判定（fieldSchema.layerRoleAt 的 templateContent 支最小形态）。
 *
 * 对 fieldSchema 依赖的收窄（表达式就地编辑 spec 决策 5）：本模块只消费
 * templateContent 一格判定，随迁完整角色表会把面板的过滤语义整表拖进 shared
 * （迁出面最小原则）——此处以谓词最小形态落（路径尾 content 段 + 模板子树，
 * isTemplateSubtreePath 由内核 shared 导出）；完整 LayerRole 表仍归
 * property-panel/fieldSchema 域私有，语义漂移由 fieldSchema.test 与本模块
 * expressionContext.test 两侧共同看护。
 */
function isTemplateContentPath(path: LayerPath): boolean {
    return path[path.length - 1] === 'content' && isTemplateSubtreePath(path)
}

/**
 * 选中路径处数据字段的补全上下文：模板格内容层 = 行上下文（rowNamespace 注入
 * 面），其余可达位置（根层/V1 格内容）= 根上下文。doc/path/schema 任一缺席
 * 一律根上下文（画布级目标无数据字段，判定兜底一致）。
 */
export function expressionFieldContext(
    schema: ExpressionSchemaNode | null,
    doc: Canvas | null,
    path: LayerPath | null,
): ExpressionFieldContext {
    if (schema === null || doc === null || path === null || !isTemplateContentPath(path)) {
        return { kind: 'root', rowSchema: null }
    }
    return { kind: 'row', rowSchema: rowSchemaAlongPath(doc, path, schema) }
}

/**
 * 候选源适配（工单 04 注入缝）：schema null（未注入/声明被拒降级）= null 源，
 * 浮层恒闭；否则包裹内核枚举器——ok:false（语法错误/无补全态）映射 null，
 * ok:true 原样透传（ExpressionCandidate 结构兼容 CompletionItem——description/
 * title D8 分离透传、展示回落归浮层；open 信号随结果面透出供工单 10 占位提示，
 * partial/candidates 契约见 ./completion）。
 */
export function expressionCompletionSource(
    schema: ExpressionSchemaNode | null,
    context: ExpressionFieldContext,
): CompletionSource | null {
    if (schema === null) return null
    return (expr) => {
        const result = enumerateExpressionCandidates(schema, {
            context: context.kind,
            expr,
            rowSchema: context.rowSchema,
        })
        if (!result.ok) return null
        return {
            partial: result.partial,
            candidates: result.candidates,
            ...(result.open === true ? { open: true } : {}),
        }
    }
}
