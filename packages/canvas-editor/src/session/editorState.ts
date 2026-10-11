/**
 * 编辑器状态切片与偏好（project-data 工单 01，spec §3/§5）：内核导出的「单画布
 * 切片 + 偏好 + schemaVersion 常量」三件，EditorSession 实例方法（editor.ts）消费。
 *
 * 分层纪律（内核帧盲）：帧名/帧缓冲/文档是宿主领域——frames 容器（帧名 → 切片）
 * 与完整快照聚合类型（schemaVersion/frames/prefs）归宿主拼装，宿主只透传切片
 * 内容、不解释 guides/lockedPaths 语义；本模块只出两型 + 版本常量 + restore 的
 * 轻结构校验。零契约面：切片不进 wire、不进历史栈、不是第二种文档格式——graph
 * 仍是内核唯一保存物。
 */
import type { Guide, GuideOrientation } from '../spatial/snap'
import type { LayerPath } from '../shared/layerPath'

/** 快照格式版本：随格式演化单调递增；v1 = 1（宽容读贯彻，restore 不分支此值） */
export const EDITOR_STATE_SCHEMA_VERSION = 1

/** 帧作用域切片：当前打开画布的编辑器状态（工程数据快照的 frames[帧名] 值） */
export interface CanvasEditorState {
    /**
     * 参考线（场景坐标）：id 是会话内自增值、无持久语义——export 原样带出，
     * restore 端清空后逐条 addGuide 重取号，快照 id 出方向即失效。
     */
    guides: readonly Guide[]
    /** 锁定根层路径集合（随工程数据持久化，仍零 wire 面） */
    lockedPaths: readonly LayerPath[]
}

/** 编辑器级偏好：跨文档、跨会话内核自持（工程数据快照的 prefs 桶，分类学终裁两项） */
export interface EditorPrefsState {
    rulersVisible: boolean
    anchorExpanded: boolean
}

/** 快照 guide 的恢复形：id 已剥（无持久语义），只余 addGuide 入参两字段 */
export interface GuidePlacement {
    orientation: GuideOrientation
    position: number
}

/** 校验产出的恢复切片：guide 已剥壳为 addGuide 入参形（快照 id 丢弃），路径外壳原样 */
export interface ParsedEditorStateSlice {
    guides: readonly GuidePlacement[]
    lockedPaths: readonly LayerPath[]
}

/**
 * 轻结构校验（restoreEditorState 的唯一入口）：形状不合法整体拒（返 null，调用
 * 方返 false 宿主记因），合法但内容悬空不算拒——锁定路径只验「是数组」外壳，
 * 可解析性（越界/形态与文档不符）归 pruneDanglingPaths 按文档裁定。宽容读：
 * 切片与 guide 条目的未知键忽略、guide id 不校验不透传（重排重取号，快照 id 无
 * 持久语义）；guides/lockedPaths 两载荷键缺一或非数组即形状不完整，整体拒。
 * 载荷来自宿主层 JSON 快照（存储端零校验），类型层的形状信任不了，运行时验。
 */
export function parseCanvasEditorState(state: CanvasEditorState): ParsedEditorStateSlice | null {
    const raw = state as unknown
    if (raw === null || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    if (!Array.isArray(source.guides) || !Array.isArray(source.lockedPaths)) return null
    const guides: GuidePlacement[] = []
    for (const entry of source.guides as unknown[]) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null
        const { orientation, position } = entry as Record<string, unknown>
        if (orientation !== 'horizontal' && orientation !== 'vertical') return null
        if (typeof position !== 'number' || !Number.isFinite(position)) return null
        guides.push({ orientation, position })
    }
    for (const path of source.lockedPaths as unknown[]) {
        if (!Array.isArray(path)) return null
    }
    return { guides, lockedPaths: source.lockedPaths as readonly LayerPath[] }
}
