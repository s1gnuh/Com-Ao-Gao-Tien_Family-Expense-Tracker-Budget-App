'use client';

import { useActionState, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { updateProfile, type ActionState } from '@/app/(dashboard)/settings/actions';
import type { Profile } from '@/types';

const INITIAL: ActionState = { error: null, ok: false };
const EMOJIS = ['🙂', '👨', '👩', '👦', '👧', '🧑', '👴', '👵'];
const ROLES = ['Bố', 'Mẹ', 'Con', 'Ông', 'Bà', 'Khác'];

interface ProfileFormProps {
  profile: Profile | null;
  username: string;
  fallbackName: string;
}

export default function ProfileForm({ profile, username, fallbackName }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(profile?.avatar_emoji ?? '🙂');
  const [role, setRole] = useState(profile?.family_role ?? '');

  const name = profile?.display_name ?? fallbackName;

  // Collapsed by default: the settings screen is a list of things you rarely
  // change, and the full form pushed everything else below the fold.
  if (!open) {
    const filled = [profile?.full_name, profile?.family_role, profile?.phone, profile?.birthday]
      .filter(Boolean).length;

    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card tap flex w-full items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg text-2xl"
        >
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            @{username}
            {profile?.family_role ? ` · ${profile.family_role}` : ''}
            {filled < 4 ? ' · chạm để bổ sung thông tin' : ''}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </button>
    );
  }

  return (
    <form action={formAction} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Hồ sơ của bạn</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-2xl text-muted"
          aria-label="Thu gọn hồ sơ"
        >
          ⌃
        </button>
      </div>

      <input type="hidden" name="avatar_emoji" value={emoji} />
      <input type="hidden" name="family_role" value={role} />

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Ảnh đại diện</span>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setEmoji(option)}
              aria-pressed={emoji === option}
              aria-label={`Chọn ${option}`}
              className={`tap flex h-12 w-12 items-center justify-center rounded-2xl border text-xl ${
                emoji === option ? 'border-brand bg-brand/10' : 'border-border bg-bg'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Tên hiển thị"
        name="display_name"
        type="text"
        required
        maxLength={40}
        hint="Tên cả nhà nhìn thấy cạnh mỗi khoản bạn ghi."
        defaultValue={name}
      />

      <Input
        label="Họ và tên"
        name="full_name"
        type="text"
        maxLength={80}
        placeholder="Nguyễn Văn A"
        defaultValue={profile?.full_name ?? ''}
      />

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Vai trò trong nhà</span>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRole(option === role ? '' : option)}
              aria-pressed={role === option}
              className={`tap min-h-[48px] rounded-2xl border px-4 text-sm font-medium ${
                role === option
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-bg text-muted'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Số điện thoại"
        name="phone"
        type="tel"
        inputMode="tel"
        maxLength={20}
        placeholder="09xx xxx xxx"
        defaultValue={profile?.phone ?? ''}
      />

      <Input
        label="Ngày sinh"
        name="birthday"
        type="date"
        defaultValue={profile?.birthday ?? ''}
      />

      <Input
        label="Ghi chú"
        name="note"
        type="text"
        maxLength={200}
        placeholder="Ví dụ: phụ trách tiền chợ"
        defaultValue={profile?.note ?? ''}
      />

      <p className="text-xs text-muted">
        Tên đăng nhập: <span className="font-medium text-fg">{username}</span> (không đổi được)
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p role="status" className="text-sm text-income">
          Đã lưu hồ sơ rồi nha!
        </p>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
      </Button>
    </form>
  );
}
