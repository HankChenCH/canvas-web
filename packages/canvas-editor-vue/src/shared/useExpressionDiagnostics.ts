/**
 * 表达式语法诊断提示（expression-syntax-diagnostics 工单 02）。
 *
 * shared 域切片：属性面板（PropertyField）与画布文本编辑（TextEditingOverlay）
 * 两域共用——域间禁横引，跨域消费收口 shared（表达式补全五件套同款归位理由）。
 *
 * 两半：
 * - 消息面：kind → 中文短语映射 + 汇总文案（多处取首条带计数）。措辞对齐权威端
 *   php-canvas-next `InterpolationEvaluator` 的消息面（spec §5.2「code + 关键
 *   上下文」）；UI 字面归 vue 层，内核只出结构（kind/at），无 DOM 无字面。
 * - composable：绑宿主 input/textarea（原生 addEventListener，useExpressionCompletion
 *   同款挂载/换绑模式），供**非受控**宿主（画布编辑 textarea 的值不在 Vue 态）
 *   同步诊断；input/compositionend 每键程同步重算（扫描纯函数便宜，家法即同步
 *   零防抖）；IME 守卫在入口最前沿（合成期不重算，compositionend 落定后刷新）。
 *   程序化写值（初值注入不走 input 事件）由调用方在写值后显式 refresh()——不靠
 *   nextTick 猜宿主注入时序（进入编辑的注入续体晚于本 composable 的补拍，实测
 *   竞态）。面板侧不消费 composable——props.value 经实时 commit 已是最新文本，
 *   computed 直算即可。
 */
import { computed, onMounted, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'

import {
    expressionDiagnostics,
    type ExpressionFragmentDiagnostic,
    type ExpressionFragmentErrorKind,
} from '@hankchen/canvas-editor'

/** kind → 中文短语（对齐权威端消息措辞；缺左括号从「括号不平衡」单列便于提示；
 *  resource_* = 资源单值门子类（ADR 0020，措辞教学「单字段路径」引用形态） */
const DIAGNOSTIC_MESSAGES: Record<ExpressionFragmentErrorKind, string> = {
    empty_fragment: '空的表达式片段',
    invalid_path: '非法路径',
    missing_open_paren: '缺少左括号 (',
    unbalanced_paren: '括号不平衡（缺少右括号）',
    unterminated_string: '字符串字面量未闭合',
    empty_arg_slot: '存在空的参数位',
    bad_arg_syntax: '调用实参语法错误',
    trailing_after_call: '调用后有多余内容',
    first_arg_not_path: '首参必须为路径',
    invalid_path_arg: '路径实参不合法',
    resource_not_single_ref: '资源内容必须是单个字段路径，不支持拼接文字',
    resource_function_call: '资源内容不支持函数调用',
}

/** 诊断汇总文案：多处取首条 kind 带计数；无诊断返回空串 */
export function expressionDiagnosticHint(diagnostics: readonly ExpressionFragmentDiagnostic[]): string {
    const first = diagnostics[0]
    if (first === undefined) return ''
    const reason = DIAGNOSTIC_MESSAGES[first.kind]
    const total = diagnostics.length
    return total > 1 ? `${total} 处表达式语法错误：${reason}` : `表达式语法错误：${reason}`
}

export function useExpressionDiagnostics(options: {
    /** 宿主输入元素（textarea/input），模板 ref 传入 */
    target: Ref<HTMLTextAreaElement | HTMLInputElement | null>
    /** 表达式态开关（静态态恒空）；响应式 getter/ ref 均可 */
    enabled: MaybeRefOrGetter<boolean>
}): {
    /** 全部片段结构错诊断（模板坐标）；关闭态恒空 */
    diagnostics: ComputedRef<readonly ExpressionFragmentDiagnostic[]>
    /** 程序化写值后的显式同步（初值注入等不走 input 事件的路径调用） */
    refresh: () => void
} {
    const value = shallowRef('')
    let el: HTMLTextAreaElement | HTMLInputElement | null = null

    function refresh(): void {
        if (el !== null) value.value = el.value
    }

    function onInput(event: Event): void {
        if ((event as InputEvent).isComposing) return // IME 守卫：合成期不重算
        refresh()
    }

    function attach(node: HTMLTextAreaElement | HTMLInputElement | null): void {
        if (el === node) return
        if (el !== null) {
            el.removeEventListener('input', onInput)
            el.removeEventListener('compositionend', refresh)
        }
        el = node
        if (node !== null) {
            node.addEventListener('input', onInput)
            node.addEventListener('compositionend', refresh)
        }
        refresh()
    }

    // onMounted 保证 mount() 返回即已可收事件（pre-flush watch 要到下一个微任务才跑）
    onMounted(() => attach(options.target.value))
    watch(options.target, (node) => attach(node))
    watch(
        () => toValue(options.enabled),
        (on) => {
            if (!on) value.value = ''
        },
    )
    onScopeDispose(() => attach(null), true)

    return {
        diagnostics: computed(() => (toValue(options.enabled) ? expressionDiagnostics(value.value) : [])),
        refresh,
    }
}
