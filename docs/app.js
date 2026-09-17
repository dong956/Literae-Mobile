const PACKAGE_FORMAT = 'literae-mobile';
const PACKAGE_SCHEMA_VERSION = 1;
const REQUIRED_ENTRIES = ['manifest.json', 'documents.jsonl', 'pages.jsonl'];
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_JSON_LINE_LENGTH = 16 * 1024 * 1024;
const IMPORT_BATCH_SIZE = 300;
const INITIAL_RESULT_LIMIT = 20;

const packageInput = document.getElementById('packageInput');
const openLibraryButton = document.getElementById('openLibraryButton');
const replaceLibraryButton = document.getElementById('replaceLibraryButton');
const importCard = document.getElementById('importCard');
const importStatus = document.getElementById('importStatus');
const importProgressTrack = document.getElementById('importProgressTrack');
const importProgress = document.getElementById('importProgress');
const libraryShell = document.getElementById('libraryShell');
const libraryDate = document.getElementById('libraryDate');
const libraryCount = document.getElementById('libraryCount');

// 模式切换与筛选
const shelfTabBtn = document.getElementById('shelfTabBtn');
const searchTabBtn = document.getElementById('searchTabBtn');
const shelfPanel = document.getElementById('shelfPanel');
const searchPanel = document.getElementById('searchPanel');
const facetBar = document.getElementById('facetBar');
const facetPills = document.getElementById('facetPills');
const shelfSummary = document.getElementById('shelfSummary');
const shelfList = document.getElementById('shelfList');
const shelfSearchForm = document.getElementById('shelfSearchForm');
const shelfSearchInput = document.getElementById('shelfSearchInput');
const shelfSearchClearBtn = document.getElementById('shelfSearchClearBtn');

// 检索表单
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchSummary = document.getElementById('searchSummary');
const resultList = document.getElementById('resultList');
const loadMoreButton = document.getElementById('loadMoreButton');
const searchSort = document.getElementById('searchSort');

// 书籍详情抽屉
const docDrawer = document.getElementById('docDrawer');
const closeDrawerButton = document.getElementById('closeDrawerButton');
const drawerTitle = document.getElementById('drawerTitle');
const drawerSubtitle = document.getElementById('drawerSubtitle');
const drawerMetaDetails = document.getElementById('drawerMetaDetails');
const startReadingBtn = document.getElementById('startReadingBtn');
const drawerPageList = document.getElementById('drawerPageList');
const documentSearchForm = document.getElementById('documentSearchForm');
const documentSearchInput = document.getElementById('documentSearchInput');
const documentSearchSummary = document.getElementById('documentSearchSummary');
const documentResultList = document.getElementById('documentResultList');

// 使用说明
const guideDialog = document.getElementById('guideDialog');
const openGuideButton = document.getElementById('openGuideButton');
const openGuideFromBanner = document.getElementById('openGuideFromBanner');
const closeGuideButton = document.getElementById('closeGuideButton');
const recommendedGuideTitle = document.getElementById('recommendedGuideTitle');
const recommendedGuideSteps = document.getElementById('recommendedGuideSteps');

// 沉浸式阅读器
const readerDialog = document.getElementById('readerDialog');
const closeReaderButton = document.getElementById('closeReaderButton');
const readerTitle = document.getElementById('readerTitle');
const readerMeta = document.getElementById('readerMeta');
const readerText = document.getElementById('readerText');
const fontSizeBtn = document.getElementById('fontSizeBtn');
const themeBtn = document.getElementById('themeBtn');
const copyCitationBtn = document.getElementById('copyCitationBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const toastNotice = document.getElementById('toastNotice');

// 运行时状态
let activeDatabase = null;
let activeManifest = null;
let allDocuments = [];
let activeFacet = null; // null | { type: 'category'|'tag', value: string }
let currentView = 'shelf'; // 'shelf' | 'search'

let lastQuery = '';
let resultLimit = INITIAL_RESULT_LIMIT;
let searchGeneration = 0;
let cachedSearch = null;

// 阅读器状态
let currentDoc = null;
let drawerDocument = null;
let currentPage = 1;
let currentDocPages = [];
let currentTerms = [];

// 阅读器偏好设置
const FONT_SIZES = ['1rem', '1.14rem', '1.3rem', '1.5rem'];
let fontSizeIndex = Number(localStorage.getItem('literaeFontSizeIndex') || 1);
const THEMES = ['default', 'cream', 'night'];
let themeIndex = Number(localStorage.getItem('literaeThemeIndex') || 0);

function readUint64(view, offset) {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 0x100000000 + low;
  if (!Number.isSafeInteger(value)) throw new Error('数据包过大，当前原型暂不支持');
  return value;
}

function parseZip64Extra(extra, required) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;
  while (offset + 4 <= view.byteLength) {
    const id = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + length > view.byteLength) break;
    if (id === 0x0001) {
      const values = {};
      let cursor = offset;
      for (const key of ['uncompressedSize', 'compressedSize', 'localOffset']) {
        if (required[key] && cursor + 8 <= offset + length) {
          values[key] = readUint64(view, cursor);
          cursor += 8;
        }
      }
      return values;
    }
    offset += length;
  }
  return {};
}

class ZipArchive {
  constructor(file, centralBuffer, entryCount) {
    this.file = file;
    this.centralBuffer = centralBuffer;
    this.centralView = new DataView(centralBuffer);
    this.entries = this.readCentralDirectory(entryCount);
  }

  static async open(file) {
    if (file.size < 22) throw new Error('所选文件不是有效的 ZIP 数据包');
    const tailSize = Math.min(file.size, 65557);
    const tailBuffer = await file.slice(file.size - tailSize).arrayBuffer();
    const tailView = new DataView(tailBuffer);
    let endOffset = -1;
    for (let offset = tailView.byteLength - 22; offset >= 0; offset -= 1) {
      if (tailView.getUint32(offset, true) === 0x06054b50) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) throw new Error('ZIP 目录不完整，文件可能尚未传输完成');
    const entryCount = tailView.getUint16(endOffset + 10, true);
    const centralSize = tailView.getUint32(endOffset + 12, true);
    const centralOffset = tailView.getUint32(endOffset + 16, true);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error('当前网页原型暂不支持超过 4 GB 的 ZIP64 数据包');
    }
    if (centralOffset + centralSize > file.size) throw new Error('ZIP 中央目录超出文件范围');
    const centralBuffer = await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer();
    return new ZipArchive(file, centralBuffer, entryCount);
  }

  readCentralDirectory(entryCount) {
    const decoder = new TextDecoder('utf-8');
    const entries = new Map();
    let offset = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > this.centralView.byteLength || this.centralView.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('ZIP 中央目录损坏');
      }
      const flags = this.centralView.getUint16(offset + 8, true);
      const compression = this.centralView.getUint16(offset + 10, true);
      let compressedSize = this.centralView.getUint32(offset + 20, true);
      let uncompressedSize = this.centralView.getUint32(offset + 24, true);
      const nameLength = this.centralView.getUint16(offset + 28, true);
      const extraLength = this.centralView.getUint16(offset + 30, true);
      const commentLength = this.centralView.getUint16(offset + 32, true);
      let localOffset = this.centralView.getUint32(offset + 42, true);
      const nameBytes = new Uint8Array(this.centralBuffer, offset + 46, nameLength);
      const extraBytes = new Uint8Array(this.centralBuffer, offset + 46 + nameLength, extraLength);
      const name = decoder.decode(nameBytes);
      const required = {
        uncompressedSize: uncompressedSize === 0xffffffff,
        compressedSize: compressedSize === 0xffffffff,
        localOffset: localOffset === 0xffffffff
      };
      const zip64 = parseZip64Extra(extraBytes, required);
      if (required.uncompressedSize) uncompressedSize = zip64.uncompressedSize;
      if (required.compressedSize) compressedSize = zip64.compressedSize;
      if (required.localOffset) localOffset = zip64.localOffset;
      if (![compressedSize, uncompressedSize, localOffset].every(Number.isFinite)) {
        throw new Error('ZIP64 目录缺少必要信息');
      }
      entries.set(name, {name, flags, compression, compressedSize, uncompressedSize, localOffset});
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async entryBlob(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`数据包缺少 ${name}`);
    if (entry.flags & 0x1) throw new Error('不支持加密 ZIP，请直接导入 Literae 生成的数据包');
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`${name} 超过网页原型的 2 GB 上限`);
    const offset = entry.localOffset;
    const localHeader = new DataView(await this.file.slice(offset, offset + 30).arrayBuffer());
    if (localHeader.byteLength < 30 || localHeader.getUint32(0, true) !== 0x04034b50) throw new Error(`${name} 的 ZIP 记录损坏`);
    const nameLength = localHeader.getUint16(26, true);
    const extraLength = localHeader.getUint16(28, true);
    const dataOffset = offset + 30 + nameLength + extraLength;
    const compressedBlob = this.file.slice(dataOffset, dataOffset + entry.compressedSize);
    if (entry.compression === 0) return compressedBlob;
    if (entry.compression !== 8) throw new Error(`${name} 使用了不支持的 ZIP 压缩方式`);
    if (!('DecompressionStream' in window)) {
      throw new Error('当前浏览器不能解压该数据包，请使用较新的 Safari、Chrome 或 Edge');
    }
    try {
      const stream = compressedBlob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).blob();
    } catch (error) {
      throw new Error(`${name} 解压失败：${error.message}`);
    }
  }

  async entryText(name, maximumBytes = MAX_ENTRY_BYTES) {
    const blob = await this.entryBlob(name);
    if (blob.size > maximumBytes) throw new Error(`${name} 大小异常`);
    return blob.text();
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地数据库操作失败'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('本地数据库写入失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本地数据库写入已中止'));
  });
}

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('meta', {keyPath: 'key'});
      db.createObjectStore('documents', {keyPath: 'id'});
      const pages = db.createObjectStore('pages', {keyPath: ['document_id', 'page']});
      pages.createIndex('by_document', 'document_id', {unique: false});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开手机本地文库'));
  });
}

function deleteDatabase(name) {
  if (!name) return Promise.resolve();
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

async function* jsonLines(blob) {
  const reader = blob.stream().pipeThrough(new TextDecoderStream()).getReader();
  let remainder = '';
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    remainder += value;
    if (remainder.length > MAX_JSON_LINE_LENGTH && !remainder.includes('\n')) {
      throw new Error('数据包中存在异常超长的 JSON 行');
    }
    const lines = remainder.split('\n');
    remainder = lines.pop() || '';
    for (const line of lines) if (line.trim()) yield line;
  }
  if (remainder.trim()) yield remainder;
}

async function writeBatch(db, storeName, records) {
  if (!records.length) return;
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  for (const record of records) store.put(record);
  await transactionDone(transaction);
}

function setImportProgress(percent, message, error = false) {
  importProgressTrack.hidden = false;
  importProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  importStatus.textContent = message;
  importStatus.classList.toggle('error', error);
}

function validateManifest(manifest) {
  if (!manifest || manifest.format !== PACKAGE_FORMAT) throw new Error('这不是 Literae Mobile 数据包');
  if (manifest.schema_version !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`暂不支持数据格式 v${manifest.schema_version}，请更新 Literae Mobile`);
  }
  for (const key of ['document_count', 'page_count']) {
    if (!Number.isSafeInteger(manifest[key]) || manifest[key] < 0) throw new Error(`manifest.json 中的 ${key} 无效`);
  }
}

async function importJsonl(db, archive, entryName, storeName, expectedCount, progressStart, progressSpan, validator) {
  const blob = await archive.entryBlob(entryName);
  const batch = [];
  let count = 0;
  for await (const line of jsonLines(blob)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`${entryName} 第 ${count + 1} 行不是有效 JSON`);
    }
    validator(record, count + 1);
    batch.push(record);
    count += 1;
    if (batch.length >= IMPORT_BATCH_SIZE) {
      await writeBatch(db, storeName, batch.splice(0));
      const percent = progressStart + progressSpan * count / Math.max(expectedCount, 1);
      setImportProgress(percent, `正在导入 ${entryName}：${count.toLocaleString()} / ${expectedCount.toLocaleString()}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  await writeBatch(db, storeName, batch);
  if (count !== expectedCount) throw new Error(`${entryName} 数量与清单不一致（${count} / ${expectedCount}）`);
  return count;
}

function validateDocument(record, lineNumber) {
  if (!record || typeof record.id !== 'string' || !record.id || typeof record.title !== 'string') {
    throw new Error(`documents.jsonl 第 ${lineNumber} 行缺少文档编号或题名`);
  }
  record.author = String(record.author || '');
  record.publisher = String(record.publisher || '');
  record.year = String(record.year || '');
  record.category = String(record.category || '');
  record.tags = Array.isArray(record.tags) ? record.tags.map(String) : [];
  record.page_count = Number(record.page_count || 0);
}

function validatePage(record, lineNumber) {
  if (!record || typeof record.document_id !== 'string' || !record.document_id || !Number.isSafeInteger(record.page) || record.page < 1 || typeof record.text !== 'string') {
    throw new Error(`pages.jsonl 第 ${lineNumber} 行缺少有效的文档编号、页码或正文`);
  }
}

async function cleanupOrphanDatabases(activeName) {
  if (!('databases' in indexedDB)) return;
  try {
    const list = await indexedDB.databases();
    for (const info of list) {
      if (info.name && info.name.startsWith('literae-mobile-import-') && info.name !== activeName) {
        await deleteDatabase(info.name);
      }
    }
  } catch {}
}

async function importPackage(file) {
  if (!file) return;
  let stagingDatabase = null;
  const stagingName = `literae-mobile-import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    importCard.hidden = false;
    setImportProgress(2, '正在检查 ZIP 数据包');
    const archive = await ZipArchive.open(file);
    for (const name of REQUIRED_ENTRIES) if (!archive.entries.has(name)) throw new Error(`数据包缺少 ${name}`);
    const manifestText = await archive.entryText('manifest.json', MAX_MANIFEST_BYTES);
    const manifest = JSON.parse(manifestText);
    validateManifest(manifest);

    stagingDatabase = await openDatabase(stagingName);
    setImportProgress(7, '正在导入文档目录');
    await importJsonl(stagingDatabase, archive, 'documents.jsonl', 'documents', manifest.document_count, 7, 18, validateDocument);
    setImportProgress(25, '正在导入识别文本');
    await importJsonl(stagingDatabase, archive, 'pages.jsonl', 'pages', manifest.page_count, 25, 70, validatePage);

    const transaction = stagingDatabase.transaction('meta', 'readwrite');
    transaction.objectStore('meta').add({key: 'manifest', value: manifest});
    await transactionDone(transaction);
    setImportProgress(98, '正在启用新文库');

    const previousName = localStorage.getItem('literaeActiveDatabase');
    if (activeDatabase) activeDatabase.close();
    activeDatabase = stagingDatabase;
    stagingDatabase = null;
    activeManifest = manifest;
    localStorage.setItem('literaeActiveDatabase', stagingName);
    if (previousName && previousName !== stagingName) await deleteDatabase(previousName);
    setImportProgress(100, '导入完成，全部资料可离线检索');
    cleanupOrphanDatabases(stagingName);
    await showLibrary();
  } catch (error) {
    if (stagingDatabase) stagingDatabase.close();
    await deleteDatabase(stagingName);
    let message = error?.message || '导入失败';
    if (error?.name === 'QuotaExceededError' || /quota/i.test(message)) {
      message = '手机存储空间不足，无法完成数据包导入。请清理手机存储空间后重试。';
    }
    setImportProgress(0, message, true);
  } finally {
    packageInput.value = '';
  }
}

async function loadActiveLibrary() {
  const databaseName = localStorage.getItem('literaeActiveDatabase');
  if (!databaseName) return;
  try {
    cleanupOrphanDatabases(databaseName);
    activeDatabase = await openDatabase(databaseName);
    const transaction = activeDatabase.transaction('meta', 'readonly');
    const record = await requestResult(transaction.objectStore('meta').get('manifest'));
    activeManifest = record?.value || null;
    if (!activeManifest) throw new Error('本地文库清单缺失');
    await showLibrary();
  } catch (error) {
    activeDatabase?.close();
    activeDatabase = null;
    activeManifest = null;
    localStorage.removeItem('literaeActiveDatabase');
    setImportProgress(0, '原有手机文库无法打开，请重新导入数据包', true);
  }
}

async function showLibrary() {
  cachedSearch = null;
  importCard.hidden = true;
  libraryShell.hidden = false;
  const date = activeManifest?.created_at ? new Date(activeManifest.created_at) : null;
  libraryDate.textContent = date && !Number.isNaN(date.valueOf()) ? `桌面版导出于 ${date.toLocaleString()}` : '已导入离线文库';
  libraryCount.textContent = `${Number(activeManifest?.document_count || 0).toLocaleString()} 份文档 · ${Number(activeManifest?.page_count || 0).toLocaleString()} 页文本`;

  await loadAllDocuments();
  renderFacetPills();
  renderBookshelf();
}

async function loadAllDocuments() {
  if (!activeDatabase) return;
  const transaction = activeDatabase.transaction('documents', 'readonly');
  const store = transaction.objectStore('documents');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      allDocuments = request.result || [];
      resolve(allDocuments);
    };
    request.onerror = () => reject(request.error);
  });
}

function renderFacetPills() {
  facetPills.replaceChildren();

  // 统计所有分类与标签
  const categoryCounts = new Map();
  const tagCounts = new Map();
  for (const doc of allDocuments) {
    if (doc.category) {
      categoryCounts.set(doc.category, (categoryCounts.get(doc.category) || 0) + 1);
    }
    for (const tag of doc.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // "全部" 胶囊
  const allPill = document.createElement('button');
  allPill.type = 'button';
  allPill.className = `facet-pill ${activeFacet === null ? 'active' : ''}`;
  allPill.textContent = `全部 (${allDocuments.length})`;
  allPill.addEventListener('click', () => {
    activeFacet = null;
    renderFacetPills();
    if (currentView === 'shelf') renderBookshelf();
    else if (searchInput.value.trim()) runSearch();
  });
  facetPills.append(allPill);

  // 分类胶囊
  for (const [cat, count] of categoryCounts.entries()) {
    const pill = document.createElement('button');
    pill.type = 'button';
    const isActive = activeFacet?.type === 'category' && activeFacet?.value === cat;
    pill.className = `facet-pill ${isActive ? 'active' : ''}`;
    pill.textContent = `${cat} (${count})`;
    pill.addEventListener('click', () => {
      activeFacet = isActive ? null : {type: 'category', value: cat};
      renderFacetPills();
      if (currentView === 'shelf') renderBookshelf();
      else if (searchInput.value.trim()) runSearch();
    });
    facetPills.append(pill);
  }

  // 标签胶囊（显示前 15 个高频标签）
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [tag, count] of sortedTags) {
    const pill = document.createElement('button');
    pill.type = 'button';
    const isActive = activeFacet?.type === 'tag' && activeFacet?.value === tag;
    pill.className = `facet-pill ${isActive ? 'active' : ''}`;
    pill.textContent = `#${tag} (${count})`;
    pill.addEventListener('click', () => {
      activeFacet = isActive ? null : {type: 'tag', value: tag};
      renderFacetPills();
      if (currentView === 'shelf') renderBookshelf();
      else if (searchInput.value.trim()) runSearch();
    });
    facetPills.append(pill);
  }
}

function filterDocument(doc) {
  if (!activeFacet) return true;
  if (activeFacet.type === 'category') return doc.category === activeFacet.value;
  if (activeFacet.type === 'tag') return (doc.tags || []).includes(activeFacet.value);
  return true;
}

function renderBookshelf() {
  shelfList.replaceChildren();
  const query = (shelfSearchInput?.value || '').trim();
  const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase();

  const filtered = allDocuments.filter(doc => {
    if (!filterDocument(doc)) return false;
    if (!normalizedQuery) return true;
    const title = (doc.title || '').normalize('NFKC').toLocaleLowerCase();
    const author = (doc.author || '').normalize('NFKC').toLocaleLowerCase();
    const category = (doc.category || '').normalize('NFKC').toLocaleLowerCase();
    const tags = (doc.tags || []).map(t => t.normalize('NFKC').toLocaleLowerCase());
    return title.includes(normalizedQuery)
      || author.includes(normalizedQuery)
      || category.includes(normalizedQuery)
      || tags.some(t => t.includes(normalizedQuery));
  });

  if (query) {
    shelfSummary.textContent = filtered.length
      ? `在书架中找到 ${filtered.length.toLocaleString()} 部匹配“${query}”的文献`
      : `未在书架中找到匹配“${query}”的文献`;
  } else {
    shelfSummary.textContent = activeFacet
      ? `当前筛选包含 ${filtered.length.toLocaleString()} 份文献`
      : `书架共收录 ${filtered.length.toLocaleString()} 份文献（点击查看目录或通读）`;
  }

  if (!filtered.length) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'empty-shelf-notice';
    emptyNotice.textContent = query
      ? `未找到书名或责任者包含“${query}”的文献，可尝试更换关键词或清除筛选。`
      : '暂无收录文献';
    shelfList.append(emptyNotice);
    return;
  }

  for (const doc of filtered) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shelf-card';

    const title = document.createElement('h3');
    if (query) {
      title.append(highlightedFragment(doc.title || '未命名文献', [query]));
    } else {
      title.textContent = doc.title || '未命名文献';
    }

    const meta = document.createElement('div');
    meta.className = 'book-meta';
    const metaParts = [];
    if (doc.author) {
      if (query && doc.author.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
        metaParts.push(doc.author);
      } else {
        metaParts.push(doc.author);
      }
    }
    if (doc.year) metaParts.push(doc.year);
    if (doc.publisher) metaParts.push(doc.publisher);
    meta.textContent = metaParts.join(' · ') || '出版信息未详';

    const badges = document.createElement('div');
    badges.className = 'shelf-badges';
    if (doc.category) {
      const catBadge = document.createElement('span');
      catBadge.className = 'badge-tag';
      catBadge.textContent = doc.category;
      badges.append(catBadge);
    }
    for (const tag of (doc.tags || []).slice(0, 2)) {
      const tagBadge = document.createElement('span');
      tagBadge.className = 'badge-tag';
      tagBadge.textContent = tag;
      badges.append(tagBadge);
    }

    const pageCount = document.createElement('span');
    pageCount.className = 'badge-pages';
    pageCount.textContent = doc.page_count ? `共 ${doc.page_count} 页` : '已收录';
    badges.append(pageCount);

    card.append(title, meta, badges);
    card.addEventListener('click', () => openDocDrawer(doc));
    shelfList.append(card);
  }
}

async function getDocumentPages(docId) {
  const transaction = activeDatabase.transaction('pages', 'readonly');
  const store = transaction.objectStore('pages');
  const index = store.index('by_document');
  return new Promise((resolve, reject) => {
    const pages = [];
    const request = index.openCursor(IDBKeyRange.only(docId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        pages.push(cursor.value.page);
        cursor.continue();
      } else {
        pages.sort((a, b) => a - b);
        resolve(pages);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function openDocDrawer(doc) {
  drawerDocument = doc;
  drawerTitle.textContent = doc.title || '未命名文献';
  drawerSubtitle.textContent = [doc.author, doc.year, doc.publisher].filter(Boolean).join(' · ');

  drawerMetaDetails.replaceChildren();
  const fields = [
    ['责任者', doc.author || '未录入'],
    ['出版年代', doc.year || '未录入'],
    ['出版者', doc.publisher || '未录入'],
    ['文献分类', doc.category || '未分类'],
    ['标签分类', (doc.tags || []).join(', ') || '无'],
    ['总页数', doc.page_count ? `${doc.page_count} 页` : '未标明']
  ];
  for (const [label, val] of fields) {
    const row = document.createElement('div');
    row.className = 'meta-item';
    row.innerHTML = `<span class="meta-label">${label}</span><span class="meta-val">${val}</span>`;
    drawerMetaDetails.append(row);
  }

  drawerPageList.replaceChildren();
  documentSearchInput.value = '';
  documentSearchSummary.textContent = '';
  documentResultList.replaceChildren();
  const pages = await getDocumentPages(doc.id);

  startReadingBtn.onclick = () => {
    docDrawer.close();
    openReader(doc, pages[0] || 1, []);
  };

  for (const pageNum of pages) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    btn.textContent = `第 ${pageNum} 页`;
    btn.addEventListener('click', () => {
      docDrawer.close();
      openReader(doc, pageNum, []);
    });
    drawerPageList.append(btn);
  }

  docDrawer.showModal();
}

function switchView(view) {
  currentView = view;
  const isShelf = view === 'shelf';
  shelfTabBtn.classList.toggle('active', isShelf);
  shelfTabBtn.setAttribute('aria-selected', isShelf ? 'true' : 'false');
  searchTabBtn.classList.toggle('active', !isShelf);
  searchTabBtn.setAttribute('aria-selected', !isShelf ? 'true' : 'false');
  shelfPanel.hidden = !isShelf;
  searchPanel.hidden = isShelf;
  if (isShelf) renderBookshelf();
}

function queryTerms(query) {
  return Array.from(new Set(query.normalize('NFKC').toLocaleLowerCase().split(/\s+/u).filter(Boolean)));
}

function countOccurrences(text, term) {
  let count = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(term, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + Math.max(term.length, 1);
  }
  return count;
}

function makeSnippet(text, terms, radius = 64) {
  const normalized = text.toLocaleLowerCase();
  let first = -1;
  for (const term of terms) {
    const index = normalized.indexOf(term);
    if (index >= 0 && (first < 0 || index < first)) first = index;
  }
  if (first < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, first - radius);
  const end = Math.min(text.length, first + radius * 2);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function highlightedFragment(text, terms) {
  const fragment = document.createDocumentFragment();
  if (!terms.length) {
    cachedSearch = null;
    fragment.append(document.createTextNode(text));
    return fragment;
  }
  const lower = text.toLocaleLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    let nextIndex = -1;
    let nextTerm = '';
    for (const term of terms) {
      const index = lower.indexOf(term, cursor);
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index;
        nextTerm = term;
      }
    }
    if (nextIndex < 0) {
      fragment.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (nextIndex > cursor) fragment.append(document.createTextNode(text.slice(cursor, nextIndex)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(nextIndex, nextIndex + nextTerm.length);
    fragment.append(mark);
    cursor = nextIndex + nextTerm.length;
  }
  return fragment;
}

async function getDocuments(ids) {
  const transaction = activeDatabase.transaction('documents', 'readonly');
  const store = transaction.objectStore('documents');
  const pairs = await Promise.all(ids.map(async id => [id, await requestResult(store.get(id))]));
  return new Map(pairs);
}

async function scanPages(terms, generation) {
  return new Promise((resolve, reject) => {
    const matches = [];
    const allowedDocumentIds = new Set(allDocuments.filter(filterDocument).map(doc => doc.id));
    const transaction = activeDatabase.transaction('pages', 'readonly');
    const request = transaction.objectStore('pages').openCursor();
    request.onerror = () => reject(request.error || new Error('检索本地正文失败'));
    request.onsuccess = () => {
      if (generation !== searchGeneration) {
        resolve([]);
        return;
      }
      const cursor = request.result;
      if (!cursor) {
        resolve(matches);
        return;
      }
      const page = cursor.value;
      const normalized = page.text.normalize('NFKC').toLocaleLowerCase();
      if (allowedDocumentIds.has(page.document_id) && terms.every(term => normalized.includes(term))) {
        const score = terms.reduce((total, term) => total + countOccurrences(normalized, term), 0);
        matches.push({...page, _score: score});
      }
      cursor.continue();
    };
  });
}

const DOC_CATEGORY_LABELS = {
  book: '书籍',
  paper: '论文',
  ancient_book: '古籍',
  archive: '档案',
  journal: '期刊',
  newspaper: '报纸',
};

function documentCategoryLabel(cat) {
  if (!cat) return '';
  return DOC_CATEGORY_LABELS[cat] || cat;
}

function documentGroupMeta(doc) {
  const parts = [];
  if (doc?.author) parts.push(doc.author);
  if (doc?.publisher) parts.push(doc.publisher);
  if (doc?.year) parts.push(doc.year);
  return parts.join(' · ');
}

function documentMeta(documentRecord, page) {
  const parts = [];
  if (documentRecord?.author) parts.push(documentRecord.author);
  if (documentRecord?.year) parts.push(documentRecord.year);
  parts.push(`第 ${page} 页`);
  return parts.join(' · ');
}

function extractPublicationYear(doc) {
  const match = String(doc?.year || '').match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

function groupSearchResults(pages, documents, previewLimit = 3) {
  const groupsMap = new Map();
  for (const page of pages) {
    let group = groupsMap.get(page.document_id);
    if (!group) {
      const doc = documents.get(page.document_id) || {
        id: page.document_id,
        title: '未命名文档',
        author: '',
        publisher: '',
        year: '',
        category: '',
      };
      group = {
        document: doc,
        document_id: page.document_id,
        title: doc.title || '未命名文档',
        matches: [],
      };
      groupsMap.set(page.document_id, group);
    }
    group.matches.push(page);
  }

  const groups = Array.from(groupsMap.values());
  for (const group of groups) {
    group.matches.sort((a, b) => a.page - b.page);
    group.matchCount = group.matches.length;
    group.previewMatches = group.matches.slice(0, previewLimit);
    group.remainingMatches = group.matches.slice(previewLimit);
    group.remainingCount = group.remainingMatches.length;
  }
  return groups;
}

function sortSearchResultGroups(groups, sortMode, terms = []) {
  if (sortMode === 'title_asc') {
    return [...groups].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }
  if (sortMode === 'title_desc') {
    return [...groups].sort((a, b) => b.title.localeCompare(a.title, 'zh-CN'));
  }
  if (sortMode === 'match_count') {
    return [...groups].sort((a, b) => {
      const aTitle = a.title.normalize('NFKC').toLocaleLowerCase();
      const bTitle = b.title.normalize('NFKC').toLocaleLowerCase();
      const aTitleHits = terms.reduce((acc, t) => acc + (aTitle.includes(t) ? 1 : 0), 0);
      const bTitleHits = terms.reduce((acc, t) => acc + (bTitle.includes(t) ? 1 : 0), 0);
      const aWeighted = a.matchCount + aTitleHits * 10;
      const bWeighted = b.matchCount + bTitleHits * 10;
      return bWeighted - aWeighted || b.matchCount - a.matchCount || a.title.localeCompare(b.title, 'zh-CN');
    });
  }
  if (sortMode === 'year_desc' || sortMode === 'year_asc') {
    const dated = [];
    const undated = [];
    for (const group of groups) {
      if (extractPublicationYear(group.document)) {
        dated.push(group);
      } else {
        undated.push(group);
      }
    }
    if (sortMode === 'year_desc') {
      dated.sort((a, b) => extractPublicationYear(b.document) - extractPublicationYear(a.document) || a.title.localeCompare(b.title, 'zh-CN'));
    } else {
      dated.sort((a, b) => extractPublicationYear(a.document) - extractPublicationYear(b.document) || a.title.localeCompare(b.title, 'zh-CN'));
    }
    undated.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    return dated.concat(undated);
  }
  if (sortMode === 'latest') {
    const docIndexMap = new Map(allDocuments.map((doc, idx) => [doc.id, idx]));
    return [...groups].sort((a, b) => {
      const idxA = docIndexMap.has(a.document_id) ? docIndexMap.get(a.document_id) : 999999;
      const idxB = docIndexMap.has(b.document_id) ? docIndexMap.get(b.document_id) : 999999;
      return idxA - idxB;
    });
  }
  return [...groups].sort((a, b) => b.matchCount - a.matchCount || a.title.localeCompare(b.title, 'zh-CN'));
}

function renderResults(pages, documents, terms, limit) {
  resultList.replaceChildren();
  const sortMode = searchSort.value || 'match_count';
  const groups = groupSearchResults(pages, documents, 3);
  const orderedGroups = sortSearchResultGroups(groups, sortMode, terms);

  for (const group of orderedGroups.slice(0, limit)) {
    const card = document.createElement('article');
    card.className = 'search-group-card';

    // 头部：分类标签、书名、责任者与出版年代、命中总数
    const header = document.createElement('div');
    header.className = 'search-group-header';

    const info = document.createElement('div');
    info.className = 'search-group-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'search-group-title-row';

    const catLabel = documentCategoryLabel(group.document.category);
    if (catLabel) {
      const catBadge = document.createElement('span');
      catBadge.className = 'search-group-cat';
      catBadge.textContent = catLabel;
      titleRow.append(catBadge);
    }

    const title = document.createElement('h3');
    title.className = 'search-group-title';
    title.textContent = group.title;
    title.title = '轻触查看文献详情';
    title.addEventListener('click', () => openDocDrawer(group.document));
    titleRow.append(title);
    info.append(titleRow);

    const metaText = documentGroupMeta(group.document);
    if (metaText) {
      const meta = document.createElement('div');
      meta.className = 'search-group-meta';
      meta.textContent = metaText;
      info.append(meta);
    }

    const countBadge = document.createElement('span');
    countBadge.className = 'search-group-count';
    countBadge.textContent = `共 ${group.matchCount} 处匹配`;

    header.append(info, countBadge);
    card.append(header);

    // 命中列表
    const matchesContainer = document.createElement('div');
    matchesContainer.className = 'search-group-matches';

    const createMatchButton = (match) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'search-match-item';

      const matchHeader = document.createElement('div');
      matchHeader.className = 'search-match-header';

      const pageLabel = document.createElement('span');
      pageLabel.textContent = `第 ${match.page} 页`;

      const jumpHint = document.createElement('span');
      jumpHint.className = 'search-match-arrow';
      jumpHint.textContent = '查看页面 →';

      matchHeader.append(pageLabel, jumpHint);

      const snippet = document.createElement('p');
      snippet.className = 'search-match-snippet';
      snippet.append(highlightedFragment(makeSnippet(match.text, terms), terms));

      item.append(matchHeader, snippet);
      item.addEventListener('click', () => openReader(group.document, match.page, terms));
      return item;
    };

    // 前 3 条命中预览
    for (const match of group.previewMatches) {
      matchesContainer.append(createMatchButton(match));
    }

    // 超出 3 条折叠展开
    if (group.remainingCount > 0) {
      const remainingContainer = document.createElement('div');
      remainingContainer.className = 'search-remaining-container';
      remainingContainer.hidden = true;

      for (const match of group.remainingMatches) {
        remainingContainer.append(createMatchButton(match));
      }

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'search-expand-button';
      expandBtn.textContent = `展开其余 ${group.remainingCount} 处匹配 ▾`;

      expandBtn.addEventListener('click', () => {
        const isHidden = remainingContainer.hidden;
        remainingContainer.hidden = !isHidden;
        expandBtn.textContent = isHidden ? '收起 ▴' : `展开其余 ${group.remainingCount} 处匹配 ▾`;
      });

      matchesContainer.append(remainingContainer, expandBtn);
    }

    card.append(matchesContainer);
    resultList.append(card);
  }

  loadMoreButton.hidden = orderedGroups.length <= limit;
  if (!loadMoreButton.hidden) {
    loadMoreButton.textContent = `继续显示更多文献（当前已显示 ${Math.min(orderedGroups.length, limit)} / ${orderedGroups.length} 部）`;
  }
}

async function runSearch() {
  if (!activeDatabase) return;
  const query = searchInput.value.trim();
  const terms = queryTerms(query);
  if (!terms.length) {
    searchSummary.textContent = '输入关键词开始检索';
    resultList.replaceChildren();
    loadMoreButton.hidden = true;
    return;
  }
  lastQuery = query;
  const generation = ++searchGeneration;
  searchSummary.textContent = '正在本机文库中检索…';
  resultList.replaceChildren();
  loadMoreButton.hidden = true;
  try {
    const pages = await scanPages(terms, generation);
    if (generation !== searchGeneration) return;
    const documents = await getDocuments(Array.from(new Set(pages.map(page => page.document_id))));
    const groups = groupSearchResults(pages, documents, 3);
    cachedSearch = {query, pages, documents, terms, groups};
    renderResults(pages, documents, terms, resultLimit);
    searchSummary.textContent = pages.length
      ? (groups.length > resultLimit
          ? `共在 ${groups.length.toLocaleString()} 部文献中找到 ${pages.length.toLocaleString()} 处匹配，当前显示前 ${Math.min(groups.length, resultLimit).toLocaleString()} 部`
          : `共在 ${groups.length.toLocaleString()} 部文献中找到 ${pages.length.toLocaleString()} 处匹配`)
      : '未找到匹配所有关键词的页面';
  } catch (error) {
    searchSummary.textContent = `检索失败：${error.message}`;
  }
}

async function searchCurrentDocument() {
  if (!activeDatabase || !drawerDocument) return;
  const terms = queryTerms(documentSearchInput.value.trim());
  documentResultList.replaceChildren();
  if (!terms.length) {
    documentSearchSummary.textContent = '输入关键词检索本书正文';
    return;
  }
  documentSearchSummary.textContent = '正在本书中检索…';
  try {
    const transaction = activeDatabase.transaction('pages', 'readonly');
    const index = transaction.objectStore('pages').index('by_document');
    const results = await new Promise((resolve, reject) => {
      const matches = [];
      const request = index.openCursor(IDBKeyRange.only(drawerDocument.id));
      request.onerror = () => reject(request.error || new Error('书内检索失败'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(matches);
          return;
        }
        const record = cursor.value;
        const normalized = record.text.normalize('NFKC').toLocaleLowerCase();
        if (terms.every(term => normalized.includes(term))) matches.push(record);
        cursor.continue();
      };
    });

    documentSearchSummary.textContent = results.length
      ? `本书共找到 ${results.length.toLocaleString()} 个相关页面`
      : '本书中未找到匹配所有关键词的页面';
    for (const result of results.slice(0, 80)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'document-result';
      const page = document.createElement('strong');
      page.textContent = `第 ${result.page} 页`;
      const snippet = document.createElement('span');
      snippet.append(highlightedFragment(makeSnippet(result.text, terms, 48), terms));
      button.append(page, snippet);
      button.addEventListener('click', () => {
        docDrawer.close();
        openReader(drawerDocument, result.page, terms);
      });
      documentResultList.append(button);
    }
  } catch (error) {
    documentSearchSummary.textContent = `检索失败：${error.message}`;
  }
}

async function getPageText(docId, pageNum) {
  const transaction = activeDatabase.transaction('pages', 'readonly');
  const store = transaction.objectStore('pages');
  const record = await requestResult(store.get([docId, pageNum]));
  return record?.text || '';
}

async function openReader(documentRecord, pageNum, terms = []) {
  currentDoc = documentRecord;
  currentPage = pageNum;
  currentTerms = terms;
  currentDocPages = await getDocumentPages(documentRecord.id);

  await renderReaderCurrentPage();
  readerDialog.showModal();
}

async function renderReaderCurrentPage() {
  if (!currentDoc) return;
  readerTitle.textContent = currentDoc.title || '未命名文档';
  readerMeta.textContent = documentMeta(currentDoc, currentPage);

  const text = await getPageText(currentDoc.id, currentPage);
  readerText.replaceChildren(highlightedFragment(text, currentTerms));
  readerText.scrollTop = 0;

  // 更新翻页条状态
  const currentIndex = currentDocPages.indexOf(currentPage);
  prevPageBtn.disabled = currentIndex <= 0;
  nextPageBtn.disabled = currentIndex < 0 || currentIndex >= currentDocPages.length - 1;
  pageIndicator.textContent = currentDocPages.length
    ? `第 ${currentPage} 页 / 共 ${currentDocPages.length} 页`
    : `第 ${currentPage} 页`;
}

function showToast(message) {
  toastNotice.textContent = message;
  toastNotice.hidden = false;
  window.setTimeout(() => {
    toastNotice.hidden = true;
  }, 2000);
}

function copyCitation() {
  if (!currentDoc) return;
  const selection = window.getSelection()?.toString().trim();
  const textToQuote = selection || readerText.textContent.slice(0, 160).trim();
  const citation = `“${textToQuote}”\n——《${currentDoc.title}》${currentDoc.author ? '，' + currentDoc.author : ''}${currentDoc.year ? '，' + currentDoc.year : ''}，第 ${currentPage} 页。`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(citation).then(() => {
      showToast('已复制出处引文');
    }).catch(() => {
      fallbackCopy(citation);
    });
  } else {
    fallbackCopy(citation);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('已复制出处引文');
  } catch {
    showToast('无法复制，请手动选中文本');
  }
  document.body.removeChild(textarea);
}

function applyFontSize() {
  document.documentElement.style.setProperty('--reader-font-size', FONT_SIZES[fontSizeIndex]);
  localStorage.setItem('literaeFontSizeIndex', String(fontSizeIndex));
}

function applyTheme() {
  document.body.classList.remove('theme-cream', 'theme-night');
  const theme = THEMES[themeIndex];
  if (theme !== 'default') {
    document.body.classList.add(`theme-${theme}`);
  }
  localStorage.setItem('literaeThemeIndex', String(themeIndex));
}

// 按钮与交互绑定
shelfTabBtn.addEventListener('click', () => switchView('shelf'));
searchTabBtn.addEventListener('click', () => switchView('search'));

openLibraryButton.addEventListener('click', () => packageInput.click());
replaceLibraryButton.addEventListener('click', () => packageInput.click());
packageInput.addEventListener('change', () => importPackage(packageInput.files?.[0]));

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  resultLimit = INITIAL_RESULT_LIMIT;
  runSearch();
});

searchSort.addEventListener('change', () => {
  if (cachedSearch?.query === searchInput.value.trim()) {
    renderResults(cachedSearch.pages, cachedSearch.documents, cachedSearch.terms, resultLimit);
  } else if (searchInput.value.trim()) {
    runSearch();
  }
});

documentSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  searchCurrentDocument();
});

loadMoreButton.addEventListener('click', () => {
  resultLimit += INITIAL_RESULT_LIMIT;
  searchInput.value = lastQuery;
  if (cachedSearch?.query === lastQuery) {
    renderResults(cachedSearch.pages, cachedSearch.documents, cachedSearch.terms, resultLimit);
    const groups = cachedSearch.groups || groupSearchResults(cachedSearch.pages, cachedSearch.documents, 3);
    searchSummary.textContent = groups.length > resultLimit
      ? `共在 ${groups.length.toLocaleString()} 部文献中找到 ${cachedSearch.pages.length.toLocaleString()} 处匹配，当前显示前 ${Math.min(groups.length, resultLimit).toLocaleString()} 部`
      : `共在 ${groups.length.toLocaleString()} 部文献中找到 ${cachedSearch.pages.length.toLocaleString()} 处匹配`;
  } else {
    runSearch();
  }
});

closeDrawerButton.addEventListener('click', () => docDrawer.close());
closeReaderButton.addEventListener('click', () => readerDialog.close());

prevPageBtn.addEventListener('click', () => {
  const currentIndex = currentDocPages.indexOf(currentPage);
  if (currentIndex > 0) {
    currentPage = currentDocPages[currentIndex - 1];
    renderReaderCurrentPage();
  }
});

nextPageBtn.addEventListener('click', () => {
  const currentIndex = currentDocPages.indexOf(currentPage);
  if (currentIndex >= 0 && currentIndex < currentDocPages.length - 1) {
    currentPage = currentDocPages[currentIndex + 1];
    renderReaderCurrentPage();
  }
});

fontSizeBtn.addEventListener('click', () => {
  fontSizeIndex = (fontSizeIndex + 1) % FONT_SIZES.length;
  applyFontSize();
  showToast(`已调整字号 (${fontSizeIndex + 1}/${FONT_SIZES.length})`);
});

themeBtn.addEventListener('click', () => {
  themeIndex = (themeIndex + 1) % THEMES.length;
  applyTheme();
  const names = ['古籍宣纸', '柔和米白', '夜读暗色'];
  showToast(`底色：${names[themeIndex]}`);
});

copyCitationBtn.addEventListener('click', copyCitation);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 初始化偏好与文库
applyFontSize();
applyTheme();
loadActiveLibrary();

// 书架书名检索交互
shelfSearchInput?.addEventListener('input', () => {
  const hasValue = Boolean(shelfSearchInput.value.trim());
  shelfSearchClearBtn.hidden = !hasValue;
  renderBookshelf();
});

shelfSearchClearBtn?.addEventListener('click', () => {
  shelfSearchInput.value = '';
  shelfSearchClearBtn.hidden = true;
  renderBookshelf();
  shelfSearchInput.focus();
});

shelfSearchForm?.addEventListener('submit', event => {
  event.preventDefault();
  renderBookshelf();
});

function browserGuide() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isChrome = /CriOS|Chrome/.test(ua) && !/EdgiOS|EdgA|OPR/.test(ua);
  if (isIOS && isChrome) {
    return {
      title: 'iPhone / iPad · Chrome',
      steps: ['点地址栏右侧的“分享”按钮。', '选择“添加到主屏幕”。', '确认名称后点“添加”，以后从 Literae Mobile 图标进入。'],
      prompt: '点地址栏右侧“分享” → “添加到主屏幕”。'
    };
  }
  if (isIOS) {
    return {
      title: 'iPhone / iPad · Safari',
      steps: ['点 Safari 工具栏的“分享”按钮。', '向下滑并选择“添加到主屏幕”。', '开启“作为网页 App 打开”，再点“添加”。'],
      prompt: '点“分享” → “添加到主屏幕”，并开启“作为网页 App 打开”。'
    };
  }
  if (/Android/.test(ua) && isChrome) {
    return {
      title: 'Android · Chrome',
      steps: ['点地址栏右侧的“⋮”菜单。', '选择“添加到主屏幕”或“安装应用”。', '点“安装”，以后从桌面上的 Literae Mobile 图标进入。'],
      prompt: '点右上角“⋮” → “添加到主屏幕” → “安装”。'
    };
  }
  return {
    title: '当前浏览器',
    steps: ['打开浏览器的分享或更多菜单。', '选择“添加到主屏幕”或“安装应用”。', '如果没有该选项，请改用 Safari（iPhone/iPad）或 Chrome（Android）。'],
    prompt: '从浏览器菜单选择“添加到主屏幕”或“安装应用”。'
  };
}

function openGuide() {
  if (!guideDialog.open) guideDialog.showModal();
}

openGuideButton.addEventListener('click', openGuide);
openGuideFromBanner.addEventListener('click', openGuide);
closeGuideButton.addEventListener('click', () => guideDialog.close());
guideDialog.addEventListener('click', event => {
  if (event.target === guideDialog) guideDialog.close();
});

function initInstallPrompt() {
  const banner = document.getElementById("installPromptBanner");
  const dismissBtn = document.getElementById("dismissInstallPrompt");
  if (!banner) return;
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const isDismissed = sessionStorage.getItem("dismiss_install_prompt") === "true";
  const guide = browserGuide();
  document.getElementById('installPromptText').textContent = guide.prompt;
  recommendedGuideTitle.textContent = guide.title;
  recommendedGuideSteps.replaceChildren(...guide.steps.map(step => {
    const item = document.createElement('li');
    item.textContent = step;
    return item;
  }));
  if (!isStandalone && !isDismissed) {
    banner.hidden = false;
  }
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      banner.hidden = true;
      sessionStorage.setItem("dismiss_install_prompt", "true");
    });
  }
}

initInstallPrompt();
