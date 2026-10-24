export type Point = { x: number; y: number };

export type Geometry =
  | { type: "bbox"; x: number; y: number; width: number; height: number }
  | { type: "polygon"; points: Point[] }
  | { type: "obb"; corners: [Point, Point, Point, Point] }
  | { type: "pose"; keypoints: Array<{ x: number; y: number; visibility: 0 | 1 | 2 }>; box?: { x: number; y: number; width: number; height: number } }
  | { type: "raw"; line: string };

export type Annotation = {
  id: string;
  imageId: string;
  classId: string;
  geometry: Geometry;
  attributes: Record<string, string | number | boolean | string[]>;
  createdAt: string;
  updatedAt: string;
};

export type ClassRow = {
  id: string;
  index: number;
  title: string;
  titleEn: string;
  detail: string;
  color: string;
  icon: { kind: string; name?: string; src?: string };
  visible: boolean;
  count?: number;
  hotkey?: string;
  parent?: string;
  attrs?: string;
};

export type ImageRow = {
  id: string;
  name: string;
  relPath?: string;
  width: number;
  height: number;
  status: "unlabeled" | "labeled" | "review" | string;
  split: string;
  annCount: number;
  sortIndex: number;
  classIds?: string[];
};

export type FieldOption = { id: string; label: string; labelEn?: string; abbr?: string; shortcut?: string; icon?: { kind: string; name?: string } };

export type Field = {
  id: string;
  scope: "annotation" | "image" | "class";
  type: string;
  label: string;
  labelEn?: string;
  appliesTo?: string[];
  options?: FieldOption[];
  icon?: { kind: string; name?: string };
  visibleWhen?: { field: string; op: string; value?: string | number | boolean };
};

export type Project = {
  id: string;
  name: string;
  root: string;
  task: string;
  imageCount: number;
  labelLock: { ok: boolean; message?: string; code?: string; params?: Record<string, string>; missing?: string[]; extra?: string[] };
};

export type Tool = "select" | "bbox" | "polygon" | "pose" | "obb" | "sam" | "pan" | "link";
