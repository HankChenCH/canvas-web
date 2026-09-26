#!/usr/bin/env bash
# 红线自验（工单 01；2026-09 扩展包内域纪律）：故意制造违规依赖，
# dependency-cruiser 必须以对应规则抓住：
#   1) editor → editor-vue 跨包方向（editor-no-binding-layer）；
#   2) editor-vue 域间横向 import（editor-vue-property-panel-isolation）；
#   3) editor 内核下层引用上层（editor-editing-isolation）。
#
# pnpm 严格隔离下，未在 package.json 声明的依赖连 symlink 都没有、import
# 在解析层就失败（那由 unresolved-dependency 规则兜底）。金丝雀 1 手动补上
# editor-vue 的链接，模拟「有人把错误依赖真的声明进 package.json」后的
# 最坏情形——此时必须由方向规则拦下。
#
# 判定从严：非零退出不够（配置写坏也会非零），必须看到对应规则命中金丝雀；
# 否则视为红线配置失效，脚本以非零退出。临时产物退出时清理，不进 git。
set -euo pipefail
cd "$(dirname "$0")/.."

# expect_hit <临时金丝雀文件> <文件内容> <期望命中的规则名>
expect_hit() {
    local canary_file="$1" content="$2" rule="$3"
    printf '%s\n' "$content" >"$canary_file"
    local output status
    output="$(depcruise packages --config .dependency-cruiser.cjs 2>&1)" && status=0 || status=$?
    rm -f "$canary_file"
    if [[ $status -eq 0 ]]; then
        echo "红线失效：违规未被 dependency-cruiser 拦截（期望规则 $rule）" >&2
        exit 1
    fi
    if ! grep -q "$rule" <<<"$output"; then
        echo "红线失效：depcruise 以非零退出，但没有 $rule 命中（配置可能写坏）：" >&2
        sed -n '1,20p' <<<"$output" >&2
        exit 1
    fi
    echo "红线有效：$rule 拦截成功"
}

# 金丝雀 1：editor → editor-vue 是禁止方向
editor_pkg="packages/canvas-next-editor"
canary="$editor_pkg/src/__guardrail-canary__.ts"
scope_dir="$editor_pkg/node_modules/@hankchen"
fake_link="$scope_dir/canvas-next-editor-vue"

mkdir -p "$scope_dir"
# 与 pnpm workspace 链接同款相对目标（ ../../../ = packages/ 下同级目录）
ln -sfn ../../../canvas-next-editor-vue "$fake_link"
trap 'rm -f "$canary" "$fake_link"' EXIT

expect_hit "$canary" \
    "// 红线金丝雀：editor → editor-vue 是禁止方向（由 scripts/check-guardrails.sh 临时生成）
import '@hankchen/canvas-next-editor-vue'

export {}" \
    "editor-no-binding-layer"

# 金丝雀 2：editor-vue 属性面板域不得横引画布域
expect_hit "packages/canvas-next-editor-vue/src/property-panel/__guardrail-canary__.ts" \
    "// 域纪律金丝雀：property-panel → canvas 横向 import 是禁止方向（由 scripts/check-guardrails.sh 临时生成）
import '../canvas/gizmo'

export {}" \
    "editor-vue-property-panel-isolation"

# 金丝雀 3：内核编辑特性层不得引用 session 会话门面
expect_hit "packages/canvas-next-editor/src/editing/__guardrail-canary__.ts" \
    "// 分层纪律金丝雀：editing → session 是禁止方向（由 scripts/check-guardrails.sh 临时生成）
import '../session/editor'

export {}" \
    "editor-editing-isolation"
