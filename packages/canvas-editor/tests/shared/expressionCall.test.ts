import { describe, expect, it } from 'vitest'

import {
    expressionCallSlotAtEnd,
    isCallFragment,
    parseExpressionCall,
} from '../../src/shared/expressionCall'

/**
 * 最小调用形解析（expression-type-methods 工单 12，spec §1.1/§1.2 ⑦⑨）：
 * JS 预览端只做**结构面识别**——分类（⑦）与实参表结构（括号不平衡/空参数位/
 * 尾逗号/字符串未闭合）+ 首参必须为路径（§1.2 ① 文法层钉死）；**名单面不校验**
 * （未知函数名不标红，PHP 权威端先发新函数避免名单漂移假红）、签名面（参数个数/
 * 第二参类型/n 范围）不校验。算法逐字节镜像 php-canvas-next
 * InterpolationEvaluator::resolveFragment / parseCallArgs / parseCallArg。
 */
describe('isCallFragment（⑦ 片段分类：首 token + 可选空白 + ( 即调用）', () => {
    it('调用形态：函数名直连 / 空白间隔 / 非 ASCII 名 / 未闭合均按调用', () => {
        expect(isCallFragment('date(row.x)')).toBe(true)
        expect(isCallFragment('date (row.x)')).toBe(true)
        expect(isCallFragment('foo(bar)')).toBe(true)
        expect(isCallFragment('日期(bar)')).toBe(true)
        expect(isCallFragment('date(')).toBe(true) // 未闭合也是调用形态（结构错归解析面）
        expect(isCallFragment('date(row.x, \'a')).toBe(true)
    })

    it('路径形态：无 ( 恒为路径（{{date}} 数据集根键叫 date 合法）；点号后跟 ( 不是调用', () => {
        expect(isCallFragment('date')).toBe(false)
        expect(isCallFragment('row.x')).toBe(false)
        expect(isCallFragment('foo.bar(x)')).toBe(false) // 首 token 后是 . 不是 (
        expect(isCallFragment('.x(')).toBe(false) // 首 token 为空（. 是特界符）
        expect(isCallFragment('')).toBe(false)
        expect(isCallFragment('$root.a')).toBe(false)
    })
})

describe('parseExpressionCall（结构面解析：实参表 + 首参路径，名单/签名面不校验）', () => {
    /** 断言解析通过并收窄 ok 分支 */
    function parseOk(expr: string): Extract<ReturnType<typeof parseExpressionCall>, { ok: true }> {
        const parsed = parseExpressionCall(expr)
        if (!parsed.ok) throw new Error(`应结构合法：${expr}`)
        return parsed
    }

    it('合法调用：单参 / 两参 / 零参（文法合法，个数归签名层）', () => {
        expect(parseOk('date(row.x)')).toMatchObject({ name: 'date', args: [{ type: 'path', value: 'row.x' }] })
        expect(parseOk('number(row.amount, 2)')).toMatchObject({
            name: 'number',
            args: [
                { type: 'path', value: 'row.amount' },
                { type: 'number', value: '2' },
            ],
        })
        expect(parseOk('now()')).toMatchObject({ name: 'now', args: [] })
    })

    it('空白容忍（WS* 于名字/括号/逗号间；段内空白属于键名——存量画布字节兼容）', () => {
        expect(parseOk('date( row.x , \'YYYY年MM月DD日\' )').args).toEqual([
            { type: 'path', value: 'row.x' },
            { type: 'string', value: 'YYYY年MM月DD日' },
        ])
        // 路径实参吞至 ,/) 为止：缺逗号不是结构错（空格并入键名，与 PHP 同构）
        expect(parseOk('date(row.x row.y)').args).toEqual([{ type: 'path', value: 'row.x row.y' }])
    })

    it('字符串字面量：仅单引号、\'\' 翻倍转义；其余任意字符（中文/空白）合法', () => {
        expect(parseOk("date(x, 'a''b')").args[1]).toEqual({ type: 'string', value: "a'b" })
        expect(parseOk("date(x, '2026 年')").args[1]).toEqual({ type: 'string', value: '2026 年' })
    })

    it('数字字面量：无符号十进制整数/小数（负号/指数归签名面不校验）', () => {
        expect(parseOk('percent(x, 0)').args[1]).toEqual({ type: 'number', value: '0' })
        expect(parseOk('fixed(x, 2.5)').args[1]).toEqual({ type: 'number', value: '2.5' })
    })

    it('名单面不校验：未知函数名结构合法（PHP 权威端 fail-fast，JS 不标红）', () => {
        expect(parseOk('foo(bar)')).toMatchObject({ name: 'foo', args: [{ type: 'path', value: 'bar' }] })
        expect(parseOk('日期(bar)')).toMatchObject({ name: '日期' })
        expect(parseOk('DATE(x)')).toMatchObject({ name: 'DATE' }) // 大小写敏感归名单面
    })

    it('签名面不校验：双引号串按路径吞并、第二参类型/参数个数 JS 不判', () => {
        // 双引号串：首字符非 '/数字 → 路径分支吞至 ,/)（引号本身是路径字符）——
        // PHP 同构；签名层「第二参须为字符串」的 fail-fast 归 PHP，JS 不标红
        expect(parseOk('date(x, "Y")').args[1]).toEqual({ type: 'path', value: '"Y"' })
        expect(parseExpressionCall('date(x)()').ok).toBe(false) // 实参表外还有 ( → 多余内容
        expect(parseOk('date(x, y, z)')).toMatchObject({ name: 'date' }) // ≥3 参个数归签名面
    })

    it('结构错：括号不平衡', () => {
        expect(parseExpressionCall('date(x')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall("date(x, 'a")).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(x))')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
    })

    it('结构错：空参数位与尾逗号', () => {
        expect(parseExpressionCall('date(x,)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(,x)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(  )').ok).toBe(true) // 空白后闭括号 = 零参合法
    })

    it('结构错：字符串未闭合 / 调用后多余内容', () => {
        expect(parseExpressionCall("date(x, 'a'b')")).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(x) x')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
    })

    it('首参必须为路径（§1.2 ① 文法层钉死）：字符串/数字首参 = 结构错', () => {
        expect(parseExpressionCall("date('123')")).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('number(1)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
    })

    it('数字字面量截断（1. 无后继位）→ 实参语法错（镜像 PHP：. 不被消费，分隔位判错）', () => {
        expect(parseExpressionCall('date(x, 1.)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(x, 1.2.3)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
    })

    it('路径实参空段 = 结构错（非法路径，与求值器同码）', () => {
        expect(parseExpressionCall('date(row..x)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
        expect(parseExpressionCall('date(.x)')).toMatchObject({ ok: false, error: 'expression_syntax_error' })
    })
})

describe('expressionCallSlotAtEnd（光标槽位定位：容忍截断前缀，供补全路由）', () => {
    it('首参路径槽：date( / 部分路径文本', () => {
        expect(expressionCallSlotAtEnd('date(')).toEqual({ name: 'date', index: 0, text: '', stringSlot: false })
        expect(expressionCallSlotAtEnd('date(row.iss')).toEqual({
            name: 'date',
            index: 0,
            text: 'row.iss',
            stringSlot: false,
        })
    })

    it('后续参数槽：逗号后的空位 / 数字槽（无建议语义由路由决定）', () => {
        expect(expressionCallSlotAtEnd('date(row.x, ')).toEqual({ name: 'date', index: 1, text: '', stringSlot: false })
        expect(expressionCallSlotAtEnd('number(row.x, 2')).toEqual({
            name: 'number',
            index: 1,
            text: '2',
            stringSlot: false,
        })
    })

    it('字符串槽：引号内原文（date 格式串建议面）；转义 \'\' 不闭合', () => {
        expect(expressionCallSlotAtEnd("date(row.x, '")).toEqual({ name: 'date', index: 1, text: '', stringSlot: true })
        expect(expressionCallSlotAtEnd("date(row.x, 'Y")).toEqual({ name: 'date', index: 1, text: 'Y', stringSlot: true })
        expect(expressionCallSlotAtEnd("date(x, 'a''b")).toEqual({ name: 'date', index: 1, text: "a''b", stringSlot: true })
    })

    it('字符串已闭合 / 调用已闭合：落点在其后的空位或 null（无建议）', () => {
        // 闭合引号后前缀未写 )（光标在串外、调用未闭）：第三参槽位（v1 签名只有两参，路由给空候选）
        expect(expressionCallSlotAtEnd("date(row.x, ''")).toEqual({ name: 'date', index: 2, text: '', stringSlot: false })
        expect(expressionCallSlotAtEnd("date(row.x, '')")).toBeNull() // 调用已闭合，无建议
        expect(expressionCallSlotAtEnd('date')).toBeNull() // 非调用形态（路由不达）
    })
})
