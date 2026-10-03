import { CalendarCheck, ClipboardCheck, LineChart, Target } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { HeaderActions, HeroActions } from '@/features/auth';

const questions = [
  { icon: Target, title: 'What did you promise?', body: 'Turn a meaningful goal into a few measurable daily or weekly commitments.' },
  { icon: ClipboardCheck, title: 'What did you actually do?', body: 'Record completions as they happen — including the partial ones.' },
  { icon: CalendarCheck, title: 'Why was there a difference?', body: 'A two-minute evening check-in captures what got in the way.' },
  { icon: LineChart, title: 'What should change next?', body: 'Consistency, streaks and patterns show where to adjust the plan.' },
];

/** Marketing page: fully static (SSG). Session-aware buttons hydrate on the client. */
export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <HeaderActions />
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 pb-20">
        <section className="py-14 sm:py-20">
          <p className="text-sm font-medium text-primary">Personal accountability, not another to-do list</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Keep the promises you make to yourself.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Set a goal, commit to a few concrete actions, check in every evening, and see honestly how consistent you are — without shame, streak tricks or noise.
          </p>
          <HeroActions />
        </section>
        <section aria-label="How it works" className="grid gap-4 sm:grid-cols-2">
          {questions.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
