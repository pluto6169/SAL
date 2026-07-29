// ============================================================
//  library-map.js — خريطة المكتبة التفاعلية 2D
//  ملف مستقل يستورد الكاتالوج ويرسم خريطة الطوابق
//  مع شخصية متحركة بالأسهم أو بالضغط على الأرفف
// ============================================================

import { BOOKS_CATALOG } from './catalog.js';

// ─── تعريف الطوابق والأرفف ───
// كل طابق يحتوي على مصفوفة أرفف، كل رف له id ولون وموضع
const FLOOR_DEFS = {
  'ref': {
    name: 'القسم المرجعي',
    icon: '📚',
    color: '#a855f7',
    shelves: []
  },
  'floor1': {
    name: 'الطابق الأول',
    icon: '1️⃣',
    color: '#22d3ee',
    shelves: []
  },
  'floor2': {
    name: 'الطابق الثاني',
    icon: '2️⃣',
    color: '#34d399',
    shelves: []
  },
  'floor3': {
    name: 'الطابق الثالث',
    icon: '3️⃣',
    color: '#fbbf24',
    shelves: []
  }
};

// ─── استخلاص الأرفف من الكاتالوج تلقائياً ───
function extractShelves() {
  const shelfMap = {}; // shelfCode → { floor, books[], label }

  for (const book of BOOKS_CATALOG) {
    const loc = book.location || '';
    // استخلاص كود الرف من نهاية location مثل "REF-A" أو "P-07"
    const codeMatch = loc.match(/([A-Z][\w-]+\d*)\s*$/i);
    if (!codeMatch) continue;
    const code = codeMatch[1];

    // تحديد الطابق
    let floor = 'floor1';
    if (/القسم المرجعي/i.test(loc)) floor = 'ref';
    else if (/الطابق الأول/i.test(loc)) floor = 'floor1';
    else if (/الطابق الثاني/i.test(loc)) floor = 'floor2';
    else if (/الطابق الثالث/i.test(loc)) floor = 'floor3';

    if (!shelfMap[code]) {
      // استخلاص اسم الرف الوصفي
      const labelMatch = loc.match(/رف\s+(.+?)\s+[A-Z]/i);
      const label = labelMatch ? labelMatch[1] : code;
      shelfMap[code] = { floor, books: [], label, code };
    }
    shelfMap[code].books.push(book);
  }

  // توزيع الأرفف على الطوابق
  for (const [code, data] of Object.entries(shelfMap)) {
    if (FLOOR_DEFS[data.floor]) {
      FLOOR_DEFS[data.floor].shelves.push(data);
    }
  }
}

extractShelves();

// ─── ثوابت الرسم ───
const TILE = 56;           // حجم المربع الواحد
const CHAR_SIZE = 28;      // حجم الشخصية
const MOVE_SPEED = 3;      // سرعة الحركة بالبكسل
const SHELF_W = 80;        // عرض الرف
const SHELF_H = 40;        // ارتفاع الرف
const PADDING = 40;        // مسافة داخلية

// ─── حالة الخريطة ───
let canvas, ctx;
let currentFloor = 'ref';
let charX = 120, charY = 120;
let targetX = 120, targetY = 120;
let isMoving = false;
let highlightShelf = null;
let tooltipShelf = null;
let shelfRects = [];      // { x, y, w, h, shelf } مواضع الأرفف المرسومة
let animFrameId = null;
let keysDown = {};
let mapWidth = 800;
let mapHeight = 500;

// ─── حساب تخطيط الأرفف ───
function layoutShelves(floor) {
  const shelves = FLOOR_DEFS[floor].shelves;
  const cols = Math.ceil(Math.sqrt(shelves.length * 1.5));
  const rows = Math.ceil(shelves.length / cols);

  const gapX = SHELF_W + 30;
  const gapY = SHELF_H + 50;

  mapWidth = Math.max(600, cols * gapX + PADDING * 2 + 100);
  mapHeight = Math.max(400, rows * gapY + PADDING * 2 + 120);

  const rects = [];
  const startX = PADDING + 80;
  const startY = PADDING + 80;

  shelves.forEach((shelf, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      x: startX + col * gapX,
      y: startY + row * gapY,
      w: SHELF_W,
      h: SHELF_H,
      shelf
    });
  });

  return rects;
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

  const floorDef = FLOOR_DEFS[currentFloor];

  // خلفية
  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0, 0, mapWidth, mapHeight);

  // شبكة خفيفة
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < mapWidth; x += TILE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapHeight); ctx.stroke();
  }
  for (let y = 0; y < mapHeight; y += TILE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapWidth, y); ctx.stroke();
  }

  // حدود الطابق
  ctx.strokeStyle = floorDef.color + '30';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, mapWidth - 40, mapHeight - 40);

  // عنوان الطابق
  ctx.fillStyle = floorDef.color;
  ctx.font = 'bold 16px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(floorDef.icon + ' ' + floorDef.name, mapWidth - 35, 50);

  // المدخل
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(30, mapHeight / 2 - 20, 18, 40);
  ctx.fillStyle = '#0d0d10';
  ctx.font = '10px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🚪', 39, mapHeight / 2 + 4);

  // الكشك
  ctx.fillStyle = '#a855f720';
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1.5;
  const kioskX = 70, kioskY = mapHeight / 2 - 15;
  roundRect(ctx, kioskX, kioskY, 36, 30, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a855f7';
  ctx.font = '9px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('الكشك', kioskX + 18, kioskY + 19);

  // رسم الأرفف
  shelfRects.forEach(rect => {
    const isHighlight = highlightShelf && rect.shelf.code === highlightShelf;
    const isHover = tooltipShelf && rect.shelf.code === tooltipShelf.code;

    // خلفية الرف
    if (isHighlight) {
      ctx.fillStyle = floorDef.color + '40';
      ctx.strokeStyle = floorDef.color;
      ctx.lineWidth = 2.5;
      // تأثير pulse
      const pulse = Math.sin(Date.now() / 300) * 3;
      ctx.shadowColor = floorDef.color;
      ctx.shadowBlur = 12 + pulse;
    } else if (isHover) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
    } else {
      ctx.fillStyle = '#1e1e22';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
    }

    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // أيقونة الرف
    ctx.fillStyle = isHighlight ? '#fff' : 'rgba(255,255,255,0.5)';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('📕', rect.x + rect.w / 2, rect.y + 18);

    // كود الرف
    ctx.fillStyle = isHighlight ? '#fff' : 'rgba(255,255,255,0.4)';
    ctx.font = '9px Courier New, monospace';
    ctx.fillText(rect.shelf.code, rect.x + rect.w / 2, rect.y + rect.h - 5);

    // عدد الكتب
    const count = rect.shelf.books.length;
    ctx.fillStyle = floorDef.color;
    ctx.font = 'bold 8px Segoe UI';
    ctx.fillText(count + '', rect.x + rect.w - 8, rect.y + 12);
  });

  // رسم الشخصية
  drawCharacter(charX, charY);

  // tooltip
  if (tooltipShelf) {
    drawTooltip(tooltipShelf);
  }
}

function drawCharacter(x, y) {
  // ظل
  ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + CHAR_SIZE / 2 + 2, CHAR_SIZE / 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // الشخصية
  ctx.font = CHAR_SIZE + 'px Segoe UI Emoji, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧑‍🎓', x, y);
  ctx.textBaseline = 'alphabetic';
}

function drawTooltip(shelf) {
  // إيجاد موضع الرف
  const rect = shelfRects.find(r => r.shelf.code === shelf.code);
  if (!rect) return;

  const lines = [
    '📍 ' + shelf.label + ' (' + shelf.code + ')',
    '📚 ' + shelf.books.length + ' كتاب',
  ];
  // أول 3 كتب
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

  // خلفية
  ctx.fillStyle = 'rgba(18, 18, 20, 0.95)';
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, tx, ty, maxW, boxH, 10);
  ctx.fill(); ctx.stroke();

  // نص
  ctx.fillStyle = '#f4f4f5';
  ctx.font = '11px Segoe UI, Tajawal, sans-serif';
  ctx.textAlign = 'right';
  lines.forEach((line, i) => {
    const color = i === 0 ? '#a855f7' : i === 1 ? '#22d3ee' : '#a1a1aa';
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
  // حركة بالكيبورد
  let dx = 0, dy = 0;
  if (keysDown['ArrowRight'] || keysDown['d']) dx -= MOVE_SPEED;
  if (keysDown['ArrowLeft'] || keysDown['a']) dx += MOVE_SPEED;
  if (keysDown['ArrowDown'] || keysDown['s']) dy += MOVE_SPEED;
  if (keysDown['ArrowUp'] || keysDown['w']) dy -= MOVE_SPEED;

  if (dx !== 0 || dy !== 0) {
    isMoving = false; // إلغاء الحركة التلقائية عند استخدام الأسهم
    charX = clamp(charX + dx, CHAR_SIZE, mapWidth - CHAR_SIZE);
    charY = clamp(charY + dy, CHAR_SIZE, mapHeight - CHAR_SIZE);
  }

  // حركة تلقائية (بالضغط على رف)
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

  // فحص collision مع الأرفف
  tooltipShelf = null;
  for (const rect of shelfRects) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dist = Math.sqrt((charX - cx) ** 2 + (charY - cy) ** 2);
    if (dist < SHELF_W * 0.8) {
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

// ─── تبديل الطابق ───
function switchFloor(floor) {
  currentFloor = floor;
  shelfRects = layoutShelves(floor);
  charX = 100;
  charY = mapHeight / 2;
  targetX = charX;
  targetY = charY;
  isMoving = false;
  highlightShelf = null;
  tooltipShelf = null;

  // تحديث tabs
  document.querySelectorAll('.map-floor-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.floor === floor);
  });

  drawMap();
}

// ─── فتح الخريطة ───
window.openLibraryMap = function (biblioId) {
  const modal = document.getElementById('library-map-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  canvas = document.getElementById('library-map-canvas');
  ctx = canvas.getContext('2d');

  // إيجاد الكتاب والطابق
  let targetFloor = 'ref';
  let targetShelfCode = null;

  if (biblioId) {
    const book = BOOKS_CATALOG.find(b => b.biblio_id === biblioId);
    if (book) {
      const loc = book.location || '';
      const codeMatch = loc.match(/([A-Z][\w-]+\d*)\s*$/i);
      if (codeMatch) targetShelfCode = codeMatch[1];

      if (/القسم المرجعي/i.test(loc)) targetFloor = 'ref';
      else if (/الطابق الأول/i.test(loc)) targetFloor = 'floor1';
      else if (/الطابق الثاني/i.test(loc)) targetFloor = 'floor2';
      else if (/الطابق الثالث/i.test(loc)) targetFloor = 'floor3';
    }
  }

  highlightShelf = targetShelfCode;
  switchFloor(targetFloor);

  // تحريك الشخصية إلى الرف المحدد
  if (targetShelfCode) {
    const rect = shelfRects.find(r => r.shelf.code === targetShelfCode);
    if (rect) {
      // بدء الشخصية من المدخل
      charX = 100;
      charY = mapHeight / 2;
      targetX = rect.x + rect.w / 2;
      targetY = rect.y + rect.h / 2 + SHELF_H;
      isMoving = true;
    }
  }

  // تشغيل حلقة الرسم
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);

  // ربط الأحداث
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
let boundKeyDown, boundKeyUp, boundClick, boundMouseMove;

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
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);

    // فحص الضغط على رف
    for (const sr of shelfRects) {
      if (mx >= sr.x && mx <= sr.x + sr.w && my >= sr.y && my <= sr.y + sr.h) {
        targetX = sr.x + sr.w / 2;
        targetY = sr.y + sr.h / 2 + SHELF_H;
        isMoving = true;
        highlightShelf = sr.shelf.code;
        return;
      }
    }

    // حركة حرة للموقع المحدد
    targetX = mx;
    targetY = my;
    isMoving = true;
  };

  boundMouseMove = (e) => {
    // تحويل الماوس لعرض hover على الأرفف
    // (لا نحتاج لفعل شيء — tooltip يعمل بالقرب)
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

// ─── ربط tabs الطوابق ───
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.map-floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchFloor(tab.dataset.floor);
    });
  });
});
