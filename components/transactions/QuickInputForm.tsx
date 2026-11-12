'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AmountInput from '@/components/ui/AmountInput';
import Toast, { type ToastTone } from '@/components/ui/Toast';
import type { ReceiptDraft } from '@/components/transactions/BatchReviewDeck';
import { downscaleImage, hashImage } from '@/lib/image';
import { MAX_RECEIPT_BATCH } from '@/lib/receipts';
import { formatDate, formatSigned, formatVND, parseAmountInput, todayInput } from '@/lib/formatters';
import { defaultWalletId, walletsForType } from '@/lib/wallets';
import { findIncomeCategory, matchCategory } from '@/lib/categories';
import { markLocalMutation, requestWarm } from '@/lib/route-warm';
import { createTransaction, type CreateTransactionState } from '@/app/(dashboard)/transactions/add/actions';
import { updateTransaction } from '@/app/(dashboard)/transactions/[id]/actions';
import type { Category, ParsedReceipt, TransactionType, Wallet } from '@/types';

export interface EditableTransaction {
  id: string;
  wallet_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  note: string | null;
  occurred_at: string;
}

/** A note this person typed before, and the category it went with. */
export interface RecentNote {
  note: string;
  category_id: string | null;
}

interface QuickInputFormProps {
  wallets: Wallet[];
  categories: Category[];
  /** Whose personal wallet income should land in by default. */
  currentUserId: string | null;
  /** Present means editing that row rather than creating a new one. */
  initial?: EditableTransaction;
  /** Offered as suggestions under the note field. */
  recentNotes?: RecentNote[];
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

interface ToastState {
  title: string;
  description: string;
  note?: string;
  tone?: ToastTone;
  duration?: number;
}

const INITIAL: CreateTransactionState = { error: null };

/**
 * The swipe deck is the biggest piece of this screen and only appears after
 * several photos are picked, so its code stays out of the page until then.
 */
const loadDeck = () => import('@/components/transactions/BatchReviewDeck');
const BatchReviewDeck = dynamic(loadDeck, { ssr: false });

const WRONG_FORMAT: ToastState = {
  title: 'Ảnh không đúng định dạng',
  description: 'Chỉ nhận ảnh JPG, PNG hoặc HEIC. Chọn lại giúp mình nhé.',
};

export default function QuickInputForm({
  wallets,
  categories,
  currentUserId,
  initial,
  recentNotes = [],
  footer,
}: QuickInputFormProps) {
  const editing = initial !== undefined;
  const [state, formAction, submitting] = useActionState(
    // Same signature; the edit action simply never reports `saved`.
    (editing ? updateTransaction : createTransaction) as typeof createTransaction,
    INITIAL,
  );

  const incomeCategory = useMemo(() => findIncomeCategory(categories), [categories]);

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
  const [receiptPath, setReceiptPath] = useState('');

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  /** Non-null once several images are read and waiting to be swiped through. */
  const [batch, setBatch] = useState<{ drafts: ReceiptDraft[]; skipped: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const intentRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLFormElement>(null);

  // Read by handlers that finish after an await: by then the state captured
  // when they started may be stale — the person can switch wallet while the
  // AI is still reading the photo.
  const walletRef = useRef(walletId);
  walletRef.current = walletId;
  const categoryRef = useRef(categoryId);
  categoryRef.current = categoryId;

  const amount = parseAmountInput(amountRaw);
  const visibleWallets = useMemo(() => walletsForType(wallets, type), [wallets, type]);
  const today = todayInput();
  const yesterday = todayInput(new Date(Date.now() - 86_400_000));

  // A stable handler: the toast restarts its auto-close timer whenever this
  // changes, so an inline arrow kept pushing the dismissal back on every render.
  const closeToast = useCallback(() => setToast(null), []);

  const grouped = useMemo(
    () => ({
      fixed: categories.filter((category) => category.kind === 'fixed'),
      variable: categories.filter((category) => category.kind === 'variable'),
    }),
    [categories],
  );

  const noteSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return recentNotes.filter(({ note: text }) => {
      const key = text.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recentNotes]);

  /**
   * Picking "Thu" while the family fund is selected would leave the form on a
   * wallet the list no longer offers and the database refuses, so the wallet
   * moves along with the choice — and money in lands on "Thu nhập" unless a
   * category was already picked by hand.
   */
  function chooseType(next: TransactionType) {
    setType(next);
    if (!walletsForType(wallets, next).some((wallet) => wallet.id === walletRef.current)) {
      setWalletId(defaultWalletId(wallets, next, currentUserId));
    }
    if (!incomeCategory) return;
    if (next === 'income' && !categoryRef.current) setCategoryId(incomeCategory.id);
    if (next === 'expense' && categoryRef.current === incomeCategory.id) setCategoryId('');
  }

  function changeNote(value: string) {
    setNote(value);
    // Choosing a note used before brings its category back, if none is set yet.
    if (categoryRef.current) return;
    const match = noteSuggestions.find(
      (item) => item.note.trim().toLowerCase() === value.trim().toLowerCase(),
    );
    if (match?.category_id) setCategoryId(match.category_id);
  }

  /** Clears what belonged to the row just saved; keeps wallet, type and date. */
  function resetForNext() {
    setAmountRaw('');
    setNote('');
    setCategoryId(type === 'income' && incomeCategory ? incomeCategory.id : '');
    setSource('manual');
    setReceiptHash('');
    setReceiptPath('');
    setAiStatus('idle');
    setAiMessage(null);
  }

  // "Lưu & nhập tiếp" answers with the saved row instead of leaving the page.
  const savedAt = state.saved?.at;
  useEffect(() => {
    if (!savedAt || !state.saved) return;
    resetForNext();
    setToast({
      tone: 'success',
      title: `Đã lưu ${formatSigned(state.saved.amount, state.saved.type)}`,
      description: 'Nhập tiếp khoản sau nhé.',
      duration: 1600,
    });
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The save emptied the router cache without leaving the page; refill the
    // other tabs now rather than on the next tick.
    requestWarm();
    // Runs once per save; the helpers it calls only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt]);

  function categoryFor(guess: string | null, direction: TransactionType): string {
    const matched = matchCategory(guess, categories);
    // The model files most bank alerts of money in under "Khác"; the household
    // reads that as income, so that is where it goes unless it was sure.
    if (direction === 'income' && incomeCategory && (!matched || matched.name === 'Khác')) {
      return incomeCategory.id;
    }
    return matched?.id ?? '';
  }

  async function handleReceipt(file: File) {
    // "Choose File" in the iOS sheet can hand back a PDF or anything else, so
    // reject it here rather than spending a Gemini call to find out.
    if (!file.type.startsWith('image/')) {
      setToast(WRONG_FORMAT);
      return;
    }

    setAiStatus('working');
    setAiMessage(null);

    try {
      // Independent work on the same file: hashing reads the original bytes,
      // downscaling decodes it onto a canvas. No reason to wait for one first.
      const [digest, blob] = await Promise.all([hashImage(file), downscaleImage(file)]);
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
      setReceiptPath(result.data.receipt_path ?? '');
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
      setToast(WRONG_FORMAT);
      return;
    }
    if (images.length === 1) {
      void handleReceipt(images[0]!);
      return;
    }

    const picked = images.slice(0, MAX_RECEIPT_BATCH);
    // Fetch the review deck's code while the photos are being read, so it is
    // already here when they are.
    void loadDeck();

    setAiStatus('working');
    setAiMessage(null);
    setProgress({ done: 0, total: picked.length });

    try {
      const send = async (item: { hash: string; blob: Blob }) => {
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
      };

      // Decoded one at a time: five full-size iPhone photos on a canvas at once
      // is more memory than iOS Safari reliably hands out. But each one is sent
      // the moment it is ready, so the first is already being read by the AI
      // while the next is still being shrunk on the phone.
      const prepared: { hash: string; blob: Blob }[] = [];
      const inFlight: ReturnType<typeof send>[] = [];
      for (const file of picked) {
        const hash = await hashImage(file);
        // The same photo picked twice would pass the server check, which only
        // knows about bills already saved.
        if (prepared.some((item) => item.hash === hash)) continue;
        const item = { hash, blob: await downscaleImage(file) };
        prepared.push(item);
        inFlight.push(send(item));
      }

      const results = await Promise.all(inFlight);

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

        drafts.push({
          id: item.hash,
          hash: item.hash,
          blob: item.blob,
          receiptPath: parsed.data.receipt_path ?? null,
          amount: parsed.data.amount,
          type: parsed.data.type,
          note: parsed.data.note ?? '',
          categoryId: categoryFor(parsed.data.category_guess, parsed.data.type),
          occurredAt: parsed.data.occurred_at ?? todayInput(),
          // A batch can hold both directions at once — a bank alert read as
          // money in cannot carry the family fund the rest of them default to.
          walletId:
            parsed.data.type === 'income'
              ? defaultWalletId(wallets, 'income', currentUserId)
              : walletRef.current,
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
            unusable > 0 ? (reason ?? `${unusable} ảnh không đọc được hoặc đã nhập rồi.`) : '',
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
    // What the AI read wins over what was picked before, category included.
    categoryRef.current = '';
    // A balance-change alert starting with + is money in, so the direction has
    // to follow what was read rather than assuming every photo is a purchase —
    // and the wallet has to follow the direction.
    chooseType(parsed.type);
    setSource('ai_receipt');
    if (parsed.occurred_at) setOccurredAt(parsed.occurred_at);
    if (parsed.note) setNote(parsed.note);
    setCategoryId(categoryFor(parsed.category_guess, parsed.type));

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

  const blocked = submitting || amount === null || aiStatus === 'working';

  return (
    <>
      <form
        ref={formTopRef}
        action={formAction}
        onSubmit={markLocalMutation}
        className="scroll-mt-4 space-y-5"
      >
        <input type="hidden" name="amount" value={amount ?? ''} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="wallet_id" value={walletId} />
        <input type="hidden" name="category_id" value={categoryId} />
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="receipt_hash" value={receiptHash} />
        <input type="hidden" name="receipt_url" value={receiptPath} />
        <input ref={intentRef} type="hidden" name="intent" defaultValue="done" />
        {initial && <input type="hidden" name="id" value={initial.id} />}

        {!editing && (
          <div className="card space-y-3">
            <div>
              <p className="text-sm font-medium">📷 Có hoá đơn? Để AI điền giúp</p>
              <p className="text-xs text-muted">
                Chụp hoá đơn hoặc chọn ảnh thông báo ngân hàng. Chọn nhiều ảnh trong album (tối đa{' '}
                {MAX_RECEIPT_BATCH}) để duyệt lần lượt bằng cách vuốt.
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
              <div role="status" className="space-y-1.5">
                <p className="text-center text-xs text-muted">
                  {progress ? `Đang đọc ${progress.done}/${progress.total} ảnh…` : 'Đang đọc hoá đơn…'}
                </p>
                <div aria-hidden className="h-1 overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-300"
                    style={{
                      width: progress
                        ? `${Math.max(8, (progress.done / progress.total) * 100)}%`
                        : '60%',
                      animation: progress ? undefined : 'cagt-sweep 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>
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

        <AmountInput
          name="amount_raw"
          value={amountRaw}
          onChange={setAmountRaw}
          required
          // Edit opens to review, not to retype; a new entry starts at the number.
          autoFocus={!editing}
        />

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

        <div>
          <Input
            label="Ghi chú"
            name="note"
            type="text"
            maxLength={140}
            placeholder="Cơm trưa, xăng xe…"
            list={noteSuggestions.length > 0 ? 'recent-notes' : undefined}
            autoComplete="off"
            enterKeyHint="done"
            value={note}
            onChange={(event) => changeNote(event.target.value)}
          />
          {noteSuggestions.length > 0 && (
            <>
              <datalist id="recent-notes">
                {noteSuggestions.map((item) => (
                  <option key={item.note} value={item.note} />
                ))}
              </datalist>
              {!note && (
                // Datalist suggestions on iOS only appear once typing starts, so
                // the most common ones get a tap target of their own.
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {noteSuggestions.slice(0, 6).map((item) => (
                    <button
                      key={item.note}
                      type="button"
                      onClick={() => changeNote(item.note)}
                      className="tap min-h-[36px] shrink-0 rounded-full border border-border bg-surface px-3 text-xs text-muted"
                    >
                      {item.note}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <Input
            label="Ngày"
            name="occurred_at"
            type="date"
            required
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            {[
              { label: 'Hôm nay', value: today },
              { label: 'Hôm qua', value: yesterday },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setOccurredAt(option.value)}
                aria-pressed={occurredAt === option.value}
                className={`tap min-h-[36px] rounded-full border px-3 text-xs font-medium ${
                  occurredAt === option.value
                    ? 'border-brand bg-brand/10 text-brand-strong'
                    : 'border-border bg-surface text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-expense">
            {state.error}
          </p>
        )}

        {/* Pinned above the tab bar: twelve category tiles push the save button
            a full screen down, and scrolling for it after every entry is the
            part of quick entry that was not quick. */}
        <div
          className="sticky z-30 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur"
          style={{ bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' }}
        >
          {editing ? (
            <Button type="submit" full disabled={blocked}>
              {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          ) : (
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <Button
                type="submit"
                variant="secondary"
                disabled={blocked}
                onClick={() => {
                  if (intentRef.current) intentRef.current.value = 'again';
                }}
              >
                {submitting ? '…' : '+ Lưu & nhập tiếp'}
              </Button>
              <Button
                type="submit"
                disabled={blocked}
                onClick={() => {
                  if (intentRef.current) intentRef.current.value = 'done';
                }}
              >
                {submitting
                  ? 'Đang lưu…'
                  : amount !== null
                    ? `Lưu ${formatSigned(amount, type)}`
                    : 'Lưu giao dịch'}
              </Button>
            </div>
          )}
        </div>

        {footer}

        {toast && (
          <Toast
            title={toast.title}
            description={toast.description}
            note={toast.note}
            tone={toast.tone}
            duration={toast.duration}
            onClose={closeToast}
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
