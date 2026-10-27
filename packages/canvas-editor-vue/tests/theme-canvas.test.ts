import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 画布域组件 scoped 零硬编码色守卫（editor-theme-light-dark spec §2.1 铁律 +
 * §9「防偷偷加回硬编码色」最小网在画布域的落点，工票 02）。
 *
 * 铁律：凡随主题变色的 --cn-* 令牌一律且只能在 theme.css 定义——Vue scoped
 * 样式带 [data-v-x] 提升特异性、注入时序晚于入口 css，组件内定义色令牌会压过
 * theme.css 的日间覆盖。画布域组件根类（.cn-ruler/.cn-context-menu/…）均在
 * theme.css 主题消费根类清单内，scoped 只 var() 消费。断言两件事：
 *   1. <style> 段无颜色字面量（hex / rgb() / hsl()，含注释——注释里留色值
 *      同样会误导后人「此处自带主题」）；
 *   2. scoped 内自定义 --cn-* 变量仅限几何/字形白名单（尺寸/圆角/虚线齿距/
 *      等宽字族），色令牌一律出组件。
 *
 * 画笔（gizmo.ts/findHighlight.ts/createBand.ts，Canvas2D TS 常量）按 spec §6
 * 审计明暗双态可辨、故意不随主题，不在本守卫射程（TS 非 scoped css）。
 */

/** 画布域全部外观件（src/canvas/*.vue，与域内 .vue 文件一一对应） */
const CANVAS_FILES = [
    'AlignFloatBar.vue',
    'CanvasSurface.vue',
    'ContextMenu.vue',
    'EditOverlayToolbar.vue',
    'FindBar.vue',
    'GuidesOverlay.vue',
    'Ruler.vue',
    'TextEditingOverlay.vue',
] as const

/** scoped 内允许保留的几何/字形类局部变量白名单（色令牌不得入列） */
const GEOMETRY_VARS = new Set([
    // Ruler：条厚 + 等宽字族（spec §2.1「几何/尺寸类局部变量留组件」例证）
    '--cn-ruler-thickness',
    '--cn-ruler-font',
    // GuidesOverlay：吸附线虚线齿距 / 命中条厚度 / 壳内收边圆角
    '--cn-snap-dash',
    '--cn-guide-hit',
    '--cn-guide-clip-radius',
])

function scopedStyle(source: string): string {
    const open = source.indexOf('<style')
    const close = source.indexOf('</style>')
    return source.slice(open, close)
}

describe('画布域组件 scoped 零硬编码色（spec §2.1 铁律，工票 02）', () => {
    for (const file of CANVAS_FILES) {
        it(`${file}：<style> 段无颜色字面量、色令牌只 var() 消费`, () => {
            const style = scopedStyle(
                readFileSync(
                    fileURLToPath(new URL(`../src/canvas/${file}`, import.meta.url)),
                    'utf8',
                ),
            )
            expect(style, 'hex 色字面量').not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
            expect(style, 'rgb()/rgba() 色字面量').not.toMatch(/\brgba?\s*\(/)
            expect(style, 'hsl()/hsla() 色字面量').not.toMatch(/\bhsla?\s*\(/)
            const defined = [...style.matchAll(/(--cn-[\w-]+)\s*:/g)].map((m) => m[1]!)
            const offenders = defined.filter((name) => !GEOMETRY_VARS.has(name))
            expect(offenders, '色令牌只能在 theme.css 定义').toEqual([])
        })
    }
})
