import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NoteEditorView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Notes' };

export default function Page() {
  return (
    <Suspense>
      <NoteEditorView />
    </Suspense>
  );
}
