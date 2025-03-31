const { McpRegistry, ToolsBuilder } = require('@modelcontextprotocol/sdk');
const fs = require('fs-extra');
const path = require('path');

// 创建MCP服务注册表
const registry = new McpRegistry();

// 文件列表工具
registry.registerTool({
  name: 'list_files',
  description: '列出指定目录下的文件和子目录',
  parameters: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '要列出内容的目录路径'
      }
    },
    required: ['directory']
  },
  execute: async ({ directory }) => {
    try {
      const items = await fs.readdir(directory);
      const result = [];
      
      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = await fs.stat(itemPath);
        
        result.push({
          name: item,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          path: itemPath
        });
      }
      
      return result;
    } catch (error) {
      throw new Error(`列出目录失败: ${error.message}`);
    }
  }
});

// 读取文件工具
registry.registerTool({
  name: 'read_file',
  description: '读取文件内容',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径'
      },
      encoding: {
        type: 'string',
        description: '文件编码',
        default: 'utf8'
      }
    },
    required: ['path']
  },
  execute: async ({ path: filePath, encoding }) => {
    try {
      const content = await fs.readFile(filePath, { encoding });
      return content;
    } catch (error) {
      throw new Error(`读取文件失败: ${error.message}`);
    }
  }
});

// 写入文件工具
registry.registerTool({
  name: 'write_file',
  description: '写入内容到文件',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要写入的文件路径'
      },
      content: {
        type: 'string',
        description: '要写入的内容'
      },
      encoding: {
        type: 'string',
        description: '文件编码',
        default: 'utf8'
      }
    },
    required: ['path', 'content']
  },
  execute: async ({ path: filePath, content, encoding }) => {
    try {
      await fs.outputFile(filePath, content, { encoding });
      return { success: true, path: filePath };
    } catch (error) {
      throw new Error(`写入文件失败: ${error.message}`);
    }
  }
});

// 删除文件工具
registry.registerTool({
  name: 'delete_file',
  description: '删除文件或目录',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要删除的文件或目录路径'
      }
    },
    required: ['path']
  },
  execute: async ({ path: targetPath }) => {
    try {
      await fs.remove(targetPath);
      return { success: true, path: targetPath };
    } catch (error) {
      throw new Error(`删除失败: ${error.message}`);
    }
  }
});

// 启动MCP服务
registry.listen(process.stdin, process.stdout); 