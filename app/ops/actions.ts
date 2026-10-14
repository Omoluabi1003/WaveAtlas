'use server';
import { revalidatePath } from 'next/cache';
import { authorizedOps } from '@/lib/maturity/ops-auth';
import { database } from '@/lib/maturity/server-data';
export async function reviewReport(form: FormData) {
  if (!await authorizedOps()) throw new Error('Operations authorization required');
  const id = String(form.get('reportId') || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid report');
  await database('station_reports', { id: `eq.${id}` }, { method: 'PATCH', body: JSON.stringify({ status: 'reviewed', updated_at: new Date().toISOString() }) });
  revalidatePath('/ops');
}
export async function aggregateReports() {
  if (!await authorizedOps()) throw new Error('Operations authorization required');
  await database('rpc/aggregate_station_reports', {}, { method: 'POST', body: '{}' });
  revalidatePath('/ops');
}
