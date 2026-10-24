"use client";

import { useEffect, useRef } from "react";
import "monaco-editor/min/vs/editor/editor.main.css";
import { loadMonaco } from "@/lib/monaco-boot";

type Editor = {
  dispose: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
  revealLineInCenter: (line: number) => void;
  updateOptions: (options: { readOnly?: boolean; domReadOnly?: boolean }) => void;
  onMouseMove: (listener: (event: { target: { position?: { lineNumber?: number } | null } }) => void) => { dispose: () => void };
  onMouseDown: (listener: (event: { target: { position?: { lineNumber?: number } | null } }) => void) => { dispose: () => void };
  onMouseLeave: (listener: () => void) => { dispose: () => void };
  onDidChangeModelContent: (listener: () => void) => { dispose: () => void };
};

export function MonacoView({
  value,
  language,
  readOnly,
  path,
  revealLine,
  onLine,
  onPick,
  onChange,
}: {
  value: string;
  language: string;
  readOnly: boolean;
  path: string;
  revealLine?: number;
  onLine: (line: number) => void;
  onPick: (line: number) => void;
  onChange?: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onLineRef = useRef(onLine);
  const onPickRef = useRef(onPick);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const valueRef = useRef(value);
  onLineRef.current = onLine;
  onPickRef.current = onPick;
  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;
  valueRef.current = value;

  useEffect(() => {
    const node = host.current;
    if (!node) return undefined;
    let dead = false;
    let editor: Editor | null = null;
    void loadMonaco().then((monaco) => {
      if (dead || !host.current) return;
      const created = monaco.editor.create(host.current, {
        value: valueRef.current,
        language,
        theme: "vs-dark",
        readOnly,
        domReadOnly: readOnly,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        fontSize: 12,
        wordWrap: "off",
        lineNumbers: "on",
        renderLineHighlight: "line",
        overviewRulerLanes: 0,
        folding: false,
        contextmenu: false,
      }) as unknown as Editor;
      editor = created;
      editorRef.current = created;
      created.onMouseMove((event) => {
        const line = event.target.position?.lineNumber || 0;
        if (line) onLineRef.current(line);
      });
      created.onMouseLeave(() => onLineRef.current(0));
      created.onMouseDown((event) => {
        const line = event.target.position?.lineNumber || 0;
        if (line) onPickRef.current(line);
      });
      created.onDidChangeModelContent(() => {
        if (readOnlyRef.current || !onChangeRef.current || !editor) return;
        onChangeRef.current(editor.getValue());
      });
      if (revealLine) created.revealLineInCenter(revealLine);
    });
    return () => {
      dead = true;
      editor?.dispose();
      editorRef.current = null;
    };
    // The model is recreated when the file changes. Keystrokes stay inside the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, language]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly, domReadOnly: readOnly });
  }, [readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !readOnly) return;
    if (editor.getValue() !== value) editor.setValue(value);
  }, [readOnly, value]);

  useEffect(() => {
    if (revealLine) editorRef.current?.revealLineInCenter(revealLine);
  }, [revealLine]);

  return <div ref={host} data-testid="raw-monaco" data-language={language} data-monaco-edit={readOnly ? "0" : "1"} className="min-h-0 flex-1" />;
}
