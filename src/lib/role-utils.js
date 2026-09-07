// App-level admin check, shared by route guards and navigation.
//
// The platform marks the app owner (and any invited admin) with the built-in
// `role === 'admin'`. App onboarding separately sets `user_role` to 'client' or
// 'editor' (Creator). An account that onboarded as a Client/Creator is a normal
// user for app-feature purposes — even if the platform role happens to be
// 'admin' (e.g. the app owner who onboarded as a Creator) — so admin pages and
// the Users nav item must stay hidden from them. A pure admin (invited as
// admin, never onboarded) has no `user_role` and retains full admin access.
export function isAppAdmin(user) {
  return !!user && user.role === 'admin' && !user.user_role;
}