/** Rename only the designation that was generated for canvas cable sections. */
export function normalizeSectionName(name: string): string {
  return name.replace(/^cable(\d+)$/, "section$1");
}
