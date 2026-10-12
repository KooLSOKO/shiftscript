// Simulated Firebase Auth; no live credentials or accounts.
export const shim = `
const callbacks = new Set();
const hydrate = value => value && ({...value, getIdToken: async () => value.uid});
const auth = { currentUser: hydrate(JSON.parse(localStorage.getItem('test-session') || 'null')) };
const persist = () => localStorage.setItem('test-session', JSON.stringify(auth.currentUser));
const notify = () => { persist(); callbacks.forEach(fn => fn(auth.currentUser)); };
export const getAuth = () => auth;
export class GoogleAuthProvider { setCustomParameters(parameters) { window.testGoogleParameters = parameters; } }
export async function signInWithPopup(_a, provider) {
  sessionStorage.setItem("test-popup-count",String(Number(sessionStorage.getItem("test-popup-count")||0)+1));
  const code = localStorage.getItem('test-google-error');
  if(code) throw Object.assign(new Error(),{code});
  const fresh = localStorage.getItem('test-google-new') === 'true';
  const u = fresh ? {uid:'google-new',email:'google-new@example.test',displayName:'Lerato Dlamini',emailVerified:true}
    : JSON.parse(localStorage.getItem('test-accounts') || '{}')['soko@example.test'];
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export async function signInWithRedirect() {
  const code=localStorage.getItem('test-google-start-error');
  if(code) throw Object.assign(new Error(),{code});
  sessionStorage.setItem('test-redirect-starts',String(Number(sessionStorage.getItem('test-redirect-starts')||0)+1));
  sessionStorage.setItem('test-redirect-user',localStorage.getItem('test-google-new')==='true'
    ? JSON.stringify({uid:'google-new',email:'google-new@example.test',displayName:'Lerato Dlamini',emailVerified:true})
    : JSON.stringify(JSON.parse(localStorage.getItem('test-accounts')||'{}')['soko@example.test']));
  location.replace(location.href);
  await new Promise(()=>{});
}
export async function getRedirectResult() {
  sessionStorage.setItem('test-return-count',String(Number(sessionStorage.getItem('test-return-count')||0)+1));
  await new Promise(resolve=>setTimeout(resolve,350));
  if(localStorage.getItem('test-google-timeout')==='true') await new Promise(()=>{});
  const code=localStorage.getItem('test-google-return-error');
  if(code) throw Object.assign(new Error(),{code});
  if(localStorage.getItem('test-google-cancel')==='true') return null;
  const u=JSON.parse(sessionStorage.getItem('test-redirect-user')||'null');
  sessionStorage.removeItem('test-redirect-user');
  if(!u) return null;
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export const onAuthStateChanged = (_a, fn) => { callbacks.add(fn); queueMicrotask(() => fn(auth.currentUser)); return () => callbacks.delete(fn); };
export async function createUserWithEmailAndPassword(_a, email, password) {
  const accounts = JSON.parse(localStorage.getItem('test-accounts') || '{}');
  if(accounts[email]) throw Object.assign(new Error(), {code:'auth/email-already-in-use'});
  const u = {uid:email.startsWith('transition')?'transition-new':email.startsWith('kopano')?'kopano':'soko',email,displayName:''};
  accounts[email]=u; localStorage.setItem('test-accounts',JSON.stringify(accounts));
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export async function updateProfile(u, profile) {
  Object.assign(u,profile); const accounts=JSON.parse(localStorage.getItem('test-accounts') || '{}');
  accounts[u.email]=u; localStorage.setItem('test-accounts',JSON.stringify(accounts)); persist();
}
export async function signInWithEmailAndPassword(_a,email,password) {
  const u=JSON.parse(localStorage.getItem('test-accounts') || '{}')[email];
  if(!u || password!=='test-pass-123') throw Object.assign(new Error(),{code:'auth/invalid-credential'});
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export async function signOut() { auth.currentUser=null; notify(); }
export async function sendPasswordResetEmail() {}
export async function sendEmailVerification() {}
export async function reload(user) { Object.assign(user, JSON.parse(localStorage.getItem("test-session") || "{}")); }
`;
