// Public UI preference only. Never use this value as authorization.
const key = (account: string) => `avroqen:testnet:organization:${account}`;
export function savedOrganization(
  account: string,
  organizations: { id: string }[],
) {
  try {
    const id = localStorage.getItem(key(account));
    return organizations.some((org) => org.id === id) ? (id ?? "") : "";
  } catch {
    return "";
  }
}
export function saveOrganization(account: string, id: string) {
  try {
    localStorage.setItem(key(account), id);
    return true;
  } catch {
    return false;
  }
}
