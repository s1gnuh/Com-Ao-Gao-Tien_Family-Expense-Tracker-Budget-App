import type { TransactionType } from '@/types';

/**
 * One Gemini call per image, so a batch has to stay small: five keeps the free
 * tier comfortable and keeps the phone from decoding more photos at once than
 * iOS Safari will give a canvas memory for.
 */
export const MAX_RECEIPT_BATCH = 5;

/** A reviewed draft on its way into the batch insert. */
export interface ReceiptRow {
  wallet_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  note: string | null;
  occurred_at: string;
  receipt_hash: string | null;
}
