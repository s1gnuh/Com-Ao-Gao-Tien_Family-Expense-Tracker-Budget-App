'use client';

import { useEffect, useState } from 'react';

/** Bumped when the steps change enough that returning users should see them. */
const SEEN_KEY = 'cagt-tour-v1';

const STEPS = [
  {
    icon: '👋',
    title: 'Chào nhà mình!',
    body: 'Đây là cuốn sổ chi tiêu chung. Mỗi người có ví riêng, cộng một quỹ gia đình cả nhà cùng ghi.',
  },
  {
    icon: '📷',
    title: 'Chụp là xong',
    body: 'Bấm nút cam ở giữa, chụp hoá đơn hoặc chọn ảnh thông báo ngân hàng — AI tự điền số tiền, ngày và danh mục giúp bạn.',
  },
  {
    icon: '🧾',
    title: 'Xem lại theo lịch',
    body: 'Tab Giao dịch hiện cả tháng dạng lịch. Chạm một ngày để lọc, chạm một khoản để sửa nếu lỡ nhập sai.',
  },
  {
    icon: '🔔',
    title: 'Khỏi quên tiền điện',
    body: 'Thêm hoá đơn định kỳ trong Ví & Quỹ. App nhắc ngay trang chủ khi sắp tới hạn.',
  },
];

export default function OnboardingTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Private mode throws; showing the tour once more is harmless.
    }
    // Waits out the splash so the two overlays never stack.
    if (!seen) {
      const timer = setTimeout(() => setStep(0), 5200);
      return () => clearTimeout(timer);
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Ignored: at worst it shows again next launch.
    }
    setStep(null);
  }

  if (step === null) return null;

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cagt-tour-title"
    >
      <div aria-hidden className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />

      <div
        className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl"
        style={{
          marginBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          animation: 'cagt-pop-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        <div className="text-center">
          <span aria-hidden className="text-5xl">
            {current.icon}
          </span>
          <h2 id="cagt-tour-title" className="mt-3 text-xl font-semibold">
            {current.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
        </div>

        <div aria-hidden className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-2 rounded-full transition-all ${
                index === step ? 'w-6 bg-brand' : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={close}
            className="tap min-h-[48px] rounded-2xl border border-border bg-surface font-medium text-muted"
          >
            Bỏ qua
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="tap min-h-[48px] rounded-2xl bg-brand font-semibold text-brand-ink"
          >
            {last ? 'Bắt đầu thôi!' : 'Tiếp'}
          </button>
        </div>

        <a
          href="/huong-dan.html"
          onClick={close}
          className="tap mt-3 block text-center text-xs font-medium text-brand-strong"
        >
          Xem hướng dẫn đầy đủ
        </a>
      </div>
    </div>
  );
}
