# 本地MCP服务器

这是一个使用Model Context Protocol (MCP) TypeScript SDK实现的本地服务器，提供文件操作工具。

## 功能

服务器提供以下工具：

1. `readLocalFile` - 读取本地文件内容
2. `createLocalFile` - 创建新文件
3. `writeLocalFile` - 写入（或追加）文件内容
4. `listDirectory` - 列出目录内容
5. `deleteLocalPath` - 删除文件或目录

## 安装

确保你安装了Node.js（建议使用Node.js 18+）。

```bash
# 克隆仓库
git clone [你的仓库URL]
cd LocalMCP

# 安装依赖
npm install
```

## 使用方法

```bash
# 启动服务器
npm start
```

服务器将通过标准输入/输出进行通信。你可以将它与任何支持MCP的客户端一起使用，如Anthropic Claude或其他支持Model Context Protocol的AI模型。

## 工具详情

### readLocalFile

读取本地文件内容。

参数：
- `filePath`：文件的绝对路径或相对路径

### createLocalFile

创建新文件。

参数：
- `filePath`：要创建的文件路径
- `content`：文件内容
- `overwrite`（可选，默认为false）：如果文件已存在，是否覆盖

### writeLocalFile

写入文件内容。

参数：
- `filePath`：要写入的文件路径
- `content`：要写入的内容
- `append`（可选，默认为false）：是否追加到文件末尾而不是覆盖

### listDirectory

列出目录内容。

参数：
- `dirPath`：要列出内容的目录路径

### deleteLocalPath

删除文件或目录。

参数：
- `path`：要删除的文件或目录路径
- `recursive`（可选，默认为false）：是否递归删除目录

## 示例

在支持MCP的AI模型中，你可以这样使用这些工具：

```
使用readLocalFile工具读取/path/to/file.txt文件内容
使用createLocalFile工具创建一个新文件/path/to/newfile.txt，内容为"Hello World"
使用listDirectory工具列出/path/to/目录的内容
```

## 许可证

ISC 