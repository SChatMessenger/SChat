import * as Contacts from 'expo-contacts/legacy';

export type DeviceContact = {
  id: string;
  name: string;
  phones: string[];
};

export async function ensurePermission(): Promise<boolean> {
  const cur = await Contacts.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Contacts.requestPermissionsAsync();
  return req.granted;
}

export async function readDeviceContacts(myDialCode: string): Promise<DeviceContact[]> {
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    pageSize: 2000,
  });
  const out: DeviceContact[] = [];
  for (const c of data) {
    const name = (c.name ?? '').trim();
    if (!c.phoneNumbers || c.phoneNumbers.length === 0) continue;
    const phones = new Set<string>();
    for (const p of c.phoneNumbers) {
      const raw = p.number ?? '';
      const e164 = normalizeToE164(raw, myDialCode);
      if (e164) phones.add(e164);
    }
    if (phones.size === 0) continue;
    out.push({
      id: c.id ?? `${name}|${Array.from(phones).join(',')}`,
      name: name || Array.from(phones)[0],
      phones: Array.from(phones),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function normalizeToE164(raw: string, myDialCode: string): string | null {
  const trimmed = raw.replace(/[^\d+]/g, '');
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  // Leading 00 international prefix.
  if (trimmed.startsWith('00')) {
    const digits = trimmed.slice(2);
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  // Assume the user's own country.
  const dial = myDialCode.startsWith('+') ? myDialCode : `+${myDialCode}`;
  const digits = trimmed;
  // Strip a leading 0 if the rest looks like a national number (common in IN/UK/etc).
  const cleaned = digits.startsWith('0') ? digits.slice(1) : digits;
  if (cleaned.length < 6 || cleaned.length > 15) return null;
  return `${dial}${cleaned}`;
}
