import './globals.css';

export const metadata = {
  title: 'DocEx · 智能文档数据结构化提取',
  description: '基于大语言模型的解耦式通用文档数据提取器，支持双路多模态解析与多维表格自动推送',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
