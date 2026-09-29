<script setup lang="ts">
/**
 * StatusBar：状态栏（工单 14；playground-canvas-first 工单 01 收编全部读数）。
 *
 * 既有三段：
 * - 缩放百分比（只读）：ui.viewport 分支通知驱动（useViewport 切片桥）；
 * - 选中图层路径：ui.selection 分支驱动（useSelection）+ formatLayerPath；
 * - 物化进行数：宿主注入 prop（Materializer 住 browser-renderer，红线禁止
 *   editor-vue 直连——宿主订阅物化状态后在途计数传入），0 时该段隐藏。
 *
 * 工单 01 新增五段：
 * - 坐标尺寸段：组件内部由文档 position（resolveLayer）+ layerBoxAt 解析盒
 *   计算 `x=… y=… · 宽×高 · 锚点 …`，选择变更与拖动文档事务实时联动
 *   （useDoc/useSelection 双桥驱动），未选中隐藏；
 * - 资源状态段：宿主注入文案 prop（资源就绪/物化中/失败 N 项），沿用
 *   pendingCount 注入模式，缺省隐藏；
 * - 保存态段：宿主注入 saveState prop（● 未保存 / ○ 已保存），未接线隐藏；
 * - schema 声明态段：组件直读 ui 分支（已注入顶层 N 键 / 无候选），恒显；
 * - 瞬时反馈段：宿主注入动作结果/错误文案 prop，缺省隐藏。
 *
 * 路径格式化 formatLayerPath（纯函数另有单测）/ 坐标格式化 formatLayerGeometry
 * （经本组件 mount 测试覆盖格式与取整）。
 */
import { computed } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'
import { resolveLayer } from '@hankchen/canvas-next-editor'

import { formatLayerPath } from './layerPathLabel'
import { formatLayerGeometry } from './layerGeometryLabel'
import { useDataSourceSchema } from './useDataSourceSchema'
import { useDoc } from './useDoc'
import { useSelection } from '../shared/useSelection'
import { useViewport } from '../shared/useViewport'

const props = withDefaults(
    defineProps<{
        editor: EditorSession
        pendingCount?: number
        /** 宿主注入的资源状态文案（资源就绪/物化中 N/失败 N 项）；空串隐藏 */
        resourceNote?: string
        /** 宿主注入的保存态；未接线（undefined）隐藏 */
        saveState?: 'dirty' | 'clean'
        /** 宿主注入的瞬时反馈文案（保存/打开/导出/上传/schema 动作结果与错误）；空串隐藏 */
        feedback?: string
    }>(),
    {
        pendingCount: 0,
        resourceNote: '',
        feedback: '',
    },
)

const viewport = useViewport(props.editor)
const selection = useSelection(props.editor)
const doc = useDoc(props.editor)
const dataSourceSchema = useDataSourceSchema(props.editor)

const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))
const selectionLabel = computed(() => {
    const path = selection.value
    return path === null ? '未选中图层' : formatLayerPath(path)
})

/** 坐标尺寸段：文档 position + 解析盒；未选中/解析不到/无盒隐藏 */
const geometryLabel = computed(() => {
    const path = selection.value
    const current = doc.value
    if (path === null || current === null) return null
    const layer = resolveLayer(current, path)
    const box = props.editor.layerBoxAt(path)
    if (!layer || !box) return null
    return formatLayerGeometry(layer.position, box)
})

/** schema 声明态段：组件直读 ui 分支（经切片桥响应式，声明随会话，openDocument 不重置） */
const schemaLabel = computed(() => {
    const schema = dataSourceSchema.value
    return schema === null ? 'schema 无候选' : `schema 已注入顶层 ${schema.properties?.size ?? 0} 键`
})
</script>

<template>
    <footer class="cn-statusbar" role="status" aria-label="编辑器状态栏">
        <span class="cn-statusbar__segment" data-zoom>{{ zoomPercent }}%</span>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <span class="cn-statusbar__segment" data-selection>{{ selectionLabel }}</span>
        <template v-if="props.pendingCount > 0">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment cn-statusbar__segment--pending" data-pending>
                物化中 {{ props.pendingCount }}
            </span>
        </template>
        <template v-if="geometryLabel !== null">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-geometry>{{ geometryLabel }}</span>
        </template>
        <template v-if="props.resourceNote !== ''">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-resource>{{ props.resourceNote }}</span>
        </template>
        <template v-if="props.saveState !== undefined">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-save>
                {{ props.saveState === 'dirty' ? '● 未保存' : '○ 已保存' }}
            </span>
        </template>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <span class="cn-statusbar__segment" data-schema>{{ schemaLabel }}</span>
        <template v-if="props.feedback !== ''">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-feedback>{{ props.feedback }}</span>
        </template>
    </footer>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：状态栏自带主题，不依赖宿主接线，也不渗漏 */
.cn-statusbar {
    --cn-bg: #0b1220;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;

    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background-color: var(--cn-bg);
    color: var(--cn-muted);
    font-size: 12px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    user-select: none;
}

.cn-statusbar__segment {
    white-space: nowrap;
}

.cn-statusbar__segment--pending {
    color: var(--cn-accent);
}

.cn-statusbar__divider {
    width: 1px;
    height: 12px;
    background: var(--cn-line);
}
</style>
