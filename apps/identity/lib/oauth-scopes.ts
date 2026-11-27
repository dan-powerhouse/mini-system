const scopeLabels: Record<string, string> = {
  openid: "Verify your identity",
  email: "View your email address",
  profile: "View your basic profile",
  phone: "View your phone number",
};

export function oauthScopeLabel(scope: string) {
  return Object.hasOwn(scopeLabels, scope) ? scopeLabels[scope] : scope;
}
