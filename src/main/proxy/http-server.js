const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

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
      mcpProxy.sendMessage(message);
      res.status(202).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 内置Inspector页面
  const inspectorPath = path.join(__dirname, '../../../assets/html/inspector');
  if (await fs.pathExists(inspectorPath)) {
    app.use('/inspector', express.static(inspectorPath));
  }
  
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