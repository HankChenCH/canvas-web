/**
 * 内核 spatial 层出口：视口几何纯函数（camera）、命中测试（hitTest）、
 * 滚轮意图分类（wheel）、拖动吸附数学与参考线轴几何（snap）。只向下依赖
 * shared（layerPath），不得引用 editing/session（editor-spatial-isolation 红线锁定）。
 */
export {
    DEFAULT_ZOOM_BOUNDS,
    WHEEL_ZOOM_STEP,
    clampZoom,
    fitRect,
    fitViewport,
    nextZoomByWheel,
    panBy,
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
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type Guide,
    type GuideOrientation,
    type SnapAxis,
    type SnapAxisSource,
    type SnapBoxGeometry,
    type SnapResolution,
} from './snap'
export { classifyWheel, type WheelIntent, type WheelInput } from './wheel'
