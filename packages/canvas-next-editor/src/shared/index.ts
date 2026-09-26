/**
 * 内核 shared 层出口：图层路径寻址原语（LayerPath 体系）。
 * 被 session/spatial/editing 各层引用，自身不得依赖任何上层
 * （editor-shared-isolation 红线锁定）。
 */
export {
    isLayerPath,
    isRootLayerPath,
    layerBoxByPath,
    pathStartsWith,
    pathsEqual,
    remapPathAfterSplice,
    resolveLayer,
    selectionParentPath,
    type LayerPath,
} from './layerPath'
