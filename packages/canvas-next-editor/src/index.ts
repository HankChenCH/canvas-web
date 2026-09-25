/**
 * @hankchen/canvas-next-editor headless 内核公共出口。
 *
 * 工单 05：相机纯函数（camera）、滚轮意图分类（wheel）、observable store
 * （doc/ui 双分支）与渲染调度面（EditorSession：注入式帧调度合帧、分层脏标）。
 * 工单 06：选择与拖动——图层路径身份（layerPath）、命中测试（hitTest）、
 * 点选/级联/hover、九锚点拖动、mergeKey 事务最小管线。
 * 工单 08：双栈 undo/redo（store，上限 100 步、Figma 改写语义）、撤销/重做
 * 快捷键意图分类（historyShortcut，IME 守卫由绑定层折算）。
 * 红线：内核不依赖任何 UI 绑定层（Vue/React），无 DOM lib，测试全部在
 * Node 无 DOM 环境运行。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor' as const

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
export {
    EditorSession,
    type EditorSessionOptions,
    type FrameScheduler,
    type InvalidateTarget,
    type OverlayPaintArgs,
    type OverlayPainter,
} from './editor'
export {
    isLayerPath,
    layerBoxByPath,
    pathsEqual,
    resolveLayer,
    selectionParentPath,
    type LayerPath,
} from './layerPath'
export { hitTest } from './hitTest'
export {
    classifyHistoryShortcut,
    type HistoryShortcut,
    type HistoryShortcutInput,
} from './historyShortcut'
export {
    EditorStore,
    type DocRecipe,
    type DragGesture,
    type EditorChange,
    type EditorUi,
    type HistoryStep,
    type TransactOptions,
    MAX_HISTORY_STEPS,
} from './store'
export { classifyWheel, type WheelIntent, type WheelInput } from './wheel'
export type { Canvas, Layer, LayerBox } from '@hankchen/canvas-next'
