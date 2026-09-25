import { create as createQr, toDataURL as qrToDataUrlDirect } from 'qrcode'
import { describe, expect, it } from 'vitest'

import { QR_FIXED_OPTIONS, qrDataUrl, qrModuleMatrix } from '../src/qr'

describe('QR 固定选项：与 php-canvas-next ResourceResolver::materializeQrCode 对齐', () => {
    it('固定选项常量逐项对齐 endroid（UTF-8/纠错 High/margin 0/黑白）', () => {
        expect(QR_FIXED_OPTIONS.errorCorrectionLevel).toBe('H')
        expect(QR_FIXED_OPTIONS.margin).toBe(0)
        expect(QR_FIXED_OPTIONS.color).toEqual({ dark: '#000000ff', light: '#ffffffff' })
        // UTF-8 由编码通路断言（中文/emoji 用例）；scale 是浏览器端产物清晰度，非契约
    })

    it('角点点位取样：三个定位图形按 QR 规范落位（深浅交替环 + 分隔区留白）', () => {
        // "A" 1 字节 @ ECC H → version 1，符号 21×21 模块（QR 规范常量，库无关 oracle）
        const { size, isDark } = qrModuleMatrix('A')
        expect(size).toBe(21)

        // 定位图形 7×7：外环深、次环浅、3×3 心深；左上/右上/左下三角
        const finders = [
            { row: 0, col: 0 },
            { row: 0, col: size - 7 },
            { row: size - 7, col: 0 },
        ]
        for (const { row, col } of finders) {
            expect(isDark(row, col)).toBe(true) // 外角
            expect(isDark(row + 1, col + 1)).toBe(false) // 浅环
            expect(isDark(row + 3, col + 3)).toBe(true) // 中心
            expect(isDark(row + 5, col + 5)).toBe(false) // 浅环
            expect(isDark(row + 6, col + 6)).toBe(true) // 对角外角
        }
        // 分隔区：定位图形贴边一侧的一圈必须留白（margin 0 时这是符号边界内侧）
        expect(isDark(0, 7)).toBe(false)
        expect(isDark(7, 0)).toBe(false)
        expect(isDark(7, size - 1)).toBe(false)
        expect(isDark(size - 1, 7)).toBe(false)
    })

    it('margin 0：符号尺寸 = 模块数，无静区（endroid RoundBlockSizeMode::None 同语义）', async () => {
        // "A" @ ECC H → version 1：符号恰 21×21 模块，margin 0 即无静区加边
        const { size } = qrModuleMatrix('A')
        expect(size).toBe(21)
        // 产物与固定选项直呼一致（margin/color/scale 全部透传）
        const direct = await qrToDataUrlDirect('A', {
            errorCorrectionLevel: 'H',
            margin: 0,
            scale: QR_FIXED_OPTIONS.scale,
            color: QR_FIXED_OPTIONS.color,
        })
        await expect(qrDataUrl('A')).resolves.toBe(direct)
    })

    it('纠错 High 与库直呼对齐，且与 Low 产物可区分（选项确实透传）', () => {
        // "https://example.com/join" 23 字节：ECC H → version 3，ECC L → version 2（容量表规范值）
        const high = qrModuleMatrix('https://example.com/join')
        const low = createQr('https://example.com/join', { errorCorrectionLevel: 'L' })
        expect(high.size).toBe(29)
        expect(low.modules.size).toBe(25)
    })

    it('UTF-8 通路：字符串与测试侧自构的 UTF-8 字节段产同一矩阵（编码 oracle 独立于包装层）', () => {
        const value = '画布-🎉-join'
        // 测试自己把字符串编成 UTF-8 字节（node:crypto 侧的 TextEncoder），再以显式
        // byte 段直呼生成——包装层若不是按 UTF-8 编码字符串，两者矩阵必然分叉
        const utf8Bytes = new TextEncoder().encode(value)
        const fromBytes = createQr([{ mode: 'byte', data: utf8Bytes }], { errorCorrectionLevel: 'H' })
        const fromString = qrModuleMatrix(value)

        expect(fromString.size).toBe(fromBytes.modules.size)
        for (let row = 0; row < fromString.size; row++) {
            for (let col = 0; col < fromString.size; col++) {
                expect(fromString.isDark(row, col)).toBe(fromBytes.modules.get(row, col) === 1)
            }
        }
    })

    it('同内容确定性：两次生成逐模块一致（角点取样跨次运行稳定）', () => {
        const a = qrModuleMatrix('https://example.com')
        const b = qrModuleMatrix('https://example.com')
        expect(a.size).toBe(b.size)
        for (let row = 0; row < a.size; row++) {
            for (let col = 0; col < a.size; col++) {
                expect(a.isDark(row, col)).toBe(b.isDark(row, col))
            }
        }
    })

    it('qrDataUrl 产出 PNG dataURL，选项透传（与固定选项直呼产物一致）', async () => {
        const dataUrl = await qrDataUrl('https://example.com/join')
        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
        const direct = await qrToDataUrlDirect('https://example.com/join', {
            errorCorrectionLevel: 'H',
            margin: 0,
            scale: QR_FIXED_OPTIONS.scale,
            color: QR_FIXED_OPTIONS.color,
        })
        expect(dataUrl).toBe(direct)
    })
})
