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
