<script setup lang="ts">
// 工单 01 目验壳：导入四个 workspace 包证明装配链路，页面只显示空画布占位。
// 工单 02 起这里换成「打开硬编码 graph → 画叠放矩形盒」。
import { PACKAGE_NAME as canvasNextName } from '@hankchen/canvas-next'
import { PACKAGE_NAME as rendererName } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as editorName } from '@hankchen/canvas-next-editor'
import { PACKAGE_NAME as editorVueName } from '@hankchen/canvas-next-editor-vue'

const wiredPackages = [canvasNextName, rendererName, editorName, editorVueName]
</script>

<template>
    <main class="stage">
        <section class="canvas-placeholder" aria-label="空画布占位">
            <p class="title">空画布</p>
            <p class="hint">graph 打开与矩形盒渲染将在工单 02 接入</p>
            <ul class="wiring">
                <li v-for="name in wiredPackages" :key="name">{{ name }}</li>
            </ul>
        </section>
    </main>
</template>

<style scoped>
.stage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    background: #f5f6f8;
}

.canvas-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: min(640px, 80vw);
    aspect-ratio: 4 / 3;
    border: 2px dashed #b9c0cc;
    border-radius: 12px;
    background: #fff;
    color: #6b7280;
    font-family: system-ui, sans-serif;
}

.title {
    margin: 0;
    font-size: 20px;
    color: #374151;
}

.hint {
    margin: 0;
    font-size: 13px;
}

.wiring {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    font-size: 11px;
    color: #9ca3af;
}

.wiring li {
    padding: 2px 8px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
}
</style>
