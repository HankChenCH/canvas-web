/**
 * 字段描述注册表（工单 09）：属性面板的 schema 面——按图层 type 声明字段组，
 * 面板组件按清单渲染，新增图层字段 = 改本文件 + 领域类型，面板零改动。
 *
 * - key 用领域模型的数组路径（相对图层对象根，如 ['shape','backgroundColor']），
 *   拼上选中图层路径即 patch path；数据字段（wire data.value 的领域展开
 *   Text.text / Image.src / QrCode.value）标 data:true，提交走 updateData。
 * - 权威字段过滤两层：visibleWhen（type 内的显隐，如 angle 只在文本层出现）
 *   与容器角色过滤（解码/fromGraph 强同步的字段不渲染——行宽强制 = 表宽、格内容
 *   宽高被压平，暴露出来就是「改了又被改回去」的 bug 报告）。
 * - pair（两列语义行，layer-panel-ux 工票 03）：items 相对 pair 值对象寻址，
 *   提交时由面板折算成图层根绝对键（前缀 = pair.key）；子字段的 auto 描述符
 *   声明自适应 prefix 钮（开启 → 输入禁用，替代显示归控件层）。
 * - 本模块是纯数据 + 纯函数（零 Vue 依赖），与内核同款在 Node 无 DOM 环境测试。
 */
import {
    HORIZONTAL_ALIGNS,
    VERTICAL_ALIGNS,
    isTemplateSubtreePath,
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
    | 'pair'
    | 'anchor'
    | 'align'
    | 'padding'
    | 'border'
    | 'font'

/**
 * 自适应 prefix 钮描述（pair 子字段用）：key 相对 pair 值对象上的布尔键；
 * 开启 → 本输入禁用。placeholder 是禁用态兜底占位（盒未解析时；正常路径面板
 * 传 layerBoxAt 解析值，宽列随自然宽求值落地与高列同源，autowidth 工单 04）。
 */
export interface FieldAutoToggle {
    readonly key: readonly string[]
    readonly placeholder?: string
}

/**
 * 禁用态替代显示（pair 自适应列，面板计算后经 PropertyField 下发）：
 * value 为展示数值（面板侧已做浮点噪声收整）；preview = 模板子树的预览盒
 * 值（非文档权威值），控件据此做区分展示（斜体 + 悬停说明）。
 */
export interface FieldDisplay {
    readonly value: number
    readonly preview: boolean
}

export interface FieldDef {
    /** 图层内字段路径（领域形态）；画布级字段相对画布根 */
    readonly key: readonly string[]
    readonly label: string
    readonly control: FieldControl
    /**
     * 两列语义行（control:'pair' 专用）：子字段清单，key 相对 pair 值对象
     * （如 position/shape 对象），数值行内列自描述
     */
    readonly items?: readonly FieldDef[]
    /** 自适应 prefix 钮（pair 子字段用）；缺省 = 无 prefix 的普通数值列 */
    readonly auto?: FieldAutoToggle
    /** 数据字段：提交走 updateData（按 type 分派到 text/src/value），其余走 updateSpec */
    readonly data?: boolean
    /** 输入框占位文案（text 控件透传） */
    readonly placeholder?: string
    /** 非空校验（text 控件）：空提交被控件拦截并标错、不落库（spec §2.4 P4） */
    readonly nonEmpty?: boolean
    /** select 取值域（领域常量原样引用，不自创缩写） */
    readonly domain?: readonly string[]
    readonly min?: number
    readonly max?: number
    readonly step?: number
    /** 数值提交向零截断（PHP intval 同门）；padding/lineHeight 等浮点字段不开 */
    readonly integer?: boolean
    /** 颜色字段允许 null（如背景色 = 无填充） */
    readonly nullable?: boolean
    /** 权威字段过滤：谓词为假不渲染（不告警）；pair 子字段同款语义 */
    readonly visibleWhen?: (layer: Layer) => boolean
}

export interface FieldSection {
    readonly title: string
    readonly fields: readonly FieldDef[]
}

// ---- 公共字段组（各 type 共享一份描述） ----

/**
 * 位置与尺寸（layer-panel-ux 工票 03）：X|Y、宽|高两条两列语义行；宽/高列带
 * 自适应 prefix（autoWidth/autoHeight 不再有独立布尔行）。宽/高自适应开 → 输入
 * 禁用、显示 layerBoxAt 解析值（gizmo 同源，替代显示由面板算好传控件；宽列随
 * 自然宽求值落地与高列同语言，autowidth 工单 04）。angle 从文本组迁入（旋转属
 * 变换语义，TextLayer 专属 visibleWhen 不变）；锚点是块级折叠区（面板路由，默认收起）。
 */
const POSITION_SECTION: FieldSection = {
    title: '位置与尺寸',
    fields: [
        {
            key: ['position'],
            label: '位置',
            control: 'pair',
            items: [
                { key: ['x'], label: 'X', control: 'number', integer: true },
                { key: ['y'], label: 'Y', control: 'number', integer: true },
            ],
        },
        {
            key: ['shape'],
            label: '尺寸',
            control: 'pair',
            items: [
                {
                    key: ['width'],
                    label: '宽',
                    control: 'number',
                    integer: true,
                    min: 0,
                    auto: { key: ['autoWidth'], placeholder: '自动' },
                },
                {
                    key: ['height'],
                    label: '高',
                    control: 'number',
                    integer: true,
                    min: 0,
                    auto: { key: ['autoHeight'] },
                },
            ],
        },
        {
            key: ['angle'],
            label: '旋转角',
            control: 'number',
            integer: true,
            visibleWhen: (layer) => layer.type === 'TextLayer',
        },
        { key: ['position', 'anchor'], label: '锚点', control: 'anchor' },
    ],
}

const ALIGN_SECTION: FieldSection = {
    title: '对齐',
    fields: [
        // 分段图标按钮组（工单 05）：水平（左/中/右）、垂直（上/中/下）各一排。
        // 值域（领域常量）与提交管线不变——一次点击 = change 收口 = 一步历史
        { key: ['align', 'horizontal'], label: '水平', control: 'align', domain: HORIZONTAL_ALIGNS },
        { key: ['align', 'vertical'], label: '垂直', control: 'align', domain: VERTICAL_ALIGNS },
    ],
}

const SHAPE_SECTION: FieldSection = {
    title: '形状',
    fields: [
        // 宽/高/autoWidth/autoHeight 已迁位置与尺寸组（两列行 + auto prefix，工票 03）
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
        // 字体选择：清单下拉 + 本机上传（fontPicker 注入缝）；未注入退化文本输入
        { key: ['font'], label: '字体', control: 'font' },
        { key: ['fontSize'], label: '字号', control: 'number', integer: true, min: 1 },
        { key: ['fontColor'], label: '字色', control: 'color' },
        // angle 已迁位置与尺寸组（工票 03：旋转属变换语义）
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
 * 行模板字段组（spec §2.2 D6）：高 + 高自适应（创作期主操作）；行宽 := 表宽由
 * canonicalize 重断言（ADR 0006 宽度耦合），宽度字段不渲染——只读说明入组标题。
 */
const TEMPLATE_ROW_SECTION: FieldSection = {
    title: '行模板（行宽由表宽同步）',
    fields: [
        { key: ['shape', 'height'], label: '高', control: 'number', integer: true, min: 0 },
        { key: ['shape', 'autoHeight'], label: '高自适应', control: 'boolean' },
    ],
}

/**
 * 表数据节（spec §2.4）：数据行路径——仅模板态显示（visibleWhen 过滤，V1 无
 * 消费方；初值由创建/转换表单覆盖，面板只管改）。不走 data 管道（P3：rowsPath
 * 是结构语义，提交走 updateSpec 透传，canonicalize 零 patch）；非空校验控件层
 * 拦（P4：空串永不落库——解码 rows_path_missing 硬约束）。
 */
const DATA_SECTION: FieldSection = {
    title: '数据',
    fields: [
        {
            key: ['rowsPath'],
            label: '数据行路径',
            control: 'text',
            placeholder: '如 order.items',
            nonEmpty: true,
            visibleWhen: (layer) => layer.type === 'TableLayer' && layer.template !== null,
        },
    ],
}

/**
 * type → 字段组注册表。结构编辑（行列增删/重排）在图层面板（工单 10/12 与
 * 模板创作 spec §2.2），此处只暴露形状/位置/对齐与数据。
 */
export const FIELD_SECTIONS_BY_TYPE: Record<LayerType, readonly FieldSection[]> = {
    ImageLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, IMAGE_SECTION],
    TextLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, TEXT_SECTION],
    QrCodeLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, QR_SECTION],
    TableLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION, DATA_SECTION],
    TableRowLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION],
    TableCellLayer: [POSITION_SECTION, ALIGN_SECTION, SHAPE_SECTION],
    // 行模板（spec §2.2 D6）：替身路径可选中（推翻决策 2026-09），字段组 = 高/
    // 高自适应；宽度字段不出现
    TableRowTemplate: [TEMPLATE_ROW_SECTION],
}

/** 注册表查找的宽容口：白名单之外的 type 串返回空清单（不抛、不告警） */
export function fieldSectionsForType(type: string): readonly FieldSection[] {
    return (FIELD_SECTIONS_BY_TYPE as Record<string, readonly FieldSection[]>)[type] ?? []
}

// ---- 容器角色权威过滤：解码强同步字段不渲染 ----

/** 图层在容器树里的角色（由路径尾段判定，纯函数） */
export type LayerRole = 'root' | 'row' | 'cell' | 'content' | 'templateContent'

export function layerRoleAt(path: LayerPath): LayerRole {
    if (path[path.length - 1] === 'content') {
        // 模板格内容（决策 2026-09）：宽度耦合与 V1 同款，高度耦合全豁免——
        // 声明高/autoHeight 是有效声明，面板放行编辑
        return isTemplateSubtreePath(path) ? 'templateContent' : 'content'
    }
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
 *
 * 与内核八柄的角色可缩放面互为镜像（canvas-web 工单 07）：本表隐藏的尺寸字段
 * ⇔ spatial/resize.resizableAxesAt 的 false 轴（柄同缝禁写）——两表语义同源
 * （解码强同步不变量），改动任一侧须同步核对另一侧。
 */
const ROLE_HIDDEN_KEYS: Record<LayerRole, readonly string[]> = {
    root: [],
    cell: [],
    row: ['shape.width', 'shape.autoWidth'],
    content: ['shape.width', 'shape.autoWidth', 'shape.height', 'shape.autoHeight'],
    // 模板格内容：宽度强同步隐藏；高度豁免放行（decodeTemplateCellLayer 同门）
    templateContent: ['shape.width', 'shape.autoWidth'],
}

/**
 * pair 子字段的图层根绝对键（code-review 整改：提交折算、禁用态显示键、
 * 角色过滤三处共用这一条规则，防键拼接约定漂移）。
 */
export function pairItemKey(field: FieldDef, item: FieldDef): readonly string[] {
    return [...field.key, ...item.key]
}

/**
 * 面板实际渲染的字段组：type 注册表 ∩ 角色权威过滤 ∩ visibleWhen。
 * pair 行按子字段的绝对键（pairItemKey）逐列过滤——部分隐藏 = 行内少一列，
 * 全部隐藏才整行不输出；普通字段过滤后为空即不渲染。过滤后为空的 section
 * 不输出（不渲染空标题）。
 */
export function fieldSectionsForPath(path: LayerPath, layer: Layer): readonly FieldSection[] {
    const hidden = new Set(ROLE_HIDDEN_KEYS[layerRoleAt(path)])
    const result: FieldSection[] = []
    for (const section of fieldSectionsForType(layer.type)) {
        const fields: FieldDef[] = []
        for (const field of section.fields) {
            if (field.items) {
                const items = field.items.filter(
                    (item) =>
                        !hidden.has(pairItemKey(field, item).join('.')) &&
                        (!item.visibleWhen || item.visibleWhen(layer)),
                )
                if (items.length > 0) fields.push({ ...field, items })
                continue
            }
            if (hidden.has(field.key.join('.'))) continue
            if (field.visibleWhen && !field.visibleWhen(layer)) continue
            fields.push(field)
        }
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
