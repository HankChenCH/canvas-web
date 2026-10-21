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
    isImageContentUndrawn,
    isTemplateSubtreePath,
    type Canvas,
    type CanvasBackground,
    type Layer,
    type LayerPath,
    type LayerType,
    type ResourceStatusMap,
} from '@hankchen/canvas-editor'

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
    | 'imageSrc'
    | 'resourceValue'
    | 'rowsPath'

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
    /**
     * 资源类内容字段（resource-expression-single-ref 工单 03，ADR 0020）：表达式态
     * 诊断走内核资源单值门（resourcePathDiagnostics——恰一闭合片段 + 裸点路径，
     * 禁拼接/函数），不走片段级扫描诊断。图片地址/二维码值两类声明。
     */
    readonly resource?: true
    /** 输入框占位文案（text 控件透传） */
    readonly placeholder?: string
    /**
     * 标签悬停提示（原生 title 属性，placeholder-padding-hint 工单 01）：标签列
     * 定宽截断不占版面，语义预期差类静态文案挂这里（首个消费方 = padding 行
     * 「作用于内容盒」）；缺省 = 无
     */
    readonly title?: string
    /**
     * 行级动态可见提示（placeholder-padding-hint 工单 02）：按选中层与内核资源态
     * 切片求值，非 null 时在行下渲染可见提示行——占位态图片层的 padding 语义
     * （工单 01 悬停 title 的可见性补强面）。纯函数（与内核判定同源），仅图层级
     * 目标求值；缺省 = 无。文案常量 UNDRAWN_CONTENT_HINT 供测试同源断言。
     */
    readonly hint?: (layer: Layer, statuses: ResourceStatusMap) => string | null
    /** 非空校验（text 控件）：空提交被控件拦截并标错、不落库（spec §2.4 P4） */
    readonly nonEmpty?: boolean
    /** select 取值域（领域常量原样引用，不自创缩写） */
    readonly domain?: readonly string[]
    /**
     * select 选项显示名（value → 标签，image-fit 工单 05「适配」）：缺省 = 原值
     * 显示。值仍提交 wire 原值，文案只呈现
     */
    readonly optionLabels?: Readonly<Record<string, string>>
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
 * 占位态图片层的 padding 行提示文案（placeholder-padding-hint 工单 02，工单
 * 原文全角逗号）：三种占位态（表达式标记/物化未达 done/内容盒 ≤0）命中即渲染。
 * 导出供消费方与测试同源断言，避免文案字面漂移。
 */
export const UNDRAWN_CONTENT_HINT = '当前层内容未绘制，padding 不影响预览'

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
        // padding 语义预期差（placeholder-padding-hint 工单 01）：全型通用静态
        // 文案挂 label title——padding 只内缩内容盒，图层盒（背景/边框/gizmo
        // 选框/状态栏尺寸读数）恒为声明尺寸（排查记录 canvas-web/layer-padding-research.md 根因 2）；
        // 工单 02 补动态可见提示——占位态图片层内容未绘制，padding 与像素无关
        // （判定在内核 isImageContentUndrawn，物化态经 ui 切片注入）
        {
            key: ['shape', 'padding'],
            label: '内边距',
            control: 'padding',
            title: '内边距作用于内容盒，不改变图层尺寸',
            hint: (layer, statuses) => (isImageContentUndrawn(layer, statuses) ? UNDRAWN_CONTENT_HINT : null),
        },
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

/**
 * 适配模式取值（image-fit 工单 05，ADR 0024 起 contain、ADR 0024 扩四档）：镜像
 * js-canvas 的 IMAGE_FIT_* 常量——内核 barrel 零 diff 红线不转出（editor-vue 禁直连
 * canvas），字面串对齐 wire 契约；白名单分派在核心渲染臂，未知值渲染面降级 cover
 */
const IMAGE_FIT_COVER = 'cover'
const IMAGE_FIT_CONTAIN = 'contain'
const IMAGE_FIT_FILL = 'fill'
const IMAGE_FIT_TILE = 'tile'

/**
 * 裁剪形状取值（image-clip-shape 工票 05，ADR 0026 二档）：镜像 js-canvas 的
 * IMAGE_CLIP_* 常量（fit 同款形态——内核 barrel 不转出，字面串对齐 wire 契约）；
 * 白名单分派在核心渲染臂，未知值渲染面降级矩形
 */
const IMAGE_CLIP_RECT = 'rect'
const IMAGE_CLIP_CIRCLE = 'circle'

const IMAGE_SECTION: FieldSection = {
    title: '图片',
    // 上传控件（缩略图回显 + 上传 + 紧凑路径行）；静态值语义不变——data 门提交
    // 走 updateData（字面接管），引用形态（data URL/宿主存储）归 uploadHandler
    //
    // 「适配」（ADR 0024）：静态声明四选一——铺满裁切（cover，缺省）/完整显示
    // （contain）/拉伸铺满（fill）/平铺（tile）；不带 data/resource 标记（无表达式
    // 态），提交走 updateSpec 权威写。缺省态 wire 无键，读侧经 layerFieldTarget
    // 投影回显 cover
    //
    // 「裁剪形状」（ADR 0026）：矩形（缺省，不裁）/圆形（完整圆形框——背景填进
    // 内切圆、内容按适配绘出后遮罩进圆、边框沿圆周描环）；同不带表达式态，缺省态
    // 读侧经 layerFieldTarget 投影回显 rect（fit 缺省投影同门）。仅图片层渲染 =
    // IMAGE 区段注册面（其他 type 无此组），无需 visibleWhen
    fields: [
        { key: ['src'], label: '资源地址', control: 'imageSrc', data: true, resource: true },
        {
            key: ['fit'],
            label: '适配',
            control: 'select',
            domain: [IMAGE_FIT_COVER, IMAGE_FIT_CONTAIN, IMAGE_FIT_FILL, IMAGE_FIT_TILE],
            optionLabels: {
                [IMAGE_FIT_COVER]: '铺满裁切',
                [IMAGE_FIT_CONTAIN]: '完整显示',
                [IMAGE_FIT_FILL]: '拉伸铺满',
                [IMAGE_FIT_TILE]: '平铺',
            },
        },
        {
            key: ['clip'],
            label: '裁剪形状',
            control: 'select',
            domain: [IMAGE_CLIP_RECT, IMAGE_CLIP_CIRCLE],
            optionLabels: {
                [IMAGE_CLIP_RECT]: '矩形',
                [IMAGE_CLIP_CIRCLE]: '圆形',
            },
        },
    ],
}

const QR_SECTION: FieldSection = {
    title: '二维码',
    // 内容（resource-expression-single-ref 工单 05，ADR 0020）：表达式态作者面 =
    // 级联路径选择器（resourceValue 控件，壳拆装 {{}} ⇄ 裸路径）；资源表达式必须
    // 恰为单个裸路径片段，纯菜单点选不设手输缝
    fields: [{ key: ['value'], label: '内容', control: 'resourceValue', data: true, resource: true }],
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
 * 表数据节（spec §2.4）：取行路径——仅模板态显示（visibleWhen 过滤，V1 无
 * 消费方；初值由创建/转换表单覆盖，面板只管改）。不走 data 管道（P3：rowsPath
 * 是结构语义，提交走 updateSpec 透传，canonicalize 零 patch）。
 *
 * 作者面 = rowsPath mode 级联点选器（rows-path-picker 工单 03，撤手输框与补全
 * 标记，spec D1/D2）：候选以数据源声明为门（未绑 = 只读回显 + 弱提示，菜单钮
 * 不渲染）；数组是唯一可点终点，点选只产合法行数组路径——非空校验（P4）随
 * 文本输入面一并退役，无手输缝即无空串/非法路径可提交。漂移（已提交值枚举不出）
 * 呈现归控件层红描边，判定在面板（rowsPathDrifted）。
 */
const DATA_SECTION: FieldSection = {
    title: '数据',
    fields: [
        {
            key: ['rowsPath'],
            label: '取行路径',
            control: 'rowsPath',
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

/**
 * 画布级字段组（未选中图层时）：宽/高 + 背景区段（canvas-background 工单 04）。
 * 背景字段键相对画布根（['background', color|image]），提交由面板折算回整对象
 * 一步事务（usePropertyPanel）；背景静态（spec Q3）——imageSrc 不带 data 标记，
 * 无取值方式段、无表达式态，上传缝在静态态展开全形态。
 */
export const CANVAS_FIELD_SECTIONS: readonly FieldSection[] = [
    {
        title: '画布',
        fields: [
            { key: ['width'], label: '宽', control: 'number', integer: true, min: 1 },
            { key: ['height'], label: '高', control: 'number', integer: true, min: 1 },
        ],
    },
    {
        title: '背景',
        fields: [
            { key: ['background', 'color'], label: '背景色', control: 'color', nullable: true },
            { key: ['background', 'image'], label: '背景图', control: 'imageSrc' },
        ],
    },
]

/**
 * 画布级读取视图（canvas-background 工单 04）：background null（未设/清空态）投影
 * 为全空值对象——背景字段否则被 readField 的 ok:false 过滤掉，清空后区段即消失、
 * 无法再设置。已设背景原样透出（不拷贝不重整）；未打开文档 null。
 */
export function canvasFieldTarget(canvas: Canvas | null): Canvas | null {
    if (canvas === null) return null
    return canvas.background === null ? { ...canvas, background: EMPTY_CANVAS_BACKGROUND } : canvas
}

/** 全空背景值对象（读取投影与提交折算共用的一份底形；kernel 归一门会再收口） */
export const EMPTY_CANVAS_BACKGROUND: CanvasBackground = { color: null, image: null }

/**
 * 图层级读取视图（image-fit 工单 05，canvasFieldTarget 同门）：ImageLayer 的 fit
 * 缺省态（wire 无键 = cover）投影为 cover——适配字段否则被 readField 的 ok:false
 * 过滤掉，选中任一未声明的图片层「适配」行即消失；裁剪形状同门（image-clip-shape
 * 工票 05，ADR 0026）：clip 缺省态（wire 无键 = rect）投影为 rect 回显。已声明
 * （含未知值）与非图片层原样透传（不拷贝不重整）；投影只作用读侧，提交仍走
 * updateSpec 直写文档（显式 rect/cover 落领域值，wire 归一不落键归核心 encode）
 */
export function layerFieldTarget(layer: Layer): Layer {
    if (layer.type === 'ImageLayer' && (layer.fit === undefined || layer.clip === undefined)) {
        return {
            ...layer,
            ...(layer.fit === undefined ? { fit: 'cover' } : {}),
            ...(layer.clip === undefined ? { clip: 'rect' } : {}),
        }
    }
    return layer
}

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
