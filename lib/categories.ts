import type { Category } from '@/types';

/** Folds "Ăn uống" and "An uong" to the same key: Gemini answers unaccented. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

export function matchCategory(guess: string | null, categories: Category[]): Category | undefined {
  if (!guess) return undefined;
  const target = normalizeLabel(guess);
  return categories.find((category) => normalizeLabel(category.name) === target);
}

/** The seeded "Thu nhập" category, where money in lands unless told otherwise. */
export function findIncomeCategory(categories: Category[]): Category | undefined {
  return categories.find((category) => normalizeLabel(category.name) === 'thu nhap');
}
