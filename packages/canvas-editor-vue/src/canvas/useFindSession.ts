/**
 * useFindSession：查找会话切片的响应式桥（useSelection/useViewport 同款模式）。
 * shallowRef 整体替换（禁深度 reactive 红线），只在 ui.find 分支或 doc 变更
 * （替换改写文本 → 派生命中集变化；打开文档整体重置会话）时同步；订阅随
 * effect scope 自动注销。
 *
 * 五个读数全部是内核口的快照（open/query/replacement 直读 ui.find，matches/
 * cursor 经 listFindMatches/findCursor 派生口）——不驻留第二事实源，每次变更
 * 现算重取（内核派生不驻留语义的面板投影）。
 */
import { onScopeDispose, shallowRef, type Ref } from 'vue'

import type { EditorSession, FindTextHit } from '@hankchen/canvas-editor'

export interface FindSessionSlice {
    /** 会话开合（⌘F 分派开 / Esc 关） */
    open: Ref<boolean>
    query: Ref<string>
    replacement: Ref<string>
    /** 派生命中列表（视觉序，命中 = path + 偏移对） */
    matches: Ref<readonly FindTextHit[]>
    /** 当前游标（内核读侧钳位后的快照：越界落末处/首处，空命中为 0） */
    cursor: Ref<number>
}

export function useFindSession(editor: EditorSession): FindSessionSlice {
    const open = shallowRef(editor.store.ui.find.open)
    const query = shallowRef(editor.store.ui.find.query)
    const replacement = shallowRef(editor.store.ui.find.replacement)
    const matches = shallowRef<readonly FindTextHit[]>(editor.listFindMatches())
    const cursor = shallowRef(editor.findCursor)

    const sync = (): void => {
        const find = editor.store.ui.find
        open.value = find.open
        query.value = find.query
        replacement.value = find.replacement
        matches.value = editor.listFindMatches()
        cursor.value = editor.findCursor
    }

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc' || (change.scope === 'ui' && change.branch === 'find')) sync()
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return { open, query, replacement, matches, cursor }
}
