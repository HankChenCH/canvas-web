/**
 * 内核 editing 层出口：编辑特性模块——剪贴板（clipboard）、样式剪贴板
 * （styleClipboard）、图层增删移（layerPanel）、表格编辑（tableEditing）、
 * 对齐画布（alignCanvas）、查找替换纯函数（findReplace）、字体清单
 * （fontCatalog）、上传物化（upload）。只向下依赖 shared，不得引用 session
 * 门面（editor-editing-isolation 红线锁定）。
 */
export {
    replaceHitsInDraft,
    scanTextMatches,
    type FindTextHit,
} from './findReplace'
export {
    addRootLayerInDraft,
    buildLayerOutline,
    createDefaultLayer,
    createTemplateTable,
    deleteLayerInDraft,
    insertRootLayerAdjacentInDraft,
    insertRootLayerInDraft,
    moveGuard,
    moveRootLayerInDraft,
    moveTableRowInDraft,
    type DeletedLayerRef,
    type LayerOutlineNode,
    type LayerOutlineRole,
} from './layerPanel'
export {
    PASTE_OFFSET_PX,
    canCopyLayerAt,
    cloneLayerSubtree,
    isRootPasteableType,
    pastePosition,
    prepareRootPaste,
} from './clipboard'
export {
    STYLE_FIELD_KEYS_BY_TYPE,
    applyStyleFieldsInDraft,
    captureStyleSnapshot,
    type StyleSnapshot,
} from './styleClipboard'
export {
    addTableCellInDraft,
    addTableRowInDraft,
    addTemplateCellInDraft,
    canonicalizeTableSyncInDraft,
    convertTableToRowsInDraft,
    convertTableToTemplateInDraft,
    growRowToCellInDraft,
    moveTableCellInDraft,
    moveTableCellToRowInDraft,
    moveTableRowToTableInDraft,
    setCellAutoHeightInDraft,
    syncContentIntoCellInDraft,
    syncRowWidthInDraft,
    type MovedSubtreeRef,
} from './tableEditing'
export {
    ALIGN_CORNER_MARGIN_PX,
    alignToCanvasTarget,
    type AlignBoxGeometry,
    type AlignToCanvasMode,
    type AlignToCanvasOptions,
} from './alignCanvas'
export { FontCatalog, type FontCatalogEntry } from './fontCatalog'
export {
    UploadHandlerMissingError,
    uploadDisplayName,
    type UploadFile,
    type UploadHandler,
    type UploadImagePlacement,
} from './upload'
