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
    // 处理流水线事件
    else if (eventType === 'Pipeline Hook') {
      // 只处理已完成的流水线
      if (eventData.object_attributes && ['success', 'failed'].includes(eventData.object_attributes.status)) {
        await handlePipelineCompleted(eventData);
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
// 获取飞书用户ID
async function getFeishuUserId(userName) {
  try {
    const response = await axios.get('https://gate.shjinjia.com.cn/api/SearchTool/EexcuteDataSource', {
      params: {
        data_source_code: 'feishu_user_tbl',
        keyword_value: userName
      },
      headers: {
        'token': 'systemh3x8bb3kol0o6efzoat5wxwv4ivbu2g1',
        'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
        'Accept': '*/*',
        'Host': 'gate.shjinjia.com.cn',
        'Connection': 'keep-alive'
      }
    });

    if (response.data.res_status_code === '0' && response.data.res_content.length > 0) {
      return response.data.res_content[0].strValue;
    }
    return null;
  } catch (error) {
    console.error('Error getting Feishu user ID:', error);
    return null;
  }
}

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

    // 获取所有指派人的飞书用户ID
    const assigneeIds = [];
    for (const assignee of assignees) {
      const userId = await getFeishuUserId(assignee.name);
      if (userId) {
        assigneeIds.push(userId);
      }
    }

    // 获取最后一次提交信息
    const lastCommit = mergeRequest.last_commit || {};
    const commitMessage = lastCommit.message ? lastCommit.message.split('\n')[0] : '无提交信息';

    // 构建飞书消息
    const message = {
      msg_type: 'interactive',
      card: {
        // 添加at功能
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
              content: `**项目**: ${project.name}\n**标题**: ${mergeRequest.title}\n**创建者**: ${data.user.name}\n**指派给**: ${assignees.map(a => `<at id="${assigneeIds.find(id => id) || ''}">${a.name}</at>`).join(', ')}\n**源分支**: ${mergeRequest.source_branch}\n**目标分支**: ${mergeRequest.target_branch}\n**最新提交**: ${commitMessage}`
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

/**
 * 处理流水线完成事件
 * @param {Object} data - GitLab webhook 数据
 */
async function handlePipelineCompleted(data) {
  try {
    const pipeline = data.object_attributes;
    const project = data.project;
    const user = data.user;

    // 获取创建者的飞书用户ID
    const userId = await getFeishuUserId(user.name);

    // 构建状态显示
    const statusDisplay = pipeline.status === 'success' ? '成功 ✅' : '失败 ❌';
    const statusColor = pipeline.status === 'success' ? 'green' : 'red';

    // 构建飞书消息
    const message = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: `${project.name} - 流水线 #${pipeline.id} ${statusDisplay}`
          },
          template: statusColor
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**项目**: ${project.name}\n**分支**: ${pipeline.ref}\n**状态**: ${statusDisplay}\n**触发者**: ${userId ? `<at id="${userId}">${user.name}</at>` : user.name}\n**持续时间**: ${Math.floor((new Date(pipeline.finished_at) - new Date(pipeline.created_at)) / 1000)} 秒`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: {
                  tag: 'plain_text',
                  content: '查看流水线详情'
                },
                url: `${project.web_url}/-/pipelines/${pipeline.id}`,
                type: 'default'
              }
            ]
          }
        ]
      }
    };

    // 发送飞书通知
    await sendFeishuNotification(message);
    console.log(`Pipeline notification sent to ${user.name} for pipeline #${pipeline.id}`);
  } catch (error) {
    console.error('Error handling pipeline completion:', error);
  }
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`GitLab webhook endpoint: http://localhost:${PORT}/webhook/gitlab`);
});