/**
 * 标尺拖出参考线自身的吸附（ruler-guides-snap 工单 03，ADR 0012）。
 *
 * 复用内核同一吸附数学（spec 决策 4，不重写）：轴集合经 snapAxesFromBoxes——
 * 可见根层盒缘与中心（收盒走内核 visibleRootBoxes，与内核 dragTo 吸附的
 * snapAxesForDrag 同一收集器；无拖动会话故排除根索引 -1）+ 画布水平/垂直中轴 +
 * 已有参考线轴；求位经 resolveSnap——参考线是零尺寸盒（位置点即九点重合），只取
 * 自身轴向的修正量。命中阈值 = 屏幕 6px 常量按当前缩放换算（snapThresholdScene，
 * 缩放无关手感）。无文档回退原位。纯编排、无 DOM。
 */
import {
    resolveSnap,
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type EditorSession,
    type GuideOrientation,
} from '@hankchen/canvas-editor'

/** 参考线拖出/预览/拖动位置的吸附求位：返回吸附修正后的场景坐标（无命中即原位）。
 *  excludeGuideId：拖动再定位时点名排除被拖线自身轴——否则指针近原位会被自己
 *  粘住（原轴仍是供轴源），拖不出手；拖出落线路径不传，既有语义不动。 */
export function snapGuideAxis(
    editor: EditorSession,
    orientation: GuideOrientation,
    position: number,
    excludeGuideId?: number,
): number {
    const doc = editor.store.doc
    if (!doc) return position
    const guides =
        excludeGuideId === undefined
            ? editor.listGuides()
            : editor.listGuides().filter((guide) => guide.id !== excludeGuideId)
    const resolution = resolveSnap(
        { x: position, y: position, width: 0, height: 0 },
        snapAxesFromBoxes(
            doc.width,
            doc.height,
            visibleRootBoxes(doc, -1, editor.textPolicies),
            guides,
        ),
        snapThresholdScene(editor.store.ui.viewport.zoom),
    )
    return orientation === 'vertical' ? position + resolution.dx : position + resolution.dy
}
