<script setup lang="ts">
/**
 * ContextMenu：最小右键菜单（工单 14；显示/隐藏项 layer-panel-ux 工单 10）。
 *
 * - 渲染在 CanvasSurface 宿主内（与两层 canvas 同一定位上下文）；openAt 用
 *   **视口坐标**（表面本地 css 像素）定位——菜单是屏幕空间弹出层，定位换算只在
 *   打开时发生一次，pan/zoom 不跟随；越界钳位（打开后量实际尺寸）保证画布边缘
 *   完整可见。
 * - 动作全部经内核 action（toggleLayerVisibility/duplicateSelection/copyStyle/
 *   pasteStyle/bringForward/sendBackward/bringToFront/sendToBack/deleteLayer），
 *   组件零文档写语义；可用态按选中路径裁剪（内核语义，v1 单选）：显示/隐藏 = 根层
 *   选择（visible 住 LayerBase 面）；删除 = 有选择；副本 = 可复制（可落根层的类型，见
 *   canCopySelection）；样式复制/粘贴（canvas-web-style-paste 工单 02，spec 决策 7，
 *   置于创建副本之后）= 内核只读查询口同门——复制 = 有可解析选择且源类型有样式面
 *   （非根不禁用：样式源/目标面含行/格/内容，与副本项的根层限制不同）；粘贴 =
 *   样式槽非空 + 有可解析选择；前移一层/后移一层与置顶/置底 = 根层选择（isRootLayerPath
 *   ——容器内行/格是数组序语义，无此操作；kbd-nav 工单 05 补前移/后移置于
 *   置顶/置底之上，边界不置灰——内核空转为权威）。
 * - 关闭时机：执行任一动作、画布 pointerdown（表面组件转发 close）、Escape
 *   （表面组件转发）。菜单根拦截 pointerdown 冒泡（点菜单项不触发画布点选）与
 *   contextmenu（菜单上右键不换目标重开）。⌥⌘C/V 键位随注册表自带，本组件零键位代码。
 */
import { computed, nextTick, ref } from 'vue'

import { isRootLayerPath, rootLayerOf, type EditorSession, type LayerPath } from '@hankchen/canvas-editor'

import { useSelection } from '../shared/useSelection'
import { detectShortcutPlatform, shortcutActionLabel } from '../shared/shortcutsHelp'

const props = defineProps<{ editor: EditorSession }>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)
const position = ref({ x: 0, y: 0 })

// 键位提示按宿主平台渲染两形态（⌥⌘C 或 Ctrl+Alt+C 等）：直查注册表，文案不另抄
// 键位；平台不会话中变更，挂载时求值一次
const shortcutPlatform = detectShortcutPlatform()
const copyStyleHint = `先 ${shortcutActionLabel('copyStyle', shortcutPlatform)} 复制样式`
const lockedHint = `图层已锁定（${shortcutActionLabel('toggleLayerLock', shortcutPlatform)} 解锁后可删除）`

const selection = useSelection(props.editor)

const isRoot = computed(() => selection.value !== null && isRootLayerPath(selection.value))
const canDuplicate = computed(() => selection.value !== null && props.editor.canCopySelection)

// 样式复制/粘贴可用态（canvas-web-style-paste 工单 02）：内核只读查询口同门
// （canCopyStyle/canPasteStyle，工单 01 预铺）。样式槽是会话私有态——内核不进
// store、不发变更事件（剪贴板态不是文档态），getter 读取无响应式足迹：
// selection 依赖作响应锚（canDuplicate 同门），open 依赖使菜单每次打开强制重算
// （⌥⌘C 后同层重开菜单、槽已变而选择未变的兜底）。
const canCopyStyle = computed(() => {
    void open.value
    return selection.value !== null && props.editor.canCopyStyle
})
const canPasteStyle = computed(() => {
    void open.value
    return selection.value !== null && props.editor.canPasteStyle
})

/** 选中根层的当前可见态（只读解析，标签翻转用；非根/无选择按可见兜底） */
const selectedRootVisible = computed(() => {
    const path = selection.value
    const doc = props.editor.store.doc
    if (!path || !doc || !isRootLayerPath(path)) return true
    return rootLayerOf(doc, path)?.visible ?? true
})

/**
 * 选中路径所属的根层（任意深度解析）：画布右键按命中重选（点表体选中的是格），
 * 转换项按「所属表」判定——格/行上右键 = 转换它所在的表（spec §2.3 入口语义的
 * 画布落地面；隐藏/置顶等其余项维持根层语义不变）。
 */
const selectedRootLayer = computed(() => {
    const path = selection.value
    const doc = props.editor.store.doc
    if (!path || !doc) return null
    return rootLayerOf(doc, path)
})

/** 转换目标的表根路径：选中路径的第 2 段即根层下标（转换 action 吃表路径） */
function selectionTablePath(): LayerPath | null {
    const path = selection.value
    if (!path || typeof path[1] !== 'number') return null
    return ['layers', path[1]]
}

const isTemplateTableSelection = computed(
    () => selectedRootLayer.value?.type === 'TableLayer' && selectedRootLayer.value.template !== null,
)

/** 行模板替身选中（替身路径收尾段）：删除项置灰（spec §2.5） */
const isTemplateRowSelection = computed(() => selection.value?.[selection.value.length - 1] === 'template')

/** 选中路径落在锁定子树（canvas-web-layer-lock 工单 02，内核谓词读取口一次求值）：删除项置灰 */
const lockedSelection = computed(() => selection.value !== null && props.editor.isLocked(selection.value))

/** 转换可用态（spec §2.3 C2）：末行存在且非空——空表/空末行置灰 + title 说明 */
const canConvertToTemplate = computed(() => {
    const layer = selectedRootLayer.value
    if (!layer || layer.type !== 'TableLayer' || layer.template !== null) return false
    const last = layer.rows[layer.rows.length - 1]
    return last !== undefined && last.cells.length > 0
})

const convertHint = computed(() => {
    const layer = selectedRootLayer.value
    if (!layer || layer.type !== 'TableLayer') return ''
    return `模板取自末行，其余 ${Math.max(layer.rows.length - 1, 0)} 行将移除（可撤销）`
})

// ---- 转为模板表的轻表单态（spec §2.3 C1：确认与 rowsPath 输入一个交互点） ----

const convertFormOpen = ref(false)
const convertRowsPath = ref('')
const convertRowsPathInvalid = ref(false)

function openConvertForm(): void {
    convertFormOpen.value = true
    convertRowsPath.value = ''
    convertRowsPathInvalid.value = false
}

function confirmConvert(): void {
    const tablePath = selectionTablePath()
    const rowsPath = convertRowsPath.value.trim()
    if (!tablePath || rowsPath === '') {
        convertRowsPathInvalid.value = true
        return
    }
    props.editor.convertTableToTemplate(tablePath, rowsPath)
    close()
}

interface MenuItem {
    key: 'visibility' | 'duplicate' | 'copy-style' | 'paste-style' | 'forward' | 'backward' | 'front' | 'back' | 'delete' | 'to-template' | 'to-rows'
    label: string
    enabled: boolean
    /** 禁用/说明文案（spec §2.5 反馈规范：置灰 + title 统一） */
    title?: string
    /** 执行后保持菜单开（转为模板表切表单视图用） */
    keepsOpen?: boolean
    run: () => void
}

const items = computed<MenuItem[]>(() => [
    {
        key: 'visibility',
        label: selectedRootVisible.value ? '隐藏' : '显示',
        enabled: isRoot.value,
        title: isRoot.value ? undefined : '显示/隐藏仅作用于根图层',
        run: () => {
            const path = selection.value
            if (path) props.editor.toggleLayerVisibility(path)
        },
    },
    {
        key: 'duplicate',
        label: '创建副本',
        enabled: canDuplicate.value,
        title: canDuplicate.value ? undefined : '行/格/行模板是容器内结构，不可复制',
        run: () => props.editor.duplicateSelection(),
    },
    // 样式两项（canvas-web-style-paste 工单 02，spec 决策 7）：执行经内核动作，
    // ⌥⌘C/V 键位随注册表自带（零键位代码；置灰提示键位经 shortcutsHelp 按平台
    // 直查注册表）；复制项替身置灰 + title（适用面为空，
    // 置灰 + title 统一先例），粘贴项槽空置灰 + title 说明
    {
        key: 'copy-style',
        label: '复制样式',
        enabled: canCopyStyle.value,
        title: !canCopyStyle.value && isTemplateRowSelection.value ? '行模板替身无样式可复制' : undefined,
        run: () => {
            const path = selection.value
            if (path) props.editor.copyStyle(path)
        },
    },
    {
        key: 'paste-style',
        label: '粘贴样式',
        enabled: canPasteStyle.value,
        title: canPasteStyle.value ? undefined : copyStyleHint,
        run: () => {
            const path = selection.value
            if (path) props.editor.pasteStyle(path)
        },
    },
    // 前移/后移一层（kbd-nav 工单 05，spec 决策 2）：置于置顶/置底之上；非根置灰
    // + title 同现状；边界不置灰——已最前/最后内核空转为权威（无历史步）
    {
        key: 'forward',
        label: '前移一层',
        enabled: isRoot.value,
        title: isRoot.value ? undefined : '前移/后移仅对根图层生效',
        run: () => props.editor.bringForward(),
    },
    {
        key: 'backward',
        label: '后移一层',
        enabled: isRoot.value,
        title: isRoot.value ? undefined : '前移/后移仅对根图层生效',
        run: () => props.editor.sendBackward(),
    },
    {
        key: 'front',
        label: '置顶',
        enabled: isRoot.value,
        title: isRoot.value ? undefined : '置顶/置底仅对根图层生效',
        run: () => props.editor.bringToFront(),
    },
    {
        key: 'back',
        label: '置底',
        enabled: isRoot.value,
        title: isRoot.value ? undefined : '置顶/置底仅对根图层生效',
        run: () => props.editor.sendToBack(),
    },
    // 转换项（spec §2.3 C3）：状态互斥动作用显隐不是禁用——模板态显示「转回」，
    // V1 表显示「转为…」，其余类型不出现
    ...(isTemplateTableSelection.value
        ? [
              {
                  key: 'to-rows',
                  label: '转回普通表',
                  enabled: true,
                  title: '行模板实例化为单行，恢复普通表格编辑',
                  run: () => {
                      const tablePath = selectionTablePath()
                      if (tablePath) props.editor.convertTableToRows(tablePath)
                  },
              } satisfies MenuItem,
          ]
        : selectedRootLayer.value?.type === 'TableLayer'
          ? [
                {
                    key: 'to-template',
                    label: '转为模板表…',
                    enabled: canConvertToTemplate.value,
                    title: canConvertToTemplate.value
                        ? convertHint.value
                        : (selectedRootLayer.value.rows.length === 0
                            ? '空表无可转换行'
                            : '末行为空——先为末行加格'),
                    keepsOpen: true,
                    run: () => openConvertForm(),
                } satisfies MenuItem,
            ]
          : []),
    {
        key: 'delete',
        label: '删除',
        // 锁定子树置灰（canvas-web-layer-lock 工单 02）：内核 deleteLayer 空转为
        // 权威（画布右键经命中面天然够不到锁定层——本项兜住面板选中后重开的菜单）
        enabled: selection.value !== null && !isTemplateRowSelection.value && !lockedSelection.value,
        title: isTemplateRowSelection.value
            ? '行模板由表持有——转换回普通表请用 V2 转换入口'
            : lockedSelection.value
                ? lockedHint
                : undefined,
        run: () => {
            const path = selection.value
            if (path) props.editor.deleteLayer(path)
        },
    },
])

/** 打开菜单（视口坐标，表面本地 css 像素）；打开后按实际尺寸钳位进宿主边界 */
async function openAt(x: number, y: number): Promise<void> {
    position.value = { x, y }
    open.value = true
    await nextTick()
    const el = rootRef.value
    const host = el?.parentElement
    if (!el || !host) return
    const rect = el.getBoundingClientRect()
    const maxX = host.clientWidth - rect.width - 2
    const maxY = host.clientHeight - rect.height - 2
    position.value = {
        x: Math.max(2, Math.min(position.value.x, maxX)),
        y: Math.max(2, Math.min(position.value.y, maxY)),
    }
}

function close(): void {
    open.value = false
    convertFormOpen.value = false
    convertRowsPath.value = ''
    convertRowsPathInvalid.value = false
}

function run(item: MenuItem): void {
    item.run()
    // 转为模板表不关菜单——切换到轻表单视图（spec §2.3 C1）
    if (item.keepsOpen === true) return
    close()
}

defineExpose({ openAt, close })
</script>

<template>
    <div
        v-if="open"
        ref="rootRef"
        class="cn-context-menu"
        role="menu"
        aria-label="图层操作菜单"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
    >
        <!-- 转为模板表的轻表单视图（spec §2.3 C1）：rowsPath 必填 + 确认/取消 -->
        <div v-if="convertFormOpen" class="cn-context-menu__form">
            <p class="cn-context-menu__hint">{{ convertHint }}</p>
            <input
                v-model="convertRowsPath"
                data-convert-rows-path
                type="text"
                placeholder="数据行路径，如 order.items"
                class="cn-context-menu__input"
                :class="{ 'cn-context-menu__input--invalid': convertRowsPathInvalid }"
                @keydown.enter.prevent="confirmConvert"
            />
            <p v-if="convertRowsPathInvalid" class="cn-context-menu__hint cn-context-menu__hint--error">
                rowsPath 必填
            </p>
            <div class="cn-context-menu__form-actions">
                <button type="button" class="cn-context-menu__item cn-context-menu__item--confirm" @click="confirmConvert">
                    确认转换
                </button>
                <button type="button" class="cn-context-menu__item" @click="close">取消</button>
            </div>
        </div>
        <template v-else>
            <button
                v-for="item in items"
                :key="item.key"
                type="button"
                role="menuitem"
                class="cn-context-menu__item"
                :class="[`cn-context-menu__item--${item.key}`]"
                :disabled="!item.enabled"
                :title="item.title"
                @click="run(item)"
            >
                {{ item.label }}
            </button>
        </template>
    </div>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：菜单自带主题（暗色检视面），不依赖宿主接线 */
.cn-context-menu {
    --cn-bg: #0b1220;
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-field: rgba(148, 163, 184, 0.07);
    --cn-accent: #38bdf8;
    --cn-accent-soft: rgba(56, 189, 248, 0.12);
    --cn-danger: #f87171;

    position: absolute;
    z-index: 30;
    min-width: 120px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
}

.cn-context-menu__item {
    padding: 6px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
}

.cn-context-menu__item:hover:not(:disabled) {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
}

.cn-context-menu__item:disabled {
    color: var(--cn-muted);
    cursor: not-allowed;
}

.cn-context-menu__item--delete:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.12);
    color: var(--cn-danger);
}

/* 转为模板表的轻表单（spec §2.3 C1）：说明行 + 必填输入 + 确认/取消 */
.cn-context-menu__form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px;
    min-width: 180px;
}

.cn-context-menu__hint {
    margin: 0;
    padding: 0 4px;
    color: var(--cn-muted);
    font-size: 11px;
    line-height: 1.5;
}

.cn-context-menu__hint--error {
    color: var(--cn-danger);
}

.cn-context-menu__input {
    padding: 5px 8px;
    border: 1px solid var(--cn-line);
    border-radius: 6px;
    background: var(--cn-field);
    color: var(--cn-fg);
    font-size: 12px;
    line-height: 1.4;
    outline: none;
}

.cn-context-menu__input:focus {
    border-color: var(--cn-accent);
}

.cn-context-menu__input--invalid {
    border-color: var(--cn-danger);
}

.cn-context-menu__form-actions {
    display: flex;
    gap: 4px;
}

.cn-context-menu__form-actions .cn-context-menu__item {
    flex: 1;
    text-align: center;
}

.cn-context-menu__item--confirm {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
}
</style>
