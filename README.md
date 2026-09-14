# TikTok 达人筛选台 · 飞书通知服务

一个最小可运行的飞书群机器人通知服务。Webhook 和调用密钥只从服务器环境变量读取，不会进入浏览器代码或 GitHub。

## 功能

- `GET /health`：健康检查
- `POST /api/notify`：向飞书群发送交互式消息卡片
- 使用 `X-Notify-Key` 验证调用方
- 限制请求体大小并校验字段
- 上游超时、错误状态与飞书错误码处理
- 日志不会输出 Webhook、调用密钥或完整请求体

## 本地运行

要求 Node.js 20+。

```bash
cp .env.example .env
npm start
```

配置环境变量：

- `FEISHU_WEBHOOK_URL`：飞书群自定义机器人的 Webhook
- `NOTIFY_API_KEY`：自定义强随机密钥，用来保护通知接口
- `PORT`：可选，默认 `3000`

> 不要把真实 Webhook 或密钥写入仓库。请在飞书中重置任何已经公开过的 Webhook，再将新值写入部署平台的 Secret/Environment Variables。

## 调用示例

```bash
curl -X POST http://localhost:3000/api/notify \
  -H "Content-Type: application/json" \
  -H "X-Notify-Key: your-private-api-key" \
  -d '{
    "event": "creator_added",
    "title": "新增候选达人",
    "creator": "@example",
    "status": "待评估",
    "metrics": {
      "报价": "$300",
      "平均播放": "52,000",
      "CPM": "$5.77"
    },
    "note": "建议优先联系"
  }'
```

## 请求字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `title` | 是 | 卡片标题 |
| `event` | 否 | 事件类型 |
| `creator` | 否 | 达人账号 |
| `status` | 否 | 当前状态 |
| `metrics` | 否 | 显示在卡片中的键值数据，最多 20 项 |
| `note` | 否 | 补充说明 |

## 认证与 Token 流程

1. 调用方在服务端读取 `NOTIFY_API_KEY`，通过 `X-Notify-Key` 发起请求。
2. 服务使用常量时间比较验证密钥，失败返回 `401`。
3. 服务端读取 `FEISHU_WEBHOOK_URL`，组装飞书消息卡片。
4. 服务端向飞书 Webhook 发起 HTTPS 请求；Webhook 不会返回给调用方。
5. 服务只返回发送结果，不记录任何凭证。

当前版本不包含用户登录，也不签发会话 Token。这里的两个凭证都是服务端机密：调用密钥用于保护本服务，Webhook 用于访问飞书机器人。
