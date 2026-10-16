/**
 * 数据源声明门提示（rows-path-picker 工单 04，spec D1）：未绑 schema 时建表面
 * 菜单项的置灰悬停文案——面板「＋」菜单模板表项与右键「转为模板表」项两处门态
 * 共用的展示词汇单点（「行数组」徽标同门先例，文案不进数据契约）。
 */
export const DATA_SOURCE_GATE_HINT = '先绑定数据源'

/**
 * useDataSourceSchema / useDataSourceSchemaRejection：schema 声明切片的响应式桥
 * （shared 域——状态栏读数段与图层面板建表表单两域共用，rows-path-completion
 * 工单 04 自 status-bar 收口至此；与 useViewport 同款模式）。shallowRef 整体替换
 * （禁深度 reactive 红线），只在 ui.dataSourceSchema 分支通知（注入/清除/被拒）
 * 时同步；订阅随 effect scope 自动注销。声明随会话（openDocument 不重置），
 * 无需挂 doc 通知。拒绝详情与声明成对置换（死端态整改 2b），两桥同源同分支。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { DataSourceSchemaRejection, EditorSession, ExpressionSchemaNode } from '@hankchen/canvas-editor'

export function useDataSourceSchema(editor: EditorSession): ComputedRef<ExpressionSchemaNode | null> {
    const schema = shallowRef<ExpressionSchemaNode | null>(editor.store.ui.dataSourceSchema)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'ui' && change.branch === 'dataSourceSchema') {
            schema.value = editor.store.ui.dataSourceSchema
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return computed(() => schema.value)
}

/** 声明拒绝详情桥（声明被拒呈现面，2b）：null = 未注入/已编译/已清除 */
export function useDataSourceSchemaRejection(editor: EditorSession): ComputedRef<DataSourceSchemaRejection | null> {
    const rejection = shallowRef<DataSourceSchemaRejection | null>(editor.store.ui.dataSourceSchemaRejection)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'ui' && change.branch === 'dataSourceSchema') {
            rejection.value = editor.store.ui.dataSourceSchemaRejection
        }
    })
    onScopeDispose(unsubscribe, true)

    return computed(() => rejection.value)
}
