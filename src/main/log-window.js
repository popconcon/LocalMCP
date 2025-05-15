const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// 保存已创建的日志窗口实例
const logWindows = new Map();

// 存储服务日志
const serverLogs = new Map();

/**
 * 创建并显示日志窗口
 * @param {string} serverId 服务ID
 */
function createLogWindow(serverId) {
  // 如果已经有窗口，则显示并聚焦
  if (logWindows.has(serverId)) {
    const existingWindow = logWindows.get(serverId);
    if (!existingWindow.isDestroyed()) {
      existingWindow.show();
      existingWindow.focus();
      return existingWindow;
    }
  }

  // 创建新窗口
  const logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: `服务日志 - ${serverId}`,
    icon: path.join(__dirname, '../../assets/icons/tray.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 创建临时HTML文件用于显示日志
  const tempDir = path.join(os.tmpdir(), 'mcp-logs');
  fs.ensureDirSync(tempDir);
  
  const tempPath = path.join(tempDir, `log-${serverId}.html`);
  
  // 创建HTML内容
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>服务日志</title>
    <meta charset="UTF-8">
    <style>
      body {
        font-family: monospace;
        background-color: #1e1e1e;
        color: #f0f0f0;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
      }
      #toolbar {
        padding: 10px;
        background-color: #333;
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid #555;
      }
      #toolbar button {
        background-color: #444;
        color: #fff;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
      }
      #toolbar button:hover {
        background-color: #555;
      }
      #logContainer {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.5;
      }
      .log-entry {
        margin-bottom: 2px;
        border-bottom: 1px solid #333;
        padding-bottom: 2px;
      }
      .info { color: #7cafc2; }
      .error { color: #f07178; }
      .warn { color: #f8c555; }
      .debug { color: #a9dc76; }
      .time { color: #aaaaaa; font-size: 0.8em; }
    </style>
  </head>
  <body>
    <div id="toolbar">
      <div>
        <button id="clearBtn">清除日志</button>
        <button id="scrollLockBtn">自动滚动</button>
      </div>
      <div>
        <button id="saveBtn">保存日志</button>
      </div>
    </div>
    <div id="logContainer"></div>

    <script>
      const { ipcRenderer } = require('electron');
      
      const logContainer = document.getElementById('logContainer');
      const clearBtn = document.getElementById('clearBtn');
      const scrollLockBtn = document.getElementById('scrollLockBtn');
      const saveBtn = document.getElementById('saveBtn');
      
      let autoScroll = true;
      scrollLockBtn.textContent = autoScroll ? '自动滚动: 开' : '自动滚动: 关';
      
      // 清除日志
      clearBtn.addEventListener('click', () => {
        logContainer.innerHTML = '';
        ipcRenderer.send('clear-logs', '${serverId}');
      });
      
      // 切换自动滚动
      scrollLockBtn.addEventListener('click', () => {
        autoScroll = !autoScroll;
        scrollLockBtn.textContent = autoScroll ? '自动滚动: 开' : '自动滚动: 关';
      });
      
      // 保存日志
      saveBtn.addEventListener('click', () => {
        ipcRenderer.send('save-logs', '${serverId}');
      });
      
      // 接收日志数据
      ipcRenderer.on('log-data', (event, { type, message, timestamp }) => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const time = new Date(timestamp).toLocaleTimeString();
        
        logEntry.innerHTML = \`<span class="time">[\${time}]</span> <span class="\${type}">\${message}</span>\`;
        logContainer.appendChild(logEntry);
        
        // 自动滚动
        if (autoScroll) {
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      });
      
      // 接收初始日志数据
      ipcRenderer.on('initial-logs', (event, logs) => {
        logs.forEach(log => {
          const logEntry = document.createElement('div');
          logEntry.className = 'log-entry';
          
          const time = new Date(log.timestamp).toLocaleTimeString();
          
          logEntry.innerHTML = \`<span class="time">[\${time}]</span> <span class="\${log.type}">\${log.message}</span>\`;
          logContainer.appendChild(logEntry);
        });
        
        // 滚动到底部
        if (autoScroll) {
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      });
      
      // 初始化请求日志
      ipcRenderer.send('request-logs', '${serverId}');
    </script>
  </body>
  </html>
  `;
  
  fs.writeFileSync(tempPath, htmlContent);
  
  // 加载HTML文件
  logWindow.loadFile(tempPath);
  
  // 窗口关闭时清理资源
  logWindow.on('closed', () => {
    logWindows.delete(serverId);
    try {
      fs.unlinkSync(tempPath);
    } catch (err) {
      console.error('删除临时日志文件失败:', err);
    }
  });
  
  // 保存窗口实例
  logWindows.set(serverId, logWindow);
  
  return logWindow;
}

/**
 * 添加日志
 * @param {string} serverId 服务ID
 * @param {string} type 日志类型 (info, error, warn, debug)
 * @param {string} message 日志消息
 */
function addLog(serverId, type, message) {
  // 确保服务ID的日志数组存在
  if (!serverLogs.has(serverId)) {
    serverLogs.set(serverId, []);
  }
  
  const logs = serverLogs.get(serverId);
  
  // 添加新日志
  const logEntry = {
    type,
    message,
    timestamp: Date.now()
  };
  
  logs.push(logEntry);
  
  // 限制日志数量为最新的5000条
  if (logs.length > 5000) {
    logs.splice(0, logs.length - 5000);
  }
  
  // 向日志窗口发送新日志
  const logWindow = logWindows.get(serverId);
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.send('log-data', logEntry);
  }
}

/**
 * 清除服务的日志
 * @param {string} serverId 服务ID
 */
function clearLogs(serverId) {
  if (serverLogs.has(serverId)) {
    serverLogs.set(serverId, []);
  }
}

/**
 * 保存日志到文件
 * @param {string} serverId 服务ID
 */
async function saveLogs(serverId) {
  if (!serverLogs.has(serverId)) return;
  
  const logs = serverLogs.get(serverId);
  if (logs.length === 0) return;
  
  const { dialog } = require('electron');
  
  const result = await dialog.showSaveDialog({
    title: '保存日志',
    defaultPath: path.join(app.getPath('downloads'), `mcp-logs-${serverId}-${new Date().toISOString().replace(/:/g, '-')}.txt`),
    filters: [
      { name: '文本文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  
  if (result.canceled || !result.filePath) return;
  
  try {
    let content = '';
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleString();
      content += `[${time}] [${log.type.toUpperCase()}] ${log.message}\n`;
    });
    
    fs.writeFileSync(result.filePath, content);
  } catch (err) {
    console.error('保存日志失败:', err);
    dialog.showErrorBox('保存日志失败', err.message);
  }
}

// 设置IPC处理
function setupIPC() {
  const { ipcMain } = require('electron');
  
  ipcMain.on('request-logs', (event, serverId) => {
    const logs = serverLogs.get(serverId) || [];
    event.sender.send('initial-logs', logs);
  });
  
  ipcMain.on('clear-logs', (event, serverId) => {
    clearLogs(serverId);
  });
  
  ipcMain.on('save-logs', (event, serverId) => {
    saveLogs(serverId);
  });
}

// 初始化
setupIPC();

module.exports = { 
  createLogWindow,
  addLog,
  clearLogs,
  saveLogs
}; 