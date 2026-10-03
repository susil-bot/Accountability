'use client';
import { useRef, useState } from 'react';
import { FileText, Link2, Paperclip, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Progress } from '@/components/ui/progress';
import type { Occurrence } from '@/lib/types';
import { useAddEvidence, useDeleteEvidence, useEvidence } from './api';
import { ACCEPT } from './image-compress';

type Mode = 'FILE' | 'URL' | 'TEXT';

export function EvidencePanel({ occ }: { occ: Occurrence }) {
  const list = useEvidence(occ.id);
  const add = useAddEvidence(occ.id);
  const remove = useDeleteEvidence(occ.id);
  const [mode, setMode] = useState<Mode>('FILE');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    setLocalError(null);
    if (mode === 'FILE') {
      const file = fileRef.current?.files?.[0];
      if (!file) return setLocalError('Choose a file first.');
      setProgress(0);
      add.mutate(
        { kind: 'FILE', file, description: text, onProgress: setProgress },
        { onSettled: () => setProgress(null), onSuccess: reset },
      );
    } else if (mode === 'URL') {
      if (!url.trim()) return setLocalError('Paste the link that shows your work.');
      add.mutate({ kind: 'URL', url: url.trim(), description: text }, { onSuccess: reset });
    } else {
      if (!text.trim()) return setLocalError('Describe what you did.');
      add.mutate({ kind: 'TEXT', description: text.trim() }, { onSuccess: reset });
    }
  };

  function reset() {
    setUrl('');
    setText('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const error = localError ?? (add.isError ? (add.error instanceof Error && !('code' in add.error) ? add.error.message : errorMessage(add.error)) : null);

  return (
    <div className="grid gap-3">
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-2">
          {list.data.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-lg border bg-card p-2 text-sm">
              {e.type === 'IMAGE' && e.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed URL; next/image optimisation is unavailable in static export
                <img src={e.thumbnailUrl} alt={e.description ?? 'Evidence photo'} width={48} height={48} loading="lazy" decoding="async" className="size-12 rounded-md object-cover" />
              ) : e.type === 'URL' ? (
                <Link2 className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                    {e.originalName ?? e.url}
                  </a>
                ) : (
                  e.description
                )}
              </span>
              {occ.editable && (
                <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Delete evidence" onClick={() => remove.mutate(e.id)}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {occ.editable && (
        <div className="grid gap-3 rounded-lg border border-dashed p-3">
          <Segmented<Mode>
            label="Evidence type"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'FILE', label: 'Photo / PDF' },
              { value: 'URL', label: 'Link' },
              { value: 'TEXT', label: 'Note' },
            ]}
          />
          {mode === 'FILE' && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
              <Paperclip className="size-4 text-muted-foreground" aria-hidden />
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1"
                aria-label="Evidence file (jpg, png, webp or pdf, up to 10 MB)"
              />
            </label>
          )}
          {mode === 'URL' && <Input type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Evidence link" />}
          <Textarea
            rows={2}
            className="min-h-16"
            placeholder={mode === 'TEXT' ? 'What did you do?' : 'Optional description'}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            aria-label="Evidence description"
          />
          {progress !== null && <Progress value={progress * 100} label="Upload progress" />}
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
          <Button variant="secondary" onClick={submit} loading={add.isPending}>
            Add evidence
          </Button>
          <p className="text-xs text-muted-foreground">Photos are resized on your device and location data is removed. Evidence is private to you and your mentor.</p>
        </div>
      )}
    </div>
  );
}
