/**
 * 八柄缩放几何（工单 07）。
 *
 * 缩放语义（工单验收项 1/2，术语见根 CONTEXT.md「八柄缩放」词条）：编辑者拖动
 * 选中框上的八柄（四角 + 四边中点）调整图层盒——对缘固定、移动缘随指针；
 * minSize 钳位保证不产生负宽高、不翻转（盒模型契约无通用 angle，明确不做
 * 旋转/翻转）。全部纯函数、无 DOM，缩放手势的文档写回在会话门面（editor.ts
 * resizeTo：position 反解 + auto 标志采纳 + 表格强同步）。
 *
 * 角色可缩放面与属性面板的字段权威过滤（editor-vue fieldSchema ROLE_HIDDEN_KEYS
 * 语义同构）：解码/fromGraph 强同步的尺寸字段不可经柄改——行宽=表宽、格内容
 * 宽高=格尺寸；柄集合 = 轴可缩放面的柄投影，gizmo 渲染与手势起点共用同一条缝。
 */
import { type Canvas, type LayerBox } from '@hankchen/canvas-next'

import { resolveLayer, type LayerPath } from '../shared/layerPath'
import type { SnapPoints } from './snap'

/** 八柄：四角 + 四边中点（命名 = 柄在盒上的方位） */
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type ResizeHandle = (typeof RESIZE_HANDLES)[number]

/** 缩放最小边长（场景 px）：钳位下限，杜绝负宽高与零尺寸不可见层 */
export const RESIZE_MIN_SIZE_PX = 1

/** 缩放几何的盒入参（LayerBox 的位置尺寸切片，与吸附求位入参同形） */
export type ResizeBoxGeometry = Pick<LayerBox, 'x' | 'y' | 'width' | 'height'>

/** 缩放求位的盒结果（绝对坐标，写回面消费） */
export interface ResizeBoxResult {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
}

/** 柄的方向分类（单点维护：resizeBox/resizeSnapPoints/轴判定共读同一份） */
const WEST_HANDLES: ReadonlySet<ResizeHandle> = new Set(['nw', 'w', 'sw'])
const EAST_HANDLES: ReadonlySet<ResizeHandle> = new Set(['ne', 'e', 'se'])
const NORTH_HANDLES: ReadonlySet<ResizeHandle> = new Set(['nw', 'n', 'ne'])
const SOUTH_HANDLES: ReadonlySet<ResizeHandle> = new Set(['sw', 's', 'se'])

/** 柄是否作用于横向（宽轴）：东/西缘与四角 */
export function handleResizesWidth(handle: ResizeHandle): boolean {
    return WEST_HANDLES.has(handle) || EAST_HANDLES.has(handle)
}

/** 柄是否作用于纵向（高轴）：南/北缘与四角 */
export function handleResizesHeight(handle: ResizeHandle): boolean {
    return NORTH_HANDLES.has(handle) || SOUTH_HANDLES.has(handle)
}

/**
 * 八柄缩放求位：对缘固定、移动缘 = 起始缘 + 位移，minSize 钳位（先钳尺寸再
 * 反推移动缘坐标——拖过对缘时停在 minSize 而不翻转，对缘坐标严格不动）。
 * 非本柄轴的位移分量忽略（n 不吃 dx、e 不吃 dy）。
 */
export function resizeBox(
    start: ResizeBoxGeometry,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    minSize: number = RESIZE_MIN_SIZE_PX,
): ResizeBoxResult {
    const west = WEST_HANDLES.has(handle)
    const north = NORTH_HANDLES.has(handle)
    const width = west
        ? start.width - dx
        : EAST_HANDLES.has(handle)
            ? start.width + dx
            : start.width
    const height = north
        ? start.height - dy
        : SOUTH_HANDLES.has(handle)
            ? start.height + dy
            : start.height
    const clampedWidth = Math.max(width, minSize)
    const clampedHeight = Math.max(height, minSize)
    return {
        x: west ? start.x + start.width - clampedWidth : start.x,
        y: north ? start.y + start.height - clampedHeight : start.y,
        width: clampedWidth,
        height: clampedHeight,
    }
}

/**
 * 本步位移下的移动缘场景坐标（钳位前——吸附修正施加在指针位移上，再进
 * resizeBox 钳位，吸附不破「对缘固定 + minSize」语义）。只收真正被写动的缘：
 * 角柄双缘、边柄单缘；固定缘与盒中心不参与缩放吸附（中心对齐是拖动期行为，
 * 缩放期跟随动缘即可）。
 */
export function resizeSnapPoints(
    start: ResizeBoxGeometry,
    handle: ResizeHandle,
    dx: number,
    dy: number,
): SnapPoints {
    const vertical: number[] = []
    const horizontal: number[] = []
    if (WEST_HANDLES.has(handle)) vertical.push(start.x + dx)
    if (EAST_HANDLES.has(handle)) vertical.push(start.x + start.width + dx)
    if (NORTH_HANDLES.has(handle)) horizontal.push(start.y + dy)
    if (SOUTH_HANDLES.has(handle)) horizontal.push(start.y + start.height + dy)
    return { vertical, horizontal }
}

/** 可缩放轴（width = 横向宽字段可写、height = 纵向高字段可写） */
export interface ResizeAxes {
    readonly width: boolean
    readonly height: boolean
}

/** 双轴皆不可缩放（格内容/行模板替身/路径悬空的共同回退） */
const NO_AXES: ResizeAxes = { width: false, height: false }

/**
 * 路径处图层的可缩放轴（角色权威过滤，与 editor-vue fieldSchema
 * ROLE_HIDDEN_KEYS 逐角色同构——面板隐藏的尺寸字段即柄不可写的轴）：
 * - root：双轴（根表宽写经 canonicalize 联动行宽，面板同门放行）；
 * - row：仅纵向（行宽 = 表宽强同步，面板同门隐藏 width）；
 * - cell：双轴（内容宽/行高随 canonicalize 强同步跟随，面板同门放行）；
 * - content / templateContent：content 双向强同步全隐藏；模板格内容宽度耦合
 *   沿用、高度豁免放行（ADR 0006 同门）→ 仅纵向；
 * - 行模板替身（路径尾 'template'）：声明体尺寸不经画布柄改（转换入口/面板
 *   语义面），双轴皆禁。
 */
export function resizableAxesAt(doc: Canvas, path: LayerPath): ResizeAxes {
    const layer = resolveLayer(doc, path)
    if (!layer) return NO_AXES
    if (path[path.length - 1] === 'content') {
        const templateContent = path.length > 3 && path[path.length - 3] === 'template'
        return templateContent ? { width: false, height: true } : NO_AXES
    }
    if (path[path.length - 1] === 'template') return NO_AXES
    const containerKey = path[path.length - 2]
    if (containerKey === 'rows') return { width: false, height: true }
    if (containerKey === 'cells') return { width: true, height: true }
    return { width: true, height: true }
}

/**
 * 路径处图层的可用柄集合：柄的每一条作用轴都在可缩放面内才可用——角柄要求
 * 双轴皆可（行上角柄退化成边柄会造成「拖角只动一边」的歧义，不出），gizmo
 * 渲染与手势起点共用（beginResize 同缝拒绝不可用柄）。
 */
export function resizeHandlesAt(doc: Canvas, path: LayerPath): readonly ResizeHandle[] {
    const axes = resizableAxesAt(doc, path)
    return RESIZE_HANDLES.filter((handle) => {
        const needsWidth = handleResizesWidth(handle)
        const needsHeight = handleResizesHeight(handle)
        return (!needsWidth || axes.width) && (!needsHeight || axes.height)
    })
}

/** 手柄命中半径（css 像素，缩放无关，场景半径 = 半径 / zoom；视觉柄 8px 见 gizmo） */
export const RESIZE_HANDLE_HIT_PX = 6

/** 柄在盒上的中心点（场景坐标：四角 + 四边中点；gizmo 柄绘制同源消费） */
export function resizeHandlePoint(
    box: ResizeBoxGeometry,
    handle: ResizeHandle,
): { x: number; y: number } {
    const right = box.x + box.width
    const bottom = box.y + box.height
    switch (handle) {
        case 'nw':
            return { x: box.x, y: box.y }
        case 'n':
            return { x: box.x + box.width / 2, y: box.y }
        case 'ne':
            return { x: right, y: box.y }
        case 'e':
            return { x: right, y: box.y + box.height / 2 }
        case 'se':
            return { x: right, y: bottom }
        case 's':
            return { x: box.x + box.width / 2, y: bottom }
        case 'sw':
            return { x: box.x, y: bottom }
        case 'w':
            return { x: box.x, y: box.y + box.height / 2 }
    }
}

/**
 * 场景点命中可用柄：距柄中心 ≤ 屏幕半径折算的场景半径即命中；多柄同时命中
 * （极小盒边中点与角点重合）取 RESIZE_HANDLES 次序的先者。只测传入的可用柄
 * 集合（内核 resizeHandlesAt 的投影），不在集合内的柄不命中。
 */
export function resizeHandleAt(
    handles: readonly ResizeHandle[],
    box: ResizeBoxGeometry,
    sceneX: number,
    sceneY: number,
    zoom: number,
): ResizeHandle | null {
    const tolerance = RESIZE_HANDLE_HIT_PX / zoom
    for (const handle of handles) {
        const point = resizeHandlePoint(box, handle)
        if (Math.hypot(sceneX - point.x, sceneY - point.y) <= tolerance) return handle
    }
    return null
}
