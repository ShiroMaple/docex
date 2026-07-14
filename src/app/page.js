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
  ArrowRight,
  ArrowLeft,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的安全检查报告解析专家。
你的任务是：根据输入的文档内容（包含文字参考层、表格结构以及视觉截图），提取出所有的安全隐患（问题）。
请依据字段定义完整提取，表格和图片中包含的信息同样重要。
检查日期尽量转化为 YYYY-MM-DD 格式，如无法转化则保持原文。
文档中可能包含多个安全问题，必须区分不同问题，确保返回的 results 数组中的每一项都代表一个独立的安全问题。`;

const DEFAULT_FIELDS = [
  { key: 'projectName', label: '项目名称', desc: '隐患对应的项目或工程名称', example: '', isAdvancedOpen: false },
  { key: 'issueType', label: '问题类型', desc: '安全问题分类，如临时用电、高处作业', example: '', isAdvancedOpen: false },
  { key: 'inspectionArea', label: '检查区域', desc: '问题被发现的具体位置、点位', example: '', isAdvancedOpen: false },
  { key: 'description', label: '问题描述', desc: '安全隐患的现状具体描述', example: '', isAdvancedOpen: false },
  { key: 'rectificationRequirement', label: '整改要求', desc: '整改措施或限期完成的要求意见', example: '', isAdvancedOpen: false },
  { key: 'inspector', label: '检查人员', desc: '发现问题的检查人员姓名', example: '', isAdvancedOpen: false },
  { key: 'inspectionDate', label: '检查日期', desc: '发现隐患的日期 (YYYY-MM-DD)', example: '', isAdvancedOpen: false }
];

const PdfIcon = ({ className = "w-6 h-6" }) => (
  <img src="/icons/pdf.svg" alt="PDF" className={className} />
);

const WordIcon = ({ className = "w-6 h-6" }) => (
  <img src="/icons/word.svg" alt="Word" className={className} />
);

export default function DocumentExtractor() {
  // ── Tab Navigation State ──
  const [activeStep, setActiveStep] = useState(1); // 1 | 2 | 3
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
  const [autoNumber, setAutoNumber] = useState(true);
  const [isConnectingTable, setIsConnectingTable] = useState(false);
  const [tableConnectionError, setTableConnectionError] = useState('');

  const [tableConfigList, setTableConfigList] = useState([]);
  const [selectedTableConfigId, setSelectedTableConfigId] = useState('wps_test');
  const [customTableConfigName, setCustomTableConfigName] = useState('');
  const [tableAppId, setTableAppId] = useState('');
  const [tableAppSecret, setTableAppSecret] = useState('');

  // ── Popover: LLM Connection ──
  const [llmConfig, setLlmConfig] = useState({
    provider: 'XiaoMi',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5',
    apiKey: ''
  });
  const [llmConnected, setLlmConnected] = useState(false);
  const [llmSupportVision, setLlmSupportVision] = useState(false);
  const [activeModelLabel, setActiveModelLabel] = useState('');
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmTestError, setLlmTestError] = useState('');

  const [configList, setConfigList] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('default');
  const [customConfigName, setCustomConfigName] = useState('');

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
  const [extractingProgress, setExtractingProgress] = useState(null); // { percent, currentFile, currentIndex, totalFiles }
  const [fileStatusMap, setFileStatusMap] = useState({}); // { [md5]: 'pending' | 'processing' | 'success' | 'error' }
  const [extractionError, setExtractionError] = useState('');
  const [extractedIssues, setExtractedIssues] = useState([]);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({}); // { rowIndex_fieldKey: errorText }
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [rawLlmResponse, setRawLlmResponse] = useState('');
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);

  // ── Load credentials & configurations ──
  useEffect(() => {
    // Load LLM credentials
    const defaultConf = {
      id: 'default',
      name: '默认配置',
      provider: 'XiaoMi',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      model: 'mimo-v2.5',
      apiKey: '',
      isDefault: true
    };

    const cachedList = localStorage.getItem('docex_llm_config_list');
    let loadedList = [];
    if (cachedList) {
      try {
        loadedList = JSON.parse(cachedList);
      } catch { }
    }

    const hasDefault = loadedList.some(c => c.id === 'default');
    if (!hasDefault) {
      loadedList = [defaultConf, ...loadedList];
    } else {
      loadedList = loadedList.map(c => c.id === 'default' ? defaultConf : c);
    }
    setConfigList(loadedList);

    const activeId = localStorage.getItem('docex_active_llm_config_id') || 'default';
    const activeConfig = loadedList.find(c => c.id === activeId) || defaultConf;
    setLlmConfig({
      provider: activeConfig.provider,
      baseUrl: activeConfig.baseUrl,
      model: activeConfig.model,
      apiKey: activeConfig.apiKey
    });
    setSelectedConfigId(activeConfig.id);
    setCustomConfigName(activeConfig.isDefault ? '' : activeConfig.name);

    // Load Table Configurations
    const defaultWpsConf = {
      id: 'wps_test',
      name: 'WPS测试配置',
      platform: 'wps',
      appId: '',
      appSecret: '',
      url: 'https://365.kdocs.cn/l/cbGbLglUXASe',
      isDefault: true
    };

    const defaultFeishuConf = {
      id: 'feishu_test',
      name: '飞书测试配置',
      platform: 'feishu',
      appId: '',
      appSecret: '',
      url: 'https://dcnxzjtyczo8.feishu.cn/wiki/FJvNwbnCxi6ymuky8bTcRTu2nS6?table=tbla78TDmVdUqIyt&view=vewOBDYdZ3',
      isDefault: true
    };

    const cachedTableList = localStorage.getItem('docex_table_config_list');
    let loadedTableList = [];
    if (cachedTableList) {
      try {
        loadedTableList = JSON.parse(cachedTableList);
      } catch { }
    }

    const hasWpsDefault = loadedTableList.some(c => c.id === 'wps_test');
    const hasFeishuDefault = loadedTableList.some(c => c.id === 'feishu_test');

    if (!hasWpsDefault) loadedTableList.push(defaultWpsConf);
    if (!hasFeishuDefault) loadedTableList.push(defaultFeishuConf);

    loadedTableList = loadedTableList.map(c => {
      if (c.id === 'wps_test') return { ...defaultWpsConf, url: c.url || defaultWpsConf.url };
      if (c.id === 'feishu_test') return { ...defaultFeishuConf, url: c.url || defaultFeishuConf.url };
      return c;
    });

    setTableConfigList(loadedTableList);

    const activeTableId = localStorage.getItem('docex_active_table_config_id') || 'wps_test';
    const activeTableConfig = loadedTableList.find(c => c.id === activeTableId) || defaultWpsConf;

    setPlatform(activeTableConfig.platform || 'wps');
    if (activeTableConfig.platform === 'wps') {
      setWpsUrl(activeTableConfig.url || '');
    } else {
      setFeishuUrl(activeTableConfig.url || '');
    }
    setTableAppId(activeTableConfig.appId || '');
    setTableAppSecret(activeTableConfig.appSecret || '');
    setSelectedTableConfigId(activeTableConfig.id);
    setCustomTableConfigName(activeTableConfig.isDefault ? '' : activeTableConfig.name);

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

  // Auto-connect default LLM presets
  useEffect(() => {
    const isDefaultLlm = selectedConfigId === 'default';
    if (isDefaultLlm) {
      setLlmConnected(true);
      setLlmSupportVision(true);
      setActiveModelLabel('mimo-v2.5 (默认已测试)');
    }
  }, [selectedConfigId]);

  useEffect(() => {
    const isDefaultWps = platform === 'wps' && wpsFileId === 'cbGbLglUXASe';
    const isDefaultFeishu = platform === 'feishu' && feishuAppToken === 'FJvNwbnCxi6ymuky8bTcRTu2nS6' && feishuTableId === 'tbla78TDmVdUqIyt';

    if (isDefaultWps || isDefaultFeishu) {
      verifyTableConnection();
    }
  }, [platform, wpsFileId, feishuAppToken, feishuTableId]);

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
      const tokenMatch = feishuUrl.match(/\/(base|wiki)\/([a-zA-Z0-9_-]+)/);
      setFeishuAppToken(tokenMatch ? tokenMatch[2] : '');

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

    if (tableAppId) query += `&appId=${encodeURIComponent(tableAppId)}`;
    if (tableAppSecret) query += `&appSecret=${encodeURIComponent(tableAppSecret)}`;

    try {
      const res = await fetch(`/api/schema?${query}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '连接多维表格失败');

      setSchemaFields(data.fields || []);
      setTableName(data.sheetName || '数据表');
      setIsTableConnected(true);

      const initMappings = {};
      fields.forEach(f => {
        const match = fuzzyMatchField(f.label, data.fields);
        if (match) {
          initMappings[match] = f.key;
        }
      });

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
        } catch { }
      }

      setFieldMappings(initMappings);

      let updatedList = [...tableConfigList];
      let savedId = selectedTableConfigId;
      const currentUrl = platform === 'wps' ? wpsUrl : feishuUrl;

      if (selectedTableConfigId === 'new') {
        let nameToUse = customTableConfigName.trim();
        if (!nameToUse) {
          const customConfigs = tableConfigList.filter(c => !c.isDefault);
          nameToUse = `自定义表格配置 ${customConfigs.length + 1}`;
        }
        const newId = `table_${Date.now()}`;
        const newConfig = {
          id: newId,
          name: nameToUse,
          platform,
          appId: tableAppId,
          appSecret: tableAppSecret,
          url: currentUrl,
          isDefault: false
        };
        updatedList = [...tableConfigList, newConfig];
        savedId = newId;
        setSelectedTableConfigId(newId);
        setCustomTableConfigName(nameToUse);
      } else {
        updatedList = tableConfigList.map(c => {
          if (c.id === selectedTableConfigId) {
            return {
              ...c,
              platform,
              appId: tableAppId,
              appSecret: tableAppSecret,
              url: currentUrl,
              name: c.isDefault ? c.name : (customTableConfigName.trim() || c.name)
            };
          }
          return c;
        });
      }

      setTableConfigList(updatedList);
      localStorage.setItem('docex_table_config_list', JSON.stringify(updatedList));
      localStorage.setItem('docex_active_table_config_id', savedId);

    } catch (err) {
      setTableConnectionError(err.message);
    } finally {
      setIsConnectingTable(false);
      setIsSchemaLoading(false);
    }
  };

  const handleTableConfigChange = (id) => {
    setSelectedTableConfigId(id);
    if (id === 'new') {
      setPlatform('wps');
      setWpsUrl('');
      setFeishuUrl('');
      setTableAppId('');
      setTableAppSecret('');
      setCustomTableConfigName('');
      resetTableAlignment();
    } else {
      const selected = tableConfigList.find(c => c.id === id);
      if (selected) {
        setPlatform(selected.platform || 'wps');
        if (selected.platform === 'wps') {
          setWpsUrl(selected.url || '');
        } else {
          setFeishuUrl(selected.url || '');
        }
        setTableAppId(selected.appId || '');
        setTableAppSecret(selected.appSecret || '');
        setCustomTableConfigName(selected.isDefault ? '' : selected.name);
        resetTableAlignment();
      }
    }
  };

  const handleDeleteTableConfig = (id) => {
    if (id === 'wps_test' || id === 'feishu_test') return;
    if (!confirm('确定要删除此表格配置吗？')) return;

    const updatedList = tableConfigList.filter(c => c.id !== id);
    setTableConfigList(updatedList);
    localStorage.setItem('docex_table_config_list', JSON.stringify(updatedList));

    setSelectedTableConfigId('wps_test');
    handleTableConfigChange('wps_test');
    showToast('🗑️ 表格配置删除成功，已恢复为默认测试配置');
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

      if (selectedConfigId === 'default') {
        showToast('🎉 默认配置测试连接成功！');
      } else {
        let nameToUse = customConfigName.trim();
        if (!nameToUse) {
          const customConfigs = configList.filter(c => !c.isDefault);
          const nextSeq = customConfigs.length + 1;
          nameToUse = `自定义模型配置 ${nextSeq}`;
        }

        let updatedList = [];
        let savedId = selectedConfigId;

        if (selectedConfigId === 'new') {
          const newId = `config_${Date.now()}`;
          const newConfig = {
            id: newId,
            name: nameToUse,
            provider: llmConfig.provider,
            baseUrl: llmConfig.baseUrl,
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            isDefault: false
          };
          updatedList = [...configList, newConfig];
          savedId = newId;
        } else {
          updatedList = configList.map(c => {
            if (c.id === selectedConfigId) {
              return {
                ...c,
                name: nameToUse,
                provider: llmConfig.provider,
                baseUrl: llmConfig.baseUrl,
                model: llmConfig.model,
                apiKey: llmConfig.apiKey
              };
            }
            return c;
          });
        }

        setConfigList(updatedList);
        setSelectedConfigId(savedId);
        setCustomConfigName(nameToUse);
        localStorage.setItem('docex_llm_config_list', JSON.stringify(updatedList));
        localStorage.setItem('docex_active_llm_config_id', savedId);
        localStorage.setItem('docex_llm_config', JSON.stringify(llmConfig));
        showToast(`🎉 配置 [${nameToUse}] 保存并测试连接成功！`);
      }

    } catch (err) {
      setLlmTestError(err.message);
    } finally {
      setIsTestingLlm(false);
    }
  };

  const handleConfigChange = (id) => {
    setSelectedConfigId(id);
    if (id === 'new') {
      setLlmConfig({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: ''
      });
      setCustomConfigName('');
    } else {
      const selected = configList.find(c => c.id === id);
      if (selected) {
        setLlmConfig({
          provider: selected.provider,
          baseUrl: selected.baseUrl,
          model: selected.model,
          apiKey: selected.apiKey
        });
        setCustomConfigName(selected.isDefault ? '' : selected.name);
      }
    }
  };

  const handleDeleteConfig = (id) => {
    if (id === 'default') return;
    if (!confirm('确定要删除此模型配置吗？')) return;

    const updatedList = configList.filter(c => c.id !== id);
    setConfigList(updatedList);
    localStorage.setItem('docex_llm_config_list', JSON.stringify(updatedList));

    setSelectedConfigId('default');
    const defaultConf = updatedList.find(c => c.id === 'default');
    if (defaultConf) {
      setLlmConfig({
        provider: defaultConf.provider,
        baseUrl: defaultConf.baseUrl,
        model: defaultConf.model,
        apiKey: defaultConf.apiKey
      });
      setCustomConfigName('');
      localStorage.setItem('docex_active_llm_config_id', 'default');
      localStorage.setItem('docex_llm_config', JSON.stringify(defaultConf));
    }
    showToast('🗑️ 配置删除成功，已恢复为默认配置');
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
        showToast('该文档已在队列中，已自动排重');
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
      showToast('该文档已在队列中，已自动排重');
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
    setFields(prev => [...prev, { key: '', label: '', desc: '', example: '', isAdvancedOpen: false }]);
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
    const readyFiles = filesQueue.filter(f => f.status === 'done');
    if (readyFiles.length === 0) {
      alert('请先上传文件或从历史记录中选择至少一个已准备就绪的文档！');
      return;
    }
    if (!isTableConnected) {
      alert('请先点击顶部状态栏的【📊 多维表格】同步并验证云端列头！');
      return;
    }

    setExtractionError('');
    setExtractedIssues([]);
    setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setPushResult(null);
    setRawLlmResponse('');

    // Prompt Security Shield Local Check
    if (checkPromptSecurityLocal(customPrompt)) {
      setExtractionError('⚠️ 安全拦截：检测到潜在的提示词注入攻击或敏感配置泄露风险（禁止索要环境变量、系统文件或执行越狱指令）。');
      setActiveStep(3);
      return;
    }

    // Check fields prompt injection
    const fieldLeak = fields.some(f => checkPromptSecurityLocal(f.label) || checkPromptSecurityLocal(f.desc) || checkPromptSecurityLocal(f.example));
    if (fieldLeak) {
      setExtractionError('⚠️ 安全拦截：检测到提取字段属性描述中含有潜在的越狱或隐私嗅探词汇。');
      setActiveStep(3);
      return;
    }

    // Initialize files status map
    const initialStatus = {};
    readyFiles.forEach(f => {
      initialStatus[f.md5] = 'pending';
    });
    setFileStatusMap(initialStatus);

    // Immediate page transition
    setActiveStep(3);
    setIsExtracting(true);
    setExtractingProgress({
      percent: 0,
      currentFile: readyFiles[0].fileName,
      currentIndex: 1,
      totalFiles: readyFiles.length
    });

    // Precompile keys dynamically if empty
    const processedFields = fields.map((f, idx) => ({
      key: f.key ? f.key.trim() : `field_${idx + 1}`,
      label: f.label || `未命名_${idx + 1}`,
      desc: f.desc || '',
      example: f.example || ''
    }));

    let allExtractedIssues = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTotalTokens = 0;
    let combinedRawContent = "";
    let finalError = null;

    for (let i = 0; i < readyFiles.length; i++) {
      const file = readyFiles[i];
      setFileStatusMap(prev => ({ ...prev, [file.md5]: 'processing' }));
      setExtractingProgress({
        percent: Math.round((i / readyFiles.length) * 100),
        currentFile: file.fileName,
        currentIndex: i + 1,
        totalFiles: readyFiles.length
      });

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            md5: file.md5,
            systemPrompt: customPrompt,
            userPrompt: '请分析该文档并提取结构化字段：',
            fields: processedFields,
            llmConfig
          })
        });
        const data = await res.json();

        // Incrementally update token usage state
        if (data.tokenUsage) {
          totalPromptTokens += data.tokenUsage.promptTokens || 0;
          totalCompletionTokens += data.tokenUsage.completionTokens || 0;
          totalTotalTokens += data.tokenUsage.totalTokens || 0;

          setTokenUsage({
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalTotalTokens
          });
        }

        // Incrementally update raw text response
        if (data.raw) {
          combinedRawContent += `\n/* === 文件: ${file.fileName} (${file.md5}) === */\n${data.raw}\n`;
          setRawLlmResponse(combinedRawContent.trim());
        }

        if (!res.ok) {
          throw new Error(`[文件 ${file.fileName}] ${data.error || '解析模型提取失败'}`);
        }

        const rawItems = data.data || [];
        // Filter out empty items
        const filtered = rawItems.filter(item => {
          return Object.values(item).some(val => val && val.toString().trim() !== '');
        }).map(item => ({
          ...item,
          _fileMd5: file.md5
        }));

        // Dynamic streaming append to table
        setExtractedIssues(prev => [...prev, ...filtered]);
        allExtractedIssues = [...allExtractedIssues, ...filtered];
        setFileStatusMap(prev => ({ ...prev, [file.md5]: 'success' }));

      } catch (err) {
        console.error(`解析文件 ${file.fileName} 失败:`, err);
        finalError = err.message;
        setFileStatusMap(prev => ({ ...prev, [file.md5]: 'error' }));
        break;
      }
    }

    setIsExtracting(false);

    if (finalError) {
      setExtractionError(finalError);
      setExtractingProgress(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentFile: finalError
        };
      });
      showToast(`⚠️ 解析中断：${finalError}`);
      return;
    }

    setExtractingProgress(prev => {
      if (!prev) return null;
      return {
        ...prev,
        percent: 100,
        currentFile: '所有文档处理完毕'
      };
    });

    if (allExtractedIssues.length > 0) {
      showToast('所有文档提取成功！');
    } else {
      showToast('⚠️ 大模型解析结果为空，已安全熔断！');
    }
  };

  const retryExtractionForFile = async (file) => {
    const confirmRetry = window.confirm('将移除下表中相关记录，由大模型重新解析，是否确认？');
    if (!confirmRetry) return;

    if (!isTableConnected) {
      alert('请先连接多维表格！');
      return;
    }

    setIsExtracting(true);
    setExtractionError('');

    // Clear old issues for this specific file
    setExtractedIssues(prev => prev.filter(item => item._fileMd5 !== file.md5));

    // Update status mapping for the file
    setFileStatusMap(prev => ({ ...prev, [file.md5]: 'processing' }));

    const readyFiles = filesQueue.filter(f => f.status === 'done');
    const fileIdx = readyFiles.findIndex(f => f.md5 === file.md5);
    setExtractingProgress({
      percent: Math.round((fileIdx >= 0 ? fileIdx : 0) / readyFiles.length * 100),
      currentFile: file.fileName,
      currentIndex: (fileIdx >= 0 ? fileIdx : 0) + 1,
      totalFiles: readyFiles.length
    });

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
          md5: file.md5,
          systemPrompt: customPrompt,
          userPrompt: '请分析该文档并提取结构化字段：',
          fields: processedFields,
          llmConfig
        })
      });
      const data = await res.json();

      // Accumulate tokens
      if (data.tokenUsage) {
        setTokenUsage(prev => {
          const oldPrompt = prev?.promptTokens || 0;
          const oldCompletion = prev?.completionTokens || 0;
          const oldTotal = prev?.totalTokens || 0;
          return {
            promptTokens: oldPrompt + (data.tokenUsage.promptTokens || 0),
            completionTokens: oldCompletion + (data.tokenUsage.completionTokens || 0),
            totalTokens: oldTotal + (data.tokenUsage.totalTokens || 0)
          };
        });
      }

      // Update raw text response
      if (data.raw) {
        setRawLlmResponse(prev => {
          const header = `/* === 文件: ${file.fileName} (${file.md5}) === */`;
          let cleaned = prev || '';
          const idx = cleaned.indexOf(header);
          if (idx !== -1) {
            const nextIdx = cleaned.indexOf('/* === 文件:', idx + header.length);
            if (nextIdx !== -1) {
              cleaned = cleaned.slice(0, idx) + cleaned.slice(nextIdx);
            } else {
              cleaned = cleaned.slice(0, idx);
            }
          }
          return (cleaned.trim() + `\n\n${header}\n${data.raw}`).trim();
        });
      }

      if (!res.ok) {
        throw new Error(data.error || '解析模型提取失败');
      }

      const rawItems = data.data || [];
      const filtered = rawItems.filter(item => {
        return Object.values(item).some(val => val && val.toString().trim() !== '');
      }).map(item => ({
        ...item,
        _fileMd5: file.md5
      }));

      // Append new issues
      setExtractedIssues(prev => [...prev, ...filtered]);
      setFileStatusMap(prev => ({ ...prev, [file.md5]: 'success' }));
      showToast(`文档 [${file.fileName}] 重新解析成功！`);

    } catch (err) {
      console.error(`重新解析文件 ${file.fileName} 失败:`, err);
      setFileStatusMap(prev => ({ ...prev, [file.md5]: 'error' }));
      setExtractionError(err.message);
      showToast(`⚠️ 重新解析失败: ${err.message}`);
    } finally {
      setIsExtracting(false);
      setExtractingProgress(prev => {
        if (!prev) return null;
        return {
          ...prev,
          percent: 100,
          currentFile: '所有文档处理完毕'
        };
      });
    }
  };

  const exportToExcel = () => {
    if (extractedIssues.length === 0) {
      alert('没有可导出的解析结果！');
      return;
    }

    try {
      const headers = fields.map(f => f.label || '未命名列');
      const dataToExport = extractedIssues.map((issue, idx) => {
        const row = { '序号': idx + 1 };
        fields.forEach((f, colIdx) => {
          const key = f.key || `field_${colIdx + 1}`;
          row[f.label || `列_${colIdx + 1}`] = issue[key] || '';
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "解析结果");

      XLSX.writeFile(workbook, `DocEx_解析结果_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('🎉 Excel 导出成功！');
    } catch (err) {
      console.error('导出 Excel 失败:', err);
      alert(`导出 Excel 失败: ${err.message}`);
    }
  };

  // ── Step 3: Result editing & Pushing ──
  const updateIssueCell = (rowIndex, key, val) => {
    const updated = [...extractedIssues];
    updated[rowIndex][key] = val;
    setExtractedIssues(updated);

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
    if (extractedIssues.length === 0) {
      alert('⚠️ 推送已拦截：检测到解析或表格数据为空，无法将空数据推送到云表。');
      return;
    }
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
          autoNumber,
          appId: tableAppId,
          appSecret: tableAppSecret
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

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const kb = bytes / 1024;
    return kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(1) + ' MB';
  };

  // ── Render Header progress indicators (Wizard Nodes) ──
  const renderWizardIndicator = () => {
    const isStep1Done = filesQueue.length > 0;
    const isStep2Done = extractedIssues.length > 0;
    const isStep3Done = pushResult?.success === true;

    const steps = [
      { number: 1, label: '上传文档', done: isStep1Done },
      { number: 2, label: '配置字段', done: isStep2Done },
      { number: 3, label: '解析结果', done: isStep3Done },
    ];

    let progressWidth = '0%';
    if (activeStep === 2) progressWidth = '50%';
    if (activeStep === 3) progressWidth = '100%';

    return (
      <div className="w-[600px] relative select-none">
        {/* Background connector line */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-warm-sand -translate-y-1/2 z-0">
          {/* Active progress connector line */}
          <div
            className="h-full bg-terracotta transition-all duration-500 ease-in-out"
            style={{ width: progressWidth }}
          />
        </div>

        {/* Circles container */}
        <div className="relative z-10 flex justify-between items-center h-10">
          {steps.map((step) => {
            const isActive = activeStep === step.number;
            const isDone = step.done;

            return (
              <div
                key={step.number}
                onClick={() => {
                  if (step.number === 2 && filesQueue.length === 0) {
                    showToast('请先上传或选择待解析文档！');
                    return;
                  }
                  if (step.number === 3 && extractedIssues.length === 0 && !extractionError) {
                    showToast('请先在第 2 步中执行大模型数据解析提取！');
                    return;
                  }
                  setActiveStep(step.number);
                }}
                className="flex flex-col items-center justify-center cursor-pointer group w-10 h-10 relative"
              >
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300 ${isDone
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : isActive
                      ? 'border-terracotta bg-ivory text-terracotta shadow-[0_0_8px_rgba(201,100,66,0.35)]'
                      : 'border-border-cream bg-warm-sand/30 text-stone-gray group-hover:border-stone-gray'
                    }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} className="text-green-600" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>

                <div className="absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                  <span
                    className={`text-xs transition-all duration-300 tracking-wider ${isActive
                      ? 'text-near-black font-bold'
                      : isDone
                        ? 'text-green-700 font-semibold'
                        : 'text-stone-gray font-semibold'
                      }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📚</span>
            <span className="font-serif font-bold text-lg leading-none tracking-tight">DocEx</span>
            <span className="text-x font-bold tracking-wider text-olive-black bg-warm-sand px-2 py-0.5 rounded-full uppercase">智能结构化提取文档数据</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Popover 1: Table State Dropdown Badge */}
            <div className="relative popover-container">
              <button
                onClick={() => setActivePopover(activePopover === 'table' ? null : 'table')}
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${isTableConnected
                  ? 'border-green-200 bg-green-50/50 text-green-700'
                  : 'border-border-cream text-olive-gray'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${isTableConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{isTableConnected ? `📊 多维表格已连接: ${platform} ${tableName}` : '📊 多维表格未连接'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'table' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">多维表格网关</h4>

                    <div className="flex flex-col gap-3 mb-4">
                      {/* Table config selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">选择表格配置</label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedTableConfigId}
                            onChange={(e) => handleTableConfigChange(e.target.value)}
                            className="flex-1 bg-warm-sand border border-border-warm rounded px-2 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition text-near-black"
                          >
                            {tableConfigList.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            <option value="new">➕ 新建自定义配置</option>
                          </select>
                          {selectedTableConfigId !== 'wps_test' && selectedTableConfigId !== 'feishu_test' && selectedTableConfigId !== 'new' && (
                            <button
                              onClick={() => handleDeleteTableConfig(selectedTableConfigId)}
                              className="p-1.5 rounded border border-border-cream bg-white hover:bg-red-50 text-stone-gray hover:text-error-crimson transition"
                              title="删除该配置"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {selectedTableConfigId !== 'wps_test' && selectedTableConfigId !== 'feishu_test' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">配置命名</label>
                          <input
                            type="text"
                            value={customTableConfigName}
                            onChange={(e) => setCustomTableConfigName(e.target.value)}
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition w-full"
                            placeholder="自定义表格配置名称"
                          />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setPlatform('wps')}
                          className={`flex-1 py-1.5 rounded text-xs font-semibold border transition ${platform === 'wps'
                            ? 'bg-warm-sand border-stone-gray text-near-black'
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                            }`}
                        >
                          WPS 表格
                        </button>
                        <button
                          onClick={() => setPlatform('feishu')}
                          className={`flex-1 py-1.5 rounded text-xs font-semibold border transition ${platform === 'feishu'
                            ? 'bg-warm-sand border-stone-gray text-near-black'
                            : 'bg-ivory border-border-cream text-olive-gray hover:bg-warm-sand/50'
                            }`}
                        >
                          飞书表格
                        </button>
                      </div>

                      {platform === 'wps' ? (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">WPS 协作分享链接</label>
                          <input
                            type="text"
                            value={wpsUrl}
                            onChange={(e) => setWpsUrl(e.target.value)}
                            placeholder="https://365.kdocs.cn/l/xxx"
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">飞书表格分享链接</label>
                          <input
                            type="text"
                            value={feishuUrl}
                            onChange={(e) => setFeishuUrl(e.target.value)}
                            placeholder="https://xxx.feishu.cn/base/xxx"
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">App ID (可选)</label>
                        <input
                          type="text"
                          value={tableAppId}
                          onChange={(e) => setTableAppId(e.target.value)}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="自定凭证 App ID"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">App Secret (可选)</label>
                        <input
                          type="password"
                          value={tableAppSecret}
                          onChange={(e) => setTableAppSecret(e.target.value)}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full"
                          placeholder="自定凭证 App Secret"
                        />
                        <div className="mt-1 flex flex-col gap-1">
                          {platform === 'wps' ? (
                            <a
                              href="https://365.kdocs.cn/3rd/open/developer/home"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] text-terracotta hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <span>WPS开放平台应用配置</span>
                              <ExternalLink size={9} />
                            </a>
                          ) : (
                            <a
                              href="https://open.feishu.cn/app?lang=zh-CN"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] text-terracotta hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <span>飞书开放平台应用配置</span>
                              <ExternalLink size={9} />
                            </a>
                          )}
                          <p className="text-[12px] text-stone-gray leading-tight">
                            💡 提示：文档写入时显示身份为应用或应用所有者
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4 border-t border-border-cream pt-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">自增序号列配置</span>
                        <span className="text-xs text-stone-gray">自动填充云端最后一行索引号</span>
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
                      {isConnectingTable ? '同步校验中...' : '验证权限并同步字段'}
                    </button>

                    {tableConnectionError && (
                      <p className="text-xs text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{tableConnectionError}</p>
                    )}

                    {isTableConnected && (
                      <div className="mt-3 flex justify-end">
                        <a
                          href={platform === 'wps' ? `https://365.kdocs.cn/l/${wpsFileId}` : feishuUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-terracotta font-bold flex items-center gap-1 hover:underline"
                        >
                          打开多维表格页面 <ExternalLink size={10} />
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
                className={`status-badge px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border bg-ivory shadow-sm transition ${llmConnected
                  ? 'border-green-200 bg-green-50/50 text-green-700'
                  : 'border-border-cream text-olive-gray'
                  }`}
              >
                <span className={`w-2 h-2 rounded-full ${llmConnected ? 'bg-green-600 shadow-[0_0_6px_#16a34a]' : 'bg-stone-gray'}`} />
                <span>{llmConnected ? `🤖 模型已验证: ${llmConfig.provider} ${llmConfig.model} (${llmSupportVision ? '多模态模型' : '纯文本模型'})` : '🤖 模型未验证'}</span>
              </button>

              <AnimatePresence>
                {activePopover === 'llm' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 bg-ivory border border-warm-sand rounded-lg p-5 shadow-lg z-50 text-near-black"
                  >
                    <h4 className="font-serif font-medium text-sm border-b border-border-cream pb-2 mb-3">AI模型网关配置</h4>

                    <div className="flex flex-col gap-3 mb-4">
                      {/* Configuration selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">选择模型配置</label>
                        <div className="flex gap-1.5">
                          <select
                            value={selectedConfigId}
                            onChange={(e) => handleConfigChange(e.target.value)}
                            className="flex-1 bg-warm-sand border border-border-warm rounded px-2 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition text-near-black"
                          >
                            {configList.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.isDefault ? '(默认)' : ''}
                              </option>
                            ))}
                            <option value="new">➕ 新建自定义配置</option>
                          </select>
                          {selectedConfigId !== 'default' && selectedConfigId !== 'new' && (
                            <button
                              onClick={() => handleDeleteConfig(selectedConfigId)}
                              className="p-1.5 rounded border border-border-cream bg-white hover:bg-red-50 text-stone-gray hover:text-error-crimson transition"
                              title="删除该配置"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {selectedConfigId !== 'default' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">配置命名</label>
                          <input
                            type="text"
                            value={customConfigName}
                            onChange={(e) => setCustomConfigName(e.target.value)}
                            className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue transition w-full"
                            placeholder="自定义模型配置名称"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">Provider</label>
                        <input
                          type="text"
                          value={llmConfig.provider}
                          onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
                          disabled={selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="openai"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">API Base URL</label>
                        <input
                          type="text"
                          value={llmConfig.baseUrl}
                          onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                          disabled={selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">Model</label>
                        <input
                          type="text"
                          value={llmConfig.model}
                          onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                          disabled={selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
                          placeholder="gpt-4o-mini"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-olive-gray uppercase tracking-wider">API Key</label>
                        <input
                          type="password"
                          value={llmConfig.apiKey}
                          onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                          disabled={selectedConfigId === 'default'}
                          className="bg-warm-sand border border-border-warm rounded px-3 py-1.5 text-xs outline-none focus:bg-ivory focus:border-focus-blue focus:ring-1 focus:ring-focus-blue transition w-full disabled:opacity-60"
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
                      <p className="text-xs text-error-crimson mt-2 bg-red-50 border border-red-100 p-2 rounded">{llmTestError}</p>
                    )}

                    {!llmSupportVision && llmConnected && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-2 rounded mt-2">
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



      {/* ── Main Stream Workspace with Framer Motion Page Switching ── */}
      <main className="max-w-[1440px] mx-auto px-6 mt-4">

        <AnimatePresence mode="wait">
          {activeStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* STEP 1 Card */}
              <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <FileText className="w-5 h-5 text-terracotta" />
                  <h2 className="font-serif font-medium text-lg">步骤 1: 上传或选择待解析文档</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-6">
                  {/* Left side: Upload area (1/2 width) */}
                  <div className="flex flex-col">
                    <div
                      onClick={() => fileInputRef.current.click()}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border border-dashed rounded-lg py-12 px-6 flex flex-col items-center justify-center cursor-pointer transition select-none flex-1 min-h-[200px] ${dragActive
                        ? 'border-terracotta bg-terracotta/[0.02]'
                        : 'border-stone-gray hover:border-terracotta hover:bg-terracotta/[0.01]'
                        }`}
                    >
                      <UploadCloud className="w-10 h-10 text-stone-gray mb-3" />
                      <p className="text-xs font-semibold text-near-black text-center leading-relaxed">
                        拖拽文件到此处，或点击卡片选取，支持同时上传多个文档
                      </p>
                      <p className="text-xs text-stone-gray mt-1 text-center">
                        支持 PDF / DOCX 格式，最高支持容量 50MB
                      </p>
                    </div>
                  </div>

                  {/* Right side: Pending Documents list (1/2 width) */}
                  <div className="flex flex-col bg-warm-sand/15 border border-border-cream rounded-lg p-5">
                    <h3 className="text-xs font-bold text-near-black mb-3">待处理文档队列 ({filesQueue.length})</h3>
                    {filesQueue.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-stone-gray py-8">
                        <span className="text-2xl mb-1">📂</span>
                        <span className="text-xs">暂无待处理文档，请从左侧上传或在下方历史中复用</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 overflow-y-auto max-h-[195px] custom-scrollbar">
                        {filesQueue.map(item => (
                          <div
                            key={item.tempId || item.md5}
                            className="relative bg-white border border-border-cream rounded-lg p-2 flex flex-col items-center justify-between text-center shadow-xs group hover:border-terracotta/40 transition h-[88px] w-full"
                          >
                            {/* Delete button top right */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilesQueue(prev => prev.filter(f => f.md5 !== item.md5));
                              }}
                              className="absolute top-1 right-1 p-1 text-stone-gray hover:text-error-crimson rounded opacity-0 group-hover:opacity-100 transition"
                            >
                              <X size={10} />
                            </button>

                            {/* File Icon */}
                            {item.fileName.toLowerCase().endsWith('.pdf') ? (
                              <PdfIcon className="w-5 h-5 mb-1 flex-shrink-0" />
                            ) : (
                              <WordIcon className="w-5 h-5 mb-1 flex-shrink-0" />
                            )}

                            {/* File Name (line-clamp-2 allows 2-line wrap) */}
                            <p
                              className="text-[10px] font-semibold text-near-black line-clamp-2 break-all px-1 leading-tight flex-1 flex items-center justify-center"
                              title={item.fileName}
                            >
                              {item.fileName}
                            </p>

                            {/* Status / Progress */}
                            {item.status === 'processing' || item.status === 'uploading' || item.status === 'preprocessing' ? (
                              <div className="w-full mt-0.5 px-1 flex-shrink-0">
                                <div className="w-full bg-warm-sand h-1 rounded-full overflow-hidden">
                                  <div className="bg-terracotta h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                                </div>
                                <span className="text-[10px] text-stone-gray font-medium block">
                                  {item.progress}%
                                </span>
                              </div>
                            ) : (
                              <div className="w-full flex flex-col items-center flex-shrink-0 min-h-[22px]">
                                <span 
                                  className={`text-xs font-bold flex items-center gap-0.5 cursor-help ${
                                    item.status === 'done' ? 'text-green-600' : 'text-error-crimson'
                                  }`}
                                  title={item.status === 'failed' ? `失败详情: ${item.error || '解析失败'}` : undefined}
                                >
                                  {item.status === 'done' ? (
                                    '就绪'
                                  ) : (
                                    <>
                                      <span>失败</span>
                                      <AlertTriangle size={10} className="text-error-crimson animate-pulse" />
                                    </>
                                  )}
                                </span>
                                {item.status === 'failed' && (
                                  <span 
                                    className="text-[9px] text-error-crimson truncate w-full px-1 text-center font-medium block max-w-[80px]"
                                    title={item.error}
                                  >
                                    {item.error || '解析失败'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".pdf,.docx"
                  onChange={(e) => handleFilesUpload(e.target.files)}
                />
                {historyFiles.length > 0 && (
                  <div className="mt-6 border-t border-border-cream pt-4">
                    <h3 className="text-xs font-semibold text-olive-gray mb-3 flex items-center gap-1.5">
                      <span>📄 历史已缓存文档 (点击复用无需重复上传)</span>
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {historyFiles.map(file => (
                        <div
                          key={file.md5}
                          onClick={() => reuseHistoryFile(file)}
                          className="flex items-center justify-between p-3 rounded-lg border border-border-cream bg-warm-sand/20 hover:bg-warm-sand/40 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {file.fileName.toLowerCase().endsWith('.pdf') ? (
                              <PdfIcon className="w-5 h-5 flex-shrink-0" />
                            ) : (
                              <WordIcon className="w-5 h-5 flex-shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-near-black truncate" title={file.fileName}>{file.fileName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-stone-gray flex-shrink-0">
                            <button
                              onClick={(e) => deleteHistoryFile(file.md5, e)}
                              className="p-1 rounded text-stone-gray hover:text-error-crimson transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>


            </motion.div>
          )}

          {activeStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* Left column: Matrix Grid (2/3 width) */}
                <div className="lg:col-span-2">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-terracotta" />
                        <h2 className="font-serif font-medium text-lg">步骤 2: 配置字段</h2>
                      </div>

                      <button
                        onClick={() => {
                          if (confirm('是否还原到默认字段矩阵？这将丢失现有配置。')) {
                            setFields(DEFAULT_FIELDS);
                            setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
                          }
                        }}
                        className="text-xs font-semibold text-olive-gray hover:text-near-black bg-warm-sand/50 hover:bg-warm-sand px-3 py-1 rounded transition border border-border-warm"
                      >
                        重置为默认字段
                      </button>
                    </div>

                    <p className="text-xs text-olive-gray mb-6 leading-relaxed">
                      配置您想让大模型提取的字段，并与云端多维表格的目标列进行匹配映射。
                    </p>

                    <div className="border border-border-cream rounded-lg overflow-hidden bg-white mb-6">
                      <table className="w-full border-collapse text-left text-xs table-fixed">
                        <thead>
                          <tr className="bg-parchment border-b border-border-cream">
                            <th className="p-4 font-bold text-near-black w-[22%] whitespace-nowrap">提取字段</th>
                            <th className="p-4 font-bold text-near-black w-[27%] whitespace-nowrap">描述</th>
                            <th className="p-4 font-bold text-near-black w-[23%] whitespace-nowrap">示例</th>
                            <th className="p-4 font-bold text-near-black w-[22%] whitespace-nowrap">多维表字段</th>
                            <th className="p-4 font-bold text-near-black text-center w-[6%] whitespace-nowrap">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-cream">
                          {fields.map((f, index) => {
                            const currentKey = f.key || `field_${index + 1}`;
                            const mappedCol = Object.keys(fieldMappings).find(col => fieldMappings[col] === currentKey);
                            const showMissingAlert = isTableConnected && !mappedCol && f.label;

                            return (
                              <tr key={index} className="hover:bg-ivory/40 transition">
                                {/* Column 1: Label (10%) */}
                                <td className="p-4 align-top">
                                  <input
                                    type="text"
                                    value={f.label}
                                    onChange={(e) => updateFieldCell(index, 'label', e.target.value)}
                                    placeholder="例如: 问题描述"
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full font-semibold"
                                  />
                                </td>

                                {/* Column 2: Description (40%) */}
                                <td className="p-4 align-top">
                                  <textarea
                                    value={f.desc}
                                    onChange={(e) => updateFieldCell(index, 'desc', e.target.value)}
                                    placeholder="该字段的提取要求和约束描述"
                                    rows={2}
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full resize-none font-sans"
                                  />
                                </td>

                                {/* Column 3: Example (35%) */}
                                <td className="p-4 align-top">
                                  <textarea
                                    value={f.example}
                                    onChange={(e) => updateFieldCell(index, 'example', e.target.value)}
                                    placeholder="该字段的规范样例值"
                                    rows={2}
                                    className="bg-warm-sand/30 border border-border-warm rounded px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:border-terracotta focus:ring-1 focus:ring-terracotta transition w-full resize-none font-sans"
                                  />
                                </td>

                                {/* Column 4: Mappings (10%) */}
                                <td className="p-4 align-top">
                                  {isSchemaLoading ? (
                                    <div className="text-xs text-stone-gray flex items-center gap-1.5 py-1.5">
                                      <Loader2 size={12} className="animate-spin" />
                                      <span>同步中...</span>
                                    </div>
                                  ) : isTableConnected ? (
                                    <div className="flex flex-col gap-1.5">
                                      <select
                                        value={mappedCol || ''}
                                        onChange={(e) => {
                                          const oldCol = Object.keys(fieldMappings).find(k => fieldMappings[k] === currentKey);
                                          const newMappings = { ...fieldMappings };
                                          if (oldCol) delete newMappings[oldCol];

                                          if (e.target.value) {
                                            newMappings[e.target.value] = currentKey;
                                          }
                                          setFieldMappings(newMappings);

                                          const targetId = platform === 'wps' ? wpsFileId : `${feishuAppToken}_${feishuTableId}`;
                                          localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(newMappings));
                                        }}
                                        className="bg-warm-sand/30 border border-border-warm rounded pl-2 pr-7 py-1.5 text-xs outline-none cursor-pointer w-full focus:bg-white truncate"
                                      >
                                        <option value="">❌ 不推送</option>
                                        {schemaFields.filter(sf => !sf.isReadOnly).map(sf => (
                                          <option value={sf.name} key={sf.id || sf.name}>
                                            {sf.name}
                                          </option>
                                        ))}
                                      </select>

                                      {showMissingAlert && (
                                        <div className="bg-red-50/50 border border-red-100 rounded p-2 flex flex-col gap-1.5">
                                          <span className="text-xs text-error-crimson font-medium">⚠️ 目标表缺少此列</span>
                                          <button
                                            onClick={() => createTableColumn(f.label)}
                                            className="text-xs font-bold text-terracotta hover:underline text-left"
                                          >
                                            [一键在云端新建 "{f.label}" 列]
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-stone-gray text-xs italic">请先连接顶部多维表格</span>
                                  )}
                                </td>

                                <td className="p-4 align-top text-center">
                                  <button
                                    onClick={() => removeFieldItem(index)}
                                    className="p-1.5 text-stone-gray hover:text-error-crimson rounded transition"
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
                </div>

                {/* Right column: AI Prompt config (1/3 width) */}
                <div className="lg:col-span-1">
                  <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-serif font-medium text-sm flex items-center gap-2">
                        <Sparkles size={16} className="text-terracotta" />
                        AI 提示词微调设置
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (confirm('是否将系统提示词恢复为默认值？')) {
                              setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
                            }
                          }}
                          className="text-xs font-semibold text-olive-gray hover:text-near-black bg-warm-sand/50 hover:bg-warm-sand px-3 py-1 rounded transition border border-border-warm"
                        >
                          恢复默认
                        </button>
                        <button
                          onClick={optimizePrompt}
                          disabled={isOptimizingPrompt || !llmConnected}
                          className="text-xs font-semibold text-terracotta hover:text-terracotta-hover border border-terracotta/30 bg-terracotta/[0.02] px-3 py-1 rounded transition flex items-center gap-1 disabled:opacity-40"
                        >
                          {isOptimizingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                          <span>AI 优化</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="bg-warm-sand/30 border border-border-warm rounded-lg p-4 text-xs outline-none focus:bg-white focus:border-terracotta transition w-full min-h-[300px] font-sans"
                        placeholder="请输入大模型解析提示词..."
                      />
                      <span className="text-xs text-stone-gray leading-normal">
                        * 提示词在输入给大模型之前，会自动追加防注入审查语句规范约束。
                      </span>
                    </div>
                  </section>
                </div>

              </div>
            </motion.div>
          )}

          {activeStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* STEP 3 results card */}
              <section className="bg-ivory border border-border-cream rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <FileCheck className="w-5 h-5 text-terracotta" />
                  <h2 className="font-serif font-medium text-lg">步骤 3: 解析结果</h2>
                </div>

                {/* ⏳ Real-time Extraction Progress indicator */}
                {extractingProgress && (
                  <div className="border border-border-warm bg-warm-sand/10 rounded-xl p-5 mb-6 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-olive-gray font-semibold">
                      <div className="flex items-center gap-2">
                        {isExtracting ? (
                          <Loader2 className="w-4 h-4 text-terracotta animate-spin" />
                        ) : extractionError ? (
                          <AlertTriangle className="w-4 h-4 text-error-crimson" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        )}
                        <span>
                          {isExtracting
                            ? '正在进行 AI 解析提取：'
                            : extractionError
                              ? '⚠️ AI 解析发生异常中断：'
                              : '🎉 所有文档已成功解析提取！'}
                        </span>
                        <span className="text-near-black font-bold">
                          第 {extractingProgress.currentIndex} / {extractingProgress.totalFiles} 个文档
                        </span>
                      </div>
                      <span className={`${extractionError ? 'text-error-crimson' : isExtracting ? 'text-terracotta' : 'text-green-600'} font-bold text-sm`}>
                        {extractingProgress.percent}%
                      </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="w-full bg-warm-sand/40 h-2 rounded-full overflow-hidden border border-border-warm/30">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${extractionError
                          ? 'bg-error-crimson'
                          : isExtracting
                            ? 'bg-terracotta'
                            : 'bg-green-600'
                          }`}
                        style={{ width: `${extractingProgress.percent}%` }}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-olive-gray flex items-center gap-1.5">
                        {isExtracting && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-terracotta animate-ping" />
                        )}
                        <span>
                          {isExtracting
                            ? '当前文档: '
                            : extractionError
                              ? '原因描述: '
                              : '处理结果: '}
                        </span>
                        <strong className={`${extractionError ? 'text-error-crimson' : 'text-near-black'} truncate max-w-md`}>
                          {extractingProgress.currentFile}
                        </strong>
                      </span>

                      {/* File Queue Mini Matrix Status */}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {filesQueue.filter(f => f.status === 'done').map((file, fIdx) => {
                          const status = fileStatusMap[file.md5] || 'pending';
                          let badgeBg = 'bg-stone-gray/10 text-stone-gray';
                          let badgeLabel = '等待中';
                          if (status === 'processing') {
                            badgeBg = 'bg-terracotta/10 text-terracotta border border-terracotta/20 animate-pulse';
                            badgeLabel = '解析中 ⏳';
                          } else if (status === 'success') {
                            badgeBg = 'bg-green-100 text-green-700';
                            badgeLabel = '成功就绪 ';
                          } else if (status === 'error') {
                            badgeBg = 'bg-red-100 text-red-700';
                            badgeLabel = '失败 ❌';
                          }
                          return (
                            <div key={file.md5} className="flex items-center gap-1.5 bg-white border border-border-cream rounded px-2.5 py-1 text-[11px] font-semibold shadow-sm">
                              {file.fileName.toLowerCase().endsWith('.pdf') ? (
                                <PdfIcon className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <WordIcon className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                              <span className="text-near-black truncate max-w-[120px]">{file.fileName}</span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${badgeBg}`}>
                                {badgeLabel}
                              </span>
                              {!isExtracting && (
                                <button
                                  onClick={() => retryExtractionForFile(file)}
                                  title="重新解析此文档"
                                  className="ml-1 p-0.5 rounded text-stone-gray hover:text-terracotta hover:bg-warm-sand/50 transition flex items-center justify-center"
                                >
                                  <RefreshCw size={10} className="hover:rotate-180 transition duration-500" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Local validation warning / LLM error response */}
                {extractionError && (
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex gap-3 text-xs text-error-crimson mb-6">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-bold">安全审查拦截或请求异常</p>
                      <p className="mt-1 leading-relaxed">{extractionError}</p>
                    </div>
                  </div>
                )}

                {/* Circuit Breaker Warning Card */}
                {extractedIssues.length === 0 && !isExtracting && !extractionError && (
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-5 flex flex-col gap-3 text-xs text-error-crimson mb-6">
                    <div className="flex gap-3">
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
                    {rawLlmResponse && (
                      <div className="border-t border-red-100 pt-3 flex justify-start">
                        <button
                          onClick={() => setIsLlmModalOpen(true)}
                          className="bg-red-100/50 hover:bg-red-100 text-error-crimson border border-red-200/50 px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition"
                        >
                          <span>🔍 查看大模型原始 JSON 输出</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(extractedIssues.length > 0 || isExtracting) && (
                  <div className="flex flex-col gap-6">

                    {/* Clean Token stats */}
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

                    {/* Results grid */}
                    <div className="border border-border-cream rounded-lg bg-white shadow-sm overflow-visible">
                      <div className="overflow-visible">
                        <table className="w-full border-collapse text-left text-xs table-fixed">
                          <thead className="sticky top-16 z-10 bg-parchment border-b border-border-cream shadow-[0_1px_0_0_#e8e6dc] [&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg">
                            <tr>
                              <th className="p-3 font-bold text-near-black w-[4%] text-center whitespace-nowrap">#</th>
                              {fields.map((f, idx) => {
                                const dataColWidth = fields.length > 0 ? `${(90 / fields.length).toFixed(2)}%` : '90%';
                                return (
                                  <th key={idx} style={{ width: dataColWidth }} className="p-3 font-bold text-near-black truncate" title={f.label}>
                                    {f.label || `列_${idx + 1}`}
                                  </th>
                                );
                              })}
                              <th className="p-3 font-bold text-near-black text-center w-[6%] whitespace-nowrap">操作</th>
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
                                    <td key={colIndex} className="p-2 align-top">
                                      <div className="relative">
                                        <div
                                          contentEditable="true"
                                          suppressContentEditableWarning={true}
                                          onBlur={(e) => updateIssueCell(rowIndex, key, e.target.innerText.trim())}
                                          className={`border rounded px-2.5 py-1.5 text-xs outline-none focus:bg-ivory/50 focus:border-terracotta transition min-h-[28px] break-words whitespace-normal leading-relaxed ${isInvalid ? 'border-red-400 bg-red-50/50' : 'border-transparent hover:border-border-warm hover:bg-parchment/20'
                                            }`}
                                        >
                                          {issue[key] || ''}
                                        </div>
                                        {isInvalid && (
                                          <span className="absolute left-2.5 -bottom-3 text-[10px] text-error-crimson font-medium bg-white px-1 shadow-sm rounded-sm border border-red-100">{validationErrors[errKey]}</span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}

                                <td className="p-2 text-center align-top">
                                  <button
                                    onClick={() => removeIssueRow(rowIndex)}
                                    className="text-stone-gray hover:text-error-crimson p-1.5 rounded transition mt-0.5"
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

                    {/* Action buttons */}
                    <div className="flex justify-between items-center gap-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {extractedIssues.length > 0 && (
                          <span className="text-xs bg-warm-sand/80 text-olive-gray font-semibold px-3 py-2 rounded border border-border-cream mr-1">
                            共 {extractedIssues.length} 条记录
                          </span>
                        )}
                        <button
                          onClick={addIssueRow}
                          className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1 transition bg-white shadow-sm"
                        >
                          <Plus size={12} />
                          <span>添加空白行记录</span>
                        </button>

                        {extractedIssues.length > 0 && (
                          <button
                            onClick={exportToExcel}
                            className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1 transition bg-white shadow-sm"
                          >
                            <Download size={12} />
                            <span>导出为 Excel</span>
                          </button>
                        )}

                        {rawLlmResponse && (
                          <button
                            onClick={() => setIsLlmModalOpen(true)}
                            className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
                          >
                            <span>🤖 查看 LLM 原始输出</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Push feedback results */}
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
                              前往多维表格查看结果 <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* ── Sticky Bottom Action Bar ── */}
      <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-border-cream bg-[#f5f4ed]/85 backdrop-blur-md pt-5 pb-9 shadow-[0_-4px_12px_rgba(20,20,19,0.03)] mt-12">
        <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-3 items-center">

          {/* Left Side Buttons */}
          <div className="flex justify-start">
            {activeStep === 2 && (
              <button
                onClick={() => setActiveStep(1)}
                className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>返回上一步</span>
              </button>
            )}
            {activeStep === 3 && (
              <button
                onClick={() => setActiveStep(2)}
                className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-white shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>返回上一步</span>
              </button>
            )}
          </div>

          {/* Center: Progress indicators */}
          <div className="flex justify-center">
            {renderWizardIndicator()}
          </div>

          {/* Right Side Buttons */}
          <div className="flex justify-end">
            {activeStep === 1 && (
              <button
                onClick={() => {
                  if (filesQueue.length === 0) {
                    showToast('请先上传或选择待解析文档！');
                    return;
                  }
                  setActiveStep(2);
                }}
                className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-8 py-2.5 rounded transition flex items-center gap-1.5 shadow-sm animate-pulse hover:animate-none"
              >
                <span>下一步：配置字段</span>
                <ArrowRight size={14} />
              </button>
            )}

            {activeStep === 2 && (
              <button
                onClick={startExtraction}
                disabled={isExtracting || filesQueue.filter(f => f.status === 'done').length === 0 || !isTableConnected}
                className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-8 py-2.5 rounded transition flex items-center gap-1.5 shadow-sm animate-pulse disabled:opacity-40"
              >
                {isExtracting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>解析中...</span>
                  </>
                ) : (
                  <>
                    <span>下一步：开始解析</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            )}

            {activeStep === 3 && extractedIssues.length > 0 && (
              <button
                onClick={pushToSpreadsheet}
                disabled={isPushing}
                className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-6 py-2.5 rounded transition disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
              >
                {isPushing && <Loader2 size={12} className="animate-spin" />}
                <span>{isPushing ? '正在推送数据...' : '已核对识别结果，推送至多维表格'}</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── LLM Raw Output Modal ── */}
      <AnimatePresence>
        {isLlmModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-ivory border border-warm-sand w-full max-w-2xl rounded-xl p-6 shadow-2xl text-near-black flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-border-cream pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <h3 className="font-serif font-bold text-base">大模型原始 JSON 响应报文</h3>
                </div>
                <button
                  onClick={() => setIsLlmModalOpen(false)}
                  className="text-stone-gray hover:text-near-black p-1 hover:bg-warm-sand/50 rounded transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-auto bg-warm-sand/30 border border-border-cream p-4 rounded-lg custom-scrollbar">
                <pre className="text-xs font-mono text-near-black whitespace-pre-wrap break-all leading-relaxed select-text">
                  {rawLlmResponse}
                </pre>
              </div>

              <div className="flex justify-end gap-3 mt-4 border-t border-border-cream pt-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rawLlmResponse);
                    showToast('已复制到剪贴板！');
                  }}
                  className="border border-stone-gray hover:border-near-black text-olive-gray hover:text-near-black px-4 py-2 rounded text-xs font-semibold transition bg-white"
                >
                  复制 JSON 内容
                </button>
                <button
                  onClick={() => setIsLlmModalOpen(false)}
                  className="bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold px-4 py-2 rounded transition"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
