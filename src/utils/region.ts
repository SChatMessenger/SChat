import { COUNTRIES, countryByDial, type Country } from './countries';

const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const CA_PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

// NANP area codes mapped to state/province ISO codes. Allocations only;
// numbers can be ported across regions so this is a best-guess origin.
const NANP_AREA_CODES: Record<string, string> = {
  // US
  '205': 'AL', '251': 'AL', '256': 'AL', '334': 'AL', '659': 'AL', '938': 'AL',
  '907': 'AK',
  '480': 'AZ', '520': 'AZ', '602': 'AZ', '623': 'AZ', '928': 'AZ',
  '479': 'AR', '501': 'AR', '870': 'AR',
  '209': 'CA', '213': 'CA', '279': 'CA', '310': 'CA', '323': 'CA', '408': 'CA',
  '415': 'CA', '424': 'CA', '442': 'CA', '510': 'CA', '530': 'CA', '559': 'CA',
  '562': 'CA', '619': 'CA', '626': 'CA', '628': 'CA', '650': 'CA', '657': 'CA',
  '661': 'CA', '669': 'CA', '707': 'CA', '714': 'CA', '747': 'CA', '760': 'CA',
  '805': 'CA', '818': 'CA', '820': 'CA', '831': 'CA', '858': 'CA', '909': 'CA',
  '916': 'CA', '925': 'CA', '949': 'CA', '951': 'CA',
  '303': 'CO', '719': 'CO', '720': 'CO', '970': 'CO', '983': 'CO',
  '203': 'CT', '475': 'CT', '860': 'CT', '959': 'CT',
  '302': 'DE',
  '202': 'DC', '771': 'DC',
  '239': 'FL', '305': 'FL', '321': 'FL', '352': 'FL', '386': 'FL', '407': 'FL',
  '561': 'FL', '727': 'FL', '754': 'FL', '772': 'FL', '786': 'FL', '813': 'FL',
  '850': 'FL', '863': 'FL', '904': 'FL', '941': 'FL', '954': 'FL',
  '229': 'GA', '404': 'GA', '470': 'GA', '478': 'GA', '678': 'GA', '706': 'GA',
  '762': 'GA', '770': 'GA', '912': 'GA',
  '808': 'HI',
  '208': 'ID', '986': 'ID',
  '217': 'IL', '224': 'IL', '309': 'IL', '312': 'IL', '331': 'IL', '447': 'IL',
  '618': 'IL', '630': 'IL', '708': 'IL', '730': 'IL', '773': 'IL', '779': 'IL',
  '815': 'IL', '847': 'IL', '872': 'IL',
  '219': 'IN', '260': 'IN', '317': 'IN', '463': 'IN', '574': 'IN', '765': 'IN',
  '812': 'IN', '930': 'IN',
  '319': 'IA', '515': 'IA', '563': 'IA', '641': 'IA', '712': 'IA',
  '316': 'KS', '620': 'KS', '785': 'KS', '913': 'KS',
  '270': 'KY', '364': 'KY', '502': 'KY', '606': 'KY', '859': 'KY',
  '225': 'LA', '318': 'LA', '337': 'LA', '504': 'LA', '985': 'LA',
  '207': 'ME',
  '240': 'MD', '301': 'MD', '410': 'MD', '443': 'MD', '667': 'MD',
  '339': 'MA', '351': 'MA', '413': 'MA', '508': 'MA', '617': 'MA', '774': 'MA',
  '781': 'MA', '857': 'MA', '978': 'MA',
  '231': 'MI', '248': 'MI', '269': 'MI', '313': 'MI', '517': 'MI', '586': 'MI',
  '616': 'MI', '734': 'MI', '810': 'MI', '906': 'MI', '947': 'MI', '989': 'MI',
  '218': 'MN', '320': 'MN', '507': 'MN', '612': 'MN', '651': 'MN', '763': 'MN', '952': 'MN',
  '228': 'MS', '601': 'MS', '662': 'MS', '769': 'MS',
  '314': 'MO', '417': 'MO', '573': 'MO', '636': 'MO', '660': 'MO', '816': 'MO',
  '406': 'MT',
  '308': 'NE', '402': 'NE', '531': 'NE',
  '702': 'NV', '725': 'NV', '775': 'NV',
  '603': 'NH',
  '201': 'NJ', '551': 'NJ', '609': 'NJ', '640': 'NJ', '732': 'NJ', '848': 'NJ',
  '856': 'NJ', '862': 'NJ', '908': 'NJ', '973': 'NJ',
  '505': 'NM', '575': 'NM',
  '212': 'NY', '315': 'NY', '332': 'NY', '347': 'NY', '363': 'NY', '516': 'NY',
  '518': 'NY', '585': 'NY', '607': 'NY', '631': 'NY', '646': 'NY', '680': 'NY',
  '716': 'NY', '718': 'NY', '838': 'NY', '845': 'NY', '914': 'NY', '917': 'NY',
  '929': 'NY', '934': 'NY',
  '252': 'NC', '336': 'NC', '704': 'NC', '743': 'NC', '828': 'NC', '910': 'NC',
  '919': 'NC', '980': 'NC', '984': 'NC',
  '701': 'ND',
  '216': 'OH', '220': 'OH', '234': 'OH', '283': 'OH', '326': 'OH', '330': 'OH',
  '380': 'OH', '419': 'OH', '440': 'OH', '513': 'OH', '567': 'OH', '614': 'OH',
  '740': 'OH', '937': 'OH',
  '405': 'OK', '539': 'OK', '572': 'OK', '580': 'OK', '918': 'OK',
  '458': 'OR', '503': 'OR', '541': 'OR', '971': 'OR',
  '215': 'PA', '223': 'PA', '267': 'PA', '272': 'PA', '412': 'PA', '445': 'PA',
  '484': 'PA', '570': 'PA', '582': 'PA', '610': 'PA', '717': 'PA', '724': 'PA',
  '814': 'PA', '878': 'PA',
  '401': 'RI',
  '803': 'SC', '839': 'SC', '843': 'SC', '854': 'SC', '864': 'SC',
  '605': 'SD',
  '423': 'TN', '615': 'TN', '629': 'TN', '731': 'TN', '865': 'TN', '901': 'TN', '931': 'TN',
  '210': 'TX', '214': 'TX', '254': 'TX', '281': 'TX', '325': 'TX', '346': 'TX',
  '361': 'TX', '409': 'TX', '430': 'TX', '432': 'TX', '469': 'TX', '512': 'TX',
  '682': 'TX', '713': 'TX', '726': 'TX', '737': 'TX', '806': 'TX', '817': 'TX',
  '830': 'TX', '832': 'TX', '903': 'TX', '915': 'TX', '936': 'TX', '940': 'TX',
  '945': 'TX', '956': 'TX', '972': 'TX', '979': 'TX',
  '385': 'UT', '435': 'UT', '801': 'UT',
  '802': 'VT',
  '276': 'VA', '434': 'VA', '540': 'VA', '571': 'VA', '703': 'VA', '757': 'VA',
  '804': 'VA', '826': 'VA', '948': 'VA',
  '206': 'WA', '253': 'WA', '360': 'WA', '425': 'WA', '509': 'WA', '564': 'WA',
  '304': 'WV', '681': 'WV',
  '262': 'WI', '274': 'WI', '414': 'WI', '534': 'WI', '608': 'WI', '715': 'WI', '920': 'WI',
  '307': 'WY',
  // Canada
  '587': 'AB', '403': 'AB', '780': 'AB', '825': 'AB', '368': 'AB',
  '236': 'BC', '250': 'BC', '604': 'BC', '672': 'BC', '778': 'BC',
  '204': 'MB', '431': 'MB', '584': 'MB',
  '506': 'NB', '428': 'NB',
  '709': 'NL', '879': 'NL',
  '902': 'NS', '782': 'NS',
  '867': 'NT',
  '226': 'ON', '249': 'ON', '289': 'ON', '343': 'ON', '365': 'ON', '382': 'ON',
  '387': 'ON', '416': 'ON', '437': 'ON', '519': 'ON', '548': 'ON', '613': 'ON',
  '647': 'ON', '683': 'ON', '705': 'ON', '742': 'ON', '753': 'ON', '807': 'ON',
  '905': 'ON',
  '418': 'QC', '438': 'QC', '450': 'QC', '468': 'QC', '514': 'QC', '579': 'QC',
  '581': 'QC', '819': 'QC', '873': 'QC',
  '306': 'SK', '474': 'SK', '639': 'SK',
};

// India: telecom-circle codes derived from the first 4 digits of the 10-digit
// mobile number (the operator's HLR/MSC prefix). Reflects the *original*
// allocation circle — numbers can be ported anywhere in India since 2011 MNP.
const IN_CIRCLE_NAMES: Record<string, { state: string; city?: string }> = {
  AP: { state: 'Andhra Pradesh' },
  AS: { state: 'Assam' },
  BR: { state: 'Bihar' },
  DL: { state: 'Delhi', city: 'Delhi' },
  GJ: { state: 'Gujarat' },
  HP: { state: 'Himachal Pradesh' },
  HR: { state: 'Haryana' },
  JK: { state: 'Jammu & Kashmir' },
  KA: { state: 'Karnataka' },
  KL: { state: 'Kerala' },
  KO: { state: 'West Bengal', city: 'Kolkata' },
  MH: { state: 'Maharashtra' },
  MP: { state: 'Madhya Pradesh' },
  MU: { state: 'Maharashtra', city: 'Mumbai' },
  NE: { state: 'North East India' },
  OR: { state: 'Odisha' },
  PB: { state: 'Punjab' },
  RJ: { state: 'Rajasthan' },
  TN: { state: 'Tamil Nadu' },
  TS: { state: 'Telangana' },
  UE: { state: 'Uttar Pradesh (East)' },
  UW: { state: 'Uttar Pradesh (West)' },
  WB: { state: 'West Bengal' },
};

// 4-digit prefix → circle code. Best-effort coverage of common Airtel/Vi/Jio/
// BSNL ranges; sparse for less-populated prefixes. Unknown prefixes fall back
// to country only.
const IN_PREFIX_TO_CIRCLE: Record<string, string> = {
  // Delhi / NCR
  '9810': 'DL', '9811': 'DL', '9812': 'HR', '9813': 'HR', '9818': 'DL',
  '9871': 'DL', '9899': 'DL', '9911': 'DL', '9999': 'DL', '7838': 'DL',
  '8800': 'DL', '8826': 'DL', '8447': 'DL', '9971': 'DL',
  // Mumbai
  '9820': 'MU', '9821': 'MU', '9869': 'MU', '9892': 'MU', '9819': 'MU',
  '9870': 'MU', '7045': 'MU', '7977': 'MU', '8104': 'MU', '9930': 'MU',
  '9967': 'MU',
  // Kolkata
  '9830': 'KO', '9831': 'KO', '9874': 'KO', '9836': 'KO', '9433': 'KO',
  '7044': 'KO', '8336': 'KO', '9007': 'KO',
  // Tamil Nadu (Chennai metro shares circle)
  '9840': 'TN', '9841': 'TN', '9884': 'TN', '9842': 'TN', '9994': 'TN',
  '9443': 'TN', '8870': 'TN', '7708': 'TN',
  // Karnataka
  '9845': 'KA', '9844': 'KA', '9886': 'KA', '9880': 'KA', '9900': 'KA',
  '9448': 'KA', '8861': 'KA', '7022': 'KA',
  // Kerala
  '9847': 'KL', '9846': 'KL', '9895': 'KL', '9447': 'KL', '9446': 'KL',
  '7034': 'KL', '8281': 'KL',
  // Andhra Pradesh + Telangana (split in 2014; older allocations are AP)
  '9849': 'TS', '9848': 'TS', '9885': 'TS', '9959': 'TS', '7799': 'TS',
  '9963': 'TS', '9059': 'AP', '8978': 'AP', '7036': 'AP',
  // Maharashtra (non-Mumbai)
  '9890': 'MH', '9822': 'MH', '9921': 'MH', '9970': 'MH', '9404': 'MH',
  '8888': 'MH', '7588': 'MH',
  // Gujarat
  '9825': 'GJ', '9824': 'GJ', '9879': 'GJ', '9426': 'GJ', '9427': 'GJ',
  '7383': 'GJ', '8000': 'GJ',
  // UP East
  '9839': 'UE', '9838': 'UE', '9415': 'UE', '9335': 'UE', '6398': 'UE',
  '8765': 'UE', '7800': 'UE',
  // UP West
  '9837': 'UW', '9897': 'UW', '9410': 'UW', '9457': 'UW', '8273': 'UW',
  // Punjab
  '9876': 'PB', '9815': 'PB', '9872': 'PB', '9888': 'PB', '8146': 'PB',
  '7888': 'PB',
  // Haryana
  '9416': 'HR', '9466': 'HR', '9050': 'HR', '8930': 'HR',
  // Rajasthan
  '9829': 'RJ', '9828': 'RJ', '9460': 'RJ', '9461': 'RJ', '7891': 'RJ',
  '8094': 'RJ',
  // Madhya Pradesh + Chhattisgarh
  '9826': 'MP', '9827': 'MP', '9425': 'MP', '9893': 'MP', '7771': 'MP',
  '8839': 'MP',
  // Bihar + Jharkhand
  '9835': 'BR', '9939': 'BR', '9934': 'BR', '7050': 'BR', '8298': 'BR',
  // West Bengal (non-Kolkata)
  '9832': 'WB', '9434': 'WB', '8927': 'WB', '7501': 'WB',
  // Odisha
  '9437': 'OR', '9438': 'OR', '9776': 'OR', '7077': 'OR',
  // Assam
  '9854': 'AS', '9864': 'AS', '7896': 'AS', '8723': 'AS',
  // North East
  '9856': 'NE', '9862': 'NE', '8729': 'NE',
  // Himachal Pradesh
  '9805': 'HP', '9418': 'HP', '8894': 'HP',
  // Jammu & Kashmir
  '9858': 'JK', '9419': 'JK', '7006': 'JK',
};

export type DetectedRegion = {
  country: Country;
  stateCode: string | null;
  stateName: string | null;
  city: string | null;
};

export function regionFromPhone(dialCode: string, national: string): DetectedRegion {
  const country = countryByDial(dialCode);
  const digits = national.replace(/\D/g, '');

  if (dialCode === '+1' && digits.length >= 3) {
    const npa = digits.slice(0, 3);
    const code = NANP_AREA_CODES[npa];
    if (code) {
      const name = US_STATE_NAMES[code] ?? CA_PROVINCE_NAMES[code] ?? null;
      return { country, stateCode: code, stateName: name, city: null };
    }
  }

  if (dialCode === '+91' && digits.length >= 4) {
    const prefix = digits.slice(0, 4);
    const circleCode = IN_PREFIX_TO_CIRCLE[prefix];
    if (circleCode) {
      const meta = IN_CIRCLE_NAMES[circleCode];
      return {
        country,
        stateCode: circleCode,
        stateName: meta?.state ?? null,
        city: meta?.city ?? null,
      };
    }
  }

  return { country, stateCode: null, stateName: null, city: null };
}

export function formatRegion(r: DetectedRegion): string {
  const parts: string[] = [];
  if (r.city) parts.push(r.city);
  if (r.stateName) parts.push(r.stateName);
  parts.push(r.country.name);
  return parts.join(', ');
}

export { COUNTRIES };
