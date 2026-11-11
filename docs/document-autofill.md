# MOM and LOA document autofill

## Current behavior

Autofill is unavailable until **all three Azure settings are configured**. Uploads, manual entry, draft saves, and submission work independently. The official draft MOM template remains blank with its reminder.

When configured, selecting an attachment in Submit Claim or Minutes & Agreements automatically sends it for analysis. Review the extracted values, correct mistakes, and select the suggestions to apply. Existing values are not selected for replacement. In Submit Claim, selected expenses are appended to entered rows; an untouched initial placeholder is replaced. Applying results does not save, submit, approve, or send notifications. Receipts and normal filing validation still apply.

Supported: text/scanned PDF, JPG, PNG, WEBP, still GIF, and DOCX, up to 10MB. Legacy DOC remains attachment-only. DOCX text and tables are read using Mammoth; embedded pictures are not analyzed. Upload a PDF or image when pictures contain important details. Unreadable, password-protected, or excessively complex documents may require a clearer upload or manual entry.

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
