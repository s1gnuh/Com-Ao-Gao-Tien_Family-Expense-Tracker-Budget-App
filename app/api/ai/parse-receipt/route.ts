import { NextResponse } from 'next/server';
import { GeminiError, parseReceiptImage } from '@/lib/gemini';
import { getSessionUser } from '@/lib/supabase/server';
import type { ApiResult, ParsedReceipt } from '@/types';

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
  try {
    const form = await request.formData();
    const value = form.get('image');
    if (value instanceof File) file = value;
  } catch {
    return fail('Không đọc được dữ liệu gửi lên.', 400);
  }

  if (!file) return fail('Thiếu ảnh hoá đơn.', 400);
  if (file.size === 0) return fail('Ảnh rỗng.', 400);
  if (file.size > MAX_BYTES) return fail('Ảnh quá lớn, tối đa 4MB.', 413);
  if (!ALLOWED_TYPES.includes(file.type)) return fail('Định dạng ảnh không được hỗ trợ.', 415);

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const parsed = await parseReceiptImage(base64, file.type);
    return NextResponse.json<ApiResult<ParsedReceipt>>({ ok: true, data: parsed });
  } catch (error) {
    if (error instanceof GeminiError) return fail(error.message, error.status);
    return fail('Không bóc tách được hoá đơn, vui lòng nhập tay.', 500);
  }
}
