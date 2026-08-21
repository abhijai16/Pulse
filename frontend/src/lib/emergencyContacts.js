// Static campus phonebook shown on the AlertNow "EMERGENCY CONTACTS"
// panel. Edit values here to update the panel without a backend deploy.
// `tel:` hrefs work on mobile dialers; on desktop they open FaceTime/Skype
// if installed. Numbers should include the country code so they dial
// internationally.
export const EMERGENCY_CONTACTS = [
  {
    key: 'security',
    label: 'Campus Security',
    phone: '0674-2725113',
    icon: 'shield',
  },
  {
    key: 'medical',
    label: 'KIMS Hospital',
    phone: '0674-7111000',
    icon: 'cross',
  },
  {
    key: 'fire',
    label: 'Fire Response Team',
    phone: '7440070013 ',
    icon: 'flame',
  },
  {
    key: 'police',
    label: 'Women Helpline',
    phone: '8114380770',
    icon: 'building',
  },
];

// Strip non-digit characters for the tel: href so dialers accept it.
export function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
