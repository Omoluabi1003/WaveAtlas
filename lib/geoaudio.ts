import { ChannelType, geoAudioCapabilities, type Channel, type Queue } from './channel-framework';
import type { Station } from './stations';

export type GeoAudioTrack = { title: string; url: string; duration?: string; checksum?: string; contentHash?: string; repriseOfTrackId?: string; alternateVersionOfTrackId?: string; localAssetPath?: string; originalSunoUrl?: string; sunoManifestPath?: string; };
export type GeoAudioAlbum = { id: string; title: string; subtitle?: string; description?: string; artist: string; provider: string; producer: string; studio: string; city: string; state: string; country: string; countryCode: string; latitude: number; longitude: number; homepage?: string; coverArtUrl?: string; language?: string; region?: string; genre?: string; mood?: string; tracks: GeoAudioTrack[]; };
export type JourneyCatalogTrack = { journeyId: string; albumId: string; trackId: string; title: string; subtitle: string; description: string; audioUrl: string; sourceUrl: string; localAssetPath?: string; originalSunoUrl?: string; sunoManifestPath?: string; duration?: string; language: string; region: string; country: string; city: string; genre: string; mood: string; orderIndex: number; sourceAlbum: string; attribution: string; checksum?: string; contentHash?: string; repriseOfTrackId?: string; alternateVersionOfTrackId?: string; };
export type JourneyCatalogEntry = Omit<JourneyCatalogTrack, 'trackId' | 'audioUrl' | 'sourceUrl' | 'localAssetPath' | 'originalSunoUrl' | 'sunoManifestPath' | 'duration' | 'orderIndex' | 'checksum' | 'contentHash' | 'repriseOfTrackId' | 'alternateVersionOfTrackId'> & { tracks: JourneyCatalogTrack[]; coverArtUrl?: string; homepage?: string; };
export type GeoAudioCatalogValidationIssue = { severity: 'warning' | 'error'; journeyId: string; trackId?: string; message: string; };
export type GeoAudioCatalogAuditRow = { album: string; journey: string; journeyId: string; title: string; originalSunoUrl?: string; manifestPath?: string; finalAudioUrl: string; status: 'resolved' | 'unresolved' | 'not-suno'; sourceUrl: string; audioUrl: string; localAssetPath?: string; normalizedFilename: string; orderIndex: number; duplicateReason?: string; titleFilenameMatch: boolean; };

const GEOAUDIO_SEED_CHECKED_AT = '2026-07-01T00:00:00.000Z';
const ARIYO_AI_ORIGIN = 'https://omoluabi1003.github.io/Ariyo-AI';
const FLORIDA_ANCHOR = { city: 'Florida', state: 'Florida', country: 'United States', countryCode: 'US', latitude: 28.5383, longitude: -81.3792 };
const ariyoUrl = (path: string) => `${ARIYO_AI_ORIGIN}/${path.split('/').map(encodeURIComponent).join('/')}`;

const ARIYO_SUNO_MANIFEST_PATH = 'data/suno-manifest.json';
const ARIYO_SUNO_MANIFEST_URL = ariyoUrl(ARIYO_SUNO_MANIFEST_PATH);
const ARIYO_SUNO_URL_TO_LOCAL_ASSET: Record<string, string> = {
  'https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3': 'data/suno-assets/7578528b-34c1-492c-9e97-df93216f0cc2.mp3',
  'https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3': 'data/suno-assets/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3',
  'https://cdn1.suno.ai/017e178e-3478-485f-b844-aa72b327e2a6.mp3': 'data/suno-assets/017e178e-3478-485f-b844-aa72b327e2a6.mp3',
  'https://cdn1.suno.ai/b35932ed-2188-4780-a919-f5327317915b.mp3': 'data/suno-assets/b35932ed-2188-4780-a919-f5327317915b.mp3',
  'https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3': 'data/suno-assets/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3',
  'https://cdn1.suno.ai/4f81332a-d833-4dc9-9763-7db0dfde3610.mp3': 'data/suno-assets/4f81332a-d833-4dc9-9763-7db0dfde3610.mp3',
};

function sunoTrack(title: string, originalSunoUrl: keyof typeof ARIYO_SUNO_URL_TO_LOCAL_ASSET): GeoAudioTrack {
  const manifestPath = ARIYO_SUNO_URL_TO_LOCAL_ASSET[originalSunoUrl];
  return { title, url: ariyoUrl(manifestPath), localAssetPath: ariyoUrl(manifestPath), originalSunoUrl, sunoManifestPath: manifestPath };
}

export const ariyoGeoAudioAlbums: GeoAudioAlbum[] = [
  {
    id: 'ariyo-geoaudio-omoluabi-production-catalogue',
    title: 'Omoluabi Production Catalogue',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'A Very Good Bad Guy v3', url: ariyoUrl('A Very Good Bad Guy v3.mp3') },
      { title: 'A Wa Good Gan', url: ariyoUrl('A Wa Good Gan.mp3') },
      { title: 'Algorithm Of Life', url: ariyoUrl('Algorithm Of Life.mp3') },
      { title: 'Am grateful Lord', url: ariyoUrl('Am grateful Lord.mp3') },
      { title: 'As Far As Your Mind Can See', url: ariyoUrl('As Far As Your Mind Can See.mp3') },
      { title: 'Babygirl', url: ariyoUrl('Babygirl.mp3') },
      { title: 'Belong Wahala', url: ariyoUrl('Belong Wahala.mp3') },
      { title: 'Blood On The Lithium', url: ariyoUrl('Blood On The Lithium.mp3') },
      { title: 'Boda Yen', url: ariyoUrl('Boda Yen.mp3') },
      { title: 'Bread Crumb Effect', url: ariyoUrl('Bread Crumb Effect.mp3') },
      { title: 'Built Like This', url: ariyoUrl('Built Like This.mp3') },
      { title: 'Comfort Zone', url: ariyoUrl('Comfort Zone.mp3') },
      sunoTrack('Covenant Of Isolation', 'https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3'),
      { title: 'Dad Is Missing', url: ariyoUrl('Dad Is Missing.mp3') },
      { title: 'Dem Wan Shut Me Up', url: ariyoUrl('Dem Wan Shut Me Up.mp3') },
      { title: 'Destiny No Dey Wait', url: ariyoUrl('Destiny No Dey Wait.mp3') },
      { title: 'Detty December', url: ariyoUrl('Detty December.mp3') },
      { title: 'Detty Season', url: ariyoUrl('Detty Season.mp3') },
      { title: 'Different Phases', url: ariyoUrl('Different Phases.mp3') },
      { title: 'Does It Matter To Matter', url: ariyoUrl('Does It Matter To Matter.mp3') },
      { title: 'E Get Why', url: ariyoUrl('E Get Why.mp3') },
      { title: 'EFCC', url: ariyoUrl('EFCC.mp3') },
      { title: 'Echoes Of Ice', url: ariyoUrl('Echoes Of Ice.mp3') },
      { title: 'Emergency', url: ariyoUrl('Emergency.mp3') },
      { title: 'Envy', url: ariyoUrl('Envy.mp3') },
      { title: 'Face Of A Narcissist', url: ariyoUrl('Face Of A Narcissist.mp3') },
      { title: 'Famine Of Fathers', url: ariyoUrl('Famine Of Fathers.mp3') },
      { title: 'Film Trick Election', url: ariyoUrl('Film Trick Election.mp3') },
      { title: 'Forerunners Map', url: ariyoUrl('Forerunners Map.mp3') },
      { title: 'Freedom of Speech', url: ariyoUrl('Freedom of Speech.mp3') },
      { title: 'Game Of Thrones', url: ariyoUrl('Game Of Thrones.mp3') },
      { title: 'Gbamsolutely', url: ariyoUrl('Gbamsolutely.mp3') },
      { title: 'Gbas Gbos', url: ariyoUrl('Gbas Gbos.mp3') },
      { title: 'Ghostwriter', url: ariyoUrl('Ghostwriter.mp3') },
      { title: 'Give and Take (Reciprocity in love)', url: ariyoUrl('Give and Take (Reciprocity in love).mp3') },
      { title: 'Growth Comes With Goodbyes', url: ariyoUrl('Growth Comes With Goodbyes.mp3') },
      { title: 'Guilt Trip Trap', url: ariyoUrl('Guilt Trip Trap.mp3') },
      { title: 'Habatically', url: ariyoUrl('Habatically.mp3') },
      { title: 'Hail Mary', url: ariyoUrl('Hail Mary.mp3') },
      { title: 'Haters', url: ariyoUrl('Haters.mp3') },
      sunoTrack('Her Daughters Father', 'https://cdn1.suno.ai/b35932ed-2188-4780-a919-f5327317915b.mp3'),
      { title: 'Holy Vibes Only', url: ariyoUrl('Holy Vibes Only.mp3') },
      { title: 'Home Becomes Peace', url: ariyoUrl('Home Becomes Peace.mp3') },
      { title: 'Kindness (Remastered)', url: ariyoUrl('Kindness (Remastered).mp3') },
      { title: 'Locked Away', url: ariyoUrl('Locked Away.mp3') },
      { title: 'Matasa Ku Tashi', url: ariyoUrl('Matasa Ku Tashi.mp3') },
      { title: 'Mic No Be For Waist', url: ariyoUrl('Mic No Be For Waist.mp3') },
      { title: 'Midas Touch', url: ariyoUrl('Midas Touch.mp3') },
      { title: 'Midnight Maybe', url: ariyoUrl('Midnight Maybe.mp3') },
      sunoTrack('Moores Law', 'https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3'),
      { title: 'Multi choice palava', url: ariyoUrl('Multi choice palava.mp3') },
      { title: 'Mummy I Love You Ft. Steady', url: ariyoUrl('Mummy I Love You Ft. Steady.mp3') },
      { title: 'Na My Turn', url: ariyoUrl('Na My Turn.mp3') },
      { title: 'Na We Dey', url: ariyoUrl('Na We Dey.mp3') },
      { title: 'Naija Youth; Rise', url: ariyoUrl('Naija Youth; Rise.mp3') },
      { title: 'No Be My Story', url: ariyoUrl('No Be My Story.mp3') },
      { title: 'No Contact', url: ariyoUrl('No Contact.mp3') },
      { title: 'No Look Down', url: ariyoUrl('No Look Down.mp3') },
      { title: 'Normal No Mean Not Toxic', url: ariyoUrl('Normal No Mean Not Toxic.mp3') },
      { title: 'Ogoni Anthem (Remastered)', url: ariyoUrl('Ogoni Anthem (Remastered).mp3') },
      { title: 'Ogoni Anthem', url: ariyoUrl('Ogoni Anthem.mp3') },
      { title: 'Oil Money', url: ariyoUrl('Oil Money.mp3') },
      { title: 'Oluwa You Too Good', url: ariyoUrl('Oluwa You Too Good.mp3') },
      { title: 'Omoluabi', url: ariyoUrl('Omoluabi.mp3') },
      { title: 'One Position', url: ariyoUrl('One Position.mp3') },
      { title: 'Party No Go Stop (Instrumental)', url: ariyoUrl('Party No Go Stop (Instrumental).mp3') },
      { title: 'Party No Go Stop', url: ariyoUrl('Party No Go Stop.mp3') },
      sunoTrack('Pass The Baton', 'https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3'),
      { title: 'Pastor Or Hustler', url: ariyoUrl('Pastor Or Hustler.mp3') },
      { title: 'Pepper 4 Body', url: ariyoUrl('Pepper 4 Body.mp3') },
      { title: 'Pigeonhole Gbedu', url: ariyoUrl('Pigeonhole Gbedu.mp3') },
      { title: 'Queen Warrior', url: ariyoUrl('Queen Warrior.mp3') },
      { title: 'Raising Boys', url: ariyoUrl('Raising Boys.mp3') },
      { title: 'Rich Pauper', url: ariyoUrl('Rich Pauper.mp3') },
      { title: 'Run Di Settings', url: ariyoUrl('Run Di Settings.mp3') },
      { title: 'Same Ni', url: ariyoUrl('Same Ni.mp3') },
      { title: 'Senator Natasha’s Whisper', url: ariyoUrl('Senator Natasha’s Whisper.mp3') },
      { title: 'Sengemenge', url: ariyoUrl('Sengemenge.mp3') },
      { title: 'Shadows Teach The Light', url: ariyoUrl('Shadows Teach The Light.mp3') },
      { title: 'Sharing Formula', url: ariyoUrl('Sharing Formula.mp3') },
      { title: 'She Said No (Franca Viola Story)', url: ariyoUrl('She Said No (Franca Viola Story).mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-naija-hits',
    title: 'Naija Hits',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'Show Of Shame v3 (Remastered)', url: ariyoUrl('Show Of Shame v3 (Remastered).mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-kindness',
    title: 'Kindness',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('Kindness Cover Art.jpg'),
    tracks: [
      { title: 'A Very Good Bad Guy v3', url: ariyoUrl('A Very Good Bad Guy v3.mp3') },
      { title: 'Dem Wan Shut Me Up', url: ariyoUrl('Dem Wan Shut Me Up.mp3') },
      { title: 'EFCC', url: ariyoUrl('EFCC.mp3') },
      { title: 'Something Is About To Happen', url: ariyoUrl('Something Is About To Happen.mp3') },
      { title: 'Sowore', url: ariyoUrl('Sowore.mp3') },
      { title: 'Stand With Truth', url: ariyoUrl('Stand With Truth.mp3') },
      { title: 'Stir Am Well', url: ariyoUrl('Stir Am Well.mp3') },
      { title: 'Street Sense', url: ariyoUrl('Street Sense.mp3') },
      { title: 'Subsidy', url: ariyoUrl('Subsidy.mp3') },
      { title: 'Take The Risk', url: ariyoUrl('Take The Risk.mp3') },
      { title: 'Talk Wey Bend (Obfuscation)', url: ariyoUrl('Talk Wey Bend (Obfuscation).mp3') },
      sunoTrack('Tears Of Love', 'https://cdn1.suno.ai/017e178e-3478-485f-b844-aa72b327e2a6.mp3'),
      { title: 'The Distance', url: ariyoUrl('The Distance.mp3') },
      { title: 'TikTok', url: ariyoUrl('TikTok.mp3') },
      { title: 'Ubuntu', url: ariyoUrl('Ubuntu.mp3') },
      { title: 'Udo Don Cost', url: ariyoUrl('Udo Don Cost.mp3') },
      { title: 'VDM', url: ariyoUrl('VDM.mp3') },
      { title: 'Vex Money', url: ariyoUrl('Vex Money.mp3') },
      { title: 'Watchman', url: ariyoUrl('Watchman.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-street-sense',
    title: 'Street Sense',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('Street_Sense_Album_Cover.jpg'),
    tracks: [
      { title: 'Na We Dey', url: ariyoUrl('Na We Dey.mp3') },
      { title: 'Street Sense', url: ariyoUrl('Street Sense.mp3') },
      { title: 'We Are Not Doing That', url: ariyoUrl('We Are Not Doing That.mp3') },
      { title: 'Wisdom Moves', url: ariyoUrl('Wisdom Moves.mp3') },
      { title: 'Woman Who Hates Correction', url: ariyoUrl('Woman Who Hates Correction.mp3') },
      sunoTrack('Wonders Breeze', 'https://cdn1.suno.ai/4f81332a-d833-4dc9-9763-7db0dfde3610.mp3'),
      { title: 'Working on myself', url: ariyoUrl('Working on myself.mp3') },
      { title: 'as-far-as-your-mind-can-see', url: ariyoUrl('data/omoluabi/as-far-as-your-mind-can-see.mp3') },
      { title: 'boda-yen', url: ariyoUrl('data/omoluabi/boda-yen.mp3') },
      { title: 'comfort-zone', url: ariyoUrl('data/omoluabi/comfort-zone.mp3') },
      { title: 'dad-is-missing', url: ariyoUrl('data/omoluabi/dad-is-missing.mp3') },
      { title: 'detty-december', url: ariyoUrl('data/omoluabi/detty-december.mp3') },
      { title: 'detty-season', url: ariyoUrl('data/omoluabi/detty-season.mp3') },
      { title: 'different-phases', url: ariyoUrl('data/omoluabi/different-phases.mp3') },
      { title: 'face-of-a-narcissist', url: ariyoUrl('data/omoluabi/face-of-a-narcissist.mp3') },
      { title: 'famine-of-fathers', url: ariyoUrl('data/omoluabi/famine-of-fathers.mp3') },
      { title: 'growth-comes-with-goodbyes', url: ariyoUrl('data/omoluabi/growth-comes-with-goodbyes.mp3') },
      { title: 'guilt-trip-trap', url: ariyoUrl('data/omoluabi/guilt-trip-trap.mp3') },
      { title: 'home-becomes-peace', url: ariyoUrl('data/omoluabi/home-becomes-peace.mp3') },
      { title: 'matasa-ku-tashi', url: ariyoUrl('data/omoluabi/matasa-ku-tashi.mp3') },
      { title: 'midnight-maybe', url: ariyoUrl('data/omoluabi/midnight-maybe.mp3') },
      { title: 'mummy-i-love-you-ft-steady', url: ariyoUrl('data/omoluabi/mummy-i-love-you-ft-steady.mp3') },
      { title: 'one-position', url: ariyoUrl('data/omoluabi/one-position.mp3') },
      { title: 'pepper-4-body', url: ariyoUrl('data/omoluabi/pepper-4-body.mp3') },
      { title: 'run-di-settings', url: ariyoUrl('data/omoluabi/run-di-settings.mp3') },
      { title: 'shadows-teach-the-light', url: ariyoUrl('data/omoluabi/shadows-teach-the-light.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-officialpaulinspires',
    title: 'OfficialPaulInspires Spoken Word Series',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      sunoTrack('Covenant Of Isolation', 'https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3'),
      sunoTrack('Moores Law', 'https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3'),
      sunoTrack('Tears Of Love', 'https://cdn1.suno.ai/017e178e-3478-485f-b844-aa72b327e2a6.mp3'),
      sunoTrack('Her Daughters Father', 'https://cdn1.suno.ai/b35932ed-2188-4780-a919-f5327317915b.mp3'),
      sunoTrack('Pass The Baton', 'https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3'),
      { title: 'udo-don-cost', url: ariyoUrl('data/omoluabi/udo-don-cost.mp3') },
      { title: 'A Very Good Bad Guy v3', url: ariyoUrl('A Very Good Bad Guy v3.mp3') },
      { title: 'A Wa Good Gan', url: ariyoUrl('A Wa Good Gan.mp3') },
      { title: 'Algorithm Of Life', url: ariyoUrl('Algorithm Of Life.mp3') },
      { title: 'Am grateful Lord', url: ariyoUrl('Am grateful Lord.mp3') },
      { title: 'As Far As Your Mind Can See', url: ariyoUrl('As Far As Your Mind Can See.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-needs',
    title: 'Needs',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'Babygirl', url: ariyoUrl('Babygirl.mp3') },
      { title: 'Belong Wahala', url: ariyoUrl('Belong Wahala.mp3') },
      { title: 'Blood On The Lithium', url: ariyoUrl('Blood On The Lithium.mp3') },
      { title: 'Boda Yen', url: ariyoUrl('Boda Yen.mp3') },
      { title: 'Bread Crumb Effect', url: ariyoUrl('Bread Crumb Effect.mp3') },
      { title: 'Built Like This', url: ariyoUrl('Built Like This.mp3') },
      { title: 'Comfort Zone', url: ariyoUrl('Comfort Zone.mp3') },
      sunoTrack('Covenant Of Isolation', 'https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3'),
      { title: 'Dad Is Missing', url: ariyoUrl('Dad Is Missing.mp3') },
      { title: 'Dem Wan Shut Me Up', url: ariyoUrl('Dem Wan Shut Me Up.mp3') },
      { title: 'Destiny No Dey Wait', url: ariyoUrl('Destiny No Dey Wait.mp3') },
      { title: 'Detty December', url: ariyoUrl('Detty December.mp3') },
      { title: 'Detty Season', url: ariyoUrl('Detty Season.mp3') },
      { title: 'Different Phases', url: ariyoUrl('Different Phases.mp3') },
      { title: 'Does It Matter To Matter', url: ariyoUrl('Does It Matter To Matter.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-holy-vibes-only',
    title: 'Holy Vibes Only',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'E Get Why', url: ariyoUrl('E Get Why.mp3') },
      { title: 'EFCC', url: ariyoUrl('EFCC.mp3') },
      { title: 'Echoes Of Ice', url: ariyoUrl('Echoes Of Ice.mp3') },
      { title: 'Emergency', url: ariyoUrl('Emergency.mp3') },
      { title: 'Envy', url: ariyoUrl('Envy.mp3') },
      { title: 'Face Of A Narcissist', url: ariyoUrl('Face Of A Narcissist.mp3') },
      { title: 'Famine Of Fathers', url: ariyoUrl('Famine Of Fathers.mp3') },
      { title: 'Film Trick Election', url: ariyoUrl('Film Trick Election.mp3') },
      { title: 'Forerunners Map', url: ariyoUrl('Forerunners Map.mp3') },
      { title: 'Freedom of Speech', url: ariyoUrl('Freedom of Speech.mp3') },
      { title: 'Game Of Thrones', url: ariyoUrl('Game Of Thrones.mp3') },
      { title: 'Gbamsolutely', url: ariyoUrl('Gbamsolutely.mp3') },
      { title: 'Gbas Gbos', url: ariyoUrl('Gbas Gbos.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-terms-of-agreement',
    title: 'Terms Of Agreement',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'Ghostwriter', url: ariyoUrl('Ghostwriter.mp3') },
      { title: 'Give and Take (Reciprocity in love)', url: ariyoUrl('Give and Take (Reciprocity in love).mp3') },
      { title: 'Growth Comes With Goodbyes', url: ariyoUrl('Growth Comes With Goodbyes.mp3') },
      { title: 'Guilt Trip Trap', url: ariyoUrl('Guilt Trip Trap.mp3') },
      { title: 'Habatically', url: ariyoUrl('Habatically.mp3') },
      { title: 'Hail Mary', url: ariyoUrl('Hail Mary.mp3') },
      { title: 'Haters', url: ariyoUrl('Haters.mp3') },
      sunoTrack('Her Daughters Father', 'https://cdn1.suno.ai/b35932ed-2188-4780-a919-f5327317915b.mp3'),
      { title: 'Holy Vibes Only', url: ariyoUrl('Holy Vibes Only.mp3') },
      { title: 'Home Becomes Peace', url: ariyoUrl('Home Becomes Peace.mp3') },
      { title: 'Kindness (Remastered)', url: ariyoUrl('Kindness (Remastered).mp3') },
      { title: 'Locked Away', url: ariyoUrl('Locked Away.mp3') },
      { title: 'Matasa Ku Tashi', url: ariyoUrl('Matasa Ku Tashi.mp3') },
      { title: 'Mic No Be For Waist', url: ariyoUrl('Mic No Be For Waist.mp3') },
      { title: 'Midas Touch', url: ariyoUrl('Midas Touch.mp3') },
      { title: 'Midnight Maybe', url: ariyoUrl('Midnight Maybe.mp3') },
      sunoTrack('Moores Law', 'https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3'),
      { title: 'Multi choice palava', url: ariyoUrl('Multi choice palava.mp3') },
      { title: 'Mummy I Love You Ft. Steady', url: ariyoUrl('Mummy I Love You Ft. Steady.mp3') },
      { title: 'Na My Turn', url: ariyoUrl('Na My Turn.mp3') },
      { title: 'Na We Dey', url: ariyoUrl('Na We Dey.mp3') },
      { title: 'Naija Youth; Rise', url: ariyoUrl('Naija Youth; Rise.mp3') },
      { title: 'No Be My Story', url: ariyoUrl('No Be My Story.mp3') },
      { title: 'No Contact', url: ariyoUrl('No Contact.mp3') },
    ],
  },
  {
    id: 'ariyo-geoaudio-back2basics',
    title: 'Back2Basics',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: [
      { title: 'No Look Down', url: ariyoUrl('No Look Down.mp3') },
      { title: 'Normal No Mean Not Toxic', url: ariyoUrl('Normal No Mean Not Toxic.mp3') },
      { title: 'Ogoni Anthem (Remastered)', url: ariyoUrl('Ogoni Anthem (Remastered).mp3') },
      { title: 'Ogoni Anthem', url: ariyoUrl('Ogoni Anthem.mp3') },
      { title: 'Oil Money', url: ariyoUrl('Oil Money.mp3') },
      { title: 'Oluwa You Too Good', url: ariyoUrl('Oluwa You Too Good.mp3') },
      { title: 'Omoluabi', url: ariyoUrl('Omoluabi.mp3') },
      { title: 'One Position', url: ariyoUrl('One Position.mp3') },
      { title: 'Party No Go Stop (Instrumental)', url: ariyoUrl('Party No Go Stop (Instrumental).mp3') },
      { title: 'Party No Go Stop', url: ariyoUrl('Party No Go Stop.mp3') },
      sunoTrack('Pass The Baton', 'https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3'),
      { title: 'Pastor Or Hustler', url: ariyoUrl('Pastor Or Hustler.mp3') },
      { title: 'Pepper 4 Body', url: ariyoUrl('Pepper 4 Body.mp3') },
      { title: 'Pigeonhole Gbedu', url: ariyoUrl('Pigeonhole Gbedu.mp3') },
      { title: 'Queen Warrior', url: ariyoUrl('Queen Warrior.mp3') },
      { title: 'Raising Boys', url: ariyoUrl('Raising Boys.mp3') },
      { title: 'Rich Pauper', url: ariyoUrl('Rich Pauper.mp3') },
      { title: 'Run Di Settings', url: ariyoUrl('Run Di Settings.mp3') },
      { title: 'Same Ni', url: ariyoUrl('Same Ni.mp3') },
      { title: 'Senator Natasha’s Whisper', url: ariyoUrl('Senator Natasha’s Whisper.mp3') },
      { title: 'Sengemenge', url: ariyoUrl('Sengemenge.mp3') },
      { title: 'Shadows Teach The Light', url: ariyoUrl('Shadows Teach The Light.mp3') },
      { title: 'Sharing Formula', url: ariyoUrl('Sharing Formula.mp3') },
      { title: 'She Said No (Franca Viola Story)', url: ariyoUrl('She Said No (Franca Viola Story).mp3') },
      { title: 'Show Of Shame v3 (Remastered)', url: ariyoUrl('Show Of Shame v3 (Remastered).mp3') },
      { title: 'Something Is About To Happen', url: ariyoUrl('Something Is About To Happen.mp3') },
      { title: 'Sowore', url: ariyoUrl('Sowore.mp3') },
      { title: 'Stand With Truth', url: ariyoUrl('Stand With Truth.mp3') },
      { title: 'Stir Am Well', url: ariyoUrl('Stir Am Well.mp3') },
      { title: 'Street Sense', url: ariyoUrl('Street Sense.mp3') },
      { title: 'Subsidy', url: ariyoUrl('Subsidy.mp3') },
    ],
  },
];

function normalizeName(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleCaseToken(token: string) {
  const upper = new Set(['ai', 'efcc', 'vdm', 'us', 'uk']);
  const lower = token.toLowerCase();
  if (/^v\d+$/i.test(token)) return lower;
  if (upper.has(lower)) return lower.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function normalizeJourneyTrackTitle(rawTitle: string) {
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  const normalized = rawTitle
    .replace(/[_-]+/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s*([;:])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part, index, parts) => {
      const leading = part.match(/^\(+/)?.[0] ?? '';
      const trailing = part.match(/\)+$/)?.[0] ?? '';
      const core = part.slice(leading.length, part.length - trailing.length);
      const lower = core.toLowerCase();
      const cased = index > 0 && index < parts.length - 1 && minorWords.has(lower) ? lower : titleCaseToken(core);
      return `${leading}${cased}${trailing}`;
    })
    .join(' ')
    .replace(/\bFt\./g, 'ft.')
    .replace(/\bV(\d+)\b/g, 'v$1');
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
}

function audioUrlKey(url: string) {
  return decodeURIComponent(url.trim()).toLowerCase();
}

export function normalizedGeoAudioFilenameKey(url: string) {
  const pathname = url.split('?')[0].split('#')[0];
  const filename = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)).replace(/\.[a-z0-9]+$/i, '');
  return normalizeName(filename);
}

const SERVED_GEOAUDIO_LOCAL_ASSETS = new Set<string>([
  // Add public/geoaudio/ariyo/*.mp3 entries here only after the files are committed
  // and served by WaveAtlas. Unlisted synthetic paths must not become playback URLs.
]);

function inferredLocalAssetPathForTrack(track: GeoAudioTrack) {
  if (track.localAssetPath) return track.localAssetPath;
  const pathname = track.url.split('?')[0].split('#')[0];
  const filename = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));
  return `/geoaudio/ariyo/${filename}`;
}

function verifiedLocalAssetPathForTrack(track: GeoAudioTrack) {
  const localAssetPath = inferredLocalAssetPathForTrack(track);
  return localAssetPath && SERVED_GEOAUDIO_LOCAL_ASSETS.has(localAssetPath) ? localAssetPath : undefined;
}

function isAriyoGithubPagesUrl(url: string) {
  return url.startsWith(`${ARIYO_AI_ORIGIN}/`);
}

export function resolveGeoAudioPlaybackUrl(track: GeoAudioTrack) {
  const localAssetPath = verifiedLocalAssetPathForTrack(track);
  if (localAssetPath) return localAssetPath;
  if (/^https:\/\//i.test(track.url) && isAriyoGithubPagesUrl(track.url)) return track.url;
  return track.url;
}

function trackDedupKeys(track: GeoAudioTrack) {
  const verifiedLocalAssetPath = verifiedLocalAssetPathForTrack(track);
  return [
    track.url && `source:${audioUrlKey(track.url)}`,
    track.url && `source-file:${normalizedGeoAudioFilenameKey(track.url)}`,
    verifiedLocalAssetPath && `asset:${audioUrlKey(verifiedLocalAssetPath)}`,
    verifiedLocalAssetPath && `asset-file:${normalizedGeoAudioFilenameKey(verifiedLocalAssetPath)}`,
    track.originalSunoUrl && `suno:${audioUrlKey(track.originalSunoUrl)}`,
    track.checksum && `checksum:${track.checksum.toLowerCase()}`,
    track.contentHash && `hash:${track.contentHash.toLowerCase()}`,
  ].filter((key): key is string => Boolean(key));
}

function isIntentionalAlternate(track: Pick<GeoAudioTrack, 'title' | 'repriseOfTrackId' | 'alternateVersionOfTrackId'>) {
  const title = normalizeName(track.title);
  return Boolean(track.repriseOfTrackId || track.alternateVersionOfTrackId || /\b(reprise|remix|alternate|live|version|v\d+)\b/.test(title));
}

const DEFAULT_JOURNEY_GENRE = 'GeoAudio';
const DEFAULT_JOURNEY_MOOD = 'Curated';
const JOURNEY_ATTRIBUTION = 'Ariyo AI Studio / Omoluabi Productions, adapted for WaveAtlas GeoAudio.';

export function buildJourneyCatalog(albums: GeoAudioAlbum[] = ariyoGeoAudioAlbums): JourneyCatalogEntry[] {
  return albums.map((album) => {
    const journeyId = `${album.id}-journey`;
    const seen = new Set<string>();
    const tracks = album.tracks.reduce<JourneyCatalogTrack[]>((items, sourceTrack) => {
      const title = normalizeJourneyTrackTitle(sourceTrack.title);
      const keys = trackDedupKeys(sourceTrack);
      if (!isIntentionalAlternate(sourceTrack) && keys.some((key) => seen.has(key))) return items;
      keys.forEach((key) => seen.add(key));
      const orderIndex = items.length + 1;
      const trackId = `${album.id}-track-${orderIndex}`;
      const localAssetPath = verifiedLocalAssetPathForTrack(sourceTrack);
      const audioUrl = resolveGeoAudioPlaybackUrl(sourceTrack);
      items.push({
        journeyId,
        albumId: album.id,
        trackId,
        title,
        subtitle: album.subtitle ?? `${album.city}, ${album.country}`,
        description: album.description ?? `${album.title} is an Ariyo AI Studio GeoAudio journey curated for WaveAtlas playback.`,
        audioUrl,
        sourceUrl: sourceTrack.url,
        localAssetPath,
        originalSunoUrl: sourceTrack.originalSunoUrl,
        sunoManifestPath: sourceTrack.sunoManifestPath,
        duration: sourceTrack.duration,
        language: album.language ?? 'English',
        region: album.region ?? album.state,
        country: album.country,
        city: album.city,
        genre: album.genre ?? DEFAULT_JOURNEY_GENRE,
        mood: album.mood ?? DEFAULT_JOURNEY_MOOD,
        orderIndex,
        sourceAlbum: album.title,
        attribution: JOURNEY_ATTRIBUTION,
        checksum: sourceTrack.checksum,
        contentHash: sourceTrack.contentHash,
        repriseOfTrackId: sourceTrack.repriseOfTrackId,
        alternateVersionOfTrackId: sourceTrack.alternateVersionOfTrackId,
      });
      return items;
    }, []);
    return { journeyId, albumId: album.id, title: album.title, subtitle: album.subtitle ?? `${album.city}, ${album.country}`, description: album.description ?? `${album.title} is an Ariyo AI Studio GeoAudio journey curated for WaveAtlas playback.`, language: album.language ?? 'English', region: album.region ?? album.state, country: album.country, city: album.city, genre: album.genre ?? DEFAULT_JOURNEY_GENRE, mood: album.mood ?? DEFAULT_JOURNEY_MOOD, sourceAlbum: album.title, attribution: JOURNEY_ATTRIBUTION, tracks, coverArtUrl: album.coverArtUrl, homepage: album.homepage };
  });
}

function duplicateReasonForKey(key: string, existing: JourneyCatalogTrack) {
  const [kind] = key.split(':');
  return `duplicate ${kind} reference also used by ${existing.trackId}`;
}

export function auditGeoAudioCatalog(catalog: JourneyCatalogEntry[] = journeyCatalog): GeoAudioCatalogAuditRow[] {
  return catalog.flatMap((journey) => {
    const seen = new Map<string, JourneyCatalogTrack>();
    return journey.tracks.map((track) => {
      const dedupeKeys = [
        track.sourceUrl && `source:${audioUrlKey(track.sourceUrl)}`,
        track.sourceUrl && `source-file:${normalizedGeoAudioFilenameKey(track.sourceUrl)}`,
        track.localAssetPath && SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.localAssetPath) && `asset:${audioUrlKey(track.localAssetPath)}`,
        track.localAssetPath && SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.localAssetPath) && `asset-file:${normalizedGeoAudioFilenameKey(track.localAssetPath)}`,
        track.originalSunoUrl && `suno:${audioUrlKey(track.originalSunoUrl)}`,
        track.checksum && `checksum:${track.checksum.toLowerCase()}`,
        track.contentHash && `hash:${track.contentHash.toLowerCase()}`,
      ].filter((key): key is string => Boolean(key));
      const duplicateReason = dedupeKeys.map((key) => {
        const existing = seen.get(key);
        return existing && !isIntentionalAlternate(track) ? duplicateReasonForKey(key, existing) : undefined;
      }).find(Boolean);
      dedupeKeys.forEach((key) => {
        if (!seen.has(key)) seen.set(key, track);
      });
      const normalizedFilename = normalizedGeoAudioFilenameKey(track.sourceUrl);
      return { album: journey.sourceAlbum, journey: journey.title, journeyId: journey.journeyId, title: track.title, originalSunoUrl: track.originalSunoUrl, manifestPath: track.sunoManifestPath, finalAudioUrl: track.audioUrl, status: track.originalSunoUrl ? (track.sunoManifestPath ? 'resolved' : 'unresolved') : 'not-suno', sourceUrl: track.sourceUrl, audioUrl: track.audioUrl, localAssetPath: track.localAssetPath, normalizedFilename, orderIndex: track.orderIndex, duplicateReason, titleFilenameMatch: track.originalSunoUrl ? true : normalizeName(track.title) === normalizedFilename };
    });
  });
}

export function geoAudioCatalogMismatchReport(catalog: JourneyCatalogEntry[] = journeyCatalog) {
  return auditGeoAudioCatalog(catalog).filter((row) => !row.titleFilenameMatch);
}

export function validateJourneyCatalog(catalog: JourneyCatalogEntry[] = journeyCatalog) {
  const issues: GeoAudioCatalogValidationIssue[] = [];
  for (const journey of catalog) {
    const seen = new Map<string, JourneyCatalogTrack>();
    journey.tracks.forEach((track, index) => {
      if (track.orderIndex !== index + 1) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Expected orderIndex ${index + 1}, received ${track.orderIndex}.` });
      const canonicalTitle = normalizeJourneyTrackTitle(track.title);
      if (track.title !== canonicalTitle) issues.push({ severity: 'warning', journeyId: journey.journeyId, trackId: track.trackId, message: `Track title should be normalized as "${canonicalTitle}".` });
      if (!/^https?:\/\//i.test(track.audioUrl) && !track.audioUrl.startsWith('/')) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: 'Playback audioUrl must be an absolute HTTPS URL or a served WaveAtlas asset path.' });
      if (track.audioUrl.startsWith('/geoaudio/ariyo/') && !SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.audioUrl)) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Synthetic local playback path "${track.audioUrl}" is not a verified served WaveAtlas asset.` });
      if (track.localAssetPath && !track.localAssetPath.startsWith('/geoaudio/ariyo/') && !isAriyoGithubPagesUrl(track.localAssetPath)) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Broken local asset path "${track.localAssetPath}".` });
      if (track.originalSunoUrl) {
        const manifestPath = ARIYO_SUNO_URL_TO_LOCAL_ASSET[track.originalSunoUrl];
        if (!manifestPath) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Unresolved Suno URL "${track.originalSunoUrl}" is missing from ${ARIYO_SUNO_MANIFEST_URL}.` });
        else if (track.sunoManifestPath !== manifestPath || track.audioUrl !== ariyoUrl(manifestPath)) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Suno URL "${track.originalSunoUrl}" must play the exact manifest asset "${manifestPath}" from ${ARIYO_SUNO_MANIFEST_URL}.` });
      }

      const normalizedTitle = normalizeName(track.title);
      const normalizedSourceFilename = normalizedGeoAudioFilenameKey(track.sourceUrl);
      if (!track.originalSunoUrl && isAriyoGithubPagesUrl(track.sourceUrl) && normalizedTitle !== normalizedSourceFilename) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Track title "${track.title}" does not match source filename "${normalizedSourceFilename}".` });
      for (const key of [...new Set([
        track.sourceUrl && `source:${audioUrlKey(track.sourceUrl)}`,
        track.sourceUrl && `source-file:${normalizedGeoAudioFilenameKey(track.sourceUrl)}`,
        track.localAssetPath && SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.localAssetPath) && `asset:${audioUrlKey(track.localAssetPath)}`,
        track.localAssetPath && SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.localAssetPath) && `asset-file:${normalizedGeoAudioFilenameKey(track.localAssetPath)}`,
        track.originalSunoUrl && `suno:${audioUrlKey(track.originalSunoUrl)}`,
        track.checksum && `checksum:${track.checksum.toLowerCase()}`,
        track.contentHash && `hash:${track.contentHash.toLowerCase()}`,
      ].filter((value): value is string => Boolean(value)))]) {
        if (!key) continue;
        const existing = seen.get(key);
        if (existing && !isIntentionalAlternate(track)) issues.push({ severity: 'error', journeyId: journey.journeyId, trackId: track.trackId, message: `Duplicate ${key.split(':')[0]} reference also used by ${existing.trackId}.` });
        else seen.set(key, track);
      }
    });
  }
  return issues;
}


export type GeoAudioPlaybackValidationResult = { journeyId: string; trackId: string; audioUrl: string; ok: boolean; status?: number; error?: string; };

export async function validateJourneyPlaybackUrls(catalog: JourneyCatalogEntry[] = journeyCatalog, options: { fetchImpl?: typeof fetch; tracksPerJourney?: number } = {}): Promise<GeoAudioPlaybackValidationResult[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return catalog.flatMap((journey) => journey.tracks.slice(0, options.tracksPerJourney ?? 1).map((track) => ({ journeyId: journey.journeyId, trackId: track.trackId, audioUrl: track.audioUrl, ok: false, error: 'fetch is unavailable in this runtime' })));
  const tracksPerJourney = Math.max(1, options.tracksPerJourney ?? 1);
  const probes = catalog.flatMap((journey) => journey.tracks.slice(0, tracksPerJourney).map(async (track) => {
    try {
      if (track.audioUrl.startsWith('/')) {
        const ok = track.audioUrl.startsWith('/geoaudio/ariyo/') && SERVED_GEOAUDIO_LOCAL_ASSETS.has(track.audioUrl);
        return { journeyId: journey.journeyId, trackId: track.trackId, audioUrl: track.audioUrl, ok, error: ok ? undefined : 'local playback path is not listed as a verified served WaveAtlas asset' };
      }
      const response = await fetchImpl(track.audioUrl, { method: 'HEAD' });
      return { journeyId: journey.journeyId, trackId: track.trackId, audioUrl: track.audioUrl, ok: response.ok, status: response.status };
    } catch (error) {
      return { journeyId: journey.journeyId, trackId: track.trackId, audioUrl: track.audioUrl, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return Promise.all(probes);
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function ariyoQueueForAlbum(album: GeoAudioAlbum): Queue {
  const journey = journeyCatalog.find((entry) => entry.albumId === album.id) ?? buildJourneyCatalog([album])[0];
  return {
    id: journey.journeyId,
    label: 'Journey',
    items: journey.tracks.map((track) => ({ id: track.trackId, title: track.title, url: track.audioUrl, duration: track.duration, index: track.orderIndex - 1, playable: Boolean(track.audioUrl) })),
  };
}

function ariyoChannelForAlbum(album: GeoAudioAlbum): Channel {
  const queue = ariyoQueueForAlbum(album);
  const playable = queue.items.some((item) => item.playable);
  return {
    id: album.id,
    type: ChannelType.GEOAUDIO,
    title: album.title,
    provider: { id: 'omoluabi-productions', name: album.provider, producer: album.producer, studio: album.studio, homepage: album.homepage },
    queue,
    capabilities: geoAudioCapabilities(playable),
    unavailableReason: playable ? undefined : 'Ariyo GeoAudio album has no playable track URL.',
  };
}

export function adaptAriyoAlbumToGeoAudioChannel(album: GeoAudioAlbum): Station {
  const channel = ariyoChannelForAlbum(album);
  const firstPlayableTrack = channel.queue.items.find((track) => track.playable);
  const tags = uniqueTags([
    'geoaudio',
    'GeoAudio Channel',
    'Ariyo GeoAudio',
    'Ariyo AI Studio',
    'Omoluabi Productions',
    `provider: ${album.provider}`,
    `producer: ${album.producer}`,
    `studio: ${album.studio}`,
    album.title,
    album.artist,
    album.provider,
    album.producer,
    album.studio,
    album.city,
    album.state,
    album.country,
    ...channel.queue.items.map((track) => track.title),
  ]);

  return {
    id: album.id,
    station_uuid: album.id,
    name: `${album.title} GeoAudio Channel — ${album.studio}`,
    normalized_name: normalizeName(`${album.title} ${album.studio} ${album.provider} ${album.producer}`),
    url: firstPlayableTrack?.url ?? '',
    url_resolved: firstPlayableTrack?.url ?? '',
    homepage: album.homepage,
    favicon: '',
    country: album.country,
    country_code: album.countryCode,
    state: album.state,
    city: album.city,
    language: album.language ?? 'English',
    tags,
    codec: 'MP3',
    bitrate: 320,
    latitude: album.latitude,
    longitude: album.longitude,
    votes: 50000,
    click_count: 120000,
    health_score: 98,
    is_active: Boolean(firstPlayableTrack),
    last_check_ok: Boolean(firstPlayableTrack),
    last_checked_at: GEOAUDIO_SEED_CHECKED_AT,
    failure_count: 0,
    response_time_ms: 90,
    curation_source: 'waveatlas-geoaudio',
    curation_tier: 'curated_atlas',
    validation_status: firstPlayableTrack ? 'verified' : 'needs_review',
    validation_reason: firstPlayableTrack ? `Local WaveAtlas GeoAudio seed from Ariyo-AI data/albums.json. Provider/producer: ${album.provider}. Studio: ${album.studio}. Geographic anchor: ${album.city}, ${album.country}.` : 'Ariyo GeoAudio album has no playable track URL in Ariyo-AI data/albums.json.',
    sourceType: 'geoaudio',
    channelType: ChannelType.GEOAUDIO,
    channel,
    capabilities: channel.capabilities,
    geoAudio: {
      albumTitle: album.title,
      artist: album.artist,
      provider: album.provider,
      producer: album.producer,
      studio: album.studio,
      coverArtUrl: album.coverArtUrl,
      trackCount: channel.queue.items.length,
      queueId: channel.queue.id,
      queueLabel: channel.queue.label,
      highlightedQueueItemId: undefined,
      tracks: channel.queue.items.map(({ title, url, duration }) => ({ title, url, duration })),
    },
  };
}

export const journeyCatalog: JourneyCatalogEntry[] = buildJourneyCatalog();

const journeyCatalogIssues = validateJourneyCatalog(journeyCatalog);
if (journeyCatalogIssues.length && process.env.NODE_ENV !== 'production') {
  console.warn('[geoaudio] Journey catalog validation issues', journeyCatalogIssues);
}

export const ariyoGeoAudioChannels: Station[] = ariyoGeoAudioAlbums.map(adaptAriyoAlbumToGeoAudioChannel);
