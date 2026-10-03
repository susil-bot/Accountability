import type { Metadata } from 'next';
import { BoardView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Clients' };

export default function Page() {
  return <BoardView />;
}
