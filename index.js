const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 飞书机器人webhook地址
const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;

// 验证环境变量
if (!FEISHU_WEBHOOK_URL) {
  console.error('错误: 未设置飞书Webhook URL。请在.env文件中设置FEISHU_WEBHOOK_URL');
  process.exit(1);
}

// 解析请求体
app.use(bodyParser.json());

// GitLab Webhook 路由
app.post('/webhook/gitlab', async (req, res) => {
  // 可选: 验证GitLab Webhook请求
  const gitlabToken = process.env.GITLAB_SECRET_TOKEN;
  if (gitlabToken) {
    const requestToken = req.headers['x-gitlab-token'];
    if (requestToken !== gitlabToken) {
      console.error('无效的GitLab Token');
      return res.status(401).send('未授权');
    }
  }
  try {
    const eventType = req.headers['x-gitlab-event'];
    const eventData = req.body;

    // 处理合并请求事件
    if (eventType === 'Merge Request Hook') {
      // 只处理新创建的合并请求
      if (eventData.object_attributes && eventData.object_attributes.action === 'open') {
        await handleMergeRequestCreated(eventData);
      }
    }

    res.status(200).send('Webhook received successfully');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

/**
 * 处理新创建的合并请求
 * @param {Object} data - GitLab webhook 数据
 */
async function handleMergeRequestCreated(data) {
  try {
    const mergeRequest = data.object_attributes;
    const project = data.project;
    const assignees = data.assignees;

    // 如果没有指派人，则不发送通知
    if (!assignees || assignees.length === 0) {
      console.log('No assignees for this merge request, skipping notification');
      return;
    }

    // 获取最后一次提交信息
    const lastCommit = mergeRequest.last_commit || {};
    const commitMessage = lastCommit.message ? lastCommit.message.split('\n')[0] : '无提交信息';

    // 构建飞书消息
    const message = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: `${project.name} - ${mergeRequest.work_in_progress ? '草稿: ' : ''}新的合并请求 #${mergeRequest.iid}`
          },
          template: mergeRequest.work_in_progress ? 'green' : (mergeRequest.target_branch === 'main' || mergeRequest.target_branch === 'master' ? 'red' : 'blue')
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**项目**: ${project.name}\n**标题**: ${mergeRequest.title}\n**创建者**: ${data.user.name}\n**指派给**: ${assignees.map(a => a.name).join(', ')}\n**源分支**: ${mergeRequest.source_branch}\n**目标分支**: ${mergeRequest.target_branch}\n**最新提交**: ${commitMessage}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: mergeRequest.description || '无描述'
            }
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: {
                  tag: 'plain_text',
                  content: '查看合并请求'
                },
                url: mergeRequest.url,
                type: 'default'
              }
            ]
          }
        ]
      }
    };

    // 发送飞书通知
    await sendFeishuNotification(message);
    console.log(`Notification sent to ${assignees.map(a => a.name).join(', ')} for merge request #${mergeRequest.iid}`);
  } catch (error) {
    console.error('Error handling merge request:', error);
  }
}

/**
 * 发送飞书通知
 * @param {Object} message - 飞书消息对象
 */
async function sendFeishuNotification(message) {
  try {
    const response = await axios.post(FEISHU_WEBHOOK_URL, message);
    return response.data;
  } catch (error) {
    console.error('Error sending Feishu notification:', error);
    throw error;
  }
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`GitLab webhook endpoint: http://localhost:${PORT}/webhook/gitlab`);
});