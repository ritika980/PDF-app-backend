function parseRanges(rangesText, totalPages) {
  if (!rangesText || !rangesText.trim()) {
    return [];
  }

  const pages = new Set();
  const parts = rangesText.split(',').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1 || page > totalPages) {
        throw new Error(`Page ${page} is out of range (1-${totalPages}).`);
      }
      pages.add(page - 1);
      continue;
    }

    const match = part.match(/^(\d+)-(\d+)$/);
    if (!match) {
      throw new Error(`Invalid range format: ${part}`);
    }

    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start > end) {
      throw new Error(`Invalid range ${part}. Start must be <= end.`);
    }
    if (start < 1 || end > totalPages) {
      throw new Error(`Range ${part} is out of bounds (1-${totalPages}).`);
    }

    for (let p = start; p <= end; p += 1) {
      pages.add(p - 1);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

module.exports = {
  parseRanges,
};
