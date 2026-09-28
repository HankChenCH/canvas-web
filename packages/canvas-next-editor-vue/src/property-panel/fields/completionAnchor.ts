/**
 * 光标视口锚点测量（content-completion 工单 04，spec §3「mirror div 测量，
 * textarea/input 两套」）。
 *
 * 返回光标处的视口坐标盒（left/top/bottom），浮层锚在 bottom 下方。量法：
 * - textarea（多行 pre-wrap 换行流）：mirror div 复刻排版（宽度 = 内容盒宽、
 *   同 padding/字族/行高），塞入光标前文本 + 零宽标记 span，读标记的
 *   offsetLeft/offsetTop 得内容原点偏移，减去宿主滚动量；
 * - input（单行）：mirror 量光标前文本宽度，纵向锚在字段盒上下缘。
 *
 * 样式复刻按 getComputedStyle 逐项拷贝，读不到（jsdom/降级）一律按 0 兜底
 * （parseFloat || 0）——测量只影响弹层落点，不阻断补全。镜像节点即建即删。
 */

/** 光标处的视口坐标盒（css 像素；bottom 供浮层上缘锚定） */
export interface CompletionAnchor {
    left: number
    top: number
    bottom: number
}

function px(style: CSSStyleDeclaration, name: string): number {
    return parseFloat(style.getPropertyValue(name)) || 0
}

function copyStyles(from: CSSStyleDeclaration, to: CSSStyleDeclaration, names: readonly string[]): void {
    for (const name of names) {
        const value = from.getPropertyValue(name)
        if (value) to.setProperty(name, value)
    }
}

/** 影响排版复刻的字体/行高类样式（textarea 换行流与 input 单行量宽共用） */
const TYPOGRAPHY_PROPS = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-stretch',
    'letter-spacing',
    'word-spacing',
    'line-height',
    'text-transform',
    'text-indent',
    'tab-size',
]

/** 行高兜底：line-height: normal 数值化不出 → 按字号的 1.4 倍估 */
function lineHeightOf(style: CSSStyleDeclaration): number {
    return px(style, 'line-height') || px(style, 'font-size') * 1.4
}

/** 隐藏镜像节点（fixed 定位在视口原点，不干扰布局），即建即删由调用方 finally 负责 */
function appendMirror(build: (mirror: HTMLDivElement, mirrorStyle: CSSStyleDeclaration) => void): HTMLDivElement {
    const mirror = document.createElement('div')
    const mirrorStyle = mirror.style
    mirrorStyle.position = 'fixed'
    mirrorStyle.top = '0'
    mirrorStyle.left = '0'
    mirrorStyle.visibility = 'hidden'
    build(mirror, mirrorStyle)
    document.body.appendChild(mirror)
    return mirror
}

function measureTextarea(el: HTMLTextAreaElement): CompletionAnchor {
    const cursor = el.selectionStart ?? el.value.length
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const padLeft = px(style, 'padding-left')
    const padTop = px(style, 'padding-top')

    // 光标零宽标记：闭包带出（镜像即建即删，闭包不外泄）
    let marker: HTMLSpanElement | null = null
    const mirror = appendMirror((node, mirrorStyle) => {
        mirrorStyle.whiteSpace = 'pre-wrap'
        mirrorStyle.boxSizing = 'content-box'
        // 内容盒宽 = clientWidth（含 padding）去两侧 padding，与宿主换行宽度一致
        mirrorStyle.width = `${Math.max(0, el.clientWidth - padLeft - px(style, 'padding-right'))}px`
        copyStyles(
            style,
            mirrorStyle,
            ['padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'word-break', 'overflow-wrap'],
        )
        copyStyles(style, mirrorStyle, TYPOGRAPHY_PROPS)
        marker = document.createElement('span')
        marker.textContent = '\u200b'
        node.append(document.createTextNode(el.value.slice(0, cursor)), marker)
    })
    try {
        const left = rect.left + px(style, 'border-left-width') + padLeft + marker!.offsetLeft - el.scrollLeft
        const top = rect.top + px(style, 'border-top-width') + padTop + marker!.offsetTop - el.scrollTop
        return { left, top, bottom: top + lineHeightOf(style) }
    } finally {
        mirror.remove()
    }
}

function measureInput(el: HTMLInputElement): CompletionAnchor {
    const cursor = el.selectionStart ?? el.value.length
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)

    const mirror = appendMirror((node, mirrorStyle) => {
        mirrorStyle.display = 'inline-block'
        mirrorStyle.whiteSpace = 'pre'
        copyStyles(style, mirrorStyle, TYPOGRAPHY_PROPS)
        node.textContent = el.value.slice(0, cursor)
    })
    try {
        const textWidth = mirror.getBoundingClientRect().width || mirror.offsetWidth
        return {
            left: rect.left + px(style, 'border-left-width') + px(style, 'padding-left') + textWidth - el.scrollLeft,
            top: rect.top + px(style, 'border-top-width'),
            bottom: rect.bottom - px(style, 'border-bottom-width'),
        }
    } finally {
        mirror.remove()
    }
}

/** 测量宿主光标的视口锚点（textarea 换行流 / input 单行两套量法） */
export function measureCursorAnchor(el: HTMLTextAreaElement | HTMLInputElement): CompletionAnchor {
    if (el instanceof HTMLTextAreaElement) return measureTextarea(el)
    return measureInput(el)
}
