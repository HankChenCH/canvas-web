/**
 * 弹层视口定位纯函数（resource-expression-single-ref 工单 05/06，ADR 0020 伴生
 * 修复）：表达式补全浮层与路径选择器菜单共用的落点决策——
 * - 垂直：锚点下方优先 → 下方放不下向上翻转 → 翻转仍不足钳制视口内（下缘贴
 *   viewport − margin；浮层比视口还高钉在上 margin）；
 * - 横向：右缘收口不越 viewport − margin，左缘同理（浮层比视口还宽钉左）。
 *
 * 实测缺陷（工单 06 背景，example 开发轨 2026-10-14）：浮层恒锚光标下方无翻转
 * 钳制，资源字段居面板底部——候选大半截出屏鼠标不可点。两控件（useExpression
 * Completion / 已退役的 usePathCompletion，rows-path-picker 工单 05）的私有
 * clampToViewport 与本函数合并为单点，路径选择器菜单（工单 05）同函数消费。
 *
 * 高/宽度量不到（0——首帧未渲染/降级）：按「放得下/原锚放」处理，不误翻转不
 * 误收口（首开路径由调用方延一拍补量）。纯几何、零 DOM、Node 可测。
 */

/** 锚点盒（视口坐标；取 CompletionAnchor 同形的 top/bottom/left 三轴） */
export interface PopupAnchorBox {
    top: number
    bottom: number
    left: number
}

/** 弹层落点（视口坐标，fixed 定位直用） */
export interface PopupViewportPosition {
    top: number
    left: number
}

/** 锚缘与弹层的间隙（px；既有两控件同语常量收口至此） */
export const POPUP_GAP = 4

/** 弹层与视口边缘的最小留白（px） */
export const POPUP_MARGIN = 4

export function placePopupInViewport(options: {
    anchor: PopupAnchorBox
    popupWidth: number
    popupHeight: number
    viewportWidth: number
    viewportHeight: number
    /** 锚缘间隙；缺省 POPUP_GAP */
    gap?: number
    /** 视口留白；缺省 POPUP_MARGIN */
    margin?: number
}): PopupViewportPosition {
    const { anchor, popupWidth, popupHeight, viewportWidth, viewportHeight } = options
    const gap = options.gap ?? POPUP_GAP
    const margin = options.margin ?? POPUP_MARGIN

    // 垂直：下方 → 翻转 → 钳制三段决策。高度 0 恒判「下方放得下」（不误翻转）
    let top = anchor.bottom + gap
    if (popupHeight > 0 && top + popupHeight > viewportHeight - margin) {
        const flipped = anchor.top - gap - popupHeight
        top = flipped >= margin ? flipped : Math.max(margin, Math.min(top, viewportHeight - margin - popupHeight))
    }

    // 横向：右缘收口；宽度 0 按原锚放（量不到宽不移动）
    let left = anchor.left
    if (popupWidth > 0) {
        left = Math.max(margin, Math.min(left, viewportWidth - margin - popupWidth))
    }

    return { top, left }
}
