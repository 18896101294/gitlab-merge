# GitLab 合并请求飞书通知

这个项目用于监听 GitLab 的合并请求事件，并通过飞书机器人向指派人发送通知消息。

## 功能特点

- 监听 GitLab Webhook 事件
- 当创建新的合并请求时，自动发送通知
- 通过飞书机器人向指派人发送结构化消息
- 包含合并请求的详细信息和直接链接

## 安装步骤

1. 克隆仓库

```bash
git clone <仓库地址>
cd gitlab-merge
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

```bash
cp .env.example .env
```

然后编辑 `.env` 文件，设置您的飞书机器人 Webhook URL。

## 配置 GitLab Webhook

1. 在 GitLab 项目中，进入 **设置 > Webhooks**
2. 添加新的 Webhook，URL 设置为 `http://您的服务器地址:3000/webhook/gitlab`
3. 选择触发事件：**合并请求事件**
4. 保存 Webhook

## 配置飞书机器人

1. 在飞书开放平台创建自定义机器人
2. 获取 Webhook URL
3. 将 URL 添加到 `.env` 文件中的 `FEISHU_WEBHOOK_URL` 变量

## 启动服务

```bash
node index.js
```

服务将在 3000 端口启动（可通过环境变量 `PORT` 修改）。

## 消息格式

飞书通知消息包含以下信息：

- 合并请求编号和标题
- 项目名称
- 创建者信息
- 指派人信息
- 合并请求描述
- 查看合并请求的链接

## 开发

### 依赖项

- Node.js
- Express
- Axios
- dotenv

### 文件结构

- `index.js` - 主服务器文件
- `.env` - 环境变量配置
- `package.json` - 项目依赖

## 许可证

MIT