const { EventEmitter } = require('events');

class McpProxy extends EventEmitter {
  constructor(stdin, stdout) {
    super();
    this.stdin = stdin;
    this.stdout = stdout;
    this.buffer = '';
    this.clients = new Set();
    this.pendingRequests = new Map(); // 存储待处理的请求
    
    // 处理stdout数据
    this.stdout.on('data', (data) => {
      const chunk = data.toString();
      this.buffer += chunk;
      
      try {
        // 尝试解析可能的完整JSON
        const messages = this.extractMessages();
        
        for (const message of messages) {
          console.log('从MCP服务接收到消息:', JSON.stringify(message));
          
          // 检查是否是某个请求的响应
          if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve, timeout } = this.pendingRequests.get(message.id);
            clearTimeout(timeout);
            resolve(message);
            this.pendingRequests.delete(message.id);
          }
          
          // 转发消息到所有连接的客户端
          this.broadcast(message);
        }
      } catch (error) {
        console.error('Error processing server output:', error);
      }
    });
    
    this.stdout.on('end', () => {
      this.emit('end');
    });
    
    this.stdout.on('error', (error) => {
      this.emit('error', error);
    });
  }
  
  // 从缓冲区提取完整的JSON消息
  extractMessages() {
    const messages = [];
    let startIndex = 0;
    
    // 首先通过换行符分割，尝试解析每一行
    const lines = this.buffer.split('\n');
    this.buffer = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 检查是否为JSON内容
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const message = JSON.parse(line);
          messages.push(message);
        } catch (error) {
          console.warn('解析行失败，尝试使用深度解析:', line);
          this.buffer += line + '\n';
        }
      } else {
        // 如果不是完整的JSON，添加回缓冲区
        this.buffer += line + '\n';
      }
    }
    
    // 如果没有解析出任何消息但缓冲区非空，尝试深度解析
    if (messages.length === 0 && this.buffer.length > 0) {
      while (true) {
        // 查找JSON对象的开始和结束
        const openBraceIndex = this.buffer.indexOf('{', startIndex);
        if (openBraceIndex === -1) break;
        
        let depth = 0;
        let closeBraceIndex = -1;
        
        for (let i = openBraceIndex; i < this.buffer.length; i++) {
          if (this.buffer[i] === '{') depth++;
          else if (this.buffer[i] === '}') {
            depth--;
            if (depth === 0) {
              closeBraceIndex = i;
              break;
            }
          }
        }
        
        if (closeBraceIndex === -1) break;
        
        // 提取完整的JSON消息
        const jsonStr = this.buffer.substring(openBraceIndex, closeBraceIndex + 1);
        
        try {
          const message = JSON.parse(jsonStr);
          messages.push(message);
          startIndex = closeBraceIndex + 1;
        } catch (error) {
          console.error('Error parsing JSON:', error);
          startIndex = openBraceIndex + 1;
        }
      }
      
      // 移除已处理的部分
      if (startIndex > 0) {
        this.buffer = this.buffer.substring(startIndex);
      }
    }
    
    return messages;
  }
  
  // 发送初始化请求
  async initialize() {
    try {
      console.log('发送MCP初始化请求');
      const initRequest = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'initialize',
        params: {
          capabilities: {
            tools: {
              listChanged: true
            }
          }
        }
      };
      
      const response = await this.sendRequest(initRequest);
      console.log('MCP初始化响应:', response);
      return response;
    } catch (error) {
      console.error('MCP初始化失败:', error);
      throw error;
    }
  }
  
  // 向服务器发送消息
  sendMessage(message) {
    if (typeof message === 'object') {
      // 确保消息符合JSON-RPC 2.0规范
      if (message.method && !message.jsonrpc) {
        message.jsonrpc = '2.0';
      }
      message = JSON.stringify(message);
    }
    
    console.log('发送到MCP服务:', message);
    this.stdin.write(message + '\n');
  }
  
  // 发送请求并等待响应
  sendRequest(request) {
    return new Promise((resolve, reject) => {
      // 确保请求有ID和jsonrpc版本
      if (!request.id) {
        request.id = this.generateRequestId();
      }
      
      if (!request.jsonrpc) {
        request.jsonrpc = '2.0';
      }
      
      // 存储请求和解析函数
      this.pendingRequests.set(request.id, { resolve, reject });
      
      // 设置超时 - 延长到60秒以适应某些较慢的服务
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          console.warn(`请求超时: ${request.id}, method: ${request.method}`);
          const { reject } = this.pendingRequests.get(request.id);
          reject(new Error('请求超时'));
          this.pendingRequests.delete(request.id);
        }
      }, 60000); // 60秒超时
      
      try {
        // 发送请求
        this.sendMessage(request);
        
        // 添加超时清理
        this.pendingRequests.get(request.id).timeout = timeout;
        
        // 打印已发送的请求信息
        console.log(`已发送请求 ${request.id} (${request.method})`);
      } catch (error) {
        console.error(`发送请求 ${request.id} 失败:`, error);
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        reject(error);
      }
    });
  }
  
  // 生成唯一请求ID
  generateRequestId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
  
  // 广播消息到所有连接的客户端
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    
    for (const client of this.clients) {
      try {
        // Express响应对象使用write，而普通socket可能使用send
        if (client.write) {
          client.write(`data: ${messageStr}\n\n`);
        } else if (client.send) {
          client.send(`data: ${messageStr}\n\n`);
        }
      } catch (error) {
        console.error('向客户端发送消息失败:', error);
      }
    }
    
    this.emit('message', message);
  }
  
  // 添加客户端
  addClient(client) {
    this.clients.add(client);
    client.on('close', () => {
      this.removeClient(client);
    });
  }
  
  // 移除客户端
  removeClient(client) {
    this.clients.delete(client);
  }
  
  // 关闭代理
  close() {
    this.stdin.end();
    for (const client of this.clients) {
      if (client.end) {
        client.end();
      }
    }
    this.clients.clear();
    
    // 清理所有待处理的请求
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error('连接已关闭'));
    }
    this.pendingRequests.clear();
  }
}

module.exports = { McpProxy };