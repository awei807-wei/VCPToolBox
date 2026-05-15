import {
  requestWithUi,
  type RequestUiOptions,
} from "./requestWithUi";

const DEFAULT_READ_UI_OPTIONS: RequestUiOptions = { showLoader: false };

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface VersionInfo {
  version: number;
  hash: string;
  author: string;
  commitMessage: string;
  changeSummary: string;
  createdAt: string;
  size: number;
  isDeleted: boolean;
}

export interface AuditLogEntry {
  action: 'create' | 'rollback' | 'delete' | 'view';
  version: number;
  actor: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface VersionsResponse {
  currentVersion: number;
  versions: VersionInfo[];
  auditLog: AuditLogEntry[];
}

export interface VersionContentResponse {
  content: string;
  version: number;
  metadata: VersionInfo;
}

export const versionApi = {
  // === agents ===
  async getAgentVersions(fileName: string, uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS): Promise<VersionsResponse> {
    const response = await requestWithUi<ApiResponse<VersionsResponse>>(
      { url: `/admin_api/agents/${encodeURIComponent(fileName)}/versions` },
      uiOptions
    );
    return response.data;
  },

  async createAgentVersion(
    fileName: string,
    content: string,
    commitMessage?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/agents/${encodeURIComponent(fileName)}/versions`,
        method: "POST",
        body: { content, commitMessage },
      },
      uiOptions
    );
  },

  async getAgentVersionContent(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS
  ): Promise<VersionContentResponse> {
    const response = await requestWithUi<ApiResponse<VersionContentResponse>>(
      { url: `/admin_api/agents/${encodeURIComponent(fileName)}/versions/${version}` },
      uiOptions
    );
    return response.data;
  },

  async rollbackAgentVersion(
    fileName: string,
    version: number,
    reason?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/agents/${encodeURIComponent(fileName)}/versions/${version}/rollback`,
        method: "POST",
        body: { reason },
      },
      uiOptions
    );
  },

  async deleteAgentVersion(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/agents/${encodeURIComponent(fileName)}/versions/${version}`,
        method: "DELETE",
      },
      uiOptions
    );
  },

  // === toolbox ===
  async getToolboxVersions(fileName: string, uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS): Promise<VersionsResponse> {
    const response = await requestWithUi<ApiResponse<VersionsResponse>>(
      { url: `/admin_api/toolbox/file/${encodeURIComponent(fileName)}/versions` },
      uiOptions
    );
    return response.data;
  },

  async createToolboxVersion(
    fileName: string,
    content: string,
    commitMessage?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/toolbox/file/${encodeURIComponent(fileName)}/versions`,
        method: "POST",
        body: { content, commitMessage },
      },
      uiOptions
    );
  },

  async getToolboxVersionContent(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS
  ): Promise<VersionContentResponse> {
    const response = await requestWithUi<ApiResponse<VersionContentResponse>>(
      { url: `/admin_api/toolbox/file/${encodeURIComponent(fileName)}/versions/${version}` },
      uiOptions
    );
    return response.data;
  },

  async rollbackToolboxVersion(
    fileName: string,
    version: number,
    reason?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/toolbox/file/${encodeURIComponent(fileName)}/versions/${version}/rollback`,
        method: "POST",
        body: { reason },
      },
      uiOptions
    );
  },

  async deleteToolboxVersion(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/toolbox/file/${encodeURIComponent(fileName)}/versions/${version}`,
        method: "DELETE",
      },
      uiOptions
    );
  },

  // === tvs ===
  async getTvsVersions(fileName: string, uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS): Promise<VersionsResponse> {
    const response = await requestWithUi<ApiResponse<VersionsResponse>>(
      { url: `/admin_api/tvsvars/${encodeURIComponent(fileName)}/versions` },
      uiOptions
    );
    return response.data;
  },

  async createTvsVersion(
    fileName: string,
    content: string,
    commitMessage?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/tvsvars/${encodeURIComponent(fileName)}/versions`,
        method: "POST",
        body: { content, commitMessage },
      },
      uiOptions
    );
  },

  async getTvsVersionContent(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = DEFAULT_READ_UI_OPTIONS
  ): Promise<VersionContentResponse> {
    const response = await requestWithUi<ApiResponse<VersionContentResponse>>(
      { url: `/admin_api/tvsvars/${encodeURIComponent(fileName)}/versions/${version}` },
      uiOptions
    );
    return response.data;
  },

  async rollbackTvsVersion(
    fileName: string,
    version: number,
    reason?: string,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/tvsvars/${encodeURIComponent(fileName)}/versions/${version}/rollback`,
        method: "POST",
        body: { reason },
      },
      uiOptions
    );
  },

  async deleteTvsVersion(
    fileName: string,
    version: number,
    uiOptions: RequestUiOptions = {}
  ): Promise<void> {
    await requestWithUi<ApiResponse<unknown>>(
      {
        url: `/admin_api/tvsvars/${encodeURIComponent(fileName)}/versions/${version}`,
        method: "DELETE",
      },
      uiOptions
    );
  },
};
