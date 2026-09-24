#!/usr/bin/env bash
# 红线自验（工单 01）：故意制造一条 editor → editor-vue 的违规依赖，
# dependency-cruiser 必须以 editor-no-binding-layer 规则抓住它。
#
# pnpm 严格隔离下，未在 package.json 声明的依赖连 symlink 都没有、import
# 在解析层就失败（那由 unresolved-dependency 规则兜底）。这里手动补上
# editor-vue 的链接，模拟「有人把错误依赖真的声明进 package.json」后的
# 最坏情形——此时必须由方向规则拦下。
#
# 判定从严：非零退出不够（配置写坏也会非零），必须看到该规则命中金丝雀；
# 否则视为红线配置失效，脚本以非零退出。临时产物退出时清理，不进 git。
set -euo pipefail
cd "$(dirname "$0")/.."

editor_pkg="packages/canvas-next-editor"
canary="$editor_pkg/src/__guardrail-canary__.ts"
scope_dir="$editor_pkg/node_modules/@hankchen"
fake_link="$scope_dir/canvas-next-editor-vue"

cat >"$canary" <<'EOF'
// 红线金丝雀：editor → editor-vue 是禁止方向（由 scripts/check-guardrails.sh 临时生成）
import '@hankchen/canvas-next-editor-vue'

export {}
EOF

mkdir -p "$scope_dir"
# 与 pnpm workspace 链接同款相对目标（ ../../../ = packages/ 下同级目录）
ln -sfn ../../../canvas-next-editor-vue "$fake_link"

trap 'rm -f "$canary" "$fake_link"' EXIT

output="$(depcruise packages --config .dependency-cruiser.cjs 2>&1)" && status=0 || status=$?

if [[ $status -eq 0 ]]; then
    echo "红线失效：editor → editor-vue 违规未被 dependency-cruiser 拦截" >&2
    exit 1
fi

if ! grep -q "editor-no-binding-layer" <<<"$output"; then
    echo "红线失效：depcruise 以非零退出，但没有 editor-no-binding-layer 规则命中（配置可能写坏）：" >&2
    sed -n '1,20p' <<<"$output" >&2
    exit 1
fi

echo "红线有效：editor → editor-vue 违规被 editor-no-binding-layer 规则拦截"
