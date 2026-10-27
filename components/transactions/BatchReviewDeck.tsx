'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { createTransactionsBatch } from '@/app/(dashboard)/transactions/add/actions';
import { formatDate, formatVND, parseAmountInput } from '@/lib/formatters';
import type { ReceiptRow } from '@/lib/receipts';
import type { Category, TransactionType, Wallet } from '@/types';

export interface ReceiptDraft {
  id: string;
  hash: string;
  /** The downscaled upload itself. The deck owns its preview URL. */
  blob: Blob;
  amount: number;
  type: TransactionType;
  note: string;
  categoryId: string;
  occurredAt: string;
  walletId: string;
  confidence: number;
}

interface BatchReviewDeckProps {
  drafts: ReceiptDraft[];
  wallets: Wallet[];
  categories: Category[];
  /** Images the AI could not use, so the count on screen still adds up. */
  skipped: number;
  onCancel: () => void;
}

/** Drag past this and the card is released instead of snapping back. */
const SWIPE_PX = 88;
/** A short fast flick counts too, even when it never travels SWIPE_PX. */
const FLICK_SPEED = 620;
const FLY_MS = 300;
const EASE_OUT = 'cubic-bezier(0.22, 0.9, 0.3, 1)';

interface DragState {
  pointer: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  time: number;
  speed: number;
}

export default function BatchReviewDeck({
  drafts,
  wallets,
  categories,
  skipped,
  onCancel,
}: BatchReviewDeckProps) {
  const [cards, setCards] = useState(drafts);
  /** Cards mid-flight: still mounted so the swipe finishes, already out of the stack. */
  const [gone, setGone] = useState<Record<string, 1 | -1>>({});
  const [approved, setApproved] = useState<ReceiptDraft[]>([]);
  const [editing, setEditing] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const live = cards.filter((card) => !gone[card.id]);
  const top = live[0];

  const cardRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLSpanElement>(null);
  const noRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const timersRef = useRef<number[]>([]);

  // The deck owns the whole screen while it is open; letting the page scroll
  // underneath turns every vertical wobble during a swipe into a scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timers = timersRef.current;
    return () => {
      document.body.style.overflow = previous;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Created and revoked in the same effect so a remount — Strict Mode does one
  // on every mount in development — hands the images a live URL rather than one
  // the previous cleanup already revoked.
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const draft of drafts) urls[draft.id] = URL.createObjectURL(draft.blob);
    setPreviews(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [drafts]);

  // A card arriving at the front inherits nothing from the one that just left.
  useEffect(() => {
    if (yesRef.current) yesRef.current.style.opacity = '0';
    if (noRef.current) noRef.current.style.opacity = '0';
  }, [top?.id]);

  function paintStamps(dx: number) {
    const strength = String(Math.min(1, Math.abs(dx) / SWIPE_PX));
    if (yesRef.current) yesRef.current.style.opacity = dx > 6 ? strength : '0';
    if (noRef.current) noRef.current.style.opacity = dx < -6 ? strength : '0';
  }

  function decide(card: ReceiptDraft, decision: 'approve' | 'edit') {
    if (gone[card.id]) return;

    setGone((current) => ({ ...current, [card.id]: decision === 'approve' ? 1 : -1 }));
    if (decision === 'approve') {
      setApproved((list) => [...list, card]);
    } else {
      setEditing(card);
    }

    // The node stays mounted long enough to finish its flight, then leaves.
    timersRef.current.push(
      window.setTimeout(() => {
        setCards((list) => list.filter((item) => item.id !== card.id));
        setGone(({ [card.id]: _flown, ...rest }) => rest);
      }, FLY_MS),
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const element = cardRef.current;
    if (!element || !top) return;

    element.setPointerCapture(event.pointerId);
    element.style.transition = 'none';
    dragRef.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      time: event.timeStamp,
      speed: 0,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const element = cardRef.current;
    if (!drag || !element || drag.pointer !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const elapsed = event.timeStamp - drag.time;
    if (elapsed > 0) {
      // Smoothed: a single raw frame reads as noise on a 120Hz screen and makes
      // the flick test fire on jitter alone.
      drag.speed = 0.7 * (((dx - drag.dx) / elapsed) * 1000) + 0.3 * drag.speed;
      drag.time = event.timeStamp;
    }
    drag.dx = dx;
    drag.dy = dy;

    // Transform and opacity only, and nothing here reads layout, so the whole
    // drag stays on the compositor instead of repainting the card every frame.
    element.style.transform = `translate3d(${dx}px, ${dy * 0.35}px, 0) rotate(${dx / 18}deg)`;
    paintStamps(dx);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const element = cardRef.current;
    if (!drag || !element || drag.pointer !== event.pointerId) return;
    dragRef.current = null;

    const flicked = Math.abs(drag.speed) > FLICK_SPEED;
    const direction = Math.sign(flicked ? drag.speed : drag.dx);

    if (top && direction !== 0 && (flicked || Math.abs(drag.dx) > SWIPE_PX)) {
      decide(top, direction > 0 ? 'approve' : 'edit');
      return;
    }

    element.style.transition = `transform 260ms ${EASE_OUT}`;
    element.style.transform = '';
    paintStamps(0);
  }

  function closeEditor(updated: ReceiptDraft | null) {
    if (updated) {
      setApproved((list) => {
        const index = list.findIndex((item) => item.id === updated.id);
        if (index === -1) return [...list, updated];
        const copy = [...list];
        copy[index] = updated;
        return copy;
      });
    } else if (editing) {
      setApproved((list) => list.filter((item) => item.id !== editing.id));
    }
    setEditing(null);
  }

  function saveAll() {
    setError(null);
    const rows: ReceiptRow[] = approved.map((draft) => ({
      wallet_id: draft.walletId,
      category_id: draft.categoryId || null,
      type: draft.type,
      amount: draft.amount,
      note: draft.note.trim() || null,
      occurred_at: draft.occurredAt,
      receipt_hash: draft.hash,
    }));

    startSaving(async () => {
      const result = await createTransactionsBatch(rows);
      if (result?.error) setError(result.error);
    });
  }

  const reviewed = drafts.length - live.length;

  // z-[45] sits above the bottom nav (z-40) but below a toast (z-50), so the
  // "only five images" warning stays readable over the deck it just opened.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Duyệt hoá đơn vừa đọc"
      className="fixed inset-0 z-[45] flex flex-col bg-bg pt-safe-t pb-safe-b"
    >
      <header className="flex items-center gap-3 px-4 pt-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Đóng, bỏ hết"
          className="tap -ml-2 flex h-11 w-11 items-center justify-center rounded-2xl text-xl text-muted"
        >
          ✕
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Duyệt {drafts.length} hoá đơn</p>
          <p className="text-xs text-muted">
            {reviewed}/{drafts.length} đã xem
            {skipped > 0 ? ` · ${skipped} ảnh bỏ qua` : ''}
          </p>
        </div>
        <div aria-hidden className="flex shrink-0 gap-1">
          {drafts.map((draft) => (
            <span
              key={draft.id}
              className={`block h-1.5 rounded-full transition-all duration-200 ${
                live.some((item) => item.id === draft.id) ? 'w-2 bg-border' : 'w-5 bg-brand'
              }`}
            />
          ))}
        </div>
      </header>

      {editing ? (
        <DraftEditor
          key={editing.id}
          draft={editing}
          preview={previews[editing.id]}
          wallets={wallets}
          categories={categories}
          onApprove={closeEditor}
          onDiscard={() => closeEditor(null)}
        />
      ) : top ? (
        <>
          <div className="flex flex-1 items-center justify-center px-4 py-3">
            {/* A fixed box every card fills: an uneven stack lets the card
                behind poke out below the one on top. */}
            <div className="relative h-[min(68vh,470px)] w-full max-w-md">
            {cards.map((card) => {
              const flung = gone[card.id];
              const index = live.indexOf(card);
              if (!flung && index > 2) return null;

              const isTop = !flung && index === 0;
              const depth = Math.min(Math.max(index, 0), 2);

              return (
                <div
                  key={card.id}
                  ref={isTop ? cardRef : undefined}
                  onPointerDown={isTop ? onPointerDown : undefined}
                  onPointerMove={isTop ? onPointerMove : undefined}
                  onPointerUp={isTop ? onPointerUp : undefined}
                  onPointerCancel={isTop ? onPointerUp : undefined}
                  className="absolute inset-0 flex select-none flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-xl"
                  style={
                    flung
                      ? {
                          zIndex: 40,
                          pointerEvents: 'none',
                          transition: `transform ${FLY_MS}ms ${EASE_OUT}, opacity ${FLY_MS - 40}ms linear`,
                          transform: `translate3d(${flung * 130}vw, 40px, 0) rotate(${flung * 16}deg)`,
                          opacity: 0,
                        }
                      : isTop
                        ? {
                            zIndex: 30,
                            touchAction: 'none',
                            willChange: 'transform',
                            transition: `transform 260ms ${EASE_OUT}`,
                          }
                        : {
                            zIndex: 30 - depth,
                            transform: `translate3d(0, ${depth * 12}px, 0) scale(${1 - depth * 0.05})`,
                            transition: `transform 260ms ${EASE_OUT}`,
                          }
                  }
                >
                  <div className="relative min-h-0 flex-1 bg-bg">
                    {previews[card.id] && (
                      <img
                        src={previews[card.id]}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span
                      ref={isTop ? yesRef : undefined}
                      aria-hidden
                      style={{ opacity: 0 }}
                      className="absolute left-4 top-4 rounded-xl border-2 border-income bg-surface/90 px-3 py-1 text-sm font-bold text-income"
                    >
                      DUYỆT ✓
                    </span>
                    <span
                      ref={isTop ? noRef : undefined}
                      aria-hidden
                      style={{ opacity: 0 }}
                      className="absolute right-4 top-4 rounded-xl border-2 border-brand bg-surface/90 px-3 py-1 text-sm font-bold text-brand-strong"
                    >
                      ✏️ SỬA
                    </span>
                  </div>

                  <div className="shrink-0 space-y-2 border-t border-border p-4">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`tabular text-3xl font-semibold ${
                          card.type === 'income' ? 'text-income' : 'text-expense'
                        }`}
                      >
                        {card.type === 'income' ? '+' : '−'}
                        {formatVND(card.amount)}
                      </span>
                    </div>

                    <p className="truncate text-sm">{card.note || 'Không có nội dung'}</p>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-full bg-bg px-2 py-1">
                        {formatDate(card.occurredAt)}
                      </span>
                      <span className="rounded-full bg-bg px-2 py-1">
                        {categoryLabel(card.categoryId, categories)}
                      </span>
                      <span className="rounded-full bg-bg px-2 py-1">
                        {walletLabel(card.walletId, wallets)}
                      </span>
                    </div>

                    {card.confidence < 0.6 && (
                      <p className="rounded-xl bg-bg px-3 py-2 text-xs text-brand-strong">
                        AI không chắc về ảnh này — soát kỹ số tiền trước khi duyệt.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="mx-auto w-full max-w-md shrink-0 px-4 pb-3">
            <p className="mb-2 text-center text-xs text-muted">
              Vuốt trái để sửa · Vuốt phải để duyệt
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => decide(top, 'edit')}>
                ✏️ Sửa
              </Button>
              <Button type="button" onClick={() => decide(top, 'approve')}>
                ✓ Duyệt
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Summary
          approved={approved}
          previews={previews}
          categories={categories}
          saving={saving}
          error={error}
          onEdit={setEditing}
          onSave={saveAll}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

interface SummaryProps {
  approved: ReceiptDraft[];
  previews: Record<string, string>;
  categories: Category[];
  saving: boolean;
  error: string | null;
  onEdit: (draft: ReceiptDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

function Summary({
  approved,
  previews,
  categories,
  saving,
  error,
  onEdit,
  onSave,
  onCancel,
}: SummaryProps) {
  const expense = approved
    .filter((draft) => draft.type === 'expense')
    .reduce((sum, draft) => sum + draft.amount, 0);
  const income = approved
    .filter((draft) => draft.type === 'income')
    .reduce((sum, draft) => sum + draft.amount, 0);

  if (approved.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span aria-hidden className="text-5xl">
          🗑️
        </span>
        <p className="text-sm text-muted">Không có khoản nào được duyệt.</p>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Đóng
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 py-4">
      <div className="card space-y-1 text-center">
        <span aria-hidden className="text-3xl">
          ✅
        </span>
        <p className="font-semibold">Đã duyệt {approved.length} khoản</p>
        <p className="tabular text-sm text-muted">
          {expense > 0 ? `Chi ${formatVND(expense)}` : ''}
          {expense > 0 && income > 0 ? ' · ' : ''}
          {income > 0 ? `Thu ${formatVND(income)}` : ''}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {approved.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => onEdit(draft)}
              className="card tap flex w-full items-center gap-3 text-left"
            >
              <img
                src={previews[draft.id]}
                alt=""
                className="h-12 w-12 shrink-0 rounded-xl bg-bg object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {draft.note || categoryLabel(draft.categoryId, categories)}
                </span>
                <span className="block text-xs text-muted">{formatDate(draft.occurredAt)}</span>
              </span>
              <span
                className={`tabular shrink-0 text-sm font-semibold ${
                  draft.type === 'income' ? 'text-income' : 'text-expense'
                }`}
              >
                {draft.type === 'income' ? '+' : '−'}
                {formatVND(draft.amount)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-center text-xs text-muted">Chạm một khoản để sửa lại.</p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-expense">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        <Button type="button" full disabled={saving} onClick={onSave}>
          {saving ? 'Đang lưu…' : `Lưu ${approved.length} khoản vào sổ`}
        </Button>
        <Button type="button" variant="ghost" full disabled={saving} onClick={onCancel}>
          Huỷ hết
        </Button>
      </div>
    </div>
  );
}

interface DraftEditorProps {
  draft: ReceiptDraft;
  preview: string | undefined;
  wallets: Wallet[];
  categories: Category[];
  onApprove: (draft: ReceiptDraft) => void;
  onDiscard: () => void;
}

function DraftEditor({
  draft,
  preview,
  wallets,
  categories,
  onApprove,
  onDiscard,
}: DraftEditorProps) {
  const [amountRaw, setAmountRaw] = useState(String(draft.amount));
  const [type, setType] = useState(draft.type);
  const [walletId, setWalletId] = useState(draft.walletId);
  const [categoryId, setCategoryId] = useState(draft.categoryId);
  const [note, setNote] = useState(draft.note);
  const [occurredAt, setOccurredAt] = useState(draft.occurredAt);

  const amount = parseAmountInput(amountRaw);

  return (
    <div
      className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 py-3"
      style={{ animation: 'cagt-rise 220ms ease-out both' }}
    >
      {preview && (
        <img
          src={preview}
          alt="Ảnh hoá đơn đang sửa"
          className="h-40 w-full rounded-2xl bg-bg object-contain"
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-surface p-1 ring-1 ring-border">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
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

      <div className="mt-3">
        <span className="mb-1.5 block text-sm font-medium text-muted">Số tiền</span>
        <input
          type="text"
          inputMode="decimal"
          value={amountRaw}
          onChange={(event) => setAmountRaw(event.target.value)}
          className="tabular w-full rounded-xl border border-border bg-surface px-4 py-3 text-2xl font-semibold outline-none focus:border-brand"
        />
        <span className="mt-1.5 block text-sm text-muted">
          {amount === null ? 'Gõ 35k hoặc 1tr2 cũng được' : formatVND(amount)}
        </span>
      </div>

      <div className="mt-3">
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
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-surface text-muted'
              }`}
            >
              {wallet.type === 'shared' ? '👨‍👩‍👧‍👦 ' : '👤 '}
              {wallet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="mb-1.5 block text-sm font-medium text-muted">Danh mục</span>
        <div className="grid grid-cols-4 gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id === categoryId ? '' : category.id)}
              aria-pressed={categoryId === category.id}
              className={`tap flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl border text-[11px] leading-tight ${
                categoryId === category.id
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-surface text-muted'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {category.icon}
              </span>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <Input
          label="Ghi chú"
          type="text"
          maxLength={140}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Input
          label="Ngày"
          type="date"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </div>

      <div className="mt-4 space-y-2">
        <Button
          type="button"
          full
          disabled={amount === null}
          onClick={() =>
            onApprove({
              ...draft,
              amount: amount ?? draft.amount,
              type,
              walletId,
              categoryId,
              note,
              occurredAt,
            })
          }
        >
          ✓ Duyệt khoản này
        </Button>
        <Button type="button" variant="ghost" full onClick={onDiscard}>
          Bỏ qua ảnh này
        </Button>
      </div>
    </div>
  );
}

function categoryLabel(id: string, categories: Category[]): string {
  const found = categories.find((category) => category.id === id);
  return found ? `${found.icon ?? ''} ${found.name}`.trim() : 'Chưa có danh mục';
}

function walletLabel(id: string, wallets: Wallet[]): string {
  const found = wallets.find((wallet) => wallet.id === id);
  return found ? found.name : 'Ví';
}
