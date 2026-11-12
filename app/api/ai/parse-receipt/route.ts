import { after, NextResponse } from 'next/server';
import { GeminiError, parseReceiptImage } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
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
  // Parsed first: it is local work, and a bad upload should not cost a single
  // round trip to find out.
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
  const hashed = SHA256_HEX.test(hash);

  // Identity and the duplicate check at the same time rather than one after
  // the other. getClaims() verifies the token right here when the project signs
  // with asymmetric keys, and only falls back to asking the auth server
  // (what getUser() always did, 300-400ms) when it cannot. The duplicate query
  // carries the same token, so an unauthenticated caller simply sees no rows.
  const [claimsResult, seenResult] = await Promise.all([
    supabase.auth.getClaims(),
    hashed
      ? supabase
          .from('transactions')
          .select('amount,occurred_at,note')
          .eq('receipt_hash', hash)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Gated on a real session so the free-tier Gemini quota can't be drained.
  const userId = claimsResult.data?.claims?.sub;
  if (!userId) return fail('Chưa đăng nhập.', 401);

  // Checked before Gemini, not after: a bill already entered costs no tokens.
  const seen = seenResult.data;
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

  const bytes = Buffer.from(await file.arrayBuffer());
  // The photo is filed while Gemini reads it rather than after, so keeping it
  // costs no extra wait. Only a JPEG with a real hash is kept: that is what the
  // app's own downscaler sends, and the hash is what names the file.
  const path = hashed && file.type === 'image/jpeg' ? receiptObjectPath(userId, hash) : null;
  const storing = path ? storeReceipt(supabase, path, bytes) : Promise.resolve(false);

  try {
    const parsed = await parseReceiptImage(bytes.toString('base64'), file.type);
    const stored = await storing;
    const keep = stored && parsed.amount !== null;

    // Bookkeeping the person is not waiting on runs after the answer is sent:
    // the tally, and dropping the photo if it turned out not to be a receipt.
    after(async () => {
      await countCall(supabase);
      if (stored && !keep) await supabase.storage.from(RECEIPT_BUCKET).remove([path!]);
    });

    return NextResponse.json<ApiResult<ParsedReceipt>>({
      ok: true,
      data: { ...parsed, receipt_path: keep ? path : null },
    });
  } catch (error) {
    after(async () => {
      // A 429 was turned away before it cost a request; anything else reached
      // the model, so it is spent whether or not we could read the answer.
      if (!(error instanceof GeminiError && error.status === 429)) await countCall(supabase);
      // Gemini failed: no row will reference the photo, so do not keep it.
      if (await storing) await supabase.storage.from(RECEIPT_BUCKET).remove([path!]);
    });

    if (error instanceof GeminiError) return fail(error.message, error.status);
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
