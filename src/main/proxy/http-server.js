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
  
  // 尝试初始化MCP服务
  try {
    await mcpProxy.initialize();
    console.log('MCP服务初始化成功');
  } catch (error) {
    console.warn('MCP服务初始化失败，将尝试不初始化直接获取工具列表:', error);
  }
  
  // SSE端点
  app.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 发送初始连接事件
    res.write(`data: ${JSON.stringify({ type: 'connection', status: 'connected' })}\n\n`);
    
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
      console.log('收到客户端请求:', message);
      
      // 验证是否为有效的JSON-RPC请求
      if (!message.jsonrpc || message.jsonrpc !== '2.0' || !message.method) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: message.id || null,
          error: {
            code: -32600,
            message: '无效的请求'
          }
        });
      }
      
      // 处理tools/list请求
      if (message.method === 'tools/list') {
        try {
          console.log('处理tools/list请求');
          const response = await mcpProxy.sendRequest(message);
          console.log('获取到tools/list响应:', response);
          return res.json(response);
        } catch (error) {
          console.error('tools/list请求失败:', error);
          return res.status(200).json({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: `内部错误: ${error.message}`
            }
          });
        }
      }
      
      // 处理初始化请求
      if (message.method === 'initialize') {
        try {
          console.log('处理initialize请求');
          const response = await mcpProxy.sendRequest(message);
          console.log('获取到initialize响应:', response);
          return res.json(response);
        } catch (error) {
          console.error('initialize请求失败:', error);
          return res.status(200).json({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: `内部错误: ${error.message}`
            }
          });
        }
      }
      
      // 处理tools/call请求
      if (message.method === 'tools/call') {
        try {
          console.log('处理tools/call请求');
          const response = await mcpProxy.sendRequest(message);
          console.log('获取到tools/call响应:', response);
          return res.json(response);
        } catch (error) {
          console.error('tools/call请求失败:', error);
          return res.status(200).json({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: `内部错误: ${error.message}`
            }
          });
        }
      }
      
      // 处理其他请求
      try {
        const response = await mcpProxy.sendRequest(message);
        return res.json(response);
      } catch (error) {
        console.error(`${message.method}请求失败:`, error);
        return res.status(200).json({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: `内部错误: ${error.message}`
          }
        });
      }
    } catch (error) {
      console.error('处理消息失败:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32603,
          message: `内部错误: ${error.message}`
        }
      });
    }
  });
  
  // 添加API端点用于直接获取工具列表
  app.get('/api/tools', async (req, res) => {
    try {
      console.log('通过API端点获取工具列表');
      
      // 构建获取工具列表请求
      const toolsListRequest = {
        jsonrpc: '2.0',
        id: `api-tools-${Date.now()}`,
        method: 'tools/list',
        params: {}
      };
      
      // 发送获取工具列表请求
      try {
        const response = await mcpProxy.sendRequest(toolsListRequest);
        console.log('API端点获取工具列表响应:', response);
        
        if (response && response.result && response.result.tools) {
          return res.json(response.result);
        } else {
          // 尝试使用discovery方法
          const discoveryRequest = {
            jsonrpc: '2.0',
            id: `api-discovery-${Date.now()}`,
            method: 'discovery',
            params: {}
          };
          
          try {
            const discoveryResponse = await mcpProxy.sendRequest(discoveryRequest);
            console.log('API端点获取discovery响应:', discoveryResponse);
            
            if (discoveryResponse && discoveryResponse.result && discoveryResponse.result.tools) {
              return res.json(discoveryResponse.result);
            }
          } catch (discErr) {
            console.error('API端点获取discovery失败:', discErr);
          }
          
          // 如果没有找到工具，返回空工具列表
          return res.json({ tools: [] });
        }
      } catch (error) {
        console.error('API端点获取工具列表失败:', error);
        // 返回一个空的工具列表
        return res.json({ tools: [] });
      }
    } catch (error) {
      console.error('API端点处理失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // 设置Debug API端点
  app.get('/api/debug', (req, res) => {
    try {
      // 发送一个简单的调试消息
      const debugMessage = {
        jsonrpc: '2.0',
        id: `debug-${Date.now()}`,
        method: 'echo',
        params: { message: 'Hello from debug endpoint' }
      };
      
      mcpProxy.sendMessage(debugMessage);
      
      // 返回调试信息
      res.json({
        info: {
          connected: mcpProxy.clients.size > 0,
          clientCount: mcpProxy.clients.size,
          pendingRequests: mcpProxy.pendingRequests.size
        }
      });
    } catch (error) {
      console.error('调试端点失败:', error);
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