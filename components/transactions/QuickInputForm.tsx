'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import { downscaleImage } from '@/lib/image';
import { formatVND, parseAmountInput, toDateInput } from '@/lib/formatters';
import { createTransaction, type CreateTransactionState } from '@/app/(dashboard)/transactions/add/actions';
import type { ApiResult, Category, ParsedReceipt, TransactionType, Wallet } from '@/types';

interface QuickInputFormProps {
  wallets: Wallet[];
  categories: Category[];
}

type AiStatus = 'idle' | 'working' | 'done' | 'error';

const INITIAL: CreateTransactionState = { error: null };

export default function QuickInputForm({ wallets, categories }: QuickInputFormProps) {
  const [state, formAction, submitting] = useActionState(createTransaction, INITIAL);

  const [type, setType] = useState<TransactionType>('expense');
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '');
  const [amountRaw, setAmountRaw] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(toDateInput());
  const [source, setSource] = useState<'manual' | 'ai_receipt'>('manual');

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; description: string } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const amount = parseAmountInput(amountRaw);
  const grouped = useMemo(
    () => ({
      fixed: categories.filter((category) => category.kind === 'fixed'),
      variable: categories.filter((category) => category.kind === 'variable'),
    }),
    [categories],
  );

  async function handleReceipt(file: File) {
    // "Choose File" in the iOS sheet can hand back a PDF or anything else, so
    // reject it here rather than spending a Gemini call to find out.
    if (!file.type.startsWith('image/')) {
      setToast({
        title: 'Ảnh không đúng định dạng',
        description: 'Chỉ nhận ảnh JPG, PNG hoặc HEIC. Chọn lại giúp mình nhé.',
      });
      return;
    }

    setAiStatus('working');
    setAiMessage(null);

    try {
      const blob = await downscaleImage(file);
      const body = new FormData();
      body.append('image', blob, 'receipt.jpg');

      const response = await fetch('/api/ai/parse-receipt', { method: 'POST', body });
      const result = (await response.json()) as ApiResult<ParsedReceipt>;

      if (!result.ok) {
        setAiStatus('error');
        setAiMessage(result.error);
        return;
      }

      applyParsed(result.data);
    } catch {
      setAiStatus('error');
      setAiMessage('Không đọc được ảnh, thử chụp lại hoặc nhập tay.');
    }
  }

  function applyParsed(parsed: ParsedReceipt) {
    // The model reports a null amount when the picture is not a receipt at all,
    // which is worth interrupting for — an inline note under the button is easy
    // to miss after the wait.
    if (parsed.amount === null) {
      setAiStatus('idle');
      setAiMessage(null);
      setToast({
        title: 'Ảnh không đúng định dạng',
        description: 'Không đọc được hoá đơn trong ảnh này. Chọn ảnh hoá đơn rõ nét, hoặc nhập tay.',
      });
      return;
    }

    setAmountRaw(String(parsed.amount));
    // A balance-change alert starting with + is money in, so the direction has
    // to follow what was read rather than assuming every photo is a purchase.
    setType(parsed.type);
    setSource('ai_receipt');
    if (parsed.occurred_at) setOccurredAt(parsed.occurred_at);
    if (parsed.note) setNote(parsed.note);

    const matched = matchCategory(parsed.category_guess, categories);
    if (matched) setCategoryId(matched.id);

    setAiStatus('done');
    setAiMessage(
      parsed.confidence < 0.6
        ? 'AI không chắc lắm — kiểm tra lại số tiền trước khi lưu.'
        : `AI đã điền sẵn khoản ${parsed.type === 'income' ? 'thu' : 'chi'}, xem lại rồi lưu nhé.`,
    );
  }

  if (wallets.length === 0) {
    return (
      <p className="card text-sm text-muted">
        Chưa có ví nào. Chạy <code>supabase/schema.sql</code> trong Supabase SQL Editor trước.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="amount" value={amount ?? ''} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="wallet_id" value={walletId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="source" value={source} />

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1 ring-1 ring-border">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            aria-pressed={type === option}
            className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
              type === option
                ? option === 'expense'
                  ? 'bg-expense text-white'
                  : 'bg-income text-white'
                : 'text-muted'
            }`}
          >
            {option === 'expense' ? 'Chi' : 'Thu'}
          </button>
        ))}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Số tiền</span>
        <input
          name="amount_raw"
          type="text"
          inputMode="decimal"
          autoFocus
          required
          placeholder="35k, 1tr2, 250000"
          value={amountRaw}
          onChange={(event) => setAmountRaw(event.target.value)}
          className="tabular w-full rounded-xl border border-border bg-surface px-4 py-4 text-3xl font-semibold outline-none focus:border-brand"
        />
        <span className="mt-1.5 block text-sm text-muted">
          {amount === null ? 'Gõ 35k hoặc 1tr2 cũng được' : formatVND(amount)}
        </span>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Ví</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              onClick={() => setWalletId(wallet.id)}
              aria-pressed={walletId === wallet.id}
              className={`tap min-h-[44px] shrink-0 rounded-xl border px-4 text-sm font-medium ${
                walletId === wallet.id
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border bg-surface text-muted'
              }`}
            >
              {wallet.type === 'shared' ? '👨‍👩‍👧‍👦 ' : '👤 '}
              {wallet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <span className="block text-sm font-medium text-muted">Danh mục</span>
        {(['variable', 'fixed'] as const).map((kind) =>
          grouped[kind].length === 0 ? null : (
            <div key={kind}>
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted">
                {kind === 'fixed' ? 'Cố định' : 'Biến đổi'}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {grouped[kind].map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(category.id === categoryId ? '' : category.id)}
                    aria-pressed={categoryId === category.id}
                    className={`tap flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border text-xs ${
                      categoryId === category.id
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-border bg-surface text-muted'
                    }`}
                  >
                    <span aria-hidden className="text-xl leading-none">
                      {category.icon}
                    </span>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <Input
        label="Ghi chú"
        name="note"
        type="text"
        maxLength={140}
        placeholder="Cơm trưa, xăng xe…"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <Input
        label="Ngày"
        name="occurred_at"
        type="date"
        required
        value={occurredAt}
        onChange={(event) => setOccurredAt(event.target.value)}
      />

      <div className="card space-y-3">
        <div>
          <p className="text-sm font-medium">Chụp hoá đơn</p>
          <p className="text-xs text-muted">AI đọc số tiền, nội dung và ngày giúp bạn.</p>
        </div>

        {/* Two inputs rather than one: `capture` opens the camera directly, and
            iOS drops the photo-library option from the sheet whenever it is set,
            so an album pick needs an input without it. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleReceipt(file);
            event.target.value = '';
          }}
        />
        <input
          ref={albumRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleReceipt(file);
            event.target.value = '';
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={aiStatus === 'working'}
            onClick={() => cameraRef.current?.click()}
          >
            📷 Chụp mới
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={aiStatus === 'working'}
            onClick={() => albumRef.current?.click()}
          >
            🖼️ Chọn từ album
          </Button>
        </div>

        {aiStatus === 'working' && (
          <p role="status" className="text-center text-xs text-muted">
            Đang đọc hoá đơn…
          </p>
        )}

        {aiMessage && (
          <p
            role="status"
            className={`text-xs ${aiStatus === 'error' ? 'text-expense' : 'text-muted'}`}
          >
            {aiMessage}
          </p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}

      <Button type="submit" full disabled={submitting || amount === null}>
        {submitting ? 'Đang lưu…' : 'Lưu giao dịch'}
      </Button>

      {toast && (
        <Toast title={toast.title} description={toast.description} onClose={() => setToast(null)} />
      )}
    </form>
  );
}

/** Gemini answers with unaccented labels ("An uong"), the DB stores "Ăn uống". */
function matchCategory(guess: string | null, categories: Category[]): Category | undefined {
  if (!guess) return undefined;
  const target = normalize(guess);
  return categories.find((category) => normalize(category.name) === target);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}
