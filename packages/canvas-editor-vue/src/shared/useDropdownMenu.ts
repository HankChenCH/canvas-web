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
 * DropdownMenu.vue。keepsOpen 语义本票（02）不做（spec Q12），issues/05 迁移
 * 模板表表单交换时按需加入（仅 keepsOpen 项分发留场，见 DropdownMenuItem）。
 *
 * 呈现件 DropdownMenu.vue 消费本 composable；工具栏三下拉（issues/03）经内建
 * 触发钮使用，状态栏缩放菜单与面板＋（issues/05）经 #trigger/#body 受控插槽
 * 消费（自绘触发钮观感、rowsPath 表单体，见 DropdownMenuSlotProps）。
 *
 * submenu 两段式条目底座（canvas-web-preset-submenu 工单 02）：DropdownMenuEntry
 * 增 submenu 形态（主体直建 + ▸ 预设二级，见 DropdownSubmenuEntry），三决策抽
 * 纯函数在本文模块级导出——开合切换 nextOpenSubmenu（单开不变量）、翻转定位
 * placeSubmenuInViewport（右缘钳位翻左）、二级键盘动作 submenuKeyAction；焦点
 * 编排（开入首项/收回 ▸/按键路由）在呈现件。
 */
import { onScopeDispose, ref, watch, type ComponentPublicInstance, type Ref } from 'vue'

/** 菜单项：shortcut 为纯展示键位后缀（右侧灰字，字符串由调用方传入，底座不做
 *  平台检测）；title 承载置灰原因（壳内「置灰 + title」统一先例，ContextMenu.vue）；
 *  keepsOpen 项分发后菜单留场（面板＋模板表表单交换特例，issues/05 拍板推翻
 *  spec Q12 的「勿加」——迁移需要，且仅此一形态）；dataAttrs 透传 data-* 目验/
 *  测试钩子（状态栏 data-zoom-*、面板 data-add-layer 同缝） */
export interface DropdownMenuItem {
    label: string
    title?: string
    disabled?: boolean
    shortcut?: string
    keepsOpen?: boolean
    dataAttrs?: Readonly<Record<string, string>>
    run: () => void
}

/**
 * 两段式 submenu 条目（canvas-web-preset-submenu 工单 02）：一级行渲染为左右两
 * 段命中区——主体（label + 可选 shortcut 灰字后缀）点击/Enter = run + 收菜单
 * （直建语义，spec 决策 3「保点一级直达」）；右缘 ▸ 钮悬停/点击唤出 children
 * 二级浮层（预设项，title 承载归属说明）。children 收完整 DropdownMenuEntry
 * （容纳分隔符）；dataAttrs 透传主体钮（面板 data-add-layer 同缝）；keepsOpen
 * 无此形态——主体分发无条件收菜单（spec 门控拍板）。
 */
export interface DropdownSubmenuEntry {
    kind: 'submenu'
    label: string
    title?: string
    disabled?: boolean
    shortcut?: string
    dataAttrs?: Readonly<Record<string, string>>
    /** 主体点击/Enter = 直建（run + 收整个菜单） */
    run: () => void
    /** 预设二级条目（子项 run = 带 preset 直建，装配归宿主——工单 03 消费） */
    children: readonly DropdownMenuEntry[]
}

/** submenu 形态判定（kind 字段只此形态持有，in 判定窄化联合） */
export function isSubmenuEntry(entry: DropdownMenuEntry): entry is DropdownSubmenuEntry {
    return entry !== 'separator' && 'kind' in entry && entry.kind === 'submenu'
}

/** 菜单条目 = 菜单项 | 两段式 submenu | 分隔符（成员间可插，排列▾/视图▾ 各需一段） */
export type DropdownMenuEntry = DropdownMenuItem | DropdownSubmenuEntry | 'separator'

export interface DropdownMenuController {
    /** 菜单开合态（触发钮 aria-expanded 与菜单 v-if 同源） */
    open: Ref<boolean>
    toggle(): void
    openMenu(): void
    closeMenu(): void
}

/**
 * #trigger / #body 两插槽的受控 props（issues/05）：自绘触发钮消费 open（驱动
 * aria-expanded）/toggle（点击开合，内含定位与焦点编排）/triggerRef（元素记录，
 * 定位与回焦的前提）/onKeydown（↓ 开菜单）；菜单体消费 closeMenu（表单创建/
 * 取消自管收起）。a11y 两属性 aria-haspopup="menu"/:aria-expanded 由消费方写在
 * 自绘钮上——底座保留 role="menu"/role="menuitem" 与菜单 aria-label。
 */
export interface DropdownMenuSlotProps {
    open: boolean
    toggle(): void
    closeMenu(): void
    triggerRef(el: Element | ComponentPublicInstance | null): void
    onKeydown(event: KeyboardEvent): void
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

// ---- submenu 两段式条目底座（canvas-web-preset-submenu 工单 02）----
// 开合切换 / 翻转定位 / 二级键盘动作三决策抽纯函数（有单测钉住），焦点编排留
// 呈现件 DropdownMenu.vue。开合态以条目引用为键（身份等价，免下标簿记——
// items 含 separator 时下标错位），纯函数签名对键型泛型、单测用 number 钉语义。

/** 二级开合动作（指针门控的语义输入）：open = ▸ 悬停/键盘 →（恒开指定行）；
 *  toggle = ▸ 点击（同行翻转、异行换开）；close = 移出菜单/菜单随收/子项分发 */
export interface SubmenuToggleAction<T> {
    type: 'open' | 'toggle' | 'close'
    /** open/toggle 的目标条目（close 时无意义，恒 null） */
    target?: T
}

/**
 * 二级开合切换（纯函数）：单开不变量——任一时刻至多一行二级在场。open 换开
 * （异行收旧开新、同行保持）、toggle 同行翻转（已开收、未开开）、close 全关。
 */
export function nextOpenSubmenu<T>(current: T | null, action: SubmenuToggleAction<T>): T | null {
    if (action.type === 'close' || action.target === undefined) return null
    if (action.type === 'open') return action.target
    return current === action.target ? null : action.target
}

/** 二级浮层锚点盒（触发行 ▸ 的视口坐标，getBoundingClientRect 同形四轴） */
export interface SubmenuAnchorBox {
    top: number
    bottom: number
    left: number
    right: number
}

/** 二级浮层落点（视口坐标，fixed 直用）；side = 弹出侧（右缘放不下翻左） */
export interface SubmenuPlacement {
    left: number
    top: number
    side: 'right' | 'left'
}

/** 二级浮层与触发行的屏幕间隙（px，主菜单 MENU_GAP_PX 同值语义） */
export const SUBMENU_GAP_PX = 6

/** 二级浮层与视口边缘的最小留白（px，主菜单 VIEWPORT_MARGIN_PX 同值语义） */
export const SUBMENU_VIEWPORT_MARGIN_PX = 2

/**
 * 二级浮层定位（纯函数）：默认弹触发行右侧（左缘 = 行右缘 + 间隙、顶缘对齐行
 * 顶缘）；右缘放不下翻左侧（右缘 = 行左缘 − 间隙）；水平/垂直都钳位进视口。
 * 宽/高度量不到（0——首帧未渲染/降级）按「放得下/不移动」处理，不误翻转不误
 * 收口（首帧锚点直用，渲染后调用方补量钳位——主菜单弹层两段式定位同惯例）。
 * 纯几何、零 DOM、Node 可测。
 */
export function placeSubmenuInViewport(options: {
    anchor: SubmenuAnchorBox
    flyoutWidth: number
    flyoutHeight: number
    viewportWidth: number
    viewportHeight: number
    /** 触发行与浮层的间隙；缺省 SUBMENU_GAP_PX */
    gap?: number
    /** 视口留白；缺省 SUBMENU_VIEWPORT_MARGIN_PX */
    margin?: number
}): SubmenuPlacement {
    const { anchor, flyoutWidth, flyoutHeight, viewportWidth, viewportHeight } = options
    const gap = options.gap ?? SUBMENU_GAP_PX
    const margin = options.margin ?? SUBMENU_VIEWPORT_MARGIN_PX

    // 侧别：右缘放不下翻左；宽度量不到按放得下处理（不误翻）
    const side: 'right' | 'left' =
        flyoutWidth > 0 && anchor.right + gap + flyoutWidth > viewportWidth - margin ? 'left' : 'right'

    let left = side === 'right' ? anchor.right + gap : anchor.left - gap - flyoutWidth
    if (flyoutWidth > 0) {
        left = Math.max(margin, Math.min(left, viewportWidth - margin - flyoutWidth))
    }

    // 垂直：顶缘对齐行顶，越缘双向钳回留白内；高度量不到不移动
    let top = anchor.top
    if (flyoutHeight > 0) {
        top = Math.max(margin, Math.min(top, viewportHeight - margin - flyoutHeight))
    }

    return { left, top, side }
}

/**
 * 二级浮层键盘动作（纯函数）：焦点在二级浮层子项上时的按键决策——↑↓/Home/End
 * 推进（落点仍归 nextEnabledItemIndex）、←/Esc 收二级（菜单留场，两段收的第一
 * 段）、Enter/Space 激活焦点子项（带 preset 直建）、Tab 收整个菜单（沿现状，
 * 不 preventDefault 由调用方保证）、其余 none（模态吞掉）。
 */
export type SubmenuKeyAction =
    | { type: 'none' }
    | { type: 'move'; key: MenuFocusKey }
    | { type: 'close' }
    | { type: 'activate' }
    | { type: 'close-menu' }

export function submenuKeyAction(key: string): SubmenuKeyAction {
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        return { type: 'move', key }
    }
    if (key === 'ArrowLeft' || key === 'Escape') return { type: 'close' }
    if (key === 'Enter' || key === ' ') return { type: 'activate' }
    if (key === 'Tab') return { type: 'close-menu' }
    return { type: 'none' }
}
