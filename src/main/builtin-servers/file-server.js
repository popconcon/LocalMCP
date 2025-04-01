const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// 存储工具定义
const tools = [
  {
    name: 'list_files',
    description: '列出指定目录下的文件和子目录',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: '要列出内容的目录路径'
        }
      },
      required: ['directory']
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要读取的文件路径'
        },
        encoding: {
          type: 'string',
          description: '文件编码',
          default: 'utf8'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'write_file',
    description: '写入内容到文件',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
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
      required: ['filePath', 'content']
    }
  },
  {
    name: 'delete_file',
    description: '删除文件或目录',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要删除的文件或目录路径'
        }
      },
      required: ['filePath']
    }
  }
];

// 处理接收到的行
rl.on('line', async (line) => {
  if (!line.trim()) return;
  
  try {
    const request = JSON.parse(line);
    
    // 处理初始化请求
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          capabilities: {
            tools: {
              listChanged: true
            }
          }
        }
      };
      
      console.log(JSON.stringify(response));
      return;
    }
    
    // 处理工具列表请求
    if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: tools
        }
      };
      
      console.log(JSON.stringify(response));
      return;
    }
    
    // 处理工具调用请求
    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      
      // 查找工具
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `未找到工具: ${name}`
          }
        };
        
        console.log(JSON.stringify(errorResponse));
        return;
      }
      
      try {
        // 执行工具
        let result;
        
        switch (name) {
          case 'list_files':
            result = await listFiles(args.directory);
            break;
          
          case 'read_file':
            result = await readFile(args.filePath, args.encoding || 'utf8');
            break;
          
          case 'write_file':
            result = await writeFile(args.filePath, args.content, args.encoding || 'utf8');
            break;
          
          case 'delete_file':
            result = await deleteFile(args.filePath);
            break;
          
          default:
            throw new Error(`未实现的工具: ${name}`);
        }
        
        // 响应结果
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ],
            isError: false
          }
        };
        
        console.log(JSON.stringify(response));
      } catch (error) {
        // 错误响应
        const errorResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: `操作失败: ${error.message}`
              }
            ],
            isError: true
          }
        };
        
        console.log(JSON.stringify(errorResponse));
      }
      
      return;
    }
    
    // 未知请求
    const errorResponse = {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `未知方法: ${request.method}`
      }
    };
    
    console.log(JSON.stringify(errorResponse));
  } catch (error) {
    // 解析错误
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `解析错误: ${error.message}`
      }
    };
    
    console.log(JSON.stringify(errorResponse));
  }
});

// 工具实现
async function listFiles(directory) {
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
}

async function readFile(filePath, encoding) {
  return await fs.readFile(filePath, { encoding });
}

async function writeFile(filePath, content, encoding) {
  await fs.outputFile(filePath, content, { encoding });
  return { success: true, path: filePath };
}

async function deleteFile(filePath) {
  await fs.remove(filePath);
  return { success: true, path: filePath };
}

// 发送系统初始化完成提示
console.error('文件服务器已启动，等待请求...'); 