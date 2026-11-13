import { Button } from '../../../components/ui/Button';
import { Input, Select, Label } from '../../../components/ui/Input';
import { Card, CardContent } from '../../../components/ui/Card';
import { CompanyPicker, DynamicFieldRenderer } from '../../admin';
import { ContactPersonsField } from '../../moms';
import { DOCUMENT_TYPE_LABEL, MomDocumentType } from '../../../types';
import { useClaimWizard } from './useClaimWizard';

export function MomStep({ wizard }: { wizard: ReturnType<typeof useClaimWizard> }) {
  const {
    currentUser,
    documentType,
    setDocumentType,
    setShowMomPreview,
    momCore,
    setMomCore,
    companies,
    applyCompanyDefaults,
    contacts,
    setContacts,
    momData,
    setMomData,
    momErrors,
    setMomErrors,
    refresh,
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="requestor">Requestor</Label>
                <Input
                  id="requestor"
                  name="requestor"
                  readOnly
                  disabled
                  value={currentUser?.name || ''}
                  className="bg-surface-container-low text-on-surface-variant cursor-not-allowed"
                />
              </div>
              <div>
                <Label required htmlFor="claim-mom-client">Client / Company</Label>
                <CompanyPicker
                  id="claim-mom-client"
                  value={momCore.client}
                  companies={companies}
                  onSelectExisting={company => applyCompanyDefaults(company.name)}
                  onChangeText={name => setMomCore(p => ({ ...p, client: name }))}
                  onAddNew={() => refresh().catch(() => {})}
                  placeholder="Who did you meet with?"
                />
              </div>
              <div>
                <Label required>Purpose of Meeting</Label>
                <Input value={momCore.purpose} onChange={e => setMomCore(p => ({ ...p, purpose: e.target.value }))} placeholder="Why did you meet?" />
              </div>
              <div>
                <Label required>Date of Meeting</Label>
                <Input type="date" value={momCore.meetingDate} onChange={e => setMomCore(p => ({ ...p, meetingDate: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>Location of Meeting</Label>
                <Input value={momCore.location} onChange={e => setMomCore(p => ({ ...p, location: e.target.value }))} />
              </div>
            </div>
            <section className="pt-6 border-t border-outline-variant space-y-5">
              <div>
                <h5 className="font-headline-sm text-on-surface">Client contact</h5>
                <p className="text-body-sm text-outline mt-1">Who attended on behalf of the client?</p>
              </div>
              <ContactPersonsField contacts={contacts} onChange={setContacts} />
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
                excludeKeys={['contact_person_designation']}
              />
            </section>
            <section className="pt-6 border-t border-outline-variant space-y-5">
              <div>
                <h5 className="font-headline-sm text-on-surface">Full meeting record</h5>
                <p className="text-body-sm text-outline mt-1">Capture the discussion first, followed by clear owners and next steps.</p>
              </div>
              <div>
                <Label>Discussion</Label>
                <textarea
                  rows={6}
                  className="w-full bg-white border border-brand-field-border rounded-input px-4 py-2.5 text-body-base focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  value={momCore.discussion}
                  onChange={e => setMomCore(p => ({ ...p, discussion: e.target.value }))}
                />
              </div>
              <div>
                <Label>Action Items</Label>
                <textarea
                  rows={4}
                  className="w-full bg-white border border-brand-field-border rounded-input px-4 py-2.5 text-body-base focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  value={momCore.actionItems}
                  onChange={e => setMomCore(p => ({ ...p, actionItems: e.target.value }))}
                  placeholder="List owners, next steps, and target dates."
                />
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
