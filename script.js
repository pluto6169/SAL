// ============================================================
//  SAL — script.js (محدث)
//  يدعم: شاشة كليات، Infographic، وصل طباعة، تصميم عصري
// ============================================================

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
import { BOOKS_CATALOG } from './catalog.js';
env.allowRemoteModels = true;

// ─── قائمة الكليات (حسب طلبك) ───
const FACULTIES = [
  'الطب البشري', 'طب الأسنان', 'الصيدلة', 'العلاج الطبيعي',
  'التمريض', 'تكنولوجيا العلوم الصحية التطبيقية',
  'الهندسة', 'العمارة', 'هندسة الحاسوب', 'علوم الحاسب',
  'العلوم الأساسية', 'الغذاء والصناعات الغذائية',
  'العلوم الإدارية', 'الفنون والتصميم',
  'الإنتاج الإعلامي', 'العلوم الاجتماعية والإنسانية'
];

// ─── إعدادات البحث ───
const SIMILARITY_THRESHOLD = 0.22;
const TOP_K = 3;
const KEYWORD_WEIGHT = 0.30;
const COSINE_WEIGHT = 0.70;

// ─── مراجع DOM ───
const splashScreen = document.getElementById('splash-screen');
const splashBar = document.getElementById('splash-bar');
const splashStatus = document.getElementById('splash-status');
const splashFile = document.getElementById('splash-file');
const fatalError = document.getElementById('fatal-error');
const fatalMsg = document.getElementById('fatal-msg');
const app = document.getElementById('app');
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const aiStatusText = document.getElementById('ai-status-text');
const suggChips = document.getElementById('suggestion-chips');
const facultyScreen = document.getElementById('faculty-screen');
const facultyGrid = document.getElementById('faculty-grid');
const facultyToggle = document.getElementById('faculty-toggle');
const currentFacultyLabel = document.getElementById('current-faculty-label');
const autoBox = document.getElementById('autocomplete-box');

// ─── حالة التطبيق ───
let extractor = null;
let bookEmbeddings = [];
let isThinking = false;
let currentFaculty = 'عام';
let currentHoldBookId = null;
let acItems = [];      // نتائج الاقتراح الحالية
let acActiveIndex = -1; // العنصر المُفعّل بالأسهم

// ─────────────────────────────────────────────────────────────
//  شاشة الكليات
// ─────────────────────────────────────────────────────────────
function renderFaculties() {
  facultyGrid.innerHTML = '';
  FACULTIES.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'faculty-card';
    btn.textContent = f;
    btn.dataset.faculty = f;
    btn.addEventListener('click', () => selectFaculty(f));
    facultyGrid.appendChild(btn);
  });
}

function selectFaculty(f) {
  currentFaculty = f;
  currentFacultyLabel.textContent = f;
  facultyScreen.classList.add('hidden');
  app.classList.remove('hidden');
  // إظهار رسالة ترحيب مع الكلية المختارة
  const welcome = document.querySelector('#welcome-msg .bubble');
  if (welcome) {
    welcome.innerHTML = `
      <p>👋 أهلاً في <strong>SAL</strong> — مساعد مكتبة كلية <strong>${f}</strong>.</p>
      <p>أخبرني باهتمامك، وسأفضّل الكتب الأقرب لتخصصك.</p>
      <div class="suggestion-chips" id="suggestion-chips">
        <button class="chip" data-text="أريد رواية مشوقة">📖 مغامرات</button>
        <button class="chip" data-text="أحب كتب التاريخ">🏛️ تاريخ</button>
        <button class="chip" data-text="أريد كتاباً في علم النفس">🧠 نفس</button>
        <button class="chip" data-text="خيال علمي">🚀 خيال</button>
        <button class="chip" data-text="تطوير ذاتي">🌟 تطوير</button>
      </div>
    `;
    // إعادة ربط الـ chips
    document.querySelectorAll('.chip').forEach(el => {
      el.addEventListener('click', (e) => {
        userInput.value = e.target.dataset.text;
        handleSend();
      });
    });
  }
  userInput.focus();
}

// ─── زر تغيير الكلية في الأعلى ───
facultyToggle.addEventListener('click', () => {
  app.classList.add('hidden');
  facultyScreen.classList.remove('hidden');
});

// ─── زر الخريطة في الأعلى ───
document.getElementById('map-toggle').addEventListener('click', () => {
  if (typeof window.openLibraryMap === 'function') window.openLibraryMap(null);
});

// ─────────────────────────────────────────────────────────────
//  تحميل النموذج
// ─────────────────────────────────────────────────────────────
async function initModel() {
  try {
    splashStatus.textContent = 'جاري تحميل النموذج...';
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      { dtype: 'q8', progress_callback: onProgress }
    );
    splashStatus.textContent = 'جاري فهرسة الكتب...';
    bookEmbeddings = await Promise.all(
      BOOKS_CATALOG.map(b => computeEmbedding(buildBookIndexText(b)))
    );
    splashBar.style.width = '100%';
    setTimeout(() => {
      splashScreen.classList.add('fade-out');
      // عرض شاشة الكليات بدلاً من الشات فوراً
      renderFaculties();
      facultyScreen.classList.remove('hidden');
    }, 400);
  } catch (err) {
    console.error(err);
    splashScreen.classList.add('hidden');
    fatalMsg.textContent = 'فشل التحميل: ' + err.message;
    fatalError.classList.remove('hidden');
  }
}

function onProgress(info) {
  if (info.status === 'downloading' || info.status === 'progress') {
    const pct = info.progress ? Math.round(info.progress) : 0;
    splashBar.style.width = pct + '%';
    if (info.file) splashFile.textContent = info.file;
  }
}

// ─────────────────────────────────────────────────────────────
//  دالات البحث والـ Embedding (نفس الكود السابق مع تحسينات)
// ─────────────────────────────────────────────────────────────
const MOOD_EXPANSION_MAP = {
  'حزين': 'الحزن الألم الفقدان التعافي النفس',
  'سعيد': 'السعادة الفرح الإيجابية التفاؤل',
  'قلق': 'القلق الطمأنينة السكينة التأمل',
  'وحيد': 'الوحدة العلاقات الصداقة التواصل',
  'راحة': 'الراحة السكينة الهدوء التأمل',
  'أمل': 'الأمل الإلهام التفاؤل النجاح',
  'خائف': 'الخوف الشجاعة التغلب على الخوف',
  'غاضب': 'الغضب السيطرة الهدوء النفس',
};

function expandQuery(raw) {
  const lower = raw.toLowerCase();
  let additions = [];
  for (const [k, v] of Object.entries(MOOD_EXPANSION_MAP)) {
    if (lower.includes(k)) additions.push(v);
  }
  return additions.length ? `${raw} — ${additions.join(' ')}` : raw;
}

function buildBookIndexText(book) {
  const tags = book.moodTags ? book.moodTags.join(' ') : '';
  return `${book.title} ${book.category} ${book.subject1 || ''} ${book.subject2 || ''} ${book.subject3 || ''} ${book.description} ${tags}`;
}

async function computeEmbedding(text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function keywordScore(query, book) {
  if (!book.moodTags) return 0;
  const words = query.replace(/[\u064B-\u065F]/g, '').split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return 0;
  const tags = book.moodTags.join(' ').toLowerCase();
  let matches = 0;
  for (const w of words) if (tags.includes(w.toLowerCase())) matches++;
  return matches / words.length;
}

// ─────────────────────────────────────────────────────────────
//  البحث التكيفي (Autocomplete) — مطابقة نصية خفيفة بدون AI
// ─────────────────────────────────────────────────────────────
function searchSuggestions(rawQuery, limit = 6) {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];

  const starts = [];
  const contains = [];

  for (const book of BOOKS_CATALOG) {
    const title = (book.title || '').toLowerCase();
    const author = (book.author || '').toLowerCase();
    const category = (book.category || '').toLowerCase();

    if (title.startsWith(q)) {
      starts.push(book);
    } else if (title.includes(q) || author.includes(q) || category.includes(q)) {
      contains.push(book);
    }
  }

  return [...starts, ...contains].slice(0, limit);
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHTML(text);
  const before = escapeHTML(text.slice(0, idx));
  const match = escapeHTML(text.slice(idx, idx + query.length));
  const after = escapeHTML(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function renderAutocomplete(query) {
  acItems = searchSuggestions(query);
  acActiveIndex = -1;

  if (!acItems.length) {
    hideAutocomplete();
    return;
  }

  autoBox.innerHTML = acItems.map((book, i) => `
    <div class="autocomplete-item" data-index="${i}">
      <span class="ac-title">📖 ${highlightMatch(book.title, query)}</span>
      <span class="ac-meta">${escapeHTML(book.author || '')} · ${escapeHTML(book.category || '')}</span>
    </div>
  `).join('');

  autoBox.classList.remove('hidden');

  autoBox.querySelectorAll('.autocomplete-item').forEach(el => {
    el.addEventListener('click', () => {
      selectAutocompleteItem(parseInt(el.dataset.index, 10));
    });
  });
}

function hideAutocomplete() {
  autoBox.classList.add('hidden');
  autoBox.innerHTML = '';
  acItems = [];
  acActiveIndex = -1;
}

function selectAutocompleteItem(index) {
  const book = acItems[index];
  if (!book) return;
  userInput.value = book.title;
  hideAutocomplete();
  autoResizeInput();
  userInput.focus();
}

function updateActiveHighlight() {
  const els = autoBox.querySelectorAll('.autocomplete-item');
  els.forEach((el, i) => el.classList.toggle('active', i === acActiveIndex));
  if (acActiveIndex >= 0 && els[acActiveIndex]) {
    els[acActiveIndex].scrollIntoView({ block: 'nearest' });
  }
}

const handleAutocompleteInput = debounce(() => {
  renderAutocomplete(userInput.value);
}, 150);

// ─────────────────────────────────────────────────────────────
//  معالجة الطلب وعرض النتائج
// ─────────────────────────────────────────────────────────────
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isThinking) return;
  hideAutocomplete();
  if (suggChips) suggChips.style.display = 'none';
  appendUserMsg(text);
  userInput.value = '';
  autoResizeInput();
  await processQuery(text);
}

async function processQuery(query) {
  isThinking = true;
  sendBtn.disabled = true;
  aiStatusText.textContent = '● يفكر...';
  aiStatusText.className = 'topbar-sub thinking';
  appendTypingIndicator();
  await sleep(600);

  try {
    const expanded = expandQuery(query);
    const qVec = await computeEmbedding(expanded);

    const scored = BOOKS_CATALOG.map((book, i) => {
      const cosine = cosineSimilarity(qVec, bookEmbeddings[i]);
      const keyword = keywordScore(query, book);
      const final = (cosine * COSINE_WEIGHT) + (keyword * KEYWORD_WEIGHT);
      return { book, score: final, cosine, keyword };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter(x => x.score >= SIMILARITY_THRESHOLD).slice(0, TOP_K);

    removeTypingIndicator();

    if (top.length) {
      appendBotMsg(buildResultsHTML(top, query));
    } else {
      appendBotMsg(buildNoMatchHTML(scored));
    }

  } catch (err) {
    removeTypingIndicator();
    appendBotMsg(`<p>⚠️ خطأ: ${err.message}</p>`);
  } finally {
    isThinking = false;
    sendBtn.disabled = false;
    aiStatusText.textContent = '● جاهز';
    aiStatusText.className = 'topbar-sub';
    userInput.focus();
  }
}

// ─────────────────────────────────────────────────────────────
//  عرض النتائج مع Infographic وزر الوصل
// ─────────────────────────────────────────────────────────────
function buildResultsHTML(matches, query) {
  const cards = matches.map((item, idx) => buildCardHTML(item, idx)).join('');
  return `<div class="results-wrapper"><p class="results-intro">📚 وجدت ${matches.length} كتب مناسبة:</p><div class="cards-grid">${cards}</div></div>`;
}

function formatAvailability(status) {
  if (!status) return 'غير معروف';
  const normalized = status.toLowerCase();
  if (normalized.includes('متاح')) return 'متاح على الرف';
  if (normalized.includes('مستعار') || normalized.includes('مُعار') || normalized.includes('معار')) return 'مستعار حالياً';
  if (normalized.includes('مرجع')) return 'مرجع فقط';
  return status;
}

function buildShelfGuide(location) {
  const shelfMatch = /رف\s*([^\s،]+)/i.exec(location);
  const shelf = shelfMatch ? `رف ${shelfMatch[1]}` : 'الرف غير محدد';
  let aisle = 'الممر العام';
  if (/القسم المرجعي/i.test(location)) aisle = 'الممر المرجعي';
  else if (/الطابق الأول/i.test(location)) aisle = 'الممر الأول';
  else if (/الطابق الثاني/i.test(location)) aisle = 'الممر الثاني';
  else if (/الطابق الثالث/i.test(location)) aisle = 'الممر الثالث';
  const kiosk = 'الكشك 3';
  return { kiosk, aisle, shelf };
}

function buildCardHTML({ book, score }, idx) {
  const percent = Math.round(score * 100);
  const color = percent >= 65 ? '#34d399' : percent >= 45 ? '#fbbf24' : '#f87171';
  const cardId = `card-${idx}-${Date.now()}`;
  const guide = buildShelfGuide(book.location || '');

  return `
    <div class="book-card" id="${cardId}">
      <div class="card-top-bar" style="background:${color}"></div>
      <div class="card-body">
        <div class="card-head">
          <div>
            <p class="card-title">${escapeHTML(book.title)}</p>
            <p class="card-author">✍️ ${escapeHTML(book.author)}</p>
          </div>
          <span class="card-rank">#${idx + 1}</span>
        </div>

        <div class="card-meta">
          <span class="card-category">📂 ${escapeHTML(book.category)}</span>
          <span class="card-match" style="color:${color}">🎯 ${percent}%</span>
        </div>

        <div class="match-bar-bg"><div class="match-bar" style="width:${percent}%;background:${color}"></div></div>

        <p class="card-desc">${escapeHTML(book.description)}</p>

        <!-- حقل Infographic -->
        <div class="infographic-box" id="inf-${book.biblio_id}">
          <div class="infographic-loading"><div class="ai-spinner"></div> <span style="margin-right:8px;">جاري تحميل البطاقة البيانية...</span></div>
        </div>

        <div class="card-location">
          <div class="loc-item"><span class="loc-label">📍 الموقع</span><span class="loc-value shelf-val">${escapeHTML(book.location)}</span></div>
          <div class="loc-item"><span class="loc-label">🔢 التصنيف</span><span class="loc-value">${escapeHTML(book.callNumber)}</span></div>
        </div>

        <div class="card-status-row">
          <span class="status-pill ${!book.status || !book.status.toLowerCase().includes('متاح') ? 'status-unavailable' : 'status-available'}">${escapeHTML(formatAvailability(book.status))}</span>
          <span class="guide-pill">🧭 ${escapeHTML(guide.kiosk)} · ${escapeHTML(guide.aisle)} · ${escapeHTML(guide.shelf)}</span>
        </div>

        <div class="card-actions">
          ${book.status && !book.status.toLowerCase().includes('متاح') ? `<button class="btn-hold" onclick="openHoldModal('${book.biblio_id}')">📌 احجزه لي عند التوفر</button>` : `<button class="btn-receipt" onclick="window.showReceipt('${book.biblio_id}')">🧾 وصل الاستعارة</button>`}
          <button class="btn-similar" onclick="findSimilar('${escapeHTML(book.title)}')">🔍 مشابه</button>
          <button class="btn-map-show" onclick="window.openLibraryMap('${book.biblio_id}')">🗺️ الخريطة</button>
          ${book.status && !book.status.toLowerCase().includes('متاح') ? `<button class="btn-secondary" onclick="window.showReceipt('${book.biblio_id}')">🧾 التفاصيل</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
//  عرض الـ Infographic (صورة من مجلد infographic)
// ─────────────────────────────────────────────────────────────
function loadInfographic(biblioId) {
  const container = document.getElementById(`inf-${biblioId}`);
  if (!container) return;

  const img = document.createElement('img');
  img.className = 'infographic-img';
  img.src = `infographic/${biblioId}.png`;
  img.alt = `Infographic للكتاب`;

  // عند الضغط على الصورة يتم فتح المكبر
  img.onclick = () => window.openImageModal(img.src);

  img.onload = () => {
    container.innerHTML = '';
    container.appendChild(img);
  };
  img.onerror = () => {
    container.innerHTML = `
      <div class="infographic-placeholder">
        <span class="infographic-placeholder-icon">🖼️</span>
        <p>لا توجد بطاقة بيانية لهذا الكتاب</p>
        <p style="font-size:0.7rem;color:var(--text-dim)">ضع ملفاً باسم ${biblioId}.png في مجلد infographic/</p>
      </div>
    `;
  };
}

// ─────────────────────────────────────────────────────────────
//  نافذة وصل الاستعارة (Receipt Modal)
// ─────────────────────────────────────────────────────────────
window.showReceipt = function (biblioId) {
  const book = BOOKS_CATALOG.find(b => b.biblio_id === biblioId);
  if (!book) return alert('الكتاب غير موجود');

  const guide = buildShelfGuide(book.location || '');
  document.getElementById('rec-date').textContent = new Date().toLocaleDateString('ar-EG');
  document.getElementById('rec-time').textContent = new Date().toLocaleTimeString('ar-EG');
  document.getElementById('rec-faculty').textContent = currentFaculty;
  document.getElementById('rec-title').textContent = book.title;
  document.getElementById('rec-author').textContent = book.author;
  document.getElementById('rec-callnumber').textContent = book.callNumber;
  document.getElementById('rec-location').textContent = book.location;
  document.getElementById('rec-shelf-guide').textContent = guide.shelf;
  document.getElementById('rec-map-note').textContent = `ابدأ من ${guide.kiosk}، ثم اتجه عبر ${guide.aisle} إلى ${guide.shelf}.`;
  document.getElementById('rec-barcode-id').textContent = `REQ-${book.biblio_id.slice(-5)}`;

  document.getElementById('receipt-modal').classList.remove('hidden');
};

window.closeReceiptModal = function () {
  document.getElementById('receipt-modal').classList.add('hidden');
};
window.findSimilar = findSimilar;

// ─────────────────────────────────────────────────────────────
//  نافذة حجز الكتاب (Hold Modal)
// ─────────────────────────────────────────────────────────────
window.openHoldModal = function (biblioId) {
  const book = BOOKS_CATALOG.find(b => b.biblio_id === biblioId);
  if (!book) return;
  currentHoldBookId = biblioId;
  document.getElementById('hold-title').textContent = book.title;
  document.getElementById('hold-status').textContent = 'الحالة: ' + formatAvailability(book.status);
  document.getElementById('hold-contact').value = '';
  document.getElementById('hold-confirmation').classList.add('hidden');
  document.getElementById('hold-confirmation').innerHTML = '';
  document.getElementById('hold-form').classList.remove('hidden');
  document.getElementById('hold-modal').classList.remove('hidden');
};

window.closeHoldModal = function () {
  document.getElementById('hold-modal').classList.add('hidden');
  currentHoldBookId = null;
};

// معالج إرسال نموذج الحجز
document.getElementById('hold-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const contact = document.getElementById('hold-contact').value.trim();
  if (!contact || !currentHoldBookId) return;

  // حفظ في localStorage
  const holds = JSON.parse(localStorage.getItem('sal-holds') || '[]');
  holds.push({
    biblioId: currentHoldBookId,
    contact: contact,
    date: new Date().toISOString(),
    status: 'pending'
  });
  localStorage.setItem('sal-holds', JSON.stringify(holds));

  // إخفاء النموذج وعرض التأكيد
  const book = BOOKS_CATALOG.find(b => b.biblio_id === currentHoldBookId);
  document.getElementById('hold-form').classList.add('hidden');
  const conf = document.getElementById('hold-confirmation');
  conf.innerHTML = `
    <div class="hold-success">
      <span class="hold-success-icon">✅</span>
      <h4>تم تسجيل الحجز بنجاح!</h4>
      <p>سيتم إشعارك على <strong>${escapeHTML(contact)}</strong> عند توفر:</p>
      <p class="hold-success-book">${escapeHTML(book ? book.title : '')}</p>
      <p class="hold-success-note">📌 رقم الحجز: HOLD-${Date.now().toString().slice(-6)}</p>
    </div>
  `;
  conf.classList.remove('hidden');
});
// ─────────────────────────────────────────────────────────────
//  دالات مساعدة (UI)
// ─────────────────────────────────────────────────────────────
function appendUserMsg(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user-row';
  row.innerHTML = `<div class="avatar user-avatar">👤</div><div class="bubble user-bubble">${escapeHTML(text)}</div>`;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function appendTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'msg-row bot-row';
  row.id = 'typing-row';
  row.innerHTML = `<div class="avatar bot-avatar"><img src="logo-icon.png" alt="SAL" class="avatar-logo" /></div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const row = document.getElementById('typing-row');
  if (row) row.remove();
}

function appendBotMsg(html) {
  const row = document.createElement('div');
  row.className = 'msg-row bot-row';
  row.innerHTML = `<div class="avatar bot-avatar"><img src="logo-icon.png" alt="SAL" class="avatar-logo" /></div><div class="bubble bot-bubble">${html}</div>`;
  chatWindow.appendChild(row);
  scrollToBottom();
  // بعد إضافة البطاقات، نحاول تحميل الـ infographics
  setTimeout(() => {
    document.querySelectorAll('.book-card').forEach(card => {
      const id = card.querySelector('[id^="inf-"]')?.id.replace('inf-', '');
      if (id) loadInfographic(id);
    });
  }, 100);
}

function buildNoMatchHTML(scored) {
  const random = [...BOOKS_CATALOG].sort(() => Math.random() - 0.5).slice(0, 3);
  const cards = random.map((b, i) => buildCardHTML({ book: b, score: 0.2 + Math.random() * 0.1 }, i)).join('');
  return `<div class="no-match-bubble"><div class="no-match-banner">😕 لم أجد تطابقاً قوياً، لكن هذه الاقتراحات قد تعجبك:</div><div class="cards-grid">${cards}</div></div>`;
}

function findSimilar(title) {
  userInput.value = `أريد كتباً مشابهة لـ "${title}"`;
  handleSend();
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function debounce(fn, delay = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function autoResizeInput() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
  requestAnimationFrame(() => chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' }));
}

// ─── أحداث الإدخال ───
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', e => {
  const isBoxOpen = !autoBox.classList.contains('hidden') && acItems.length;

  if (isBoxOpen && e.key === 'ArrowDown') {
    e.preventDefault();
    acActiveIndex = (acActiveIndex + 1) % acItems.length;
    updateActiveHighlight();
    return;
  }
  if (isBoxOpen && e.key === 'ArrowUp') {
    e.preventDefault();
    acActiveIndex = (acActiveIndex - 1 + acItems.length) % acItems.length;
    updateActiveHighlight();
    return;
  }
  if (isBoxOpen && e.key === 'Enter' && acActiveIndex >= 0) {
    e.preventDefault();
    selectAutocompleteItem(acActiveIndex);
    return;
  }
  if (isBoxOpen && e.key === 'Escape') {
    hideAutocomplete();
    return;
  }
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    handleSend();
  }
});
userInput.addEventListener('input', () => {
  autoResizeInput();
  handleAutocompleteInput();
});
document.addEventListener('click', (e) => {
  if (!autoBox.contains(e.target) && e.target !== userInput) {
    hideAutocomplete();
  }
});
clearBtn.addEventListener('click', () => {
  document.querySelectorAll('.msg-row:not(#welcome-msg)').forEach(el => el.remove());
  if (suggChips) suggChips.style.display = 'flex';
  userInput.value = '';
  hideAutocomplete();
  userInput.focus();
});

// ─── دالة فتح وتكبير صورة الإنفوجرافيك ───
window.openImageModal = function (src) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  if (modal && modalImg) {
    modalImg.src = src;
    modal.classList.remove('hidden');
  }
};

// ─── دالة إغلاق تكبير الصورة ───
window.closeImageModal = function () {
  const modal = document.getElementById('image-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

// إغلاق النوافذ بزر Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeImageModal();
    closeHoldModal();
    if (typeof window.closeLibraryMapModal === 'function') window.closeLibraryMapModal();
  }
});

// ─── تشغيل التطبيق ───
initModel();