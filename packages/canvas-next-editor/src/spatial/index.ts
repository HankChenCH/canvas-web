/**
 * 内核 spatial 层出口：视口几何纯函数（camera）、命中测试（hitTest）、
 * 滚轮意图分类（wheel）、拖动吸附数学与参考线轴几何（snap）、八柄缩放几何
 * （resize，工单 07）。只向下依赖 shared（layerPath），不得引用
 * editing/session（editor-spatial-isolation 红线锁定）。
 */
export {
    DEFAULT_ZOOM_BOUNDS,
    PAN_TO_BOX_MARGIN_PX,
    WHEEL_ZOOM_STEP,
    clampZoom,
    fitRect,
    fitViewport,
    nextZoomByWheel,
    panBy,
    panToBox,
    sceneToScreen,
    screenToScene,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Point,
    type Rect,
    type Size,
    type Viewport,
    type ZoomBounds,
} from './camera'
export { hitTest, type HitTestOptions } from './hitTest'
export {
    SNAP_THRESHOLD_SCREEN_PX,
    resolveSnap,
    resolveSnapPoints,
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type Guide,
    type GuideOrientation,
    type SnapAxis,
    type SnapAxisSource,
    type SnapBoxGeometry,
    type SnapPoints,
    type SnapResolution,
} from './snap'
export {
    RESIZE_HANDLES,
    RESIZE_HANDLE_HIT_PX,
    RESIZE_MIN_SIZE_PX,
    handleResizesHeight,
    handleResizesWidth,
    resizeBox,
    resizeHandleAt,
    resizeHandlePoint,
    resizeHandlesAt,
    resizeSnapPoints,
    resizableAxesAt,
    type ResizeAxes,
    type ResizeBoxGeometry,
    type ResizeBoxResult,
    type ResizeHandle,
} from './resize'
export { classifyWheel, type WheelIntent, type WheelInput } from './wheel'
