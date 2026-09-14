type ProfileCompletionUser = {
  name?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
};

export function getProfileDisplayName(user: ProfileCompletionUser | null | undefined) {
  return (user?.fullName || user?.name || "").trim();
}

export function isProfileComplete(user: ProfileCompletionUser | null | undefined) {
  const displayName = getProfileDisplayName(user);
  const phone = (user?.phoneNumber || "").trim();

  return displayName.length >= 2 && phone.length >= 6;
}

export function getProfileCompletionMissingFields(
  user: ProfileCompletionUser | null | undefined,
) {
  const missing: Array<"name" | "phoneNumber"> = [];
  if (getProfileDisplayName(user).length < 2) missing.push("name");
  if ((user?.phoneNumber || "").trim().length < 6) missing.push("phoneNumber");
  return missing;
}
