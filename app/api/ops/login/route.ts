import { NextResponse } from 'next/server';
import { equalSecret, sameOrigin, signValue } from '@/lib/maturity/security';
const attempts=new Map<string,{at:number;count:number}>();
export async function POST(request: Request) {
  if(!sameOrigin(request))return new NextResponse(null,{status:403});
  const secret=process.env.OPS_SECRET;if(!secret||secret.length<32)return new NextResponse('Operations access is not configured.',{status:503});
  const identity=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'unknown';const now=Date.now();const attempt=attempts.get(identity);if(attempt&&now-attempt.at<600000&&attempt.count>=5)return new NextResponse('Please try later.',{status:429});
  if(attempts.size>1000)for(const [key,value]of attempts)if(now-value.at>600000)attempts.delete(key);
  attempts.set(identity,{at:attempt&&now-attempt.at<600000?attempt.at:now,count:attempt&&now-attempt.at<600000?attempt.count+1:1});
  const form=await request.formData();if(!equalSecret(String(form.get('password')||''),secret))return new NextResponse('Access denied.',{status:401});
  const expires=String(Date.now()+8*3600000);const response=NextResponse.redirect(new URL('/ops',request.url),303);
  response.cookies.set('waveatlas-ops',`${expires}.${signValue(expires,secret)}`,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'strict',path:'/ops',maxAge:8*3600});return response;
}
