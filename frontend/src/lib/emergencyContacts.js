// Static campus phonebook shown on the AlertNow "EMERGENCY CONTACTS"
// panel. Edit values here to update the panel without a backend deploy.
// `tel:` hrefs work on mobile dialers; on desktop they open FaceTime/Skype
// if installed. Numbers should include the country code so they dial
// internationally.
export const EMERGENCY_CONTACTS = [
  {
    key: 'security',
    label: 'Campus Security',
    phone: '+91 12345 67890',
    icon: 'shield',
  },
  {
    key: 'medical',
    label: 'Campus Medical Center',
    phone: '+91 12345 67891',
    icon: 'cross',
  },
  {
    key: 'fire',
    label: 'Fire Response Team',
    phone: '+91 12345 67892',
    icon: 'flame',
  },
  {
    key: 'office',
    label: 'Security Office',
    phone: '+91 12345 67893',
    icon: 'building',
  },
];

// Strip non-digit characters for the tel: href so dialers accept it.
export function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
