// Accept only a redirect returned by the authenticated Supabase OAuth API.
// Web clients only in this candidate; native custom schemes require review.
/** @param {string} target */
export function safeIssuerRedirect(target) {
 const url=new URL(target);
 if(url.username||url.password)throw new Error('Invalid issuer redirect');
 if(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return url.href;
 throw new Error('Unsupported issuer redirect');
}
