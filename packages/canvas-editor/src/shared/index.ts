/**
 * 内核 shared 层出口：图层路径寻址原语（LayerPath 体系）+ spec 字段路径读写
 * 原语 + 表达式补全纯数据原语（片段扫描/路径解析/调用形解析/内建函数建议表/
 * schema 方言编译器/候选枚举器，content-completion 工单 01/02/08 +
 * expression-type-methods 工单 12）+ rowsPath 补全纯数据原语（候选枚举器/起点
 * 三分流判别，rows-path-completion 工单 01）。被 session/spatial/editing 各层
 * 引用，自身不得依赖任何上层（editor-shared-isolation 红线锁定）。
 */
export {
    isLayerPath,
    isLockedPath,
    isRootLayerPath,
    isTemplateSubtreePath,
    layerBoxByPath,
    pathStartsWith,
    pathsEqual,
    remapPathAfterSplice,
    resolveLayer,
    rootLayerOf,
    selectionParentPath,
    type LayerPath,
} from './layerPath'

export { readSpecField, writeSpecField } from './specField'

export {
    expressionFragmentAtCursor,
    PHP_TRIM_CHARS,
    phpTrim,
    scanExpressionFragments,
    type ExpressionScan,
    type ExpressionScanFragment,
    type ExpressionScanLiteral,
    type ExpressionScanOpen,
    type ExpressionScanPart,
} from './expressionScan'

export {
    expressionCallSlotAtEnd,
    isCallFragment,
    parseExpressionCall,
    type ExpressionCallArg,
    type ExpressionCallParse,
    type ExpressionCallSlotContext,
} from './expressionCall'

export {
    DATE_FORMAT_SUGGESTIONS,
    EXPRESSION_FUNCTIONS,
    NUMBER_FUNCTION_SUGGESTIONS,
    type ExpressionFormatSuggestion,
    type ExpressionFunctionMeta,
} from './expressionFunctions'

export {
    parseExpressionPath,
    type ExpressionPathHead,
    type ExpressionPathParse,
    type ExpressionSyntaxError,
} from './expressionPath'

export {
    normalizeExpressionSchemaSource,
    parseExpressionSchema,
    resolveRowSchema,
    schemaChildEntries,
    schemaNodeAtPath,
    type ExpressionSchemaChildEntry,
    type ExpressionSchemaChildView,
    type ExpressionSchemaDiagnostic,
    type ExpressionSchemaDiagnosticCode,
    type ExpressionSchemaNode,
    type ExpressionSchemaParse,
    type ExpressionSchemaRejectReason,
} from './expressionSchema'

export {
    enumerateExpressionCandidates,
    type ExpressionCandidate,
    type ExpressionCandidateQuery,
    type ExpressionCandidateResult,
    type ExpressionContextKind,
} from './expressionCandidates'

export {
    enumerateRowsPathCandidates,
    resolveRowsPathStartSchema,
    type RowsPathCandidate,
    type RowsPathCandidateResult,
} from './rowsPathCandidates'

export {
    memoizeTextPolicies,
    type MemoTextPoliciesOptions,
} from './textPoliciesMemo'

export {
    isImageContentUndrawn,
    type ResourceStatus,
    type ResourceStatusMap,
} from './resourceStatus'
