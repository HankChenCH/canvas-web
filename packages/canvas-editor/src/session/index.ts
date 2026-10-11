/**
 * 内核 session 层出口：EditorSession 门面（注入式帧调度合帧、分层脏标）、
 * observable store（doc/ui 双分支 + 双栈 undo/redo）、快捷键注册表。
 * 会话层可引用全部下层域（spatial/editing/shared）。
 */
export {
    ALT_DRAG_DEAD_ZONE_SCREEN_PX,
    EditorSession,
    type EditorSessionOptions,
    type FrameScheduler,
    type InvalidateTarget,
    type OverlayPaintArgs,
    type OverlayPainter,
    type TextEditLayout,
} from './editor'
export {
    ARM_CREATE_LAYER_TYPES,
    classifyEditorShortcut,
    DEFAULT_EDITOR_SHORTCUTS,
    type ArmCreateShortcutAction,
    type EditorShortcutAction,
    type EditorShortcutBinding,
    type EditorShortcutGroup,
    type EditorShortcutInput,
    type ShortcutCombo,
} from './shortcuts'
export {
    EditorStore,
    type CreateGesture,
    type DocRecipe,
    type DragGesture,
    type EditorChange,
    type EditorUi,
    type FindSession,
    type HistoryStep,
    type TextEditingSession,
    type TransactOptions,
    MAX_HISTORY_STEPS,
} from './store'
// 编辑器状态切片与偏好（project-data 工单 01，spec §3/§5）：单画布切片 + 偏好 +
// 版本常量经根 barrel 出内核，frames 容器（帧名 → 切片）归宿主拼装
export {
    EDITOR_STATE_SCHEMA_VERSION,
    type CanvasEditorState,
    type EditorPrefsState,
} from './editorState'
