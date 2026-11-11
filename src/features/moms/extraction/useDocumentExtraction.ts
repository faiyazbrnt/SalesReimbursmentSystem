import { useEffect, useRef, useState } from 'react';
import { apiFetch, getCurrentUserId } from '../../../lib/api/client';
import type { DocumentSuggestions, ExtractionContext } from './model';

export function useDocumentExtraction(file: File | null, context: ExtractionContext, userId: string) {
  const [capability, setCapability] = useState<{ userId: string; enabled: boolean } | null>(null);
  const available = capability?.userId === userId ? capability.enabled : null;
  const [result, setResult] = useState<DocumentSuggestions | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'applied'>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setCapability(null);
    apiFetch<{ enabled: boolean }>('/api/moms/extract', { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) setCapability({ userId, enabled: data.enabled }); })
      .catch(() => { if (!abort.signal.aborted) setCapability({ userId, enabled: false }); });
    return () => abort.abort();
  }, [userId]);

  useEffect(() => {
    setResult(null);
    setError('');
    setStatus('idle');
    if (!file || !available) return;
    if (/\.doc$/i.test(file.name)) {
      setError('DOC files can be attached manually. Use DOCX, PDF, or an image for autofill.');
      setStatus('error');
      return;
    }
    const abort = new AbortController();
    let active = true;
    controller.current = abort;
    setStatus('loading');
    const timeout = window.setTimeout(() => abort.abort(), 65_000);
    const body = new FormData();
    body.append('file', file);
    body.append('context', context);
    fetch('/api/moms/extract', { method: 'POST', body, headers: { 'X-User-Id': getCurrentUserId() }, signal: abort.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Document analysis failed.');
        if (active && !abort.signal.aborted) { setResult(data); setStatus('ready'); }
      })
      .catch(cause => {
        if (!active) return;
        setError(abort.signal.aborted ? 'Analysis cancelled or timed out. Retry or enter the details manually.' : cause instanceof Error ? cause.message : 'Document analysis failed. Enter details manually or retry.');
        setStatus('error');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); abort.abort(); };
  }, [file, available, context, userId, attempt]);

  const cancel = () => {
    controller.current?.abort();
    setError('Analysis cancelled or timed out. Your attachment and form values are unchanged.');
    setStatus('error');
  };
  return { available, result, status, error, cancel, retry: () => setAttempt(value => value + 1), applied: () => setStatus('applied') };
}
