const path = require('path');
const { spawn } = require('child_process');
const { McpProxy } = require('./proxy/mcp-proxy');
const { startHttpServer } = require('./proxy/http-server');
const { dialog } = require('electron');

class ServerManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.activeServers = {};
    this.builtinServers = [
      { id: 'file-server', name: '文件操作服务', path: path.join(__dirname, 'builtin-servers/file-server.js') },
      { id: 'web-search', name: '网络搜索服务', path: path.join(__dirname, 'builtin-servers/web-search.js') },
      { id: 'amap', name: '高德地图服务', type: 'npm-package', package: '@amap/amap-maps-mcp-server' }
    ];
  }
  
  async startServer(type, serverPath, port, env = {}) {
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
        
        // 检查是否为npm包类型的内置服务
        if (builtinServer.type === 'npm-package') {
          // 如果是高德地图服务，检查API Key
          if (builtinServer.id === 'amap') {
            const apiKey = this.configManager.get('amapApiKey');
            if (!apiKey) {
              // 弹出对话框请求API Key
              const { BrowserWindow } = require('electron');
              const focusedWindow = BrowserWindow.getFocusedWindow();
              
              // 创建一个简单的输入对话框窗口
              const inputWindow = new BrowserWindow({
                width: 400,
                height: 200,
                parent: focusedWindow,
                modal: true,
                show: false,
                webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false
                }
              });
              
              // 创建临时HTML文件
              const fs = require('fs');
              const os = require('os');
              const path = require('path');
              const tempPath = path.join(os.tmpdir(), 'amap-key-input-temp.html');
              
              const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <title>输入高德地图API Key</title>
                <style>
                  body { font-family: system-ui; padding: 20px; }
                  input { width: 100%; padding: 8px; margin: 10px 0; }
                  button { padding: 8px 15px; margin-right: 10px; }
                </style>
              </head>
              <body>
                <h3>高德地图API Key</h3>
                <p>请输入您的高德地图API Key以启动服务：</p>
                <input id="apiKeyInput" type="text" placeholder="请输入您的高德地图API Key" autofocus />
                <div style="text-align: right; margin-top: 20px;">
                  <button id="cancelBtn">取消</button>
                  <button id="confirmBtn">确定</button>
                </div>
                <script>
                  // 设置IPC通信
                  const { ipcRenderer } = require('electron');
                  
                  document.getElementById('confirmBtn').addEventListener('click', () => {
                    const apiKey = document.getElementById('apiKeyInput').value;
                    ipcRenderer.send('set-api-key', apiKey);
                  });
                  
                  document.getElementById('cancelBtn').addEventListener('click', () => {
                    ipcRenderer.send('cancel-api-key');
                  });
                  
                  // 按下Enter键等同于点击确定按钮
                  document.getElementById('apiKeyInput').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                      document.getElementById('confirmBtn').click();
                    }
                  });
                </script>
              </body>
              </html>
              `;
              
              fs.writeFileSync(tempPath, htmlContent);
              
              inputWindow.loadFile(tempPath);
              inputWindow.once('ready-to-show', () => {
                inputWindow.show();
              });
              
              // 设置IPC监听
              const { ipcMain } = require('electron');
              
              const resultPromise = new Promise((resolve, reject) => {
                ipcMain.once('set-api-key', (event, apiKey) => {
                  inputWindow.close();
                  resolve(apiKey);
                });
                
                ipcMain.once('cancel-api-key', () => {
                  inputWindow.close();
                  reject(new Error('未提供高德地图API Key'));
                });
                
                inputWindow.on('closed', () => {
                  if (!resultPromise.isResolved) {
                    reject(new Error('未提供高德地图API Key'));
                  }
                });
              });
              
              resultPromise.isResolved = false;
              
              try {
                const inputApiKey = await resultPromise;
                resultPromise.isResolved = true;
                
                if (!inputApiKey) {
                  throw new Error('未提供高德地图API Key');
                }
                
                // 保存API Key到配置
                this.configManager.set('amapApiKey', inputApiKey);
                env.AMAP_MAPS_API_KEY = inputApiKey;
                
                // 清理临时文件
                try {
                  fs.unlinkSync(tempPath);
                } catch (err) {
                  console.error('删除临时文件失败:', err);
                }
              } catch (error) {
                // 清理临时文件
                try {
                  fs.unlinkSync(tempPath);
                } catch (err) {
                  console.error('删除临时文件失败:', err);
                }
                
                // 重新抛出原始错误
                throw error;
              }
            } else {
              env.AMAP_MAPS_API_KEY = apiKey;
            }
          }
          
          // 使用npx启动npm包
          const npmPackage = builtinServer.package;
          console.log(`使用npm包启动服务: ${npmPackage}`);
          
          // 构建环境变量
          const mergedEnv = { ...process.env, ...env };
          
          // 使用npx启动服务
          childProcess = spawn('npx', ['-y', npmPackage], {
            env: mergedEnv
          });
        } else {
          // 普通内置服务
          childProcess = spawn('node', [builtinServer.path]);
        }
      } else if (type === 'custom') {
        serverName = path.basename(serverPath);
        childProcess = spawn('node', [serverPath]);
      } else {
        throw new Error(`未知服务类型: ${type}`);
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