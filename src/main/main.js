const { app, BrowserWindow } = require('electron');
const path = require('path');
const { setupTray } = require('./tray');
const { ConfigManager } = require('./config-manager');
const { ServerManager } = require('./server-manager');

// 禁止多实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// 全局对象
const configManager = new ConfigManager();
const serverManager = new ServerManager(configManager);
let tray = null;

// 确保app.whenReady()已解决再创建托盘
app.whenReady().then(async () => {
  // 初始化配置
  await configManager.init();
  
  // 创建系统托盘
  tray = setupTray(serverManager, configManager);
  
  // 加载上次运行状态
  const lastConfig = configManager.getLastRunConfig();
  if (lastConfig && lastConfig.autoStart) {
    const { serverType, serverPath, port } = lastConfig;
    serverManager.startServer(serverType, serverPath, port);
  }
  
  // 确保在macOS上app保持活跃状态
  if (process.platform === 'darwin') {
    app.dock.hide(); // 隐藏dock图标，纯托盘应用
  }
  
  console.log('MCP代理服务已启动，请在系统托盘中查看图标');
});

// 防止应用退出
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// 处理退出
app.on('before-quit', async () => {
  await serverManager.stopAllServers();
});