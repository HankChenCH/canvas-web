/**
 * headless 编辑器内核的 observable store。
 *
 * - doc 分支：解码后的领域画布（@hankchen/canvas 的 Canvas），唯一事实源。
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

import type { Canvas, LayerBox, LayerType } from '@hankchen/canvas'

import type { Point, Rect, Viewport } from '../spatial/camera'
import type { Guide, SnapAxis } from '../spatial/snap'
import type { ResizeHandle } from '../spatial/resize'
import { pathsEqual, type LayerPath } from '../shared/layerPath'
import type { ExpressionSchemaNode } from '../shared/expressionSchema'
import type { ResourceStatusMap } from '../shared/resourceStatus'

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
    /**
     * Alt+拖快速复制（alt-drag-paste 工单 01）：beginDrag 起手一次性判定（源可
     * 复制才置位，缺省/undefined = 普通拖动）。会话内定死——中途无修饰键读数，
     * 松/按 Alt 均不影响（spec 决策 2，与「手势模式 pointerdown 一次性定死」同构）。
     */
    copy?: boolean
    /**
     * copyMode 副本尚未插入（首移未越过死区）：drag.path 仍是源层、源层不动；
     * 首移越阈（ALT_DRAG_DEAD_ZONE_SCREEN_PX）单事务插入副本后置 false，path/
     * startPosition 重指向副本（换基准）。普通拖动恒 undefined。
     */
    copyPending?: boolean
}

/**
 * 缩放会话（ui 分支，工单 07）：目标路径 + 八柄 + 起点场景坐标 + 起始解析盒
 * （吸附求位与几何基准，spatial/resize 消费）。会话对象住 ui 分支，文档只收
 * resizeTo 的合并事务；与 drag 会话互斥（手势起点一次性定死）。
 */
export interface ResizeGesture {
    path: LayerPath
    handle: ResizeHandle
    startScene: Point
    /**
     * 缩放开始时的绝对解析盒（几何/吸附基准）：对缘固定、移动缘 = 起始缘 +
     * 位移；auto 标志采纳把本盒解析尺寸落地为声明值（首个位移事务）。
     */
    startBox: LayerBox
}

/**
 * 画拉建层橡皮筋会话（ui 分支，drag-create 工单 01）：武装层型 + 起点场景坐标
 * + 当前点 + 橡皮筋矩形。拖拽期纯视觉——文档零变更（spec 决策 4，比先建后
 * resize 少踩零尺寸渲染/命中两坑），rect 是 createTo 求位产物（两点正规化 +
 * QR 钳方 + 吸附修正并入），overlay 直读绘制虚线矩形与 W×H 气泡；落库在
 * endCreate 单事务（返回新层路径），与 drag/resize 会话互斥。
 */
export interface CreateGesture {
    /** 本次画拉的层型（beginLayerCreate 时从 armedCreate 捕获，会话内定死） */
    type: LayerType
    /** 起点场景坐标（两点正规化与死区判定基准） */
    startScene: Point
    /** 当前指针场景坐标 */
    currentScene: Point
    /** 当前橡皮筋矩形（吸附修正已并入），绑定层 overlay 直读 */
    rect: Rect
}

/**
 * 文本编辑会话（ui 分支，工单 11）：编辑中的文本层路径。live 文本住在绑定层的
 * textarea（非受控），提交经 commitTextEdit 一次性落文档——「每个拼音音节一个
 * undo」被会话缓冲天然避免（impl 研究 §2.4）。
 *
 * expression 是内容类型会话标志（canvas-web-expression-editing 工单 01，spec 决策
 * 2）：beginTextEdit 按进入瞬间 `layer.expression !== null` 锚定的会话快照（与
 * verticalAnchorY「进入时计、编辑中稳定」同门），裁决提交去向（表达式会话含合法
 * 片段走标记写，字面会话恒字面写）与补全 enabled。住 ui 分支不进历史；面板编辑
 * 中改动 layer.expression 不回写标志（打标是显式动作，快照是提交去向的裁决依据）；
 * 内容类型 pill 切换仅翻转本标志（零文档变更零历史步）。
 */
export interface TextEditingSession {
    path: LayerPath
    expression: boolean
}

/**
 * 查找替换会话（canvas-web-find-replace 工单 01，CONTEXT「查找替换」词条）：
 * 面板开合（open）与查找/替换两词 + 命中游标（派生命中列表的偏移下标）。匹配
 * 列表派生不驻留——每次从 doc + query 现算，游标越界在读侧钳位；同文档内
 * 关开（closeFind→beginFind）保留查询词与游标。会话态族——不进历史、不写
 * graph；openDocument 换文档整体重置（换文档带旧查询词开面板反而怪）。
 */
export interface FindSession {
    open: boolean
    query: string
    replacement: string
    cursor: number
}

/** 查找会话缺省态（初始与 openDocument 重置同源） */
const initialFindSession = (): FindSession => ({ open: false, query: '', replacement: '', cursor: 0 })

export interface EditorUi {
    viewport: Viewport
    /** 当前选中图层路径（数组路径，patch path 前缀）；null = 无选择 */
    selection: LayerPath | null
    /** 悬停图层路径（gizmo hover 高亮）；null = 无悬停 */
    hovered: LayerPath | null
    /** 进行中的拖动会话；null = 无拖动 */
    drag: DragGesture | null
    /** 进行中的缩放会话（工单 07 八柄）；null = 无缩放 */
    resize: ResizeGesture | null
    /**
     * 画拉建层武装态（drag-create 工单 01，CONTEXT「武装」词条）：面板新增项/
     * 层型快捷键选定的一次性待命层型——下一次画布按下即开画拉，建层或 Esc 即
     * 解除。无粘性工具态（spec 决策 2）；openDocument 重置。
     */
    armedCreate: LayerType | null
    /** 进行中的画拉建层橡皮筋会话（拖拽期纯视觉，文档零变更）；null = 无 */
    create: CreateGesture | null
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
    /**
     * 锁定根层路径集合（canvas-web-layer-lock 工单 01）：会话级锁定态——锁定的
     * 根层整子树退出画布命中面，变更类动作（拖动起点/删除/微调——微调已随
     * kbd-nav 工单 02 接入同一谓词）在内核空转，属性编辑/显隐/改名/z 序等刻意通道
     * 不受限。零契约面：不进历史、不写 graph、wire 零键、渲染产物不变
     * （红线 3 同门）；openDocument 换文档重置（guides 同门——锁定是文档内容
     * 防护非面板偏好，跨文档路径悬空会误锁他人）。锁定恒为根层路径，子树
     * 命中按前缀判定收口 isLockedPath。
     */
    lockedPaths: readonly LayerPath[]
    /**
     * 查找替换会话（canvas-web-find-replace 工单 01）：面板开合 + 两词 + 游标的
     * 会话态族——不进历史、不写 graph，openDocument 换文档重置（guides 同门）。
     * 命中列表不在此驻留：由 editing 域扫描纯函数从 doc + query 派生（EditorSession
     * listFindMatches 查询口），overlay 高亮与查找条计数同源消费。
     */
    find: FindSession
    /**
     * 资源物化状态切片（placeholder-padding-hint 工单 02）：key = 图片 src 原串、
     * value = 物化三态，宿主从渲染端物化状态机桥接注入（整体替换，散列键反解在
     * 宿主桥）。占位态判定的物化维度事实源——只住会话态：不进历史、不写 graph、
     * wire 零键（红线 3 延伸，物化状态机切片的 ui 分支落点）；openDocument 换
     * 文档重置（资源态描述当次文档，跨文档旧 src 条目无意义）。
     */
    resourceStatuses: ResourceStatusMap
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

/**
 * doc 通知契约注记（canvas-web-layer-lock 工单 03 目验同族三处收口）：openDocument
 * 整体重建 uiValue（selection/hovered/renaming/lockedPaths 等重置）但只发 doc 通知、
 * 不逐分支发 ui 通知——订阅侧凡镜像了会被 openDocument 重置的 ui 分支，必须在 doc
 * 通知里一并重读（useSelection 先例，useLayerPanel/usePropertyPanel 同门）。
 */

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

/** 锁定集合内容等（逐路径值等，toggleLayerLock/重映射路径的短路比较） */
function lockedPathsEqual(a: readonly LayerPath[], b: readonly LayerPath[]): boolean {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (!pathsEqual(a[i]!, b[i]!)) return false
    }
    return true
}

/** 资源物化状态内容等（逐键值等，宿主桥整体替换的短路比较——键序无关） */
function resourceStatusesEqual(a: ResourceStatusMap, b: ResourceStatusMap): boolean {
    if (a === b) return true
    const aKeys = Object.keys(a)
    if (aKeys.length !== Object.keys(b).length) return false
    for (const key of aKeys) {
        if (a[key] !== b[key]) return false
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
        resize: null,
        armedCreate: null,
        create: null,
        editing: null,
        renaming: null,
        anchorExpanded: false,
        dataSourceSchema: null,
        guides: [],
        rulersVisible: true,
        snapAxes: [],
        lockedPaths: [],
        find: initialFindSession(),
        resourceStatuses: {},
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
     *  参考线/锁定集合/查找会话/建层武装与画拉会话随当次会话清空（对位轴/文档内容防护/
     *  查询词/待命层型不跨文档），标尺显隐作为偏好保留 */
    openDocument(canvas: Canvas): void {
        this.docValue = canvas
        this.undoSteps = []
        this.redoSteps = []
        this.uiValue = {
            ...this.uiValue,
            selection: null,
            hovered: null,
            drag: null,
            resize: null,
            armedCreate: null,
            create: null,
            editing: null,
            renaming: null,
            guides: [],
            snapAxes: [],
            lockedPaths: [],
            find: initialFindSession(),
            resourceStatuses: {},
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

    /** 缩放会话开始/结束（null，工单 07）；会话对象住 ui 分支，文档只收缩放事务 */
    setResize(gesture: ResizeGesture | null): void {
        this.uiValue = { ...this.uiValue, resize: gesture }
        this.notify({ scope: 'ui', branch: 'resize' })
    }

    /** 建层武装置/解除（null，drag-create 工单 01）；标量值等短路（重复武装同型不通知） */
    setArmedCreate(type: LayerType | null): void {
        if (this.uiValue.armedCreate === type) return
        this.uiValue = { ...this.uiValue, armedCreate: type }
        this.notify({ scope: 'ui', branch: 'armedCreate' })
    }

    /** 画拉橡皮筋会话开始/更新/结束（null）；会话对象住 ui 分支，落库在 endCreate 单事务 */
    setCreate(gesture: CreateGesture | null): void {
        this.uiValue = { ...this.uiValue, create: gesture }
        this.notify({ scope: 'ui', branch: 'create' })
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

    /** 锁定集合替换（toggleLayerLock 收口，翻转逻辑在会话门面）；内容等短路（集合未变不重绘） */
    setLockedPaths(paths: readonly LayerPath[]): void {
        if (lockedPathsEqual(this.uiValue.lockedPaths, paths)) return
        this.uiValue = { ...this.uiValue, lockedPaths: paths }
        this.notify({ scope: 'ui', branch: 'lockedPaths' })
    }

    /**
     * 查找会话替换（beginFind/closeFind/输入写入经会话门面收口到这里）；内容等
     * 短路（重复开合/同词写入不通知）。仅 ui 通知，不参与历史。
     */
    setFind(find: FindSession): void {
        const current = this.uiValue.find
        if (
            current.open === find.open
            && current.query === find.query
            && current.replacement === find.replacement
            && current.cursor === find.cursor
        ) {
            return
        }
        this.uiValue = { ...this.uiValue, find }
        this.notify({ scope: 'ui', branch: 'find' })
    }

    /**
     * 资源物化状态替换（placeholder-padding-hint 工单 02）：宿主从渲染端物化状态机
     * 桥接注入的唯一写入口，整体替换语义；内容等短路（同态快照不惊动订阅方，
     * 桥接的高频整体替换零噪声）。仅 ui 通知，不参与历史、不写 graph（红线 3 延伸）。
     */
    setResourceStatuses(statuses: ResourceStatusMap): void {
        if (resourceStatusesEqual(this.uiValue.resourceStatuses, statuses)) return
        this.uiValue = { ...this.uiValue, resourceStatuses: statuses }
        this.notify({ scope: 'ui', branch: 'resourceStatuses' })
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
