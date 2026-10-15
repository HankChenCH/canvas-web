<script setup lang="ts">
/**
 * <TemplateTableForm>：模板行路径表单（canvas-web-template-table-drag-create
 * 工单 02，spec 决策 6）——从 LayerPanel.vue 抽出的共享组件，面板「＋」菜单
 * keepsOpen 交换与工具栏弹层（工单 03）共用，宿主零抄写。
 *
 * 契约面：组件只管表单体验（输入 + 补全浮层 + 非空就地拦），落不落层归宿主——
 * 非空确认 emit `confirm(rowsPath)`（trim 后非空串），取消钮/浮层已收后的 Esc
 * emit `cancel`（零副作用，武装与否是宿主的裁决）。样式与原面板内联表单同款
 * （.cn-props 令牌）。
 *
 * 校验（template-authoring §2.1 基线）：空串/纯空白确认就地拦——内联文案
 * 「rowsPath 必填」+ danger 边，不发 confirm；再次输入即销错。
 *
 * 补全接线随组件走（rows-path-completion 工单 04 面，D3/D7/D10）：
 * rowsPathCompletionSource 根起点直连（建表恒落根层，不经起点判别件）、
 * schema 缺席静默不弹、候选态 Enter 归浮层接受（落值经 v-model 与手输同路，
 * 不触发 confirm）、候选态 Esc 止于浮层收口（stop 阻断，宿主菜单不连坐收起）。
 * 表单由宿主按需挂载（v-if）——组件实例随收即弃，草稿/错误态天然不跨开合残留。
 */
import { computed, ref } from 'vue'

import type { EditorSession } from '@hankchen/canvas-editor'

import { useDataSourceSchema } from '../shared/useDataSourceSchema'
import { rowsPathCompletionSource } from '../shared/rowsPathCompletionSource'
import { usePathCompletion } from '../shared/usePathCompletion'
import ExpressionCompletionPopup from '../shared/ExpressionCompletionPopup.vue'
import type { CompletionSource } from '../shared/completion'

const props = defineProps<{ editor: EditorSession }>()

const emit = defineEmits<{
    (e: 'confirm', rowsPath: string): void
    (e: 'cancel'): void
}>()

// ---- 表单态（实例私有，宿主 v-if 收挂即重置） ----

const draft = ref('')
const invalid = ref(false)

/** 确认（确认钮 / 候选态已收的 Enter 共用）：trim 后非空才上抛，空串就地拦 */
function submit(): void {
    const rowsPath = draft.value.trim()
    if (rowsPath === '') {
        invalid.value = true
        return
    }
    emit('confirm', rowsPath)
}

// ---- rowsPath 补全（根起点直连，D3/D7） ----

/** schema 声明切片桥（shared 域）：候选源的唯一来源 */
const dataSourceSchema = useDataSourceSchema(props.editor)

const completionSource = computed<CompletionSource | null>(() => rowsPathCompletionSource(dataSourceSchema.value))

/** 表单输入元素（v-if 内常挂——ref 在位即绑定） */
const rowsPathInputEl = ref<HTMLInputElement | null>(null)
const pathPopupRef = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)

const { popup: pathPopup, accept: acceptPathCandidate } = usePathCompletion({
    target: rowsPathInputEl,
    // 门 = 组件在场（组件实例只在该表单打开时挂载）；schema 缺席由 null 源在 resolve 内收口
    enabled: () => true,
    resolve: (input) => completionSource.value?.(input) ?? null,
    popupEl: computed(() => pathPopupRef.value?.rootEl ?? null),
})

/**
 * 键位路由（与抽出处同款）：候选态 Enter 让位浮层接受（D10——再 Enter 才回提交
 * 管线）；候选态 Esc stop 阻断（只收浮层，宿主菜单不连坐）；浮层已收的 Esc 归
 * 取消（发 cancel 交宿主裁断）；占位态与无浮层键位让路原生。
 */
function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        if (pathPopup.open && pathPopup.items.length > 0) return
        event.preventDefault()
        submit()
        return
    }
    if (event.key === 'Escape') {
        if (pathPopup.open) event.stopPropagation()
        else emit('cancel')
    }
}
</script>

<template>
    <div>
        <p class="px-2 pt-1 text-[11px] leading-4 text-cn-muted">模板行按数据行路径展开成表</p>
        <input
            ref="rowsPathInputEl"
            v-model="draft"
            data-template-rows-path
            type="text"
            placeholder="如 order.items"
            class="mx-1 my-1 w-[calc(100%-8px)] rounded border bg-cn-field px-2 py-1 text-[12px] text-cn-fg outline-none focus:border-cn-accent/60"
            :class="invalid ? 'border-cn-danger' : 'border-cn-field-line'"
            @input="invalid = false"
            @keydown="onKeydown"
        />
        <p v-if="invalid" class="px-2 pb-1 text-[11px] text-cn-danger">rowsPath 必填</p>
        <div class="flex gap-1 p-1">
            <button
                type="button"
                data-template-confirm
                class="flex-1 rounded bg-cn-accent/20 px-2 py-1 text-[12px] text-cn-accent hover:bg-cn-accent/30"
                @click="submit"
            >
                创建
            </button>
            <button
                type="button"
                data-template-cancel
                class="flex-1 rounded px-2 py-1 text-[12px] text-cn-muted hover:text-cn-fg"
                @click="emit('cancel')"
            >
                取消
            </button>
        </div>
        <!-- rowsPath 补全浮层：portal 到 body，随 state.open 开合，rootEl 供视口
             右缘收口量宽（接线随组件走，宿主零感知） -->
        <ExpressionCompletionPopup ref="pathPopupRef" :state="pathPopup" @select="acceptPathCandidate" />
    </div>
</template>
