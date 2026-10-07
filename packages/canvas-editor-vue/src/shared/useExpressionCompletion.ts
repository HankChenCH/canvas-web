/**
 * 表达式补全浮层控件（content-completion 工单 04，spec §3 交互规格）。
 *
 * shared 域切片（表达式就地编辑 spec 决策 5 迁入）：属性面板（PropertyField）
 * 与画布文本编辑两域共用——域间禁横引，跨域消费收口 shared。
 *
 * composable 绑定宿主 input/textarea（原生 addEventListener，字段控件模板零
 * 改动），配 ExpressionCompletionPopup（Teleport 到 body）呈现。行为面：
 * - 触发：表达式态输入 `{{` 自动、片段内 `.`（经 input 事件）刷新候选、
 *   Ctrl/Cmd+Space 手动触发（旁路 partial 前缀过滤出全量）；光标移动
 *   （click/keyup）只做跟踪——保持/重定位/关闭，不主动开。
 * - 关闭：Esc、失焦、点外（document mousedown，浮层根拦 mousedown 免夺焦
 *   免误关）、光标离开片段（输入 `}}` 后光标出片段即同路关闭——扫描语义
 *   的 closed 片段判定天然覆盖）、候选空、enabled 切 false。候选空的唯一例外：
 *   候选源携带 open 信号（开放映射节点，工单 10）——浮层照开渲染「动态字段，
 *   键由模板定义」占位提示行（不可接受、不进导航序，仅解释无候选的原因，
 *   行业惯例：无候选但不阻断），上述关闭路径照常收口。
 * - 接受：↑↓ 循环导航、Enter/Tab、鼠标点选；在片段表达式末尾把 partial 换成
 *   候选段（completion.ts 手术），随后对宿主派发既有 input（实时合步）+
 *   change（收口一步历史）事件——与手工输入同路，提交管线零改动。
 * - IME 守卫在事件入口最前沿：合成期（compositionstart 起）及
 *   isComposing/keyCode 229 的键全是候选确认/预编辑操作，接受、导航、刷新
 *   一律不触发（延伸 TextareaField/TextField 既有 composing 守卫语义）；
 *   compositionend 后键位恢复。
 * - 锚点：mirror div 测光标（completionAnchor.ts），浮层 fixed 定位在光标
 *   下方；scroll（捕获，任意滚动容器）/resize 重算；光标贴近视口右缘时按
 *   浮层实测宽左移收口（右缘不越 innerWidth——量不到宽按原锚放，首开浮层
 *   未渲染延一拍补量）。
 * - 自动配对（工单 07）：表达式态键入第二个 `{` 自动补出 `}}`、光标回移片段
 *   内，候选浮层经 input 路径自然弹出（未闭合 `{{` 的实害是静默错：文本层按
 *   字面渲染、二维码层把原文编进码——配对在源头消除整类失误）。只认键入插入
 *   （composing 合成 / paste 不配）；静态态不配（`{{` 是字面）；空片段 `{{}}`
 *   退格整对删除（放弃一步退出）；`}` 越过不重复（下一字符已是 `}` 时跳过）。
 *   补对/删对只派发 input（实时合步，与手工连打同粒度，change 归接受/失焦）。
 *
 * 静态态零补全：enabled 为假时全部事件入口短路（候选源零调用）。
 */
import { nextTick, onMounted, onScopeDispose, reactive, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import {
    expressionFragmentAtCursor,
    scanExpressionFragments,
    type ExpressionScanFragment,
    type ExpressionScanOpen,
} from '@hankchen/canvas-editor'

import { applyCompletion, type CompletionItem, type CompletionSource } from './completion'
import { measureCursorAnchor } from './completionAnchor'

/** 浮层呈现态（传给 ExpressionCompletionPopup 的 state prop） */
export interface ExpressionCompletionState {
    open: boolean
    items: readonly CompletionItem[]
    activeIndex: number
    /** 视口坐标（fixed 定位；光标下缘 + 间隙） */
    top: number
    left: number
    /**
     * 开放映射占位提示（D10，工单 10）：候选来源节点标 open 时为 true——浮层渲染
     * 「动态字段，键由模板定义」占位提示行（不可接受、不进导航序，仅解释无候选的
     * 原因）。信号与候选空否无关（宿主合入 properties 的键照常枚举），true 时提示
     * 行恒在场；items 导航/接受只认候选条目，提示行不在其中。
     */
    openMapping: boolean
}

/** 光标下缘与浮层上缘的间隙（px） */
const ANCHOR_GAP = 4

/** 光标移动键：浮层开着时 keyup 重新判定光标是否仍在片段；↑↓ 归浮层导航不在此列 */
const CURSOR_MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

export function useExpressionCompletion(options: {
    /** 宿主输入元素（textarea/input），模板 ref 传入 */
    target: Ref<HTMLTextAreaElement | HTMLInputElement | null>
    /** 表达式态开关（静态态恒闭）；响应式 getter/ ref 均可 */
    enabled: MaybeRefOrGetter<boolean>
    /** 候选源（纯函数注入缝，见 completion.ts） */
    resolve: CompletionSource
    /** 浮层根元素（可选；在场时按其量宽做视口右缘收口） */
    popupEl?: MaybeRefOrGetter<HTMLElement | null>
    /**
     * `{{` 自动配对门（工单 07，可选）：与 enabled 分离——表达式态未注入
     * schema 也配对（配对防的是未闭合静默错，不依赖候选声明）；缺省回落
     * enabled，调用方未分门时跟随浮层开关。
     */
    pairing?: MaybeRefOrGetter<boolean>
    /**
     * 锚点测量缩放（表达式就地编辑工单 03，可选）：宿主整体在 CSS transform
     * scale 系时传呈现缩放（画布 textarea = zoom），mirror 布局偏移按其折算；
     * 缺省 1（面板侧宿主无变换，行为不变）。
     */
    scale?: MaybeRefOrGetter<number>
}): {
    /** 呈现态（reactive），传给浮层组件 */
    popup: ExpressionCompletionState
    /** 接受高亮项（或指定项）；浮层点选经此回接 */
    accept: (index?: number) => void
} {
    const popup = reactive<ExpressionCompletionState>({
        open: false,
        items: [],
        activeIndex: 0,
        top: 0,
        left: 0,
        openMapping: false,
    })

    let el: HTMLTextAreaElement | HTMLInputElement | null = null
    let composing = false
    /** 最近一次刷新时的片段与 partial（接受手术的锚；每次刷新重算） */
    let current: { fragment: ExpressionScanFragment | ExpressionScanOpen; partial: string } | null = null

    function close(): void {
        popup.open = false
        popup.items = []
        popup.activeIndex = 0
        popup.openMapping = false
        current = null
    }

    function reposition(): void {
        if (!popup.open || !el) return
        // scale 折算（工单 03）：画布 textarea 整体在 transform: scale(zoom) 系，
        // mirror 布局偏移按缩放折算；缺省 1（面板宿主无变换）恒等
        const anchor = measureCursorAnchor(el, toValue(options.scale ?? 1))
        popup.top = anchor.bottom + ANCHOR_GAP
        popup.left = clampToViewport(anchor.left)
    }

    /** 浮层右缘与视口右缘的最小留白（px；与锚点间隙同级的最小呼吸位） */
    const VIEWPORT_MARGIN = 4

    /**
     * 视口右缘收口：光标贴近视口右缘时浮层左移，右缘不越 innerWidth；视口比
     * 浮层还窄时钉在左缘。量不到宽（首帧未渲染/降级）按原锚放——首开路径由
     * recompute 延一拍补量（fixed 定位于 body，无 containing block 干扰）。
     */
    function clampToViewport(left: number): number {
        const node = options.popupEl ? toValue(options.popupEl) : null
        const width = node?.offsetWidth ?? 0
        if (width <= 0) return left
        return Math.max(0, Math.min(left, window.innerWidth - VIEWPORT_MARGIN - width))
    }

    /**
     * 按当前 DOM 值与光标重算浮层态。openAllowed=false（光标移动跟踪）时不
     * 主动开；full=true（Ctrl+Space）旁路 partial 前缀过滤。
     */
    function recompute(openAllowed: boolean, full = false): void {
        if (!toValue(options.enabled)) {
            close()
            return
        }
        const node = el
        if (!node) {
            close()
            return
        }
        const value = node.value
        const cursor = node.selectionStart ?? value.length
        const fragment = expressionFragmentAtCursor(scanExpressionFragments(value), cursor)
        if (!fragment) {
            close() // 光标离开片段（含输入 }} 后）→ 关闭
            return
        }
        const result = options.resolve(fragment.expr)
        if (!result) {
            close()
            return
        }
        const shown = full ? result.candidates : result.candidates.filter((item) => item.segment.startsWith(result.partial))
        // 开放映射（D10，工单 10）：open 信号在场即开浮层——候选空（含 partial 过滤
        // 后空）由占位提示行解释原因（无候选但不阻断），关闭路径照常；非 open 空
        // 候选维持现状（不开）
        if (shown.length === 0 && result.open !== true) {
            close()
            return
        }
        current = { fragment, partial: result.partial }
        if (!popup.open && !openAllowed) return
        popup.items = shown
        popup.activeIndex = 0
        popup.openMapping = result.open === true
        popup.open = true
        reposition()
        // 首开浮层 v-if 下一拍才挂载，此刻量不到宽——延一拍补跑收口（微任务先
        // 于绘制，无闪烁）；已开刷新路径元素在场，同步收口已生效，补跑幂等
        void nextTick(reposition)
    }

    function accept(index?: number): void {
        const node = el
        if (!popup.open || composing || !node || !current) return
        const item = popup.items[index ?? popup.activeIndex]
        if (!item) return
        const applied = applyCompletion(node.value, current.fragment, current.partial, item.segment)
        if (!applied) {
            close() // 值与浮层状态漂移：手术拒绝，安全收口
            return
        }
        node.value = applied.value
        node.setSelectionRange(applied.cursor, applied.cursor)
        // 与手工输入同路：替换走既有 input（实时合步）+ change（收口一步历史）
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
        close()
    }

    /* ---- 自动配对（工单 07）---- */

    /** 配对门（缺省回落 enabled） */
    function pairingOn(): boolean {
        return toValue(options.pairing ?? options.enabled)
    }

    /** 配对系键位的公共前置：宿主在场 + 光标折叠；返回光标位或 null */
    function collapsedCursor(node: HTMLTextAreaElement | HTMLInputElement): number | null {
        const cursor = node.selectionStart
        if (cursor === null || cursor !== node.selectionEnd) return null
        return cursor
    }

    /** 配对再入闸：补对/删对派发的 input 会同步重入 onInput，置位期间不再判配 */
    let pairingDispatch = false

    /**
     * `{{` 自动配对：input 恰以 `{{` 收尾（键入第二个 `{` 落定）时补出 `}}`、
     * 光标回移片段内。只认键入插入——inputType 白名单 insertText（合成落定/
     * paste/拖放/自动替换各有专名不配），未带类型（程序派发/退化事件，含空串）
     * 视同键入；合成期与 isComposing 已在 onInput 入口短路。光标之后串内已有
     * `}}` 时不配（本地快速判定，比内核扫描宽松：不管 `}}` 归属哪个片段）——
     * 防的是连打第三个 `{` 把既有配对撞成不均衡串；误判的代价只是退回字面键入
     * 的旧行为。补出文本只派发 input（实时合步）：change 归接受/失焦，undo
     * 粒度与手工连打一致（配对与随后接受合一步历史，工单 07「同路不回归」）。
     */
    function autoPairOnBraces(event: Event): void {
        if (pairingDispatch || !pairingOn()) return
        const node = el
        if (!node) return
        const inputType = (event as InputEvent).inputType
        if (inputType !== undefined && inputType !== '' && inputType !== 'insertText') return
        const cursor = collapsedCursor(node)
        if (cursor === null || cursor < 2) return
        const value = node.value
        if (!value.startsWith('{{', cursor - 2)) return
        if (value.includes('}}', cursor)) return
        pairingDispatch = true
        node.value = `${value.slice(0, cursor)}}}${value.slice(cursor)}`
        node.setSelectionRange(cursor, cursor)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        pairingDispatch = false
    }

    /**
     * 空片段退格整对删除：光标夹在 `{{}}` 中间时退格删整对（编辑器惯例，放弃
     * 配对一步退出）。同样只删输入（实时合步），删除后浮层经 input 路径自然
     * 收口（光标处无片段）。删对同样置再入闸——删除产物若恰以 `{{` 收尾
     * （如 `{{{{}}` 删外层对），重入不得立刻再配，否则退格看似失灵。返回是否
     * 已拦截（调用方短路后续键位处理）。
     */
    function unpairOnBackspace(event: KeyboardEvent): boolean {
        if (!pairingOn()) return false
        const node = el
        if (!node) return false
        const cursor = collapsedCursor(node)
        if (cursor === null || cursor < 2) return false
        const value = node.value
        if (!value.startsWith('{{', cursor - 2) || !value.startsWith('}}', cursor)) return false
        event.preventDefault()
        pairingDispatch = true
        node.value = value.slice(0, cursor - 2) + value.slice(cursor + 2)
        node.setSelectionRange(cursor - 2, cursor - 2)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        pairingDispatch = false
        return true
    }

    /**
     * `}` 越过不重复（编辑器惯例，工单 07 惯例可选条目）：下一字符已是 `}` 时
     * 键入不重复插入、光标越过。文本零变化故零派发；光标出片段经 recompute
     * 跟踪路径收口（不主动开）。
     */
    function skipCloseBrace(event: KeyboardEvent): boolean {
        if (!pairingOn()) return false
        const node = el
        if (!node) return false
        const cursor = collapsedCursor(node)
        if (cursor === null) return false
        if (node.value[cursor] !== '}') return false
        event.preventDefault()
        node.setSelectionRange(cursor + 1, cursor + 1)
        recompute(false)
        return true
    }

    /* ---- 事件处理（IME 守卫在各入口最前沿）---- */

    function onInput(event: Event): void {
        if (composing || (event as InputEvent).isComposing) return
        autoPairOnBraces(event)
        recompute(true)
    }

    function onCompositionStart(): void {
        composing = true
    }

    function onCompositionEnd(): void {
        composing = false
        recompute(true) // 合成文本落定后按新值刷新
    }

    function guarded(event: KeyboardEvent): boolean {
        return composing || event.isComposing || event.keyCode === 229
    }

    function onKeydown(event: KeyboardEvent): void {
        if (guarded(event)) return
        if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            recompute(true, true)
            return
        }
        // 配对系键位（工单 07）先于浮层导航：空片段退格删对 / } 越过不依赖浮层开合
        if (event.key === 'Backspace' && unpairOnBackspace(event)) return
        if (event.key === '}' && skipCloseBrace(event)) return
        if (!popup.open) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const count = popup.items.length
            if (count > 0) {
                popup.activeIndex = (popup.activeIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
            }
            return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            accept()
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            close()
        }
    }

    function onKeyup(event: KeyboardEvent): void {
        if (!popup.open || guarded(event)) return
        if (CURSOR_MOVE_KEYS.includes(event.key)) recompute(false)
    }

    function onClick(): void {
        if (!composing) recompute(false)
    }

    function onBlur(): void {
        close()
    }

    /** 点外关闭（bubble 相；浮层根 @mousedown.stop 自拦；宿主内点击归光标判定） */
    function onDocMousedown(event: MouseEvent): void {
        if (!popup.open || event.target === el) return
        close()
    }

    function onViewportChange(): void {
        reposition()
    }

    /** 事件表：bind/unbind 单一事实源（新增/删事件只改这里；键盘处理器参数收窄，入表时擦除） */
    const LISTENERS: readonly (readonly [string, EventListener])[] = [
        ['input', onInput],
        ['keydown', onKeydown as EventListener],
        ['keyup', onKeyup as EventListener],
        ['click', onClick],
        ['blur', onBlur],
        ['compositionstart', onCompositionStart],
        ['compositionend', onCompositionEnd],
    ]

    // addEventListener 的具名事件映射重载只在单类型上生效，绑定面收窄 HTMLElement
    function bind(node: HTMLElement): void {
        for (const [type, listener] of LISTENERS) node.addEventListener(type, listener)
    }

    function unbind(node: HTMLElement): void {
        for (const [type, listener] of LISTENERS) node.removeEventListener(type, listener)
    }

    /** 换绑宿主（去重：挂载期 onMounted 与 ref watch 会先后到达同一节点） */
    function attach(node: HTMLTextAreaElement | HTMLInputElement | null): void {
        if (el === node) return
        if (el) unbind(el)
        el = node
        if (node) bind(node)
    }

    // onMounted 保证 mount() 返回即已可收事件（pre-flush watch 要到下一个微任务才跑）
    onMounted(() => attach(options.target.value))
    watch(options.target, (node) => attach(node))
    watch(
        () => toValue(options.enabled),
        (on) => {
            if (!on) close()
        },
    )

    document.addEventListener('mousedown', onDocMousedown)
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    onScopeDispose(() => {
        if (el) unbind(el)
        document.removeEventListener('mousedown', onDocMousedown)
        window.removeEventListener('scroll', onViewportChange, true)
        window.removeEventListener('resize', onViewportChange)
    })

    return { popup, accept }
}
