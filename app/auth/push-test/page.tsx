import PushSettings from '@/components/settings/PushSettings';

export default function PushTestPage() {
  return (
    <div className="px-4 py-4">
      <PushSettings initialEnabled={false} initialHour={20} />
    </div>
  );
}
