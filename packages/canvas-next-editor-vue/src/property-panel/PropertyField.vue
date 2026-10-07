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
 * 表达式路径补全（content-completion 工单 05）：数据字段（textarea/text/imageSrc
 * 控件）在表达式态接入浮层控件（工单 04 的 useExpressionCompletion +
 * ExpressionCompletionPopup）——target 取控件根元素（textarea/input 双形态），
 * 候选源由面板按选中路径下发（completionSource：根层 = 根候选集 / 模板格内容层
 * = 行候选集）。静态态/未注入 schema 时 enabled 恒假，事件入口全短路零补全。
 * `{{` 自动配对（工单 07）独立于 schema 注入：表达式态即配对（防未闭合静默错），
 * 静态态 `{{` 是字面不配对。
 *
 * 裸路径补全（rows-path-completion 工单 03，D6）：接线门扩为「data 门或 completion
 * 标记门」——rowsPath 字段（completion: 'rowsPath' 标记）按标记走 usePathCompletion
 * （候选源 = 面板 rowsPathSource 行相对源），数据字段仍走 useExpressionCompletion
 * 零改动。两门互斥（data 与 completion 不共存于同一字段），两 composable 均实例化、
 * 非本门 enabled 恒假事件入口全短路；浮层按门渲染对应呈现态。提交管线不动：接受
 * = 合成 input/change 走既有 updateSpec 分支（P3 结构语义透传不变）。
 *
 * 行解剖（面板布局优化，三种形态共用同一份控件分发）：
 * - pair：全宽块级（列标签 X/Y/宽/高 自描述，行级标签不复述）；
 * - 数据字段（field.data）：上下两行——第一行 = 标签（定宽列）+ 取值方式分段
 *   选择器（右端对齐），第二行 = 输入控件跨两列撑满面板宽（textarea 不再被
 *   标签/分段挤压）；网格 gap-y 提供行距；
 * - 其余：固定标签列（60px，容纳最长标签「数据行路径」5 字）+ 控件列的网格
 *   行——标签列定宽消除逐行标签宽差导致的输入左缘参差（视差），定宽控件
 *   （布尔开关）落在控件列左缘，与填充类控件同一条起始线。
 */
import { computed, ref, type ComponentPublicInstance } from 'vue'

import type { ResourceStatus } from '@hankchen/canvas-next-editor'

import { controlRegistry } from './controls'
import type { FieldDef, FieldDisplay } from './fieldSchema'
import ValueTypeSegmented from './fields/ValueTypeSegmented.vue'
import ExpressionCompletionPopup from '../shared/ExpressionCompletionPopup.vue'
import { useExpressionCompletion } from '../shared/useExpressionCompletion'
import { usePathCompletion } from '../shared/usePathCompletion'
import type { CompletionSource } from '../shared/completion'

const props = defineProps<{
    field: FieldDef
    /** 字段当前值（面板已用 readField 解析，ok:false 的字段不会渲染到这） */
    value: unknown
    /** 数据字段取值方式；undefined = 非 data 字段（无切换钮） */
    dataMode?: 'static' | 'expression'
    /**
     * 补全候选源（面板按字段分发：data 门字段 = 表达式源，rowsPath 标记字段 =
     * 行相对源，工单 03）；null = 未注入/无接线/降级（浮层恒闭）。
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
 * 60px 标签列容纳最长标签「数据行路径」（5 字 × 11px），超出 truncate。
 */
const rowClass = computed(() =>
    props.field.control === 'pair'
        ? 'cn-prop-field block'
        : 'cn-prop-field grid grid-cols-[60px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5',
)

/** 数据字段的输入控件跨标签列 + 控件列（上下布局的第二行） */
const controlClass = computed(() => (props.field.data === true ? 'col-span-2' : ''))

/**
 * 补全接线门（双门取并，单字段只落一门——data 与 completion 标记互斥声明）：
 * - data 门：数据文本字段（fieldSchema 中 data:true 且 textarea/text/imageSrc
 *   控件——现状即 text/src/value 内容字段与图片资源字段）；
 * - 标记门（rows-path-completion 工单 03，D6）：completion === 'rowsPath'
 *   （rowsPath 字段，结构语义不走 data 门）。
 * 其余字段零接线。
 */
const wiresExpressionCompletion = computed(
    () =>
        props.field.data === true &&
        (props.field.control === 'textarea' || props.field.control === 'text' || props.field.control === 'imageSrc'),
)
const wiresPathCompletion = computed(() => props.field.completion === 'rowsPath')
const wiresCompletion = computed(() => wiresExpressionCompletion.value || wiresPathCompletion.value)

/** 控件根元素（组件实例 $el；textarea/input 双形态，其余控件给 null 不绑） */
const controlRef = ref<ComponentPublicInstance | null>(null)
const completionTarget = computed<HTMLTextAreaElement | HTMLInputElement | null>(() => {
    if (!wiresCompletion.value) return null
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

/**
 * 标记字段的裸路径补全（工单 03）：按标记选 composable——rowsPath 字段走
 * usePathCompletion（与表达式控件同门分轨，触发语义无 {{}} 逻辑）；enabled 门
 * = 标记在场 + 声明注入（表达式门的 isExpression 态门在路径面不存在，裸路径
 * 无静态/表达式两态）。两 composable 均实例化（composable 不可条件调用），
 * 互斥声明保证任一字段至多一门 enabled，事件入口对另一门全部短路。
 */
const { popup: pathPopup, accept: acceptPath } = usePathCompletion({
    target: completionTarget,
    enabled: () => wiresPathCompletion.value && props.completion != null,
    resolve: (input) => props.completion?.(input) ?? null,
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
             事件），切换语义经既有 toggle-mode 归面板 toggleDataMode -->
        <ValueTypeSegmented
            v-if="field.data"
            class="justify-self-end"
            :mode="dataMode ?? 'static'"
            @change="emit('toggle-mode')"
        />
        <!-- 宽度由各控件自持：输入类自带 flex-1 撑满列，定宽类（开关）落在控件列
             左缘与填充类同线；数据字段控件 col-span-2 成上下布局的输入行 -->
        <component
            :is="control"
            ref="controlRef"
            class="cn-prop-field__control"
            :class="[controlClass, { 'cn-field--expression': isExpression }]"
            :field="field"
            :model-value="value"
            :displays="field.control === 'pair' ? displays : undefined"
            :data-mode="field.control === 'imageSrc' ? dataMode : undefined"
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
    </component>
    <!-- 补全浮层（工单 04/05/03）：portal 到 body，仅接线字段渲染——按门选呈现
         态（表达式门 = useExpressionCompletion，标记门 = usePathCompletion，互斥
         声明下单字段至多渲染一个）；面板不给本组件下发 attrs，多根无 fallthrough
         断点 -->
    <ExpressionCompletionPopup
        v-if="wiresExpressionCompletion"
        ref="popupRef"
        :state="popup"
        @select="accept"
    />
    <ExpressionCompletionPopup
        v-else-if="wiresPathCompletion"
        ref="popupRef"
        :state="pathPopup"
        @select="acceptPath"
    />
</template>
