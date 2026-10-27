'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import {
  removePushSubscription,
  savePushSubscription,
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
          await savePushSubscription({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh!, auth: json.keys.auth! },
          });
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
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Must follow directly from this tap — iOS only honours the permission
      // prompt when it is a direct result of a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setGate(permission === 'denied' ? 'denied' : 'ready');
        setNote({ tone: 'error', text: 'Bạn chưa cho phép thông báo.' });
        return;
      }

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

      const saved = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (saved.error) {
        setNote({ tone: 'error', text: saved.error });
        return;
      }

      const prefs = await updateNotificationPrefs(true, hour);
      if (prefs.error) {
        setNote({ tone: 'error', text: prefs.error });
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
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      await updateNotificationPrefs(false, hour);
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
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Bật nhắc nhở cuối ngày"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tap relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-border'
      }`}
    >
      <span
        aria-hidden
        className="absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}
