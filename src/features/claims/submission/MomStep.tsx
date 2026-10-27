import { MomAttachment } from '@/features/moms/components/MomAttachment';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Label } from '../../../components/ui/Input';
import { Card, CardContent } from '../../../components/ui/Card';
import { DynamicFieldRenderer } from '@/features/admin';
import { ContactPersonsField } from '@/features/moms';
import { DOCUMENT_TYPE_LABEL, MomDocumentType } from '../../../types';
import { useClaimWizard } from './useClaimWizard';

export function MomStep({ wizard }: { wizard: ReturnType<typeof useClaimWizard> }) {
  const {
    momAttachment, setMomAttachment,
    documentType,
    setDocumentType,
    setShowMomPreview,
    momCore,
    setMomCore,
    companies,
    applyCompanyDefaults,
    contacts,
    setContacts,
    clientEmails,
    emailError,
    setEmailError,
    emailDraft,
    setEmailDraft,
    addClientEmail,
    removeClientEmail,
    clientEmailInputRef,
    momData,
    setMomData,
    momErrors,
    setMomErrors,
  } = wizard;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <Card className="lg:col-span-12">
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h4 className="font-headline-md text-on-surface">{DOCUMENT_TYPE_LABEL[documentType]}</h4>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="gap-2 whitespace-nowrap" onClick={() => setShowMomPreview(true)} disabled={!momCore.client.trim()}>
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                Preview client copy
              </Button>
              <Select value={documentType} onChange={(e) => setDocumentType(e.target.value as MomDocumentType)} className="w-auto" aria-label="Document type">
                <option value="MoM">Minutes of Meeting</option>
                <option value="LOA">Letter of Agreement</option>
              </Select>
            </div>
          </div>

          <div className="space-y-6">
            <MomAttachment file={momAttachment} onChange={setMomAttachment} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label required htmlFor="claim-mom-client">Client / Company</Label>
                <Select id="claim-mom-client" required value={momCore.client} onChange={event => applyCompanyDefaults(event.target.value)}>
                  <option value="">Select a recognized client company</option>
                  {companies.filter(company => !company.pendingReview).map(company => <option key={company.id} value={company.name}>{company.name}</option>)}
                </Select>
                {companies.filter(company => !company.pendingReview).length === 0 && <p className="mt-1 text-sm text-outline">No recognized client companies. Ask an administrator to add one.</p>}
              </div>
              <div>
                <Label required>Purpose of Meeting</Label>
                <Input value={momCore.purpose} onChange={e => setMomCore(p => ({ ...p, purpose: e.target.value }))} placeholder="Why did you meet?" />
              </div>
              <div>
                <Label required>Date of Meeting</Label>
                <Input type="date" value={momCore.meetingDate} onChange={e => setMomCore(p => ({ ...p, meetingDate: e.target.value }))} />
              </div>
              <div>
                <Label>Location of Meeting</Label>
                <Input value={momCore.location} onChange={e => setMomCore(p => ({ ...p, location: e.target.value }))} />
              </div>
            </div>
            <section className="pt-6 border-t border-outline-variant space-y-5">
              <div>
                <h5 className="font-headline-sm text-on-surface">Client contact</h5>
                <p className="text-body-sm text-outline mt-1">Who attended on behalf of the client and where should updates be sent?</p>
              </div>
              <ContactPersonsField contacts={contacts} onChange={setContacts} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <div className="flex items-baseline justify-between">
                    <Label required={momCore.ccClient}>Client Email(s) — who gets status updates</Label>
                    {clientEmails.length > 0 && (
                      <span className="text-xs font-semibold text-primary">{clientEmails.length} added</span>
                    )}
                  </div>
                  <div className={`flex flex-wrap items-center gap-2 rounded-input border bg-white px-3 py-2 min-h-11 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary ${emailError || (momCore.ccClient && clientEmails.length === 0) ? 'border-tertiary' : 'border-brand-field-border'}`}>
                    {clientEmails.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 rounded-full bg-primary/8 text-primary px-2.5 py-1 text-xs font-semibold">
                        {email}
                        <button type="button" aria-label={`Remove ${email}`} onClick={() => removeClientEmail(email)} className="hover:text-on-surface">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </span>
                    ))}
                    <input
                      ref={clientEmailInputRef}
                      type="email"
                      className="flex-1 min-w-[160px] outline-none text-sm bg-transparent"
                      placeholder={clientEmails.length ? 'Add another email…' : 'name@client.com'}
                      value={emailDraft}
                      onChange={e => { setEmailDraft(e.target.value); if (emailError) setEmailError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addClientEmail(emailDraft);
                        } else if (e.key === 'Backspace' && !emailDraft && clientEmails.length) {
                          removeClientEmail(clientEmails[clientEmails.length - 1]);
                        }
                      }}
                      onBlur={() => emailDraft.trim() && addClientEmail(emailDraft)}
                    />
                    <button
                      type="button"
                      onClick={() => addClientEmail(emailDraft)}
                      disabled={!emailDraft.trim()}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-40 disabled:hover:bg-primary/10"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>Add
                    </button>
                  </div>
                  {emailError ? (
                    <p className="text-xs text-tertiary mt-1 font-semibold">{emailError}</p>
                  ) : (
                    <p className="text-xs text-outline mt-1">Type an address, then press Enter, comma, or Add. You can CC more than one client.</p>
                  )}
                </div>
              </div>
              <label className={`flex items-start gap-3 min-h-11 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${momCore.ccClient ? 'border-primary/40 bg-primary/8' : 'border-outline-variant bg-surface-container-low hover:border-primary/30'}`}>
                <input
                  type="checkbox"
                  checked={momCore.ccClient}
                  onChange={e => {
                    const checked = e.target.checked;
                    setMomCore(p => ({ ...p, ccClient: checked }));
                    if (checked && clientEmails.length === 0) window.setTimeout(() => clientEmailInputRef.current?.focus(), 0);
                  }}
                  className="h-4 w-4 mt-0.5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-body-sm font-semibold text-on-surface">
                    <span aria-hidden="true" className="material-symbols-outlined text-[17px] text-primary">priority_high</span>
                    CC client on claim status notifications
                  </span>
                  <span className="block text-xs text-outline mt-1">Important: enable this when the client should receive status updates. At least one client email becomes required.</span>
                </span>
              </label>
            </section>
            <section className="pt-6 border-t border-outline-variant space-y-5">
              <div>
                <h5 className="font-headline-sm text-on-surface">Meeting classification</h5>
                <p className="text-body-sm text-outline mt-1">Add the account and reporting details used to categorize this meeting.</p>
              </div>
              <DynamicFieldRenderer
                entity="mom"
                values={momData}
                onChange={(key, value) => {
                  setMomData(p => ({ ...p, [key]: value }));
                  if (momErrors[key] || (key.endsWith('_other') && momErrors[key.replace('_other', '')])) {
                    setMomErrors(p => {
                      const next = { ...p };
                      delete next[key];
                      if (key.endsWith('_other')) delete next[key.replace('_other', '')];
                      return next;
                    });
                  }
                }}
                errors={momErrors}
                excludeKeys={['contact_person_designation', 'type_of_account']}
              />
            </section>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
