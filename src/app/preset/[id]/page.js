import DocumentExtractor from '../../page.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (id === 'hse') {
    return {
      title: 'DocEx · 安全环保部专属版 - 隐患排查结构化提取',
      description: '面向安全检查与隐患排查报告的结构化数据提取与对齐平台'
    };
  }
  return {
    title: `DocEx · ${id} 专属预设版`,
    description: '智能文档数据结构化提取系统'
  };
}

export default async function PresetPage({ params }) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-parchment">
      <DocumentExtractor presetId={id} />
    </main>
  );
}
