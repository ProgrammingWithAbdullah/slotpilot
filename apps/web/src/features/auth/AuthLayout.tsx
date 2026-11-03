import type { ReactNode } from 'react';
import { CalendarCheck2, MessageSquareText, ShieldCheck } from 'lucide-react';
import { Logo } from '@/app/Logo';
import { useBusiness } from '@/lib/useBusiness';

const features = [
  { Icon: MessageSquareText, text: 'Just say what you need: "a cleaning tomorrow at 3pm".' },
  { Icon: CalendarCheck2, text: 'See real free times and confirm in one tap.' },
  { Icon: ShieldCheck, text: 'Prefer forms? The booking form is always one click away.' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { data: business } = useBusiness();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-800 p-12 text-white lg:flex lg:flex-col">
        <Logo inverted />
        <div className="my-auto max-w-md">
          <p className="text-sm font-medium uppercase tracking-wider text-teal-100/80">
            {business?.name ?? 'Your clinic'}
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">Book your next appointment in a sentence.</h2>
          <ul className="mt-8 space-y-4">
            {features.map(({ Icon, text }) => (
              <li key={text} className="flex gap-3 text-teal-50">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-white/5"
        />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-fg-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
