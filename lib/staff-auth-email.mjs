const DOMAIN = "pipeskool.app";
const LEGACY_DOMAIN = "staff.pipeskool.app";

function staffLocalPart(user) {
  return (user.auth_version || 1) > 1
    ? `staff-${user.id}-v${user.auth_version}`
    : `staff-${user.id}`;
}

export const idEmail = user => `${staffLocalPart(user)}@${DOMAIN}`;
export const legacyIdEmail = user => `${staffLocalPart(user)}@${LEGACY_DOMAIN}`;
export const legacyMobileEmail = mobile => `${String(mobile).trim()}@${LEGACY_DOMAIN}`;

export async function signUpStaffAccount(auth, user, password) {
  const email = idEmail(user);
  const { data, error } = await auth.signUp({ email, password });
  return { email, data, error };
}
