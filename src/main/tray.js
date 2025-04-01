const { Tray, Menu, dialog, shell, app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

function setupTray(serverManager, configManager) {
  // 创建一个默认图标，避免图标加载失败
  let tray;
  
  try {
    // 根据平台选择合适的图标方式
    if (process.platform === 'darwin') {
      // 在macOS上使用Template图标
      const iconPath = path.join(__dirname, '../../assets/icons/tray.png');
      // 检查文件是否存在，如果不存在则创建一个最小的图标
      if (!fs.existsSync(iconPath)) {
        const iconDir = path.dirname(iconPath);
        if (!fs.existsSync(iconDir)) {
          fs.mkdirSync(iconDir, { recursive: true });
        }
        // 创建一个空白图标文件
        const emptyIcon = nativeImage.createEmpty();
        const smallIcon = emptyIcon.resize({ width: 16, height: 16 });
        fs.writeFileSync(iconPath, smallIcon.toPNG());
      }
      tray = new Tray(iconPath);
    } else {
      // 在Windows/Linux上使用普通图标
      const iconPath = path.join(__dirname, '../../assets/icons/tray.png');
      if (!fs.existsSync(iconPath)) {
        const iconDir = path.dirname(iconPath);
        if (!fs.existsSync(iconDir)) {
          fs.mkdirSync(iconDir, { recursive: true });
        }
        // 创建一个空白图标文件
        const emptyIcon = nativeImage.createEmpty();
        const smallIcon = emptyIcon.resize({ width: 16, height: 16 });
        fs.writeFileSync(iconPath, smallIcon.toPNG());
      }
      tray = new Tray(iconPath);
    }
  } catch (error) {
    console.error('托盘图标加载失败，使用空图标:', error);
    // 创建一个空的图标作为后备
    const emptyIcon = nativeImage.createEmpty();
    tray = new Tray(emptyIcon);
  }
  
  // 确保在macOS上正确显示
  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true);
  }
  
  // 创建并设置上下文菜单
  updateTrayMenu(tray, serverManager, configManager);
  
  // 定期更新托盘菜单以反映最新状态
  setInterval(() => {
    updateTrayMenu(tray, serverManager, configManager);
  }, 5000);
  
  // 添加点击事件处理，直接显示菜单而不是获取当前菜单
  tray.on('click', () => {
    try {
      // 重新创建菜单并显示
      const menu = buildTrayMenu(serverManager, configManager);
      if (process.platform === 'darwin' || process.platform === 'win32') {
        tray.popUpContextMenu(menu);
      }
    } catch (error) {
      console.error('显示托盘菜单失败:', error);
    }
  });
  
  return tray;
}

// 创建托盘菜单
function buildTrayMenu(serverManager, configManager) {
  const activeServers = serverManager.getActiveServers();
  const builtinServers = serverManager.getBuiltinServers();
  
  // 构建菜单模板
  const menuTemplate = [
    { label: '状态: ' + (activeServers.length > 0 ? '运行中' : '已停止'), enabled: false },
    { type: 'separator' },
    
    // 内置服务器选项
    { 
      label: '启动内置服务器', 
      submenu: builtinServers.map(server => ({
        label: server.name,
        click: () => {
          try {
            const port = configManager.get('port', 3000);
            serverManager.startServer('builtin', server.id, port);
            console.log(`已启动服务: ${server.name}`);
          } catch (err) {
            console.error(`启动服务失败: ${err.message}`);
          }
        }
      }))
    },
    
    // 自定义服务器选项
    { 
      label: '启动自定义服务器',
      click: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'JavaScript Files', extensions: ['js'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          try {
            const filePath = result.filePaths[0];
            const port = configManager.get('port', 3000);
            serverManager.startServer('custom', filePath, port);
          } catch (err) {
            console.error(`启动自定义服务器失败: ${err.message}`);
          }
        }
      }
    },
    
    // 活动服务器列表和控制选项
    ...(activeServers.length > 0 ? [
      { type: 'separator' },
      { label: '活动服务器:', enabled: false },
      ...activeServers.map(server => ({
        label: `${server.name} (http://localhost:${server.port}/sse)`,
        submenu: [
          { 
            label: '复制SSE URL', 
            click: () => {
              const { clipboard } = require('electron');
              clipboard.writeText(`http://localhost:${server.port}/sse`);
            }
          },
          { 
            label: 'MCP Inspector', 
            click: () => {
              shell.openExternal(`http://localhost:${server.port}/inspector-mcp`);
            }
          },
          { 
            label: '停止服务器', 
            click: () => {
              serverManager.stopServer(server.id);
            }
          }
        ]
      }))
    ] : []),
    
    { type: 'separator' },
    
    // 开发工具选项
    {
      label: '开发工具',
      submenu: [
        { 
          label: 'MCP Inspector', 
          click: () => {
            // 使用主要活动服务器的端口，如果没有则使用配置的默认端口
            const port = activeServers.length > 0 ? activeServers[0].port : configManager.get('port', 3000);
            shell.openExternal(`http://localhost:${port}/inspector-mcp`);
          }
        }
      ]
    },
    
    // 设置选项
    { 
      label: '设置',
      submenu: [
        {
          label: '修改端口',
          click: async () => {
            const result = await dialog.showMessageBox({
              title: '修改端口',
              message: '请输入新端口号:',
              buttons: ['确定', '取消'],
              defaultId: 0,
              cancelId: 1,
              inputField: {
                placeholder: '3000',
                value: String(configManager.get('port', 3000))
              }
            });
            
            const { response, inputField } = result;
            if (response === 0 && inputField && !isNaN(parseInt(inputField))) {
              configManager.set('port', parseInt(inputField));
            }
          }
        },
        {
          label: '高德地图API Key',
          click: async () => {
            const currentKey = configManager.get('amapApiKey', '');
            const focusedWindow = require('electron').BrowserWindow.getFocusedWindow();
            
            try {
              // 弹出输入对话框
              const result = await dialog.showMessageBox(focusedWindow, {
                title: '高德地图API Key',
                message: '请输入您的高德地图API Key:',
                detail: '您可以在高德开放平台(https://lbs.amap.com/)申请API Key',
                buttons: ['确定', '取消'],
                defaultId: 0,
                cancelId: 1
              });
              
              if (result.response === 0) {
                // 如果用户点击了确定，弹出输入框
                const { net } = require('electron');
                const promptOptions = {
                  title: '输入API Key',
                  label: '高德地图API Key:',
                  value: currentKey || '',
                  inputAttrs: {
                    type: 'text'
                  },
                  type: 'promptInput' // 使用promptInput类型
                };
                
                // 使用另一种方式获取用户输入
                const promptWindow = new require('electron').BrowserWindow({
                  width: 400,
                  height: 200,
                  show: false,
                  webPreferences: {
                    nodeIntegration: true
                  }
                });
                
                // 创建临时HTML文件用于输入
                const fs = require('fs');
                const os = require('os');
                const tempPath = path.join(os.tmpdir(), 'amap-key-input.html');
                
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
                  <h3>输入高德地图API Key</h3>
                  <input id="apiKeyInput" type="text" value="${currentKey || ''}" placeholder="请输入您的高德地图API Key" />
                  <div style="text-align: right; margin-top: 20px;">
                    <button id="cancelBtn">取消</button>
                    <button id="confirmBtn">确定</button>
                  </div>
                  <script>
                    document.getElementById('confirmBtn').addEventListener('click', () => {
                      const apiKey = document.getElementById('apiKeyInput').value;
                      window.electronAPI.setApiKey(apiKey);
                    });
                    document.getElementById('cancelBtn').addEventListener('click', () => {
                      window.electronAPI.cancel();
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
                
                promptWindow.loadFile(tempPath);
                promptWindow.once('ready-to-show', () => {
                  promptWindow.show();
                });
                
                // 添加IPC通信
                const { ipcMain } = require('electron');
                
                const resultPromise = new Promise((resolve) => {
                  ipcMain.once('set-api-key', (event, apiKey) => {
                    promptWindow.close();
                    resolve(apiKey);
                  });
                  
                  ipcMain.once('cancel-api-key', () => {
                    promptWindow.close();
                    resolve(null);
                  });
                  
                  promptWindow.webContents.executeJavaScript(`
                    if (!window.electronAPI) {
                      window.electronAPI = {
                        setApiKey: (apiKey) => {
                          window.electronAPI.apiKey = apiKey;
                          window.electronAPI.ipcRenderer.send('set-api-key', apiKey);
                        },
                        cancel: () => {
                          window.electronAPI.ipcRenderer.send('cancel-api-key');
                        },
                        ipcRenderer: {
                          send: (channel, data) => {
                            const event = new CustomEvent(channel, { detail: data });
                            window.dispatchEvent(event);
                          }
                        }
                      };
                    }
                    
                    window.addEventListener('set-api-key', (e) => {
                      window.ipcRenderer.send('set-api-key', e.detail);
                    });
                    
                    window.addEventListener('cancel-api-key', () => {
                      window.ipcRenderer.send('cancel-api-key');
                    });
                  `);
                });
                
                promptWindow.on('closed', () => {
                  ipcMain.removeAllListeners('set-api-key');
                  ipcMain.removeAllListeners('cancel-api-key');
                  try {
                    fs.unlinkSync(tempPath);
                  } catch (e) {
                    console.error('删除临时文件失败:', e);
                  }
                });
                
                const apiKey = await resultPromise;
                if (apiKey) {
                  configManager.set('amapApiKey', apiKey);
                  dialog.showMessageBox(focusedWindow, {
                    type: 'info',
                    title: '成功',
                    message: 'API Key已保存'
                  });
                }
              }
            } catch (error) {
              console.error('设置API Key失败:', error);
              dialog.showErrorBox('错误', `设置API Key失败: ${error.message}`);
            }
          }
        },
        {
          label: '开机自动启动',
          type: 'checkbox',
          checked: configManager.get('autoStart', false),
          click: (menuItem) => {
            configManager.set('autoStart', menuItem.checked);
            app.setLoginItemSettings({
              openAtLogin: menuItem.checked
            });
          }
        }
      ]
    },
    
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ];
  
  // 创建菜单
  return Menu.buildFromTemplate(menuTemplate);
}

// 更新托盘菜单
function updateTrayMenu(tray, serverManager, configManager) {
  try {
    const activeServers = serverManager.getActiveServers();
    
    // 创建上下文菜单并设置
    const contextMenu = buildTrayMenu(serverManager, configManager);
    tray.setContextMenu(contextMenu);
    tray.setToolTip('MCP代理服务' + (activeServers.length > 0 ? ' - 运行中' : ' - 已停止'));
  } catch (error) {
    console.error('更新托盘菜单失败:', error);
  }
}

module.exports = { setupTray };