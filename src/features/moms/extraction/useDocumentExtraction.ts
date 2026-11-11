import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../../components/AppContext';
import { apiFetch, getCurrentUserId } from '../../../lib/api/client';
import type { DocumentSuggestions, ExtractionContext } from './model';
import { extractFromTemplatePdf, type TemplateContext } from './templateParser';

const NO_TEMPLATE_DATA = 'No official template data found in this file. Use the official MOM/LOA template PDF, or enter the details manually.';

export function useDocumentExtraction(file: File | null, context: ExtractionContext, userId: string) {
  const { companies, fieldDefinitions } = useAppContext();
  // Optional Azure fallback; the built-in template reader always works.
  const [capability, setCapability] = useState<{ userId: string; enabled: boolean } | null>(null);
  const azureEnabled = capability?.userId === userId ? capability.enabled : null;
  const [result, setResult] = useState<DocumentSuggestions | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'applied'>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const templateContext = useMemo<TemplateContext>(() => {
    const category = fieldDefinitions.find(field => field.entity === 'mom' && field.key === 'category' && field.active && field.input_type === 'dropdown');
    return {
      companies: companies.filter(company => !company.pendingReview).map(company => company.name),
      ...(category ? { category: { label: category.label, options: category.options || [], allowOther: Boolean(category.allow_other) } } : {}),
    };
  }, [companies, fieldDefinitions]);
  const contextRef = useRef(templateContext);
  contextRef.current = templateContext;

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
    if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf && azureEnabled === null) return; // wait for the capability check before deciding
    const abort = new AbortController();
    let active = true;
    controller.current = abort;
    setStatus('loading');
    const fail = (message: string) => { if (active) { setError(message); setStatus('error'); } };
    const callAzure = async () => {
      const timeout = window.setTimeout(() => abort.abort(), 65_000);
      try {
        if (/\.doc$/i.test(file.name)) return fail('DOC files can be attached manually. Use the official PDF template for autofill.');
        const body = new FormData();
        body.append('file', file);
        body.append('context', context);
        const response = await fetch('/api/moms/extract', { method: 'POST', body, headers: { 'X-User-Id': getCurrentUserId() }, signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Document analysis failed.');
        if (active && !abort.signal.aborted) { setResult(data); setStatus('ready'); }
      } catch (cause) {
        fail(abort.signal.aborted ? 'Analysis cancelled or timed out. Retry or enter the details manually.' : cause instanceof Error ? cause.message : 'Document analysis failed. Enter details manually or retry.');
      } finally { window.clearTimeout(timeout); }
    };
    (async () => {
      if (isPdf) {
        try {
          const local = await extractFromTemplatePdf(file, context, contextRef.current);
          if (!active || abort.signal.aborted) return;
          if (local) { setResult(local); setStatus('ready'); return; }
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : 'The PDF could not be read. Enter the details manually.');
        }
        if (azureEnabled === null) return; // effect re-runs once the capability check completes
      }
      if (azureEnabled) return callAzure();
      fail(isPdf ? NO_TEMPLATE_DATA : 'Autofill reads the official MOM/LOA template PDF. Attach that PDF or enter the details manually.');
    })();
    return () => { active = false; abort.abort(); };
  }, [file, azureEnabled, context, userId, attempt]);

  const cancel = () => {
    controller.current?.abort();
    setError('Analysis cancelled or timed out. Your attachment and form values are unchanged.');
    setStatus('error');
  };
  return { available: true as const, azureEnabled, result, status, error, cancel, retry: () => setAttempt(value => value + 1), applied: () => setStatus('applied') };
}
