// ── State Management ──
let state = {
  activeProvider: 'wps', // 'wps' | 'feishu'
  currentFile: null,
  
  // WPS Configurations
  wpsUrl: 'https://365.kdocs.cn/l/cbGbLglUXASe?R=L1MvMQ==',
  wpsFileId: '',
  
  // Feishu Configurations
  feishuUrl: 'https://cli-aac44e92a2b89bd5.feishu.cn/base/FJvNwbnCxi6ymuky8bTcRTu2nS6?table=tbla78TDmVdUqIyt',
  feishuAppToken: '',
  feishuTableId: '',
  
  // Schema & Fields
  schemaFields: [], // Array<{id, name, type, isReadOnly}>
  fieldMapping: {}, // { wps/feishuFieldName: docexKey }
  
  // Extracted Data
  issues: [],
  tokenUsage: null
};

// ── Document Fields Schema ──
const DOCEX_FIELDS = [
  { key: 'projectName',            label: '项目名称', desc: '隐患对应的项目或工程名称' },
  { key: 'issueType',              label: '问题类型', desc: '安全问题分类，如临时用电、高处作业' },
  { key: 'inspectionArea',         label: '检查区域', desc: '问题被发现的具体位置、点位或区域' },
  { key: 'description',            label: '问题描述', desc: '安全隐患的现状具体描述' },
  { key: 'rectificationRequirement', label: '整改要求', desc: '整改措施或限期完成的要求意见' },
  { key: 'inspector',              label: '检查人员', desc: '发现问题的检查人员姓名' },
  { key: 'inspectionDate',         label: '检查日期', desc: '发现隐患的日期 (YYYY-MM-DD)' }
];

// ── Fuzzy Keyword Matchers ──
const FIELD_KEYWORDS = {
  projectName:           ['项目', '工程', '项目名', '工程名'],
  issueType:             ['类型', '隐患类型', '问题类型', '安全类型', '类别'],
  inspectionArea:        ['区域', '检查区域', '位置', '地点', '部位'],
  description:           ['描述', '问题描述', '隐患描述', '内容', '情况'],
  rectificationRequirement: ['整改', '整改要求', '整改措施', '整改内容', '要求'],
  inspector:             ['检查人', '检查人员', '巡检人', '记录人', '人员'],
  inspectionDate:        ['日期', '检查日期', '时间', '发现时间', '巡检日期'],
};

// ── DOM References ──
const elements = {
  tabWps: document.getElementById('tab-wps'),
  tabFeishu: document.getElementById('tab-feishu'),
  wpsConfigGroup: document.getElementById('wps-config-group'),
  feishuConfigGroup: document.getElementById('feishu-config-group'),
  
  inputWpsUrl: document.getElementById('wps-url-input'),
  inputFeishuUrl: document.getElementById('feishu-url-input'),
  badgeWpsFileId: document.getElementById('wps-fileid-text'),
  badgeFeishuAppToken: document.getElementById('feishu-apptoken-text'),
  badgeFeishuTableId: document.getElementById('feishu-tableid-text'),
  
  btnVerify: document.getElementById('btn-verify-conn'),
  verifyStatus: document.getElementById('verify-status-badge'),
  verifyStatusText: document.getElementById('verify-status-text'),
  
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  filePreview: document.getElementById('file-preview'),
  previewName: document.getElementById('preview-name'),
  previewSize: document.getElementById('preview-size'),
  btnRemoveFile: document.getElementById('remove-file-btn'),
  
  mappingPanel: document.getElementById('mapping-panel'),
  mappingGrid: document.getElementById('mapping-grid'),
  
  btnStart: document.getElementById('btn-start-extract'),
  progressContainer: document.getElementById('progress-container'),
  progressBar: document.getElementById('progress-bar'),
  progressStatus: document.getElementById('progress-status-text'),
  progressPercentage: document.getElementById('progress-percent'),
  
  flowStepTarget: document.getElementById('fs-target'),
  flowStepExtract: document.getElementById('fs-extract'),
  flowStepMap: document.getElementById('fs-map'),
  flowStepDone: document.getElementById('fs-done'),
  
  resultSection: document.getElementById('result-section'),
  issuesTbody: document.getElementById('issues-tbody'),
  issuesCount: document.getElementById('issues-count'),
  metricPrompt: document.getElementById('metric-prompt'),
  metricCompletion: document.getElementById('metric-completion'),
  metricTotal: document.getElementById('metric-total'),
  
  btnAddRow: document.getElementById('btn-add-row'),
  btnPush: document.getElementById('btn-push-records'),
  pushResult: document.getElementById('push-result-box'),
  pushResultText: document.getElementById('push-result-text')
};

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupUrlListeners();
  setupUploadZone();
  setupVerifyConnection();
  setupCoreActions();
  
  // Set default values and parse
  updateWpsParsing();
  updateFeishuParsing();
});

// ── Tab Toggling ──
function setupTabs() {
  elements.tabWps.addEventListener('click', () => {
    state.activeProvider = 'wps';
    elements.tabWps.classList.add('active');
    elements.tabFeishu.classList.remove('active');
    elements.wpsConfigGroup.style.display = 'flex';
    elements.feishuConfigGroup.style.display = 'none';
    resetConnectionStatus();
    updateButtonsState();
  });
  
  elements.tabFeishu.addEventListener('click', () => {
    state.activeProvider = 'feishu';
    elements.tabFeishu.classList.add('active');
    elements.tabWps.classList.remove('active');
    elements.feishuConfigGroup.style.display = 'flex';
    elements.wpsConfigGroup.style.display = 'none';
    resetConnectionStatus();
    updateButtonsState();
  });
}

// ── URL Parsing ──
function setupUrlListeners() {
  elements.inputWpsUrl.addEventListener('input', updateWpsParsing);
  elements.inputFeishuUrl.addEventListener('input', updateFeishuParsing);
}

function updateWpsParsing() {
  const url = elements.inputWpsUrl.value.trim();
  state.wpsUrl = url;
  if (url) {
    const match = url.match(/\/l\/([^?#/]+)/);
    state.wpsFileId = match ? match[1] : url;
    elements.badgeWpsFileId.textContent = state.wpsFileId;
    elements.badgeWpsFileId.parentElement.style.display = 'inline-flex';
  } else {
    state.wpsFileId = '';
    elements.badgeWpsFileId.parentElement.style.display = 'none';
  }
  resetConnectionStatus();
  updateButtonsState();
}

function updateFeishuParsing() {
  const url = elements.inputFeishuUrl.value.trim();
  state.feishuUrl = url;
  if (url) {
    // Match AppToken: https://xxx.feishu.cn/base/bascnXXXXXXXXXX
    const tokenMatch = url.match(/\/base\/([a-zA-Z0-9]+)/);
    state.feishuAppToken = tokenMatch ? tokenMatch[1] : '';
    
    // Match TableId from query param: ?table=tblXXXXXXXX
    try {
      const urlObj = new URL(url);
      state.feishuTableId = urlObj.searchParams.get('table') || '';
    } catch (e) {
      // If it is raw inputs rather than URL
      const tableMatch = url.match(/[?&]table=([a-zA-Z0-9]+)/);
      state.feishuTableId = tableMatch ? tableMatch[1] : '';
    }
    
    // Support parsing if they passed directly as appToken
    if (!state.feishuAppToken && url.length > 20 && !url.includes('/')) {
      state.feishuAppToken = url;
    }
    
    if (state.feishuAppToken) {
      elements.badgeFeishuAppToken.textContent = state.feishuAppToken;
      elements.badgeFeishuAppToken.parentElement.style.display = 'inline-flex';
    } else {
      elements.badgeFeishuAppToken.parentElement.style.display = 'none';
    }

    if (state.feishuTableId) {
      elements.badgeFeishuTableId.textContent = state.feishuTableId;
      elements.badgeFeishuTableId.parentElement.style.display = 'inline-flex';
    } else {
      elements.badgeFeishuTableId.parentElement.style.display = 'none';
    }
  } else {
    state.feishuAppToken = '';
    state.feishuTableId = '';
    elements.badgeFeishuAppToken.parentElement.style.display = 'none';
    elements.badgeFeishuTableId.parentElement.style.display = 'none';
  }
  resetConnectionStatus();
  updateButtonsState();
}

function resetConnectionStatus() {
  elements.verifyStatus.className = 'connection-badge';
  elements.verifyStatusText.textContent = '未同步';
  elements.verifyStatus.style.display = 'none';
  state.schemaFields = [];
  elements.mappingPanel.style.display = 'none';
  setStepCompleted(elements.flowStepTarget, false);
  setStepCompleted(elements.flowStepMap, false);
}

// ── Upload Handlers ──
function setupUploadZone() {
  elements.dropzone.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', e => handleSelectedFile(e.target.files[0]));
  
  elements.dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    elements.dropzone.classList.add('drag-over');
  });
  elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('drag-over'));
  elements.dropzone.addEventListener('drop', e => {
    e.preventDefault();
    elements.dropzone.classList.remove('drag-over');
    handleSelectedFile(e.dataTransfer.files[0]);
  });
  
  elements.btnRemoveFile.addEventListener('click', () => {
    state.currentFile = null;
    elements.fileInput.value = '';
    elements.filePreview.style.display = 'none';
    elements.dropzone.style.display = 'block';
    updateButtonsState();
  });
}

function handleSelectedFile(file) {
  if (!file) return;
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['pdf', 'docx'].includes(ext)) {
    showErrorAlert('仅支持 PDF 和 DOCX 格式的文件。');
    return;
  }
  
  state.currentFile = file;
  elements.previewName.textContent = file.name;
  
  // Format Size
  const kb = file.size / 1024;
  elements.previewSize.textContent = kb < 1024 ? kb.toFixed(1) + ' KB' : (kb/1024).toFixed(1) + ' MB';
  
  elements.filePreview.style.display = 'flex';
  elements.dropzone.style.display = 'none';
  updateButtonsState();
}

// ── Buttons State ──
function updateButtonsState() {
  const hasFile = !!state.currentFile;
  let hasTarget = false;
  
  if (state.activeProvider === 'wps') {
    hasTarget = !!state.wpsFileId;
  } else {
    hasTarget = !!state.feishuAppToken && !!state.feishuTableId;
  }
  
  elements.btnVerify.disabled = !hasTarget;
  elements.btnStart.disabled = !(hasFile && hasTarget && state.schemaFields.length > 0);
}

// ── Schema Sync & Verify ──
function setupVerifyConnection() {
  elements.btnVerify.addEventListener('click', async () => {
    let params = `provider=${state.activeProvider}&force=true`;
    if (state.activeProvider === 'wps') {
      params += `&fileId=${state.wpsFileId}`;
    } else {
      params += `&appToken=${state.feishuAppToken}&tableId=${state.feishuTableId}`;
    }
    
    elements.btnVerify.disabled = true;
    elements.btnVerify.innerHTML = '<span class="spinner"></span> 验证中...';
    
    try {
      const response = await fetch(`/api/schema?${params}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || '验证失败');
      
      state.schemaFields = data.fields || [];
      
      // Update UI
      elements.verifyStatus.className = 'connection-badge connected';
      elements.verifyStatusText.textContent = `已连接 (表：${data.sheetName || '默认表'})`;
      elements.verifyStatus.style.display = 'inline-flex';
      setStepCompleted(elements.flowStepTarget, true);
      
      // Build visual column mapper
      renderMappingBoard();
      elements.mappingPanel.style.display = 'block';
      setStepCompleted(elements.flowStepMap, true);
      
      // Save configuration mapping to localStorage
      loadSavedMapping();
      
    } catch (err) {
      elements.verifyStatus.className = 'connection-badge disconnected';
      elements.verifyStatusText.textContent = `连接失败: ${err.message}`;
      elements.verifyStatus.style.display = 'inline-flex';
      showErrorAlert(`多维表格连接失败！请确认：\n1. 分享链接与应用权限配置正确\n2. 环境变量（Client Credentials）有效\n\n报错详情: ${err.message}`);
    } finally {
      elements.btnVerify.disabled = false;
      elements.btnVerify.innerHTML = '🔗 验证并同步字段';
      updateButtonsState();
    }
  });
}

// ── Visual Column Mapper ──
function renderMappingBoard() {
  elements.mappingGrid.innerHTML = '';
  
  DOCEX_FIELDS.forEach(field => {
    const row = document.createElement('div');
    row.className = 'mapping-row';
    
    // Label / Desc
    const docFieldWrap = document.createElement('div');
    docFieldWrap.className = 'mapping-doc-field';
    docFieldWrap.innerHTML = `
      <div class="mapping-doc-name">${field.label}</div>
      <div class="mapping-doc-desc">${field.desc}</div>
    `;
    row.appendChild(docFieldWrap);
    
    // Arrow
    const arrow = document.createElement('div');
    arrow.className = 'mapping-arrow';
    arrow.innerHTML = '➜';
    row.appendChild(arrow);
    
    // Dropdown Select
    const selectContainer = document.createElement('div');
    selectContainer.className = 'mapping-select-container';
    
    const select = document.createElement('select');
    select.className = 'mapping-select';
    select.dataset.key = field.key;
    
    // Blank option
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '❌ 不推送此字段';
    select.appendChild(blankOpt);
    
    // Load fields options (filtering out read-only fields visually or marking them)
    state.schemaFields.forEach(sf => {
      const opt = document.createElement('option');
      opt.value = sf.name;
      opt.textContent = sf.isReadOnly ? `🔒 ${sf.name} (只读)` : sf.name;
      if (sf.isReadOnly) {
        opt.disabled = true; // Prevents choosing system read-only columns
      }
      select.appendChild(opt);
    });
    
    // Perform Fuzzy matching logic
    const matchedFieldName = performFuzzyMatch(field.key, state.schemaFields);
    if (matchedFieldName) {
      select.value = matchedFieldName;
      state.fieldMapping[matchedFieldName] = field.key;
    }
    
    select.addEventListener('change', () => {
      // Rebuild mapping from all selects
      rebuildMappingsFromUI();
    });
    
    selectContainer.appendChild(select);
    row.appendChild(selectContainer);
    elements.mappingGrid.appendChild(row);
  });
  
  rebuildMappingsFromUI();
}

function performFuzzyMatch(docexKey, schemaFields) {
  const keywords = FIELD_KEYWORDS[docexKey] || [];
  // Find fields that are not read-only
  const writeableFields = schemaFields.filter(sf => !sf.isReadOnly);
  
  for (const field of writeableFields) {
    const name = field.name.toLowerCase();
    if (keywords.some(kw => name.includes(kw.toLowerCase()))) {
      return field.name;
    }
  }
  return '';
}

function rebuildMappingsFromUI() {
  const selects = elements.mappingGrid.querySelectorAll('.mapping-select');
  state.fieldMapping = {};
  
  selects.forEach(select => {
    const key = select.dataset.key;
    const val = select.value;
    if (val) {
      state.fieldMapping[val] = key;
    }
  });
  
  // Save mapping selection to LocalStorage for persistence
  const targetId = state.activeProvider === 'wps' ? state.wpsFileId : `${state.feishuAppToken}_${state.feishuTableId}`;
  localStorage.setItem(`docex_mapping_${targetId}`, JSON.stringify(state.fieldMapping));
}

function loadSavedMapping() {
  const targetId = state.activeProvider === 'wps' ? state.wpsFileId : `${state.feishuAppToken}_${state.feishuTableId}`;
  const saved = localStorage.getItem(`docex_mapping_${targetId}`);
  if (!saved) return;
  
  try {
    const mapping = JSON.parse(saved);
    const selects = elements.mappingGrid.querySelectorAll('.mapping-select');
    
    selects.forEach(select => {
      const key = select.dataset.key;
      // Find name that maps to this key
      const mappedFieldName = Object.keys(mapping).find(fieldName => mapping[fieldName] === key);
      // Make sure it is present and not read-only
      const schemaField = state.schemaFields.find(sf => sf.name === mappedFieldName);
      if (mappedFieldName && schemaField && !schemaField.isReadOnly) {
        select.value = mappedFieldName;
      }
    });
    
    rebuildMappingsFromUI();
  } catch (e) {
    console.warn('读取持久化映射失败:', e);
  }
}

// ── Core Actions: Parse, Edit, Validate, and Push ──
function setupCoreActions() {
  // START PARSING
  elements.btnStart.addEventListener('click', async () => {
    if (!state.currentFile) return;
    
    // UI states reset
    elements.resultSection.style.display = 'none';
    elements.pushResult.style.display = 'none';
    elements.progressContainer.style.display = 'block';
    
    setStepActive(elements.flowStepExtract, true);
    setStepCompleted(elements.flowStepDone, false);
    
    elements.btnStart.disabled = true;
    elements.btnStart.innerHTML = '<span class="spinner"></span> 正在深度解析...';
    
    // Form payload
    const fd = new FormData();
    fd.append('file', state.currentFile);
    fd.append('provider', state.activeProvider);
    
    if (state.activeProvider === 'wps') {
      fd.append('fileId', state.wpsFileId);
    } else {
      fd.append('appToken', state.feishuAppToken);
      fd.append('tableId', state.feishuTableId);
    }
    
    updateProgress(15, '正在上传文件与文档提取...');
    
    try {
      const resp = await fetch('/api/upload', {
        method: 'POST',
        body: fd
      });
      const data = await resp.json();
      
      if (!resp.ok) throw new Error(data.error || '解析失败');
      
      updateProgress(65, '大模型正结合图片与文字进行混合提取...');
      await new Promise(r => setTimeout(r, 600)); // Smooth state visual
      
      updateProgress(100, `✅ 解析完成，发现 ${data.issues.length} 条安全隐患`);
      
      // Update state
      state.issues = data.issues || [];
      state.tokenUsage = data.tokenUsage;
      
      // Mark flow completed
      setStepCompleted(elements.flowStepExtract, true);
      setStepCompleted(elements.flowStepDone, true);
      
      // Render Results
      renderTable(state.issues);
      renderAnalytics();
      
      elements.resultSection.style.display = 'block';
      elements.resultSection.scrollIntoView({ behavior: 'smooth' });
      
    } catch (err) {
      updateProgress(0, `❌ 错误: ${err.message}`, true);
      showErrorAlert(`文档解析遇到错误，请检查后台日志。\n原因: ${err.message}`);
    } finally {
      elements.btnStart.disabled = false;
      elements.btnStart.innerHTML = '🚀 深度多模态解析';
      updateButtonsState();
    }
  });
  
  // ADD ROW
  elements.btnAddRow.addEventListener('click', () => {
    const blank = {
      projectName: '',
      issueType: '',
      inspectionArea: '',
      description: '',
      rectificationRequirement: '',
      inspector: '',
      inspectionDate: getTodayString()
    };
    state.issues.push(blank);
    renderTable(state.issues);
    elements.issuesCount.textContent = `${state.issues.length} 条`;
  });
  
  // PUSH RECORDS
  elements.btnPush.addEventListener('click', async () => {
    if (state.issues.length === 0) {
      showErrorAlert('数据为空，请新增或提取数据！');
      return;
    }
    
    // Front validation check
    const hasInvalid = validateAllIssuesInTable();
    if (hasInvalid) {
      showErrorAlert('表格中存在不合规的数据格式（例如检查日期非 YYYY-MM-DD 格式），已用红色标红，请修正后再进行推送！');
      return;
    }
    
    elements.btnPush.disabled = true;
    elements.btnPush.innerHTML = '<span class="spinner"></span> 正在推送至多维表格...';
    elements.pushResult.style.display = 'none';
    
    const body = {
      provider: state.activeProvider,
      issues: state.issues,
      fieldMapping: state.fieldMapping
    };
    
    if (state.activeProvider === 'wps') {
      body.fileId = state.wpsFileId;
    } else {
      body.appToken = state.feishuAppToken;
      body.tableId = state.feishuTableId;
    }
    
    try {
      const resp = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      
      if (!resp.ok) throw new Error(data.error || '网络或接口故障');
      
      elements.pushResult.className = 'push-result-box success';
      elements.pushResultText.textContent = `成功将 ${data.insertedCount} 条记录推送到 ${state.activeProvider === 'wps' ? 'WPS' : '飞书'} 多维表格！`;
      elements.pushResult.style.display = 'flex';
      
    } catch (err) {
      elements.pushResult.className = 'push-result-box error';
      elements.pushResultText.textContent = `推送失败: ${err.message}`;
      elements.pushResult.style.display = 'flex';
    } finally {
      elements.btnPush.disabled = false;
      elements.btnPush.innerHTML = '📤 推送到多维表格';
    }
  });
}

// ── Rendering & Helper Functions ──
function renderTable(issues) {
  elements.issuesTbody.innerHTML = '';
  
  if (issues.length === 0) {
    elements.issuesTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;color:var(--text-dark);padding:30px;">
          📭 无数据，请新增行或重新提取。
        </td>
      </tr>
    `;
    elements.issuesCount.textContent = '0 条';
    return;
  }
  
  elements.issuesCount.textContent = `${issues.length} 条`;
  
  issues.forEach((issue, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    
    // index cell
    const tdIndex = document.createElement('td');
    tdIndex.textContent = idx + 1;
    tdIndex.style.color = 'var(--text-dark)';
    tdIndex.style.fontWeight = '700';
    tr.appendChild(tdIndex);
    
    // fields cells
    DOCEX_FIELDS.forEach(f => {
      const td = document.createElement('td');
      
      const div = document.createElement('div');
      div.className = 'cell-editable';
      div.contentEditable = 'true';
      div.textContent = issue[f.key] ?? '';
      div.dataset.key = f.key;
      
      // Front validation on blur
      div.addEventListener('blur', () => {
        const val = div.textContent.trim();
        state.issues[idx][f.key] = val;
        validateCell(div, f.key, val);
      });
      
      td.appendChild(div);
      tr.appendChild(td);
    });
    
    // delete action
    const tdAct = document.createElement('td');
    tdAct.style.textAlign = 'center';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'remove-file-btn';
    delBtn.innerHTML = '🗑';
    delBtn.title = '删除此行';
    delBtn.addEventListener('click', () => {
      state.issues.splice(idx, 1);
      renderTable(state.issues);
    });
    
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);
    
    elements.issuesTbody.appendChild(tr);
    
    // Perform initial validation scan
    const dateDiv = tr.querySelector(`[data-key="inspectionDate"]`);
    if (dateDiv) {
      validateCell(dateDiv, 'inspectionDate', issue.inspectionDate || '');
    }
  });
}

function validateCell(div, key, val) {
  // Clear previous validation error tip if any
  const parent = div.parentElement;
  const oldTip = parent.querySelector('.validation-error-tip');
  if (oldTip) oldTip.remove();
  div.classList.remove('invalid-field');
  
  if (key === 'inspectionDate') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (val && !dateRegex.test(val)) {
      div.classList.add('invalid-field');
      const tip = document.createElement('span');
      tip.className = 'validation-error-tip';
      tip.textContent = '格式需为 YYYY-MM-DD';
      parent.appendChild(tip);
      return false;
    }
  }
  return true;
}

function validateAllIssuesInTable() {
  const cells = elements.issuesTbody.querySelectorAll('.cell-editable[data-key="inspectionDate"]');
  let hasInvalid = false;
  cells.forEach(cell => {
    const val = cell.textContent.trim();
    const isValid = validateCell(cell, 'inspectionDate', val);
    if (!isValid) hasInvalid = true;
  });
  return hasInvalid;
}

function renderAnalytics() {
  if (!state.tokenUsage) {
    elements.metricPrompt.textContent = '-';
    elements.metricCompletion.textContent = '-';
    elements.metricTotal.textContent = '-';
    return;
  }
  
  elements.metricPrompt.textContent = state.tokenUsage.promptTokens?.toLocaleString() || '-';
  elements.metricCompletion.textContent = state.tokenUsage.completionTokens?.toLocaleString() || '-';
  elements.metricTotal.textContent = state.tokenUsage.totalTokens?.toLocaleString() || '-';
}

function updateProgress(percent, status, isError = false) {
  elements.progressBar.style.width = percent + '%';
  elements.progressStatus.textContent = status;
  elements.progressPercentage.textContent = percent + '%';
  
  if (isError) {
    elements.progressBar.style.background = 'var(--rose)';
    elements.progressPercentage.style.color = 'var(--rose)';
  } else {
    elements.progressBar.style.background = '';
    elements.progressPercentage.style.color = '';
  }
}

function setStepActive(element, isActive) {
  if (isActive) {
    element.classList.add('active');
  } else {
    element.classList.remove('active');
  }
}

function setStepCompleted(element, isCompleted) {
  if (isCompleted) {
    element.classList.add('completed');
    const dot = element.querySelector('.flow-step-dot');
    if (dot) dot.textContent = '✓';
  } else {
    element.classList.remove('completed');
    const dot = element.querySelector('.flow-step-dot');
    if (dot) {
      // restore digit based on ID
      const id = element.id;
      if (id === 'fs-target') dot.textContent = '1';
      if (id === 'fs-extract') dot.textContent = '2';
      if (id === 'fs-map') dot.textContent = '3';
      if (id === 'fs-done') dot.textContent = '✓';
    }
  }
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showErrorAlert(message) {
  alert(message);
}
