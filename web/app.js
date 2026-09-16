const PACKAGE_FORMAT = 'literae-mobile';
const PACKAGE_SCHEMA_VERSION = 1;
const REQUIRED_ENTRIES = ['manifest.json', 'documents.jsonl', 'pages.jsonl'];
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_JSON_LINE_LENGTH = 16 * 1024 * 1024;
const IMPORT_BATCH_SIZE = 300;
const INITIAL_RESULT_LIMIT = 60;

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
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchSummary = document.getElementById('searchSummary');
const resultList = document.getElementById('resultList');
const loadMoreButton = document.getElementById('loadMoreButton');
const readerDialog = document.getElementById('readerDialog');
const closeReaderButton = document.getElementById('closeReaderButton');
const readerTitle = document.getElementById('readerTitle');
const readerMeta = document.getElementById('readerMeta');
const readerText = document.getElementById('readerText');

let activeDatabase = null;
let activeManifest = null;
let lastQuery = '';
let resultLimit = INITIAL_RESULT_LIMIT;
let searchGeneration = 0;

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
    showLibrary();
    cleanupOrphanDatabases(stagingName);
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
    showLibrary();
  } catch (error) {
    activeDatabase?.close();
    activeDatabase = null;
    activeManifest = null;
    localStorage.removeItem('literaeActiveDatabase');
    setImportProgress(0, '原有手机文库无法打开，请重新导入数据包', true);
  }
}

function showLibrary() {
  importCard.hidden = true;
  libraryShell.hidden = false;
  const date = activeManifest?.created_at ? new Date(activeManifest.created_at) : null;
  libraryDate.textContent = date && !Number.isNaN(date.valueOf()) ? `桌面版导出于 ${date.toLocaleString()}` : '已导入离线文库';
  libraryCount.textContent = `${Number(activeManifest?.document_count || 0).toLocaleString()} 份文档 · ${Number(activeManifest?.page_count || 0).toLocaleString()} 页文本`;
}

function queryTerms(query) {
  return Array.from(new Set(query.normalize('NFKC').toLocaleLowerCase().split(/\s+/u).filter(Boolean)));
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

async function scanPages(terms, limit, generation) {
  return new Promise((resolve, reject) => {
    const matches = [];
    const transaction = activeDatabase.transaction('pages', 'readonly');
    const request = transaction.objectStore('pages').openCursor();
    request.onerror = () => reject(request.error || new Error('检索本地正文失败'));
    request.onsuccess = () => {
      if (generation !== searchGeneration) {
        resolve([]);
        return;
      }
      const cursor = request.result;
      if (!cursor || matches.length >= limit) {
        resolve(matches);
        return;
      }
      const page = cursor.value;
      const normalized = page.text.normalize('NFKC').toLocaleLowerCase();
      if (terms.every(term => normalized.includes(term))) matches.push(page);
      cursor.continue();
    };
  });
}

function documentMeta(documentRecord, page) {
  const parts = [];
  if (documentRecord?.author) parts.push(documentRecord.author);
  if (documentRecord?.year) parts.push(documentRecord.year);
  parts.push(`第 ${page} 页`);
  return parts.join(' · ');
}

function renderResults(pages, documents, terms, limit) {
  resultList.replaceChildren();
  for (const page of pages) {
    const documentRecord = documents.get(page.document_id) || {title: '未命名文档'};
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'result-card';
    const title = document.createElement('h3');
    title.textContent = documentRecord.title;
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = documentMeta(documentRecord, page.page);
    const snippet = document.createElement('p');
    snippet.append(highlightedFragment(makeSnippet(page.text, terms), terms));
    card.append(title, meta, snippet);
    card.addEventListener('click', () => openReader(documentRecord, page, terms));
    resultList.append(card);
  }
  loadMoreButton.hidden = pages.length < limit;
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
    const pages = await scanPages(terms, resultLimit, generation);
    if (generation !== searchGeneration) return;
    const documents = await getDocuments(Array.from(new Set(pages.map(page => page.document_id))));
    renderResults(pages, documents, terms, resultLimit);
    searchSummary.textContent = pages.length
      ? `已显示 ${pages.length.toLocaleString()} 条命中${pages.length >= resultLimit ? '，可继续加载' : ''}`
      : '没有找到包含全部关键词的页面';
  } catch (error) {
    searchSummary.textContent = `检索失败：${error.message}`;
  }
}

function openReader(documentRecord, page, terms) {
  readerTitle.textContent = documentRecord.title || '未命名文档';
  readerMeta.textContent = documentMeta(documentRecord, page.page);
  readerText.replaceChildren(highlightedFragment(page.text, terms));
  readerDialog.showModal();
  readerText.scrollTop = 0;
}

openLibraryButton.addEventListener('click', () => packageInput.click());
replaceLibraryButton.addEventListener('click', () => packageInput.click());
packageInput.addEventListener('change', () => importPackage(packageInput.files?.[0]));
searchForm.addEventListener('submit', event => {
  event.preventDefault();
  resultLimit = INITIAL_RESULT_LIMIT;
  runSearch();
});
loadMoreButton.addEventListener('click', () => {
  resultLimit += INITIAL_RESULT_LIMIT;
  searchInput.value = lastQuery;
  runSearch();
});
closeReaderButton.addEventListener('click', () => readerDialog.close());

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

loadActiveLibrary();
