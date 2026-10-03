import type { Metadata } from 'next';
import { InsightsView } from '@/features/insights';

export const metadata: Metadata = { title: 'Insights' };

export default function AnalyticsPage() {
  return <InsightsView />;
}
