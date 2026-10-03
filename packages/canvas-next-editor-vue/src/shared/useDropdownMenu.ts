/**
 * useDropdownMenu：下拉菜单开合底座的逻辑面（editor-top-toolbar 工单 02）。
 *
 * 触发钮点击开合；开态收起两路——点外（window pointerdown，容器包含判定）
 * 与 Esc（window keydown），监听随开合挂卸、仅开态在场（状态栏缩放菜单先例
 * `StatusBar.vue` 的封装版：容器包含判定吃掉「点触发钮收了又被 click 重开」
 * 的时序，调用方不再需要 pointerdown.stop 约定）。卸载经 onScopeDispose 摘
 * 残留监听。
 *
 * 键盘导航（issues/04）的落点计算在本文 nextEnabledItemIndex 纯函数（有单测
 * 钉住）；焦点编排（开时入菜单/收起回触发钮/菜单内按键路由）在呈现件
 * DropdownMenu.vue。keepsOpen 语义不做（spec Q12）。
 *
 * 呈现件 DropdownMenu.vue 消费本 composable；工具栏三下拉（issues/03）经组件
 * 使用，面板＋/缩放菜单的迁移是后续票（issues/05）。
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** 菜单项：shortcut 为纯展示键位后缀（右侧灰字，字符串由调用方传入，底座不做
 *  平台检测）；title 承载置灰原因（壳内「置灰 + title」统一先例，ContextMenu.vue） */
export interface DropdownMenuItem {
    label: string
    title?: string
    disabled?: boolean
    shortcut?: string
    run: () => void
}

/** 菜单条目 = 菜单项 | 分隔符（成员间可插，排列▾/视图▾ 各需一段） */
export type DropdownMenuEntry = DropdownMenuItem | 'separator'

export interface DropdownMenuController {
    /** 菜单开合态（触发钮 aria-expanded 与菜单 v-if 同源） */
    open: Ref<boolean>
    toggle(): void
    openMenu(): void
    closeMenu(): void
}

export function useDropdownMenu(options: { container: Ref<HTMLElement | null> }): DropdownMenuController {
    const open = ref(false)

    /** 点外收：pointerdown 落在容器（触发钮 + 菜单本体）内不收，其余一律收；
     *  合成事件 target 非 Node（如直接派发在 window）按点外处理 */
    function onWindowPointerDown(event: PointerEvent): void {
        const el = options.container.value
        const target = event.target
        if (el !== null && target instanceof Node && el.contains(target)) return
        open.value = false
    }

    function onWindowKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') open.value = false
    }

    function detach(): void {
        window.removeEventListener('pointerdown', onWindowPointerDown)
        window.removeEventListener('keydown', onWindowKeydown)
    }

    // 开态才挂监听，收起即摘除（先例 StatusBar.vue 的 watch 挂卸模式）
    watch(open, (isOpen) => {
        if (isOpen) {
            window.addEventListener('pointerdown', onWindowPointerDown)
            window.addEventListener('keydown', onWindowKeydown)
        } else {
            detach()
        }
    })

    // 宿主组件卸载时开态未收的兜底（watch 卸载不触发）；静默标志沿包内
    // composables 同门惯例（无活动 scope 的调用不告警）
    onScopeDispose(detach, true)

    return {
        open,
        toggle: () => {
            open.value = !open.value
        },
        openMenu: () => {
            open.value = true
        },
        closeMenu: () => {
            open.value = false
        },
    }
}

/** 菜单内导航键（issues/04）：↑↓ 循环 + Home/End 首尾；左右键与 typeahead 不做 */
export type MenuFocusKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

/**
 * 菜单键盘导航落点（纯函数，issues/04）：enabled 与菜单项 DOM 序对齐的启用位
 * 标志，current 为现焦点项下标（焦点不在项上——菜单根本兜——传 -1），返回落点
 * 下标。置灰项跳过（原生 disabled 不可聚焦，「可达」需改 aria-disabled 契约，
 * 拍板记 issues/04 Comments）；↑↓ 循环（末项 ↓ 绕首、首项 ↑ 绕尾），current=-1
 * 时 ↓ 落首个启用项、↑ 落末个；全置灰返回 -1，调用方回焦菜单根。
 */
export function nextEnabledItemIndex(enabled: readonly boolean[], current: number, key: MenuFocusKey): number {
    const count = enabled.length
    if (count === 0) return -1
    if (key === 'Home' || key === 'End') {
        for (let n = 0; n < count; n++) {
            const index = key === 'Home' ? n : count - 1 - n
            if (enabled[index]) return index
        }
        return -1
    }
    const step = key === 'ArrowDown' ? 1 : -1
    // current=-1：↓ 从头正向扫（首启用项）、↑ 从尾反向扫（末启用项）
    let index = current === -1 ? (step === 1 ? -1 : count) : current
    for (let n = 0; n < count; n++) {
        index = (index + step + count) % count
        if (enabled[index]) return index
    }
    return -1
}
