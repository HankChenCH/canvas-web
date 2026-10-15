/**
 * 弹层视口定位纯函数（resource-expression-single-ref 工单 05/06，ADR 0020 伴生
 * 修复）：锚点下方优先 → 放不下向上翻转 → 翻转仍不足钳制视口内；横向右缘收口。
 * 实测缺陷（工单 06 背景）：资源字段居面板底部，浮层候选项大半截出屏不可点。
 * 纯几何、零 DOM——高度量不到（0）按放得下处理（首帧未渲染/降级不误翻转）。
 */
import { describe, expect, it } from 'vitest'

import { placePopupInViewport } from '../../src/shared/popupPosition'

const anchor = { top: 100, bottom: 120, left: 50 }

describe('placePopupInViewport：垂直三段决策', () => {
    it('下方放得下：锚下缘 + 间隙（既有浮层行为零回归）', () => {
        const placed = placePopupInViewport({
            anchor,
            popupWidth: 200,
            popupHeight: 150,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.top).toBe(124) // bottom 120 + 间隙 4
        expect(placed.left).toBe(50)
    })

    it('下方放不下、上方放得下：向上翻转（上缘 = 锚上缘 − 间隙 − 高）', () => {
        const placed = placePopupInViewport({
            anchor: { top: 600, bottom: 620, left: 50 },
            popupWidth: 200,
            popupHeight: 300, // 下方 624 + 300 > 764；上方 600 − 4 − 300 = 296 ≥ 4
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.top).toBe(296)
    })

    it('翻转仍不足：钳制视口内（下缘贴 viewport − margin）', () => {
        const placed = placePopupInViewport({
            anchor: { top: 380, bottom: 400, left: 50 },
            popupWidth: 200,
            popupHeight: 500, // 下方 404 + 500 > 764；上方 380 − 4 − 500 < 4 → 钳制
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.top).toBe(768 - 4 - 500) // 264
    })

    it('高度量不到（0，jsdom/首帧）：按放得下处理不误翻转', () => {
        const placed = placePopupInViewport({
            anchor: { top: 700, bottom: 720, left: 50 },
            popupWidth: 200,
            popupHeight: 0,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.top).toBe(724)
    })

    it('浮层比视口还高：钉在上 margin', () => {
        const placed = placePopupInViewport({
            anchor: { top: 380, bottom: 400, left: 50 },
            popupWidth: 200,
            popupHeight: 900,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.top).toBe(4)
    })
})

describe('placePopupInViewport：横向收口', () => {
    it('右缘越界：左移收口不越 innerWidth − margin', () => {
        const placed = placePopupInViewport({
            anchor: { top: 100, bottom: 120, left: 900 },
            popupWidth: 241,
            popupHeight: 100,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.left).toBe(1024 - 4 - 241)
    })

    it('浮层比视口还宽：钉在左 margin', () => {
        const placed = placePopupInViewport({
            anchor,
            popupWidth: 2000,
            popupHeight: 100,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.left).toBe(4)
    })

    it('宽度量不到（0）：按原锚放（既有 clampToViewport 行为）', () => {
        const placed = placePopupInViewport({
            anchor: { top: 100, bottom: 120, left: 88 },
            popupWidth: 0,
            popupHeight: 100,
            viewportWidth: 1024,
            viewportHeight: 768,
        })
        expect(placed.left).toBe(88)
    })

    it('间隙与 margin 可调（调用方常量单点）', () => {
        const placed = placePopupInViewport({
            anchor,
            popupWidth: 200,
            popupHeight: 150,
            viewportWidth: 1024,
            viewportHeight: 768,
            gap: 8,
            margin: 8,
        })
        expect(placed.top).toBe(128)
    })
})
