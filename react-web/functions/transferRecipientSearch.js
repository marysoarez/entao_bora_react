export function normalizeSearchText(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

export function searchGrams(name, email) {
  const grams = new Set();
  for (const value of [name, email]) {
    const text = normalizeSearchText(value).slice(0, 320);
    for (const size of [2, 3]) {
      for (let index = 0; index <= text.length - size; index += 1) {
        grams.add(text.slice(index, index + size));
      }
    }
  }
  return [...grams];
}
