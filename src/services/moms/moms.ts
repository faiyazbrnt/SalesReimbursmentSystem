import { v4 as uuidv4 } from 'uuid';
import { Mom, MomStatus, MinutesSource, UserRole } from '../../lib/db/serverTypes';
import { state } from '../../server/state';
import { canAccessMom } from '../../server/services/authorization';
import { isFinancialRecord } from '../../server/constants';
import { getOrCreateCompany } from '../../server/services/companyService';
import { getActiveDelegation } from '../../server/services/delegations';
import { validateRequiredCustomFields } from '../admin/fieldDefinitionsRouter';
import { sendEmail } from '../../server/services/notifications';
import { persistMom } from '../../lib/db/coreLoopRepo';

function findUser(userId: string | null) {
  if (!userId) return null;
  return state.users.find(u => u.id === userId || u.entra_object_id === userId || u.user_principal_name === userId) || null;
}

export function listMoms(userId: string | null) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  let relevantMoms: Mom[] = [];
  if (user.role === UserRole.ADMIN) {
    relevantMoms = state.moms;
  } else if (user.role === UserRole.CUSTODIAN) {
    relevantMoms = [];
  } else if (user.role === UserRole.REQUESTOR) {
    relevantMoms = state.moms.filter(m => m.requestor_id === user.id);
  } else if (user.role === UserRole.APPROVER) {
    relevantMoms = state.moms.filter(m => canAccessMom(user, m));
  }

  const enriched = relevantMoms.map(m => {
    const requestor = state.users.find(u => u.id === m.requestor_id);
    return {
      ...m,
      prepared_by: requestor ? requestor.name : (m.prepared_by || 'Unknown'),
      prepared_by_department: requestor ? requestor.department : undefined,
      prepared_by_job_title: requestor ? requestor.job_title : undefined,
      client_name: m.client || m.summary || 'Unknown Client',
    };
  });

  return { status: 200, body: enriched };
}

export function getMom(userId: string | null, momId: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  if (user.role === UserRole.CUSTODIAN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const mom = state.moms.find(m => m.id === momId);
  if (!mom) return { status: 404, body: { error: 'Minutes of Meeting not found' } };

  if (!canAccessMom(user, mom)) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const requestor = state.users.find(u => u.id === mom.requestor_id);
  const linkedClaim = mom.claim_id ? state.claims.find(c => c.id === mom.claim_id) : undefined;

  return {
    status: 200,
    body: {
      ...mom,
      requestor,
      prepared_by: requestor ? requestor.name : (mom.prepared_by || 'Unknown'),
      prepared_by_department: requestor ? requestor.department : undefined,
      prepared_by_job_title: requestor ? requestor.job_title : undefined,
      linkedClaim,
    },
  };
}

export async function createMom(userId: string | null, body: any) {
  const user = findUser(userId);
  if (!user || !user.reports_to) {
    return { status: 403, body: { error: 'Forbidden: You must have a designated manager (reports_to) to submit.' } };
  }

  if (body.minutes_source === MinutesSource.UPLOADED && body.status !== MomStatus.DRAFT && !body.file_url) {
    return { status: 400, body: { error: 'Upload an LOA or MOM attachment.' } };
  }

  const mom: Mom = {
    id: uuidv4(),
    requestor_id: user.id,
    document_type: body.document_type === 'LOA' ? 'LOA' : 'MoM',
    client: body.client || '',
    contact_person: body.contact_person || '',
    contact_person_email: body.contact_person_email || '',
    cc_client: Boolean(body.cc_client),
    meeting_date: body.meeting_date || new Date().toISOString().split('T')[0],
    meeting_time: body.meeting_time || '',
    location: body.location || '',
    purpose: body.purpose || '',
    discussion: body.discussion || '',
    agreements: body.agreements || '',
    action_items: body.action_items || '',
    prepared_by: user.name,
    prepared_by_department: user.department,
    prepared_by_job_title: user.job_title,
    file_url: body.file_url,
    file_name: body.file_name,
    status: body.status || MomStatus.DRAFT,
    created_at: new Date().toISOString(),
    minutes_source: body.minutes_source || MinutesSource.TEMPLATE,
    meeting_type: body.meeting_type || '',
    participants_internal: body.participants_internal || '',
    participants_external: body.participants_external || '',
    custom_fields: body.custom_fields || undefined,
  };

  await getOrCreateCompany(mom.client, user.id);
  state.moms.push(mom);
  try {
    await persistMom(mom);
  } catch (err) {
    console.error('[db] Could not persist new MOM to Postgres:', err);
  }
  return { status: 200, body: mom };
}

export async function updateMom(userId: string | null, momId: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const mom = state.moms.find(m => m.id === momId);
  if (!mom) return { status: 404, body: { error: 'MOM not found' } };

  if (user.role === UserRole.CUSTODIAN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if (user.role === UserRole.REQUESTOR && mom.requestor_id !== user.id) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if (user.role === UserRole.APPROVER && mom.requestor_id !== user.id) {
    const momOwner = state.users.find(u => u.id === mom.requestor_id);
    let authorized = !!momOwner && momOwner.reports_to === user.id;
    if (!authorized && momOwner?.reports_to) {
      const activeDelegation = getActiveDelegation(momOwner.reports_to);
      authorized = activeDelegation?.delegate_id === user.id;
    }
    if (!authorized) {
      return { status: 403, body: { error: 'Forbidden: not your direct report' } };
    }
  }

  if ((body.minutes_source ?? mom.minutes_source) === MinutesSource.UPLOADED && (body.status ?? mom.status) !== MomStatus.DRAFT && !(body.file_url ?? mom.file_url)) {
    return { status: 400, body: { error: 'Upload an LOA or MOM attachment.' } };
  }

  mom.client = body.client ?? mom.client;
  await getOrCreateCompany(mom.client, user.id);
  mom.contact_person = body.contact_person ?? mom.contact_person;
  mom.contact_person_email = body.contact_person_email ?? mom.contact_person_email;
  mom.cc_client = body.cc_client ?? mom.cc_client;
  mom.meeting_date = body.meeting_date ?? mom.meeting_date;
  mom.meeting_time = body.meeting_time ?? mom.meeting_time;
  mom.location = body.location ?? mom.location;
  mom.purpose = body.purpose ?? mom.purpose;
  mom.discussion = body.discussion ?? mom.discussion;
  mom.agreements = body.agreements ?? mom.agreements;
  mom.action_items = body.action_items ?? mom.action_items;
  mom.status = body.status ?? mom.status;
  mom.minutes_source = body.minutes_source ?? mom.minutes_source;
  mom.file_url = body.file_url ?? mom.file_url;
  mom.file_name = body.file_name ?? mom.file_name;
  mom.meeting_type = body.meeting_type ?? mom.meeting_type;
  mom.participants_internal = body.participants_internal ?? mom.participants_internal;
  mom.participants_external = body.participants_external ?? mom.participants_external;
  mom.custom_fields = body.custom_fields ?? mom.custom_fields;

  try {
    await persistMom(mom);
  } catch (err) {
    console.error('[db] Could not persist MOM changes to Postgres:', err);
  }
  return { status: 200, body: mom };
}

export async function sendMom(userId: string | null, momId: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const mom = state.moms.find(m => m.id === momId && m.requestor_id === user.id);
  if (!mom) return { status: 404, body: { error: 'MOM not found' } };

  const customFieldError = validateRequiredCustomFields('mom', mom.custom_fields);
  if (customFieldError) return { status: 400, body: { error: customFieldError } };

  mom.status = MomStatus.COMPLETED;

  const approverId = user.reports_to || '';
  const subject = `Meeting Summary - ${mom.client || 'Client'}`;
  const body = `Thank you for meeting with us on ${mom.meeting_date} regarding ${mom.purpose || 'our business discussion'}.

Discussion:
${mom.discussion || 'No discussion points added.'}

Agreements:
${mom.agreements || 'No agreements listed.'}

Action Items:
${mom.action_items || 'No action items listed.'}

Best regards,
${user.name}`;

  sendEmail(
    mom.contact_person_email || 'client@mgenesis.com',
    subject,
    body,
    approverId || undefined,
    { plain: true, recipientName: mom.contact_person || 'Valued Client', fromLabel: `${user.name} <${user.email}>` }
  );

  try {
    await persistMom(mom);
  } catch (err) {
    console.error('[db] Could not persist MOM changes to Postgres:', err);
  }
  return { status: 200, body: mom };
}
