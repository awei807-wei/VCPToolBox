<template>
  <Teleport to="body">
    <Transition name="version-panel">
      <div
        v-if="visible"
        class="version-panel-overlay"
        @click.self="closePanel"
      >
        <aside class="version-panel" role="dialog" aria-label="版本历史">
          <!-- Header -->
          <div class="version-panel__header">
            <div class="version-panel__title">
              <span class="material-symbols-outlined">history</span>
              <h3>版本历史</h3>
              <span v-if="fileName" class="version-panel__file">{{
                fileName
              }}</span>
            </div>
            <button
              type="button"
              class="version-panel__close"
              aria-label="关闭"
              title="关闭"
              @click="closePanel"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Actions -->
          <div class="version-panel__actions">
            <button
              type="button"
              class="btn-primary btn-sm"
              :disabled="isSavingVersion || !fileName"
              @click="openSaveDialog"
            >
              <span class="material-symbols-outlined">save</span>
              保存为新版本
            </button>
            <div class="version-panel__search">
              <span class="material-symbols-outlined">search</span>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索版本、作者或提交信息…"
              />
              <button
                v-if="searchQuery"
                class="search-clear"
                @click="searchQuery = ''"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="version-panel__content">
            <div v-if="isLoading" class="version-panel__loading">
              <span class="material-symbols-outlined spinning">sync</span>
              <p>加载版本历史中…</p>
            </div>

            <div v-else-if="loadError" class="version-panel__empty">
              <span class="material-symbols-outlined">error</span>
              <p>{{ loadError }}</p>
            </div>

            <div
              v-else-if="filteredVersions.length === 0"
              class="version-panel__empty"
            >
              <span class="material-symbols-outlined">history</span>
              <p>{{ searchQuery ? "没有匹配的版本" : "暂无版本历史" }}</p>
            </div>

            <div v-else class="version-list">
              <div
                v-for="ver in filteredVersions"
                :key="ver.version"
                class="version-item card"
                :class="{
                  'version-item--current': ver.version === currentVersion,
                  'version-item--deleted': ver.isDeleted,
                }"
              >
                <div class="version-item__header">
                  <span class="version-item__badge">v{{ ver.version }}</span>
                  <span
                    v-if="ver.version === currentVersion"
                    class="version-item__current-badge"
                    >当前</span
                  >
                  <span v-if="ver.isDeleted" class="version-item__deleted-badge"
                    >已删除</span
                  >
                  <span
                    class="version-item__time"
                    :title="formatFullTime(ver.createdAt)"
                  >
                    {{ formatRelativeTime(ver.createdAt) }}
                  </span>
                </div>

                <div class="version-item__meta">
                  <span class="version-item__author">
                    <span class="material-symbols-outlined">person</span>
                    {{ ver.author || "未知" }}
                  </span>
                  <span v-if="ver.size" class="version-item__size">
                    {{ formatSize(ver.size) }}
                  </span>
                </div>

                <div v-if="ver.commitMessage" class="version-item__message">
                  {{ ver.commitMessage }}
                </div>
                <div v-if="ver.changeSummary" class="version-item__summary">
                  {{ ver.changeSummary }}
                </div>

                <div class="version-item__actions">
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    :disabled="ver.isDeleted"
                    @click="viewVersion(ver.version)"
                  >
                    <span class="material-symbols-outlined">visibility</span>
                    查看
                  </button>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    :disabled="ver.isDeleted || ver.version === currentVersion"
                    @click="rollbackVersion(ver.version)"
                  >
                    <span class="material-symbols-outlined">restore</span>
                    回滚
                  </button>
                  <button
                    type="button"
                    class="btn-danger btn-sm"
                    :disabled="ver.isDeleted || ver.version === currentVersion"
                    @click="deleteVersion(ver.version)"
                  >
                    <span class="material-symbols-outlined">delete</span>
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>

  <!-- Save Version Dialog -->
  <Teleport to="body">
    <Transition name="version-dialog">
      <div
        v-if="showSaveDialog"
        class="version-dialog-overlay"
        @click.self="closeSaveDialog"
      >
        <div class="version-dialog card">
          <h4>保存为新版本</h4>
          <div class="version-dialog__field">
            <label>提交信息（可选）:</label>
            <input
              ref="commitInputRef"
              v-model="commitMessage"
              type="text"
              placeholder="描述本次更改…"
              @keydown.enter.prevent="confirmSaveVersion"
              @keydown.esc="closeSaveDialog"
            />
          </div>
          <div class="version-dialog__actions">
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="closeSaveDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="btn-primary btn-sm"
              :disabled="isSavingVersion"
              @click="confirmSaveVersion"
            >
              <span
                class="material-symbols-outlined"
                :class="{ spinning: isSavingVersion }"
              >
                {{ isSavingVersion ? "sync" : "save" }}
              </span>
              {{ isSavingVersion ? "保存中…" : "保存版本" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  versionApi,
  type VersionInfo,
  type VersionsResponse,
} from "@/api/version";
import { askConfirm } from "@/platform/feedback/feedbackBus";
import { showMessage } from "@/utils";

interface Props {
  module: "agent" | "toolbox" | "tvs";
  fileName: string;
  currentContent: string;
  visible: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "loadVersion", content: string, version: number): void;
  (e: "refresh"): void;
}>();

/* ── State ── */
const isLoading = ref(false);
const isSavingVersion = ref(false);
const loadError = ref("");
const versionsResponse = ref<VersionsResponse | null>(null);
const searchQuery = ref("");
const showSaveDialog = ref(false);
const commitMessage = ref("");
const commitInputRef = ref<HTMLInputElement | null>(null);

/* ── Computed ── */
const currentVersion = computed(
  () => versionsResponse.value?.currentVersion ?? 0
);

const filteredVersions = computed(() => {
  const list = versionsResponse.value?.versions ?? [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (v) =>
      String(v.version).includes(q) ||
      (v.author && v.author.toLowerCase().includes(q)) ||
      (v.commitMessage && v.commitMessage.toLowerCase().includes(q)) ||
      (v.changeSummary && v.changeSummary.toLowerCase().includes(q))
  );
});

/* ── Watch ── */
watch(
  () => [props.visible, props.fileName] as const,
  ([visible, fileName]) => {
    if (visible && fileName) {
      void loadVersions();
    }
  }
);

/* ── API Dispatch ── */
async function loadVersions() {
  if (!props.fileName) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    let response: VersionsResponse;
    switch (props.module) {
      case "agent":
        response = await versionApi.getAgentVersions(props.fileName);
        break;
      case "toolbox":
        response = await versionApi.getToolboxVersions(props.fileName);
        break;
      case "tvs":
        response = await versionApi.getTvsVersions(props.fileName);
        break;
    }
    versionsResponse.value = response;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    loadError.value = `加载失败: ${msg}`;
    showMessage(`加载版本历史失败: ${msg}`, "error");
  } finally {
    isLoading.value = false;
  }
}

async function viewVersion(version: number) {
  if (!props.fileName) return;
  try {
    let response: { content: string; version: number; metadata: VersionInfo };
    switch (props.module) {
      case "agent":
        response = await versionApi.getAgentVersionContent(
          props.fileName,
          version
        );
        break;
      case "toolbox":
        response = await versionApi.getToolboxVersionContent(
          props.fileName,
          version
        );
        break;
      case "tvs":
        response = await versionApi.getTvsVersionContent(
          props.fileName,
          version
        );
        break;
    }
    emit("loadVersion", response.content, response.version);
    showMessage(`已加载版本 v${version}`, "success");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showMessage(`查看版本失败: ${msg}`, "error");
  }
}

async function rollbackVersion(version: number) {
  if (!props.fileName) return;
  const ok = await askConfirm({
    message: `确定要回滚到版本 v${version} 吗？当前内容将被覆盖。`,
    danger: true,
    confirmText: "回滚",
  });
  if (!ok) return;

  try {
    switch (props.module) {
      case "agent":
        await versionApi.rollbackAgentVersion(
          props.fileName,
          version,
          "用户手动回滚"
        );
        break;
      case "toolbox":
        await versionApi.rollbackToolboxVersion(
          props.fileName,
          version,
          "用户手动回滚"
        );
        break;
      case "tvs":
        await versionApi.rollbackTvsVersion(
          props.fileName,
          version,
          "用户手动回滚"
        );
        break;
    }
    showMessage(`已回滚到版本 v${version}`, "success");
    emit("refresh");
    await loadVersions();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showMessage(`回滚失败: ${msg}`, "error");
  }
}

async function deleteVersion(version: number) {
  if (!props.fileName) return;
  const ok = await askConfirm({
    message: `确定要删除版本 v${version} 吗？此操作不可恢复。`,
    danger: true,
    confirmText: "删除",
  });
  if (!ok) return;

  try {
    switch (props.module) {
      case "agent":
        await versionApi.deleteAgentVersion(props.fileName, version);
        break;
      case "toolbox":
        await versionApi.deleteToolboxVersion(props.fileName, version);
        break;
      case "tvs":
        await versionApi.deleteTvsVersion(props.fileName, version);
        break;
    }
    showMessage(`版本 v${version} 已删除`, "success");
    await loadVersions();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showMessage(`删除失败: ${msg}`, "error");
  }
}

async function confirmSaveVersion() {
  if (!props.fileName || isSavingVersion.value) return;
  isSavingVersion.value = true;
  try {
    switch (props.module) {
      case "agent":
        await versionApi.createAgentVersion(
          props.fileName,
          props.currentContent,
          commitMessage.value || undefined
        );
        break;
      case "toolbox":
        await versionApi.createToolboxVersion(
          props.fileName,
          props.currentContent,
          commitMessage.value || undefined
        );
        break;
      case "tvs":
        await versionApi.createTvsVersion(
          props.fileName,
          props.currentContent,
          commitMessage.value || undefined
        );
        break;
    }
    showMessage("新版本已保存", "success");
    closeSaveDialog();
    await loadVersions();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showMessage(`保存版本失败: ${msg}`, "error");
  } finally {
    isSavingVersion.value = false;
  }
}

/* ── Dialog ── */
function openSaveDialog() {
  commitMessage.value = "";
  showSaveDialog.value = true;
  void nextTick(() => commitInputRef.value?.focus());
}

function closeSaveDialog() {
  showSaveDialog.value = false;
}

function closePanel() {
  emit("update:visible", false);
}

/* ── Formatters ── */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} 个月前`;
  return `${Math.floor(diffMonth / 12)} 年前`;
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
.version-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: var(--overlay-backdrop-strong, rgba(0, 0, 0, 0.5));
  display: flex;
  justify-content: flex-end;
}

.version-panel {
  width: 420px;
  max-width: 100vw;
  height: 100%;
  background: var(--secondary-bg);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
}

.version-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.version-panel__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.version-panel__title h3 {
  margin: 0;
  font-size: var(--font-size-emphasis);
  color: var(--primary-text);
}

.version-panel__title .material-symbols-outlined {
  color: var(--highlight-text);
  font-size: var(--font-size-emphasis) !important;
}

.version-panel__file {
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.version-panel__close {
  background: none;
  border: none;
  color: var(--secondary-text);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.version-panel__close:hover {
  color: var(--primary-text);
  background: var(--tertiary-bg);
}

.version-panel__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.version-panel__search {
  position: relative;
  display: flex;
  align-items: center;
}

.version-panel__search .material-symbols-outlined {
  position: absolute;
  left: 10px;
  font-size: 18px !important;
  color: var(--secondary-text);
  pointer-events: none;
}

.version-panel__search input {
  width: 100%;
  padding: 8px 32px 8px 36px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--primary-text);
  font-size: var(--font-size-body);
  font-family: inherit;
}

.version-panel__search input:focus-visible {
  outline: 2px solid var(--highlight-text);
  outline-offset: 2px;
  border-color: var(--highlight-text);
}

.version-panel__search .search-clear {
  position: absolute;
  right: 4px;
  background: none;
  border: none;
  color: var(--secondary-text);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
}

.version-panel__search .search-clear:hover {
  color: var(--primary-text);
}

.version-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  min-height: 0;
}

.version-panel__loading,
.version-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-9) var(--space-4);
  color: var(--secondary-text);
  text-align: center;
}

.version-panel__loading .material-symbols-outlined,
.version-panel__empty .material-symbols-outlined {
  font-size: 40px !important;
  opacity: 0.4;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.version-item {
  padding: var(--space-4);
  transition: box-shadow 0.2s ease;
}

.version-item--current {
  border-color: var(--highlight-text);
  box-shadow: 0 0 0 1px var(--highlight-text);
}

.version-item--deleted {
  opacity: 0.6;
}

.version-item__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}

.version-item__badge {
  font-family: var(--font-mono);
  font-size: var(--font-size-helper);
  font-weight: 700;
  color: var(--highlight-text);
  background: color-mix(in srgb, var(--highlight-text) 14%, transparent);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.version-item__current-badge {
  font-size: var(--font-size-caption);
  font-weight: 600;
  color: var(--success-text);
  background: var(--success-bg);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.version-item__deleted-badge {
  font-size: var(--font-size-caption);
  font-weight: 600;
  color: var(--danger-text);
  background: var(--danger-bg);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.version-item__time {
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
  margin-left: auto;
}

.version-item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}

.version-item__author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
}

.version-item__author .material-symbols-outlined {
  font-size: 14px !important;
}

.version-item__size {
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
  font-family: var(--font-mono);
}

.version-item__message {
  font-size: var(--font-size-body);
  color: var(--primary-text);
  margin-bottom: var(--space-1);
  word-break: break-word;
}

.version-item__summary {
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
  margin-bottom: var(--space-2);
  word-break: break-word;
}

.version-item__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-2);
}

.version-item__actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Dialog */
.version-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--overlay-backdrop-strong, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.version-dialog {
  width: 100%;
  max-width: 420px;
  padding: var(--space-5);
}

.version-dialog h4 {
  margin: 0 0 var(--space-4) 0;
  font-size: var(--font-size-emphasis);
  color: var(--primary-text);
}

.version-dialog__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.version-dialog__field label {
  font-size: var(--font-size-helper);
  color: var(--secondary-text);
  font-weight: 500;
}

.version-dialog__field input {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--primary-text);
  font-size: var(--font-size-body);
  font-family: inherit;
}

.version-dialog__field input:focus-visible {
  outline: 2px solid var(--highlight-text);
  outline-offset: 2px;
  border-color: var(--highlight-text);
}

.version-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* Transitions */
.version-panel-enter-active,
.version-panel-leave-active {
  transition: opacity 0.25s ease;
}

.version-panel-enter-active .version-panel,
.version-panel-leave-active .version-panel {
  transition: transform 0.25s ease;
}

.version-panel-enter-from,
.version-panel-leave-to {
  opacity: 0;
}

.version-panel-enter-from .version-panel,
.version-panel-leave-to .version-panel {
  transform: translateX(100%);
}

.version-dialog-enter-active,
.version-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.version-dialog-enter-from,
.version-dialog-leave-to {
  opacity: 0;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .version-panel {
    width: 100%;
  }

  .version-panel__file {
    display: none;
  }
}
</style>
