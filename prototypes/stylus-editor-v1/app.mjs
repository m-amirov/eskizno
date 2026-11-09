import {
  createDocument, createHistory, clientToNormalized, addStroke,
  undo, redo, changeStep, changeMode, changeAudience, restoreDocument,
  screenToArtboard, zoomView, pinchView,
} from './core.mjs';
import { renderInk } from './ink.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('drawing');
const context = canvas.getContext('2d');
const inkCanvas = document.createElement('canvas');
const inkContext = inkCanvas.getContext('2d');
const frame = document.querySelector('.artboard-frame');
const stage = document.querySelector('.artboard-stage');

const lessons = [
  { title: 'Плавная линия', skill: 'Контроль движения', adult: 'Проведи длинную спокойную линию снизу вверх. Это основа будущей ветки.', child: 'Начни внизу листа и плавно веди линию вверх — получится стебель.' },
  { title: 'Ответвления', skill: 'Направление и длина', adult: 'От основной линии проведи три коротких ответвления под разными углами.', child: 'Добавь три маленькие веточки, которые смотрят в разные стороны.' },
  { title: 'Первый лист', skill: 'Построение формы', adult: 'Построй лист двумя мягкими дугами, встречающимися в одной точке.', child: 'Нарисуй первый лист: две округлые линии соединяются на кончике.' },
  { title: 'Ритм и размер', skill: 'Пропорции и композиция', adult: 'Повтори форму ещё трижды, немного меняя размер и наклон листьев.', child: 'Добавь ещё три листика. Пусть один будет маленьким, другой побольше.' },
  { title: 'Детали', skill: 'Точность и акценты', adult: 'Тонкими линиями обозначь прожилки; при желании добавь один цветовой акцент.', child: 'Добавь на листьях тонкие прожилки и выбери цвет для пары линий.' },
  { title: 'Свободная вариация', skill: 'Самостоятельный рисунок', adult: 'Скрой подсказку и нарисуй рядом свой вариант ветки. Важно решение, а не точное совпадение.', child: 'А теперь придумай свою веточку без обводки. Она может быть совсем другой!' },
];

// Original simple vector guides, in a fixed 1000×750 logical artboard.
const guidePaths = [
  ['M 310 667 C 400 550 464 395 559 145'],
  ['M 401 520 Q 349 455 258 429', 'M 472 370 Q 555 312 653 342', 'M 515 258 Q 460 210 400 171'],
  ['M 258 429 C 189 412 184 331 212 311 C 276 311 315 364 258 429'],
  ['M 653 342 C 700 263 785 254 821 260 C 803 329 730 376 653 342', 'M 400 171 C 338 140 314 84 318 45 C 382 64 427 123 400 171', 'M 559 145 C 583 64 652 40 705 44 C 692 111 628 157 559 145'],
  ['M 258 429 Q 238 374 212 311', 'M 653 342 Q 736 300 821 260', 'M 400 171 Q 371 102 318 45', 'M 559 145 Q 633 78 705 44'],
  [],
];

const STORAGE_KEY = 'eskizno:prototype:botanical-branch:v1';
let doc = createDocument();
try { doc = restoreDocument(localStorage.getItem(STORAGE_KEY)) || doc; } catch { /* Local storage may be disabled. */ }
let history = createHistory(doc.strokes);
let tool = 'brush';
let brush = { color: '#252a2c', width: 3 };
let eraser = { width: 24 };
let draft = null;
let pointerId = null;
const activePointers = new Map();
let pinching = false;
let view = { zoom: 1, panX: 0, panY: 0 };
let frameWidth = 700;
let frameHeight = 525;
let saveTimer;

function setStatus(message) { $('status').textContent = message; }

function saveSoon() {
  $('saved-indicator').textContent = 'Сохранение…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...doc, strokes: history.present }));
      $('saved-indicator').textContent = 'Сохранено на устройстве';
    } catch {
      $('saved-indicator').textContent = 'Не удалось сохранить';
      setStatus('Браузер не сохранил рисунок. Можно скачать его как PNG.');
    }
  }, 180);
}

function syncDocument() { doc = { ...doc, strokes: history.present }; saveSoon(); }

function adjustCanvas() {
  const style = getComputedStyle(stage);
  const availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  frameWidth = Math.max(80, Math.floor(Math.min(availableWidth, availableHeight * 4 / 3)));
  frameHeight = Math.max(60, Math.floor(frameWidth * 3 / 4));
  frame.style.width = `${frameWidth}px`;
  frame.style.height = `${frameHeight}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(frameWidth * dpr);
  canvas.height = Math.round(frameHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function drawGuides(ctx, width, height, mode, step) {
  if (mode === 'free' || step === 5) return;
  ctx.save();
  ctx.scale(width / 1000, height / 750);
  ctx.lineWidth = 2.1;
  ctx.strokeStyle = '#b2baba';
  ctx.setLineDash(mode === 'trace' ? [9, 9] : [3, 15]);
  for (let index = 0; index <= step; index++) {
    ctx.globalAlpha = mode === 'trace' ? (index === step ? .9 : .35) : (index === step ? .65 : .16);
    for (const path of guidePaths[index]) ctx.stroke(new Path2D(path));
  }
  if (mode === 'construct') {
    const dots = [[310,667], [559,145], [401,520], [472,370], [515,258]];
    ctx.setLineDash([]);
    ctx.globalAlpha = .7;
    ctx.fillStyle = '#80969a';
    for (const [x,y] of dots) { ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

function paint(ctx, width, height, includeGuides = true) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width * (0.5 + view.panX), height * (0.5 + view.panY));
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-width / 2, -height / 2);
  if (includeGuides) drawGuides(ctx, width, height, doc.mode, doc.step);
  ctx.restore();
  ctx.drawImage(inkCanvas, 0, 0, width, height);
}

function render() {
  const dpr = canvas.width / frameWidth;
  if (inkCanvas.width !== canvas.width || inkCanvas.height !== canvas.height) {
    inkCanvas.width = canvas.width;
    inkCanvas.height = canvas.height;
  }
  inkContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderInk(inkContext, frameWidth, frameHeight, history.present, view, doc.step, draft);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, frameWidth, frameHeight);
  paint(context, frameWidth, frameHeight);
  $('undo').disabled = history.past.length === 0;
  $('redo').disabled = history.future.length === 0;
}

function refreshUI() {
  $('step-counter').textContent = `${String(doc.step + 1).padStart(2,'0')} / 06`;
  $('step-title').textContent = `${String(doc.step + 1).padStart(2,'0')} — ${lessons[doc.step].title}`;
  $('instruction').textContent = lessons[doc.step][doc.audience];
  $('skill-note').textContent = `Навык: ${lessons[doc.step].skill.toLowerCase()}`;
  $('audience').textContent = doc.audience === 'child' ? 'Для детей' : 'Для взрослых';
  $('previous').disabled = doc.step === 0;
  $('next').innerHTML = doc.step === 5 ? 'Готово <span aria-hidden="true">✓</span>' : 'Дальше <span aria-hidden="true">→</span>';
  document.querySelectorAll('.mode').forEach(button => {
    const active = button.dataset.mode === doc.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const steps = $('step-list');
  steps.replaceChildren(...lessons.map((lesson, index) => {
    const li = document.createElement('li');
    li.className = index === doc.step ? 'current' : index < doc.step ? 'complete' : '';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.textContent = lesson.title;
    li.append(number, name);
    return li;
  }));
  render();
}

function pickTool(nextTool) {
  tool = nextTool;
  for (const name of ['brush','eraser']) {
    const button = $(`tool-${name}`);
    const active = name === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  const width = tool === 'eraser' ? eraser.width : brush.width;
  $('size').min = tool === 'eraser' ? '4' : '1';
  $('size').max = tool === 'eraser' ? '50' : '16';
  $('size').value = String(width);
  $('size-value').textContent = String(width);
  $('tool-status').textContent = `${tool === 'eraser' ? 'Ластик' : 'Кисть'} · ${width} px`;
}

function applyHistory(next) { history = next; syncDocument(); render(); }

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
  return clientToNormalized(event.clientX, event.clientY, rect);
}

function pointerPoint(event) { return screenToArtboard(canvasPoint(event), view); }

function updateZoomUI() {
  $('zoom-reset').textContent = `${Math.round(view.zoom * 100)}%`;
  $('zoom-out').disabled = view.zoom <= 1;
  $('zoom-in').disabled = view.zoom >= 4;
}

function setZoom(nextZoom, anchor) {
  view = zoomView(view, nextZoom, anchor);
  updateZoomUI();
  render();
}

function updatePinch(previousPoints, currentPoints) {
  view = pinchView(view, previousPoints, currentPoints);
  updateZoomUI();
  render();
}

function appendPoint(event) {
  const point = pointerPoint(event);
  if (!point || !draft) return;
  const previous = draft.points.at(-1);
  if (!previous || Math.hypot(previous.x-point.x, previous.y-point.y) > .0008) draft.points.push(point);
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const position = canvasPoint(event);
  if (!position) return;
  activePointers.set(event.pointerId, position);
  if (activePointers.size > 2) return;
  try { canvas.setPointerCapture(event.pointerId); } catch { /* Not all synthetic pointers allow capture. */ }
  if (activePointers.size === 2) {
    pinching = true;
    draft = null;
    pointerId = null;
    render();
    return;
  }
  if (pinching || pointerId !== null) return;
  pointerId = event.pointerId;
  draft = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    kind: tool === 'eraser' ? 'erase' : 'ink',
    step: doc.step,
    color: tool === 'eraser' ? '#000000' : brush.color,
    width: tool === 'eraser' ? eraser.width : brush.width,
    points: [],
  };
  appendPoint(event);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (activePointers.has(event.pointerId)) {
    const before = [...activePointers.values()].slice(0, 2);
    activePointers.set(event.pointerId, clientToNormalized(event.clientX, event.clientY, canvas.getBoundingClientRect()));
    if (pinching && activePointers.size >= 2) {
      updatePinch(before, [...activePointers.values()].slice(0, 2));
      return;
    }
  }
  if (pinching) return;
  if (pointerId !== event.pointerId) return;
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  for (const sample of (events.length ? events : [event])) appendPoint(sample);
  render();
});

function finishPointer(event, cancelled = false) {
  activePointers.delete(event.pointerId);
  if (pinching) {
    if (activePointers.size === 0) pinching = false;
    return;
  }
  if (pointerId !== event.pointerId) return;
  if (draft && !cancelled) {
    appendPoint(event);
    applyHistory(addStroke(history, draft));
  }
  draft = null;
  pointerId = null;
  render();
}
canvas.addEventListener('pointerup', (event) => finishPointer(event));
canvas.addEventListener('pointercancel', (event) => finishPointer(event, true));
canvas.addEventListener('lostpointercapture', (event) => finishPointer(event, true));

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const anchor = canvasPoint(event);
  if (anchor) setZoom(view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), anchor);
}, { passive: false });

$('zoom-in').addEventListener('click', () => setZoom(view.zoom * 1.25));
$('zoom-out').addEventListener('click', () => setZoom(view.zoom / 1.25));
$('zoom-reset').addEventListener('click', () => setZoom(1));

$('tool-brush').addEventListener('click', () => pickTool('brush'));
$('tool-eraser').addEventListener('click', () => pickTool('eraser'));
$('undo').addEventListener('click', () => applyHistory(undo(history)));
$('redo').addEventListener('click', () => applyHistory(redo(history)));
$('size').addEventListener('input', (event) => {
  if (tool === 'eraser') eraser.width = Number(event.target.value);
  else brush.width = Number(event.target.value);
  pickTool(tool);
});
document.querySelectorAll('.color-swatch').forEach((button) => button.addEventListener('click', () => {
  brush.color = button.dataset.color;
  document.querySelectorAll('.color-swatch').forEach((swatch) => { const active = swatch === button; swatch.classList.toggle('active',active); swatch.setAttribute('aria-pressed',String(active)); });
  pickTool('brush');
}));
document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
  doc = changeMode(doc, button.dataset.mode);
  saveSoon(); refreshUI();
}));
$('audience').addEventListener('click', () => { doc = changeAudience(doc, doc.audience === 'adult' ? 'child' : 'adult'); saveSoon(); refreshUI(); });
$('previous').addEventListener('click', () => { doc = changeStep(doc, doc.step - 1); saveSoon(); refreshUI(); });
$('next').addEventListener('click', () => {
  if (doc.step === 5) {
    doc = changeMode(doc, 'free');
    setStatus('Урок завершён. Рисунок можно сохранить в PNG или начать снова.');
  } else {
    doc = changeStep(doc, doc.step + 1);
  }
  saveSoon(); refreshUI();
});
$('restart').addEventListener('click', () => {
  if (!confirm('Удалить рисунок и начать урок заново?')) return;
  doc = createDocument();
  history = createHistory([]);
  saveSoon(); refreshUI();
  setStatus('Новый рисунок. Начните с первой линии.');
});
$('export').addEventListener('click', () => {
  const output = document.createElement('canvas');
  output.width = 1200; output.height = 900;
  const ctx = output.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
  const transparentInk = document.createElement('canvas');
  transparentInk.width = output.width;
  transparentInk.height = output.height;
  renderInk(transparentInk.getContext('2d'), output.width, output.height, history.present, { zoom: 1, panX: 0, panY: 0 }, doc.step);
  ctx.drawImage(transparentInk, 0, 0);
  const link = document.createElement('a');
  link.download = 'eskizno-vetka-s-listyami.png';
  link.href = output.toDataURL('image/png');
  link.click();
  setStatus('PNG сохранён без учебных направляющих.');
});
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT','TEXTAREA'].includes(target.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); applyHistory(event.shiftKey ? redo(history) : undo(history));
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); applyHistory(redo(history));
  } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'b') pickTool('brush');
  else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'e') pickTool('eraser');
});

new ResizeObserver(adjustCanvas).observe(stage);
refreshUI();
pickTool('brush');
updateZoomUI();
