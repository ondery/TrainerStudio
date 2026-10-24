type MonacoApi = typeof import("monaco-editor/esm/vs/editor/editor.api");

let pending: Promise<MonacoApi> | null = null;

export function loadMonaco() {
  if (!pending) {
    pending = (async () => {
      const host = globalThis as { MonacoEnvironment?: { getWorker: () => Worker } };
      host.MonacoEnvironment = {
        getWorker() {
          const url = URL.createObjectURL(new Blob(["self.onmessage=function(){}"], { type: "text/javascript" }));
          return new Worker(url);
        },
      };
      const monaco = await import("monaco-editor/esm/vs/editor/editor.api");
      await import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution");
      const known = new Set(monaco.languages.getLanguages().map((item) => item.id));
      if (!known.has("yolo")) {
        monaco.languages.register({ id: "yolo", extensions: [".txt"] });
        monaco.languages.setMonarchTokensProvider("yolo", {
          tokenizer: {
            root: [
              [/#.*/, "comment"],
              [/-?\d+(?:\.\d+)?/, "number"],
              [/\s+/, "white"],
            ],
          },
        });
      }
      if (!known.has("json")) {
        monaco.languages.register({ id: "json", extensions: [".json"] });
        monaco.languages.setMonarchTokensProvider("json", {
          tokenizer: {
            root: [
              [/"([^"\\]|\\.)*"/, "string"],
              [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
              [/\b(?:true|false|null)\b/, "keyword"],
              [/[{}\[\],:]/, "delimiter"],
              [/\s+/, "white"],
            ],
          },
        });
      }
      return monaco;
    })();
  }
  return pending;
}

export function rawLanguage(tab: "label" | "json" | "yaml" | "info") {
  if (tab === "json") return "json";
  if (tab === "yaml") return "yaml";
  if (tab === "label") return "yolo";
  return "plaintext";
}
