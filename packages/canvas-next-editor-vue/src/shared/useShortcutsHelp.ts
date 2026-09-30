/**
 * useShortcutsHelp：快捷键帮助面板的单例开合态（kbd-nav 工单 04）。
 *
 * 模块级 ref 即单例：⌘/（useShortcuts 桥拦截注册表 helpShortcuts 条目路由至此）
 * 与状态栏「快捷键」段按钮两个入口共享同一 open 态。对话态是 UI 关注点——不经
 * 内核 dispatcher、不进内核 store（executeShortcut 对该动作恒 false，有测试
 * 锁定）。HelpDialog（shared 域，宿主挂载一次）读取此态渲染。
 */
import { ref, type Ref } from 'vue'

const open = ref(false)

export interface ShortcutsHelp {
    /** 面板开合态（单例共享，双入口同源） */
    open: Ref<boolean>
    show(): void
    close(): void
    toggle(): void
}

export function useShortcutsHelp(): ShortcutsHelp {
    return {
        open,
        show: () => {
            open.value = true
        },
        close: () => {
            open.value = false
        },
        toggle: () => {
            open.value = !open.value
        },
    }
}
