'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Toast, { type ToastTone } from '@/components/ui/Toast';
import BatchReviewDeck, { type ReceiptDraft } from '@/components/transactions/BatchReviewDeck';
import { downscaleImage, hashImage } from '@/lib/image';
import { MAX_RECEIPT_BATCH } from '@/lib/receipts';
import { formatDate, formatVND, parseAmountInput, todayInput } from '@/lib/formatters';
import { defaultWalletId, walletsForType } from '@/lib/wallets';
import { createTransaction, type CreateTransactionState } from '@/app/(dashboard)/transactions/add/actions';
import { updateTransaction } from '@/app/(dashboard)/transactions/[id]/actions';
import type { ApiResult, Category, ParsedReceipt, TransactionType, Wallet } from '@/types';

export interface EditableTransaction {
  id: string;
  wallet_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  note: string | null;
  occurred_at: string;
}

interface QuickInputFormProps {
  wallets: Wallet[];
  categories: Category[];
  /** Whose personal wallet income should land in by default. */
  currentUserId: string | null;
  /** Present means editing that row rather than creating a new one. */
  initial?: EditableTransaction;
  /** Rendered under the save button; the edit screen passes its delete control. */
  footer?: React.ReactNode;
}

type AiStatus = 'idle' | 'working' | 'done' | 'error';

type ParseResponse =
  | { ok: true; data: ParsedReceipt }
  | {
      ok: false;
      error: string;
      duplicate?: boolean;
      seen?: { amount: number; occurred_at: string; note: string | null } | null;
    };

const INITIAL: CreateTransactionState = { error: null };

export default function QuickInputForm({
  wallets,
  categories,
  currentUserId,
  initial,
  footer,
}: QuickInputFormProps) {
  const editing = initial !== undefined;
  const [state, formAction, submitting] = useActionState(
    editing ? updateTransaction : createTransaction,
    INITIAL,
  );

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [walletId, setWalletId] = useState(
    initial?.wallet_id ?? defaultWalletId(wallets, initial?.type ?? 'expense', currentUserId),
  );
  const [amountRaw, setAmountRaw] = useState(initial ? String(Math.round(initial.amount)) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [occurredAt, setOccurredAt] = useState(initial?.occurred_at ?? todayInput());
  const [source, setSource] = useState<'manual' | 'ai_receipt'>('manual');
  const [receiptHash, setReceiptHash] = useState('');

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  /** Non-null once several images are read and waiting to be swiped through. */
  const [batch, setBatch] = useState<{ drafts: ReceiptDraft[]; skipped: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    description: string;
    note?: string;
    tone?: ToastTone;
  } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const amount = parseAmountInput(amountRaw);
  const visibleWallets = useMemo(() => walletsForType(wallets, type), [wallets, type]);

  /**
   * Picking "Thu" while the family fund is selected would leave the form on a
   * wallet the list no longer offers and the database refuses, so the wallet
   * moves along with the choice.
   */
  function chooseType(next: TransactionType) {
    setType(next);
    if (!walletsForType(wallets, next).some((wallet) => wallet.id === walletId)) {
      setWalletId(defaultWalletId(wallets, next, currentUserId));
    }
  }

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
      const digest = await hashImage(file);
      const blob = await downscaleImage(file);
      const body = new FormData();
      body.append('image', blob, 'receipt.jpg');
      body.append('hash', digest);

      const response = await fetch('/api/ai/parse-receipt', { method: 'POST', body });
      const result = (await response.json()) as ParseResponse;

      if (!result.ok) {
        setAiStatus('idle');
        if (result.duplicate) {
          const when = result.seen?.occurred_at ? formatDate(result.seen.occurred_at) : null;
          const much = result.seen ? formatVND(Number(result.seen.amount)) : null;
          setToast({
            title: 'Ảnh đã tải lên rồi',
            description:
              when && much
                ? `Đã ghi ${much} ngày ${when}${result.seen?.note ? ` — ${result.seen.note}` : ''}.`
                : 'Hoá đơn này đã có trong sổ.',
          });
          return;
        }
        setAiStatus('error');
        setAiMessage(result.error);
        return;
      }

      setReceiptHash(digest);
      applyParsed(result.data);
    } catch {
      setAiStatus('error');
      setAiMessage('Không đọc được ảnh, thử chụp lại hoặc nhập tay.');
    }
  }

  /**
   * Several photos in one go. Each image is its own request, so one unreadable
   * picture cannot spoil the rest of the batch and the duplicate check still
   * runs per image before any Gemini tokens are spent.
   */
  async function handleReceipts(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));

    if (images.length === 0) {
      setToast({
        title: 'Ảnh không đúng định dạng',
        description: 'Chỉ nhận ảnh JPG, PNG hoặc HEIC. Chọn lại giúp mình nhé.',
      });
      return;
    }
    if (images.length === 1) {
      void handleReceipt(images[0]!);
      return;
    }

    const picked = images.slice(0, MAX_RECEIPT_BATCH);

    setAiStatus('working');
    setAiMessage(null);
    setProgress({ done: 0, total: picked.length });

    try {
      // Decoded one at a time: five full-size iPhone photos on a canvas at once
      // is more memory than iOS Safari reliably hands out.
      const prepared: { hash: string; blob: Blob }[] = [];
      for (const file of picked) {
        const hash = await hashImage(file);
        // The same photo picked twice would pass the server check, which only
        // knows about bills already saved.
        if (prepared.some((item) => item.hash === hash)) continue;
        prepared.push({ hash, blob: await downscaleImage(file) });
      }

      const results = await Promise.all(
        prepared.map(async (item) => {
          const body = new FormData();
          body.append('image', item.blob, 'receipt.jpg');
          body.append('hash', item.hash);

          try {
            const response = await fetch('/api/ai/parse-receipt', { method: 'POST', body });
            return { item, parsed: (await response.json()) as ParseResponse };
          } catch {
            return { item, parsed: { ok: false, error: 'Không gọi được máy chủ.' } as ParseResponse };
          } finally {
            setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
          }
        }),
      );

      const drafts: ReceiptDraft[] = [];
      // Counted apart from the ones dropped for being over the cap, which the
      // message below explains on its own — together they would read as double.
      let unusable = picked.length - prepared.length;
      // Rate limits and the daily quota turn away the whole batch, not one bad
      // photo, so that reason is worth repeating instead of "could not read it".
      let reason: string | null = null;

      for (const { item, parsed } of results) {
        if (!parsed.ok) {
          unusable += 1;
          if (!parsed.duplicate && !reason) reason = parsed.error;
          continue;
        }
        if (parsed.data.amount === null) {
          unusable += 1;
          continue;
        }

        const matched = matchCategory(parsed.data.category_guess, categories);
        drafts.push({
          id: item.hash,
          hash: item.hash,
          blob: item.blob,
          amount: parsed.data.amount,
          type: parsed.data.type,
          note: parsed.data.note ?? '',
          categoryId: matched?.id ?? '',
          occurredAt: parsed.data.occurred_at ?? todayInput(),
          // A batch can hold both directions at once — a bank alert read as
          // money in cannot carry the family fund the rest of them default to.
          walletId:
            parsed.data.type === 'income'
              ? defaultWalletId(wallets, 'income', currentUserId)
              : walletId,
          confidence: parsed.data.confidence,
        });
      }

      setProgress(null);
      setAiStatus('idle');

      if (drafts.length === 0) {
        setToast({
          title: 'Không đọc được ảnh nào',
          description:
            reason ??
            'Có thể các ảnh đã nhập rồi, hoặc không phải hoá đơn. Thử ảnh khác hoặc nhập tay nhé.',
        });
        return;
      }

      const cappedOut = images.length - picked.length;

      if (cappedOut > 0 || unusable > 0) {
        setToast({
          tone: 'info',
          title: `Đọc được ${drafts.length} hoá đơn`,
          description: [
            cappedOut > 0
              ? `Mỗi lượt chỉ đọc ${MAX_RECEIPT_BATCH} ảnh, nên ${cappedOut} ảnh cuối đã bị bỏ qua.`
              : '',
            unusable > 0
              ? (reason ?? `${unusable} ảnh không đọc được hoặc đã nhập rồi.`)
              : '',
          ]
            .filter(Boolean)
            .join(' '),
          note: 'Vuốt phải để duyệt, vuốt trái để sửa.',
        });
      }

      setBatch({ drafts, skipped: cappedOut + unusable });
    } catch {
      setProgress(null);
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
    // to follow what was read rather than assuming every photo is a purchase —
    // and the wallet has to follow the direction.
    chooseType(parsed.type);
    setSource('ai_receipt');
    if (parsed.occurred_at) setOccurredAt(parsed.occurred_at);
    if (parsed.note) setNote(parsed.note);

    const matched = matchCategory(parsed.category_guess, categories);
    if (matched) setCategoryId(matched.id);

    const unsure = parsed.confidence < 0.6;
    const kind = parsed.type === 'income' ? 'khoản thu' : 'khoản chi';

    setAiStatus('done');
    // The inline line stays put while the form is reviewed; the toast is what
    // announces the fields changed under the reader's hands.
    setAiMessage(
      unsure
        ? 'AI không chắc lắm — soát kỹ số tiền trước khi lưu.'
        : `AI đã điền sẵn ${kind}. Kiểm tra lại một lượt rồi lưu nhé.`,
    );
    setToast({
      tone: unsure ? 'info' : 'success',
      title: unsure ? 'Đã điền, nhưng chưa chắc' : 'AI điền xong rồi!',
      description: unsure
        ? `Ảnh hơi khó đọc nên AI không chắc về số tiền của ${kind} này.`
        : `Đã điền số tiền, nội dung, ngày và danh mục cho ${kind} này.`,
      note: 'Kéo xuống kiểm tra lại một lần trước khi lưu nhé!',
    });
  }

  if (wallets.length === 0) {
    return (
      <p className="card text-sm text-muted">
        Chưa có ví nào. Chạy <code>supabase/schema.sql</code> trong Supabase SQL Editor trước.
      </p>
    );
  }

  return (
    <>
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="amount" value={amount ?? ''} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="wallet_id" value={walletId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="receipt_hash" value={receiptHash} />
      {initial && <input type="hidden" name="id" value={initial.id} />}

      {!editing && (
      <div className="card space-y-3">
        <div>
          <p className="text-sm font-medium">1. Tải hoá đơn lên</p>
          <p className="text-xs text-muted">
            AI điền sẵn số tiền, nội dung và ngày. Kéo xuống kiểm tra rồi lưu. Không có ảnh thì
            nhập tay bên dưới cũng được. Chọn nhiều ảnh trong album (tối đa {MAX_RECEIPT_BATCH}) để
            duyệt lần lượt bằng cách vuốt.
          </p>
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
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) void handleReceipts(files);
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
            🖼️ Từ album
          </Button>
        </div>

        {aiStatus === 'working' && (
          <p role="status" className="text-center text-xs text-muted">
            {progress
              ? `Đang đọc ${progress.done}/${progress.total} ảnh…`
              : 'Đang đọc hoá đơn…'}
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
      )}

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1 ring-1 ring-border">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => chooseType(option)}
            aria-pressed={type === option}
            className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
              type === option
                ? option === 'expense'
                  ? 'bg-expense text-on-money'
                  : 'bg-income text-on-money'
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
        <span className="mb-1.5 block text-sm font-medium text-muted">
          {type === 'income' ? 'Thu vào ví' : 'Chi từ ví'}
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleWallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              onClick={() => setWalletId(wallet.id)}
              aria-pressed={walletId === wallet.id}
              className={`tap min-h-[44px] shrink-0 rounded-xl border px-4 text-sm font-medium ${
                walletId === wallet.id
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-surface text-muted'
              }`}
            >
              {wallet.type === 'shared' ? '👨‍👩‍👧‍👦 ' : '👤 '}
              {wallet.name}
            </button>
          ))}
        </div>
        {type === 'income' && (
          <span className="mt-1.5 block text-xs text-muted">
            Khoản thu luôn về ví cá nhân. Quỹ gia đình chỉ ghi khoản chi.
          </span>
        )}
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
                        ? 'border-brand bg-brand/10 text-brand-strong'
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


      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}

      <Button type="submit" full disabled={submitting || amount === null}>
        {submitting ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu giao dịch'}
      </Button>

      {footer}

      {toast && (
        <Toast
          title={toast.title}
          description={toast.description}
          note={toast.note}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      )}
    </form>

    {/* Outside the form on purpose: its inputs would otherwise submit this one
        the moment someone pressed Enter while editing a card. */}
    {batch && (
      <BatchReviewDeck
        drafts={batch.drafts}
        wallets={wallets}
        categories={categories}
        currentUserId={currentUserId}
        skipped={batch.skipped}
        onCancel={() => setBatch(null)}
      />
    )}
    </>
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
