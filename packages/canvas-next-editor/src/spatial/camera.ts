/**
 * 相机纯函数（工单 05）。统一坐标定义（impl 研究文档 §2.6）：
 *
 *   screen = (scene - cam) * zoom
 *
 - 场景坐标全程保持画布整数像素语义（与后端整型口径一致），换算只发生在
 *   输入端（指针 → 场景）与呈现端（ctx transform）；本模块只做数值换算，
 *   不触及任何 DOM/渲染对象。
 * - 相机平移可对齐物理像素（snapViewportToPhysicalPixels），避免缩放/平移
 *   时的亚像素抖动；zoom 数值本身不取整，缩放百分比显示用原值。
 */

/** 视口：相机（场景坐标下的视口左上角）+ 缩放倍率 */
export interface Viewport {
    x: number
    y: number
    zoom: number
}

export interface Point {
    x: number
    y: number
}

export interface Size {
    width: number
    height: number
}

/** 场景矩形（适应选区的目标盒等） */
export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/** 缩放范围（可配置；缺省 5%–800%，工单 05 拍板） */
export interface ZoomBounds {
    min: number
    max: number
}

export const DEFAULT_ZOOM_BOUNDS: ZoomBounds = { min: 0.05, max: 8 }

/** 场景 → 屏幕（呈现端换算） */
export function sceneToScreen(viewport: Viewport, sceneX: number, sceneY: number): Point {
    return {
        x: (sceneX - viewport.x) * viewport.zoom,
        y: (sceneY - viewport.y) * viewport.zoom,
    }
}

/** 屏幕 → 场景（输入端换算：命中测试等） */
export function screenToScene(viewport: Viewport, screenX: number, screenY: number): Point {
    return {
        x: screenX / viewport.zoom + viewport.x,
        y: screenY / viewport.zoom + viewport.y,
    }
}

/** 缩放倍率钳位到范围 */
export function clampZoom(zoom: number, bounds: ZoomBounds): number {
    return Math.min(bounds.max, Math.max(bounds.min, zoom))
}

/**
 * 平移：屏幕位移按 zoom 折算回场景位移（cam -= delta / zoom），
 * 保证平移速度与缩放倍率无关。
 */
export function panBy(viewport: Viewport, deltaScreenX: number, deltaScreenY: number): Viewport {
    return {
        x: viewport.x - deltaScreenX / viewport.zoom,
        y: viewport.y - deltaScreenY / viewport.zoom,
        zoom: viewport.zoom,
    }
}

/**
 * 缩放至指针（zoom-to-pointer）：保持指针下的场景点不动——
 *   scene₀ = screen₀ / zoom + cam ⇒ cam' = scene₀ - screen₀ / zoom'
 * 目标倍率先钳位到范围，锚点关系按钳位后的倍率成立。
 */
export function zoomAtPoint(
    viewport: Viewport,
    screenX: number,
    screenY: number,
    nextZoom: number,
    bounds: ZoomBounds,
): Viewport {
    const zoom = clampZoom(nextZoom, bounds)
    if (zoom === viewport.zoom) return viewport
    return {
        x: screenX / viewport.zoom + viewport.x - screenX / zoom,
        y: screenY / viewport.zoom + viewport.y - screenY / zoom,
        zoom,
    }
}

/**
 * 适应画布：整页可见（宽高取更紧一侧）、画布中心对齐视口中心。
 * margin 为可视区域内缩（屏幕像素）。缩放范围只钳**上界**（防小画布被荒谬放大），
 * 不钳下界——「适应」的语义是整页可见，超大画布允许低于交互缩放下界。
 * 零尺寸输入防御回落恒等视口。
 */
export function fitViewport(
    canvas: Size,
    surface: Size,
    bounds: ZoomBounds,
    margin: number,
): Viewport {
    return fitRect({ x: 0, y: 0, width: canvas.width, height: canvas.height }, surface, bounds, margin)
}

/** 适应任意场景矩形（工单 06 适应选区）：矩形整块可见、矩形中心对齐视口中心 */
export function fitRect(
    rect: Rect,
    surface: Size,
    bounds: ZoomBounds,
    margin: number,
): Viewport {
    const innerW = surface.width - margin * 2
    const innerH = surface.height - margin * 2
    if (rect.width <= 0 || rect.height <= 0 || innerW <= 0 || innerH <= 0) {
        return { x: 0, y: 0, zoom: 1 }
    }
    const zoom = Math.min(bounds.max, Math.min(innerW / rect.width, innerH / rect.height))
    return {
        // 矩形中心 (rect.cx, rect.cy) 落在视口中心 (surface/2)：cam = 中心 - 视口中心 / zoom
        x: rect.x + rect.width / 2 - surface.width / 2 / zoom,
        y: rect.y + rect.height / 2 - surface.height / 2 / zoom,
        zoom,
    }
}

/**
 * 保 zoom 平移入视的小边距（屏幕 px，canvas-web-find-replace 工单 02 定死）：
 * 出视入视后盒缘与视口缘的留白。
 */
export const PAN_TO_BOX_MARGIN_PX = 12

/**
 * 保 zoom 平移入视（canvas-web-find-replace 工单 02，spec 决策 6）：查找导航的
 * 视口跟随语义，与 fitRect 的变焦语义分立——缩放倍率恒不变，只在目标盒出视时
 * 最小平移使整盒入视。
 *
 * - 盒完全在视口内（贴边也算）→ 原视口原样返回（引用相等，调用方可据此短路通知）；
 * - 出视才平移，两轴独立求位，入视带含 margin 留白（屏幕 px）：
 *   - 盒装得下「视口 − 2×margin」：cam 钳进可行区间 = 各轴最小平移（非居中）；
 *   - 盒装得下视口但 margin 两侧放不下：margin 让位，钳进裸视口可行区间 = 贴缘
 *     最小平移（整盒可见优先于边距，spec「最小平移」字面口径）；
 *   - 盒大于视口：对齐盒左上（左上角落在 margin 处，右/下侧自然截断——工单
 *     定死取「阅读起点可见」而非居中）。
 * 零尺寸表面/非正 zoom 防御回落原视口。
 */
export function panToBox(viewport: Viewport, box: Rect, surface: Size, margin: number): Viewport {
    if (surface.width <= 0 || surface.height <= 0 || !(viewport.zoom > 0)) return viewport
    const panAxis = (boxPos: number, boxSize: number, surfaceSize: number, cam: number): number => {
        const left = (boxPos - cam) * viewport.zoom
        const right = left + boxSize * viewport.zoom
        if (left >= 0 && right <= surfaceSize) return cam
        const slack = surfaceSize - boxSize * viewport.zoom
        if (slack >= margin * 2) {
            // 可行区间 [lo, hi]：cam 取区间内任意值盒都整在 [margin, surface − margin]
            // 入视带内；钳进最近端 = 最小平移
            const lo = boxPos + boxSize - (surfaceSize - margin) / viewport.zoom
            const hi = boxPos - margin / viewport.zoom
            return Math.min(hi, Math.max(lo, cam))
        }
        if (slack >= 0) {
            // margin 带放不下整盒（盒贴近视口尺寸）：margin 让位，裸视口可行区间
            // 钳近端 = 贴缘最小平移，盒从出视一侧探入
            const lo = boxPos + boxSize - surfaceSize / viewport.zoom
            const hi = boxPos
            return Math.min(hi, Math.max(lo, cam))
        }
        return boxPos - margin / viewport.zoom
    }
    const x = panAxis(box.x, box.width, surface.width, viewport.x)
    const y = panAxis(box.y, box.height, surface.height, viewport.y)
    if (x === viewport.x && y === viewport.y) return viewport
    return { x, y, zoom: viewport.zoom }
}

/**
 * 相机平移对齐物理像素：cam = round(cam * zoom * dpr) / (zoom * dpr)。
 * 只动 x/y，zoom 保持原值（百分比显示用原值）。
 */
export function snapViewportToPhysicalPixels(viewport: Viewport, dpr: number): Viewport {
    if (!(dpr > 0)) return viewport
    const gridX = viewport.zoom * dpr
    return {
        x: Math.round(viewport.x * gridX) / gridX,
        y: Math.round(viewport.y * gridX) / gridX,
        zoom: viewport.zoom,
    }
}

/**
 * 滚轮/触控板捏合的下一档缩放（excalidraw App.wheel.ts 同式，加性曲线）：
 *  - 单档步长 ZOOM_STEP，delta 钳位到 ±ZOOM_STEP*100（防大 delta 过冲）；
 *  - >100% 区按 log10(zoom) 增幅（越放大步长越大）；
 *  - 增幅项按 min(1, |Δ|/20) 衰减，防触控板小位移微抖。
 * deltaY > 0（向下滚）= 缩小。结果钳位到范围。
 */
export const WHEEL_ZOOM_STEP = 0.1

export function nextZoomByWheel(zoom: number, deltaY: number, bounds: ZoomBounds): number {
    if (deltaY === 0) return clampZoom(zoom, bounds)
    const sign = Math.sign(deltaY)
    const absDelta = Math.abs(deltaY)
    const delta = Math.min(absDelta, WHEEL_ZOOM_STEP * 100) * sign

    let next = zoom - delta / 100
    next += Math.log10(Math.max(1, zoom)) * -sign * Math.min(1, absDelta / 20)
    return clampZoom(next, bounds)
}
