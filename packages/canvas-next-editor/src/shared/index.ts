/**
 * 内核 shared 层出口：图层路径寻址原语（LayerPath 体系）+ 表达式补全纯数据原语
 * （片段扫描/路径解析，content-completion 工单 01）。
 * 被 session/spatial/editing 各层引用，自身不得依赖任何上层
 * （editor-shared-isolation 红线锁定）。
 */
export {
    isLayerPath,
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

export {
    expressionFragmentAtCursor,
    scanExpressionFragments,
    type ExpressionScan,
    type ExpressionScanFragment,
    type ExpressionScanLiteral,
    type ExpressionScanOpen,
    type ExpressionScanPart,
} from './expressionScan'

export {
    parseExpressionPath,
    type ExpressionPathHead,
    type ExpressionPathParse,
    type ExpressionSyntaxError,
} from './expressionPath'

