import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";
// Transform only local UI source. Real React rendering; CSS has no behavior in SSR.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/link") return next("next/link.js", context);
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".tsx", ".ts"])
        if (existsSync(new URL(url.href + suffix)))
          return { url: url.href + suffix, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".module.css"))
      return {
        format: "module",
        source:
          "export default new Proxy({}, { get: (_, key) => String(key) });",
        shortCircuit: true,
      };
    if (/\.tsx?$/.test(url) && !url.includes("node_modules"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
