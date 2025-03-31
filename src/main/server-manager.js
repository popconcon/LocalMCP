const path = require('path');
const { spawn } = require('child_process');
const { McpProxy } = require('./proxy/mcp-proxy');
const { startHttpServer } = require('./proxy/http-server');

class ServerManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.activeServers = {};
    this.builtinServers = [
      { id: 'file-server', name: '文件操作服务', path: path.join(__dirname, 'builtin-servers/file-server.js') },
      { id: 'web-search', name: '网络搜索服务', path: path.join(__dirname, 'builtin-servers/web-search.js') }
    ];
  }
  
  async startServer(type, serverPath, port) {
    // 生成唯一ID
    const id = `${type}-${Date.now()}`;
    
    try {
      // 启动MCP服务进程
      let childProcess;
      let serverName;
      
      if (type === 'builtin') {
        const builtinServer = this.builtinServers.find(s => s.id === serverPath);
        if (!builtinServer) {
          throw new Error(`内置服务器 ${serverPath} 不存在`);
        }
        serverName = builtinServer.name;
        childProcess = spawn('node', [builtinServer.path]);
      } else {
        serverName = path.basename(serverPath);
        childProcess = spawn('node', [serverPath]);
      }
      
      // 创建MCP代理
      const mcpProxy = new McpProxy(childProcess.stdin, childProcess.stdout);
      
      // 启动HTTP服务器
      const httpServer = await startHttpServer(mcpProxy, port);
      
      // 保存到活动服务器列表
      this.activeServers[id] = {
        id,
        name: serverName,
        port,
        type,
        path: serverPath,
        process: childProcess,
        proxy: mcpProxy,
        httpServer
      };
      
      // 保存最后运行配置
      this.configManager.setLastRunConfig({
        serverType: type,
        serverPath,
        port,
        autoStart: this.configManager.get('autoStart', false)
      });
      
      console.log(`服务器 ${serverName} 已启动，监听端口: ${port}`);
      return id;
    } catch (error) {
      console.error(`启动服务器失败: ${error.message}`);
      throw error;
    }
  }
  
  stopServer(id) {
    const server = this.activeServers[id];
    if (!server) {
      return;
    }
    
    // 关闭HTTP服务器
    if (server.httpServer) {
      server.httpServer.close();
    }
    
    // 关闭MCP代理
    if (server.proxy) {
      server.proxy.close();
    }
    
    // 终止进程
    if (server.process) {
      server.process.kill();
    }
    
    // 从活动列表中移除
    delete this.activeServers[id];
    console.log(`服务器 ${server.name} 已停止`);
  }
  
  async stopAllServers() {
    for (const id of Object.keys(this.activeServers)) {
      this.stopServer(id);
    }
  }
  
  getActiveServers() {
    return Object.values(this.activeServers);
  }
  
  getBuiltinServers() {
    return this.builtinServers;
  }
}

module.exports = { ServerManager };