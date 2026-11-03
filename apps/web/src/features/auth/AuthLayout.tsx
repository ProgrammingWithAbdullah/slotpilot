import { useRef, type ReactNode } from 'react';
import { Bot, CalendarCheck2, MessageSquareText, ShieldCheck } from 'lucide-react';
import { Logo } from '@/app/Logo';
import { EASE_OUT, gsap, useMotion } from '@/lib/motion';
import { useBusiness } from '@/lib/useBusiness';

const features = [
  { Icon: MessageSquareText, text: 'Just say what you need: "a cleaning tomorrow at 3pm".' },
  { Icon: CalendarCheck2, text: 'See real free times and confirm in one tap.' },
  { Icon: ShieldCheck, text: 'Prefer forms? The booking form is always one click away.' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { data: business } = useBusiness();
  const rootRef = useRef<HTMLDivElement>(null);

  useMotion(
    () => {
      const tl = gsap.timeline({ defaults: { ease: EASE_OUT, duration: 1 } });
      tl.from('[data-intro="aside"]', { autoAlpha: 0, y: 18, stagger: 0.07 })
        .from('[data-intro="preview"]', { autoAlpha: 0, y: 24, scale: 0.98 }, '-=0.75')
        .from('[data-intro="form"]', { autoAlpha: 0, y: 12, stagger: 0.06, duration: 0.8 }, 0.1);

      // The background light drifts slowly, so the panel feels lit rather than painted.
      gsap.to('[data-glow]', {
        xPercent: (i) => (i ? -8 : 10),
        yPercent: (i) => (i ? 6 : -8),
        duration: 9,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden bg-[#0b4f4a] p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-800 via-teal-700/90 to-cyan-900" />
          <div data-glow className="absolute -left-32 -top-40 size-[34rem] rounded-full bg-teal-300/25 blur-3xl" />
          <div data-glow className="absolute -bottom-48 -right-32 size-[30rem] rounded-full bg-cyan-400/20 blur-3xl" />
          {/* A fine dot grid gives the gradient a surface to sit on. */}
          <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        </div>

        <div data-intro="aside">
          <Logo inverted />
        </div>
        <div className="my-auto max-w-lg py-10">
          <p
            data-intro="aside"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-teal-50 ring-1 ring-inset ring-white/15"
          >
            <span className="size-1.5 rounded-full bg-teal-300" aria-hidden="true" />
            {business?.name ?? 'Your clinic'}
          </p>
          <h2
            data-intro="aside"
            className="mt-5 text-4xl font-semibold leading-[1.1] tracking-[-0.03em] xl:text-[44px]"
          >
            Book your next appointment in a sentence.
          </h2>
          <ul className="mt-9 space-y-4">
            {features.map(({ Icon, text }) => (
              <li key={text} data-intro="aside" className="flex gap-3 text-teal-50/90">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>

          <ChatPreview />
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div data-intro="form" className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 data-intro="form" className="text-[28px] font-semibold leading-tight">
            {title}
          </h1>
          <p data-intro="form" className="mt-1.5 text-fg-muted">
            {subtitle}
          </p>
          <div data-intro="form" className="mt-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** A still of the product doing its one job, so the promise on the left is shown, not only told. */
function ChatPreview() {
  return (
    <figure
      data-intro="preview"
      aria-hidden="true"
      className="mt-10 rounded-2xl bg-white/[0.07] p-4 shadow-[0_24px_48px_-16px_rgb(0_0_0/0.45)] ring-1 ring-inset ring-white/12"
    >
      <div className="flex justify-end">
        <p className="rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm text-teal-950">
          A cleaning tomorrow at 3pm
        </p>
      </div>
      <div className="mt-3 flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal-300/20 text-teal-200">
          <Bot className="size-3.5" />
        </span>
        <div className="flex-1 rounded-2xl rounded-tl-md bg-white/10 p-3 text-sm">
          <p className="text-teal-50">Cleaning, tomorrow at 3:00 PM for 45 min. Shall I book it?</p>
          <div className="mt-2.5 flex gap-2">
            <span className="rounded-lg bg-teal-300 px-3 py-1 text-xs font-semibold text-teal-950">Confirm</span>
            <span className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-teal-50">Edit</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
