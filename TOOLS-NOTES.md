# Git MCP 代码同步标准流程

Git MCP: `http://43.156.46.187:3082`
Raw 端口: `3088`（无 64KB 限制，大文件用）

## 核心工具

| 工具 | 功能 | 方向 |
|------|------|------|
| `git__repo_list` | 列出所有项目 | - |
| `git__repo_info(repo="xxx")` | 查看项目详情 | - |
| `git__git_clone(repo="xxx")` | GitHub → MCP | GitHub → MCP |
| `git__git_pull(repo="xxx")` | 从 GitHub 拉取更新 | GitHub → MCP |
| `git__git_push(repo="xxx", message="...")` | 提交代码到 MCP 本地 | Agent → MCP |
| `git__git_sync(repo="xxx")` | 推送 MCP 本地到 GitHub | MCP → GitHub |
| `git__code_export(repo="xxx")` | 获取下载 URL | MCP → Agent |
| `git__code_upload(team="xxx")` | 获取上传 URL | MCP → Agent |

## 流程 1：新建项目并推送代码

```
# Step 1: 在 GitHub 创建空仓库
git__git_create_repo(name="my-project", description="描述")

# Step 2: 注册到 Git MCP
git__repo_register(name="my-project", github_url="https://github.com/sftgroup/my-project")

# Step 3: Clone 到 MCP 本地
git__git_clone(repo="my-project")

# Step 4: 获取上传 URL，直接上传 tar.gz（不限大小）
git__code_upload(team="my-project")
→ 返回: { upload_url: "http://43.156.46.187:3088/raw-upload/my-project" }
exec: tar czf /tmp/upload.tar.gz -C workspace/my-project . && curl --data-binary @/tmp/upload.tar.gz {upload_url}

# Step 5: Commit + Push
git__git_push(repo="my-project", message="init: initial commit")
git__git_sync(repo="my-project")
```

## 流程 2：从 MCP 拉代码到本地

```
# Step 1: 获取下载链接
git__code_export(repo="my-project")
→ 返回: { download_url: "http://43.156.46.187:3088/raw/my-project" }

# Step 2: 下载并解压（exec curl，无大小限制）
exec: curl -o /tmp/my-project.tar.gz http://43.156.46.187:3088/raw/my-project
exec: mkdir -p workspace/my-project && tar xzf /tmp/my-project.tar.gz -C workspace/my-project
```

## 流程 3：本地改完上传并同步

```
# Step 1: 打包代码
exec: cd workspace/my-project && tar czf /tmp/upload.tar.gz .

# Step 2: 获取上传 URL
git__code_upload(team="my-project")
→ 返回: { upload_url: "http://43.156.46.187:3088/raw-upload/my-project" }

# Step 3: 上传（不走 MCP，无大小限制）
exec: curl --data-binary @/tmp/upload.tar.gz http://43.156.46.187:3088/raw-upload/my-project

# Step 4: Commit + Push
git__git_push(repo="my-project", message="feat: xxx")
git__git_sync(repo="my-project")
```

## 流程 4：GitHub 更新同步到本地

```
# Step 1: 从 GitHub 拉取
git__git_pull(repo="my-project")

# Step 2: 下载到本地
git__code_export(repo="my-project")
exec: curl -o /tmp/my-project.tar.gz http://43.156.46.187:3088/raw/my-project
exec: tar xzf /tmp/my-project.tar.gz -C workspace/my-project
```

## 注意事项

1. **大文件用 raw 端口 3088**。`code_export` 返回 download_url，`code_upload` 返回 upload_url，用 `exec curl` 传输，不受 MCP SSE 64KB 限制。
2. **小文件（<48KB）**可以走 MCP 内联 base64（`code_upload` 传 `data` 字段），但推荐统一用 raw 端口。
3. **测试服务器同步**：Agent 拿到代码后，用 SSH/scp 同步到测试服务器。
4. **工具前缀**：所有 Git MCP 工具前缀 `git__`。
5. **参数**：大部分工具用 `repo`，`code_upload` 用 `team`。
