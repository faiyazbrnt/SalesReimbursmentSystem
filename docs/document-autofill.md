# MOM and LOA document autofill

## Current behavior

The LOA / MOM attachment is **optional** in Submit Claim and Minutes & Agreements. Uploads, manual entry, draft saves, and submission work without it.

If a **PDF** is attached, the form is autofilled from the **official MOM/LOA template** (one template, `Document Type` = MoM or LOA). Reading happens **in the browser**: no server, AI, OCR, or external service. Review the suggestions, correct mistakes, and select what to apply. Existing values are not selected for replacement. Applying results does not save, submit, approve, or send notifications.

Extraction order:

1. **Form fields (exact):** a filled fillable PDF is read by fixed field names using `pdf-lib`.
2. **Labelled text:** if the PDF was flattened ("Print to PDF"), `Label: value` lines are read with `pdfjs-dist` (core fields only: document type, client company, purpose, meeting date, location, category).
3. **Azure fallback (optional):** only if neither finds template data **and** the Azure settings below are set. Without Azure the user is told no template data was found and enters details manually.

Code: `src/features/moms/extraction/templateParser.ts`. Non-PDF files can still be attached but are only analyzed when Azure is configured.

## Template field contract

The template must use these exact AcroForm field names (see `templateParser.ts`):

| Group | Field names |
|---|---|
| Core | `document_type` (`MoM`/`LOA`), `client_company`, `purpose`, `meeting_date` (`YYYY-MM-DD`), `location` |
| Category | `category`, `category_other` (options come from the admin-configured MOM Category field) |
| Contacts (1–5) | `contact_N_name`, `contact_N_designation`, `contact_N_email` |
| Expenses (1–10, claims only) | `expense_N_date`, `_vendor`, `_amount`, `_category`, `_other_category`, `_business_purpose`, `_payment_method`, `_or_number`, `_tin_number` |
| Metadata | `template_id` = `srs-mom-loa`, `template_version` |

Rules: client company must match a recognized company (otherwise it is flagged for manual selection); unknown expense categories become Others; payment method must be Personal Card, Cash, or Bank Transfer; amounts are PHP numbers; invalid dates are flagged, never guessed. The PDF template file itself is produced separately.

# Optional Azure fallback

## Azure setup

1. In the company's Azure subscription, create an Azure OpenAI resource in a region supporting the Responses API and a model that accepts PDF/image input and structured outputs. A compatible GPT-4.1 deployment is suitable; confirm regional availability and quota before creating it.
2. Deploy the model and record the **deployment name**, resource endpoint, and resource API key. No Azure resource is created by this application.
3. Set these **server-only** environment variables in the runtime's secret settings. Do not prefix them with `NEXT_PUBLIC_`, commit keys, or put keys in browser settings:

   ```dotenv
   AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
   AZURE_OPENAI_API_KEY=YOUR-RESOURCE-KEY
   AZURE_OPENAI_DEPLOYMENT=YOUR-DEPLOYMENT-NAME
   ```

4. For local Docker, put the settings in the existing untracked `.env` and restart the app container. Both Compose files forward them at runtime. If using `.env.docker`, use `docker compose --env-file .env.docker ...` so Compose interpolation also uses that file. Vercel requires the same runtime secrets and a redeploy. Keep settings blank until ready.
5. Configure the existing Upstash rate-limit integration for deployment. Document extraction has a separate allowance of 10 requests per user per 15 minutes when Upstash is configured. Without Upstash, the existing rate-limit implementation does not enforce a distributed quota; configure Azure deployment quotas as well.
6. Verify with a representative, approved test MOM/LOA: text PDF, scanned PDF/image, and DOCX. Check company matching, dates, currency, contacts, classifications, and expenses. Confirm both forms can still be completed manually if Azure fails.

Resources: [Azure Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses), [structured outputs](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/structured-outputs).

## API and data handling

- `GET /api/moms/extract`: authenticated capability check, returns `{ "enabled": false }` until configured. Credentials are never returned.
- `POST /api/moms/extract`: authenticated multipart fields `file` and `context` (`mom` or `claim`). Custodians cannot use this endpoint. It returns validated field/expense suggestions, excerpts, and warnings. It does not write to the database or attachment storage.
- Missing configuration returns 503. Invalid files return 400/413. Provider failures return 502; analysis timeout returns 504. The client preserves the attachment and form values and supports a manual retry. Replacing/removing the file cancels analysis and ignores stale results.
- Analysis uses inline document data, `store: false`, and no Azure file-store upload. Operational logs contain no document contents, extracted values, or API keys. This does not override Azure service logging or the company's Azure retention policies.
- DOCX extraction is limited to 100,000 characters and 64MB declared ZIP expansion; output is limited to 50 expense rows. The provider request times out after 60 seconds. No automatic paid retries occur.
- Unknown companies require selection from the recognized directory; autofill never creates companies. Unknown expense categories become Others with their original category text. Non-PHP amounts are left for manual PHP entry, without currency conversion. Missing payment methods remain unset.
- Disable autofill by removing any one Azure setting and restarting/redeploying. No schema migration or data rollback is required.
