/**
 * 内核 spatial 层出口：视口几何纯函数（camera）、命中测试（hitTest）、
 * 滚轮意图分类（wheel）、拖动吸附数学与参考线轴几何（snap）、八柄缩放几何
 * （resize，工单 07）、画拉建层橡皮筋求位（create，drag-create 工单 01）。
 * 只向下依赖 shared（layerPath），不得引用 editing/session
 * （editor-spatial-isolation 红线锁定）。
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
// 底图豁免的全幅判定、头根进料与右键命中解析（canvas-background 工单 05）：命中
// 豁免与「转为画布背景」转换门同门，绑定层不得自行手写几何判定
export {
    baseImageCandidateAt,
    coversCanvas,
    headRootBox,
    hitTest,
    type HitTestOptions,
} from './hitTest'
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
    proportionalDrivingAxis,
    resizeBox,
    resizeBoxProportional,
    resizeHandleAt,
    resizeHandlePoint,
    resizeHandlesAt,
    resizeProportionalSnapPoints,
    resizeSnapPoints,
    resizableAxesAt,
    type ProportionalDrivingAxis,
    type ResizeAxes,
    type ResizeBoxGeometry,
    type ResizeBoxResult,
    type ResizeHandle,
} from './resize'
export {
    CREATE_DEAD_ZONE_SCREEN_PX,
    createRubberBandRect,
    type CreateRectResult,
} from './create'
export { classifyWheel, type WheelIntent, type WheelInput } from './wheel'
