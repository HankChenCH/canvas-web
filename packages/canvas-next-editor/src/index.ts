/**
 * @hankchen/canvas-next-editor headless 内核公共出口。
 *
 * 工单 05：相机纯函数（camera）、滚轮意图分类（wheel）、observable store
 * （doc/ui 双分支）与渲染调度面（EditorSession：注入式帧调度合帧、分层脏标）。
 * 后续工单：选择/工具状态机（06）、事务历史（08）。红线：内核不依赖任何
 * UI 绑定层（Vue/React），无 DOM lib，测试全部在 Node 无 DOM 环境运行。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor' as const

export {
    DEFAULT_ZOOM_BOUNDS,
    WHEEL_ZOOM_STEP,
    clampZoom,
    fitViewport,
    nextZoomByWheel,
    panBy,
    sceneToScreen,
    screenToScene,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Point,
    type Size,
    type Viewport,
    type ZoomBounds,
} from './camera'
export {
    EditorSession,
    type EditorSessionOptions,
    type FrameScheduler,
    type InvalidateTarget,
    type OverlayPaintArgs,
    type OverlayPainter,
} from './editor'
export { EditorStore, type EditorChange, type EditorUi } from './store'
export { classifyWheel, type WheelIntent, type WheelInput } from './wheel'
