import { eerrDownloadFile, EerrApiError } from "./api";

export type ExportFormat = "pdf" | "xlsx";

function headerFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  if (encoded) {
    const value = (encoded[1] ?? encoded[2] ?? "").trim();
    const utf8 = /^UTF-8''(.+)$/i.exec(value);
    if (utf8) {
      try { return decodeURIComponent(utf8[1]!); } catch { /* probar filename normal */ }
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/i.exec(disposition);
  return plain ? (plain[1] ?? plain[2] ?? "").replace(/\\([\\"])/g, "$1").trim() : null;
}

export function exportFilenameFromHeader(
  disposition: string | null,
  format: ExportFormat,
): string {
  const proposed = headerFilename(disposition);
  if (!proposed) return `EERR.${format}`;
  const clean = proposed
    .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
    .replace(/^[._ -]+|[._ -]+$/g, "")
    .replace(/\.[^.]+$/, "")
    .slice(0, 100)
    .replace(/[._ -]+$/g, "");
  return `${clean || "EERR"}.${format}`;
}

export function exportErrorMessage(error: unknown, format: ExportFormat): string {
  if (error instanceof EerrApiError) {
    if (error.status === 422 && error.code === "EXPORT_PRECISION_LIMIT" && format === "xlsx")
      return "No se pudo exportar a Excel porque uno de los valores supera la precisión numérica admitida por el formato. Podés utilizar la exportación PDF para conservar el valor exacto.";
    if (error.status === 404) return "Este EERR ya no está disponible. Volvé al listado de períodos.";
    if (error.status === 401) return "Tu sesión venció. Volvé a ingresar para exportar.";
    if (error.status === 403) return "No tenés permiso para exportar este EERR.";
    if (error.status === 0) return "No pudimos conectarnos con el servidor. Intentá nuevamente.";
  }
  return `No se pudo exportar el EERR a ${format === "pdf" ? "PDF" : "Excel"}. Intentá nuevamente.`;
}

export async function downloadEerrExport(id: string, format: ExportFormat): Promise<void> {
  const { blob, contentDisposition } = await eerrDownloadFile(`/eerr/${id}/export/${format}`);
  const filename = exportFilenameFromHeader(contentDisposition, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Dejar tiempo para que el navegador tome el Blob antes de liberarlo.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
