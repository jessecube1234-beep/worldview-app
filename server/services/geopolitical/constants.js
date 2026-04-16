const LOCATION_MAP = [
  { names: ['ukraine', 'ukrainian', 'kyiv', 'kharkiv', 'zaporizhzhia', 'odesa', 'kherson', 'donbas', 'mariupol'], lat: 49.0, lon: 31.0, label: 'Ukraine' },
  { names: ['gaza', 'hamas', 'rafah', 'west bank', 'palestine', 'palestinian'], lat: 31.5, lon: 34.5, label: 'Gaza/Palestine' },
  { names: ['israel', 'israeli', 'netanyahu', 'idf', 'tel aviv'], lat: 31.8, lon: 35.0, label: 'Israel' },
  { names: ['russia', 'russian', 'moscow', 'kremlin', 'putin'], lat: 55.75, lon: 37.6, label: 'Russia' },
  { names: ['iran', 'iranian', 'tehran', 'irgc', 'revolutionary guard'], lat: 32.0, lon: 53.0, label: 'Iran' },
  { names: ['north korea', 'pyongyang', 'dprk', 'kim jong'], lat: 39.0, lon: 125.8, label: 'North Korea' },
  { names: ['taiwan strait'], lat: 24.0, lon: 119.5, label: 'Taiwan Strait' },
  { names: ['taiwan', 'taiwanese', 'taipei'], lat: 23.7, lon: 121.0, label: 'Taiwan' },
  { names: ['china', 'chinese', 'beijing', 'pla', 'xi jinping'], lat: 39.9, lon: 116.4, label: 'China' },
  { names: ['red sea', 'bab el-mandeb', 'suez'], lat: 14.5, lon: 41.0, label: 'Red Sea' },
  { names: ['yemen', 'yemeni', 'houthi', 'sanaa', 'aden'], lat: 15.5, lon: 48.0, label: 'Yemen' },
  { names: ['sudan', 'sudanese', 'khartoum', 'rsf', 'rapid support forces'], lat: 15.5, lon: 32.5, label: 'Sudan' },
  { names: ['syria', 'syrian', 'damascus', 'aleppo'], lat: 34.8, lon: 38.9, label: 'Syria' },
  { names: ['myanmar', 'burma', 'burmese', 'naypyidaw'], lat: 19.0, lon: 96.5, label: 'Myanmar' },
  { names: ['somalia', 'somali', 'mogadishu', 'al-shabaab', 'al shabaab'], lat: 5.5, lon: 46.0, label: 'Somalia' },
  { names: ['ethiopia', 'ethiopian', 'tigray', 'addis ababa'], lat: 9.0, lon: 40.0, label: 'Ethiopia' },
  { names: ['mali', 'malian', 'bamako'], lat: 17.0, lon: -4.0, label: 'Mali' },
  { names: ['niger', 'nigerien', 'niamey'], lat: 17.0, lon: 8.0, label: 'Niger' },
  { names: ['burkina faso', 'ouagadougou'], lat: 12.5, lon: -1.5, label: 'Burkina Faso' },
  { names: ['congo', 'drc', 'kinshasa', 'democratic republic of congo'], lat: -4.3, lon: 15.3, label: 'DR Congo' },
  { names: ['libya', 'libyan', 'tripoli'], lat: 27.0, lon: 17.0, label: 'Libya' },
  { names: ['lebanon', 'lebanese', 'beirut', 'hezbollah'], lat: 33.9, lon: 35.5, label: 'Lebanon' },
  { names: ['iraq', 'iraqi', 'baghdad', 'mosul', 'erbil'], lat: 33.3, lon: 44.4, label: 'Iraq' },
  { names: ['afghanistan', 'afghan', 'kabul', 'taliban'], lat: 33.0, lon: 65.0, label: 'Afghanistan' },
  { names: ['pakistan', 'pakistani', 'islamabad'], lat: 30.0, lon: 70.0, label: 'Pakistan' },
  { names: ['south china sea', 'spratly', 'paracel'], lat: 12.0, lon: 114.0, label: 'South China Sea' },
  { names: ['haiti', 'haitian', 'port-au-prince'], lat: 19.0, lon: -72.5, label: 'Haiti' },
  { names: ['venezuela', 'venezuelan', 'caracas', 'maduro'], lat: 7.5, lon: -66.5, label: 'Venezuela' },
  { names: ['serbia', 'serbian', 'belgrade', 'kosovo'], lat: 44.0, lon: 21.0, label: 'Serbia/Kosovo' },
  { names: ['nagorno-karabakh', 'azerbaijan', 'armenia', 'yerevan', 'baku'], lat: 40.0, lon: 47.0, label: 'Caucasus' },
  { names: ['turkey', 'turkish', 'ankara', 'erdogan'], lat: 39.0, lon: 35.0, label: 'Turkey' },
  { names: ['philippines', 'philippine', 'manila', 'marcos'], lat: 13.0, lon: 122.0, label: 'Philippines' },
  { names: ['kashmir', 'india-pakistan'], lat: 34.0, lon: 74.0, label: 'Kashmir' },
  { names: ['india', 'indian', 'new delhi', 'modi'], lat: 20.0, lon: 77.0, label: 'India' },
  { names: ['saudi', 'riyadh'], lat: 24.7, lon: 46.7, label: 'Saudi Arabia' },
  { names: ['nato'], lat: 50.9, lon: 4.3, label: 'NATO' },
  { names: ['pentagon', 'us military', 'u.s. military', 'american forces'], lat: 38.9, lon: -77.0, label: 'United States' },
];

const HIGH_WORDS = ['killed', 'kills', 'dead', 'deaths', 'death toll', 'attack', 'attacked', 'bombing', 'bombed', 'airstrike', 'airstrikes', 'missile', 'missiles', 'invasion', 'invades', 'combat', 'offensive', 'casualties', 'explosion', 'strike', 'siege', 'massacre', 'murdered'];
const MED_WORDS = ['military', 'conflict', 'tension', 'nuclear', 'threat', 'threatens', 'sanctions', 'weapons', 'escalat', 'warning', 'hostil', 'ceasefire', 'war', 'troops', 'forces', 'fighting', 'captured', 'detain', 'unrest', 'crisis', 'shelling', 'artillery', 'drone'];

const EVENT_TYPE_RULES = [
  { type: 'Airstrike/Bombing', words: ['airstrike', 'air strike', 'bombing', 'bombed'] },
  { type: 'Missile/Drone Strike', words: ['missile', 'drone'] },
  { type: 'Ground Combat', words: ['offensive', 'troops', 'forces', 'captured', 'siege', 'fighting', 'combat'] },
  { type: 'Naval/Shipping Security', words: ['red sea', 'shipping', 'maritime', 'strait', 'navy'] },
  { type: 'Civil Unrest/Protest', words: ['protest', 'riot', 'unrest'] },
  { type: 'Diplomatic/Sanctions', words: ['sanction', 'ceasefire', 'talks', 'summit', 'diplomat', 'negotiation'] },
  { type: 'Terror/Insurgency', words: ['isis', 'terror', 'militant', 'houthi', 'hamas', 'hezbollah', 'taliban'] },
];

const ACTOR_HINTS = [
  ['russia', 'Russia'],
  ['ukraine', 'Ukraine'],
  ['israel', 'Israel'],
  ['palestine', 'Palestinian groups'],
  ['hamas', 'Hamas'],
  ['iran', 'Iran'],
  ['houthi', 'Houthis'],
  ['china', 'China'],
  ['taiwan', 'Taiwan'],
  ['north korea', 'North Korea'],
  ['south korea', 'South Korea'],
  ['india', 'India'],
  ['pakistan', 'Pakistan'],
  ['nato', 'NATO'],
  ['u.s.', 'United States'],
  ['us military', 'United States'],
];

const GEO_SOURCES = {
  gdelt: { id: 'gdelt', name: 'GDELT', quality: 0.58 },
  bbc: { id: 'bbc', name: 'BBC RSS', quality: 0.85 },
  googlenews: { id: 'googlenews', name: 'Google News RSS', quality: 0.65 },
};

const FALLBACK_EVENTS_RAW = [
  { title: 'Ongoing Russia-Ukraine conflict', location: 'Ukraine', lat: 49.0, lon: 31.0, severity: 3, url: 'https://en.wikipedia.org/wiki/Russian_invasion_of_Ukraine', domain: 'wikipedia.org' },
  { title: 'Gaza conflict and humanitarian situation', location: 'Gaza/Palestine', lat: 31.5, lon: 34.5, severity: 3, url: 'https://en.wikipedia.org/wiki/Gaza_war', domain: 'wikipedia.org' },
  { title: 'Houthi attacks on Red Sea shipping', location: 'Yemen', lat: 15.5, lon: 48.0, severity: 3, url: 'https://en.wikipedia.org/wiki/Red_Sea_crisis', domain: 'wikipedia.org' },
  { title: 'Taiwan Strait military tensions', location: 'Taiwan Strait', lat: 24.0, lon: 119.5, severity: 2, url: 'https://en.wikipedia.org/wiki/Cross-strait_relations', domain: 'wikipedia.org' },
  { title: 'North Korea ballistic missile program', location: 'North Korea', lat: 39.0, lon: 125.8, severity: 2, url: 'https://en.wikipedia.org/wiki/North_Korea_and_weapons_of_mass_destruction', domain: 'wikipedia.org' },
  { title: 'Sudan civil war - RSF conflict', location: 'Sudan', lat: 15.5, lon: 32.5, severity: 3, url: 'https://en.wikipedia.org/wiki/Sudanese_civil_war_(2023%E2%80%93present)', domain: 'wikipedia.org' },
  { title: 'Iran nuclear program tensions', location: 'Iran', lat: 32.0, lon: 53.0, severity: 2, url: 'https://en.wikipedia.org/wiki/Nuclear_program_of_Iran', domain: 'wikipedia.org' },
  { title: 'South China Sea territorial disputes', location: 'South China Sea', lat: 12.0, lon: 114.0, severity: 2, url: 'https://en.wikipedia.org/wiki/Territorial_disputes_in_the_South_China_Sea', domain: 'wikipedia.org' },
  { title: 'Myanmar civil war - military junta', location: 'Myanmar', lat: 19.0, lon: 96.5, severity: 3, url: 'https://en.wikipedia.org/wiki/Myanmar_civil_war_(2021%E2%80%93present)', domain: 'wikipedia.org' },
  { title: 'Sahel instability - Mali/Burkina Faso', location: 'Mali', lat: 17.0, lon: -4.0, severity: 2, url: 'https://en.wikipedia.org/wiki/Insurgency_in_the_Sahel', domain: 'wikipedia.org' },
];

export {
  LOCATION_MAP,
  HIGH_WORDS,
  MED_WORDS,
  EVENT_TYPE_RULES,
  ACTOR_HINTS,
  GEO_SOURCES,
  FALLBACK_EVENTS_RAW,
};
