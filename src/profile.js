export const CLASS_COOKIE_NAME = 'all-class-selected-class';
const MAX_AGE = 365 * 24 * 60 * 60;
const cookiePath = () => new URL('./', document.baseURI).pathname;

export function readClassCookie() {
  try {
    const prefix = `${CLASS_COOKIE_NAME}=`;
    const value = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
    return value ? decodeURIComponent(value.slice(prefix.length)) : '';
  } catch { return ''; }
}

export function rememberClass(className) {
  try {
    document.cookie = `${CLASS_COOKIE_NAME}=${encodeURIComponent(className)}; Max-Age=${MAX_AGE}; Path=${cookiePath()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    return readClassCookie() === className;
  } catch { return false; }
}

export function forgetClass() {
  try {
    document.cookie = `${CLASS_COOKIE_NAME}=; Max-Age=0; Path=${cookiePath()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {}
}
