/**
 * 字段描述注册表（工单 09）：属性面板的 schema 面——按图层 type 声明字段组，
 * 面板组件按清单渲染，新增图层字段 = 改本文件 + 领域类型，面板零改动。
 *
 * - key 用领域模型的数组路径（相对图层对象根，如 ['shape','backgroundColor']），
 *   拼上选中图层路径即 patch path；数据字段（wire data.value 的领域展开
 *   Text.text / Image.src / QrCode.value）标 data:true，提交走 updateData。
 * - 权威字段过滤两层：visibleWhen（type 内的显隐，如 autoWidth 隐藏 width 输入）
 *   与容器角色过滤（解码/fromGraph 强同步的字段不渲染——行宽强制 = 表宽、格内容
 *   宽高被压平，暴露出来就是「改了又被改回去」的 bug 报告）。
 * - 本模块是纯数据 + 纯函数（零 Vue 依赖），与内核同款在 Node 无 DOM 环境测试。
 */
import {
    HORIZONTAL_ALIGNS,
    VERTICAL_ALIGNS,
    type Layer,
    type LayerPath,
    type LayerType,
} from '@hankchen/canvas-next-editor'

/** 控件种类（与 controls.ts 的组件注册表一一对应） */
export type FieldControl =
    | 'number'
    | 'text'
    | 'textarea'
    | 'color'
    | 'select'
    | 'boolean'
    | 'anchor'
    | 'padding'
    | 'border'

export interface FieldDef {
    /** 图层内字段路径（领域形态）；画布级字段相对画布根 */
    readonly key: readonly string[]
    readonly label: string
    readonly control: FieldControl
    /** 数据字段：提交走 updateData（按 type 分派到 text/src/value），其余走 updateSpec */
    readonly data?: boolean
    /** select 取值域（领域常量原样引用，不自创缩写） */
    readonly domain?: readonly string[]
    readonly min?: number
    readonly max?: number
    readonly step?: number
    /** 数值提交向零截断（PHP intval 同门）；padding/lineHeight 等浮点字段不开 */
    readonly integer?: boolean
    /** 颜色字段允许 null（如背景色 = 无填充） */
    readonly nullable?: boolean
    /** 权威字段过滤：谓词为假不渲染（不告警） */
    readonly visibleWhen?: (layer: Layer) => boolean
}

export interface FieldSection {
    readonly title: string
    readonly fields: readonly FieldDef[]
}

// ---- 公共字段组（各 type 共享一份描述） ----

const POSITION_SECTION: FieldSection = {
    title: '位置',
    fields: [
        { key: ['position', 'anchor'], label: '锚点', control: 'anchor' },
        { key: ['position', 'x'], label: 'X', control: 'number', integer: true },
        { key: ['position', 'y'], label: 'Y', control: 'number', integer: true },
    ],
}

const ALIGN_SECTION: FieldSection = {
    title: '对齐',
    fields: [
        { key: ['align', 'horizontal'], label: '水平', control: 'select', domain: HORIZONTAL_ALIGNS },
        { key: ['align', 'vertical'], label: '垂直', control: 'select', domain: VERTICAL_ALIGNS },
    ],
}

const SHAPE_SECTION: FieldSection = {
    title: '形状',
    fields: [
        {
            key: ['shape', 'width'],
            label: '宽',
            control: 'number',
            integer: true,
            min: 0,
            visibleWhen: (layer) => !layer.shape.autoWidth,
        },
        {
            key: ['shape', 'height'],
            label: '高',
            control: 'number',
            integer: true,
            min: 0,
            visibleWhen: (layer) => !layer.shape.autoHeight,
        },
        { key: ['shape', 'autoWidth'], label: '宽自适应', control: 'boolean' },
        { key: ['shape', 'autoHeight'], label: '高自适应', control: 'boolean' },
        { key: ['shape', 'backgroundColor'], label: '背景色', control: 'color', nullable: true },
        {
            key: ['shape', 'lineHeight'],
            label: '行高倍数',
            control: 'number',
            step: 0.1,
            min: 0,
            visibleWhen: (layer) => layer.type === 'TextLayer',
        },
        { key: ['shape', 'padding'], label: '内边距', control: 'padding' },
        { key: ['shape', 'border'], label: '边框', control: 'border' },
    ],
}

// ---- type 专属字段组 ----

const TEXT_SECTION: FieldSection = {
    title: '文本',
    fields: [
        { key: ['text'], label: '内容', control: 'textarea', data: true },
        { key: ['font'], label: '字体', control: 'text' },
        { key: ['fontSize'], label: '字号', control: 'number', integer: true, min: 1 },
        { key: ['fontColor'], label: '字色', control: 'color' },
        { key: ['angle'], label: '旋转角', control: 'number', integer: true },
        { key: ['autowrap'], label: '自动换行', control: 'boolean' },
    ],
}

const IMAGE_SECTION: FieldSection = {
    title: '图片',
    fields: [{ key: ['src'], label: '资源地址', control: 'text', data: true }],
}

const QR_SECTION: FieldSection = {
    title: '二维码',
    fields: [{ key: ['value'], label: '内容', control: 'text', data: true }],
}

/**
 * type → 字段组注册表。表/行/格无数据字段；结构编辑（行列增删/重排）在
 * 图层面板（工单 10/12），此处只暴露形状/位置/对齐。
 */
export const FIELD_SECTIONS_BY_TYPE: Record<LayerType, readonly FieldSection[]> = {
    ImageLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, IMAGE_SECTION],
    TextLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, TEXT_SECTION],
    QrCodeLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, QR_SECTION],
    TableLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION],
    TableRowLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION],
    TableCellLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION],
}

/** 注册表查找的宽容口：白名单之外的 type 串返回空清单（不抛、不告警） */
export function fieldSectionsForType(type: string): readonly FieldSection[] {
    return (FIELD_SECTIONS_BY_TYPE as Record<string, readonly FieldSection[]>)[type] ?? []
}

// ---- 容器角色权威过滤：解码强同步字段不渲染 ----

/** 图层在容器树里的角色（由路径尾段判定，纯函数） */
export type LayerRole = 'root' | 'row' | 'cell' | 'content'

export function layerRoleAt(path: LayerPath): LayerRole {
    if (path[path.length - 1] === 'content') return 'content'
    const key = path[path.length - 2]
    if (key === 'rows') return 'row'
    if (key === 'cells') return 'cell'
    return 'root'
}

/**
 * 各角色被解码/fromGraph 强同步的字段（点分 key）：
 * - row：addRow 强制行宽 = 表宽并关 autoWidth；
 * - content：addContentLayer 强制内容宽 = 格宽；cell 固定高语义把内容高压平
 *   （解码后带内容的 cell 恒为固定高），宽高两族全部隐藏。
 */
const ROLE_HIDDEN_KEYS: Record<LayerRole, readonly string[]> = {
    root: [],
    cell: [],
    row: ['shape.width', 'shape.autoWidth'],
    content: ['shape.width', 'shape.autoWidth', 'shape.height', 'shape.autoHeight'],
}

/**
 * 面板实际渲染的字段组：type 注册表 ∩ 角色权威过滤 ∩ visibleWhen。
 * 过滤后为空的 section 不输出（不渲染空标题）。
 */
export function fieldSectionsForPath(path: LayerPath, layer: Layer): readonly FieldSection[] {
    const hidden = new Set(ROLE_HIDDEN_KEYS[layerRoleAt(path)])
    const result: FieldSection[] = []
    for (const section of fieldSectionsForType(layer.type)) {
        const fields = section.fields.filter(
            (field) =>
                !hidden.has(field.key.join('.')) && (!field.visibleWhen || field.visibleWhen(layer)),
        )
        if (fields.length > 0) result.push({ title: section.title, fields })
    }
    return result
}

/** 画布级字段组（未选中图层时）：宽/高 */
export const CANVAS_FIELD_SECTIONS: readonly FieldSection[] = [
    {
        title: '画布',
        fields: [
            { key: ['width'], label: '宽', control: 'number', integer: true, min: 1 },
            { key: ['height'], label: '高', control: 'number', integer: true, min: 1 },
        ],
    },
]

// ---- 字段值读取 ----

export type FieldReadResult = { ok: true; value: unknown } | { ok: false }

/**
 * 沿字段路径读值。严格领域模型字段全定义，undefined 即路径未命中——
 * 面板据此跳过渲染且不告警（未知字段过滤的读侧依据）。
 */
export function readField(target: unknown, key: readonly string[]): FieldReadResult {
    let node: unknown = target
    for (let i = 0; i < key.length; i += 1) {
        if (node === null || typeof node !== 'object') return { ok: false }
        node = (node as Record<string, unknown>)[key[i]!]
    }
    return node === undefined ? { ok: false } : { ok: true, value: node }
}
