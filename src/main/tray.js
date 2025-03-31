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
            label: '打开Inspector', 
            click: () => {
              shell.openExternal(`http://localhost:${server.port}/inspector`);
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