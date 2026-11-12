'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { deletePasskey } from '@/app/(dashboard)/settings/actions';
import { markEnrolled, passkeyAvailable, registerPasskey } from '@/lib/passkey-client';
import { formatDate } from '@/lib/formatters';

export interface PasskeyRow {
  id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export default function PasskeySettings({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void passkeyAvailable().then(setAvailable);
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    const result = await registerPasskey();
    setBusy(false);
    if (result.ok) {
      setNote({ tone: 'ok', text: 'Đã bật! Lần sau mở app chỉ cần nhìn vào máy.' });
      router.refresh();
    } else if (!result.cancelled) {
      setNote({ tone: 'error', text: result.error });
    }
  }

  function remove(id: string) {
    setNote(null);
    setRemovingId(id);
    startRemoving(async () => {
      const result = await deletePasskey(id);
      setRemovingId(null);
      if (result.error) {
        setNote({ tone: 'error', text: result.error });
        return;
      }
      // Cannot tell which row is this phone, so only drop the hint when none are left.
      if (passkeys.length <= 1) markEnrolled(false);
      setNote({ tone: 'ok', text: 'Đã gỡ thiết bị.' });
      router.refresh();
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl">
          🙂
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Đăng nhập bằng Face ID</p>
          <p className="mt-0.5 text-xs text-muted">
            Khi phiên đăng nhập hết hạn, chỉ cần nhìn vào máy thay vì gõ lại mật khẩu. Khuôn mặt
            không rời khỏi điện thoại — app chỉ nhận được xác nhận là đúng người.
          </p>
        </div>
      </div>

      {passkeys.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {passkeys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {key.device_name ?? 'Thiết bị'}
                </span>
                <span className="block text-[11px] text-muted">
                  Bật ngày {formatDate(key.created_at)}
                  {key.last_used_at ? ` · dùng gần nhất ${formatDate(key.last_used_at)}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(key.id)}
                disabled={removing}
                className="tap min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-medium text-expense disabled:opacity-50"
              >
                {removingId === key.id ? 'Đang gỡ…' : 'Gỡ'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {available === false ? (
        <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
          Máy này chưa có Face ID / Touch ID, hoặc trình duyệt chưa hỗ trợ.
        </p>
      ) : (
        <Button
          type="button"
          variant={passkeys.length > 0 ? 'secondary' : 'primary'}
          full
          disabled={busy || available === null}
          onClick={() => void enable()}
        >
          {busy
            ? 'Đang chờ Face ID…'
            : passkeys.length > 0
              ? 'Bật thêm trên máy này'
              : 'Bật Face ID trên máy này'}
        </Button>
      )}

      {note && (
        <p
          role="status"
          className={`text-xs ${note.tone === 'error' ? 'text-expense' : 'text-income'}`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
