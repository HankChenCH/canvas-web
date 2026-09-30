/**
 * 证书 form-data schema 真实 fixture（content-completion 工单 08，spec §5；
 * grilling 会话评估样本的等价重写，与工单 11 的 playground 样例同源）。
 *
 * draft-07 方言全侧面：$schema/$id/definitions、嵌套引用（orgInfo.contact）、
 * 前向引用（chapter 先于 section 声明即引用）、菱形引用（imageUrl 被 logo/照片/
 * 课件/证书四处共享）、数组 items 引用、additionalProperties: true 开放映射、
 * 校验类关键词（format/enum）混杂。约束：全树 deref 零诊断——章节树按有界两级
 * 建模（章节→小节），不做自引用递归（自引用环按 D7 降级出诊断，见 expressionSchema
 * 测试的环引用组）。
 */

/** 图片资源 URL（菱形引用目标：被机构 Logo/学员照片/课件文件/证书扫描件共享） */
const imageUrlDefinition = { type: 'string', description: '图片资源 URL' }

export const CERT_FORM_DATASET_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: '证书 form-data 载荷',
    description: '培训机构证书数据源（draft-07：$ref/definitions、嵌套对象、数组、开放映射）',
    definitions: {
        imageUrl: imageUrlDefinition,
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
