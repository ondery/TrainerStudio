"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, LockOpen, Maximize2, Minus, Plus, Scaling } from "lucide-react";
import { appearance, patchAppearance, useAppearance, useFrame } from "@/lib/appearance";
import { drawCommands } from "@/lib/draw";
import { boundsOf } from "@/lib/geom";
import { useStudio } from "@/lib/store";
import { Tip } from "@/components/ui";
import { cn } from "@/lib/utils";

export function NavigatorCard() {
  const { t } = useTranslation();
  const frame = useFrame();
  const look = useAppearance();
  const zoomLocked = look.openZoom === "keep";
  const sizeLocked = look.openZoom === "size";
  const projectId = useStudio((state) => state.project?.id);
  const imageId = useStudio((state) => state.editor.imageId);
  const editor = useStudio((state) => state.editor);
  const classes = useStudio((state) => state.classes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const picRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ du: number; dv: number } | null>(null);
  const [shapes, setShapes] = useState(true);
  const [grabbing, setGrabbing] = useState(false);
  const [overView, setOverView] = useState(false);
  const [box, setBox] = useState({ w: 196, h: 120 });
  useEffect(() => {
    try {
      setShapes(window.localStorage.getItem("trainer-studio.nav-shapes") !== "0");
    } catch {
      setShapes(true);
    }
    const toggle = () => {
      setShapes((value) => {
        const next = !value;
        window.localStorage.setItem("trainer-studio.nav-shapes", next ? "1" : "0");
        return next;
      });
    };
    window.addEventListener("studio-nav-shapes", toggle);
    return () => window.removeEventListener("studio-nav-shapes", toggle);
  }, []);
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;
    const measure = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w < 2 || h < 2) return;
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const iw = editor.width || 1;
  const ih = editor.height || 1;
  const fit = Math.min(box.w / iw, box.h / ih);
  const dw = iw * fit;
  const dh = ih * fit;
  const ox = (box.w - dw) / 2;
  const oy = (box.h - dh) / 2;
  const view = visibleRect(frame, iw, ih, ox, oy, dw, dh);
  const percent = Math.max(1, Math.round((frame.scale || 1) * 100));
  const fill = `${zoomToSlider(percent) / 10}%`;

  useEffect(() => {
    if (!projectId || !imageId) return undefined;
    const pic = new Image();
    let dead = false;
    pic.onload = () => {
      if (dead) return;
      picRef.current = pic;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawThumb(ctx, pic);
    };
    pic.src = `/api/projects/${projectId}/images/${imageId}/file`;
    return () => {
      dead = true;
      picRef.current = null;
    };
    function drawThumb(context: CanvasRenderingContext2D, image: HTMLImageElement) {
      paintThumb(context, image, box, ox, oy, dw, dh, iw, ih, shapes ? editor.annotations : [], classes, view);
    }
    // The image is fetched once per open file. The paint effect below redraws the rectangle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, imageId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pic = picRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !pic) return;
    paintThumb(ctx, pic, box, ox, oy, dw, dh, iw, ih, shapes ? editor.annotations : [], classes, view);
  });

  function imagePoint(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return { u: 0.5, v: 0.5 };
    const bounds = canvas.getBoundingClientRect();
    const px = ((event.clientX - bounds.left) / (bounds.width || 1)) * box.w;
    const py = ((event.clientY - bounds.top) / (bounds.height || 1)) * box.h;
    return { u: (px - ox) / (dw || 1), v: (py - oy) / (dh || 1) };
  }

  function hitView(point: { u: number; v: number }) {
    return point.u >= view.left && point.u <= view.left + view.vw && point.v >= view.top && point.v <= view.top + view.vh;
  }

  function centerAt(u: number, v: number) {
    const scale = frame.scale || 1;
    drawCommands.setCamera({
      scale,
      x: frame.w / 2 - u * iw * scale,
      y: frame.h / 2 - v * ih * scale,
    });
  }

  function step(direction: number) {
    const factor = Math.min(3, Math.max(1.05, appearance().zoomStep || 1.25));
    const next = Math.min(40, Math.max(0.02, (frame.scale || 1) * (direction > 0 ? factor : 1 / factor)));
    drawCommands.zoomTo(next);
  }

  function applyPercent(value: number) {
    const next = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
    drawCommands.zoomTo(next / 100);
  }

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.min(3, Math.max(1.05, appearance().zoomStep || 1.25));
      const dx = event.deltaX || 0;
      const dy = event.deltaY || 0;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!delta) return;
      const next = Math.min(40, Math.max(0.02, (frame.scale || 1) * (delta < 0 ? factor : 1 / factor)));
      drawCommands.zoomTo(next);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [frame.scale]);

  return (
    <div
      ref={rootRef}
      data-testid="navigator"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-1 pb-1 pt-1 text-ink"
    >
      <div ref={hostRef} className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded bg-[var(--stage)]">
        <canvas
          ref={canvasRef}
          data-testid="nav-canvas"
          width={box.w}
          height={box.h}
          aria-label={t("nav.view")}
          className={cn(
            "absolute inset-0 h-full w-full",
            grabbing ? "cursor-grabbing" : overView ? "cursor-grab" : "cursor-crosshair",
          )}
          onDoubleClick={(event) => {
            event.preventDefault();
            drawCommands.center();
          }}
          onPointerDown={(event) => {
            if (event.detail >= 2) {
              drawCommands.center();
              return;
            }
            const point = imagePoint(event);
            const inside = hitView(point);
            drag.current = inside ? { du: point.u - (view.left + view.vw / 2), dv: point.v - (view.top + view.vh / 2) } : null;
            setGrabbing(inside);
            if (!inside) centerAt(point.u, point.v);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const point = imagePoint(event);
            setOverView(hitView(point) || Boolean(drag.current));
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            if (drag.current) centerAt(point.u - drag.current.du, point.v - drag.current.dv);
            else centerAt(point.u, point.v);
          }}
          onPointerUp={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onPointerLeave={() => {
            if (!grabbing) setOverView(false);
          }}
        />
      </div>
      <div className="mt-1 flex h-7 shrink-0 items-center gap-0.5">
        <NavIcon label={t("view.zoomOut")} onClick={() => step(-1)}>
          <Minus className="h-3.5 w-3.5" />
        </NavIcon>
        <input
          data-testid="nav-zoom"
          aria-label={t("zoom.step")}
          type="range"
          min={0}
          max={1000}
          value={zoomToSlider(percent)}
          onChange={(event) => applyPercent(sliderToZoom(Number(event.target.value)))}
          className="nav-zoom min-w-0 flex-1"
          style={{ ["--nav-fill" as string]: fill }}
        />
        <NavIcon label={t("view.zoomIn")} onClick={() => step(1)}>
          <Plus className="h-3.5 w-3.5" />
        </NavIcon>
        <NavPercent percent={percent} onCommit={applyPercent} />
        <NavIcon label={t("view.fit")} onClick={() => drawCommands.fit()}>
          <Maximize2 className="h-3.5 w-3.5" />
        </NavIcon>
        <NavIcon
          label={zoomLocked ? t("zoom.unlock") : t("zoom.lock")}
          testId="nav-zoom-lock"
          active={zoomLocked}
          onClick={() => {
            if (zoomLocked) {
              patchAppearance({ openZoom: "fit", fitOnOpen: true });
              return;
            }
            patchAppearance({ openZoom: "keep", fitOnOpen: false });
            drawCommands.center();
          }}
        >
          {zoomLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </NavIcon>
        <NavIcon
          label={sizeLocked ? t("zoom.unlockSize") : t("zoom.size")}
          testId="nav-size-lock"
          active={sizeLocked}
          onClick={() => {
            if (sizeLocked) {
              patchAppearance({ openZoom: "fit", fitOnOpen: true });
              return;
            }
            patchAppearance({ openZoom: "size", fitOnOpen: false });
            drawCommands.center();
          }}
        >
          <Scaling className="h-3.5 w-3.5" />
        </NavIcon>
      </div>
    </div>
  );
}

function NavIcon({ label, onClick, testId, active, children }: { label: string; onClick: () => void; testId?: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-[140ms] hover:bg-panel-2 hover:text-ink",
          active && "bg-panel-2 text-ink",
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

function NavPercent({ percent, onCommit }: { percent: number; onCommit: (value: number) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!edit) return;
    inputRef.current?.select();
  }, [edit]);

  function commit(raw: string) {
    const parsed = Number.parseFloat(raw.replace("%", "").replace(",", "."));
    setEdit(false);
    if (!Number.isFinite(parsed)) return;
    onCommit(parsed);
  }

  if (edit) {
    return (
      <input
        ref={inputRef}
        data-testid="nav-percent"
        aria-label="Zoom"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setEdit(false);
          }
        }}
        className="h-7 w-14 shrink-0 rounded-md bg-panel-2 px-1 text-end text-[12px] font-medium tabular-nums outline-none ring-2 ring-accent"
      />
    );
  }

  return (
    <button
      type="button"
      data-testid="nav-percent"
      aria-label="Zoom"
      className="h-7 min-w-14 shrink-0 cursor-ew-resize rounded-md px-1 text-end text-[12px] font-medium tabular-nums transition-colors duration-[140ms] hover:bg-panel-2"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        scrub.current = { x: event.clientX, start: percent, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const gesture = scrub.current;
        if (!gesture) return;
        const dx = event.clientX - gesture.x;
        if (Math.abs(dx) < 3) return;
        gesture.moved = true;
        onCommit(gesture.start + dx * 0.6);
      }}
      onPointerUp={() => {
        const gesture = scrub.current;
        scrub.current = null;
        if (!gesture?.moved) {
          setDraft(String(percent));
          setEdit(true);
        }
      }}
    >
      {percent}%
    </button>
  );
}

const SLIDER_MIN = 5;
const SLIDER_MAX = 1600;

function zoomToSlider(percent: number) {
  const value = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, percent));
  const logMin = Math.log(SLIDER_MIN);
  const span = Math.log(SLIDER_MAX) - logMin;
  return Math.round(((Math.log(value) - logMin) / span) * 1000);
}

function sliderToZoom(slider: number) {
  const t = Math.min(1000, Math.max(0, slider)) / 1000;
  const logMin = Math.log(SLIDER_MIN);
  const span = Math.log(SLIDER_MAX) - logMin;
  return Math.exp(logMin + t * span);
}

function paintThumb(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: { w: number; h: number },
  ox: number,
  oy: number,
  dw: number,
  dh: number,
  iw: number,
  ih: number,
  annotations: { attributes: Record<string, unknown>; geometry: Parameters<typeof boundsOf>[0]; classId: string }[],
  classes: { id: string; color: string }[],
  view: { x: number; y: number; w: number; h: number },
) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0a84ff";
  context.clearRect(0, 0, box.w, box.h);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--stage").trim() || "#151a22";
  context.fillRect(0, 0, box.w, box.h);
  context.drawImage(image, ox, oy, dw, dh);
  for (const ann of annotations) {
    if (ann.attributes?.hidden) continue;
    const bounds = boundsOf(ann.geometry);
    if (!bounds) continue;
    context.strokeStyle = classes.find((row) => row.id === ann.classId)?.color || accent;
    context.lineWidth = 1;
    context.strokeRect(ox + (bounds.x / iw) * dw, oy + (bounds.y / ih) * dh, Math.max(1, (bounds.width / iw) * dw), Math.max(1, (bounds.height / ih) * dh));
  }
  const x0 = Math.max(ox, view.x);
  const y0 = Math.max(oy, view.y);
  const x1 = Math.min(ox + dw, view.x + view.w);
  const y1 = Math.min(oy + dh, view.y + view.h);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return;
  context.save();
  context.beginPath();
  context.rect(ox, oy, dw, dh);
  context.rect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  context.fillStyle = "rgb(0 0 0 / 42%)";
  context.fill("evenodd");
  context.beginPath();
  context.rect(ox, oy, dw, dh);
  context.clip();
  context.strokeStyle = accent;
  context.lineWidth = 1.5;
  context.strokeRect(x0 + 0.75, y0 + 0.75, Math.max(1, x1 - x0 - 1.5), Math.max(1, y1 - y0 - 1.5));
  context.restore();
}

function visibleRect(
  frame: { x: number; y: number; scale: number; w: number; h: number },
  iw: number,
  ih: number,
  ox: number,
  oy: number,
  dw: number,
  dh: number,
) {
  const scale = frame.scale || 1;
  const left = (-frame.x) / (iw * scale);
  const top = (-frame.y) / (ih * scale);
  const vw = frame.w / (iw * scale);
  const vh = frame.h / (ih * scale);
  return { x: ox + left * dw, y: oy + top * dh, w: vw * dw, h: vh * dh, left, top, vw, vh };
}
