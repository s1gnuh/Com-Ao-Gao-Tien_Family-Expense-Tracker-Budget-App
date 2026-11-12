import { NextResponse } from 'next/server';
import { GeminiError, parseReceiptImage } from '@/lib/gemini';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { RECEIPT_BUCKET, receiptObjectPath } from '@/lib/receipts';
import type { ApiResult, ParsedReceipt } from '@/types';

const SHA256_HEX = /^[0-9a-f]{64}$/;

// Vercel's serverless request body cap is 4.5MB, so reject above that ourselves
// to give a readable error instead of a platform-level 413.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const runtime = 'nodejs';
export const maxDuration = 30;

function fail(error: string, status: number) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  // Gated on a real session so the free-tier Gemini quota can't be drained.
  const user = await getSessionUser();
  if (!user) return fail('Chưa đăng nhập.', 401);

  let file: File | null = null;
  let hash = '';
  try {
    const form = await request.formData();
    const value = form.get('image');
    if (value instanceof File) file = value;
    hash = String(form.get('hash') ?? '');
  } catch {
    return fail('Không đọc được dữ liệu gửi lên.', 400);
  }

  if (!file) return fail('Thiếu ảnh hoá đơn.', 400);
  if (file.size === 0) return fail('Ảnh rỗng.', 400);
  if (file.size > MAX_BYTES) return fail('Ảnh quá lớn, tối đa 4MB.', 413);
  if (!ALLOWED_TYPES.includes(file.type)) return fail('Định dạng ảnh không được hỗ trợ.', 415);

  const supabase = await createClient();

  // Checked before Gemini, not after: a bill already entered costs no tokens.
  if (SHA256_HEX.test(hash)) {
    const { data: seen } = await supabase
      .from('transactions')
      .select('amount,occurred_at,note')
      .eq('receipt_hash', hash)
      .limit(1)
      .maybeSingle();

    if (seen) {
      return NextResponse.json<ApiResult<never> & { duplicate: true; seen: typeof seen }>(
        {
          ok: false,
          error: 'Ảnh này đã được tải lên rồi.',
          duplicate: true,
          seen,
        },
        { status: 409 },
      );
    }
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // The photo is filed while Gemini reads it rather than after, so keeping it
    // costs no extra wait. Only a JPEG with a real hash is kept: that is what the
    // app's own downscaler sends, and the hash is what names the file.
    const keep = SHA256_HEX.test(hash) && file.type === 'image/jpeg';
    const path = keep ? receiptObjectPath(user.id, hash) : null;

    const storing = path ? storeReceipt(supabase, path, bytes) : Promise.resolve(false);

    let parsed: ParsedReceipt;
    try {
      parsed = await parseReceiptImage(bytes.toString('base64'), file.type);
    } catch (error) {
      // Gemini failed: no row will reference the photo, so do not keep it.
      if (await storing) await supabase.storage.from(RECEIPT_BUCKET).remove([path!]);
      throw error;
    }

    const stored = await storing;
    await countCall(supabase);

    // Not a receipt after all: nothing will ever point at the file, so it goes.
    if (stored && parsed.amount === null) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([path!]);
    }

    return NextResponse.json<ApiResult<ParsedReceipt>>({
      ok: true,
      data: { ...parsed, receipt_path: stored && parsed.amount !== null ? path : null },
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      // A 429 was turned away before it cost a request; anything else reached
      // the model, so it is spent whether or not we could read the answer.
      if (error.status !== 429) await countCall(supabase);
      return fail(error.message, error.status);
    }
    return fail('Không bóc tách được hoá đơn, vui lòng nhập tay.', 500);
  }
}

/**
 * Best effort: the tally is a convenience, so a project that has not run the
 * latest schema.sql yet still parses receipts rather than erroring on a
 * function that is not there.
 */
async function countCall(supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase.rpc('bump_ai_usage');
}

/**
 * Best effort, like the tally above: a project without the `receipts` bucket
 * yet, or a full free-tier quota, still gets its receipt read — the row is
 * simply saved without a photo attached.
 */
async function storeReceipt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
  bytes: Buffer,
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    return !error;
  } catch {
    return false;
  }
}
