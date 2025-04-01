const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { setupInspectorProxy } = require('./inspector-proxy');

async function startHttpServer(mcpProxy, port) {
  const app = express();
  
  // 启用CORS
  app.use(cors());
  
  // 解析JSON
  app.use(express.json());
  
  // SSE端点
  app.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 保持连接活跃
    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);
    
    // 添加客户端
    mcpProxy.addClient(res);
    
    // 清理
    req.on('close', () => {
      clearInterval(keepAliveInterval);
      mcpProxy.removeClient(res);
    });
  });
  
  // 接收消息端点
  app.post('/message', async (req, res) => {
    try {
      const message = req.body;
      
      // 保存请求ID与响应的映射关系
      if (message.id) {
        const responseHandler = (response) => {
          if (response.id === message.id) {
            // 一旦收到匹配ID的响应，就向客户端发送响应
            res.status(200).json({ success: true });
            // 移除监听器，避免内存泄漏
            mcpProxy.removeListener('message', responseHandler);
          }
        };
        
        // 为特定请求ID监听响应
        mcpProxy.on('message', responseHandler);
        
        // 设置超时，如果长时间未收到响应，则返回超时错误
        const timeoutId = setTimeout(() => {
          mcpProxy.removeListener('message', responseHandler);
          res.status(504).json({ error: 'Request timeout' });
        }, 30000); // 30秒超时
        
        // 当响应发送后清除超时
        res.on('finish', () => {
          clearTimeout(timeoutId);
        });
      } else {
        // 如果没有ID，立即返回成功
        res.status(202).json({ success: true });
      }
      
      // 发送消息到MCP代理
      mcpProxy.sendMessage(message);
    } catch (error) {
      console.error('处理消息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // 设置MCP Inspector代理
  setupInspectorProxy(app);
  
  // 健康检查端点
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  // 启动服务器
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`HTTP服务器已启动，监听端口: ${port}`);
      resolve(server);
    }).on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = { startHttpServer };