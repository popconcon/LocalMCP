const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const { McpProxy } = require('./mcp-proxy');

/**
 * 创建MCP Inspector服务代理
 * @param {object} app Express应用实例
 */
function setupInspectorProxy(app) {
  // 处理Inspector启动页请求
  app.get('/inspector-mcp', (req, res) => {
    try {
      const inspectorLaunchPath = path.join(process.cwd(), 'assets/html/inspector-mcp/launch.html');
      res.sendFile(inspectorLaunchPath);
    } catch (error) {
      console.error('发送Inspector启动页失败:', error);
      res.status(500).send(`Inspector启动失败: ${error.message}`);
    }
  });

  // 处理Inspector静态资源
  app.use('/mcp-inspector-assets', express.static(path.join(process.cwd(), 'assets/html/inspector-mcp')));

  // 处理Inspector启动请求
  app.get('/mcp-inspector', async (req, res) => {
    const serverPath = req.query.server;
    
    if (!serverPath) {
      return res.status(400).send('缺少server参数');
    }

    try {
      // 启动子进程
      const absoluteServerPath = path.resolve(process.cwd(), serverPath);
      console.log(`启动服务: ${absoluteServerPath}`);
      
      const childProcess = spawn(process.execPath, ['-e', `
        const server = require('${absoluteServerPath.replace(/\\/g, '\\\\')}');
        process.stdin.on('data', data => {
          try {
            const message = JSON.parse(data.toString());
            if (server.handleMessage) {
              server.handleMessage(message).then(response => {
                console.log(JSON.stringify(response));
              }).catch(err => {
                console.error('处理消息失败:', err);
              });
            }
          } catch (err) {
            console.error('解析消息失败:', err);
          }
        });
      `]);
      
      // 创建MCP代理
      const mcpProxy = new McpProxy(childProcess.stdin, childProcess.stdout);
      
      // 设置服务ID
      const serverId = `inspector-${Date.now()}`;
      
      // 将代理和子进程存储在应用全局上下文中
      if (!app.locals.inspectorProxies) {
        app.locals.inspectorProxies = new Map();
      }
      
      app.locals.inspectorProxies.set(serverId, {
        proxy: mcpProxy,
        process: childProcess
      });
      
      // 设置Inspector客户端接口
      setupInspectorClient(app, serverId, mcpProxy);
      
      // 重定向到Inspector客户端
      res.redirect(`/inspector-mcp?serverId=${serverId}`);
    } catch (error) {
      console.error('启动Inspector失败:', error);
      res.status(500).send(`启动Inspector失败: ${error.message}`);
    }
  });
}

/**
 * 设置Inspector客户端接口
 * @param {object} app Express应用实例
 * @param {string} serverId 服务ID
 * @param {McpProxy} mcpProxy MCP代理实例
 */
function setupInspectorClient(app, serverId, mcpProxy) {
  // 处理Inspector请求
  app.post(`/inspector/${serverId}/request`, async (req, res) => {
    try {
      const request = req.body;
      console.log(`接收请求: ${JSON.stringify(request)}`);
      
      // 发送请求到MCP服务
      const response = await mcpProxy.sendRequest(request);
      console.log(`返回响应: ${JSON.stringify(response)}`);
      
      // 返回响应
      res.json(response);
    } catch (error) {
      console.error('处理Inspector请求失败:', error);
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  });
  
  // 处理SSE连接
  app.get(`/inspector/${serverId}/events`, (req, res) => {
    // 设置SSE头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 发送初始连接事件
    res.write(`data: ${JSON.stringify({ type: 'connection', status: 'connected' })}\n\n`);
    
    // 设置消息处理程序
    const messageHandler = (message) => {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    };
    
    // 注册消息处理程序
    mcpProxy.on('message', messageHandler);
    
    // 处理连接关闭
    req.on('close', () => {
      mcpProxy.removeListener('message', messageHandler);
    });
  });
}

module.exports = { setupInspectorProxy }; 