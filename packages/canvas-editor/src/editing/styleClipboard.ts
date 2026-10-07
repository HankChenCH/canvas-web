/**
 * 样式剪贴板内核语义（canvas-web-style-paste 工单 01）：样式集/适用面常量 +
 * 复制快照/粘贴落地的纯函数面。
 *
 * - 样式 = 三族字段子集（spec 决策 2）：盒内对齐（align.horizontal/vertical）、
 *   形状皮肤（shape.backgroundColor/shape.border/shape.padding）、文本族
 *   （font/fontSize/fontColor/autowrap/angle/shape.lineHeight，仅文本层适用；
 *   lineHeight 虽住 shape 段但随文本族走跨型规则）。明确排除：位置/尺寸/锚点
 *   （几何不是样式）、name/visible/priority、数据字段 text/src/value（内容走
 *   复制/粘贴本体）、expression、表格结构字段（template/rows/rowsPath）。
 * - 适用面清单（spec 决策 3）按 LayerType 由内核 editing 域自持——对齐
 *   editor-vue fieldSchema 的分组事实但**不引它**（依赖方向红线）：fieldSchema
 *   给行模板替身只暴露高/高自适应（尺寸族不在样式集），故其适用面为空。
 * - 快照 = {sourceType, values}：逐字段 JSON 深拷贝（与源层断开引用，后续编辑
 *   源层不影响）；拷贝不进历史（剪贴板态不是文档态，session 槽同门）。
 * - 粘贴 = 目标类型适用面 ∩ 快照字段逐字段 verbatim 覆盖：null 即值（无填充/
 *   无边框是样式事实）、Border 整对象覆盖；源不适型字段静默跳过；全等字段
 *   跳写——结构等值的新引用 immer 仍记 patch，跳写保「零变化 = 空 patch =
 *   不进历史」真短路。autoHeight⟹height=0 断言与 canonicalizeTableSync 重断言
 *   在 session 事务内一次收口（updateSpec 同门），本模块只做字段读写与判定。
 */

import type { Draft } from 'immer'

import type { Layer, LayerType } from '@hankchen/canvas'

import { readSpecField, writeSpecField } from '../shared/specField'

/** 盒内对齐族（对齐 fieldSchema 对齐组） */
const ALIGN_FAMILY: readonly (readonly string[])[] = [
    ['align', 'horizontal'],
    ['align', 'vertical'],
]

/** 形状皮肤族（对齐 fieldSchema 形状组的样式三键；宽高/auto 不属样式） */
const SKIN_FAMILY: readonly (readonly string[])[] = [
    ['shape', 'backgroundColor'],
    ['shape', 'border'],
    ['shape', 'padding'],
]

/** 文本族（fieldSchema 文本组 + TextLayer 专属 angle 与 shape.lineHeight） */
const TEXT_FAMILY: readonly (readonly string[])[] = [
    ['font'],
    ['fontSize'],
    ['fontColor'],
    ['autowrap'],
    ['angle'],
    ['shape', 'lineHeight'],
]

/**
 * 按 LayerType 的样式字段适用面（spec 决策 3）：键为图层内字段路径。行模板替身
 * 适用面为空——面板只暴露高/高自适应（尺寸族不在样式集），无样式可复制可贴。
 */
export const STYLE_FIELD_KEYS_BY_TYPE: Readonly<Record<LayerType, readonly (readonly string[])[]>> = {
    TextLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY, ...TEXT_FAMILY],
    ImageLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY],
    QrCodeLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY],
    TableLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY],
    TableRowLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY],
    TableCellLayer: [...ALIGN_FAMILY, ...SKIN_FAMILY],
    TableRowTemplate: [],
}

/** 样式快照（样式剪贴板条目）：源类型 + 适用面逐字段值 */
export interface StyleSnapshot {
    readonly sourceType: LayerType
    /** 字段值：键 = 字段路径点串（如 'align.horizontal'），值 = JSON 深拷贝 */
    readonly values: Readonly<Record<string, unknown>>
}

/** 字段键 → 快照记录键（点串；字段段为固定领域名，无歧义） */
const fieldId = (key: readonly string[]): string => key.join('.')

/** 领域类型是纯 JSON 形态（往返恒等契约），JSON 往返即深拷贝（cloneLayerSubtree 同门） */
function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/** 结构等值（stringify 即指纹；undefined === undefined 为真——两侧缺字段视为全等） */
function jsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 按源类型适用面抓逐字段深拷贝快照；适用面为空（行模板替身）返回 null——
 * 无样式可复制，调用方空转（空快照不占槽，已拷贝的样式不被无样式源清掉）。
 */
export function captureStyleSnapshot(layer: Layer): StyleSnapshot | null {
    const fields = STYLE_FIELD_KEYS_BY_TYPE[layer.type]
    if (fields.length === 0) return null
    const values: Record<string, unknown> = {}
    for (const key of fields) {
        const value = readSpecField(layer, key)
        if (value !== undefined) values[fieldId(key)] = deepClone(value)
    }
    return { sourceType: layer.type, values }
}

/** 逐字段应用快照到图层 draft（目标适用面 ∩ 快照）：verbatim 覆盖、null 即值、
 * Border 整对象；快照没有的字段（源不适型）静默跳过；全等字段跳写。返回实际
 * 写入的字段键（空数组 = 零变化，调用方经 store 空 patch 空转）。
 */
export function applyStyleFieldsInDraft(
    layer: Draft<Layer>,
    snapshot: StyleSnapshot,
): (readonly string[])[] {
    const written: (readonly string[])[] = []
    for (const key of STYLE_FIELD_KEYS_BY_TYPE[layer.type]) {
        const value = snapshot.values[fieldId(key)]
        if (value === undefined) continue // 源不适型：快照无此字段
        const current = readSpecField(layer, key)
        if (jsonEqual(current, value)) continue // 全等跳写：保零变化真短路
        if (writeSpecField(layer, key, deepClone(value))) written.push(key)
    }
    return written
}
