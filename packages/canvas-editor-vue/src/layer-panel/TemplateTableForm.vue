<script setup lang="ts">
/**
 * <TemplateTableForm>：模板行路径表单（canvas-web-template-table-drag-create
 * 工单 02，spec 决策 6）——从 LayerPanel.vue 抽出的共享组件，面板「＋」菜单
 * keepsOpen 交换与工具栏弹层（工单 03）共用，宿主零抄写。
 *
 * 契约面：组件只管表单体验（点选器 + 确认门），落不落层归宿主——选中数组后
 * 确认 emit `confirm(rowsPath)`，取消钮 emit `cancel`（零副作用，武装与否是
 * 宿主的裁决）。样式与原面板内联表单同款（.cn-props 令牌）。表单由宿主按需
 * 挂载（v-if）——组件实例随收即弃，点选值天然不跨开合残留。
 *
 * 换装（rows-path-picker 工单 04，spec D2/D3）：手输框 + 补全浮层 → rowsPath
 * mode 级联点选器（数组终点唯一可点、对象只下钻；候选 = rowsPathPickerSource
 * 剪枝源，恒根起点直连——建表只落根层表，不经起点判别件）。必填语义换门：
 * 确认钮禁用至选中数组（点选只产合法行数组路径，旧空串就地拦结构性消失，
 * 「rowsPath 必填」标错面随之退役）；confirm 契约不变——「表单先行、确认即
 * 武装」流程面不动（D7）。schema 缺席（D1）：菜单门态承担不可发起（模板表
 * 菜单项置灰），组件面兜底 = 点选器无菜单钮 + 确认恒禁用的死端，不误武装。
 */
import { computed, ref } from 'vue'

import type { EditorSession } from '@hankchen/canvas-editor'

import { useDataSourceSchema } from '../shared/useDataSourceSchema'
import { rowsPathPickerSource } from '../shared/rowsPathCompletionSource'
import ExpressionPathPicker from '../shared/ExpressionPathPicker.vue'

const props = defineProps<{ editor: EditorSession }>()

const emit = defineEmits<{
    (e: 'confirm', rowsPath: string): void
    (e: 'cancel'): void
}>()

// ---- 表单态（实例私有，宿主 v-if 收挂即重置） ----

/** 点选值（'' = 未选）：确认钮禁用至选中数组（D3） */
const pickedPath = ref('')

/** 确认（选中数组才可达）：载荷 = 所选行数组路径，武装与否归宿主 */
function submit(): void {
    if (pickedPath.value === '') return
    emit('confirm', pickedPath.value)
}

// ---- rowsPath 点选器候选源（恒根起点直连，D3/D7） ----

/** schema 声明切片桥（shared 域）：候选源的唯一来源 */
const dataSourceSchema = useDataSourceSchema(props.editor)

const pickerSource = computed(() => rowsPathPickerSource(dataSourceSchema.value))
</script>

<template>
    <div>
        <p class="px-2 pt-1 text-[11px] leading-4 text-cn-muted">模板行按数据行路径展开成表</p>
        <div class="mx-1 my-1">
            <!-- rowsPath mode 级联点选器：恒根起点剪枝候选，数组终点点选即落值；
                 data-template-rows-path 目验钩子沿旧输入框位（fallthrough 落根盒） -->
            <ExpressionPathPicker
                v-model="pickedPath"
                data-template-rows-path
                mode="rowsPath"
                :source="pickerSource"
                aria-label="取行路径"
                placeholder="未选择行路径"
            />
        </div>
        <div class="flex gap-1 p-1">
            <button
                type="button"
                data-template-confirm
                :disabled="pickedPath === ''"
                class="flex-1 rounded bg-cn-accent/20 px-2 py-1 text-[12px] text-cn-accent hover:bg-cn-accent/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cn-accent/20"
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
    </div>
</template>
