/**
 * dependency-cruiser 红线配置（工单 01）。
 *
 * 规则按包名对应的 packages/ 目录写（workspace 内部引用经 pnpm symlink
 * realpath 后都落回 packages/<dir>，按包名写可防目录改名绕行）。
 * 红线是否真的有效由 scripts/check-guardrails.sh 自验：故意制造一条
 * editor → editor-vue 违规，抓不到即脚本失败。
 *
 * 依赖方向（spec「仓库与边界」）：
 *   editor-vue → editor → { canvas-next, browser-renderer }
 *   browser-renderer → canvas-next
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
    forbidden: [
        {
            name: 'canvas-next-no-deps',
            comment: '红线：文档模型零运行时依赖——不得 import 任何 npm 包或其它 workspace 包（spec「文档模型与契约面」；测试文件不在约束内，可用 vitest）',
            severity: 'error',
            from: { path: '^packages/canvas-next/src/' },
            to: {
                path: ['^(packages/(canvas-next-browser-renderer|canvas-next-editor|canvas-next-editor-vue|playground)/|node_modules/)'],
                pathNot: ['^packages/canvas-next/'],
            },
        },
        {
            name: 'core-no-vue',
            comment: '红线：文档模型/渲染后端/内核不得依赖 Vue——框架绑定只允许出现在 editor-vue 与 playground',
            severity: 'error',
            from: { path: '^packages/(canvas-next|canvas-next-browser-renderer|canvas-next-editor)/src/' },
            to: { path: 'node_modules/(vue/|@vue/)' },
        },
        {
            name: 'renderer-only-depends-on-canvas-next',
            comment: '红线：browser-renderer 只许向下依赖 canvas-next，不得依赖 editor/editor-vue/playground',
            severity: 'error',
            from: { path: '^packages/canvas-next-browser-renderer/src/' },
            to: { path: '^packages/(canvas-next-editor|canvas-next-editor-vue|playground)/' },
        },
        {
            name: 'editor-no-binding-layer',
            comment: '红线：headless 内核不依赖任何 UI 绑定层与壳（editor-vue/playground）；金丝雀自验脚本用的就是这条',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/' },
            to: { path: '^packages/(canvas-next-editor-vue|playground)/' },
        },
        {
            name: 'editor-vue-only-depends-on-editor',
            comment: '红线：Vue 绑定只许依赖 editor 内核，不得绕过内核直接依赖 canvas-next/browser-renderer',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/' },
            to: { path: '^packages/(canvas-next$|canvas-next/|canvas-next-browser-renderer/|playground/)' },
        },
        {
            name: 'no-deps-on-playground',
            comment: '红线：playground 是目验壳（依赖图顶端），任何包不得依赖它',
            severity: 'error',
            from: { path: '^packages/' },
            to: { path: '^packages/playground/' },
        },
        {
            name: 'unresolved-dependency',
            comment: '兜底：解析不了的 import（未声明的依赖、拼错包名）一律报错——pnpm 严格隔离下未声明依赖连 symlink 都没有，靠这条在 CI 暴露',
            severity: 'error',
            from: {},
            to: { dependencyTypes: ['unknown'] },
        },
    ],
    options: {
        // 外部 npm 包只记边不下钻；workspace 引用经 symlink realpath 后照常追
        doNotFollow: { path: 'node_modules' },
        enhancedResolveOptions: {
            // 默认不读 package.json 的 exports 字段，exports-only 的包
            // （本仓库四包 + vite 等）会解析成 unknown；显式开启
            exportsFields: ['exports'],
            conditionNames: ['import', 'node', 'default', 'types'],
        },
    },
}
