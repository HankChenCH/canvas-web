/**
 * 内核 editing 层出口：编辑特性模块——剪贴板（clipboard）、图层增删移
 * （layerPanel）、表格编辑（tableEditing）、字体清单（fontCatalog）、
 * 上传物化（upload）。只向下依赖 shared，不得引用 session 门面
 * （editor-editing-isolation 红线锁定）。
 */
export {
    addRootLayerInDraft,
    buildLayerOutline,
    createDefaultLayer,
    deleteLayerInDraft,
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
    addTableCellInDraft,
    addTableRowInDraft,
    canonicalizeTableSyncInDraft,
    growRowToCellInDraft,
    moveTableCellInDraft,
    moveTableCellToRowInDraft,
    moveTableRowToTableInDraft,
    setCellAutoHeightInDraft,
    syncContentIntoCellInDraft,
    syncRowWidthInDraft,
    type MovedSubtreeRef,
} from './tableEditing'
export { FontCatalog, type FontCatalogEntry } from './fontCatalog'
export {
    UploadHandlerMissingError,
    uploadDisplayName,
    type UploadFile,
    type UploadHandler,
} from './upload'
