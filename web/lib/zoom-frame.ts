export type OpenZoom = "fit" | "fill" | "100" | "keep" | "size";

export type KeptZoom = { scale: number; panX: number; panY: number; w?: number; h?: number };

export function stickyOpen(mode: OpenZoom) {
  return mode === "keep" || mode === "size";
}

export function parseOpenZoom(id: string): OpenZoom {
  if (id === "fill" || id === "100" || id === "keep" || id === "size") return id;
  return "fit";
}

export function openFrame(
  mode: OpenZoom,
  stage: { w: number; h: number },
  image: { w: number; h: number },
  kept: KeptZoom | null,
) {
  const iw = Math.max(1, image.w);
  const ih = Math.max(1, image.h);
  const fit = Math.min(stage.w / iw, stage.h / ih) * 0.94 || 1;
  const fill = Math.max(stage.w / iw, stage.h / ih) || 1;
  if (stickyOpen(mode) && kept && kept.scale > 0) {
    const prevW = Math.max(1, kept.w || 0) * kept.scale;
    const prevH = Math.max(1, kept.h || 0) * kept.scale;
    const scale =
      mode === "size" && kept.w && kept.h
        ? Math.min(prevW / iw, prevH / ih) || kept.scale
        : kept.scale;
    return {
      scale,
      x: (stage.w - iw * scale) / 2,
      y: (stage.h - ih * scale) / 2,
      fit,
    };
  }
  const scale = mode === "100" ? 1 : mode === "fill" ? fill : fit;
  return {
    scale,
    x: (stage.w - iw * scale) / 2,
    y: (stage.h - ih * scale) / 2,
    fit,
  };
}
