export function normalizeResultItems(items = []) {
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const label = String(item.label || item.title || "").trim();
      const detail = String(item.prompt || item.evidence || item.description || "").trim();
      if (label && detail) return label + "：" + detail;
      return label || detail;
    })
    .filter(Boolean);
}
