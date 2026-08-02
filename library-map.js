// ============================================================
//  library-map.js — خريطة المكتبة التفاعلية 2D (طابق واحد)
//  المكتبة مقسّمة على أرفف حقيقية حسب نظام ديوي العشري (Dewey)
//  كل قسم رئيسي (000، 100 ... 900) له صف أرفف خاص بلونه واسمه
//  شخصية تتحرك بالأسهم أو بالضغط على أي رف
// ============================================================

import { BOOKS_CATALOG } from './catalog.js';

// ─── تصنيف ديوي العشري الرئيسي (000–900) ───
// كل فئة = صف أرفف مستقل بلون وأيقونة مميزة تعطي إحساس "الحياة" للخريطة
const DEWEY_CLASSES = [
  { min: 0, name: 'الحوسبة والمعرفة العامة', icon: '💻', color: '#a855f7' },
  { min: 100, name: 'الفلسفة وعلم النفس', icon: '🧠', color: '#6366f1' },
  { min: 200, name: 'الأديان والمعتقدات', icon: '🕊️', color: '#14b8a6' },
  { min: 300, name: 'العلوم الاجتماعية', icon: '🏛️', color: '#3b82f6' },
  { min: 400, name: 'اللغات واللغويات', icon: '🗣️', color: '#22d3ee' },
  { min: 500, name: 'العلوم والرياضيات', icon: '🔬', color: '#22c55e' },
  { min: 600, name: 'التكنولوجيا والتطبيقات', icon: '⚙️', color: '#f97316' },
  { min: 700, name: 'الفنون والترفيه', icon: '🎨', color: '#ec4899' },
  { min: 800, name: 'الأدب', icon: '📖', color: '#ef4444' },
  { min: 900, name: 'التاريخ والجغرافيا', icon: '🗺️', color: '#eab308' }
];

// ─── بناء الأقسام والأرفف من الكاتالوج ───
let sections = [];          // [{min,name,icon,color,books[],units[]}]
const bookUnitIndex = {};   // biblio_id → { sectionIdx, unitId }

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function buildSections() {
  sections = DEWEY_CLASSES.map(def => ({ ...def, books: [], units: [] }));

  for (const book of BOOKS_CATALOG) {
    const d = parseFloat(book.dewey);
    const dewey = isNaN(d) ? 0 : d;
    let idx = Math.floor(dewey / 100);
    if (idx < 0) idx = 0;
    if (idx > 9) idx = 9;
    sections[idx].books.push(book);
  }

  // ترتيب الكتب داخل كل قسم برقم ديوي ثم العنوان — ترتيب رفوف واقعي
  sections.forEach(sec => {
    sec.books.sort((a, b) => {
      const da = parseFloat(a.dewey) || 0;
      const db = parseFloat(b.dewey) || 0;
      if (da !== db) return da - db;
      return (a.title || '').localeCompare(b.title || '', 'ar');
    });
  });

  // تقسيم كل قسم إلى عدة "خزانات كتب" (أرفف فعلية) بحيث لا يوجد رف واحد
  // يحمل مئات الكتب — كل خزانة تمثل مكتبة حقيقية بحمولة معقولة
  sections.forEach((sec, sIdx) => {
    const count = sec.books.length;
    const unitCount = Math.max(2, Math.min(14, Math.ceil(count / 45)));
    const perUnit = Math.ceil(count / unitCount);

    for (let u = 0; u < unitCount; u++) {
      const chunk = sec.books.slice(u * perUnit, (u + 1) * perUnit);
      if (chunk.length === 0) continue;
      const first = chunk[0], last = chunk[chunk.length - 1];
      const id = `D${sec.min}-${u + 1}`;
      const unit = {
        id,
        code: id,
        label: `${sec.name} · ${u + 1}/${unitCount}`,
        range: `${first.dewey}–${last.dewey}`,
        books: chunk,
        color: sec.color,
        sectionIdx: sIdx,
        seed: hashString(id)
      };
      sec.units.push(unit);
      chunk.forEach(b => { bookUnitIndex[b.biblio_id] = { sectionIdx: sIdx, unitId: id }; });
    }
  });
}

buildSections();

// ─── ثوابت الرسم ───
const CHAR_SIZE = 28;
const MOVE_SPEED = 3.2;
const UNIT_W = 92;
const UNIT_H = 66;
const UNIT_GAP_X = 20;
const UNIT_GAP_Y = 16;
const CONTENT_W = 640;              // عرض منطقة المحتوى قبل اللف على أسطر جديدة
const PADDING = 44;
const LOBBY_H = 150;                // مساحة المدخل وكشك الاستقبال أعلى الخريطة
const READING_CORNER_H = 110;       // ركن القراءة أسفل الخريطة

// ─── حالة الخريطة ───
let canvas, ctx;
let charX = 110, charY = 110;
let targetX = 110, targetY = 110;
let isMoving = false;
let highlightShelf = null;
let tooltipShelf = null;
let shelfRects = [];      // { x, y, w, h, shelf: unit }
let animFrameId = null;
let keysDown = {};
let mapWidth = 800;
let mapHeight = 700;
let plants = [];          // مواضع نباتات الزينة
let lamps = [];           // مواضع أضواء السقف

// ─── حساب تخطيط الأرفف (صفوف ديوي مع لفّ الأسطر) ───
function layoutSections() {
  const unitsPerLine = Math.max(1, Math.floor((CONTENT_W + UNIT_GAP_X) / (UNIT_W + UNIT_GAP_X)));
  const rects = [];
  plants = [];
  lamps = [];

  let y = PADDING + LOBBY_H;
  const startX = PADDING + 30;

  sections.forEach(sec => {
    const lines = Math.max(1, Math.ceil(sec.units.length / unitsPerLine));
    const rowLabelH = 34;
    sec.rowY = y;
    sec.rowH = rowLabelH + lines * UNIT_H + (lines - 1) * UNIT_GAP_Y + 26;

    sec.units.forEach((unit, i) => {
      const line = Math.floor(i / unitsPerLine);
      const col = i % unitsPerLine;
      unit.x = startX + col * (UNIT_W + UNIT_GAP_X);
      unit.y = sec.rowY + rowLabelH + line * (UNIT_H + UNIT_GAP_Y);
      unit.w = UNIT_W;
      unit.h = UNIT_H;
      rects.push({ x: unit.x, y: unit.y, w: unit.w, h: unit.h, shelf: unit });
    });

    // نبتة زينة في نهاية كل صف
    plants.push({ x: startX + CONTENT_W + 26, y: sec.rowY + sec.rowH / 2 });
    // ضوء سقف فوق كل صف
    lamps.push({ x: startX + CONTENT_W / 2, y: sec.rowY + 6 });

    y += sec.rowH;
  });

  mapWidth = Math.max(760, startX + CONTENT_W + 90);
  mapHeight = y + READING_CORNER_H + PADDING;

  return rects;
}

// ─── رسم عمود كتب (spines) داخل رف — نمط ثابت (seeded) لا يتغير كل فريم ───
function drawBookSpines(unit) {
  const rng = mulberry32(unit.seed);
  const tiers = 2;
  const tierH = (unit.h - 14) / tiers;
  for (let t = 0; t < tiers; t++) {
    const tierY = unit.y + 8 + t * tierH;
    let x = unit.x + 6;
    const maxX = unit.x + unit.w - 6;
    while (x < maxX - 4) {
      const w = 3 + rng() * 5;
      const h = tierH * (0.55 + rng() * 0.4);
      const shade = -30 + Math.floor(rng() * 70);
      ctx.fillStyle = shadeColor(unit.color, shade);
      ctx.fillRect(x, tierY + (tierH - h), w, h);
      x += w + 1.5;
    }
    // خط الرف
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(unit.x + 3, tierY + tierH);
    ctx.lineTo(unit.x + unit.w - 3, tierY + tierH);
    ctx.stroke();
  }
}

// ─── رسم الخريطة ───
function drawMap() {
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = mapWidth * dpr;
  canvas.height = mapHeight * dpr;
  canvas.style.width = mapWidth + 'px';
  canvas.style.height = mapHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ─ أرضية خشبية (باركيه) ─
  ctx.fillStyle = '#151217';
  ctx.fillRect(0, 0, mapWidth, mapHeight);
  const plankW = 34;
  for (let x = 0; x < mapWidth; x += plankW) {
    ctx.fillStyle = (Math.floor(x / plankW) % 2 === 0) ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, 0, plankW, mapHeight);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < mapWidth; x += plankW) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapHeight); ctx.stroke();
  }

  // ─ حدود القاعة ─
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, mapWidth - 28, mapHeight - 28);

  drawLobby();

  // ─ صفوف الأقسام ─
  sections.forEach(sec => drawSectionRow(sec));

  drawReadingCorner();

  // نباتات وأضواء
  plants.forEach(p => drawPlant(p.x, p.y));
  lamps.forEach(l => drawLamp(l.x, l.y));

  // الأرفف نفسها (فوق النباتات/الأضواء لتبقى واضحة)
  shelfRects.forEach(rect => drawUnit(rect.shelf));

  drawCharacter(charX, charY);

  if (tooltipShelf) drawTooltip(tooltipShelf);
}

function drawLobby() {
  // سجادة ترحيب
  ctx.fillStyle = 'rgba(168,85,247,0.10)';
  roundRect(ctx, 40, 40, 170, LOBBY_H - 60, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168,85,247,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 48, 48, 154, LOBBY_H - 76, 8);
  ctx.stroke();

  // الباب
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(24, LOBBY_H / 2 + 18, 18, 46);
  ctx.fillStyle = '#0d0d10';
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🚪', 33, LOBBY_H / 2 + 46);

  // كشك الاستقبال
  const kioskX = 90, kioskY = 60;
  ctx.fillStyle = 'rgba(251,191,36,0.15)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  roundRect(ctx, kioskX, kioskY, 90, 46, 8);
  ctx.fill(); ctx.stroke();
  ctx.font = '18px Segoe UI Emoji';
  ctx.textAlign = 'center';
  ctx.fillText('🛎️', kioskX + 45, kioskY + 22);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '10px Segoe UI, Tajawal, sans-serif';
  ctx.fillText('كشك الاستقبال', kioskX + 45, kioskY + 40);

  // عنوان المكتبة
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 18px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('📚 خريطة المكتبة — تصنيف ديوي العشري', mapWidth - 40, 55);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  ctx.fillText('كل صف يمثل قسمًا رئيسيًا، وكل خزانة رفًا فعليًا داخله', mapWidth - 40, 76);
}

function drawSectionRow(sec) {
  // خلفية شريط خفيفة بلون القسم لتمييز الصف
  ctx.fillStyle = sec.color + '0c';
  ctx.fillRect(20, sec.rowY - 4, mapWidth - 40, sec.rowH - 6);

  // شارة اسم القسم
  const badgeW = 300;
  const badgeX = mapWidth - 40 - badgeW;
  const badgeY = sec.rowY - 2;
  ctx.fillStyle = sec.color + '22';
  ctx.strokeStyle = sec.color;
  ctx.lineWidth = 1.3;
  roundRect(ctx, badgeX, badgeY, badgeW, 26, 13);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = sec.color;
  ctx.font = 'bold 13px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'right';
  const rangeLabel = sec.min === 0 ? '000–099' : `${sec.min}–${sec.min + 99}`;
  ctx.fillText(`${sec.icon} ${sec.name}  ·  ${rangeLabel}`, badgeX + badgeW - 12, badgeY + 18);

  // عدد الكتب
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${sec.books.length} كتاب`, 40, badgeY + 18);
}

function drawUnit(unit) {
  const isHighlight = highlightShelf && unit.code === highlightShelf;
  const isHover = tooltipShelf && unit.code === tooltipShelf.code;

  // ظل أرضي بسيط لإحساس العمق
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(unit.x + 3, unit.y + unit.h - 2, unit.w - 4, 5);

  // إطار الخزانة الخشبي
  ctx.fillStyle = '#241a12';
  roundRect(ctx, unit.x, unit.y, unit.w, unit.h, 6);
  ctx.fill();

  if (isHighlight) {
    const pulse = Math.sin(Date.now() / 300) * 3;
    ctx.shadowColor = unit.color;
    ctx.shadowBlur = 14 + pulse;
    ctx.strokeStyle = unit.color;
    ctx.lineWidth = 2.5;
  } else if (isHover) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.8;
  } else {
    ctx.strokeStyle = unit.color + '80';
    ctx.lineWidth = 1.2;
  }
  roundRect(ctx, unit.x, unit.y, unit.w, unit.h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // كتب ملونة داخل الخزانة
  drawBookSpines(unit);

  // كود الرف
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '8px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(unit.range, unit.x + unit.w / 2, unit.y - 3);

  // عدد الكتب
  ctx.fillStyle = unit.color;
  ctx.font = 'bold 8px Segoe UI';
  ctx.fillText(unit.books.length + '', unit.x + unit.w - 10, unit.y + 10);
}

function drawPlant(x, y) {
  ctx.font = '18px Segoe UI Emoji';
  ctx.textAlign = 'center';
  ctx.fillText('🪴', x, y);
}

function drawLamp(x, y) {
  const grad = ctx.createRadialGradient(x, y, 2, x, y, 40);
  grad.addColorStop(0, 'rgba(255,244,200,0.18)');
  grad.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '12px Segoe UI Emoji';
  ctx.textAlign = 'center';
  ctx.fillText('💡', x, y + 4);
}

function drawReadingCorner() {
  const y = mapHeight - READING_CORNER_H;
  ctx.fillStyle = 'rgba(34,211,238,0.06)';
  roundRect(ctx, 30, y, mapWidth - 60, READING_CORNER_H - 24, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,211,238,0.25)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, 30, y, mapWidth - 60, READING_CORNER_H - 24, 12);
  ctx.stroke();

  ctx.font = '22px Segoe UI Emoji';
  ctx.textAlign = 'right';
  ctx.fillText('🪑📖 ☕ 🪑', mapWidth - 60, y + 40);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  ctx.fillText('ركن القراءة', mapWidth - 60, y + 58);
}

function drawCharacter(x, y) {
  ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + CHAR_SIZE / 2 + 2, CHAR_SIZE / 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = CHAR_SIZE + 'px Segoe UI Emoji, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧑‍🎓', x, y);
  ctx.textBaseline = 'alphabetic';
}

function drawTooltip(shelf) {
  const rect = shelfRects.find(r => r.shelf.code === shelf.code);
  if (!rect) return;

  const lines = [
    '📍 ' + shelf.label,
    '🔢 ديوي ' + shelf.range,
    '📚 ' + shelf.books.length + ' كتاب',
  ];
  shelf.books.slice(0, 3).forEach(b => {
    lines.push('  · ' + (b.title.length > 28 ? b.title.slice(0, 28) + '…' : b.title));
  });
  if (shelf.books.length > 3) {
    lines.push('  + ' + (shelf.books.length - 3) + ' كتب أخرى...');
  }

  const lineH = 18;
  const padX = 12, padY = 10;
  const maxW = Math.max(...lines.map(l => measureText(l))) + padX * 2;
  const boxH = lines.length * lineH + padY * 2;

  let tx = rect.x + rect.w / 2 - maxW / 2;
  let ty = rect.y - boxH - 10;
  if (ty < 10) ty = rect.y + rect.h + 10;
  if (tx < 10) tx = 10;
  if (tx + maxW > mapWidth - 10) tx = mapWidth - maxW - 10;

  ctx.fillStyle = 'rgba(18, 18, 20, 0.95)';
  ctx.strokeStyle = shelf.color + '80';
  ctx.lineWidth = 1;
  roundRect(ctx, tx, ty, maxW, boxH, 10);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'right';
  lines.forEach((line, i) => {
    const color = i === 0 ? shelf.color : i === 1 ? '#a1a1aa' : i === 2 ? '#22d3ee' : '#a1a1aa';
    ctx.fillStyle = color;
    ctx.fillText(line, tx + maxW - padX, ty + padY + (i + 1) * lineH - 3);
  });
}

function measureText(text) {
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  return ctx.measureText(text).width;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

// ─── حلقة التحديث ───
function gameLoop() {
  let dx = 0, dy = 0;
  if (keysDown['ArrowRight'] || keysDown['d']) dx -= MOVE_SPEED;
  if (keysDown['ArrowLeft'] || keysDown['a']) dx += MOVE_SPEED;
  if (keysDown['ArrowDown'] || keysDown['s']) dy += MOVE_SPEED;
  if (keysDown['ArrowUp'] || keysDown['w']) dy -= MOVE_SPEED;

  if (dx !== 0 || dy !== 0) {
    isMoving = false;
    charX = clamp(charX + dx, CHAR_SIZE, mapWidth - CHAR_SIZE);
    charY = clamp(charY + dy, CHAR_SIZE, mapHeight - CHAR_SIZE);
  }

  if (isMoving) {
    const ddx = targetX - charX;
    const ddy = targetY - charY;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist < MOVE_SPEED + 1) {
      charX = targetX;
      charY = targetY;
      isMoving = false;
    } else {
      charX += (ddx / dist) * MOVE_SPEED;
      charY += (ddy / dist) * MOVE_SPEED;
    }
  }

  tooltipShelf = null;
  for (const rect of shelfRects) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dist = Math.sqrt((charX - cx) ** 2 + (charY - cy) ** 2);
    if (dist < UNIT_W * 0.75) {
      tooltipShelf = rect.shelf;
      break;
    }
  }

  drawMap();
  animFrameId = requestAnimationFrame(gameLoop);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── ضمان سكرول حول الخريطة مهما كانت مقاسات حاوية الـ modal الأصلية ───
// الخريطة الواقعية أطول من الشكل القديم (10 صفوف + عدة رفوف بكل قسم)
// فبنلف الـ canvas في حاوية قابلة للسكرول تلقائياً بدل ما يتقطع جزء منها
function ensureScrollWrapper(originalCanvas) {
  let wrapper = document.getElementById('library-map-scroll-wrapper');
  if (wrapper && wrapper.contains(originalCanvas)) return wrapper;

  wrapper = document.getElementById('library-map-scroll-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'library-map-scroll-wrapper';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.maxHeight = '80vh';
    wrapper.style.overflow = 'auto';
    wrapper.style.overscrollBehavior = 'contain';
    originalCanvas.parentNode.insertBefore(wrapper, originalCanvas);
  }
  wrapper.appendChild(originalCanvas);
  return wrapper;
}

// ─── فتح الخريطة ───
window.openLibraryMap = function (biblioId) {
  const modal = document.getElementById('library-map-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  canvas = document.getElementById('library-map-canvas');
  ensureScrollWrapper(canvas);
  ctx = canvas.getContext('2d');

  shelfRects = layoutSections();
  charX = 110;
  charY = 110;
  targetX = charX;
  targetY = charY;
  isMoving = false;
  highlightShelf = null;
  tooltipShelf = null;

  // إيجاد الرف الفعلي للكتاب مباشرة من رقم ديوي — بدون تحليل نصوص
  if (biblioId && bookUnitIndex[biblioId]) {
    const { unitId } = bookUnitIndex[biblioId];
    highlightShelf = unitId;
    const rect = shelfRects.find(r => r.shelf.code === unitId);
    if (rect) {
      targetX = rect.x + rect.w / 2;
      targetY = rect.y + rect.h / 2 + UNIT_H;
      isMoving = true;

      const wrapper = document.getElementById('library-map-scroll-wrapper');
      if (wrapper) {
        // نسمح للـ canvas ياخد أبعاده الحقيقية أولاً قبل حساب موضع السكرول
        requestAnimationFrame(() => {
          wrapper.scrollTop = Math.max(0, rect.y - wrapper.clientHeight / 2);
          wrapper.scrollLeft = Math.max(0, rect.x - wrapper.clientWidth / 2);
        });
      }
    }
  }

  drawMap();

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);

  bindMapEvents();
};

window.closeLibraryMapModal = function () {
  const modal = document.getElementById('library-map-modal');
  if (modal) modal.classList.add('hidden');
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  unbindMapEvents();
};

// ─── أحداث الخريطة ───
let boundKeyDown, boundKeyUp, boundClick;

function bindMapEvents() {
  boundKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
      e.preventDefault();
      keysDown[e.key] = true;
    }
  };
  boundKeyUp = (e) => {
    delete keysDown[e.key];
  };
  boundClick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);

    for (const sr of shelfRects) {
      if (mx >= sr.x && mx <= sr.x + sr.w && my >= sr.y && my <= sr.y + sr.h) {
        targetX = sr.x + sr.w / 2;
        targetY = sr.y + sr.h / 2 + UNIT_H;
        isMoving = true;
        highlightShelf = sr.shelf.code;
        return;
      }
    }

    targetX = mx;
    targetY = my;
    isMoving = true;
  };

  document.addEventListener('keydown', boundKeyDown);
  document.addEventListener('keyup', boundKeyUp);
  canvas.addEventListener('click', boundClick);
}

function unbindMapEvents() {
  if (boundKeyDown) document.removeEventListener('keydown', boundKeyDown);
  if (boundKeyUp) document.removeEventListener('keyup', boundKeyUp);
  if (boundClick) canvas.removeEventListener('click', boundClick);
  keysDown = {};
}
