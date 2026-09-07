// Single source of truth for where a user lands after authentication.
// visitor -> /explore · creator -> /creator/dashboard · client -> /client/dashboard
// Un-onboarded visitors are pulled to /onboarding by the Layout guard first.
export function getPostLoginPath(user) {
  const role = user?.user_role || 'visitor';
  if (role === 'client') return '/client/dashboard';
  if (role === 'creator') return '/creator/dashboard';
  return '/explore';
}