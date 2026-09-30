/**
 * headless 编辑器内核的 observable store。
 *
 * - doc 分支：解码后的领域画布（@hankchen/canvas-next 的 Canvas），唯一事实源。
 *   写入口唯一：transact —— immer produceWithPatches 产物浅替换 + patch 广播。
 *   历史（工单 08 双栈）：mergeKey 相同的连续事务合并为一步（一次拖动 = 一步
 *   历史），pointerup 后 closeMerge 闭合；undo/redo 手写双栈回放 patch，
 *   undo 后新事务改写 redo 栈（Figma 语义），上限 100 步、不跨会话。
 *   patch 本身可 JSON 序列化（协作的将来之路，v1 不做协作）。
 * - ui 分支：视口/选择/悬停/拖动会话等易变状态，整体替换、**永不进历史**
 *   （红线 3 的编辑器延伸：派生状态只住这里，不写文档）。
 * - 通知携带变更位置（scope/branch）与 patch 组，绑定层与渲染调度据此细分脏区。
 */
import { applyPatches, enablePatches, produceWithPatches, setAutoFreeze, type Draft, type Patch } from 'immer'

import type { Canvas, LayerBox } from '@hankchen/canvas-next'

import type { Point, Viewport } from '../spatial/camera'
import type { Guide, SnapAxis } from '../spatial/snap'
import { pathsEqual, type LayerPath } from '../shared/layerPath'
import type { ExpressionSchemaNode } from '../shared/expressionSchema'

enablePatches()
// 关闭 immer 自动冻结：文档树以「不可变 + 结构共享」语义流转（引用相等即未变），
// 该语义不依赖冻结；而绑定层（Vue）的响应式系统会把宿主对象封进 Proxy，冻结树
// 一旦被代理封装，immer 后续 draft/freeze 读取子属性即触发 V8 Proxy 不变量报错
// （工单 09 属性面板实测：autoFreeze 开启时面板提交必现 "get on proxy" 崩溃）。
// 防误改由唯一写入口 transact 的纪律保证。
setAutoFreeze(false)

/** 拖动会话（ui 分支）：目标路径 + 起点场景坐标 + 起始 position 偏移 + 起始盒 */
export interface DragGesture {
    path: LayerPath
    startScene: Point
    startPosition: { x: number; y: number }
    /**
     * 拖动开始时的绝对盒（吸附求位基准，工单 01）：盒坐标对 position 线性，
     * 暂定盒 = startBox + 本步位移；住会话态，文档零接触。
     */
    startBox: LayerBox
}

/**
 * 文本编辑会话（ui 分支，工单 11）：编辑中的文本层路径。live 文本住在绑定层的
 * textarea（非受控），提交经 commitTextEdit 一次性落文档——「每个拼音音节一个
 * undo」被会话缓冲天然避免（impl 研究 §2.4）。
 */
export interface TextEditingSession {
    path: LayerPath
}

export interface EditorUi {
    viewport: Viewport
    /** 当前选中图层路径（数组路径，patch path 前缀）；null = 无选择 */
    selection: LayerPath | null
    /** 悬停图层路径（gizmo hover 高亮）；null = 无悬停 */
    hovered: LayerPath | null
    /** 进行中的拖动会话；null = 无拖动 */
    drag: DragGesture | null
    /** 进行中的文本编辑会话；null = 非编辑态 */
    editing: TextEditingSession | null
    /**
     * 重命名编辑会话（layer-panel-ux 工单 09）：正在行内改名的根层路径。与
     * editing 同款会话语义——住 ui 分支不进历史，提交经 commitRename 漏斗一次
     * 落文档；null = 非重命名态。
     */
    renaming: LayerPath | null
    /**
     * 属性面板锚点折叠区开合（layer-panel-ux 工票 03）：默认收起，会话内记忆
     * （与 viewport 同款的面板偏好——openDocument 换文档不重置，永不进历史）。
     */
    anchorExpanded: boolean
    /**
     * 数据源 schema 声明（content-completion 工单 03/08，D2 宿主随会话注入）：
     * 编译产物形状树或降级 null（根级结构性拒绝，注入期经
     * normalizeExpressionSchemaSource 一次性收口 + console 警告；局部故障不拒绝，
     * 该节点降叶子 + 注入期汇总告警一次，树其余照常服务）。只住会话态——
     * 不进 graph、不落 localStorage、不进 wire（红线 3 延伸）；openDocument 换
     * 文档不重置（声明随会话，重注入/清除走同一入口）。
     */
    dataSourceSchema: ExpressionSchemaNode | null
    /**
     * 参考线（ruler-guides-snap 工单 01，ADR 0012）：使用者从标尺拖出的会话级
     * 对位轴（水平/垂直、场景坐标）。零契约面——不进历史、不写 graph、保存零
     * 改动；openDocument 换文档重置（当次编辑会话语义）。
     */
    guides: readonly Guide[]
    /**
     * 标尺显隐（ruler-guides-snap 工单 01）：缺省常显，⇧R 经会话 toggleRulers
     * 翻转。与视口同款的面板偏好——openDocument 换文档保留，永不进历史。
     */
    rulersVisible: boolean
    /**
     * 当次拖动命中的吸附轴（ruler-guides-snap 工单 01）：dragTo 求位的副产物，
     * 供 canvas 域画贯穿吸附线——瞬时回显，松手即清空（endDrag），非拖动态为空。
     */
    snapAxes: readonly SnapAxis[]
}

/** 一步历史：一次（或同键合并的多次）文档事务的正向/逆向 patch 组 */
export interface HistoryStep {
    /** 事务合并键（拖动/滑杆）；null = 已闭合、不再合并 */
    mergeKey: string | null
    patches: Patch[]
    inversePatches: Patch[]
}

export type EditorChange =
    | { scope: 'doc'; patches: Patch[]; inversePatches: Patch[] }
    | { scope: 'ui'; branch: keyof EditorUi }

/** undo 栈深度上限：更旧的事务被丢弃（不跨会话，会话内也只回溯有限步） */
export const MAX_HISTORY_STEPS = 100

type Listener = (change: EditorChange) => void

/** 文档事务：收到 doc 的 immer draft，原位改字段即可 */
export type DocRecipe = (draft: Draft<Canvas>) => void

export interface TransactOptions {
    /** 同键连续事务合并为一步历史（拖动的每次 pointermove 传同键） */
    mergeKey?: string
}

/** 命中吸附轴内容等（拖动高频路径的短路比较，轴数至多 2） */
function snapAxesEqual(a: readonly SnapAxis[], b: readonly SnapAxis[]): boolean {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        const x = a[i]!
        const y = b[i]!
        if (x.orientation !== y.orientation || x.position !== y.position || x.source !== y.source) return false
    }
    return true
}

export class EditorStore {
    private docValue: Canvas | null = null
    private uiValue: EditorUi = {
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: null,
        hovered: null,
        drag: null,
        editing: null,
        renaming: null,
        anchorExpanded: false,
        dataSourceSchema: null,
        guides: [],
        rulersVisible: true,
        snapAxes: [],
    }
    /** undo 栈：已提交步，栈尾最新 */
    private undoSteps: HistoryStep[] = []
    /** redo 栈：被撤销步，栈尾最近一次撤销；transact 落新事务时整体改写 */
    private redoSteps: HistoryStep[] = []
    private readonly listeners = new Set<Listener>()

    get doc(): Canvas | null {
        return this.docValue
    }

    get ui(): EditorUi {
        return this.uiValue
    }

    /** 已提交步（undo 栈，栈尾最新）；可撤销性走 canUndo */
    get history(): readonly HistoryStep[] {
        return this.undoSteps
    }

    get canUndo(): boolean {
        return this.undoSteps.length > 0
    }

    get canRedo(): boolean {
        return this.redoSteps.length > 0
    }

    /** 打开/替换文档：ui 选择/编辑/重命名会话与双向历史一并重置（新文档不继承旧路径/旧事务）；
     *  参考线随当次会话清空（对位轴不跨文档），标尺显隐作为偏好保留 */
    openDocument(canvas: Canvas): void {
        this.docValue = canvas
        this.undoSteps = []
        this.redoSteps = []
        this.uiValue = {
            ...this.uiValue,
            selection: null,
            hovered: null,
            drag: null,
            editing: null,
            renaming: null,
            guides: [],
            snapAxes: [],
        }
        this.notify({ scope: 'doc', patches: [], inversePatches: [] })
    }

    /**
     * 文档事务唯一入口：produceWithPatches 求新树，无变化即空转（不进历史不通知）；
     * 有变化则浅替换 doc、按 mergeKey 合并或追加 undo 栈（超限丢最旧步）、
     * 改写 redo 栈（undo 后的新事务弃用被撤销分支，Figma 语义）、广播 patch 组。
     */
    transact(recipe: DocRecipe, options: TransactOptions = {}): void {
        if (this.docValue === null) return
        const [next, patches, inversePatches] = produceWithPatches(this.docValue, recipe)
        if (patches.length === 0) return

        this.redoSteps = []
        const mergeKey = options.mergeKey ?? null
        const last = this.undoSteps[this.undoSteps.length - 1]
        if (mergeKey !== null && last !== undefined && last.mergeKey === mergeKey) {
            // 正向依序拼接；逆向要后事务先撤，故新组插在前
            this.undoSteps[this.undoSteps.length - 1] = {
                mergeKey,
                patches: [...last.patches, ...patches],
                inversePatches: [...inversePatches, ...last.inversePatches],
            }
        } else {
            this.undoSteps.push({ mergeKey, patches, inversePatches })
            if (this.undoSteps.length > MAX_HISTORY_STEPS) this.undoSteps.shift()
        }

        this.docValue = next
        this.notify({ scope: 'doc', patches, inversePatches })
    }

    /** 撤销最近一步：逆向 patch 回放，该步整体移入 redo 栈 */
    undo(): void {
        const step = this.undoSteps[this.undoSteps.length - 1]
        if (step === undefined || this.docValue === null) return
        this.undoSteps.pop()
        this.redoSteps.push(step)
        // 历史导航打断 mergeKey 会话：新顶步闭合，同键后续事务另起一步
        this.closeMerge()
        this.docValue = applyPatches(this.docValue, step.inversePatches)
        // 通知契约与 transact 对齐：patches = 本次生效变更，inversePatches = 再撤本次所需
        this.notify({ scope: 'doc', patches: step.inversePatches, inversePatches: step.patches })
    }

    /** 重做最近一次撤销：正向 patch 回放，该步移回 undo 栈 */
    redo(): void {
        const step = this.redoSteps[this.redoSteps.length - 1]
        if (step === undefined || this.docValue === null) return
        this.redoSteps.pop()
        this.undoSteps.push(step)
        this.closeMerge()
        this.docValue = applyPatches(this.docValue, step.patches)
        this.notify({ scope: 'doc', patches: step.patches, inversePatches: step.inversePatches })
    }

    /**
     * 闭合拖动/滑杆事务（pointerup、blur 提交，undo/redo 导航同理）：最后一步的
     * mergeKey 清空后，同键的后续事务不再并入。给键名时只在键匹配时闭合
     * （防误伤其它键的开放步）。
     */
    closeMerge(mergeKey?: string): void {
        const last = this.undoSteps[this.undoSteps.length - 1]
        if (last === undefined || last.mergeKey === null) return
        if (mergeKey !== undefined && last.mergeKey !== mergeKey) return
        this.undoSteps[this.undoSteps.length - 1] = { ...last, mergeKey: null }
    }

    /** 视口更新：ui 分支整体替换，旧切片引用保持原值（computed 引用短路依赖此语义） */
    setViewport(viewport: Viewport): void {
        this.uiValue = { ...this.uiValue, viewport }
        this.notify({ scope: 'ui', branch: 'viewport' })
    }

    /** 选中：值等短路（重复点选同一层不重绘） */
    setSelection(path: LayerPath | null): void {
        this.setUiPath('selection', path)
    }

    /** 悬停：值等短路（指针在同一层内移动不重绘覆盖层） */
    setHovered(path: LayerPath | null): void {
        this.setUiPath('hovered', path)
    }

    /** 路径类 ui 切片的共同形状：值等短路 → 整体替换 → 分支通知 */
    private setUiPath(branch: 'selection' | 'hovered' | 'renaming', path: LayerPath | null): void {
        if (pathsEqual(this.uiValue[branch], path)) return
        this.uiValue = { ...this.uiValue, [branch]: path }
        this.notify({ scope: 'ui', branch })
    }

    /** 拖动会话开始/结束（null）；会话对象住 ui 分支，文档只收位置事务 */
    setDrag(gesture: DragGesture | null): void {
        this.uiValue = { ...this.uiValue, drag: gesture }
        this.notify({ scope: 'ui', branch: 'drag' })
    }

    /** 文本编辑会话开始/结束（null）；会话住 ui 分支，文本经 commitTextEdit 一次性落文档 */
    setEditing(session: TextEditingSession | null): void {
        this.uiValue = { ...this.uiValue, editing: session }
        this.notify({ scope: 'ui', branch: 'editing' })
    }

    /** 重命名会话开始/结束（null）；路径类切片，值等短路（重复 begin 同一路径不重绘） */
    setRenaming(path: LayerPath | null): void {
        this.setUiPath('renaming', path)
    }

    /** 锚点折叠区开合：布尔值等短路（重复点击同一态不重绘） */
    setAnchorExpanded(open: boolean): void {
        if (this.uiValue.anchorExpanded === open) return
        this.uiValue = { ...this.uiValue, anchorExpanded: open }
        this.notify({ scope: 'ui', branch: 'anchorExpanded' })
    }

    /**
     * 数据源 schema 声明替换（归一产物或降级 null，校验收口在注入缝不在这里）：
     * 同引用短路（重复注入同一归一产物不惊动订阅方）；仅 ui 通知，不参与重绘
     * 脏标（onStoreChange 对该分支短路）。
     */
    setDataSourceSchema(schema: ExpressionSchemaNode | null): void {
        if (this.uiValue.dataSourceSchema === schema) return
        this.uiValue = { ...this.uiValue, dataSourceSchema: schema }
        this.notify({ scope: 'ui', branch: 'dataSourceSchema' })
    }

    /** 参考线列表替换（增删动作在会话门面收口）；仅 ui 通知，不参与历史 */
    setGuides(guides: readonly Guide[]): void {
        this.uiValue = { ...this.uiValue, guides }
        this.notify({ scope: 'ui', branch: 'guides' })
    }

    /** 标尺显隐：布尔值等短路（重复置同态不重绘） */
    setRulersVisible(visible: boolean): void {
        if (this.uiValue.rulersVisible === visible) return
        this.uiValue = { ...this.uiValue, rulersVisible: visible }
        this.notify({ scope: 'ui', branch: 'rulersVisible' })
    }

    /** 当次命中吸附轴替换（dragTo 副产物 / endDrag 清空）；内容等短路（未命中步不重绘） */
    setSnapAxes(axes: readonly SnapAxis[]): void {
        if (snapAxesEqual(this.uiValue.snapAxes, axes)) return
        this.uiValue = { ...this.uiValue, snapAxes: axes }
        this.notify({ scope: 'ui', branch: 'snapAxes' })
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    private notify(change: EditorChange): void {
        for (const listener of this.listeners) listener(change)
    }
}
