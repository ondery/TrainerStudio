"use client";

import Konva from "konva";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Group } from "react-konva";
import { appearance, setFrame, setPointer, setZoomPercent, useAppearance } from "@/lib/appearance";
import { bindCrosshair, guidePaint } from "@/lib/guides";
import { openFrame, stickyOpen, type KeptZoom } from "@/lib/zoom-frame";
import { CanvasChrome } from "./chrome";
import { setRawHover, useRawHover } from "@/lib/rawlink";
import { api } from "@/lib/api";
import { drawCommands, finishGeometry } from "@/lib/draw";
import { CANVAS, polygonInk, screenDash, screenStroke } from "@/lib/canvas-style";
import { boundsOf, moveAnnotation, near, poseBox, rectFromDrag } from "@/lib/geom";
import { cursorFor, handlePoints, hitBox, resizeBox as resizeFromHandle, type HandleId } from "@/lib/hit";
import { beginRun, cancelKind, cancelRun, failRun, finishRun, hostBox, paintRun, pointHull, ringOf, useRuns, useRunToast } from "@/lib/runline";
import { takeLink } from "@/lib/link";
import { i18n } from "@/lib/i18n";
import { newAnnotation, useDraft, useStudio } from "@/lib/store";
import type { Annotation, Geometry, Point } from "@/lib/types";

const DRAWING = new Set(["bbox", "polygon", "obb", "pose", "sam"]);

/** Vertical wheel uses deltaY; tilt / second wheel uses deltaX with deltaY ≈ 0. */
function wheelZoomDelta(event: WheelEvent) {
  const dx = event.deltaX || 0;
  const dy = event.deltaY || 0;
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

type Size = { w: number; h: number };
type Drag =
  | { kind: "pan"; px: number; py: number; ox: number; oy: number }
  | { kind: "bbox" | "obb"; x: number; y: number }
  | { kind: "move"; x: number; y: number; ids: string[]; copy?: boolean }
  | { kind: "bbox-handle"; id: string; handle: HandleId; base: { x: number; y: number; width: number; height: number } }
  | { kind: "point"; id: string; index: number; geometry: Geometry }
  | { kind: "rotate"; id: string; cx: number; cy: number; start: number; origin: Point[]; corners: Point[] };

function useHtmlImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);
  return image;
}

export function Canvas() {
  const editor = useStudio((state) => state.editor);
  const projectId = useStudio((state) => state.project?.id);
  const tool = useStudio((state) => state.ui.tool);
  const look = useAppearance();
  const rawHover = useRawHover();
  const samModel = useStudio((state) => state.ui.samModel);
  const samCheckpoint = useAppearance().samCheckpoint;
  const samDevice = useStudio((state) => state.ui.samDevice);
  const classes = useStudio((state) => state.classes);
  const hostRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const loupeBox = useRef<HTMLDivElement>(null);
  const worldRef = useRef<Konva.Layer>(null);
  const runRef = useRef<Konva.Layer>(null);
  const previewRef = useRef<Konva.Layer>(null);
  const guideH = useRef<HTMLElement>(null);
  const guideV = useRef<HTMLElement>(null);
  const kept = useRef<KeptZoom | null>(null);
  const openedFor = useRef<string | null>(null);
  const runs = useRuns();
  const runToast = useRunToast();
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const reducedRef = useRef(false);
  const samToken = useRef(0);
  const paintPreviewRef = useRef<() => void>(() => undefined);
  const groups = useRef(new Map<string, Konva.Group>());
  const view = useRef({ x: 40, y: 40, scale: 1 });
  const fitScale = useRef(1);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const poly = useRef<Point[]>([]);
  const pose = useRef<Array<Point & { visibility: 0 | 1 | 2 }>>([]);
  const mask = useRef<Geometry | null>(null);
  const [size, setSize] = useState<Size>({ w: 800, h: 600 });
  const [scale, setScale] = useState(1);
  const [pointCount, setPointCount] = useState(0);
  const image = useHtmlImage(projectId && editor.imageId ? `/api/projects/${projectId}/images/${editor.imageId}/file` : null);

  const touched = useRef(false);
  const apply = () => {
    const angle = appearance().viewRotate || 0;
    const cx = editor.width / 2;
    const cy = editor.height / 2;
    const scaleNow = view.current.scale;
    for (const layer of [worldRef.current, runRef.current, previewRef.current]) {
      if (!layer) continue;
      if (angle) {
        layer.offset({ x: cx, y: cy });
        layer.position({ x: view.current.x + cx * scaleNow, y: view.current.y + cy * scaleNow });
        layer.rotation(angle);
      } else {
        layer.offset({ x: 0, y: 0 });
        layer.position({ x: view.current.x, y: view.current.y });
        layer.rotation(0);
      }
      layer.scale({ x: scaleNow, y: scaleNow });
      layer.batchDraw();
    }
    setFrame({ x: view.current.x, y: view.current.y, scale: scaleNow, w: size.w, h: size.h, iw: editor.width, ih: editor.height });
    if (editor.width && editor.height && size.w && size.h) {
      const centeredX = (size.w - editor.width * scaleNow) / 2;
      const centeredY = (size.h - editor.height * scaleNow) / 2;
      kept.current = { scale: scaleNow, panX: view.current.x - centeredX, panY: view.current.y - centeredY, w: editor.width, h: editor.height };
    }
    placeRunBorders(angle);
  };

  const fit = () => {
    if (!editor.width || !editor.height || !size.w || !size.h) return;
    const next = Math.min(size.w / editor.width, size.h / editor.height) * 0.94;
    fitScale.current = next || 1;
    view.current = {
      scale: next,
      x: (size.w - editor.width * next) / 2,
      y: (size.h - editor.height * next) / 2,
    };
    setScale((prev) => (prev === next ? prev : next));
    apply();
  };

  const center = () => {
    if (!editor.width || !editor.height || !size.w || !size.h) return;
    const scaleNow = view.current.scale || 1;
    view.current.x = (size.w - editor.width * scaleNow) / 2;
    view.current.y = (size.h - editor.height * scaleNow) / 2;
    touched.current = true;
    apply();
  };

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editor.width || !editor.height || !size.w || !size.h) return;
    const mode = appearance().openZoom;
    const changed = openedFor.current !== editor.imageId;
    if (changed) {
      openedFor.current = editor.imageId;
      touched.current = stickyOpen(mode) && kept.current != null;
      const frame = openFrame(mode, { w: size.w, h: size.h }, { w: editor.width, h: editor.height }, stickyOpen(mode) ? kept.current : null);
      fitScale.current = frame.fit;
      view.current = { scale: frame.scale, x: frame.x, y: frame.y };
      setScale(frame.scale);
      apply();
      return;
    }
    if (!touched.current) {
      const frame = openFrame(stickyOpen(mode) ? "fit" : mode, { w: size.w, h: size.h }, { w: editor.width, h: editor.height }, null);
      fitScale.current = frame.fit;
      view.current = { scale: frame.scale, x: frame.x, y: frame.y };
      setScale(frame.scale);
      apply();
    }
    // Open zoom runs when the image or the stage size changes. After the user pans, size changes leave the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.imageId, editor.width, editor.height, image, size.w, size.h]);

  useEffect(() => {
    const host = hostRef.current;
    const horizontal = guideH.current;
    const vertical = guideV.current;
    if (!host || !horizontal || !vertical) return undefined;
    return bindCrosshair({
      host,
      horizontal,
      vertical,
      active: () => appearance().guideLines,
    });
  }, []);

  useEffect(() => {
    poly.current = [];
    pose.current = [];
    mask.current = null;
    cancelRun("sam");
    clearPreview();
  }, [editor.imageId, tool]);

  useEffect(() => {
    cancelKind("save");
    cancelRun("sam");
  }, [editor.imageId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const layer = runRef.current;
    if (!layer) return;
    layer.destroyChildren();
    if (!runs.length) {
      layer.batchDraw();
      return;
    }
    const band = new Konva.Rect({ listening: false, opacity: 0.28 });
    const shape = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => {
        const style = appearance();
        const accent = style.runColor || style.accent;
        const scaleNow = view.current.scale || 1;
        for (const job of runsRef.current) {
          paintRun(context, ringOf(job.geometry), performance.now(), scaleNow, accent, job.classColor, job.status, reducedRef.current, style.runWidth || 3);
        }
      },
    });
    layer.add(band);
    layer.add(shape);
    const anim = new Konva.Animation(() => {
      const scan = runsRef.current.find((job) => job.kind === "scan" && job.status === "run" && job.geometry.type === "bbox");
      if (!scan || scan.geometry.type !== "bbox") {
        band.visible(false);
        return;
      }
      const box = scan.geometry;
      const yNorm = reducedRef.current ? 0.5 : (performance.now() % 1400) / 1400;
      const thickness = Math.min(box.height, Math.max(2, box.height * 0.08));
      const style = appearance();
      band.visible(true);
      band.fill(style.runColor || style.accent);
      band.setAttrs({
        x: box.x,
        y: box.y + yNorm * box.height - thickness,
        width: box.width,
        height: thickness * 2,
      });
    }, layer);
    if (runs.some((job) => job.status === "error" || (job.status === "run" && job.kind === "scan"))) anim.start();
    apply();
    return () => {
      anim.stop();
      layer.destroyChildren();
    };
    // The scene function reads the latest jobs from a ref. apply is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  useLayoutEffect(() => {
    placeRunBorders(appearance().viewRotate || 0);
  }, [runs]);

  useEffect(() => useDraft.subscribe((state) => {
    setPointCount(state.points.length);
    paintPreviewRef.current();
  }), []);

  useEffect(() => {
    if (tool !== "sam" || !pointCount || !projectId || !editor.imageId) {
      if (!pointCount) {
        mask.current = null;
        finishRun("sam");
      }
      paintPreview();
      return;
    }
    const token = samToken.current + 1;
    samToken.current = token;
    const handle = window.setTimeout(() => {
      const points = useDraft.getState().points;
      const pending = mask.current && ringOf(mask.current).length >= 3
        ? mask.current
        : ({ type: "polygon", points: pointHull(points.map((point) => ({ x: point.x, y: point.y }))) } as Geometry);
      beginRun({ key: "sam", kind: "sam", geometry: pending, classColor: activeClassColor() });
      void api<{ geometry: Geometry }>(`/api/projects/${projectId}/sam`, {
        method: "POST",
        body: JSON.stringify({
          imageId: editor.imageId,
          points: points.map((point) => ({ x: point.x, y: point.y })),
          labels: points.map((point) => point.sign),
          model: samCheckpoint.trim() || samModel,
          device: samDevice,
        }),
      })
        .then((body) => {
          if (samToken.current !== token) return;
          mask.current = body.geometry;
          finishRun("sam");
          paintPreview();
        })
        .catch((error: Error) => {
          if (samToken.current !== token) return;
          mask.current = null;
          failRun("sam", error.message);
          useStudio.getState().setNotice(error.message, "error");
          paintPreview();
        });
    }, 180);
    return () => window.clearTimeout(handle);
    // paintPreview is stable enough for this effect; it only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount, tool, projectId, editor.imageId, samModel, samCheckpoint, samDevice]);

  useEffect(() => {
    apply();
  });

  useEffect(() => {
    drawCommands.fit = fit;
    drawCommands.center = center;
    drawCommands.zoom = (direction) => {
      const old = view.current.scale || 1;
      const step = Math.min(3, Math.max(1.05, appearance().zoomStep || 1.25));
      const next = Math.min(40, Math.max(0.02, old * (direction > 0 ? step : 1 / step)));
      const cx = size.w / 2;
      const cy = size.h / 2;
      const imageX = (cx - view.current.x) / old;
      const imageY = (cy - view.current.y) / old;
      view.current.scale = next;
      view.current.x = cx - imageX * next;
      view.current.y = cy - imageY * next;
      touched.current = true;
      setScale(next);
      apply();
    };
    drawCommands.zoomTo = (absolute) => {
      const old = view.current.scale || 1;
      const next = Math.min(40, Math.max(0.02, absolute));
      const cx = size.w / 2;
      const cy = size.h / 2;
      const imageX = (cx - view.current.x) / old;
      const imageY = (cy - view.current.y) / old;
      view.current.scale = next;
      view.current.x = cx - imageX * next;
      view.current.y = cy - imageY * next;
      touched.current = true;
      setScale(next);
      apply();
    };
    drawCommands.setCamera = (next) => {
      view.current = { scale: next.scale, x: next.x, y: next.y };
      touched.current = true;
      setScale(next.scale);
      apply();
    };
    drawCommands.zoomSelection = () => {
      const studio = useStudio.getState();
      const boxes = studio.editor.annotations.filter((row) => studio.editor.selected.includes(row.id)).map((row) => boundsOf(row.geometry)).filter((box): box is NonNullable<typeof box> => Boolean(box));
      if (!boxes.length) return;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const box of boxes) {
        x0 = Math.min(x0, box.x);
        y0 = Math.min(y0, box.y);
        x1 = Math.max(x1, box.x + box.width);
        y1 = Math.max(y1, box.y + box.height);
      }
      const pad = 24;
      const next = Math.min(40, Math.max(0.02, Math.min((size.w - pad) / Math.max(1, x1 - x0), (size.h - pad) / Math.max(1, y1 - y0))));
      view.current.scale = next;
      view.current.x = size.w / 2 - ((x0 + x1) / 2) * next;
      view.current.y = size.h / 2 - ((y0 + y1) / 2) * next;
      touched.current = true;
      setScale(next);
      apply();
    };
    const onZoom = (event: Event) => {
      const value = Number((event as CustomEvent).detail);
      if (Number.isFinite(value)) drawCommands.zoomTo(value);
    };
    window.addEventListener("studio-zoom", onZoom);
    drawCommands.space = (down) => {
      space.current = down;
    };
    drawCommands.cancel = () => {
      poly.current = [];
      pose.current = [];
      mask.current = null;
      drag.current = null;
      useDraft.getState().clear();
      clearPreview();
    };
    drawCommands.backspace = () => {
      if (tool === "sam") {
        useDraft.getState().removeSelected();
        return;
      }
      if (tool === "polygon") {
        poly.current = poly.current.slice(0, -1);
        paintPreview();
      }
      if (tool === "pose") {
        pose.current = pose.current.slice(0, -1);
        paintPreview();
      }
    };
    drawCommands.commit = () => {
      const stage = worldRef.current?.getStage();
      const pointer = stage?.getPointerPosition() || { x: size.w / 2, y: size.h / 2 };
      const client = hostCenter(pointer);
      if (tool === "polygon" && poly.current.length >= 3) {
        const geometry: Geometry = { type: "polygon", points: poly.current };
        poly.current = [];
        clearPreview();
        finishGeometry(geometry, client.x, client.y);
      } else if (tool === "pose" && pose.current.length) {
        const geometry: Geometry = { type: "pose", keypoints: pose.current, box: poseBox(pose.current) };
        pose.current = [];
        clearPreview();
        finishGeometry(geometry, client.x, client.y);
      } else if (tool === "sam" && mask.current) {
        const geometry = mask.current;
        mask.current = null;
        useDraft.getState().clear();
        clearPreview();
        finishGeometry(geometry, client.x, client.y);
      }
    };
    return () => {
      window.removeEventListener("studio-zoom", onZoom);
      drawCommands.fit = () => undefined;
      drawCommands.center = () => undefined;
      drawCommands.zoom = () => undefined;
      drawCommands.zoomTo = () => undefined;
      drawCommands.zoomSelection = () => undefined;
      drawCommands.setCamera = () => undefined;
      drawCommands.cancel = () => undefined;
      drawCommands.commit = () => undefined;
      drawCommands.backspace = () => undefined;
    };
    // Commands close over the current tool, image size, and stage size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, size.w, size.h, editor.width, editor.height, editor.imageId]);

  function hostCenter(pointer: { x: number; y: number }) {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: (rect?.left || 0) + pointer.x, y: (rect?.top || 0) + pointer.y };
  }

  function placeRunBorders(angle = appearance().viewRotate || 0) {
    const host = hostRef.current;
    if (!host) return;
    const pose = view.current;
    const image = { width: editor.width, height: editor.height };
    for (const el of host.querySelectorAll<HTMLElement>(".run-border")) {
      const job = runsRef.current.find((item) => item.key === el.dataset.runKey);
      const box = job ? hostBox(ringOf(job.geometry), pose, image, angle, 0) : null;
      if (!box) {
        el.style.width = "0px";
        el.style.height = "0px";
        el.style.transform = "translate3d(-10000px, -10000px, 0)";
        continue;
      }
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    }
  }

  function clearPreview() {
    previewRef.current?.destroyChildren();
    previewRef.current?.batchDraw();
  }

  function paintPreview(cursor?: Point) {
    const layer = previewRef.current;
    if (!layer) return;
    layer.destroyChildren();
    const stroke = "#0a84ff";
    if (poly.current.length) {
      const ink = polygonInk(false);
      const points = poly.current;
      layer.add(lineNode(points, stroke, false, view.current.scale, ink.dash));
      if (cursor) {
        const last = points[points.length - 1];
        layer.add(lineNode([last, cursor], stroke, false, view.current.scale, ink.dash));
        const first = points[0];
        const nearClose = points.length >= 3 && Math.hypot(cursor.x - first.x, cursor.y - first.y) < CANVAS.hit / view.current.scale;
        const radius = (nearClose ? CANVAS.closeRadius : 4.5) / view.current.scale;
        layer.add(new Konva.Circle({
          x: first.x,
          y: first.y,
          radius,
          fill: nearClose ? CANVAS.closeColor : "#ffffff",
          stroke: nearClose ? CANVAS.closeColor : stroke,
          strokeWidth: 1.5 / view.current.scale,
          listening: false,
        }));
      }
    }
    if (pose.current.length) {
      layer.add(lineNode(pose.current, "#3dd68c", false, view.current.scale));
    }
    const held = useDraft.getState().hold?.geometry;
    const settled = held || (mask.current && !runsRef.current.some((job) => job.key === "sam" && job.status === "run") ? mask.current : null);
    const ring = settled ? ringOf(settled) : [];
    if (ring.length >= 3) layer.add(lineNode(ring, activeClassColor(), true, view.current.scale));
    const draft = useDraft.getState();
    draft.points.forEach((point, index) => {
      const size = (index === draft.selected ? 12 : 8) / view.current.scale;
      layer.add(squareNode(point.x - size / 2, point.y - size / 2, size, point.sign ? "#3dd68c" : "#ff6b6b"));
    });
    layer.batchDraw();
  }
  paintPreviewRef.current = paintPreview;

  function imagePoint(stage: Konva.Stage): Point | null {
    const pointer = stage.getPointerPosition();
    const layer = worldRef.current;
    if (!pointer || !layer) return null;
    return layer.getAbsoluteTransform().copy().invert().point(pointer);
  }

  function placeLoupe(stage: Konva.Stage, point: Point | null) {
    const box = loupeBox.current;
    const canvas = loupeRef.current;
    const style = appearance();
    if (!box || !canvas) return;
    const show = Boolean(point && image && style.loupe && (style.guideLines || style.crosshairCursor) && DRAWING.has(useStudio.getState().ui.tool));
    if (!show || !point || !image) {
      box.style.display = "none";
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const loupe = Math.max(64, style.loupeSize || 128);
    const span = loupe / Math.max(1, style.loupeZoom || 4);
    canvas.width = loupe;
    canvas.height = loupe;
    box.style.width = `${loupe}px`;
    box.style.height = `${loupe}px`;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, loupe, loupe);
    ctx.drawImage(image, point.x - span / 2, point.y - span / 2, span, span, 0, 0, loupe, loupe);
    ctx.strokeStyle = style.crossColor;
    ctx.globalAlpha = style.crossOpacity;
    ctx.beginPath();
    const mid = (style.loupeSize || 128) / 2;
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, style.loupeSize || 128);
    ctx.moveTo(0, mid);
    ctx.lineTo(style.loupeSize || 128, mid);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const pointer = stage.getPointerPosition() || { x: 16, y: 16 };
    let left = pointer.x + 16;
    let top = pointer.y + 16;
    if (left + loupe > size.w) left = Math.max(8, pointer.x - loupe - 16);
    if (top + loupe > size.h) top = Math.max(8, pointer.y - loupe - 16);
    box.style.display = "block";
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function onDown(event: Konva.KonvaEventObject<MouseEvent>) {
    const stage = event.target.getStage();
    if (!stage) return;
    const point = imagePoint(stage);
    if (!point) return;
    if (event.evt.button === 1 || tool === "pan" || space.current) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      touched.current = true;
      drag.current = { kind: "pan", px: pointer.x, py: pointer.y, ox: view.current.x, oy: view.current.y };
      return;
    }
    if (tool === "link") return;
    if (tool === "select") {
      if (event.evt.button === 1 || space.current) {
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        touched.current = true;
        drag.current = { kind: "pan", px: pointer.x, py: pointer.y, ox: view.current.x, oy: view.current.y };
        return;
      }
      if (event.target === stage) {
        drag.current = { kind: "bbox", x: point.x, y: point.y };
      }
      return;
    }
    if (tool === "bbox" || tool === "obb") {
      drag.current = { kind: tool, x: point.x, y: point.y };
      return;
    }
    if (tool === "polygon") {
      if (poly.current.length >= 3 && Math.hypot(poly.current[0].x - point.x, poly.current[0].y - point.y) < 8 / view.current.scale) {
        drawCommands.commit();
        return;
      }
      poly.current = [...poly.current, point];
      paintPreview();
      return;
    }
    if (tool === "pose") {
      if (pose.current.length < 17) pose.current = [...pose.current, { ...point, visibility: 2 }];
      paintPreview();
      return;
    }
    if (tool === "sam") {
      const draft = useDraft.getState();
      const hit = draft.points.findIndex((item) => near(item, point, 10 / view.current.scale));
      if (hit >= 0) {
        draft.selectPoint(hit);
        draft.removeSelected();
        return;
      }
      draft.addPoint({ ...point, sign: event.evt.shiftKey ? 0 : 1 });
    }
  }

  function onMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const stage = event.target.getStage();
    if (!stage) return;
    const point = imagePoint(stage);
    if (point) setPointer(Math.round(point.x), Math.round(point.y), true);
    placeLoupe(stage, point);
    const current = drag.current;
    if (!current || !point) {
      const near = poly.current.length >= 3 && point ? Math.hypot(point.x - poly.current[0].x, point.y - poly.current[0].y) < CANVAS.hit / view.current.scale : false;
      if (poly.current.length) paintPreview(point || undefined);
      paintCursor(point, near, event.evt.altKey);
      return;
    }
    paintCursor(point, false, event.evt.altKey);
    if (current.kind === "pan") {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      view.current.x = current.ox + pointer.x - current.px;
      view.current.y = current.oy + pointer.y - current.py;
      apply();
      return;
    }
    if (current.kind === "bbox" || current.kind === "obb") {
      const rect = rectFromDrag(current.x, current.y, point.x, point.y);
      const layer = previewRef.current;
      if (!layer) return;
      layer.destroyChildren();
      layer.add(new Konva.Rect({ ...rect, stroke: "#0a84ff", strokeWidth: screenStroke(1.5, false), strokeScaleEnabled: false, dash: screenDash(CANVAS.dash, view.current.scale), listening: false }));
      layer.batchDraw();
      return;
    }
    if (current.kind === "move") {
      const dx = point.x - current.x;
      const dy = point.y - current.y;
      for (const id of current.ids) groups.current.get(id)?.position({ x: dx, y: dy });
      worldRef.current?.batchDraw();
      return;
    }
    if (current.kind === "rotate") {
      const angle = Math.atan2(point.y - current.cy, point.x - current.cx) - current.start;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = current.origin.map((item) => ({
        x: current.cx + (item.x - current.cx) * cos - (item.y - current.cy) * sin,
        y: current.cy + (item.x - current.cx) * sin + (item.y - current.cy) * cos,
      }));
      groups.current.get(current.id)?.findOne(".shape")?.setAttrs({ points: corners.flatMap((item) => [item.x, item.y]) });
      current.corners = corners;
      worldRef.current?.batchDraw();
      return;
    }
    if (current.kind === "bbox-handle") {
      const next = resizeFromHandle(current.base, current.handle, point);
      const group = groups.current.get(current.id);
      const shape = group?.findOne(".shape");
      shape?.setAttrs(next);
      worldRef.current?.batchDraw();
      return;
    }
    if (current.kind === "point") {
      const geometry = movePoint(current.geometry, current.index, point);
      current.geometry = geometry;
      const group = groups.current.get(current.id);
      redrawGeometry(group, geometry, scale);
      worldRef.current?.batchDraw();
    }
  }

  function onUp(event: Konva.KonvaEventObject<MouseEvent>) {
    const stage = event.target.getStage();
    const current = drag.current;
    drag.current = null;
    if (!stage || !current) return;
    const point = imagePoint(stage);
    const pointer = stage.getPointerPosition() || { x: 0, y: 0 };
    const client = hostCenter(pointer);
    if (!point) return;
    if (current.kind === "pan") return;
    if (current.kind === "bbox" || current.kind === "obb") {
      clearPreview();
      const rect = rectFromDrag(current.x, current.y, point.x, point.y);
      if (rect.width < 2 || rect.height < 2) return;
      const geometry: Geometry = current.kind === "bbox" ? { type: "bbox", ...rect } : { type: "obb", corners: boxCorners(rect) };
      finishGeometry(geometry, client.x, client.y);
      return;
    }
    if (current.kind === "move") {
      const dx = point.x - current.x;
      const dy = point.y - current.y;
      for (const id of current.ids) groups.current.get(id)?.position({ x: 0, y: 0 });
      if (Math.hypot(dx, dy) < 0.5) return;
      const studio = useStudio.getState();
      const ids = new Set(current.ids);
      if (current.copy) {
        const added = studio.editor.annotations.filter((row) => ids.has(row.id)).map((row) => newAnnotation(row.imageId, row.classId, moveAnnotation(row, dx, dy).geometry, { ...row.attributes }));
        if (!added.length) return;
        studio.commit([...studio.editor.annotations, ...added], "paste");
        studio.select(added.map((row) => row.id));
        return;
      }
      studio.commit(studio.editor.annotations.map((row) => (ids.has(row.id) ? moveAnnotation(row, dx, dy) : row)), "move");
      return;
    }
    if (current.kind === "bbox-handle") {
      const studio = useStudio.getState();
      const next = resizeFromHandle(current.base, current.handle, point);
      studio.commit(
        studio.editor.annotations.map((row) =>
          row.id === current.id && row.geometry.type === "bbox" ? { ...row, geometry: { type: "bbox", ...next }, updatedAt: new Date().toISOString() } : row,
        ),
        "resize",
      );
      return;
    }
    if (current.kind === "point") {
      const studio = useStudio.getState();
      const geometry = current.geometry;
      studio.commit(studio.editor.annotations.map((row) => (row.id === current.id ? { ...row, geometry, updatedAt: new Date().toISOString() } : row)), "edit");
    }
    if (current.kind === "rotate") {
      const studio = useStudio.getState();
      const corners = current.corners as [Point, Point, Point, Point];
      studio.commit(
        studio.editor.annotations.map((row) => (row.id === current.id ? { ...row, geometry: { type: "obb", corners }, updatedAt: new Date().toISOString() } : row)),
        "edit",
      );
    }
  }

  function paintCursor(point: Point | null, nearClose: boolean, alt = false) {
    const host = hostRef.current;
    if (!host) return;
    const studio = useStudio.getState();
    const look = appearance();
    const selected = studio.editor.annotations.find((row) => studio.editor.selected.includes(row.id));
    let hit = null;
    if (point && selected && selected.geometry.type === "bbox") {
      hit = hitBox(point, selected.geometry, CANVAS.hit / Math.max(view.current.scale, 0.02), true);
    }
    let locked = false;
    if (point) {
      for (const row of studio.editor.annotations) {
        const box = boundsOf(row.geometry);
        if (!box) continue;
        const inside = point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
        if (inside && (row.attributes.locked || look.lockedClasses.includes(row.classId))) locked = true;
      }
    }
    const name = cursorFor({
      tool: studio.ui.tool,
      hit,
      space: space.current,
      dragging: Boolean(drag.current),
      crosshairCursor: look.crosshairCursor,
      drawing: DRAWING.has(studio.ui.tool) || studio.ui.tool === "select",
      nearClose,
      alt,
      locked,
    });
    host.style.cursor = name === "rotate" ? "" : name;
    host.dataset.cursor = name;
    const badge = badgeRef.current;
    if (badge) {
      const shown = name === "rotate" || name === "copy" || name === "not-allowed" || name === "grab" || name === "grabbing";
      badge.hidden = !shown;
      badge.dataset.cursor = name;
      const key = name === "not-allowed" ? "cursor.denied" : name === "grabbing" ? "cursor.grabbing" : `cursor.${name}`;
      badge.textContent = shown ? i18n.t(key, { defaultValue: name }) : "";
    }
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const old = view.current.scale;
    touched.current = true;
    const lookNow = appearance();
    if (lookNow.wheelMode === "pan") {
      view.current.x -= event.evt.deltaX || 0;
      view.current.y -= event.evt.deltaY;
      apply();
      return;
    }
    const step = Math.min(3, Math.max(1.05, lookNow.zoomStep || lookNow.wheelZoom || 1.25));
    const delta = wheelZoomDelta(event.evt);
    if (!delta) return;
    const next = Math.min(40, Math.max(0.02, old * (delta < 0 ? step : 1 / step)));
    const imageX = (pointer.x - view.current.x) / old;
    const imageY = (pointer.y - view.current.y) / old;
    view.current.scale = next;
    view.current.x = pointer.x - imageX * next;
    view.current.y = pointer.y - imageY * next;
    setScale(next);
    apply();
  }

  const zoom = Math.max(1, Math.round((scale || 0) * 100));
  useEffect(() => {
    setZoomPercent(zoom);
  }, [zoom]);
  const drawing = DRAWING.has(tool) || tool === "select";
  const cursor = cursorFor({ tool, hit: null, space: false, dragging: false, crosshairCursor: look.crosshairCursor, drawing, nearClose: false });

  return (
    <div
      ref={hostRef}
      data-testid="canvas-host"
      data-label-color={look.labelColor}
      data-running={runs.some((job) => job.status === "run") ? "1" : "0"}
      dir="ltr"
      className="relative h-full min-h-0 w-full overflow-hidden"
      style={{ cursor, background: look.canvasBg || undefined, ["--run-width" as string]: `${look.runWidth || 3}px`, ["--run-color" as string]: look.runColor || look.accent }}
      onMouseLeave={() => {
        setPointer(0, 0, false);
        setRawHover("");
        if (loupeBox.current) loupeBox.current.style.display = "none";
      }}
    >
      <i ref={guideH} data-guide="h" data-axis="h" data-pattern={look.crossStyle} data-shadow={look.crossShadow ? "1" : "0"} className="guide-cross" style={guidePaint({ axis: "h", pattern: look.crossStyle, color: look.crossColor, opacity: look.crossOpacity, thickness: look.crossWidth, dash: look.crossDash, gap: look.crossGap, shadow: look.crossShadow })} />
      <i ref={guideV} data-guide="v" data-axis="v" data-pattern={look.crossStyle} data-shadow={look.crossShadow ? "1" : "0"} className="guide-cross" style={guidePaint({ axis: "v", pattern: look.crossStyle, color: look.crossColor, opacity: look.crossOpacity, thickness: look.crossWidth, dash: look.crossDash, gap: look.crossGap, shadow: look.crossShadow })} />
      <div className="absolute inset-0" style={{ filter: `brightness(${look.brightness}) contrast(${look.contrast})` }}>
      <Stage width={size.w} height={size.h} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel}>
        <Layer ref={worldRef}>
          {image ? <KonvaImage image={image} width={editor.width} height={editor.height} listening={false} /> : null}
          {editor.annotations.filter((annotation) => !annotation.attributes.hidden && !look.hiddenClasses.includes(annotation.classId)).flatMap((annotation) => {
            const linkedId = typeof annotation.attributes.linkedTo === "string" ? annotation.attributes.linkedTo : "";
            const target = linkedId ? editor.annotations.find((row) => row.id === linkedId) : undefined;
            const from = boundsOf(annotation.geometry);
            const to = target ? boundsOf(target.geometry) : null;
            if (!from || !to) return [];
            return [(
              <Line
                key={`link-${annotation.id}`}
                points={[from.x + from.width / 2, from.y + from.height / 2, to.x + to.width / 2, to.y + to.height / 2]}
                stroke="#2dd4bf"
                strokeWidth={1.5 / Math.max(scale, 0.02)}
                listening={false}
              />
            )];
          })}
          {editor.annotations.filter((annotation) => !annotation.attributes.hidden && !look.hiddenClasses.includes(annotation.classId)).map((annotation) => (
            <ShapeView
              key={annotation.id}
              annotation={annotation}
              color={classes.find((row) => row.id === annotation.classId)?.color || "#0a84ff"}
              name={(() => {
                const row = classes.find((item) => item.id === annotation.classId);
                return row ? row.title : annotation.classId;
              })()}
              selected={editor.selected.includes(annotation.id)}
              hot={rawHover === annotation.id}
              scale={scale}
              tool={tool}
              groups={groups}
              drag={drag}
              quiet={runs.some((job) => job.key === annotation.id)}
              locked={Boolean(annotation.attributes.locked) || look.lockedClasses.includes(annotation.classId)}
              line={look.boxLine}
              fill={look.fillOpacity}
              label={look.showLabels}
              className={look.showClassNames}
              labelBg={look.labelBg}
              labelFont={look.labelFont}
              labelColor={look.labelColor}
              handle={look.handleSize}
            />
          ))}
        </Layer>
        <Layer ref={runRef} listening={false} />
        <Layer ref={previewRef} listening={false} />
      </Stage>
      </div>
      {runs.filter((job) => job.status === "run").map((job) => (
        <div
          key={job.key}
          className="run-border"
          data-run-key={job.key}
          aria-hidden
          style={{
            ["--run-color" as string]: look.runColor || look.accent,
            ["--run-width" as string]: `${look.runWidth || 3}px`,
          }}
        >
          <i />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
        <CanvasChrome />
      </div>
      <div ref={badgeRef} data-testid="cursor-badge" hidden className="pointer-events-none absolute start-3 top-3 z-30 rounded border border-line bg-panel px-2 py-1 text-xs shadow-pop" />
      <div ref={loupeBox} data-testid="loupe" className="pointer-events-none absolute z-20 hidden overflow-hidden rounded-md border border-line bg-stage shadow-pop" style={{ width: look.loupeSize, height: look.loupeSize }}>
        <canvas ref={loupeRef} width={look.loupeSize} height={look.loupeSize} className="h-full w-full" />
      </div>
      {runToast ? (
        <div role="status" data-testid="run-toast" className="absolute start-3 top-3 z-30 max-w-sm truncate rounded-md border border-line bg-panel px-3 py-2 text-sm text-danger shadow-pop">
          {runToast}
        </div>
      ) : null}
    </div>
  );
}

function ShapeView({
  annotation,
  color,
  name,
  selected,
  hot,
  scale,
  tool,
  groups,
  drag,
  quiet,
  locked,
  line,
  fill,
  label,
  className,
  labelBg,
  labelFont,
  labelColor,
  handle,
}: {
  annotation: Annotation;
  color: string;
  name: string;
  selected: boolean;
  hot?: boolean;
  scale: number;
  tool: string;
  groups: MutableRefObject<Map<string, Konva.Group>>;
  drag: MutableRefObject<Drag | null>;
  quiet?: boolean;
  locked?: boolean;
  line: number;
  fill: number;
  label: boolean;
  className: boolean;
  labelBg: boolean;
  labelFont: number;
  labelColor: string;
  handle: number;
}) {
  const geometry = annotation.geometry;
  const marked = Boolean(hot);
  const ink = marked && !selected ? "#2dd4bf" : color;
  const stroke = quiet ? 0 : screenStroke(line || 1, selected || marked);
  const review = String(annotation.attributes?.review || "");
  const dashed = review === "pending" || review === "proposed";
  const listening = (tool === "select" || tool === "link") && !locked;
  const box = boundsOf(geometry);
  return (
    <Group
      ref={(node) => {
        if (node) groups.current.set(annotation.id, node);
        else groups.current.delete(annotation.id);
      }}
      onMouseEnter={() => setRawHover(annotation.id)}
      onMouseLeave={() => setRawHover("")}
      onMouseDown={(event) => {
        if (!listening) return;
        event.cancelBubble = true;
        if (tool === "link") {
          const pair = takeLink(annotation.id);
          if (!pair) return;
          const studio = useStudio.getState();
          const stamp = new Date().toISOString();
          studio.commit(studio.editor.annotations.map((row) => {
            if (row.id === pair.from) return { ...row, attributes: { ...row.attributes, linkedTo: pair.to }, updatedAt: stamp };
            if (row.id === pair.to) return { ...row, attributes: { ...row.attributes, relation: pair.from }, updatedAt: stamp };
            return row;
          }), "edit");
          void api("/api/ee/link", { method: "POST", body: JSON.stringify(pair) }).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
          return;
        }
        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (!stage || !pointer) return;
        const view = stage.findOne("Layer");
        const scaleX = view?.scaleX() || 1;
        const x = (pointer.x - (view?.x() || 0)) / scaleX;
        const y = (pointer.y - (view?.y() || 0)) / scaleX;
        const studio = useStudio.getState();
        const ids = event.evt.shiftKey ? Array.from(new Set([...studio.editor.selected, annotation.id])) : [annotation.id];
        studio.select(ids);
        drag.current = { kind: "move", x, y, ids, copy: event.evt.altKey };
      }}
    >
      <GeometryShape geometry={geometry} color={ink} stroke={stroke} fill={quiet ? 0 : fill} dash={dashed ? [...CANVAS.dash] : undefined} />
      {label && box && !quiet ? (
        <>
          {labelBg ? (
            <Rect
              x={box.x}
              y={box.y - (labelFont + 6) / scale}
              width={Math.max(28, (className ? name : String(annotation.classId)).length * labelFont * 0.62) / scale}
              height={(labelFont + 4) / scale}
              fill={color}
              listening={false}
            />
          ) : null}
          <Text
            name="class-label"
            text={className ? name : String(annotation.classId)}
            x={box.x + 2 / scale}
            y={box.y - (labelFont + 4) / scale}
            fill={labelColor || "#000000"}
            fontSize={Math.max(8, labelFont) / scale}
            listening={false}
          />
        </>
      ) : null}
      {listening && selected && geometry.type === "bbox"
        ? handlePoints(geometry).map((point) => (
            <Rect
              key={point.id}
              x={point.x - handle / 2 / scale}
              y={point.y - handle / 2 / scale}
              width={handle / scale}
              height={handle / scale}
              fill={CANVAS.handleFill}
              stroke={CANVAS.handleStroke}
              strokeWidth={CANVAS.handleBorder / scale}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                drag.current = { kind: "bbox-handle", id: annotation.id, handle: point.id, base: { ...geometry } };
              }}
            />
          ))
        : null}
      {listening && selected && (geometry.type === "polygon" || geometry.type === "obb" || geometry.type === "pose")
        ? controlPoints(geometry).map((point, index) => (
            <Rect
              key={index}
              x={point.x - handle / 2 / scale}
              y={point.y - handle / 2 / scale}
              width={handle / scale}
              height={handle / scale}
              fill={geometry.type === "pose" && geometry.keypoints[index]?.visibility === 0 ? "#93a0b4" : "#ffffff"}
              stroke={color}
              strokeWidth={1 / scale}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                if (event.evt.altKey && geometry.type === "polygon" && geometry.points.length > 3) {
                  const points = geometry.points.filter((_, pointIndex) => pointIndex !== index);
                  const studio = useStudio.getState();
                  studio.commit(studio.editor.annotations.map((row) => (row.id === annotation.id ? { ...row, geometry: { type: "polygon", points }, updatedAt: new Date().toISOString() } : row)), "edit");
                  return;
                }
                drag.current = { kind: "point", id: annotation.id, index, geometry: structuredClone(geometry) };
              }}
            />
          ))
        : null}
      {listening && selected && geometry.type === "polygon" && geometry.points.length >= 2
        ? geometry.points.map((point, index) => {
            const next = geometry.points[(index + 1) % geometry.points.length];
            const x = (point.x + next.x) / 2;
            const y = (point.y + next.y) / 2;
            return (
              <Rect
                key={`mid-${index}`}
                x={x - 3 / scale}
                y={y - 3 / scale}
                width={6 / scale}
                height={6 / scale}
                fill={CANVAS.closeColor}
                stroke={CANVAS.handleStroke}
                strokeWidth={1 / scale}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  const points = [...geometry.points];
                  points.splice(index + 1, 0, { x, y });
                  const nextGeometry: Geometry = { type: "polygon", points };
                  const studio = useStudio.getState();
                  studio.commit(studio.editor.annotations.map((row) => (row.id === annotation.id ? { ...row, geometry: nextGeometry, updatedAt: new Date().toISOString() } : row)), "edit");
                  drag.current = { kind: "point", id: annotation.id, index: index + 1, geometry: structuredClone(nextGeometry) };
                }}
              />
            );
          })
        : null}
      {listening && selected && geometry.type === "obb" && box ? (
        <>
          <Line points={[box.x + box.width / 2, box.y, box.x + box.width / 2, box.y - CANVAS.rotateGap / scale]} stroke={CANVAS.handleStroke} strokeWidth={1 / scale} listening={false} />
          <Rect
            x={box.x + box.width / 2 - CANVAS.rotateRadius / scale}
            y={box.y - CANVAS.rotateGap / scale - CANVAS.rotateRadius / scale}
            width={(CANVAS.rotateRadius * 2) / scale}
            height={(CANVAS.rotateRadius * 2) / scale}
            cornerRadius={CANVAS.rotateRadius / scale}
            fill={CANVAS.handleFill}
            stroke={CANVAS.handleStroke}
            strokeWidth={CANVAS.handleBorder / scale}
            onMouseDown={(event) => {
              event.cancelBubble = true;
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              const stage = event.target.getStage();
              const pointer = stage?.getPointerPosition();
              const layer = stage?.findOne("Layer");
              const scaleX = layer?.scaleX() || 1;
              const px = pointer ? (pointer.x - (layer?.x() || 0)) / scaleX : cx;
              const py = pointer ? (pointer.y - (layer?.y() || 0)) / scaleX : box.y - CANVAS.rotateGap / scale;
              drag.current = { kind: "rotate", id: annotation.id, cx, cy, start: Math.atan2(py - cy, px - cx), origin: geometry.corners.map((point) => ({ ...point })), corners: geometry.corners.map((point) => ({ ...point })) };
            }}
          />
        </>
      ) : null}
    </Group>
  );
}

function fillHex(color: string, opacity: number) {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255).toString(16).padStart(2, "0");
  return `${color}${alpha}`;
}

function GeometryShape({ geometry, color, stroke, fill, dash }: { geometry: Geometry; color: string; stroke: number; fill: number; dash?: number[] }) {
  const ink = fillHex(color, fill);
  const common = { stroke: color, strokeWidth: stroke, strokeScaleEnabled: false as const, fill: ink, dash: dash && dash.length ? dash : [] };
  if (geometry.type === "bbox") {
    return <Rect name="shape" x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} {...common} />;
  }
  if (geometry.type === "polygon") {
    return <Line name="shape" closed points={geometry.points.flatMap((point) => [point.x, point.y])} {...common} />;
  }
  if (geometry.type === "obb") {
    return <Line name="shape" closed points={geometry.corners.flatMap((point) => [point.x, point.y])} {...common} />;
  }
  if (geometry.type === "pose") {
    return (
      <>
        {geometry.box ? (
          <Rect x={geometry.box.x} y={geometry.box.y} width={geometry.box.width} height={geometry.box.height} stroke={color} strokeWidth={stroke} strokeScaleEnabled={false} dash={dash || screenDash([4, 3], 1)} />
        ) : null}
        <Line points={geometry.keypoints.flatMap((point) => [point.x, point.y])} stroke={color} strokeWidth={stroke} strokeScaleEnabled={false} dash={dash} />
      </>
    );
  }
  return <Text text="RAW" x={8} y={8} fill="#f5b942" fontSize={14} />;
}

function boxHandles(box: { x: number; y: number; width: number; height: number }): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

function boxCorners(box: { x: number; y: number; width: number; height: number }): [Point, Point, Point, Point] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

function controlPoints(geometry: Geometry): Point[] {
  if (geometry.type === "polygon") return geometry.points;
  if (geometry.type === "obb") return geometry.corners;
  if (geometry.type === "pose") return geometry.keypoints;
  return [];
}

function lineNode(points: Point[], stroke: string, closed: boolean, scale: number, dash?: number[]) {
  return new Konva.Line({
    points: points.flatMap((point) => [point.x, point.y]),
    stroke,
    strokeWidth: screenStroke(1.5, false),
    strokeScaleEnabled: false,
    dash: dash ? screenDash(dash, scale) : undefined,
    closed,
    listening: false,
  });
}

function movePoint(geometry: Geometry, index: number, point: Point): Geometry {
  if (geometry.type === "polygon") {
    const points = geometry.points.map((item, itemIndex) => (itemIndex === index ? point : item));
    return { type: "polygon", points };
  }
  if (geometry.type === "obb") {
    const corners = geometry.corners.map((item, itemIndex) => (itemIndex === index ? point : item)) as [Point, Point, Point, Point];
    return { type: "obb", corners };
  }
  if (geometry.type === "pose") {
    const keypoints = geometry.keypoints.map((item, itemIndex) => (itemIndex === index ? { ...item, ...point } : item));
    return { type: "pose", keypoints, box: poseBox(keypoints) };
  }
  return geometry;
}

function redrawGeometry(group: Konva.Group | undefined, geometry: Geometry, scale: number) {
  if (!group) return;
  const shape = group.findOne(".shape");
  if (!shape) return;
  if (geometry.type === "bbox") shape.setAttrs(geometry);
  if (geometry.type === "polygon") shape.setAttrs({ points: geometry.points.flatMap((point) => [point.x, point.y]) });
  if (geometry.type === "obb") shape.setAttrs({ points: geometry.corners.flatMap((point) => [point.x, point.y]) });
  if (geometry.type === "pose") {
    const line = group.findOne("Line");
    line?.setAttrs({ points: geometry.keypoints.flatMap((point) => [point.x, point.y]) });
  }
  void scale;
}

function activeClassColor() {
  const studio = useStudio.getState();
  return studio.classes.find((row) => row.id === studio.ui.activeClass)?.color || appearance().accent;
}

function squareNode(x: number, y: number, size: number, fill: string) {
  return new Konva.Rect({ x, y, width: size, height: size, fill, listening: false });
}
