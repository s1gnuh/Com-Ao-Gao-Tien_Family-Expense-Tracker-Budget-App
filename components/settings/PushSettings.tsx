'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import {
  disablePush,
  enablePush,
  sendTestNotification,
  updateNotificationPrefs,
} from '@/app/(dashboard)/settings/actions';
import { isStandalone, pushSupported, urlBase64ToUint8Array } from '@/lib/push-client';

interface PushSettingsProps {
  initialEnabled: boolean;
  initialHour: number;
}

type Gate = 'checking' | 'need-install' | 'unsupported' | 'denied' | 'ready';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export default function PushSettings({ initialEnabled, initialHour }: PushSettingsProps) {
  const [gate, setGate] = useState<Gate>('checking');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const healedOnce = useRef(false);

  useEffect(() => {
    if (!pushSupported()) {
      setGate('unsupported');
      return;
    }
    if (!isStandalone()) {
      setGate('need-install');
      return;
    }
    setGate(Notification.permission === 'denied' ? 'denied' : 'ready');
  }, []);

  // iOS is known to drop a push subscription with no warning (the browser
  // keeps no record for us to check against). If the preference says this
  // person should be getting reminders and permission is already granted —
  // meaning no prompt is needed — quietly make sure a live subscription
  // actually backs that up, once per app load.
  useEffect(() => {
    if (gate !== 'ready' || !enabled || healedOnce.current) return;
    if (Notification.permission !== 'granted') return;
    healedOnce.current = true;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existing = await registration.pushManager.getSubscription();
        if (existing) return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        });
        const json = subscription.toJSON();
        if (json.endpoint && json.keys) {
          await enablePush(
            { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh!, auth: json.keys.auth! } },
            hour,
          );
        }
      } catch {
        // Best-effort: say nothing. The toggle still reflects the saved
        // preference, and "Gửi thử thông báo" is there if they want to check.
      }
    })();
  }, [gate, enabled]);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) {
      setNote({ tone: 'error', text: 'Thiếu cấu hình thông báo (VAPID key), báo người quản trị app.' });
      return;
    }

    setBusy(true);
    setNote(null);
    try {
      // The very first await after the tap, before anything else — iOS Safari
      // only treats this as a direct result of the user gesture up until the
      // first promise it has to wait on actually takes real time. Registering
      // the service worker first (serviceWorker.ready in particular, which
      // waits for the worker to finish activating) burns exactly that window,
      // so by the time this ran the prompt silently never appeared: the toggle
      // just looked stuck.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setGate(permission === 'denied' ? 'denied' : 'ready');
        setNote({ tone: 'error', text: 'Bạn chưa cho phép thông báo.' });
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error('invalid subscription');
      }

      const result = await enablePush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        hour,
      );
      if (result.error) {
        setNote({ tone: 'error', text: result.error });
        return;
      }

      setEnabled(true);
      setGate('ready');
      setNote({ tone: 'ok', text: 'Đã bật nhắc nhở!' });
    } catch {
      setNote({ tone: 'error', text: 'Không bật được thông báo, thử lại nhé.' });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await Promise.all([
        disablePush(subscription?.endpoint ?? null, hour),
        subscription?.unsubscribe(),
      ]);
      setEnabled(false);
      setNote({ tone: 'ok', text: 'Đã tắt nhắc nhở.' });
    } catch {
      setNote({ tone: 'error', text: 'Không tắt được, thử lại nhé.' });
    } finally {
      setBusy(false);
    }
  }

  async function changeHour(nextHour: number) {
    setHour(nextHour);
    if (!enabled) return;
    const result = await updateNotificationPrefs(true, nextHour);
    setNote(
      result.error ? { tone: 'error', text: result.error } : { tone: 'ok', text: 'Đã cập nhật giờ nhắc.' },
    );
  }

  async function test() {
    setTesting(true);
    setNote(null);
    const result = await sendTestNotification();
    setNote(
      result.error
        ? { tone: 'error', text: result.error }
        : { tone: 'ok', text: 'Đã gửi! Xem thông báo trên máy.' },
    );
    setTesting(false);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Nhắc nhở cuối ngày</p>
          <p className="mt-0.5 text-xs text-muted">
            Thông báo mỗi ngày kèm số dư các ví bạn xem được, để khỏi quên ghi sổ.
          </p>
        </div>

        {gate === 'ready' && (
          <ToggleSwitch
            checked={enabled}
            busy={busy}
            disabled={busy}
            onChange={(next) => void (next ? enable() : disable())}
          />
        )}
      </div>

      {gate === 'need-install' && (
        <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
          Thêm app vào Màn hình chính trước đã: chạm nút <b>Chia sẻ</b> trên Safari rồi chọn{' '}
          <b>Thêm vào MH chính</b>. Mở lại từ biểu tượng đó để bật được nhắc nhở.
        </p>
      )}

      {gate === 'unsupported' && (
        <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
          Trình duyệt này chưa hỗ trợ thông báo đẩy.
        </p>
      )}

      {gate === 'denied' && (
        <p className="rounded-xl bg-bg px-3 py-2 text-xs text-brand-strong">
          Thông báo đang bị chặn. Vào Cài đặt máy → Cơm Áo Gạo Tiền → Thông báo để bật lại, rồi quay
          lại đây.
        </p>
      )}

      {gate === 'ready' && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Nhắc vào lúc</span>
            <select
              value={hour}
              disabled={!enabled || busy}
              onChange={(event) => void changeHour(Number(event.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand disabled:opacity-60"
            >
              {HOURS.map((option) => (
                <option key={option} value={option}>
                  {`${option}`.padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-muted">
              Gửi trong vòng giờ đã chọn, không chính xác tới từng phút.
            </span>
          </label>

          <Button
            type="button"
            variant="secondary"
            full
            disabled={!enabled || busy || testing}
            onClick={() => void test()}
          >
            {testing ? 'Đang gửi…' : '🔔 Gửi thử thông báo'}
          </Button>
        </>
      )}

      {note && (
        <p role="status" className={`text-xs ${note.tone === 'error' ? 'text-expense' : 'text-income'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  busy,
  disabled,
  onChange,
}: {
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    // h-8 w-14 (32×56) rather than the tighter 28×48 it started at: still reads
    // as a compact switch but clears the 44pt tap target every other control in
    // this app holds itself to.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy}
      aria-label="Nhắc nhở cuối ngày"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tap relative flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-border'
      }`}
    >
      <span
        aria-hidden
        className="absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface shadow transition-transform"
        style={{ transform: checked ? 'translateX(26px)' : 'translateX(2px)' }}
      >
        {busy && (
          // Toggling involves a native permission prompt and a server round
          // trip, which can take seconds — without this the switch just sits
          // dimmed and motionless, and a tap can look like it never landed.
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-3.5 w-3.5 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ animation: 'cagt-spin 650ms linear infinite' }}
          >
            <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
          </svg>
        )}
      </span>
    </button>
  );
}
