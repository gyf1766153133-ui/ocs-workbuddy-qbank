# 如何填写自己的 API Key

API Key 填在**本机设置页**中。每个人使用自己的接口和密钥，不需要改程序源代码，也不要把密钥提交到 GitHub。

## 方法一：在设置页填写（推荐）

1. 安装 Node.js 20+，运行 `start.cmd`（Windows）或 `node server.mjs`。
2. 打开 <http://127.0.0.1:8765/>。
3. 填写 **网关地址**、**模型 ID**、**网关的模型 API Key**。
4. 点击 **「保存设置」**。输入框清空但提示「已保存网关密钥」属于正常情况；密钥不会回显。
5. 点击 **「检查网关 / 获取模型」**，再用右侧示例题点击 **「查询答案」**。
6. 查询成功后，复制设置页生成的 OCS 配置到 OCS 中使用。

### 使用 WorkBuddy Gateway

先按 [WorkBuddy Gateway 的文档](https://github.com/CangShui/workbuddy-gateway/blob/main/docs/user-guide.md)启动网关并配置账号，再填写：

| 字段 | 填什么 |
| --- | --- |
| 网关地址 | 默认 `http://127.0.0.1:8317/v1`，修改过端口时使用实际地址 |
| 模型 ID | 例如 `deepseek-v4.1-flash`，以你自己的 `/v1/models` 列表为准 |
| API Key | 网关的**模型 API Key**；若网关关闭模型 API 认证，可以留空 |

模型 API Key 与网关管理 Key 分别用于模型调用和管理控制台，不能互相替代。不要填写 WorkBuddy 的登录凭据文件内容或账号访问令牌。

### 使用 DeepSeek 官方 API

在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)创建自己的 API Key，再填写：

| 字段 | 填什么 |
| --- | --- |
| 网关地址 | `https://api.deepseek.com` |
| 模型 ID | `deepseek-flash`，或官方当前提供的模型 ID |
| API Key | 自己在 DeepSeek 开放平台创建的 Key |

不要把 WorkBuddy 网关的 Key 填到 DeepSeek 官方接口中。模型、权限和计费以 [DeepSeek 官方文档](https://api-docs.deepseek.com/)为准；官方接口模式未包含在本项目初版的真实网关验收中。

### 使用其他 OpenAI 兼容接口

填写服务商提供的 Base URL、模型 ID 和 API Key。程序会在 Base URL 后追加 `/chat/completions`，例如：

```text
Base URL: https://your-provider.example/v1
最终请求: https://your-provider.example/v1/chat/completions
```

接口需要支持 `stream: false` 的 Chat Completions，并能按提示返回 JSON。模型列表检查会访问 `/models`；如果服务商未提供该接口，可以直接用单题查询检查模型调用。

处理图片或公式图题时，还需要模型与接口支持 `image_url` 内容块。可在设置页上传一张简单题目图片测试；模型列表中存在某个 ID 并不能证明它支持图片。参见 [图片题说明](IMAGE_QUESTIONS.md)。

## 方法二：手动编辑本地配置

通常不需要手动编辑。需要时可以：

1. 先运行一次程序以生成 `data/` 文件夹，然后按 `Ctrl+C` 停止程序。
2. 将仓库中的 [`examples/settings.example.json`](../examples/settings.example.json) 复制到 `data/settings.json`。
3. 使用文本编辑器修改 `baseUrl`、`model` 和 `apiKey`。下面所有密钥文字都只是占位符：

```json
{
  "baseUrl": "http://127.0.0.1:8317/v1",
  "model": "deepseek-v4.1-flash",
  "apiKey": "在这里填写你自己的网关模型 API Key",
  "timeoutSeconds": 90,
  "cacheEnabled": true
}
```

4. 保存为 UTF-8 的合法 JSON，然后重新启动程序。Key 中若含 `"` 或反斜杠，需要按 JSON 规则转义；使用设置页填写会自动处理转义。

程序不会自动读取 `.env` 或 `DEEPSEEK_API_KEY` 等环境变量。配置入口是设置页或 `data/settings.json`。

## 修改和删除密钥

- **换一个 Key**：在设置页输入新 Key 并保存。
- **保留已有 Key**：输入框留空保存，旧 Key 保留。
- **删除 Key**：勾选「清除已保存的网关密钥」并保存。
- **手动修改配置**：停止程序后编辑 `data/settings.json`，再重新启动。

## Key 保存在哪里

Key 以明文保存在你本机的 `data/settings.json`。页面不会回显，生成的 OCS 配置也不包含该上游 Key；OCS 使用的是 `data/bridge-token.json` 中的另一枚本地连接令牌。

`data/` 已被 `.gitignore` 忽略。请勿强制提交其中的文件，分享截图时也不要展示密钥内容。如果误把 Key 发到公共仓库或公开聊天中，应在提供方撤销并重新创建 Key，仅删除公开文本不能使旧 Key 失效。
