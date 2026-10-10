/**
 * 可编辑元素判定（绑定层共用，工单 14）：快捷键让路与空格平移跟踪的同一口径——
 * 输入框/文本域/下拉/按钮/可编辑节点上的按键属原生控件编辑，不归画布快捷键。
 */
export function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON'
}

/**
 * 文本录入元素判定（Esc 消耗面）：Esc 属原生控件语义的目标——输入框/文本域/下拉
 * （IME 取消、下拉收起）。与 isEditableEventTarget 的差异是 BUTTON：按钮让路快捷键
 * （字符键/空格/方向键属控件编辑语义），但按钮不原生消耗 Esc——浮层关闭协议
 * （查找条/右键菜单的窗口级 Esc 转发）对按钮焦点必须继续生效，否则点过工具栏
 * 任意按钮后焦点落 BUTTON，Esc 被短路、查找条关不掉（真机缺陷 2026-10）。
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
