/**
 * 样例数据源 schema 声明（content-completion 工单 03，spec §2）。
 *
 * 载荷形态（D1 钉定）：schema 声明 = `compile(canvas, dataset)` 收到的 data 载荷
 * 形状——顶层键即根上下文候选，信封 id/name 等管理元数据不在此列。键树与演示
 * graph（demoGraph.ts）的表达式对齐：标记文本/二维码引用 {{orderNo}}、标记图片
 * 引用 {{assets.banner}}、模板表 rowsPath = order.items，行上下文候选
 * {{row.name}}/{{row.avatar}}/{{row.code}}。
 *
 * 解析子集仅 type/description/properties/items 四关键词（工单 02 walker），
 * description 全中文供补全浮层元信息目验。宿主经 editor.setDataSourceSchema(…)
 * 随会话注入（D2）：声明只进编辑器会话态，不进 graph、不落 localStorage、不动
 * wire；根级键保留 row/$ 前缀（reserved_root_key 拒绝）。
 */
export const SAMPLE_DATASET_SCHEMA = {
    type: 'object',
    description: '演示数据源载荷（与 demoGraph 表达式键树对齐）',
    properties: {
        orderNo: {
            type: 'string',
            description: '订单编号，如 HZ-2026-0928（标记文本/二维码直接引用）',
        },
        assets: {
            type: 'object',
            description: '静态资源引用表（物化可装载的 URL）',
            properties: {
                banner: { type: 'string', description: '头图横幅 URL（标记图片层引用）' },
                logo: { type: 'string', description: 'Logo 图片 URL' },
            },
        },
        order: {
            type: 'object',
            description: '订单聚合对象（模板表 rowsPath 所在层级）',
            properties: {
                items: {
                    type: 'array',
                    description: '订单行明细数组（模板表 rowsPath = order.items）',
                    items: {
                        type: 'object',
                        description: '一行明细（行上下文候选源）',
                        properties: {
                            name: { type: 'string', description: '商品名称（格内容 {{row.name}}）' },
                            avatar: { type: 'string', description: '商品图片 URL（格内容 {{row.avatar}}）' },
                            code: { type: 'string', description: '商品条码（格内容二维码 {{row.code}}）' },
                            quantity: { type: 'number', description: '购买数量' },
                        },
                    },
                },
                totalAmount: { type: 'number', description: '订单总金额' },
            },
        },
        customer: {
            type: 'object',
            description: '客户信息',
            properties: {
                name: { type: 'string', description: '客户姓名' },
                phone: { type: 'string', description: '联系电话' },
            },
        },
    },
}

/** 非法声明样例：根级键 row 命中保留键（前移填充期 reserved_root_key 硬错误），
 *  注入即降级无候选 + console 警告（目验「不弹错」链路用） */
export const INVALID_DATASET_SCHEMA = {
    type: 'object',
    description: '非法样例：根级键 row/$ 前缀与求值上下文冲突',
    properties: {
        row: { type: 'object', description: '保留键——声明会被拒绝' },
    },
}
