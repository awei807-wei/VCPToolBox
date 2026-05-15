// modules/versionManager.js
// 纯文件系统的版本管理核心模块
// 不依赖数据库，所有数据用 JSON 文件存储在 .vcp_versions/ 目录中

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * VersionManager 类
 * 为文本文件提供基于文件系统的版本管理功能。
 * 支持 agents、toolbox、tvs 三个模块，每个文件独立版本管理，不做分支。
 */
class VersionManager {
  /**
   * 构造函数
   * @param {string} versionsBaseDir - 版本数据根目录，默认项目根目录下的 .vcp_versions/
   */
  constructor(versionsBaseDir = path.join(__dirname, "..", ".vcp_versions")) {
    this.versionsBaseDir = versionsBaseDir;
    this.baseDirs = new Map();
  }

  /**
   * 设置模块的原始文件根目录，用于 rollback 时回写原文件。
   * @param {string} moduleName - 模块名
   * @param {string} baseDir - 原始文件根目录的绝对路径
   */
  setModuleBaseDir(moduleName, baseDir) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!baseDir || typeof baseDir !== "string") {
      throw new Error("[VersionManager] baseDir must be a non-empty string");
    }
    this.baseDirs.set(moduleName, baseDir);
  }

  /**
   * 内部辅助方法：获取指定模块和文件的版本目录路径。
   * 目录结构：.vcp_versions/{moduleName}/{filePath}/
   * 注意：filePath 本身会作为目录层级的一部分，其最后一段文件名会被当作目录名。
   * @param {string} moduleName - 模块名（agents、toolbox、tvs）
   * @param {string} filePath - 文件相对路径（如 "Agent/prompt.txt"）
   * @returns {string} 版本目录的绝对路径
   */
  _getVersionDir(moduleName, filePath) {
    // 标准化路径分隔符，防止跨平台问题
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    // 路径穿越防护：禁止 .. 段
    const segments = normalizedFilePath.split("/");
    if (segments.some((seg) => seg === "..")) {
      throw new Error(
        `[VersionManager] Invalid filePath: path traversal detected in "${filePath}"`
      );
    }
    return path.join(this.versionsBaseDir, moduleName, normalizedFilePath);
  }

  /**
   * 内部辅助方法：计算内容的 SHA-256 哈希值。
   * @param {string} content - 文本内容
   * @returns {string} sha256: 开头的哈希字符串
   */
  _computeHash(content) {
    const hash = crypto
      .createHash("sha256")
      .update(content, "utf8")
      .digest("hex");
    return `sha256:${hash}`;
  }

  /**
   * 内部辅助方法：计算行级变更摘要。
   * 格式为 "+新增行数 -删除行数"，基于简单行级 diff。
   * @param {string|null} oldContent - 旧内容（首次创建时为 null）
   * @param {string} newContent - 新内容
   * @returns {string} 变更摘要，如 "+5 -2"
   */
  _computeChangeSummary(oldContent, newContent) {
    const oldLines = oldContent ? oldContent.split("\n") : [];
    const newLines = newContent ? newContent.split("\n") : [];

    // 简单算法：基于最长公共子序列（LCS）的行级 diff
    // 为了性能和可维护性，这里使用动态规划计算 LCS 长度
    const m = oldLines.length;
    const n = newLines.length;

    // 使用一维数组优化空间
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      // 交换 prev 和 curr
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }

    const lcsLength = prev[n];
    const added = n - lcsLength;
    const removed = m - lcsLength;

    return `+${added} -${removed}`;
  }

  /**
   * 内部辅助方法：生成版本文件名。
   * 格式：v{四位版本号}_{ISO时间戳}.json
   * @param {number} version - 版本号
   * @param {Date} timestamp - 时间戳
   * @returns {string} 版本文件名
   */
  _generateVersionFilename(version, timestamp) {
    const isoString = timestamp
      .toISOString()
      .replace(/[-:]/g, "") // 去掉 - 和 :
      .replace(/\..+/, ""); // 去掉毫秒和小数点
    const versionStr = String(version).padStart(4, "0");
    return `v${versionStr}_${isoString}Z.json`;
  }

  /**
   * 内部辅助方法：读取或初始化 _index.json。
   * @param {string} versionDir - 版本目录路径
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} _index.json 的内容对象
   */
  async _loadIndex(versionDir, moduleName, filePath) {
    const indexPath = path.join(versionDir, "_index.json");
    try {
      const content = await fs.readFile(indexPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        // 文件不存在，返回默认结构
        return {
          filePath: filePath,
          module: moduleName,
          currentVersion: 0,
          versions: [],
          auditLog: [],
        };
      }
      throw error;
    }
  }

  /**
   * 内部辅助方法：保存 _index.json。
   * @param {string} versionDir - 版本目录路径
   * @param {Object} indexData - _index.json 数据对象
   */
  async _saveIndex(versionDir, indexData) {
    const indexPath = path.join(versionDir, "_index.json");
    // 确保目录存在
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 4), "utf8");
  }

  /**
   * 内部辅助方法：保存版本内容文件。
   * @param {string} versionDir - 版本目录路径
   * @param {string} filename - 版本文件名
   * @param {Object} versionData - 版本数据对象（包含 content、metadata 等）
   */
  async _saveVersionFile(versionDir, filename, versionData) {
    const filePath = path.join(versionDir, filename);
    // 确保目录存在（文件名作为目录时，其上层目录可能不存在）
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(versionData, null, 4), "utf8");
  }

  /**
   * 内部辅助方法：读取版本内容文件。
   * @param {string} versionDir - 版本目录路径
   * @param {string} filename - 版本文件名
   * @returns {Promise<Object>} 版本数据对象
   */
  async _loadVersionFile(versionDir, filename) {
    const filePath = path.join(versionDir, filename);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  }

  /**
   * 创建新版本。
   * @param {string} moduleName - 模块名（agents、toolbox、tvs）
   * @param {string} filePath - 文件相对路径（如 "Agent/prompt.txt"）
   * @param {string} content - 文件内容
   * @param {Object} metadata - 元数据，可选 { author?, commitMessage? }
   * @returns {Promise<Object>} { version, hash, createdAt }
   */
  async createVersion(moduleName, filePath, content, metadata = {}) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }
    if (typeof content !== "string") {
      throw new Error("[VersionManager] content must be a string");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);

    const author = metadata.author || "admin";
    const commitMessage = metadata.commitMessage || "";
    const timestamp = new Date();
    const maxExistingVersion = index.versions.reduce(
      (max, v) => Math.max(max, v.version),
      0
    );
    const newVersionNumber =
      Math.max(index.currentVersion, maxExistingVersion) + 1;

    // 计算 hash
    const hash = this._computeHash(content);

    // 计算 changeSummary
    let changeSummary = "+0 -0";
    if (index.versions.length > 0) {
      // 找到上一个未删除的版本的内容
      const prevVersion = [...index.versions]
        .reverse()
        .find((v) => !v.isDeleted);
      if (prevVersion) {
        try {
          const prevFilename = this._generateVersionFilename(
            prevVersion.version,
            new Date(prevVersion.createdAt)
          );
          const prevData = await this._loadVersionFile(
            versionDir,
            prevFilename
          );
          changeSummary = this._computeChangeSummary(prevData.content, content);
        } catch (e) {
          // 如果读取旧版本失败，保守地标记为未知
          changeSummary = "+? -?";
        }
      }
    }

    // 生成版本文件名
    const filename = this._generateVersionFilename(newVersionNumber, timestamp);

    // 版本元数据
    const versionMeta = {
      version: newVersionNumber,
      hash: hash,
      author: author,
      commitMessage: commitMessage,
      changeSummary: changeSummary,
      createdAt: timestamp.toISOString(),
      size: Buffer.byteLength(content, "utf8"),
      isDeleted: false,
    };

    // 保存版本内容文件
    const versionData = {
      content: content,
      version: newVersionNumber,
      metadata: { ...versionMeta },
    };
    await this._saveVersionFile(versionDir, filename, versionData);

    // 更新 index
    index.currentVersion = newVersionNumber;
    index.versions.push(versionMeta);

    // 追加审计日志
    index.auditLog.push({
      action: "create",
      version: newVersionNumber,
      actor: author,
      timestamp: timestamp.toISOString(),
      details: {
        commitMessage: commitMessage,
        fromVersion:
          index.versions.length > 1
            ? index.versions[index.versions.length - 2].version
            : null,
        changeSummary: changeSummary,
      },
    });

    await this._saveIndex(versionDir, index);

    return {
      version: newVersionNumber,
      hash: hash,
      createdAt: timestamp.toISOString(),
    };
  }

  /**
   * 确保文件存在 v1 基线版本。
   * 如果版本历史为空且原始文件存在，自动创建 v1 基线。
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否创建了基线
   */
  async ensureBaseline(moduleName, filePath) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);
    if (index.versions.length > 0) {
      return false;
    }

    const baseDir = this.baseDirs.get(moduleName);
    if (!baseDir) {
      return false;
    }

    const originalFilePath = path.join(baseDir, filePath);
    try {
      await fs.access(originalFilePath);
      const content = await fs.readFile(originalFilePath, "utf8");
      await this.createVersion(moduleName, filePath, content, {
        author: "system",
        commitMessage: "Auto baseline from existing file",
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取某文件的所有版本（不含已删除的）。
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} { currentVersion, versions: [], auditLog: [] }
   */
  async getVersions(moduleName, filePath) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);

    // 自动基线：如果版本历史为空且原始文件存在，自动创建 v1 基线
    const baselineCreated = await this.ensureBaseline(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);

    // 过滤掉已删除的版本
    const activeVersions = index.versions.filter((v) => !v.isDeleted);

    return {
      currentVersion: index.currentVersion,
      versions: activeVersions,
      auditLog: index.auditLog,
    };
  }

  /**
   * 获取指定版本的完整内容。
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @param {number} version - 版本号
   * @returns {Promise<Object>} { content, version, metadata }
   */
  async getVersionContent(moduleName, filePath, version) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("[VersionManager] version must be a positive integer");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);

    // 查找版本元数据
    const versionMeta = index.versions.find((v) => v.version === version);
    if (!versionMeta) {
      throw new Error(
        `[VersionManager] Version ${version} not found for ${moduleName}/${filePath}`
      );
    }

    // 即使标记为删除，也允许读取内容（审计需求）
    const filename = this._generateVersionFilename(
      version,
      new Date(versionMeta.createdAt)
    );
    const versionData = await this._loadVersionFile(versionDir, filename);

    return {
      content: versionData.content,
      version: versionData.version,
      metadata: { ...versionMeta },
    };
  }

  /**
   * 回滚：恢复到指定版本，直接修改 currentVersion 而不创建新版本。
   * auditLog 记录 action: "rollback"。
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @param {number} version - 要回滚到的版本号
   * @param {Object} metadata - 元数据，可选 { author?, reason? }
   * @returns {Promise<Object>} { rolledBackTo }
   */
  async rollback(moduleName, filePath, version, metadata = {}) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("[VersionManager] version must be a positive integer");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);

    // 查找目标版本
    const targetVersionMeta = index.versions.find((v) => v.version === version);
    if (!targetVersionMeta) {
      throw new Error(
        `[VersionManager] Cannot rollback: version ${version} not found for ${moduleName}/${filePath}`
      );
    }

    // 读取目标版本内容
    const targetFilename = this._generateVersionFilename(
      version,
      new Date(targetVersionMeta.createdAt)
    );
    const targetData = await this._loadVersionFile(versionDir, targetFilename);

    const author = metadata.author || "admin";
    const reason = metadata.reason || "";
    const timestamp = new Date();

    // 直接设置 currentVersion 为目标版本号
    index.currentVersion = version;

    // 追加审计日志
    index.auditLog.push({
      action: "rollback",
      version: version,
      actor: author,
      timestamp: timestamp.toISOString(),
      details: {
        fromVersion: version,
        reason: reason,
      },
    });

    await this._saveIndex(versionDir, index);

    // 回写原始文件（如果已注册 baseDir）
    const baseDir = this.baseDirs.get(moduleName);
    if (baseDir) {
      const originalFilePath = path.join(baseDir, filePath);
      await fs.mkdir(path.dirname(originalFilePath), { recursive: true });
      await fs.writeFile(originalFilePath, targetData.content, "utf8");
    }

    return {
      rolledBackTo: version,
    };
  }

  /**
   * 删除版本（标记删除，保留审计链）。
   * 物理文件保留，isDeleted 标记为 true。
   * @param {string} moduleName - 模块名
   * @param {string} filePath - 文件路径
   * @param {number} version - 要删除的版本号
   * @param {Object} metadata - 元数据，可选 { author? }
   * @returns {Promise<Object>} { success: true }
   */
  async deleteVersion(moduleName, filePath, version, metadata = {}) {
    if (!moduleName || typeof moduleName !== "string") {
      throw new Error("[VersionManager] moduleName must be a non-empty string");
    }
    if (!filePath || typeof filePath !== "string") {
      throw new Error("[VersionManager] filePath must be a non-empty string");
    }
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("[VersionManager] version must be a positive integer");
    }

    const versionDir = this._getVersionDir(moduleName, filePath);
    const index = await this._loadIndex(versionDir, moduleName, filePath);

    // 查找目标版本
    const versionMeta = index.versions.find((v) => v.version === version);
    if (!versionMeta) {
      throw new Error(
        `[VersionManager] Cannot delete: version ${version} not found for ${moduleName}/${filePath}`
      );
    }
    // 禁止删除当前版本
    if (version === index.currentVersion) {
      throw new Error(
        `[VersionManager] Cannot delete: version ${version} is the current version for ${moduleName}/${filePath}`
      );
    }

    // 如果已经是删除状态，直接返回
    if (versionMeta.isDeleted) {
      return { success: true };
    }

    const author = metadata.author || "admin";
    const timestamp = new Date();

    // 标记删除
    versionMeta.isDeleted = true;

    // 追加审计日志
    index.auditLog.push({
      action: "delete",
      version: version,
      actor: author,
      timestamp: timestamp.toISOString(),
      details: {
        previousState: "active",
      },
    });

    await this._saveIndex(versionDir, index);

    return { success: true };
  }
}

// 导出单例实例
const versionManager = new VersionManager();
module.exports = versionManager;
