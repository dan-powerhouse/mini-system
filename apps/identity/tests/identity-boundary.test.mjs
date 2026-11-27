import assert from 'node:assert/strict';
import test from 'node:test';
import {resumeAuthorizationId,pendingAuthorizationCookie,authorizationRoute} from '../lib/auth-flow.mjs';
import {safeIssuerRedirect} from '../lib/redirect.mjs';
test('resume only a bounded opaque authorization request',()=>{
 assert.equal(resumeAuthorizationId('request','fallback'),'request');
 assert.equal(resumeAuthorizationId(null,'fallback'),'fallback');
 assert.equal(resumeAuthorizationId('x'.repeat(513)),undefined);
 assert.equal(authorizationRoute('a&next=https://attacker.invalid'),'/oauth/consent?authorization_id=a%26next%3Dhttps%3A%2F%2Fattacker.invalid');
});
test('pending authorization cookie is short lived and httpOnly',()=>{
 const c=pendingAuthorizationCookie('request',{secure:true});
 assert.equal(c.options.maxAge,600);assert.equal(c.options.httpOnly,true);assert.equal(c.options.sameSite,'lax');assert.equal(c.options.secure,true);
});
test('only web and loopback issuer redirects are accepted',()=>{
 assert.equal(safeIssuerRedirect('https://example.invalid/callback?code=x'),'https://example.invalid/callback?code=x');
 assert.equal(safeIssuerRedirect('http://127.0.0.1:8080/callback'),'http://127.0.0.1:8080/callback');
 for(const value of ['javascript:alert(1)','http://attacker.invalid/callback','https://user:pass@example.invalid','//example.invalid','file:///tmp/x'])assert.throws(()=>safeIssuerRedirect(value));
});
