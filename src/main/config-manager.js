const Store = require('electron-store');

class ConfigManager {
  constructor() {
    this.store = new Store({
      name: 'mcp-proxy-config',
      defaults: {
        port: 3000,
        autoStart: false,
        lastRun: null,
        customServers: []
      }
    });
  }
  
  async init() {
    // 确保配置目录存在
    return Promise.resolve();
  }
  
  get(key, defaultValue) {
    return this.store.get(key, defaultValue);
  }
  
  set(key, value) {
    this.store.set(key, value);
  }
  
  getLastRunConfig() {
    return this.store.get('lastRun');
  }
  
  setLastRunConfig(config) {
    this.store.set('lastRun', config);
  }
  
  addCustomServer(server) {
    const servers = this.store.get('customServers', []);
    servers.push(server);
    this.store.set('customServers', servers);
  }
  
  getCustomServers() {
    return this.store.get('customServers', []);
  }
}

module.exports = { ConfigManager };