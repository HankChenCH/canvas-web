import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * theme.css 结构断言（editor-theme-light-dark spec §9）：
 * 读文件断言两调色板块 + §2.3 根类清单 + §3 令牌表存在——防「组件里偷偷加回
 * 硬编码色」的最小网。期望值全部抄自 spec §3 令牌表（独立事实源）。
 *
 * 约定：文件内不出现花括号注释、data-URI 全部 URL 编码（无裸 { }），
 * 因此可以按 `}` 朴素分块。值比较前把空白折叠为单空格，对缩进/换行鲁棒。
 */
const themeCss = readFileSync(fileURLToPath(new URL('../src/theme.css', import.meta.url)), 'utf8')

/** spec §2.3 主题消费根类清单（已核实，13 个） */
const ROOT_CLASSES = [
    '.cn-props',
    '.cn-statusbar',
    '.cn-surface',
    '.cn-ruler',
    '.cn-context-menu',
    '.cn-find-bar',
    '.cn-align-float',
    '.cn-edit-toolbar',
    '.cn-guides',
    '.cn-text-overlay',
    '.cn-help',
    '.cn-tooltip',
    '.cn-dropdown',
] as const

/** spec §3 令牌表：夜间（缺省）值 = 现网值，原样收口 */
const DARK_VALUES: Readonly<Record<string, string>> = {
    '--cn-bg': '#0b1220',
    '--cn-bg-elevated': '#101a2e',
    '--cn-hover': '#16223a',
    '--cn-fg': '#e6edf7',
    '--cn-fg-2': '#c3cddd',
    '--cn-fg-3': '#aab6c8',
    '--cn-muted': '#7c8ca5',
    '--cn-line': '#1e2a40',
    '--cn-line-strong': '#2a3a58',
    '--cn-field-line': '#2a3a57',
    '--cn-card-line': '#23324d',
    '--cn-field': 'rgba(148,163,184,.07)',
    '--cn-bar-bg': 'rgb(11 18 32 / .92)',
    '--cn-accent': '#38bdf8',
    '--cn-accent-soft': 'rgba(56,189,248,.12)',
    '--cn-accent-glow': 'rgba(56,189,248,.35)',
    '--cn-accent-line': 'rgba(56,189,248,.6)',
    '--cn-on-accent': '#06283d',
    '--cn-expression': '#5dd3b0',
    '--cn-danger': '#f87171',
    '--cn-guide-line': '#38bdf8',
    '--cn-shadow-sm': '0 4px 16px rgba(2,6,23,.4)',
    '--cn-shadow-md': '0 12px 32px rgba(2,6,23,.55)',
    '--cn-shadow-lg': '0 24px 64px rgba(2,6,23,.6)',
    '--cn-backdrop': 'rgba(2,6,23,.55)',
}

/** spec §3 令牌表：日间（提案）值 */
const LIGHT_VALUES: Readonly<Record<string, string>> = {
    '--cn-bg': '#ffffff',
    '--cn-bg-elevated': '#f8fafc',
    '--cn-hover': '#eef2f7',
    '--cn-fg': '#0f172a',
    '--cn-fg-2': '#334155',
    '--cn-fg-3': '#475569',
    '--cn-muted': '#64748b',
    '--cn-line': '#e2e8f0',
    '--cn-line-strong': '#cbd5e1',
    '--cn-field-line': '#cbd5e1',
    '--cn-card-line': '#e2e8f0',
    '--cn-field': 'rgba(15,23,42,.04)',
    '--cn-bar-bg': 'rgb(255 255 255 / .92)',
    '--cn-accent': '#0284c7',
    '--cn-accent-soft': 'rgba(2,132,199,.10)',
    '--cn-accent-glow': 'rgba(2,132,199,.30)',
    '--cn-accent-line': 'rgba(2,132,199,.55)',
    '--cn-on-accent': '#ffffff',
    '--cn-expression': '#0d9488',
    '--cn-danger': '#dc2626',
    '--cn-guide-line': '#0284c7',
    '--cn-shadow-sm': '0 4px 16px rgba(15,23,42,.12)',
    '--cn-shadow-md': '0 12px 32px rgba(15,23,42,.18)',
    '--cn-shadow-lg': '0 24px 64px rgba(15,23,42,.22)',
    '--cn-backdrop': 'rgba(15,23,42,.35)',
}

interface CssBlock {
    selector: string
    body: string
}

/** 朴素分块（文件无嵌套花括号）：按 `}` 切，`{` 前是选择器、后是块体 */
function blocks(css: string): CssBlock[] {
    return css
        .split('}')
        .slice(0, -1)
        .map((chunk) => {
            const open = chunk.indexOf('{')
            return { selector: chunk.slice(0, open).trim(), body: chunk.slice(open + 1) }
        })
}

/** 块体声明表：`--x: value;` → key/value，空白折叠为单空格 */
function decls(body: string): Map<string, string> {
    const map = new Map<string, string>()
    for (const m of body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) {
        map.set(m[1]!, m[2]!.replace(/\s+/g, ' ').trim())
    }
    return map
}

const allBlocks = blocks(themeCss)

describe('theme.css 结构断言（spec §2/§3/§9）', () => {
    it('夜间（缺省）调色板块：定义在全部主题消费根类上，含全量令牌与 color-scheme: dark', () => {
        const dark = allBlocks.find((b) => decls(b.body).get('color-scheme') === 'dark')
        expect(dark, '缺一个含 color-scheme: dark 的调色板块').toBeDefined()
        for (const root of ROOT_CLASSES) {
            expect(dark!.selector, `夜间块选择器应含根类 ${root}`).toContain(root)
        }
        const darkDecl = decls(dark!.body)
        for (const [token, value] of Object.entries(DARK_VALUES)) {
            expect(darkDecl.get(token), `夜间 ${token}`).toBe(value)
        }
        // --cn-font-mono 静态不随主题：只在夜间块定义
        expect(darkDecl.get('--cn-font-mono')).toContain('monospace')
    })

    it('日间覆盖块：三信号等价选择器 + 全部根类，含全量日间令牌与 color-scheme: light', () => {
        const light = allBlocks.find((b) => decls(b.body).get('color-scheme') === 'light')
        expect(light, '缺一个含 color-scheme: light 的调色板块').toBeDefined()
        // 三种信号写法等价（spec §2.1 ②）
        expect(light!.selector).toContain("[data-cn-theme='light']")
        expect(light!.selector).toContain("[data-theme='light']")
        expect(light!.selector).toContain('html.light')
        for (const root of ROOT_CLASSES) {
            expect(light!.selector, `日间块选择器应含根类 ${root}`).toContain(root)
        }
        const lightDecl = decls(light!.body)
        for (const [token, value] of Object.entries(LIGHT_VALUES)) {
            expect(lightDecl.get(token), `日间 ${token}`).toBe(value)
        }
        // --cn-font-mono 不随主题：日间块不得重定义
        expect(lightDecl.has('--cn-font-mono')).toBe(false)
    })

    it('select 箭头双态 data-URI：夜间描边 %237c8ca5、日间描边 %2364748b', () => {
        expect(themeCss).toContain('%237c8ca5')
        expect(themeCss).toContain('%2364748b')
    })

    it('面板控件族规则整体迁入（原 panel-theme.css 的选择器都在 theme.css）', () => {
        for (const selector of [
            '.cn-props .cn-select',
            '.cn-props .cn-field--expression',
            '.cn-props .cn-props__auto-toggle',
            '.cn-props .cn-props__mode-toggle',
            '.cn-props .cn-layers__row',
            '.cn-props .cn-layers__handle',
            '.cn-props .cn-layers__rename-input',
            '.cn-props .cn-layers__prefix',
            '.cn-props .cn-field--invalid',
            '.cn-props.cn-completion',
            '.cn-props .cn-completion__option--active',
            '.cn-props.cn-pathpicker__menu',
            '.cn-props .cn-pathpicker__option--active',
        ]) {
            expect(
                allBlocks.some((b) => b.selector.includes(selector)),
                `选择器 ${selector} 应迁入 theme.css`,
            ).toBe(true)
        }
    })

    it('panel-theme.css 退化为兼容 shim：@import theme.css，不再自带令牌', () => {
        const shim = readFileSync(
            fileURLToPath(new URL('../src/panel-theme.css', import.meta.url)),
            'utf8',
        )
        expect(shim).toContain("@import './theme.css'")
        expect(decls(shim).size, 'shim 内不得再定义任何声明').toBe(0)
    })
})
