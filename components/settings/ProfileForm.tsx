'use client';

import { useActionState, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { updateProfile, type ActionState } from '@/app/(dashboard)/settings/actions';

const INITIAL: ActionState = { error: null, ok: false };
const EMOJIS = ['🙂', '👨', '👩', '👦', '👧', '🧑', '👴', '👵'];

export default function ProfileForm({
  displayName,
  avatarEmoji,
  username,
}: {
  displayName: string;
  avatarEmoji: string | null;
  username: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);
  const [emoji, setEmoji] = useState(avatarEmoji ?? '🙂');

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="text-sm font-medium">Hồ sơ</h2>

      <input type="hidden" name="avatar_emoji" value={emoji} />

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
              className={`tap flex h-11 w-11 items-center justify-center rounded-full border text-xl ${
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
        defaultValue={displayName}
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
          Đã lưu hồ sơ.
        </p>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
      </Button>
    </form>
  );
}
