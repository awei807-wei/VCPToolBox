const express = require("express");
const fs = require("fs").promises;
const path = require("path");

module.exports = function (options) {
  const router = express.Router();
  const versionManager = require("../../modules/versionManager");
  const MODULE_NAME = "tvs";
  const { tvsDirPath } = options;
  const TVS_FILES_DIR = tvsDirPath;

  versionManager.setModuleBaseDir(MODULE_NAME, TVS_FILES_DIR);

  // GET list of TVS files
  router.get("/tvsvars", async (req, res) => {
    try {
      await fs.mkdir(TVS_FILES_DIR, { recursive: true });
      const files = await fs.readdir(TVS_FILES_DIR);
      const txtFiles = files.filter((file) =>
        file.toLowerCase().endsWith(".txt")
      );
      res.json({ files: txtFiles });
    } catch (error) {
      console.error("[AdminPanelRoutes API] Error listing TVS files:", error);
      res
        .status(500)
        .json({ error: "Failed to list TVS files", details: error.message });
    }
  });

  // GET specific TVS file content
  router.get("/tvsvars/:fileName", async (req, res) => {
    const { fileName } = req.params;
    if (!fileName.toLowerCase().endsWith(".txt")) {
      return res
        .status(400)
        .json({ error: "Invalid file name. Must be a .txt file." });
    }
    const filePath = path.join(TVS_FILES_DIR, fileName);
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, "utf-8");
      res.json({ content });
    } catch (error) {
      if (error.code === "ENOENT")
        res.status(404).json({ error: "TVS file not found." });
      else
        res
          .status(500)
          .json({ error: "Failed to read TVS file", details: error.message });
    }
  });

  // POST save specific TVS file content
  router.post("/tvsvars/:fileName", async (req, res) => {
    const { fileName } = req.params;
    const { content } = req.body;
    if (!fileName.toLowerCase().endsWith(".txt")) {
      return res.status(400).json({ error: "Invalid file name." });
    }
    if (typeof content !== "string")
      return res.status(400).json({ error: "Invalid request body." });
    const filePath = path.join(TVS_FILES_DIR, fileName);
    try {
      await fs.mkdir(TVS_FILES_DIR, { recursive: true });
      // 如果版本历史为空，先自动创建 v1 基线（保留原始内容）
      try {
        await versionManager.ensureBaseline(MODULE_NAME, fileName);
      } catch (e) {
        // 忽略基线创建失败，不影响保存主流程
      }
      await fs.writeFile(filePath, content, "utf-8");
      res.json({ message: `TVS file '${fileName}' saved successfully.` });
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to save TVS file", details: error.message });
    }
  });

  // DELETE specific TVS file
  router.delete("/tvsvars/:fileName", async (req, res) => {
    const { fileName } = req.params;
    if (!fileName.toLowerCase().endsWith(".txt")) {
      return res.status(400).json({ error: "Invalid file name." });
    }

    const filePath = path.join(TVS_FILES_DIR, fileName);
    try {
      await fs.unlink(filePath);
      res.json({ message: `TVS file '${fileName}' deleted successfully.` });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "TVS file not found." });
      }
      res
        .status(500)
        .json({ error: "Failed to delete TVS file", details: error.message });
    }
  });

  // GET TVS file versions
  router.get("/tvsvars/:fileName/versions", async (req, res) => {
    try {
      const { fileName } = req.params;
      const result = await versionManager.getVersions(MODULE_NAME, fileName);
      res.json({ success: true, data: result });
    } catch (error) {
      if (error.code === "ENOENT" || error.message === "No versions found") {
        res.json({
          success: true,
          data: { currentVersion: 0, versions: [], auditLog: [] },
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to get versions",
          details: error.message,
        });
      }
    }
  });

  // POST create TVS file version
  router.post("/tvsvars/:fileName/versions", async (req, res) => {
    try {
      const { fileName } = req.params;
      const { content, commitMessage, author } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request body. Content is required.",
        });
      }
      const result = await versionManager.createVersion(
        MODULE_NAME,
        fileName,
        content,
        { author, commitMessage }
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to create version",
        details: error.message,
      });
    }
  });

  // GET specific TVS file version content
  router.get("/tvsvars/:fileName/versions/:version", async (req, res) => {
    try {
      const { fileName } = req.params;
      const version = parseInt(req.params.version, 10);
      if (isNaN(version)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid version number." });
      }
      const result = await versionManager.getVersionContent(
        MODULE_NAME,
        fileName,
        version
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get version content",
        details: error.message,
      });
    }
  });

  // POST rollback TVS file to specific version
  router.post(
    "/tvsvars/:fileName/versions/:version/rollback",
    async (req, res) => {
      try {
        const { fileName } = req.params;
        const version = parseInt(req.params.version, 10);
        if (isNaN(version)) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid version number." });
        }
        const { reason, author } = req.body || {};
        const result = await versionManager.rollback(
          MODULE_NAME,
          fileName,
          version,
          { author, reason }
        );
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: "Failed to rollback version",
          details: error.message,
        });
      }
    }
  );

  // DELETE specific TVS file version
  router.delete("/tvsvars/:fileName/versions/:version", async (req, res) => {
    try {
      const { fileName } = req.params;
      const version = parseInt(req.params.version, 10);
      if (isNaN(version)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid version number." });
      }
      const { author } = req.body || {};
      await versionManager.deleteVersion(MODULE_NAME, fileName, version, {
        author,
      });
      res.json({ success: true, message: "Version deleted" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to delete version",
        details: error.message,
      });
    }
  });

  return router;
};
