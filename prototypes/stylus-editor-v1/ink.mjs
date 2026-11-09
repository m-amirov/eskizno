// Draw ink and eraser gestures on a transparent layer, separately from lesson guides.
// Erasers use destination-out on this layer only: the white artboard and guide
// underneath are never erased, and later ink can paint over erased regions.
function drawGesture(ctx, gesture, width, height) {
  const points = gesture.points;
  if (!points?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = gesture.kind === 'erase' ? 'destination-out' : 'source-over';
  ctx.fillStyle = gesture.kind === 'erase' ? '#000' : gesture.color;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = gesture.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const first = points[0];
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x * width, first.y * height, gesture.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * width, points[i].y * height);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderInk(ctx, width, height, strokes, view, step, draft = null) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  ctx.save();
  ctx.translate(width * (0.5 + view.panX), height * (0.5 + view.panY));
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-width / 2, -height / 2);
  for (const stroke of strokes) if (stroke.step <= step) drawGesture(ctx, stroke, width, height);
  if (draft) drawGesture(ctx, draft, width, height);
  ctx.restore();
}
