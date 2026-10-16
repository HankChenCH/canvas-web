<script setup lang="ts">
/**
 * PropertyField：单字段的动态分发器——按 FieldDef.control 从注册表取组件，
 * `<component :is>` 渲染。控件的生命周期事件（input 实时 / change 收口）原样
 * 上抛，由 PropertyPanel 统一落 commit（面板零直改）。
 *
 * 复合控件（pair，两列语义行，工票 03）：面板下发的 displays（禁用态替代
 * 显示，键 = 子字段绝对键）原样转发；子字段提交经 sub-commit 上抛（含目标
 * FieldDef 与 final 标记），面板按同一条 commit 管线分派。其余控件不受影响。
 *
 * 数据字段（field.data）额外渲染取值方式分段选择器（静态 | 表达式，工单 06，
 * 替代原 `{{ }}` 徽章钮）：表达式态输入框带 cn-field--expression 视觉标识，
 * 编辑保持标记（镜像字面）。模式由面板按图层 expression 标记派生传入，本组件
 * 零本地状态；切换语义仍上抛 toggle-mode 归面板 toggleDataMode（管线不动）。
 *
 * 表达式路径补全（content-completion 工单 05；工单 05 换装收敛）：数据字段中只剩
 * 文本层（textarea 控件）在表达式态接入浮层控件（工单 04 的 useExpressionCompletion +
 * ExpressionCompletionPopup）——target 取控件根元素，候选源由面板按选中路径下发
 * （completionSource：根层 = 根候选集 / 模板格内容层 = 行候选集）。静态态/未注入
 * schema 时 enabled 恒假，事件入口全短路零补全。`{{` 自动配对（工单 07）独立于
 * schema 注入：表达式态即配对（防未闭合静默错），静态态 `{{` 是字面不配对。
 * 资源内容字段不再走浮层（ADR 0020：resourceValue 控件/imageSrc 表达式态 = 级联
 * 路径选择器，候选源经 props.completion 下发进控件，纯菜单点选不设手输缝）。
 * 资源门呈现面（死端态整改）：空串 = 切换自身制造的「未选择」态不判违例（红框
 * 保留给有内容但拆不出单引用的存量违例）；错误提示不走「语法错误」框架，按修复
 * 通道分流（有菜单指向点选、无菜单指向绑定）；声明未注入时给绑定门弱提示行
 * （菜单缺席的原因说明，resourceDiagnosticHint / RESOURCE_BINDING_HINT 单源）。
 *
 * 裸路径补全（rows-path-completion 工单 03，D6）：接线门已随 rowsPath 换装退出本
 * 组件（rows-path-picker 工单 03），usePathCompletion 随之零消费方并已于工单 05
 * 整体退役（shared 导出撤除）。数据字段表达式浮层（useExpressionCompletion）
 * 零改动。
 *
 * 行解剖（面板布局优化，三种形态共用同一份控件分发）：
 * - pair：全宽块级（列标签 X/Y/宽/高 自描述，行级标签不复述）；
 * - 数据字段（field.data）：上下两行——第一行 = 标签（定宽列）+ 取值方式分段
 *   选择器（右端对齐），第二行 = 输入控件跨两列撑满面板宽（textarea 不再被
 *   标签/分段挤压）；网格 gap-y 提供行距；
 * - 其余：固定标签列（60px，容纳最长标签 4 字）+ 控件列的网格
 *   行——标签列定宽消除逐行标签宽差导致的输入左缘参差（视差），定宽控件
 *   （布尔开关）落在控件列左缘，与填充类控件同一条起始线。
 */
import { computed, ref, type ComponentPublicInstance } from 'vue'

import { expressionDiagnostics, resourcePathDiagnostics, type ExpressionFragmentDiagnostic, type ResourceStatus } from '@hankchen/canvas-editor'

import { controlRegistry } from './controls'
import type { FieldDef, FieldDisplay } from './fieldSchema'
import ValueTypeSegmented from './fields/ValueTypeSegmented.vue'
import ExpressionCompletionPopup from '../shared/ExpressionCompletionPopup.vue'
import { useExpressionCompletion } from '../shared/useExpressionCompletion'
import { expressionDiagnosticHint, resourceDiagnosticHint, RESOURCE_BINDING_HINT } from '../shared/useExpressionDiagnostics'
import type { CompletionSource } from '../shared/completion'

const props = defineProps<{
    field: FieldDef
    /** 字段当前值（面板已用 readField 解析，ok:false 的字段不会渲染到这） */
    value: unknown
    /** 数据字段取值方式；undefined = 非 data 字段（无切换钮） */
    dataMode?: 'static' | 'expression'
    /**
     * 会话内容锁定（edit-overlay-toolbar 工单 02，ADR 0019 门面）：编辑会话期
     * data 字段的输入控件与模式段 disabled——编辑框草稿是内容唯一写入门，面板
     * 只显示（文档现值 + 随会话活标志的模式段）。undefined/false = 照常可编辑。
     */
    locked?: boolean
    /**
     * 补全候选源（面板按字段分发：data 门 textarea 字段 = 表达式源；资源字段与
     * rowsPath 点选器字段 = 选择器源，经 source 下发进控件）；null = 未注入/
     * 无接线/降级（浮层恒闭、选择器无菜单）。
     */
    completion?: CompletionSource | null
    /** pair 子字段的禁用态替代显示（键 = 子字段绝对键）；其他控件不传 */
    displays?: Record<string, FieldDisplay>
    /**
     * 行级动态可见提示（placeholder-padding-hint 工单 02）：面板按 schema hint
     * 谓词求值下发（占位态图片层的 padding 行）；undefined = 无提示行。
     */
    hint?: string
    /**
     * 字段值的物化态（面板按当前值查 ui 切片解析）：仅 imageSrc 控件消费
     * （缩略图角标，与画布失败标识同源）；undefined = 无记录/不适用。
     */
    resourceStatus?: ResourceStatus
    /**
     * rowsPath 控件的漂移态（rows-path-picker 工单 03，spec D2）：面板按已提交
     * 值判定（rowsPathDrifted）——true 时控件落 cn-field--invalid（红描边经
     * fallthrough 到点选器展示框），菜单不受影响照常可开可重选。其他控件不下发。
     */
    drifted?: boolean
}>()

const emit = defineEmits<{
    input: [value: unknown]
    change: [value: unknown]
    'toggle-mode': []
    /** pair 子字段提交：面板按子字段绝对键走既有 commit 管线 */
    'sub-commit': [field: FieldDef, value: unknown, final: boolean]
}>()

const control = computed(() => controlRegistry[props.field.control])
const isExpression = computed(() => props.dataMode === 'expression')

/**
 * 行根布局类（见文件头「行解剖」）：pair = 全宽块级；其余 = 固定标签列网格。
 * 数据字段的上下两行由同一网格承载：标签 r1c1、分段选择器 r1c2（右端）、
 * 控件 col-span-2 落 r2（gap-y-1.5 提供行距）——单行网格下 gap-y 惰性。
 * 60px 标签列容纳最长标签（4 字 × 11px，如「取行路径」「行高倍数」），超出 truncate。
 */
const rowClass = computed(() =>
    props.field.control === 'pair'
        ? 'cn-prop-field block'
        : 'cn-prop-field grid grid-cols-[60px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5',
)

/** 数据字段的输入控件跨标签列 + 控件列（上下布局的第二行） */
const controlClass = computed(() => (props.field.data === true ? 'col-span-2' : ''))

/**
 * 补全接线门（resource-expression-single-ref 工单 05 收敛后）：表达式浮层只剩
 * 文本层（textarea 数据字段）。资源内容字段已换装——QR 走 resourceValue 控件、
 * imageSrc 表达式态走选择器（候选源经 props.completion 下发进控件），纯菜单
 * 点选不设手输缝（ADR 0020），浮层/手输面不复存在；rowsPath 字段亦随点选器
 * 换装（rows-path-picker 工单 03）退出标记门，裸路径补全面随工单 05 整体退役。
 * 其余字段零接线。
 */
const wiresExpressionCompletion = computed(() => props.field.data === true && props.field.control === 'textarea')

/** rowsPath 控件判别（rows-path-picker 工单 03）：候选源路由 / 门态弱提示 / 漂移红边三处同源 */
const isRowsPath = computed(() => props.field.control === 'rowsPath')

/** 资源内容字段（field.resource：resourceValue/imageSrc）与 rowsPath 字段（rows-path-picker
 *  工单 03 换装）：候选源下发进控件的选择器 */
const wiresPathPicker = computed(() => props.field.resource === true || isRowsPath.value)

/** 控件根元素（组件实例 $el；textarea/input 双形态，其余控件给 null 不绑） */
const controlRef = ref<ComponentPublicInstance | null>(null)

/**
 * 表达式语法诊断（expression-syntax-diagnostics 工单 02）：表达式态数据字段
 * 实时标错——面板 input 实时 commit（props.value 即最新文本），computed 直算
 * 零监听（画布侧非受控宿主才走 useExpressionDiagnostics 监听同步）；静态态恒空
 * （{{ 是字面）。工单 05 换装后门分两支：资源类字段（field.resource 标记：
 * QR 的 resourceValue/imageSrc）走内核资源单值门 resourcePathDiagnostics（恰一
 * 闭合片段 + 裸点路径，ADR 0020 求值端同源同语义——红边落在选择器框上，点击
 * 定位随 div 根自然退化为纯展示）；文本层 textarea 走片段扫描诊断不动。
 */
const expressionErrors = computed<readonly ExpressionFragmentDiagnostic[]>(() => {
    if (!(props.field.data === true && isExpression.value && typeof props.value === 'string')) return []
    if (props.field.resource === true) {
        // 空串 = 切表达式动作自身制造的「未选择」态（占位文案已表达），不判违例：
        // 红框保留给「有内容但拆不出单引用」（存量 URL/拼接/函数）；填充期拦截
        // 语义归内核门与权威端，呈现面放行空态不放行内容违例
        return props.value === '' ? [] : resourcePathDiagnostics(props.value)
    }
    return wiresExpressionCompletion.value ? expressionDiagnostics(props.value) : []
})

/**
 * 错误提示（工单 02 诊断行）：文本字段走既有「语法错误」框架；资源字段不走——
 * 门是内容引用约束不是语法错，按修复通道在场与否给动作指引（kind 只进诊断面，
 * 呈现统一分流），无菜单（未注入声明）时指向绑定。
 */
const expressionErrorHint = computed(() => {
    if (expressionErrors.value.length === 0) return ''
    if (props.field.resource === true) return resourceDiagnosticHint(props.completion != null)
    return expressionDiagnosticHint(expressionErrors.value)
})

/**
 * 绑定门引导（resource-expression-single-ref 呈现面；rowsPath 面同缝，rows-path-picker
 * 工单 03 D1）：未注入声明 → 选择器无菜单（引用以声明为门）——弱提示行说明缺席
 * 原因；违例在场时错误提示行已含同款指引，互斥不重复（rowsPath 无诊断面，无
 * 静态/表达式两态，候选源缺席即门态）。
 */
const bindingGateHint = computed(() => {
    const gated = props.field.resource === true ? isExpression.value : isRowsPath.value
    return gated && props.completion == null && expressionErrors.value.length === 0 ? RESOURCE_BINDING_HINT : ''
})

/**
 * 控件红描边（rows-path-picker 工单 03，spec D2 漂移呈现）：数据字段表达式态走
 * 诊断（expressionErrors），rowsPath 控件走面板漂移判定（drifted）——cn-field--invalid
 * 经 fallthrough 落点选器只读展示框，标红不锁菜单。
 */
const controlInvalid = computed(
    () => expressionErrors.value.length > 0 || (isRowsPath.value && props.drifted === true),
)

/** 点击定位的可用面：textarea 控件根是可 selection 的输入元素；resourceValue/imageSrc
 *  表达式态根是 div（选择器，选区无从落），提示行退化为纯展示（不渲染可点击暗示） */
const diagnosticLocatable = computed(() => props.field.control === 'textarea')

/** 点击提示：聚焦控件并选中出错子范围（value 即模板串，at 模板坐标可直接落 selection） */
function locateFirstError(): void {
    const first = expressionErrors.value[0]
    const el: unknown = controlRef.value?.$el
    if (first === undefined || !(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return
    el.focus()
    el.setSelectionRange(first.at.start, first.at.end)
}
const completionTarget = computed<HTMLTextAreaElement | HTMLInputElement | null>(() => {
    if (!wiresExpressionCompletion.value) return null
    const el: unknown = controlRef.value?.$el
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null
})

/** 浮层根元素（组件 expose 的 rootEl）：量宽收口用，未挂载/不接线为 null */
const popupRef = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)
const popupElement = computed<HTMLElement | null>(() => popupRef.value?.rootEl ?? null)

const { popup, accept } = useExpressionCompletion({
    target: completionTarget,
    // 表达式态且声明在场才开事件入口（静态态不生效；未注入 schema = 无候选态）
    enabled: () => wiresExpressionCompletion.value && isExpression.value && props.completion != null,
    // 配对门（工单 07）独立于候选源注入：表达式态即配对——未闭合 {{ 的静默错
    // （字面渲染/编进二维码）不依赖 schema 在场；静态态 {{ 是字面不配对
    pairing: () => wiresExpressionCompletion.value && isExpression.value,
    resolve: (expr) => props.completion?.(expr) ?? null,
    popupEl: popupElement,
})

/** 复合控件的子字段提交转发（模板内联箭头的参数标注不便，收口到脚本） */
function relaySubCommit(field: FieldDef, value: unknown, final: boolean): void {
    emit('sub-commit', field, value, final)
}
</script>

<template>
    <!-- pair/imageSrc 行根用 div（code-review 整改）：pair 列各有 label，嵌套
         label 非法；imageSrc 行内多交互元素（缩略图钮 + file input + 路径输入），
         label 激活转发会命中首个 labelable 后代（缩略图钮）误弹文件选择。其余
         单控件行保持 label 包裹的点击聚焦行为 -->
    <component
        :is="field.control === 'pair' || field.control === 'imageSrc' ? 'div' : 'label'"
        :class="rowClass"
    >
        <!-- pair 列自描述（X/Y/宽/高），行级标签不复述（消除「尺寸 尺寸」双 label）；
             数据字段行标签占 r1c1，取值方式分段占 r1c2（右端对齐）；title 属性透传
             FieldDef.title（字段级悬停提示，placeholder-padding-hint 工单 01——pair
             行无行级标签，v-if 门下天然不涉及） -->
        <span
            v-if="field.control !== 'pair'"
            class="cn-prop-field__label shrink-0 select-none truncate text-[11px] leading-none text-cn-muted"
            :title="field.title"
        >
            {{ field.label }}
        </span>
        <!-- 数据字段取值方式分段选择器（工单 06）：目标态由组件守卫（当前段零
             事件），切换语义经既有 toggle-mode 归面板 toggleDataMode。锁定期
             disabled（工单 02）——模式切换唯一入口归画布 pill，面板段只显示 -->
        <ValueTypeSegmented
            v-if="field.data"
            class="justify-self-end"
            :mode="dataMode ?? 'static'"
            :disabled="locked"
            @change="emit('toggle-mode')"
        />
        <!-- 宽度由各控件自持：输入类自带 flex-1 撑满列，定宽类（开关）落在控件列
             左缘与填充类同线；数据字段控件 col-span-2 成上下布局的输入行。锁定期
             下发 disabled（工单 02）：TextareaField 声明消费；其余控件经 attrs
             透传原生 disabled（锁定面只出现在 data 字段，编辑会话仅文本层可达） -->
        <component
            :is="control"
            ref="controlRef"
            class="cn-prop-field__control"
            :class="[
                controlClass,
                {
                    'cn-field--expression': isExpression,
                    'cn-field--invalid': controlInvalid,
                },
            ]"
            :field="field"
            :model-value="value"
            :disabled="locked"
            :displays="field.control === 'pair' ? displays : undefined"
            :data-mode="field.control === 'imageSrc' || field.control === 'resourceValue' ? dataMode : undefined"
            :source="wiresPathPicker ? completion : undefined"
            :resource-status="field.control === 'imageSrc' ? resourceStatus : undefined"
            @input="emit('input', $event)"
            @change="emit('change', $event)"
            @sub-commit="relaySubCommit"
        />
        <!-- 行级动态可见提示（placeholder-padding-hint 工单 02）：跨两列落控件行
             下方，弱提示视觉（muted 小字）；span 块级化——行根对单控件是 label，
             phrasing content 才合法 -->
        <span
            v-if="hint"
            class="cn-prop-field__hint col-span-2 block text-[11px] leading-4 text-cn-muted"
        >{{ hint }}</span>
        <!-- 表达式语法错误提示（expression-syntax-diagnostics 工单 02）：诊断在
             场即红边（控件 cn-field--invalid），提示行可点击——聚焦控件并选中出错
             子范围（at 模板坐标直接落 selection）；与弱提示行互斥在场时不冲突
             （错误行在其后，视觉 danger 色） -->
        <span
            v-if="expressionErrorHint"
            class="cn-prop-field__hint cn-prop-field__hint--error col-span-2 block text-[11px] leading-4 text-cn-danger"
            :class="{ 'cursor-pointer': diagnosticLocatable }"
            :title="diagnosticLocatable ? '点击选中出错片段' : undefined"
            @click="locateFirstError"
        >{{ expressionErrorHint }}</span>
        <!-- 绑定门引导（resource-expression-single-ref 呈现面）：声明未注入时选择器
             无菜单——弱提示说明缺席原因与去向（与错误提示行互斥，见 bindingGateHint） -->
        <span
            v-if="bindingGateHint"
            class="cn-prop-field__hint col-span-2 block text-[11px] leading-4 text-cn-muted"
        >{{ bindingGateHint }}</span>
    </component>
    <!-- 补全浮层（工单 04/05）：portal 到 body，仅表达式门字段渲染（资源/rowsPath
         字段已换装点选器，裸路径补全面只剩建表表单独立接线）；面板不给本组件下发
         attrs，多根无 fallthrough 断点 -->
    <ExpressionCompletionPopup
        v-if="wiresExpressionCompletion"
        ref="popupRef"
        :state="popup"
        @select="accept"
    />
</template>
