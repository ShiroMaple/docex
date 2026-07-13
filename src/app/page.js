'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  ShieldAlert, 
  Wand2, 
  Database, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  FileText,
  FileCheck,
  X,
  Settings
} from 'lucide-react';

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的安全检查报告解析专家。
你的任务是：根据输入的报告文档内容（包含文字参考层、表格结构以及视觉截图），提取出所有的安全隐患（问题）。
请依据字段定义完整提取，表格和图片中的信息同样重要，必须提取。
检查日期尽量转化为 YYYY-MM-DD 格式，如无法转化则保持原文。
必须区分不同的隐患间隔，确保返回的 results 数组中的每一项都代表一个独立的安全问题。`;

const DEFAULT_FIELDS = [
  { key: 'projectName', label: '项目名称', desc: '隐患对应的项目或工程名称', example: '100万吨/年甲苯择形歧化系统配套项目', isAdvancedOpen: false },
  { key: 'issueType', label: '问题类型', desc: '安全问题分类，如临时用电、高处作业', example: '脚手架', isAdvancedOpen: false },
  { key: 'inspectionArea', label: '检查区域', desc: '问题被发现的具体位置、点位', example: '经二北路西侧管廊50柱', isAdvancedOpen: false },
  { key: 'description', label: '问题描述', desc: '安全隐患的现状具体描述', example: '配合管线保温搭设的落地式脚手架，立杆底部未铺设通长垫板...', isAdvancedOpen: false },
  { key: 'rectificationRequirement', label: '整改要求', desc: '整改措施或限期完成的要求意见', example: '地基应平整坚实，非混凝土地面立杆底部设置的垫板长度不少于2跨', isAdvancedOpen: false },
  { key: 'inspector', label: '检查人员', desc: '发现问题的检查人员姓名', example: '张进锋', isAdvancedOpen: false },
  { key: 'inspectionDate', label: '检查日期', desc: '发现隐患的日期 (YYYY-MM-DD)', example: '2026-06-22', isAdvancedOpen: false }
];

export default function DocumentExtractor() {
  // ── Global Popovers ──
  const [activePopover, setActivePopover] = useState(null); // 'table' | 'llm' | null
  const [toast, setToast] = useState('');

  // ── Popover: Table Connection ──
  const [platform, setPlatform] = useState('wps'); // 'wps' | 'feishu'
  const [wpsUrl, setWpsUrl] = useState('https://365.kdocs.cn/l/cbGbLglUXASe?R=L1MvMQ==');
  const [feishuUrl, setFeishuUrl] = useState('https://cli-aac44e92a2b89bd5.feishu.cn/base/FJvNwbnCxi6ymuky8bTcRTu2nS6?table=tbla78TDmVdUqIyt');
  const [wpsFileId, setWpsFileId] = useState('');
  const [feishuAppToken, setFeishuAppToken] = useState('');
  const [feishuTableId, setFeishuTableId] = useState('');
  
  const [isTableConnected, setIsTableConnected] = useState(false);
  const [tableName, setTableName] = useState('');
  const [schemaFields, setSchemaFields] = useState([]); // Array of { id, name, type, isReadOnly }
  const [autoNumber, setAutoNumber] = useState(false);
  const [isConnectingTable, setIsConnectingTable] = useState(false);
  const [tableConnectionError, setTableConnectionError] = useState('');

  // ── Popover: LLM Connection ──
  const [llmConfig, setLlmConfig] = useState({
    provider: 'openai',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5',
    apiKey: ''
  });
  const [llmConnected, setLlmConnected] = useState(false);
  const [llmSupportVision, setLlmSupportVision] = useState(false);
  const [activeModelLabel, setActiveModelLabel] = useState('');
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmTestError, setLlmTestError] = useState('');

  // ── Step 1: Upload & Queue ──
  const [filesQueue, setFilesQueue] = useState([]); // Array of { md5, fileName, size, progress, status, error }
  const [historyFiles, setHistoryFiles] = useState([]); // Array of { md5, fileName, uploadTime }
  const [selectedMd5, setSelectedMd5] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const fileInputRef = useRef(null);

  // ── Step 2: Unified Matrix Schema ──
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [fieldMappings, setFieldMappings] = useState({}); // { spreadsheetColumnName: docexFieldKey }
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);

  // ── Step 3: Extraction & Pushing ──
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [extractedIssues, setExtractedIssues] = useState([]);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({}); // { rowIndex_fieldKey: errorText }
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  // ── Load credentials & configurations ──
  useEffect(() => {
    // Load LLM credentials
    const cachedLlm = localStorage.getItem('docex_llm_config');
    if (cachedLlm) {
      try {
        const parsed = JSON.parse(cachedLlm);
        setLlmConfig(prev => ({ ...prev, ...parsed }));
      } catch {}
    } else {
      // Default fallback
      setLlmConfig(prev => ({
        ...prev,
        apiKey: 'tp-cztx8dkny90biwbunzbcm2zxemvt8djnprgmpi8ymcbnj6l0'
      }));
    }

    // Load URL presets
    const cachedWpsUrl = localStorage.getItem('docex_wps_url');
    if (cachedWpsUrl) setWpsUrl(cachedWpsUrl);
    const cachedFeishuUrl = localStorage.getItem('docex_feishu_url');
    if (cachedFeishuUrl) setFeishuUrl(cachedFeishuUrl);

    fetchHistoryFiles();

    // Click outside popovers handler
    const handleClickOutside = (e) => {
      if (!e.target.closest('.popover-container')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Toast notifier helper
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // URL parsing link reactions
  useEffect(() => {
    if (wpsUrl) {
      const match = wpsUrl.match(/\/l\/([^?#/]+)/);
      setWpsFileId(match ? match[1] : wpsUrl.trim());
      localStorage.setItem('docex_wps_url', wpsUrl);
    } else {
      setWpsFileId('');
    }
    resetTableAlignment();
  }, [wpsUrl]);

  useEffect(() => {
    if (feishuUrl) {
      const tokenMatch = feishuUrl.match(/\/base\/([a-zA-Z0-9]+)/);
      setFeishuAppToken(tokenMatch ? tokenMatch[1] : '');
      
      try {
        const urlObj = new URL(feishuUrl);
        setFeishuTableId(urlObj.searchParams.get('table') || '');
      } catch (e) {
        const tableMatch = feishuUrl.match(/[?&]table=([a-zA-Z0-9]+)/);
        setFeishuTableId(tableMatch ? tableMatch[1] : '');
      }
      localStorage.setItem('docex_feishu_url', feishuUrl);
    } else {
      setFeishuAppToken('');
      setFeishuTableId('');
    }
    resetTableAlignment();
  }, [feishuUrl]);

  // Monitor platform toggle change
  useEffect(() => {
    resetTableAlignment();
  }, [platform]);

  const resetTableAlignment = () => {
    setIsTableConnected(false);
    setTableName('');
    setSchemaFields([]);
  };

  // ── Sync spreadsheet schema ──
  const verifyTableConnection = async () => {
    setIsConnectingTable(true);
    setIsSchemaLoading(true);
    setTableConnectionError('');
    setIsTableConnected(false);

    let query = `provider=${platform}&force=true`;
    if (platform === 'wps') {
      if (!wpsFileId) {
        setTableConnectionError('WPS File ID 不能为空');
        setIsConnectingTable(false);
        setIsSchemaLoading(false);
        return;
      }
      query += `&fileId=${wpsFileId}`;
    } else {
      if (!feishuAppToken || !feishuTableId) {
        setTableConnectionError('飞书 AppToken 或 TableID 不能为空');
        setIsConnectingTable(false);
        setIsSchemaLoading(false);
        return;
      }
      query += `&appToken=${feishuAppToken}&tableId=${feishuTableId}`;
    }

    try {
      const res = await fetch(`/api/schema?${query}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '连接多维表格失败');

      setSchemaFields(data.fields || []);
      setTableName(data.sheetName || '数据表');
      setIsTableConnected(true);

      // Perform initial fuzzy mapping for schema matching
      const initMappings = {};
      fields.forEach(f => {
        const match = fuzzyMatchField(f.label, data.fields);
        if (match) {
          initMappings[match] = f.key;
        }
      });

      // Load saved mappings from storage
      const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
      const saved = localStorage.getItem(`docex_mapping_${targetId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.keys(parsed).forEach(col => {
            const schemaField = data.fields.find(sf => sf.name === col);
            if (schemaField && !schemaField.isReadOnly) {
              initMappings[col] = parsed[col];
            }
          });
        } catch {}
      }

      setFieldMappings(initMappings);

    } catch (err) {
      setTableConnectionError(err.message);
    } finally {
      setIsConnectingTable(false);
      setIsSchemaLoading(false);
    }
  };

  const fuzzyMatchField = (label, schemaFieldsList) => {
    const writeable = schemaFieldsList.filter(f => !f.isReadOnly);
    for (const f of writeable) {
      if (f.name.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(f.name.toLowerCase())) {
        return f.name;
      }
    }
    return '';
  };

  const handleMappingChange = (colName, value) => {
    const newMappings = { ...fieldMappings };
    if (value) {
      newMappings[colName] = value;
    } else {
      delete newMappings[colName];
    }
    setFieldMappings(newMappings);

    const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
    localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(newMappings));
  };

  const createTableColumn = async (columnName) => {
    try {
      const res = await fetch('/api/create-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: platform,
          fileId: wpsFileId,
          appToken: feishuAppToken,
          tableId: feishuTableId,
          fieldName: columnName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '云端建列失败');

      showToast(`已在云端创建列 "${columnName}"，正在重刷表头结构...`);
      await verifyTableConnection();
    } catch (e) {
      alert(`创建失败: ${e.message}`);
    }
  };

  // ── LLM Connection verification ──
  const verifyLlmConnection = async () => {
    setIsTestingLlm(true);
    setLlmTestError('');
    setLlmConnected(false);

    try {
      const res = await fetch('/api/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmConfig)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '连接测试大模型失败');

      setLlmSupportVision(data.supportVision);
      setLlmConnected(true);
      setActiveModelLabel(data.model);

      localStorage.setItem('docex_llm_config', JSON.stringify(llmConfig));

    } catch (err) {
      setLlmTestError(err.message);
    } finally {
      setIsTestingLlm(false);
    }
  };

  const optimizePrompt = async () => {
    setIsOptimizingPrompt(true);
    try {
      const res = await fetch('/api/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          model: llmConfig.model,
          prompt: customPrompt,
          fields: fields.map((f, idx) => ({
            key: f.key || `field_${idx + 1}`,
            desc: f.desc || '',
            example: f.example || ''
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '优化提示词失败');

      setCustomPrompt(data.optimizedPrompt);
      showToast('AI 提示词优化成功！');
    } catch (e) {
      alert(`优化失败: ${e.message}`);
    } finally {
      setIsOptimizingPrompt(false);
    }
  };

  // ── Step 1: Upload & Queue list ──
  const fetchHistoryFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.files) {
        setHistoryFiles(data.files);
      }
    } catch (e) {
      console.error('获取历史记录失败:', e);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFilesUpload = async (fileList) => {
    const allowedExtensions = ['pdf', 'docx'];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop().toLowerCase();
      
      if (!allowedExtensions.includes(ext)) {
        alert(`不支持的文件格式: ${file.name}`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert(`文件过大（最大 50MB）: ${file.name}`);
        continue;
      }

      const tempId = Math.random().toString(36).substring(7);
      const queueItem = {
        tempId,
        fileName: file.name,
        size: file.size,
        progress: 10,
        status: 'uploading',
        error: null,
        md5: ''
      };

      setFilesQueue(prev => [queueItem, ...prev]);
      uploadAndPreprocessFile(file, tempId);
    }
  };

  const uploadAndPreprocessFile = async (file, tempId) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '上传或计算 MD5 失败');

      const md5 = data.record.md5;

      // MD5 Deduplication Check
      const isDuplicateInQueue = filesQueue.some(item => item.md5 === md5);
      if (isDuplicateInQueue) {
        showToast('该文档已在队列中，已为您自动排重');
        setFilesQueue(prev => prev.filter(item => item.tempId !== tempId));
        return;
      }

      setFilesQueue(prev => prev.map(item => {
        if (item.tempId === tempId) {
          return {
            ...item,
            md5,
            status: data.isDuplicate ? 'done' : 'preprocessing',
            progress: data.isDuplicate ? 100 : 20
          };
        }
        return item;
      }));

      setSelectedMd5(md5);
      await fetchHistoryFiles();

      if (!data.isDuplicate) {
        pollPreprocessingStatus(md5, tempId);
      }

    } catch (err) {
      setFilesQueue(prev => prev.map(item => {
        if (item.tempId === tempId) {
          return { ...item, status: 'failed', error: err.message, progress: 100 };
        }
        return item;
      }));
    }
  };

  const pollPreprocessingStatus = async (md5, tempId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/files/${md5}/status`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || '获取预处理进度失败');

        setFilesQueue(prev => prev.map(item => {
          if (item.tempId === tempId || item.md5 === md5) {
            return {
              ...item,
              status: data.status,
              progress: data.progress,
              error: data.error
            };
          }
          return item;
        }));

        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(interval);
          fetchHistoryFiles();
        }
      } catch (err) {
        clearInterval(interval);
        setFilesQueue(prev => prev.map(item => {
          if (item.tempId === tempId || item.md5 === md5) {
            return { ...item, status: 'failed', error: err.message };
          }
          return item;
        }));
      }
    }, 1000);
  };

  const deleteHistoryFile = async (md5, e) => {
    e.stopPropagation();
    if (!confirm('确定删除该历史缓存文件？')) return;

    try {
      const res = await fetch(`/api/files?md5=${md5}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }

      if (selectedMd5 === md5) setSelectedMd5('');
      setFilesQueue(prev => prev.filter(f => f.md5 !== md5));
      await fetchHistoryFiles();
      showToast('历史缓存清理成功');
    } catch (e) {
      alert(`删除失败: ${e.message}`);
    }
  };

  const reuseHistoryFile = (file) => {
    // Check duplication in queue
    const exists = filesQueue.some(f => f.md5 === file.md5);
    if (exists) {
      showToast('该文档已在队列中，已为您自动排重');
      setSelectedMd5(file.md5);
      return;
    }

    const newItem = {
      tempId: Math.random().toString(36).substring(7),
      md5: file.md5,
      fileName: file.fileName,
      size: 0,
      progress: 100,
      status: 'done',
      error: null
    };

    setFilesQueue(prev => [newItem, ...prev]);
    setSelectedMd5(file.md5);
  };

  // ── Step 2: Unified Matrix Field Methods ──
  const updateFieldCell = (index, key, val) => {
    const updated = [...fields];
    updated[index][key] = val;
    setFields(updated);
  };

  const toggleAdvancedConfig = (index) => {
    const updated = [...fields];
    updated[index].isAdvancedOpen = !updated[index].isAdvancedOpen;
    setFields(updated);
  };

  const removeFieldItem = (index) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const addFieldItem = () => {
    setFields(prev => [...prev, { key: '', label: '新增字段', desc: '', example: '', isAdvancedOpen: false }]);
  };

  // ── Step 3: LLM Extraction & Safety Guard ──
  const checkPromptSecurityLocal = (promptText) => {
    const patterns = [
      /\.env/i, /env\b/i, /process\.env/i, /api_key/i, /apikey/i, /secret/i,
      /password/i, /credential/i, /token/i, /\/etc\/passwd/i, /system files/i,
      /ignore previous/i, /bypass safety/i, /system prompt/i, /developer mode/i
    ];
    return patterns.some(pat => pat.test(promptText));
  };

  const startExtraction = async () => {
    if (!selectedMd5) {
      alert('请先上传文件或从历史记录中选择要解析的文档！');
      return;
    }
    if (!isTableConnected) {
      alert('请先点击顶部状态栏的【📊 多维表格】同步并验证云端列头！');
      return;
    }

    setExtractionError('');
    setExtractedIssues([]);
    setTokenUsage(null);
    setPushResult(null);

    // Prompt Security Shield Local Check
    if (checkPromptSecurityLocal(customPrompt)) {
      setExtractionError('⚠️ 安全拦截：检测到潜在的提示词注入攻击或敏感配置泄露风险（禁止索要环境变量、系统文件或执行越狱指令）。');
      return;
    }

    // Check fields prompt injection
    const fieldLeak = fields.some(f => checkPromptSecurityLocal(f.label) || checkPromptSecurityLocal(f.desc) || checkPromptSecurityLocal(f.example));
    if (fieldLeak) {
      setExtractionError('⚠️ 安全拦截：检测到提取字段属性描述中含有潜在的越狱或隐私嗅探词汇。');
      return;
    }

    setIsExtracting(true);

    // Precompile keys dynamically if empty
    const processedFields = fields.map((f, idx) => ({
      key: f.key ? f.key.trim() : `field_${idx + 1}`,
      label: f.label || `未命名_${idx + 1}`,
      desc: f.desc || '',
      example: f.example || ''
    }));

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          md5: selectedMd5,
          systemPrompt: customPrompt,
          userPrompt: '请分析该文档并提取结构化字段：',
          fields: processedFields,
          llmConfig
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '解析模型提取失败');

      setExtractedIssues(data.data || []);
      setTokenUsage(data.tokenUsage);

    } catch (err) {
      setExtractionError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Step 3: Result editing & Pushing ──
  const updateIssueCell = (rowIndex, key, val) => {
    const updated = [...extractedIssues];
    updated[rowIndex][key] = val;
    setExtractedIssues(updated);

    // Front date verification
    const rowErrors = { ...validationErrors };
    const errKey = `${rowIndex}_${key}`;

    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('日期')) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (val && !dateRegex.test(val)) {
        rowErrors[errKey] = '格式需为 YYYY-MM-DD';
      } else {
        delete rowErrors[errKey];
      }
    }
    setValidationErrors(rowErrors);
  };

  const removeIssueRow = (rowIndex) => {
    setExtractedIssues(prev => prev.filter((_, i) => i !== rowIndex));
  };

  const addIssueRow = () => {
    const blank = {};
    fields.forEach((f, idx) => {
      const key = f.key ? f.key : `field_${idx + 1}`;
      blank[key] = (f.label.includes('日期') || f.key.includes('Date')) ? getTodayString() : '';
    });
    setExtractedIssues(prev => [...prev, blank]);
  };

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const pushToSpreadsheet = async () => {
    if (Object.keys(validationErrors).length > 0) {
      alert('数据表格中存在不合规字段，请先根据红色标记修正。');
      return;
    }

    setIsPushing(true);
    setPushResult(null);

    // Mapping build
    const customKeyMappings = {};
    fields.forEach((f, idx) => {
      const key = f.key ? f.key : `field_${idx + 1}`;
      customKeyMappings[f.label] = key;
    });

    // Translate mappings matching database schema columns
    const resolves = {};
    Object.keys(fieldMappings).forEach(col => {
      const fieldKey = fieldMappings[col];
      resolves[col] = fieldKey;
    });

    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: platform,
          fileId: wpsFileId,
          appToken: feishuAppToken,
          tableId: feishuTableId,
          issues: extractedIssues,
          fieldMapping: resolves,
          autoNumber
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '多维表格追加数据失败');

      setPushResult({
        success: true,
        count: data.insertedCount,
        message: `成功写入 ${data.insertedCount} 条增量行！`,
        link: platform === 'wps' ? `https://365.kdocs.cn/l/${wpsFileId}` : feishuUrl
      });

    } catch (e) {
      setPushResult({
        success: false,
        message: `写入崩溃: ${e.message}`
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment text-near-black font-sans pb-20">
      {/* ── Toast Alert Component ── */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-6 left-1/2 z-50 bg-ivory shadow-lg border border-warm-sand rounded px-6 py-3 text-near-black text-sm font-medium flex items-center gap-2"
          >
            <span className="text-terracotta">💡</span>
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Global Header Bar ── */}
      <header className="sticky top-0 z-40 bg-parchment/85 backdrop-blur-md border-b border-border-cream">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📚</span>
            <span className="font-serif font-bold text-lg leading-none tracking-tight">DocEx</span>
            <span className="text-[10px] font-bold tracking-wider text-olive-gray bg-warm-sand px-2 py-0.5 rounded-full uppercase">V2.0 智能提取</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Popover 1: Table State Dropdown Badge */}
            <div className="relative popover-container">
              <button 
                onClick={() => setActivePopover(activePopover === 'table' ? null : 'table')}
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${
                  isTableConnected 
                    ? 'border-green-200 bg-green-50/50 text-green-700' 
                    : 'border-border-cream text-olive-gray'
                }`}
              >
                <span className={`w-2 height-2 w-2 h-2 rounded-full ${isTableConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{isTableConnected ? `📊 对齐: ${tableName}` : '📊 未连接目标表'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'table' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">多维表格对齐网关</h4>
                    
                    <div className="flex gap-2 mb-4">
                      <button 
                        onClick={() => setPlatform('wps')}
                        className={`flex-1 py-1.5 rounded text-xs font-semibold border transition ${
                          platform === 'wps' 
                            ? 'bg-warm-sand border-stone-gray text-near-black' 
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                        }`}
                      >
                        WPS 表格
                      </button>
                      <button 
                        onClick={() => setPlatform('feishu')}
                        className={`flex-1 py-1.5 rounded text-xs font-semibold border transition ${
                          platform === 'feishu' 
                            ? 'bg-warm-sand border-stone-gray text-near-black' 
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                        }`}
                      >
                        飞书表格
                      </button>
                    </div>

                    {platform === 'wps' ? (
                      <div className="flex flex-col gap-1 mb-4">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">WPS 协作分享链接</label>
                        <input 
                          type="text" 
                          value={wpsUrl}
                          onChange={(e) => setWpsUrl(e.target.value)}
                          placeholder="https://365.kdocs.cn/l/xxx"
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 mb-4">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">飞书表格分享链接</label>
                        <input 
                          type="text" 
                          value={feishuUrl}
                          onChange={(e) => setFeishuUrl(e.target.value)}
                          placeholder="https://xxx.feishu.cn/base/xxx"
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-4 border-t border-border-cream pt-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">自增序号列配置</span>
                        <span className="text-[10px] text-stone-gray">自动填充云端最后一行索引号</span>
                      </div>
                      <button 
                        onClick={() => setAutoNumber(!autoNumber)}
                        className={`w-10 h-5 rounded-full relative transition ${autoNumber ? 'bg-green-600' : 'bg-warm-sand border border-border-warm'}`}
                      >
                        <span className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[2px] left-[3px] transition-transform ${autoNumber ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>

                    <button 
                      onClick={verifyTableConnection}
                      disabled={isConnectingTable}
                      className="w-full bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold py-2 rounded transition flex items-center justify-center gap-1.5"
                    >
                      {isConnectingTable && <Loader2 size={12} className="animate-spin" />}
                      {isConnectingTable ? '同步校验中...' : '验证并同步字段'}
                    </button>

                    {tableConnectionError && (
                      <p className="text-[10px] text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{tableConnectionError}</p>
                    )}

                    {isTableConnected && (
                      <div className="mt-3 flex justify-end">
                        <a 
                          href={platform === 'wps' ? `https://365.kdocs.cn/l/${wpsFileId}` : feishuUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] text-terracotta font-bold flex items-center gap-1 hover:underline"
                        >
                          打开表格网页 <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Popover 2: LLM Connection Dropdown Badge */}
            <div className="relative popover-container">
              <button 
                onClick={() => setActivePopover(activePopover === 'llm' ? null : 'llm')}
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${
                  llmConnected 
                    ? 'border-green-200 bg-green-50/50 text-green-700' 
                    : 'border-border-cream text-olive-gray'
                }`}
              >
                <span className={`w-2 height-2 w-2 h-2 rounded-full ${llmConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{llmConnected ? `🤖 连接: ${llmConfig.model} (${llmSupportVision ? 'Vision' : 'Text'})` : '🤖 LLM 未连接'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'llm' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">大模型网关配置</h4>

                    <div className="flex flex-col gap-3 mb-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">Provider</label>
                        <input 
                          type="text" 
                          value={llmConfig.provider}
                          onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="openai"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">API Base URL</label>
                        <input 
                          type="text" 
                          value={llmConfig.baseUrl}
                          onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">Model</label>
                        <input 
                          type="text" 
                          value={llmConfig.model}
                          onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="gpt-4o-mini"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-olive-gray uppercase tracking-wider">API Key</label>
                        <input 
                          type="password" 
                          value={llmConfig.apiKey}
                          onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="••••••••••••••••••••"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={verifyLlmConnection}
                      disabled={isTestingLlm}
                      className="w-full bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold py-2 rounded transition flex items-center justify-center gap-1.5"
                    >
                      {isTestingLlm && <Loader2 size={12} className="animate-spin" />}
                      {isTestingLlm ? '正在验证连接...' : '测试并保存配置'}
                    </button>

                    {llmTestError && (
                      <p className="text-[10px] text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{llmTestError}</p>
                    )}

                    {!llmSupportVision && llmConnected && (
                      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 p-2 rounded mt-2">
                        ⚠️ 提示: 目标大模型不支持多模态视觉识图，系统将自动降级为基于纯文字层内容提取。
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Stream Workspace ── */}
      <main className="max-w-4xl mx-auto px-6 mt-12 flex flex-col gap-8">
        
        {/* ── STEP 1: Upload & Queue ── */}
        <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-6 h-6 rounded-full bg-warm-sand text-near-black flex items-center justify-center font-bold text-xs">1</span>
            <h2 className="font-serif font-medium text-xl">上传报告与解析队列</h2>
          </div>

          {/* Trigger Uplod Zone */}
          <div 
            onClick={() => fileInputRef.current.click()}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border border-dashed rounded-lg py-12 px-6 flex flex-col items-center justify-center cursor-pointer transition select-none ${
              dragActive 
                ? 'border-terracotta bg-terracotta/[0.02]' 
                : 'border-stone-gray hover:border-terracotta hover:bg-terracotta/[0.01]'
            }`}
          >
            <UploadCloud className="w-10 h-10 text-stone-gray mb-4" />
            <p className="text-sm font-semibold text-near-black">拖拽文件到此处，或点击卡片任何位置选取</p>
            <p className="text-[11px] text-stone-gray mt-1">支持 PDF / DOCX 格式，最高支持容量 50MB</p>
          </div>

          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden"
            multiple
            accept=".pdf,.docx"
            onChange={(e) => handleFilesUpload(e.target.files)}
          />

          {/* Active files queue list */}
          <AnimatePresence>
            {filesQueue.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                {filesQueue.map(item => (
                  <motion.div 
                    layoutId={item.md5 ? `file-card-${item.md5}` : `file-card-temp-${item.tempId}`}
                    key={item.tempId || item.md5}
                    className="bg-ivory border border-border-cream rounded-lg p-4 flex items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="w-8 h-8 text-stone-gray flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-near-black truncate" title={item.fileName}>{item.fileName}</p>
                        
                        {item.status === 'processing' || item.status === 'uploading' ? (
                          <div className="w-full bg-warm-sand h-1 rounded-full overflow-hidden mt-1.5">
                            <div className="bg-terracotta h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                          </div>
                        ) : null}

                        <span className={`text-[10px] font-bold ${item.status === 'done' ? 'text-green-600' : item.status === 'failed' ? 'text-error-crimson' : 'text-stone-gray'}`}>
                          {item.status === 'uploading' && `[ ⏳ 正在上传文件 ${item.progress}% ]`}
                          {item.status === 'preprocessing' && `[ ⌛ 正在转换视觉图文 ${item.progress}% ]`}
                          {item.status === 'done' && '🟢 文档就绪'}
                          {item.status === 'failed' && `🔴 解析失败: ${item.error}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {selectedMd5 === item.md5 && item.status === 'done' && (
                        <span className="text-[10px] font-bold text-terracotta border border-terracotta/30 bg-terracotta/[0.03] px-2.5 py-0.5 rounded">当前选定</span>
                      )}
                      {item.status === 'done' && selectedMd5 !== item.md5 && (
                        <button 
                          onClick={() => setSelectedMd5(item.md5)}
                          className="text-[10px] font-bold text-olive-gray hover:text-near-black border border-border-warm bg-warm-sand/40 px-2 py-0.5 rounded"
                        >
                          选定提取
                        </button>
                      )}
                      <button 
                        onClick={(e) => deleteHistoryFile(item.md5, e)}
                        className="text-stone-gray hover:text-error-crimson p-1.5 rounded transition"
                        title="从当前队列移除"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>

          {/* History Collapsible select Panel */}
          {historyFiles.length > 0 && (
            <div className="mt-5 border-t border-border-cream pt-4">
              <button 
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="text-xs font-semibold text-olive-gray hover:text-near-black flex items-center gap-1.5 outline-none"
              >
                <span>{isHistoryExpanded ? '▼' : '▶'} 展开查看历史已缓存文档 (点击复用免重传)</span>
              </button>

              <AnimatePresence>
                {isHistoryExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-3 flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar"
                  >
                    {historyFiles.map(file => (
                      <div 
                        key={file.md5}
                        onClick={() => reuseHistoryFile(file)}
                        className={`flex items-center justify-between p-3 rounded-lg border border-border-cream bg-warm-sand/20 hover:bg-warm-sand/40 cursor-pointer transition ${
                          selectedMd5 === file.md5 ? 'border-terracotta/40 bg-terracotta/[0.01]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base flex-shrink-0">📄</span>
                          <span className="text-xs font-semibold text-near-black truncate" title={file.fileName}>{file.fileName}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-stone-gray flex-shrink-0">
                          <span>{new Date(file.uploadTime).toLocaleDateString()}</span>
                          <button 
                            onClick={(e) => deleteHistoryFile(file.md5, e)}
                            className="p-1 rounded text-stone-gray hover:text-error-crimson"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ── STEP 2: Unified Matrix Field Mappings ── */}
        <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-warm-sand text-near-black flex items-center justify-center font-bold text-xs">2</span>
              <h2 className="font-serif font-medium text-xl">字段定义与表格映射矩阵</h2>
            </div>
            
            <button 
              onClick={() => {
                if (confirm('是否还原到默认的安全问题检查字段矩阵？这将丢失现有配置。')) {
                  setFields(DEFAULT_FIELDS);
                  setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
                }
              }}
              className="text-xs font-semibold text-olive-gray hover:text-near-black bg-warm-sand/50 hover:bg-warm-sand px-3 py-1 rounded transition border border-border-warm"
            >
              重置默认安全检查
            </button>
          </div>

          <p className="text-xs text-olive-gray mb-6 leading-relaxed">
            将待提取的目标列与云端表格的实际表头进行对齐。若大模型对特定字段提取发生偏差，可展开【高级调优】提供结构化注释支持。
          </p>

          {/* Configuration Grid Matrix */}
          <div className="border border-border-cream rounded-lg overflow-hidden bg-white mb-6">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-parchment border-b border-border-cream">
                  <th className="p-4 font-bold text-near-black w-[250px]">提取目标 (中文列名)</th>
                  <th className="p-4 font-bold text-near-black w-[200px]">高级调优 (可选)</th>
                  <th className="p-4 font-bold text-near-black w-[240px]">云端多维表映射</th>
                  <th className="p-4 font-bold text-near-black text-center w-[70px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-cream">
                {fields.map((f, index) => {
                  const mappedCol = Object.keys(fieldMappings).find(col => fieldMappings[col] === f.key);
                  const showMissingAlert = isTableConnected && !mappedCol && f.label;
                  
                  return (
                    <tr key={index} className="hover:bg-ivory/40 transition">
                      {/* Column 1: Chinese label */}
                      <td className="p-4 valign-top align-top">
                        <input 
                          type="text" 
                          value={f.label} 
                          onChange={(e) => updateFieldCell(index, 'label', e.target.value)}
                          placeholder="例如: 问题描述"
                          className="bg-warm-sand/30 border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full font-semibold"
                        />
                      </td>

                      {/* Column 2: Advanced adjust */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          <button 
                            onClick={() => toggleAdvancedConfig(index)}
                            className="text-stone-gray hover:text-near-black flex items-center gap-1 font-semibold text-[11px]"
                          >
                            <span>{f.isAdvancedOpen ? '▼ 收起高级设置' : '▶ 展开高级设置'}</span>
                          </button>
                          
                          {f.isAdvancedOpen && (
                            <div className="flex flex-col gap-2 mt-2 bg-warm-sand/20 border border-border-cream p-2.5 rounded">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold text-stone-gray uppercase tracking-wider">隐式键名 (Key)</span>
                                <input 
                                  type="text" 
                                  value={f.key}
                                  onChange={(e) => updateFieldCell(index, 'key', e.target.value)}
                                  placeholder={`隐式自增 (field_${index + 1})`}
                                  className="bg-white border border-border-cream rounded px-2 py-1 text-[11px] outline-none"
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold text-stone-gray uppercase tracking-wider">微调描述 (Description)</span>
                                <input 
                                  type="text" 
                                  value={f.desc}
                                  onChange={(e) => updateFieldCell(index, 'desc', e.target.value)}
                                  placeholder="辅助指导词"
                                  className="bg-white border border-border-cream rounded px-2 py-1 text-[11px] outline-none"
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold text-stone-gray uppercase tracking-wider">样例值 (Example)</span>
                                <input 
                                  type="text" 
                                  value={f.example}
                                  onChange={(e) => updateFieldCell(index, 'example', e.target.value)}
                                  placeholder="例如: XXX"
                                  className="bg-white border border-border-cream rounded px-2 py-1 text-[11px] outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Spreadsheet Column mapping */}
                      <td className="p-4 align-top">
                        {isSchemaLoading ? (
                          <div className="text-xs text-stone-gray flex items-center gap-1.5 py-1">
                            <Loader2 size={12} className="animate-spin" />
                            <span>同步表中...</span>
                          </div>
                        ) : isTableConnected ? (
                          <div className="flex flex-col gap-2">
                            <select 
                              value={mappedCol || ''}
                              onChange={(e) => {
                                // Clear old mappings to f.key
                                const oldCol = Object.keys(fieldMappings).find(k => fieldMappings[k] === f.key);
                                const newMappings = { ...fieldMappings };
                                if (oldCol) delete newMappings[oldCol];
                                
                                if (e.target.value) {
                                  newMappings[e.target.value] = f.key || `field_${index + 1}`;
                                }
                                setFieldMappings(newMappings);
                                
                                const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
                                localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(newMappings));
                              }}
                              className="bg-warm-sand/30 border border-border-warm rounded px-2 py-1.5 text-xs outline-none cursor-pointer w-full focus:bg-white"
                            >
                              <option value="">❌ 不推送此目标字段</option>
                              {schemaFields.filter(sf => !sf.isReadOnly).map(sf => (
                                <option value={sf.name} key={sf.id || sf.name}>
                                  {sf.name}
                                </option>
                              ))}
                            </select>

                            {showMissingAlert && (
                              <div className="bg-red-50/50 border border-red-100 rounded p-2 flex flex-col gap-1.5">
                                <span className="text-[10px] text-error-crimson font-medium">⚠️ 目标表缺少此列</span>
                                <button 
                                  onClick={() => createTableColumn(f.label)}
                                  className="text-[10px] font-bold text-terracotta hover:underline text-left"
                                >
                                  [一键在云端新建 "{f.label}" 列]
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-gray text-[11px] italic">请先连接顶部多维表格</span>
                        )}
                      </td>

                      {/* Column 4: Actions */}
                      <td className="p-4 align-top text-center">
                        <button 
                          onClick={() => removeFieldItem(index)}
                          className="p-1.5 text-stone-gray hover:text-error-crimson rounded transition"
                          title="删除此字段"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button 
            onClick={addFieldItem}
            className="w-full border border-dashed border-stone-gray text-olive-gray hover:text-near-black hover:border-near-black py-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition"
          >
            <Plus size={12} />
            <span>新增自定义提取字段</span>
          </button>
        </section>

        {/* ── Prompt editor section ── */}
        <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif font-medium text-lg flex items-center gap-2">
              <Sparkles size={18} className="text-terracotta" />
              AI 提示词微调设置
            </h3>
            <button 
              onClick={optimizePrompt}
              disabled={isOptimizingPrompt || !llmConnected}
              className="text-xs font-semibold text-terracotta hover:text-terracotta-hover border border-terracotta/30 bg-terracotta/[0.02] px-3 py-1 rounded transition flex items-center gap-1 disabled:opacity-40"
            >
              {isOptimizingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              <span>AI 优化提示词</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <textarea 
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="bg-warm-sand/30 border border-border-warm rounded-lg p-4 text-xs outline-none focus:bg-white focus:border-terracotta transition w-full min-h-[120px] font-sans"
              placeholder="请输入大模型系统提示词..."
            />
            <span className="text-[10px] text-stone-gray leading-normal">
              * 提示词在投喂给大模型时，会自动追加系统最高级别防注入审查语句，拦截非法探测服务器环境和 env 私有变量的行为。
            </span>
          </div>
        </section>

        {/* ── Start Extraction Big Terracotta CTA ── */}
        <div className="flex flex-col items-center gap-2 my-4">
          <button 
            onClick={startExtraction}
            disabled={isExtracting || !selectedMd5 || !isTableConnected}
            className="bg-terracotta hover:bg-terracotta-hover text-ivory font-serif text-lg font-medium px-12 py-4 rounded-lg shadow-sm transition disabled:opacity-40 flex items-center justify-center gap-2 select-none min-w-[280px]"
          >
            {isExtracting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>正在执行 AI 视觉提取...</span>
              </>
            ) : (
              <>
                <span>🪄 立即开始 AI 视觉解析</span>
              </>
            )}
          </button>
          
          {!isTableConnected && (
            <span className="text-[10px] text-stone-gray font-medium">请先在顶部状态栏完成多维表格对齐验证</span>
          )}
          {isTableConnected && !selectedMd5 && (
            <span className="text-[10px] text-stone-gray font-medium">请在 Step 1 选取一个就绪的文档进行提取</span>
          )}
        </div>

        {/* ── STEP 3: Verification & Pusher ── */}
        <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-6 h-6 rounded-full bg-warm-sand text-near-black flex items-center justify-center font-bold text-xs">3</span>
            <h2 className="font-serif font-medium text-xl">数据核对与云端推送</h2>
          </div>

          {/* Error shield response */}
          {extractionError && (
            <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex gap-3 text-xs text-error-crimson mb-6">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-bold">安全审查拦截或请求异常</p>
                <p className="mt-1 leading-relaxed">{extractionError}</p>
              </div>
            </div>
          )}

          {/* Zero-Record Circuit Breaker Warning Card */}
          {extractedIssues.length === 0 && !isExtracting && !extractionError && (
            <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex gap-3 text-xs text-error-crimson mb-6">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-bold">数据零推送熔断保护已激活</p>
                <p className="mt-1 leading-relaxed">
                  ❌ 深度提取未命中任何有效记录（大模型可能生成了空数据或触发了拒绝回答机制）。
                  为防止多维表格被写入空行垃圾数据，系统已自动熔断。
                  请检查您的文件内容、提取字段中文名或提示词配置是否精准。
                </p>
              </div>
            </div>
          )}

          {/* Successful results display */}
          {extractedIssues.length > 0 && (
            <div className="flex flex-col gap-6">
              
              {/* Simple Clean Token Analytics */}
              {tokenUsage && (
                <div className="flex items-center gap-6 bg-warm-sand/20 border border-border-cream rounded-lg p-4 text-xs font-semibold text-olive-gray">
                  <div className="flex items-center gap-2">
                    <span>📊 大模型开销统计:</span>
                  </div>
                  <div>
                    输入 Token <span className="text-near-black font-bold">{tokenUsage.promptTokens?.toLocaleString()}</span>
                  </div>
                  <div className="w-px h-3 bg-border-warm" />
                  <div>
                    输出 Token <span className="text-near-black font-bold">{tokenUsage.completionTokens?.toLocaleString()}</span>
                  </div>
                  <div className="w-px h-3 bg-border-warm" />
                  <div>
                    共计 Token <span className="text-near-black font-bold">{tokenUsage.totalTokens?.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Editable Table Grid */}
              <div className="border border-border-cream rounded-lg bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-parchment border-b border-border-cream">
                        <th className="p-3 font-bold text-near-black w-[40px] text-center">#</th>
                        {fields.map((f, idx) => (
                          <th key={idx} className="p-3 font-bold text-near-black">{f.label || `列_${idx+1}`}</th>
                        ))}
                        <th className="p-3 font-bold text-near-black text-center w-[60px]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-cream">
                      {extractedIssues.map((issue, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-ivory/30 transition">
                          <td className="p-3 font-bold text-stone-gray text-center">{rowIndex + 1}</td>
                          
                          {fields.map((f, colIndex) => {
                            const key = f.key || `field_${colIndex + 1}`;
                            const errKey = `${rowIndex}_${key}`;
                            const isInvalid = !!validationErrors[errKey];

                            return (
                              <td key={colIndex} className="p-2">
                                <div className="relative">
                                  <div 
                                    contentEditable="true"
                                    suppressContentEditableWarning={true}
                                    onBlur={(e) => updateIssueCell(rowIndex, key, e.target.innerText.trim())}
                                    className={`border rounded px-2.5 py-1.5 text-xs outline-none focus:bg-ivory/50 focus:border-terracotta transition min-w-[140px] min-h-[28px] ${
                                      isInvalid ? 'border-red-400 bg-red-50/50' : 'border-transparent hover:border-border-warm hover:bg-parchment/20'
                                    }`}
                                  >
                                    {issue[key] || ''}
                                  </div>
                                  {isInvalid && (
                                    <span className="absolute left-2.5 -bottom-3 text-[8px] text-error-crimson font-medium bg-white px-1 shadow-sm rounded-sm border border-red-100">{validationErrors[errKey]}</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          <td className="p-2 text-center">
                            <button 
                              onClick={() => removeIssueRow(rowIndex)}
                              className="text-stone-gray hover:text-error-crimson p-1.5 rounded transition"
                              title="删除行"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center gap-4">
                <button 
                  onClick={addIssueRow}
                  className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1 transition bg-white"
                >
                  <Plus size={12} />
                  <span>添加空白行记录</span>
                </button>

                <button 
                  onClick={pushToSpreadsheet}
                  disabled={isPushing}
                  className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-6 py-2.5 rounded transition disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                >
                  {isPushing && <Loader2 size={12} className="animate-spin" />}
                  <span>{isPushing ? '正在推送数据...' : '🚀 确认识别无误，正式推送至云端表格'}</span>
                </button>
              </div>

              {/* Push result alerts */}
              {pushResult && (
                <div className={`border rounded-lg p-4 flex gap-3 text-xs ${pushResult.success ? 'border-green-200 bg-green-50/50 text-green-700' : 'border-red-200 bg-red-50/50 text-error-crimson'}`}>
                  {pushResult.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{pushResult.success ? '云端推送成功！' : '写入失败'}</p>
                    <p className="mt-0.5 leading-relaxed">{pushResult.message}</p>
                    {pushResult.success && pushResult.link && (
                      <a 
                        href={pushResult.link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-terracotta font-bold hover:underline inline-flex items-center gap-1 mt-2"
                      >
                        网页端直达云表查看结果 <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </section>

      </main>
    </div>
  );
}
