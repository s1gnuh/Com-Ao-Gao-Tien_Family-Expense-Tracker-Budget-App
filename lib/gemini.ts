import type { ParsedReceipt } from '@/types';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Bóc tách một giao dịch tiền từ ảnh. Ảnh có thể là hoá đơn mua hàng HOẶC thông báo biến động số dư ngân hàng.

- amount: số tiền, VND, số nguyên dương, bỏ mọi dấu phân cách.
  · Hoá đơn: lấy TỔNG CỘNG cuối cùng, bỏ qua tạm tính.
  · Biến động số dư: lấy số tiền ngay sau dấu + hoặc -.
- type: "income" nếu tiền VÀO (dấu +, "ghi có", "nhận tiền", "CT đến").
  "expense" nếu tiền RA (dấu -, "ghi nợ", "thanh toán") và với MỌI hoá đơn mua hàng.
- occurred_at: ngày giao dịch, định dạng YYYY-MM-DD. Ngày viết kiểu DD/MM/YY thuộc thế kỷ 21: 14/10/26 nghĩa là 2026-10-14. Không đọc được thì null.
- note: mô tả ngắn dưới 60 ký tự, tiếng Việt. Ưu tiên tên cửa hàng hoặc nội dung chuyển khoản.
- category_guess: ĐÚNG MỘT trong: An uong, Di chuyen, Cho bup, Nha cua, Hoa don, Suc khoe, Giao duc, Giai tri, Mua sam, Khac.
- confidence: 0 đến 1, mức chắc chắn về amount.

Ảnh không chứa giao dịch tiền: amount null, confidence 0.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: 'integer', nullable: true },
    type: { type: 'string', enum: ['income', 'expense'] },
    note: { type: 'string', nullable: true },
    category_guess: { type: 'string', nullable: true },
    occurred_at: { type: 'string', nullable: true },
    confidence: { type: 'number' },
  },
  required: ['amount', 'type', 'note', 'category_guess', 'occurred_at', 'confidence'],
} as const;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export async function parseReceiptImage(base64Image: string, mimeType: string): Promise<ParsedReceipt> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY chưa được cấu hình.', 500);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Image } },
              { text: 'Bóc tách hoá đơn này.' },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      // Gemini occasionally hangs instead of erroring; fail well before
      // Vercel's function timeout so the UI gets a readable message.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GeminiError('Gemini phản hồi quá lâu, vui lòng thử lại hoặc nhập tay.', 504);
  }

  if (!response.ok) {
    // 429 means the free-tier quota is spent; the UI falls back to manual entry.
    // 503 means the model is overloaded — same fallback, different reason.
    throw new GeminiError(
      response.status === 429
        ? 'Đã hết lượt AI miễn phí, vui lòng nhập tay.'
        : response.status === 503
          ? 'Gemini đang quá tải, vui lòng thử lại hoặc nhập tay.'
          : 'Gemini từ chối yêu cầu.',
      response.status === 429 ? 429 : 502,
    );
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError('Gemini không trả về dữ liệu.', 502);

  return normalize(JSON.parse(text) as Record<string, unknown>);
}

function normalize(raw: Record<string, unknown>): ParsedReceipt {
  const amount = typeof raw.amount === 'number' && raw.amount > 0 ? Math.round(raw.amount) : null;
  const occurredAt = typeof raw.occurred_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.occurred_at)
    ? raw.occurred_at
    : null;

  return {
    amount,
    // Anything but an explicit "income" is money going out — the common case,
    // and the safer default if the model hedges.
    type: raw.type === 'income' ? 'income' : 'expense',
    note: trimOrNull(raw.note, 60),
    category_guess: trimOrNull(raw.category_guess, 40),
    occurred_at: occurredAt,
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0,
  };
}

function trimOrNull(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}
