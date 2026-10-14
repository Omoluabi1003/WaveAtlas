import 'server-only';
import { cookies } from 'next/headers';
import { equalSecret, signValue } from './security';
export async function authorizedOps() {
  const secret=process.env.OPS_SECRET;if(!secret || secret.length < 32)return false;
  const cookie=(await cookies()).get('waveatlas-ops')?.value;
  if(!cookie)return false;const [expires, signature]=cookie.split('.');return Number(expires)>Date.now()&&equalSecret(signature||'',signValue(expires,secret));
}
