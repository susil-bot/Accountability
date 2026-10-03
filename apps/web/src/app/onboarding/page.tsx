import type { Metadata } from 'next';
import { Logo } from '@/components/ui/logo';
import { RequireSession, SkipOnboarding } from '@/features/auth';
import { GoalWizard } from '@/features/goals';

export const metadata: Metadata = { title: 'Get started' };

export default function OnboardingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
        <Logo href="/app/dashboard" />
        <SkipOnboarding />
      </header>
      <main id="main" className="px-5 pb-10 pt-2">
        <RequireSession requireOnboarded={false}>
          <GoalWizard mode="onboarding" />
        </RequireSession>
      </main>
    </div>
  );
}
