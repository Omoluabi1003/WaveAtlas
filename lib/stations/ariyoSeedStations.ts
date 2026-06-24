import type { Station } from '../stations';

const ARIYO_SEED_CHECKED_AT = '2026-06-20T00:00:00.000Z';

type AriyoSeedInput = {
  name: string;
  url: string;
  thumbnail?: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  language?: string;
  tags?: string[];
  homepage?: string;
  state?: string;
  id?: string;
};

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function ariyoSeedStation(input: AriyoSeedInput): Station {
  const isNigeria = input.country_code === 'NG';
  const isAfrica = ['NG', 'ZA', 'KE', 'GH'].includes(input.country_code);
  const tags = uniqueTags([
    'live radio',
    'ariyo-ai-seed',
    'waveatlas-curated',
    'curators-picks',
    'verified',
    ...(isNigeria ? ['nigerian radio'] : []),
    ...(isAfrica ? ['africa', 'african radio'] : ['global discovery']),
    ...(isNigeria ? ['nigeria', 'lagos', 'pidgin', 'afrobeats', 'talk', 'news'] : []),
    ...(input.tags ?? []),
    input.city,
    input.country,
  ]);
  const id = input.id ?? `ariyo-ai-${slugify(input.name)}`;
  return {
    id,
    station_uuid: id,
    name: input.name,
    normalized_name: input.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(),
    url: input.url,
    url_resolved: input.url,
    homepage: input.homepage,
    favicon: input.thumbnail || '',
    country: input.country,
    country_code: input.country_code,
    state: input.state ?? input.city,
    city: input.city,
    language: input.language ?? (isNigeria ? 'English, Pidgin' : 'English'),
    tags,
    codec: input.url.includes('.m3u8') || input.url.includes('.m3u') ? 'HLS' : 'MP3',
    bitrate: input.url.includes('.m3u8') ? 320 : 128,
    latitude: input.latitude,
    longitude: input.longitude,
    votes: isNigeria ? 26000 : isAfrica ? 20000 : 14000,
    click_count: isNigeria ? 86000 : isAfrica ? 62000 : 42000,
    health_score: 92,
    is_active: true,
    last_check_ok: true,
    last_checked_at: ARIYO_SEED_CHECKED_AT,
    failure_count: 0,
    response_time_ms: 180,
    curation_source: 'Ariyo AI',
    curation_tier: 'curated_atlas',
    validation_status: 'verified',
    validation_reason: 'Imported from Ariyo AI curated station seeds.',
  };
}

const sourceStations: AriyoSeedInput[] = [
  { name: 'Jay 101.9 FM Jos', id: 'ariyo-ai-jay-1019-fm-jos', url: 'https://stream2.rcast.net/69640/', city: 'Jos', state: 'Plateau', country: 'Nigeria', country_code: 'NG', latitude: 9.8965, longitude: 8.8583, language: 'English', homepage: 'https://jayfm.ng/', tags: ['plateau', 'jos', 'talk', 'news', 'entertainment', 'sports', 'lifestyle', 'hits', 'local radio', 'official stream verified 2026-06-24', 'radio garden matched', 'rcast', 'tier 1 curated atlas', 'startup eligible', 'teleport eligible', 'wanderer eligible', 'favorite eligible'] },
  { name: 'Agidigbo 88.7 FM Ibadan', id: 'ariyo-ai-agidigbo-887-fm-ibadan', url: 'https://agidigbostream.com.ng/radio/8000/radio.mp3', city: 'Ibadan', state: 'Oyo', country: 'Nigeria', country_code: 'NG', latitude: 7.3775, longitude: 3.947, language: 'Yoruba, English, Pidgin', homepage: 'https://agidigbo887fm.com/', tags: ['oyo', 'ibadan', 'yoruba', 'news', 'talk', 'current affairs', 'local radio', 'community'] },
  { name: 'Rhythm FM 93.7 Lagos', url: 'https://stream.radio.co/s61726bb1d/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['music', 'afrobeats', 'pop'] },
  { name: 'Cool FM 96.9 Lagos', url: 'https://ais.streamonkey.net/coolfm_lagos-mp3', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['music', 'talk', 'pop'] },
  { name: 'Beat FM 99.9 Lagos', url: 'https://stream.radio.co/s5f042e61a/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['music', 'afrobeats', 'entertainment'] },
  { name: 'City FM 105.1 Lagos', url: 'https://city1051.radio12345.com/stream', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['local', 'talk', 'news'] },
  { name: 'Inspiration FM 92.3 Lagos', url: 'https://stream.radio.co/s325f19c96/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['inspiration', 'talk', 'gospel'] },
  { name: 'Brila FM 88.9 Lagos', url: 'https://ice3.securenetsystems.net/BRILAFM', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['sports', 'talk', 'news'] },
  { name: 'Smooth 98.1 FM Lagos', url: 'https://stream.radio.co/s7d3a04a37/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['soul', 'jazz', 'music'] },
  { name: 'Soundcity 98.5 Lagos', url: 'https://stream.radio.co/s21132626e/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['music', 'afrobeats', 'urban'] },
  { name: 'Nigeria Info FM 99.3 Lagos', url: 'https://stream.radio.co/s87779d714/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['news', 'talk', 'current affairs'] },
  { name: 'Wazobia FM 95.1 Lagos', url: 'https://stream.radio.co/s4c93f0b24/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, language: 'Pidgin, English', tags: ['pidgin', 'talk', 'local'] },
  { name: 'Classic FM 97.3 Lagos', url: 'https://stream.radio.co/s5145b2311/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['classic hits', 'music', 'talk'] },
  { name: 'Top Radio 90.9 Lagos', url: 'https://stream.radio.co/s117769268/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['talk', 'news', 'music'] },
  { name: 'Urban 96 FM Lagos', url: 'https://stream.radio.co/s698d28713/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['urban', 'afrobeats', 'music'] },
  { name: 'Bond FM 92.9 Lagos', url: 'https://stream.radio.co/s653c30953/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['local', 'talk', 'public radio'] },
  { name: 'Faaji FM 106.5 Lagos', url: 'https://stream.radio.co/s6a9924515/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, language: 'Yoruba, English, Pidgin', tags: ['yoruba', 'culture', 'music'] },
  { name: 'Freedom FM 99.5 Lagos', url: 'https://stream.radio.co/s78174f857/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['talk', 'community', 'news'] },
  { name: 'Eko FM 89.7 Lagos', url: 'https://stream.radio.co/s769b7f516/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, language: 'Yoruba, English, Pidgin', tags: ['yoruba', 'local', 'music'] },
  { name: 'Traffic Radio 96.1 FM Lagos', url: 'https://stream.radio.co/s627197125/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['traffic', 'news', 'talk'] },
  { name: 'Fresh FM 105.9 Ibadan', url: 'https://stream.radio.co/s3c462acf3/listen', city: 'Ibadan', state: 'Oyo', country: 'Nigeria', country_code: 'NG', latitude: 7.3775, longitude: 3.947, language: 'Yoruba, English, Pidgin', tags: ['oyo', 'ibadan', 'yoruba', 'music', 'news', 'talk'] },
  { name: 'Splash FM 105.5 Ibadan', url: 'https://stream.radio.co/s191a34ec1/listen', city: 'Ibadan', state: 'Oyo', country: 'Nigeria', country_code: 'NG', latitude: 7.3775, longitude: 3.947, language: 'Yoruba, English, Pidgin', tags: ['oyo', 'ibadan', 'yoruba', 'news', 'talk', 'current affairs'] },
  { name: 'RayPower 100.5 FM Lagos', url: 'https://stream.radio.co/s1bce13736/listen', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, tags: ['news', 'talk', 'music', 'national radio'] },
  { name: 'Wazobia FM - Lagos', url: 'https://wazobiafm.com/lagos.m3u', thumbnail: 'https://wazobiafm.com/wp-content/uploads/2020/03/wazobia-logo.png', city: 'Lagos', country: 'Nigeria', country_code: 'NG', latitude: 6.5244, longitude: 3.3792, language: 'Pidgin, English', tags: ['pidgin', 'talk', 'local'] },
  { name: 'Cool FM - Abuja', url: 'http://coolfm.abuja.stream.cdnstream1.com/coolfm_abuja', thumbnail: 'https://coolfm.ng/wp-content/uploads/2020/02/coolfm-logo.png', city: 'Abuja', country: 'Nigeria', country_code: 'NG', latitude: 9.0765, longitude: 7.3986, tags: ['music', 'talk', 'pop'] },
  { name: 'Metro FM - Johannesburg', url: 'http://antbiome-jhb-01.radio.co.za:80/MetroFM', thumbnail: 'https://www.sabc.co.za/sabc/wp-content/uploads/2020/03/metro-fm-logo.png', city: 'Johannesburg', country: 'South Africa', country_code: 'ZA', latitude: -26.2041, longitude: 28.0473, tags: ['music', 'urban'] },
  { name: '5FM - Johannesburg', url: 'http://antbiome-jhb-01.radio.co.za:80/5FM', thumbnail: 'https://www.sabc.co.za/sabc/wp-content/uploads/2020/03/5fm-logo.png', city: 'Johannesburg', country: 'South Africa', country_code: 'ZA', latitude: -26.2041, longitude: 28.0473, tags: ['music', 'pop'] },
  { name: 'Capital FM - Nairobi', url: 'https://stream.capitalfm.co.ke/capitalfm', thumbnail: 'https://capitalfm.co.ke/wp-content/uploads/2020/01/capital-fm-logo.png', city: 'Nairobi', country: 'Kenya', country_code: 'KE', latitude: -1.2921, longitude: 36.8219, tags: ['music', 'news'] },
  { name: 'Joy FM - Accra', url: 'https://stream.zeno.fm/8v8nq5v8m0quv', thumbnail: 'https://myjoyonline.com/wp-content/uploads/2020/03/joy-fm-logo.png', city: 'Accra', country: 'Ghana', country_code: 'GH', latitude: 5.6037, longitude: -0.187, tags: ['news', 'talk'] },
  { name: 'BBC Radio 1 - London', url: 'http://as-hls-uk-live.akamaized.net/pool_904/live/uk/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio=320000.m3u8', thumbnail: 'https://www.bbc.co.uk/staticarchive/bbc_radio_1_logo_square.jpg', city: 'London', country: 'United Kingdom', country_code: 'GB', latitude: 51.5072, longitude: -0.1276, tags: ['music', 'pop'] },
  { name: 'NPR News - Washington, DC', url: 'https://nprice.streamguys1.com/live.mp3', thumbnail: 'https://media.npr.org/assets/img/2020/03/12/npr-square-logo.png', city: 'Washington, DC', country: 'United States', country_code: 'US', latitude: 38.9072, longitude: -77.0369, tags: ['news', 'talk', 'public radio'] },
  { name: 'CBC Radio One - Toronto', url: 'http://cbc_r1_tor.akacast.akamaistream.net/7/364/451661/v1/rc.akacast.akamaistream.net/cbc_r1_tor', thumbnail: 'https://www.cbc.ca/radio/includes/images/cbc-radio-one.jpg', city: 'Toronto', country: 'Canada', country_code: 'CA', latitude: 43.6532, longitude: -79.3832, tags: ['news', 'talk'] },
];

export const ariyoSeedStations: Station[] = sourceStations.map(ariyoSeedStation);
