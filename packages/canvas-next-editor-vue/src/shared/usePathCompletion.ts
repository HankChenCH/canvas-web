/**
 * 裸路径（rowsPath）补全浮层控件（rows-path-completion 工单 02，spec §3 交互规格
 * + §4.2，D4/D5）。
 *
 * 表达式补全（useExpressionCompletion）的裸路径同门分轨：候选源注入缝
 * （CompletionSource）、浮层（ExpressionCompletionPopup）、锚点测量
 * （completionAnchor）与接受手术（applyCompletion）原样复用——浮层与表达式面
 * 零改动（D5：表达式补全零回归面）。分叉点只在触发语义（spec §7：两机制分轨，
 * **无任何 {{}} 配对/跳括号/片段扫描逻辑**）：
 * - 宿主整个值即路径：表达式面认 {{}} 外壳内的片段，本面无外壳——源入参取
 *   **光标前输入串**（value.slice(0, selectionStart)），中途编辑（光标不在串尾）
 *  时候选按光标处段落、接受手术只换光标所在段、光标后文本保留。
 * - 输入即弹（首字符起）、`.` 刷新下钻、Ctrl/Cmd+Space 强制开（旁路 partial
 *   前缀过滤；空输入列全量起点候选）；**空输入不自动弹**（D4——聚焦/清空不打扰，
 *   全量起点候选只随强制开）；光标移动（keyup/click）只跟踪——保持/重定位/关闭，
 *   不主动开。
 * - 关闭：Esc、失焦、点外（document mousedown，浮层根 @mousedown.stop 自拦）、
 *   候选空（唯一例外：候选源携带 open 信号——D10 同款，浮层渲染「动态字段，键由
 *   模板定义」占位提示行，不可接受不进导航序）。
 * - 占位态键位让路原生（code-review 采纳）：open 占位态无可导航/可接受项，
 *   Enter/Tab/方向键不劫持（不吞宿主表单提交/移焦/移光标），只留 Esc 收口——
 *   「不进导航序」的键位面收口。
 * - 接受：↑↓ 循环导航、Enter/Tab、鼠标点选；applyCompletion 后缀替换——伪片段
 *   把 [0, cursor) 内容区包成闭合片段形态（start 负 2 = `{{` 剥壳位、end 超 2 =
 *   `}}` 剥壳位，手术只读 kind/start/end），值与浮层态漂移由手术内检验拒绝；
 *   随后对宿主派发合成 input + change（与手工输入同路，D10 一步历史）。
 *   **接受不自动补 `.`**（spec §3 钉死 array 段不补——数组是合法终点无处下钻；
 *   对象段继续下钻由用户键入 `.` 走输入刷新同路。composable 层不作段型判别：
 *   候选 type 字段在 source 组装处已被「行数组」展示文案覆写——工单 01/03/04
 *   链路，段型信号到不了浮层面）。
 * - 前缀过滤在本层做（工单 01 枚举器给全量合法子项）：大小写敏感前缀，对齐
 *   表达式补全手感。
 * - IME 守卫同款：合成期（compositionstart 起）及 isComposing/keyCode 229 的键
 *   全是候选确认/预编辑操作，接受、导航、刷新一律不触发；compositionend 后
 *   按落定文本刷新。
 * - 锚点/视口收口与表达式控件同语（mirror div 测光标 + fixed + scroll/resize
 *   重算 + 右缘收口）——定位逻辑在表达式 composable 内私有，约束「不动
 *   useExpressionCompletion」故就地落件不抽公共（两控件各自演进互不牵连）。
 *
 * 无 schema/降级态零弹层（D7）：候选源 null = 无补全态，浮层不开、手输不受阻。
 * 呈现态复用 ExpressionCompletionState 契约（ExpressionCompletionPopup 直用）。
 */
import { nextTick, onMounted, onScopeDispose, reactive, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import type { ExpressionScanFragment } from '@hankchen/canvas-next-editor'

import { applyCompletion, type CompletionSource } from './completion'
import { measureCursorAnchor } from './completionAnchor'
import type { ExpressionCompletionState } from './useExpressionCompletion'

/** 光标下缘与浮层上缘的间隙（px；与表达式控件同语） */
const ANCHOR_GAP = 4

/** 浮层右缘与视口右缘的最小留白（px） */
const VIEWPORT_MARGIN = 4

/** 光标移动键：浮层开着时 keyup 按光标处段落重算；↑↓ 归浮层导航不在此列 */
const CURSOR_MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

/**
 * 裸路径伪片段：把 [0, cursor) 内容区包成闭合片段形态供 applyCompletion 原样复用
 * ——start 负 2 / end 超 2 即 `{{ }}` 剥壳位（手术只读 kind/start/end），其余字段填
 * 中性值满足类型。哨兵算术收口这一处：手术剥壳实现若变，单点适配。
 */
function wholeInputFragment(input: string): ExpressionScanFragment {
    return { kind: 'fragment', start: -2, end: input.length + 2, raw: '', expr: input, error: null }
}

export function usePathCompletion(options: {
    /** 宿主输入元素（textarea/input），模板 ref 传入 */
    target: Ref<HTMLTextAreaElement | HTMLInputElement | null>
    /** 补全门（无 schema/非标记字段恒闭）；响应式 getter/ ref 均可 */
    enabled: MaybeRefOrGetter<boolean>
    /** 候选源（纯函数注入缝，见 completion.ts；入参 = 光标前输入串） */
    resolve: CompletionSource
    /** 浮层根元素（可选；在场时按其量宽做视口右缘收口） */
    popupEl?: MaybeRefOrGetter<HTMLElement | null>
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
    /** 最近一次刷新的 partial（接受手术的锚；值漂移由 applyCompletion 内检验拒绝） */
    let partial = ''

    function close(): void {
        popup.open = false
        popup.items = []
        popup.activeIndex = 0
        popup.openMapping = false
        partial = ''
    }

    function reposition(): void {
        if (!popup.open || !el) return
        const anchor = measureCursorAnchor(el)
        popup.top = anchor.bottom + ANCHOR_GAP
        popup.left = clampToViewport(anchor.left)
    }

    /**
     * 视口右缘收口（与表达式控件同语）：光标贴近视口右缘时浮层左移，右缘不越
     * innerWidth；量不到宽（首帧未渲染）按原锚放——首开路径由 recompute 延一拍
     * 补量。
     */
    function clampToViewport(left: number): number {
        const node = options.popupEl ? toValue(options.popupEl) : null
        const width = node?.offsetWidth ?? 0
        if (width <= 0) return left
        return Math.max(0, Math.min(left, window.innerWidth - VIEWPORT_MARGIN - width))
    }

    /**
     * 按光标前输入串重算浮层态。openAllowed=false（光标移动跟踪）时不主动开；
     * full=true（Ctrl+Space）旁路 partial 前缀过滤，且空输入放行（D4 强制开唯一
     * 例外路径）。
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
        const input = node.value.slice(0, node.selectionStart ?? node.value.length)
        // 空输入不自动弹（D4）：聚焦/清空不出全量起点候选，手输不受阻
        if (input === '' && !full) {
            close()
            return
        }
        const result = options.resolve(input)
        if (!result) {
            close() // 无补全态（漂移/降级/无 schema）：静默不开（D7）
            return
        }
        const shown = full ? result.candidates : result.candidates.filter((item) => item.segment.startsWith(result.partial))
        // open 信号在场（D10 同款）候选空也开——占位提示行解释原因；非 open 空候选不开
        if (shown.length === 0 && result.open !== true) {
            close()
            return
        }
        partial = result.partial
        if (!popup.open && !openAllowed) return
        popup.items = shown
        popup.activeIndex = 0
        popup.openMapping = result.open === true
        popup.open = true
        reposition()
        // 首开浮层 v-if 下一拍才挂载，量不到宽——延一拍补跑收口（表达式控件同款）
        void nextTick(reposition)
    }

    function accept(index?: number): void {
        const node = el
        if (!popup.open || composing || !node) return
        const item = popup.items[index ?? popup.activeIndex]
        if (!item) return
        const input = node.value.slice(0, node.selectionStart ?? node.value.length)
        const applied = applyCompletion(node.value, wholeInputFragment(input), partial, item.segment)
        if (!applied) {
            close() // 值与浮层状态漂移：手术拒绝，安全收口
            return
        }
        // 接受只换段不自动补 `.`（头注）：数组是终点、对象段下钻由用户键入 `.` 同路继续
        node.value = applied.value
        node.setSelectionRange(applied.cursor, applied.cursor)
        // 与手工输入同路：替换走既有 input（实时合步）+ change（收口一步历史）
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
        close()
    }

    /* ---- 事件处理（IME 守卫在各入口最前沿）---- */

    function onInput(event: Event): void {
        if (composing || (event as InputEvent).isComposing) return
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
        if (!popup.open) return
        if (popup.items.length === 0) {
            // open 占位态（D10）：无可导航/可接受项，键位让路原生——不吞宿主的
            // Enter 提交 / Tab 移焦 / 方向键移光标，只留 Esc 收口（提交管线零改动
            // 同语；候选态的键位劫持才是补全浮层的本分）
            if (event.key === 'Escape') {
                event.preventDefault()
                close()
            }
            return
        }
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

    /** 事件表：bind/unbind 单一事实源（键盘处理器参数收窄，入表时擦除） */
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
