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

import type { Canvas } from '@hankchen/canvas-next'

import type { Point, Viewport } from './camera'
import { pathsEqual, type LayerPath } from './layerPath'

enablePatches()
// 关闭 immer 自动冻结：文档树以「不可变 + 结构共享」语义流转（引用相等即未变），
// 该语义不依赖冻结；而绑定层（Vue）的响应式系统会把宿主对象封进 Proxy，冻结树
// 一旦被代理封装，immer 后续 draft/freeze 读取子属性即触发 V8 Proxy 不变量报错
// （工单 09 属性面板实测：autoFreeze 开启时面板提交必现 "get on proxy" 崩溃）。
// 防误改由唯一写入口 transact 的纪律保证。
setAutoFreeze(false)

/** 拖动会话（ui 分支）：目标路径 + 起点场景坐标 + 起始 position 偏移 */
export interface DragGesture {
    path: LayerPath
    startScene: Point
    startPosition: { x: number; y: number }
}

export interface EditorUi {
    viewport: Viewport
    /** 当前选中图层路径（数组路径，patch path 前缀）；null = 无选择 */
    selection: LayerPath | null
    /** 悬停图层路径（gizmo hover 高亮）；null = 无悬停 */
    hovered: LayerPath | null
    /** 进行中的拖动会话；null = 无拖动 */
    drag: DragGesture | null
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

export class EditorStore {
    private docValue: Canvas | null = null
    private uiValue: EditorUi = { viewport: { x: 0, y: 0, zoom: 1 }, selection: null, hovered: null, drag: null }
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

    /** 打开/替换文档：ui 选择态与双向历史一并重置（新文档不继承旧路径/旧事务） */
    openDocument(canvas: Canvas): void {
        this.docValue = canvas
        this.undoSteps = []
        this.redoSteps = []
        this.uiValue = { ...this.uiValue, selection: null, hovered: null, drag: null }
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
    private setUiPath(branch: 'selection' | 'hovered', path: LayerPath | null): void {
        if (pathsEqual(this.uiValue[branch], path)) return
        this.uiValue = { ...this.uiValue, [branch]: path }
        this.notify({ scope: 'ui', branch })
    }

    /** 拖动会话开始/结束（null）；会话对象住 ui 分支，文档只收位置事务 */
    setDrag(gesture: DragGesture | null): void {
        this.uiValue = { ...this.uiValue, drag: gesture }
        this.notify({ scope: 'ui', branch: 'drag' })
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
