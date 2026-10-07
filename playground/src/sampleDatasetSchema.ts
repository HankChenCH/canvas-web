/**
 * 样例数据源 schema 声明（content-completion 工单 03/11，spec §2 + D12）。
 *
 * 载荷形态（D1 钉定）：schema 声明 = `compile(canvas, dataset)` 收到的 data 载荷
 * 形状——顶层键即根上下文候选，信封 id/name 等管理元数据不在此列。样例 = 证书
 * form-data schema（培训机构证书数据源），与工单 08 的内核测试 fixture 同源
 * （packages/canvas-editor/tests/shared/certFormDatasetSchema.ts，grilling
 * 会话评估样本的等价重写）：draft-07 方言全侧面——$schema/$id 忽略、$ref/
 * definitions（嵌套 orgInfo.contact、前向 chapter→section、菱形共享 imageUrl）、
 * 嵌套对象树、数组、additionalProperties: true 开放映射、format/enum 混杂宽松忽略。
 * 根级 13 键：certName/certNo/issueDate/org/student/training/chapters/coursewares/
 * originCertificates/fields/attachments/remark/printSettings；键树与演示 graph
 * （demoGraph.ts）的表达式对齐：标记图片 {{org.logo}}、标记二维码 {{certNo}}、
 * 标记文本 {{certName}}、模板表 rowsPath = originCertificates，行上下文候选
 * {{row.certName}}/{{row.fileUrl}}/{{row.certNo}}。
 *
 * 编译面（工单 08 一次性转译编译器）：注入即 deref 出内部形状树，全树零诊断；
 * 数组节点候选枚举收敛为叶子（D9——originCertificates 等徽标 array、无具名子
 * 候选），开放映射 fields 无键候选但浮层出占位提示（D10，联动工单 10）。
 * 注入即整体替换（D2 宿主随会话注入）：声明只进编辑器会话态，不进 graph、不落
 * localStorage、不动 wire；根级键保留 row/$ 前缀（reserved_root_key 拒绝）。
 */
export const SAMPLE_DATASET_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: '证书 form-data 载荷',
    description: '培训机构证书数据源（draft-07：$ref/definitions、嵌套对象、数组、开放映射）',
    definitions: {
        imageUrl: { type: 'string', description: '图片资源 URL' },
        contact: {
            type: 'object',
            description: '联系方式',
            properties: {
                phone: { type: 'string', description: '联系电话' },
                email: { type: 'string', description: '电子邮箱' },
            },
        },
        orgInfo: {
            type: 'object',
            title: '机构信息',
            properties: {
                name: { type: 'string', description: '机构名称' },
                code: { type: 'string', description: '机构编码' },
                logo: { $ref: '#/definitions/imageUrl', description: '机构 Logo（本地描述覆盖目标注解）' },
                contact: { $ref: '#/definitions/contact' },
            },
        },
        studentInfo: {
            type: 'object',
            title: '学员信息',
            properties: {
                name: { type: 'string', description: '学员姓名' },
                idNumber: { type: 'string', description: '身份证号' },
                photo: { $ref: '#/definitions/imageUrl', description: '学员证件照' },
            },
        },
        // 前向引用：chapter 的 items 指向在其后声明的 section（JSON Pointer 导航与声明序无关）
        chapter: {
            type: 'object',
            title: '章节',
            properties: {
                title: { type: 'string', description: '章节标题' },
                sections: {
                    type: 'array',
                    description: '章节小节（两级有界，不自引用）',
                    items: { $ref: '#/definitions/section' },
                },
            },
        },
        section: {
            type: 'object',
            title: '小节',
            properties: {
                title: { type: 'string', description: '小节标题' },
                durationMinutes: { type: 'number', description: '时长（分钟）' },
            },
        },
        courseware: {
            type: 'object',
            title: '课件',
            properties: {
                name: { type: 'string', description: '课件名称' },
                mediaType: { type: 'string', description: '课件类型（video/pdf/doc）' },
                fileUrl: { $ref: '#/definitions/imageUrl', description: '课件文件地址' },
            },
        },
        certificate: {
            type: 'object',
            title: '原始证书',
            properties: {
                certNo: { type: 'string', description: '证书编号' },
                certName: { type: 'string', description: '证书名称' },
                fileUrl: { $ref: '#/definitions/imageUrl', description: '证书扫描件' },
            },
        },
    },
    properties: {
        certName: { type: 'string', description: '证书名称' },
        certNo: { type: 'string', description: '证书编号' },
        issueDate: { type: 'string', description: '发证日期', format: 'date' },
        org: { $ref: '#/definitions/orgInfo', description: '颁证机构（本地描述叠加目标基底）' },
        student: { $ref: '#/definitions/studentInfo' },
        training: {
            type: 'object',
            title: '培训信息',
            properties: {
                courseName: { type: 'string', description: '培训课程名' },
                startDate: { type: 'string', description: '开始日期' },
                endDate: { type: 'string', description: '结束日期' },
                totalHours: { type: 'number', description: '总学时' },
            },
        },
        chapters: { type: 'array', description: '章节树（两级：章节→小节）', items: { $ref: '#/definitions/chapter' } },
        coursewares: { type: 'array', description: '课件清单', items: { $ref: '#/definitions/courseware' } },
        originCertificates: { type: 'array', description: '原始证书数组', items: { $ref: '#/definitions/certificate' } },
        fields: { type: 'object', description: '开放映射（动态字段，键由模板定义）', additionalProperties: true },
        attachments: { type: 'array', description: '附件 URL 列表', items: { type: 'string' } },
        remark: { type: 'string', description: '备注' },
        printSettings: {
            type: 'object',
            title: '打印设置',
            properties: {
                paperSize: { type: 'string', enum: ['A4', 'A5'], description: '纸张规格' },
                orientation: { type: 'string', description: '打印方向' },
                watermark: { $ref: '#/definitions/imageUrl' },
            },
        },
    },
} as const

/** 非法声明样例：根级键 row 命中保留键（前移填充期 reserved_root_key 硬错误），
 *  注入即整份拒绝降级无候选 + console 警告（目验「不弹错」链路用） */
export const INVALID_DATASET_SCHEMA = {
    type: 'object',
    description: '非法样例：根级键 row/$ 前缀与求值上下文冲突',
    properties: {
        row: { type: 'object', description: '保留键——声明会被拒绝' },
    },
}

/** 诊断样例（工单 11，D12）：断链/外部指针/环引用/目标形态不符四类局部故障齐备
 *  ——$ref 故障节点逐条降级为叶子（保留本地注解），diagnostics 逐条记录供注入
 *  面板展示；健康分支（certName/org）照常服务，编辑器只降级不弹错（console.warn
 *  注入期汇总恰一次，收口在内核 normalizeExpressionSchemaSource）。 */
export const DIAGNOSTIC_DATASET_SCHEMA = {
    type: 'object',
    description: '诊断样例：断链/环/外部指针（局部降级为叶子，其余照常服务）',
    properties: {
        certName: { type: 'string', description: '证书名称（健康叶子，照常出候选）' },
        broken: { $ref: '#/definitions/missing', description: '断链引用（broken_ref：指针段未命中）' },
        external: {
            $ref: 'https://cdn.example.com/cert-form.schema.json',
            description: '外部指针（external_ref：归宿主预内联，编辑器不解远程）',
        },
        loop: { $ref: '#/definitions/loopA', description: '环引用入口（circular_ref：definitions 互指）' },
        mistyped: { $ref: '#/definitions/scalar', description: '目标形态不符（target_shape_mismatch）' },
    },
    definitions: {
        loopA: {
            type: 'object',
            title: '环 A',
            properties: {
                next: { $ref: '#/definitions/loopB' },
            },
        },
        loopB: {
            type: 'object',
            title: '环 B',
            properties: {
                back: { $ref: '#/definitions/loopA' },
            },
        },
        scalar: '不是 schema 对象的目标',
    },
}
