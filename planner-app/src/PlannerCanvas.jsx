import { useCallback, useEffect, useRef } from 'react';
import './PlannerCanvas.css';

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID_SPACING = 30;
const DOT_RADIUS   = 1.5;
const DOT_COLOR    = '#b0b0b0';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const BLOCK_W        = 12 * GRID_SPACING;
const BLOCK_H        = 20 * GRID_SPACING;
const BLOCK_GAP      = 1  * GRID_SPACING;
const BLOCK_MARGIN_X = 1  * GRID_SPACING;
const BLOCK_ROW1_Y   = 2  * GRID_SPACING;
const BLOCK_ROW2_Y   = BLOCK_ROW1_Y + BLOCK_H + 2 * GRID_SPACING;

const DAY_BLOCKS = DAYS.map((name, i) => {
  const row = i < 4 ? 0 : 1;
  const col = i < 4 ? i : i - 4;
  return {
    name,
    wx: BLOCK_MARGIN_X + col * (BLOCK_W + BLOCK_GAP),
    wy: row === 0 ? BLOCK_ROW1_Y : BLOCK_ROW2_Y,
  };
});

// ── Pure drawing helpers (no React dependency) ─────────────────────────────────
function drawDayBlock(ctx, name, wx, wy, offsetX, offsetY, scale) {
  const sx = wx * scale + offsetX;
  const sy = wy * scale + offsetY;
  const sw = BLOCK_W * scale;
  const sh = BLOCK_H * scale;

  const fontSize = Math.max(8, Math.round(14 * scale));
  ctx.font = `bold ${fontSize}px sans-serif`;

  const textWidth = ctx.measureText(name).width;
  const textPad   = 6 * scale;
  const gapW      = textWidth + textPad * 2;
  const gapStart  = (sw - gapW) / 2;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';

  // Top-left segment
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + gapStart, sy);
  ctx.stroke();

  // Top-right segment
  ctx.beginPath();
  ctx.moveTo(sx + gapStart + gapW, sy);
  ctx.lineTo(sx + sw, sy);
  ctx.stroke();

  // Right, bottom, left sides
  ctx.beginPath();
  ctx.moveTo(sx + sw, sy);
  ctx.lineTo(sx + sw, sy + sh);
  ctx.lineTo(sx,       sy + sh);
  ctx.lineTo(sx,       sy);
  ctx.stroke();

  // Label centred in the top-border gap
  ctx.fillStyle    = '#000000';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, sx + sw / 2, sy);
}

function drawFrame(ctx, w, h, offsetX, offsetY, scale) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Dot grid
  const step   = GRID_SPACING * scale;
  const startX = ((offsetX % step) + step) % step;
  const startY = ((offsetY % step) + step) % step;

  ctx.fillStyle = DOT_COLOR;
  for (let x = startX; x < w; x += step) {
    for (let y = startY; y < h; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Day blocks on top of the grid
  DAY_BLOCKS.forEach(({ name, wx, wy }) =>
    drawDayBlock(ctx, name, wx, wy, offsetX, offsetY, scale),
  );
}

// ── Touch helpers ──────────────────────────────────────────────────────────────
function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMid(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PlannerCanvas() {
  const canvasRef = useRef(null);

  // All mutable state kept in a ref so event handlers never go stale.
  const s = useRef({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    isPanning: false,
    lastMouseX: 0,
    lastMouseY: 0,
    lastTouchDist: null,
    lastTouchMidX: 0,
    lastTouchMidY: 0,
  });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { offsetX, offsetY, scale } = s.current;
    drawFrame(ctx, canvas.width, canvas.height, offsetX, offsetY, scale);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Resize ──────────────────────────────────────────────────────────────
    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      redraw();
    }

    // ── Wheel zoom ──────────────────────────────────────────────────────────
    function onWheel(e) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale   = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s.current.scale * zoomFactor));
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      s.current.offsetX = mouseX - (mouseX - s.current.offsetX) * (newScale / s.current.scale);
      s.current.offsetY = mouseY - (mouseY - s.current.offsetY) * (newScale / s.current.scale);
      s.current.scale   = newScale;
      redraw();
    }

    // ── Mouse pan ───────────────────────────────────────────────────────────
    function onMouseDown(e) {
      if (e.button !== 0) return;
      s.current.isPanning  = true;
      s.current.lastMouseX = e.clientX;
      s.current.lastMouseY = e.clientY;
      canvas.classList.add('panning');
    }

    function onMouseMove(e) {
      if (!s.current.isPanning) return;
      s.current.offsetX += e.clientX - s.current.lastMouseX;
      s.current.offsetY += e.clientY - s.current.lastMouseY;
      s.current.lastMouseX = e.clientX;
      s.current.lastMouseY = e.clientY;
      redraw();
    }

    function onMouseUp() {
      s.current.isPanning = false;
      canvas.classList.remove('panning');
    }

    // ── Touch pan + pinch zoom ───────────────────────────────────────────────
    function onTouchStart(e) {
      e.preventDefault();
      if (e.touches.length === 1) {
        s.current.isPanning      = true;
        s.current.lastMouseX     = e.touches[0].clientX;
        s.current.lastMouseY     = e.touches[0].clientY;
        s.current.lastTouchDist  = null;
      } else if (e.touches.length === 2) {
        s.current.isPanning     = false;
        s.current.lastTouchDist = getTouchDist(e.touches);
        const mid = getTouchMid(e.touches);
        s.current.lastTouchMidX = mid.x;
        s.current.lastTouchMidY = mid.y;
      }
    }

    function onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && s.current.isPanning) {
        s.current.offsetX   += e.touches[0].clientX - s.current.lastMouseX;
        s.current.offsetY   += e.touches[0].clientY - s.current.lastMouseY;
        s.current.lastMouseX = e.touches[0].clientX;
        s.current.lastMouseY = e.touches[0].clientY;
        redraw();
      } else if (e.touches.length === 2) {
        const dist       = getTouchDist(e.touches);
        const mid        = getTouchMid(e.touches);
        const zoomFactor = dist / (s.current.lastTouchDist || dist);
        const newScale   = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s.current.scale * zoomFactor));

        s.current.offsetX = mid.x - (s.current.lastTouchMidX - s.current.offsetX) * (newScale / s.current.scale);
        s.current.offsetY = mid.y - (s.current.lastTouchMidY - s.current.offsetY) * (newScale / s.current.scale);
        s.current.scale        = newScale;
        s.current.lastTouchDist = dist;
        s.current.lastTouchMidX = mid.x;
        s.current.lastTouchMidY = mid.y;
        redraw();
      }
    }

    function onTouchEnd(e) {
      e.preventDefault();
      if (e.touches.length < 2) s.current.lastTouchDist = null;
      if (e.touches.length === 0) s.current.isPanning = false;
    }

    // ── Register listeners ───────────────────────────────────────────────────
    window.addEventListener('resize', resize);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    resize(); // initial size + first draw

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [redraw]);

  return <canvas ref={canvasRef} className="planner-canvas" />;
}
