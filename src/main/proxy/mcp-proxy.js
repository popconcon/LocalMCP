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
          // 检查是否是某个请求的响应
          if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve } = this.pendingRequests.get(message.id);
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
    
    return messages;
  }
  
  // 向服务器发送消息
  sendMessage(message) {
    if (typeof message === 'object') {
      message = JSON.stringify(message);
    }
    
    this.stdin.write(message + '\n');
  }
  
  // 发送请求并等待响应
  sendRequest(request) {
    return new Promise((resolve, reject) => {
      // 确保请求有ID
      if (!request.id) {
        request.id = this.generateRequestId();
      }
      
      // 存储请求和解析函数
      this.pendingRequests.set(request.id, { resolve, reject });
      
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          const { reject } = this.pendingRequests.get(request.id);
          reject(new Error('请求超时'));
          this.pendingRequests.delete(request.id);
        }
      }, 30000); // 30秒超时
      
      try {
        // 发送请求
        this.sendMessage(request);
      } catch (error) {
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
      if (client.send) {
        client.send(`data: ${messageStr}\n\n`);
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