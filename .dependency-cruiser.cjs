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
                path: ['^(packages/(canvas-next-browser-renderer|canvas-next-editor|canvas-next-editor-vue)/|playground/|node_modules/)'],
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
            to: { path: '^(packages/(canvas-next-editor|canvas-next-editor-vue)/|playground/)' },
        },
        {
            name: 'editor-immer-only-npm-deps',
            comment: '红线：内核运行时仅依赖 immer（spec「Solution」）；包间方向由各包自己的规则约束',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/' },
            to: {
                path: 'node_modules/',
                pathNot: ['node_modules/\\.pnpm/immer@'],
            },
        },
        {
            name: 'editor-no-binding-layer',
            comment: '红线：headless 内核不依赖任何 UI 绑定层与壳（editor-vue/playground）；金丝雀自验脚本用的就是这条',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/' },
            to: { path: '^(packages/canvas-next-editor-vue/|playground/)' },
        },
        {
            name: 'editor-vue-only-depends-on-editor',
            comment: '红线：Vue 绑定只许依赖 editor 内核，不得绕过内核直接依赖 canvas-next/browser-renderer',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/' },
            to: { path: '^(packages/(canvas-next$|canvas-next/|canvas-next-browser-renderer/)|playground/)' },
        },
        // —— editor-vue 包内域纪律（2026-09 分域）：域间禁止横向 import，
        //    跨域消费收口 shared；shared 是被依赖层不得反向依赖任何域。
        {
            name: 'editor-vue-shared-isolation',
            comment: '域纪律：shared 切片桥是被依赖层，不得反向 import 任何域',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/shared/' },
            to: { path: '^packages/canvas-next-editor-vue/src/(canvas|property-panel|layer-panel|status-bar)/' },
        },
        {
            name: 'editor-vue-canvas-isolation',
            comment: '域纪律：画布域不得横引属性面板/图层/状态栏域',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/canvas/' },
            to: { path: '^packages/canvas-next-editor-vue/src/(property-panel|layer-panel|status-bar)/' },
        },
        {
            name: 'editor-vue-property-panel-isolation',
            comment: '域纪律：属性面板域不得横引画布/图层/状态栏域',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/property-panel/' },
            to: { path: '^packages/canvas-next-editor-vue/src/(canvas|layer-panel|status-bar)/' },
        },
        {
            name: 'editor-vue-layer-panel-isolation',
            comment: '域纪律：图层面板域不得横引画布/属性面板/状态栏域',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/layer-panel/' },
            to: { path: '^packages/canvas-next-editor-vue/src/(canvas|property-panel|status-bar)/' },
        },
        {
            name: 'editor-vue-status-bar-isolation',
            comment: '域纪律：状态栏域不得横引画布/属性面板/图层面板域',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor-vue/src/status-bar/' },
            to: { path: '^packages/canvas-next-editor-vue/src/(canvas|property-panel|layer-panel)/' },
        },
        // —— editor 内核分层纪律（2026-09 分层）：session → {spatial, editing, shared}、
        //    editing → shared、spatial → shared、shared → ∅，下层禁引上层。
        {
            name: 'editor-shared-isolation',
            comment: '分层纪律：layerPath 寻址原语（shared）不得引用任何上层',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/shared/' },
            to: { path: '^packages/canvas-next-editor/src/(spatial|editing|session)/' },
        },
        {
            name: 'editor-spatial-isolation',
            comment: '分层纪律：空间层（camera/hitTest/wheel）不得引用 editing/session',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/spatial/' },
            to: { path: '^packages/canvas-next-editor/src/(editing|session)/' },
        },
        {
            name: 'editor-editing-isolation',
            comment: '分层纪律：编辑特性层不得引用 session 会话门面',
            severity: 'error',
            from: { path: '^packages/canvas-next-editor/src/editing/' },
            to: { path: '^packages/canvas-next-editor/src/session/' },
        },
        {
            name: 'no-deps-on-playground',
            comment: '红线：playground 是目验壳（依赖图顶端，位于仓库根 playground/），任何包不得依赖它',
            severity: 'error',
            from: { path: '^packages/' },
            to: { path: '^playground/' },
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
