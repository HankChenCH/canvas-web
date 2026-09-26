/**
 * 内核 session 层出口：EditorSession 门面（注入式帧调度合帧、分层脏标）、
 * observable store（doc/ui 双分支 + 双栈 undo/redo）、快捷键注册表。
 * 会话层可引用全部下层域（spatial/editing/shared）。
 */
export {
    EditorSession,
    type EditorSessionOptions,
    type FrameScheduler,
    type InvalidateTarget,
    type OverlayPaintArgs,
    type OverlayPainter,
    type TextEditLayout,
} from './editor'
export {
    classifyEditorShortcut,
    DEFAULT_EDITOR_SHORTCUTS,
    type EditorShortcutAction,
    type EditorShortcutBinding,
    type EditorShortcutInput,
    type ShortcutCombo,
} from './shortcuts'
export {
    EditorStore,
    type DocRecipe,
    type DragGesture,
    type EditorChange,
    type EditorUi,
    type HistoryStep,
    type TextEditingSession,
    type TransactOptions,
    MAX_HISTORY_STEPS,
} from './store'
