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
const GEOAUDIO_JOURNEYS_ENABLED = process.env.NEXT_PUBLIC_WAVEATLAS_GEOAUDIO_JOURNEYS === 'true';
const FLORIDA_ANCHOR = { city: 'Florida', state: 'Florida', country: 'United States', countryCode: 'US', latitude: 28.5383, longitude: -81.3792 };
const ariyoUrl = (path: string) => `${ARIYO_AI_ORIGIN}/${path.split('/').map(encodeURIComponent).join('/')}`;

const ARIYO_SUNO_MANIFEST_PATH = 'data/suno-manifest.json';
const ARIYO_SUNO_MANIFEST_URL = ariyoUrl(ARIYO_SUNO_MANIFEST_PATH);
// Mirrored from Ariyo AI data/suno-manifest.json. Suno-origin tracks must resolve by original URL only.
const ARIYO_SUNO_URL_TO_LOCAL_ASSET: Record<string, string> = {
  "https://cdn1.suno.ai/e8ab9c5b-b567-4e5e-8b26-4c33faff4307.mp3": "data/suno-assets/e8ab9c5b-b567-4e5e-8b26-4c33faff4307.mp3",
  "https://cdn1.suno.ai/8d4e57ee-c330-495e-a9d0-75a861a4420f.mp3": "data/suno-assets/8d4e57ee-c330-495e-a9d0-75a861a4420f.mp3",
  "https://cdn1.suno.ai/377a7311-7338-4a51-816a-96eacaef7bac.mp3": "data/suno-assets/377a7311-7338-4a51-816a-96eacaef7bac.mp3",
  "https://cdn1.suno.ai/1dcdb3cf-5397-41d0-b005-f79055bf5a56.mp3": "data/suno-assets/1dcdb3cf-5397-41d0-b005-f79055bf5a56.mp3",
  "https://cdn1.suno.ai/ab702e5a-f698-4e05-9463-499cbeccff67.mp3": "data/suno-assets/ab702e5a-f698-4e05-9463-499cbeccff67.mp3",
  "https://cdn1.suno.ai/4a173806-00d5-4528-be27-3f236df02c58.mp3": "data/suno-assets/4a173806-00d5-4528-be27-3f236df02c58.mp3",
  "https://cdn1.suno.ai/52e7e84c-205b-4439-9c59-7e21304ca168.mp3": "data/suno-assets/52e7e84c-205b-4439-9c59-7e21304ca168.mp3",
  "https://cdn1.suno.ai/e75f0166-5134-4538-b33d-4bbdf708e53e.mp3": "data/suno-assets/e75f0166-5134-4538-b33d-4bbdf708e53e.mp3",
  "https://cdn1.suno.ai/55a69d8b-c572-4280-84df-6226f574e92e.mp3": "data/suno-assets/55a69d8b-c572-4280-84df-6226f574e92e.mp3",
  "https://cdn1.suno.ai/97301c6c-bcad-411b-adce-02b9cfd071d8.mp3": "data/suno-assets/97301c6c-bcad-411b-adce-02b9cfd071d8.mp3",
  "https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3": "data/suno-assets/7578528b-34c1-492c-9e97-df93216f0cc2.mp3",
  "https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3": "data/suno-assets/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3",
  "https://cdn1.suno.ai/017e178e-3478-485f-b844-aa72b327e2a6.mp3": "data/suno-assets/017e178e-3478-485f-b844-aa72b327e2a6.mp3",
  "https://cdn1.suno.ai/b35932ed-2188-4780-a919-f5327317915b.mp3": "data/suno-assets/b35932ed-2188-4780-a919-f5327317915b.mp3",
  "https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3": "data/suno-assets/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3",
  "https://cdn1.suno.ai/4f81332a-d833-4dc9-9763-7db0dfde3610.mp3": "data/suno-assets/4f81332a-d833-4dc9-9763-7db0dfde3610.mp3",
  "https://cdn1.suno.ai/5c17dd10-1770-467a-947a-db773c72ec78.mp3": "data/suno-assets/5c17dd10-1770-467a-947a-db773c72ec78.mp3",
  "https://cdn1.suno.ai/fb1daddf-1de4-4164-bb9d-113f9639d732.mp3": "data/suno-assets/fb1daddf-1de4-4164-bb9d-113f9639d732.mp3",
  "https://cdn1.suno.ai/d3ec2b0a-6062-417f-a62c-4d746f7f4f57.mp3": "data/suno-assets/d3ec2b0a-6062-417f-a62c-4d746f7f4f57.mp3",
  "https://cdn1.suno.ai/d5669af3-5caf-49e2-aca4-47fbc73a6d25.mp3": "data/suno-assets/d5669af3-5caf-49e2-aca4-47fbc73a6d25.mp3",
  "https://cdn1.suno.ai/800b9280-4389-47f6-b20d-6aa7dd3298ad.mp3": "data/suno-assets/800b9280-4389-47f6-b20d-6aa7dd3298ad.mp3",
  "https://cdn1.suno.ai/160aa857-a65f-4f60-9217-6045b2091183.mp3": "data/suno-assets/160aa857-a65f-4f60-9217-6045b2091183.mp3",
  "https://cdn1.suno.ai/c6e3b4e8-964c-48dc-8187-3005865cb00a.mp3": "data/suno-assets/c6e3b4e8-964c-48dc-8187-3005865cb00a.mp3",
  "https://cdn1.suno.ai/a5a8c49a-6871-40b6-9054-36c81ed8be90.mp3": "data/suno-assets/a5a8c49a-6871-40b6-9054-36c81ed8be90.mp3",
  "https://cdn1.suno.ai/7356371a-b8f7-470a-87a3-dbe5c2916f72.mp3": "data/suno-assets/7356371a-b8f7-470a-87a3-dbe5c2916f72.mp3",
  "https://cdn1.suno.ai/5ad4f8bc-4cef-4ad4-b847-c4f1b8147445.mp3": "data/suno-assets/5ad4f8bc-4cef-4ad4-b847-c4f1b8147445.mp3",
  "https://cdn1.suno.ai/4423f194-f2b3-4aea-ae4d-ed9150de2477.mp3": "data/suno-assets/4423f194-f2b3-4aea-ae4d-ed9150de2477.mp3",
  "https://cdn1.suno.ai/312ec841-e3db-4cf4-9cf0-5a581e02322d.mp3": "data/suno-assets/312ec841-e3db-4cf4-9cf0-5a581e02322d.mp3",
  "https://cdn1.suno.ai/fb22a6b0-5bb8-49eb-b77c-529a9e170817.mp3": "data/suno-assets/fb22a6b0-5bb8-49eb-b77c-529a9e170817.mp3",
  "https://cdn1.suno.ai/ab26a763-cba1-4426-9bf0-8117d0602684.mp3": "data/suno-assets/ab26a763-cba1-4426-9bf0-8117d0602684.mp3",
  "https://cdn1.suno.ai/5ef5743f-4848-4d92-84c6-873d9b51958e.mp3": "data/suno-assets/5ef5743f-4848-4d92-84c6-873d9b51958e.mp3",
  "https://cdn1.suno.ai/5262fb23-fc38-404e-932b-e95de36effa8.mp3": "data/suno-assets/5262fb23-fc38-404e-932b-e95de36effa8.mp3",
  "https://cdn1.suno.ai/7a8b0fa8-fb18-4af8-9007-c2b54e2daa0b.mp3": "data/suno-assets/7a8b0fa8-fb18-4af8-9007-c2b54e2daa0b.mp3",
  "https://cdn1.suno.ai/5baa29da-81ce-4f7d-94cc-3b15e88055f5.mp3": "data/suno-assets/5baa29da-81ce-4f7d-94cc-3b15e88055f5.mp3",
  "https://cdn1.suno.ai/b618aae7-c7b0-4260-af4a-2f7d2e5e3b70.mp3": "data/suno-assets/b618aae7-c7b0-4260-af4a-2f7d2e5e3b70.mp3",
  "https://cdn1.suno.ai/204380c2-034e-441b-8bf3-ef4e361554c0.mp3": "data/suno-assets/204380c2-034e-441b-8bf3-ef4e361554c0.mp3",
  "https://cdn1.suno.ai/8e63cdab-2e25-4993-ad25-1d074224b0c2.mp3": "data/suno-assets/8e63cdab-2e25-4993-ad25-1d074224b0c2.mp3",
  "https://cdn1.suno.ai/22d01aa2-02bb-4c6a-917c-0cd1b1d28552.mp3": "data/suno-assets/22d01aa2-02bb-4c6a-917c-0cd1b1d28552.mp3",
  "https://cdn1.suno.ai/f0666a04-fab8-4c4f-bb75-56147c49feaa.mp3": "data/suno-assets/f0666a04-fab8-4c4f-bb75-56147c49feaa.mp3",
  "https://cdn1.suno.ai/d14755f5-381a-42c2-9cec-5a539d2937bf.mp3": "data/suno-assets/d14755f5-381a-42c2-9cec-5a539d2937bf.mp3",
  "https://cdn1.suno.ai/08a939af-4823-4054-bef6-1b8420857d9c.mp3": "data/suno-assets/08a939af-4823-4054-bef6-1b8420857d9c.mp3",
  "https://cdn1.suno.ai/57a24cc6-ab05-447a-91ab-008321e9fc6a.mp3": "data/suno-assets/57a24cc6-ab05-447a-91ab-008321e9fc6a.mp3",
  "https://cdn1.suno.ai/b8a32f06-edd8-475f-9e06-7f54fc84d571.mp3": "data/suno-assets/b8a32f06-edd8-475f-9e06-7f54fc84d571.mp3",
  "https://cdn1.suno.ai/c84b1a3e-b364-41d3-be5f-8e3b2273eb96.mp3": "data/suno-assets/c84b1a3e-b364-41d3-be5f-8e3b2273eb96.mp3",
  "https://cdn1.suno.ai/ce45202a-56e3-4d86-b185-3aa741aac131.mp3": "data/suno-assets/ce45202a-56e3-4d86-b185-3aa741aac131.mp3",
  "https://cdn1.suno.ai/d58c70e0-b330-4cda-8ee5-afd65f874d39.mp3": "data/suno-assets/d58c70e0-b330-4cda-8ee5-afd65f874d39.mp3",
  "https://cdn1.suno.ai/dbb44f28-64a1-49bb-bcbf-b5460c29ccd4.mp3": "data/suno-assets/dbb44f28-64a1-49bb-bcbf-b5460c29ccd4.mp3",
  "https://cdn1.suno.ai/19c15d58-c776-4f1c-9ef7-3bb7890b26bb.mp3": "data/suno-assets/19c15d58-c776-4f1c-9ef7-3bb7890b26bb.mp3",
  "https://cdn1.suno.ai/c6bb53b4-def2-4a68-bfaf-35f7f6dd7810.mp3": "data/suno-assets/c6bb53b4-def2-4a68-bfaf-35f7f6dd7810.mp3",
  "https://cdn1.suno.ai/53a2cbb3-7a29-4641-aca3-43ad0a1d8ae1.mp3": "data/suno-assets/53a2cbb3-7a29-4641-aca3-43ad0a1d8ae1.mp3",
  "https://cdn1.suno.ai/e70059ca-398f-481e-9a71-6338fcfb9a1d.mp3": "data/suno-assets/e70059ca-398f-481e-9a71-6338fcfb9a1d.mp3",
  "https://cdn1.suno.ai/c48de9b1-a68b-4889-b43b-243da2d54bc0.mp3": "data/suno-assets/c48de9b1-a68b-4889-b43b-243da2d54bc0.mp3",
  "https://cdn1.suno.ai/f7f72dd2-12cd-4568-b831-f745973fa063.mp3": "data/suno-assets/f7f72dd2-12cd-4568-b831-f745973fa063.mp3",
  "https://cdn1.suno.ai/473edd61-d1ba-4bad-8014-7302cd1a9b71.mp3": "data/suno-assets/473edd61-d1ba-4bad-8014-7302cd1a9b71.mp3",
  "https://cdn1.suno.ai/553eefd4-54ba-4b73-ba02-4df85bfb5bb0.mp3": "data/suno-assets/553eefd4-54ba-4b73-ba02-4df85bfb5bb0.mp3",
  "https://cdn1.suno.ai/6af3b681-f3e6-4e84-85c7-9a2ad5f14e44.mp3": "data/suno-assets/6af3b681-f3e6-4e84-85c7-9a2ad5f14e44.mp3",
  "https://cdn1.suno.ai/e9562054-31e2-4195-ab30-cbe2902193f8.mp3": "data/suno-assets/e9562054-31e2-4195-ab30-cbe2902193f8.mp3",
  "https://cdn1.suno.ai/81ba8cdd-bf24-492c-9504-b52b0a93fb39.mp3": "data/suno-assets/81ba8cdd-bf24-492c-9504-b52b0a93fb39.mp3",
  "https://cdn1.suno.ai/df20133e-8c32-48ec-b7d7-969aefef3478.mp3": "data/suno-assets/df20133e-8c32-48ec-b7d7-969aefef3478.mp3",
  "https://cdn1.suno.ai/9ce53c0b-5bb2-4ac7-aee7-050013396548.mp3": "data/suno-assets/9ce53c0b-5bb2-4ac7-aee7-050013396548.mp3",
  "https://cdn1.suno.ai/d010f7ec-5367-4d82-8243-8a515fcaf961.mp3": "data/suno-assets/d010f7ec-5367-4d82-8243-8a515fcaf961.mp3",
  "https://cdn1.suno.ai/8961b5ef-ca9b-4d0b-bce5-1bf065915db9.mp3": "data/suno-assets/8961b5ef-ca9b-4d0b-bce5-1bf065915db9.mp3",
  "https://cdn1.suno.ai/f76cf242-e031-4785-a4b5-209b615da414.mp3": "data/suno-assets/f76cf242-e031-4785-a4b5-209b615da414.mp3",
  "https://cdn1.suno.ai/db52c7ad-c0aa-4f69-ab66-c7a6740ff1e5.mp3": "data/suno-assets/db52c7ad-c0aa-4f69-ab66-c7a6740ff1e5.mp3",
};

function sunoTrack(title: string, originalSunoUrl: string): GeoAudioTrack {
  const manifestPath = ARIYO_SUNO_URL_TO_LOCAL_ASSET[originalSunoUrl];
  return { title, url: manifestPath ? ariyoUrl(manifestPath) : originalSunoUrl, localAssetPath: manifestPath ? ariyoUrl(manifestPath) : undefined, originalSunoUrl, sunoManifestPath: manifestPath };
}

// Generated from Ariyo AI scripts/omoluabi-catalogue.js and resolved exclusively through data/suno-manifest.json.
const ARIYO_AI_OMOLUABI_TRACKS: GeoAudioTrack[] = [
      sunoTrack("Mummy I love you ft. Steady", "https://cdn1.suno.ai/e8ab9c5b-b567-4e5e-8b26-4c33faff4307.mp3"),
      sunoTrack("Udo Don Cost", "https://cdn1.suno.ai/8d4e57ee-c330-495e-a9d0-75a861a4420f.mp3"),
      sunoTrack("Matasa Ku Tashi", "https://cdn1.suno.ai/377a7311-7338-4a51-816a-96eacaef7bac.mp3"),
      sunoTrack("Feelings Fi You ft. Steady", "https://cdn1.suno.ai/1dcdb3cf-5397-41d0-b005-f79055bf5a56.mp3"),
      sunoTrack("Face Of A Narcissist", "https://cdn1.suno.ai/4a173806-00d5-4528-be27-3f236df02c58.mp3"),
      sunoTrack("Growth Comes With Goodbyes", "https://cdn1.suno.ai/52e7e84c-205b-4439-9c59-7e21304ca168.mp3"),
      sunoTrack("Boda Yen", "https://cdn1.suno.ai/e75f0166-5134-4538-b33d-4bbdf708e53e.mp3"),
      sunoTrack("Different Phases", "https://cdn1.suno.ai/55a69d8b-c572-4280-84df-6226f574e92e.mp3"),
      sunoTrack("One Position", "https://cdn1.suno.ai/97301c6c-bcad-411b-adce-02b9cfd071d8.mp3"),
      sunoTrack("Perform My Life No More", "https://cdn1.suno.ai/fb22a6b0-5bb8-49eb-b77c-529a9e170817.mp3"),
      sunoTrack("When Help Rode In From Nowhere", "https://cdn1.suno.ai/4423f194-f2b3-4aea-ae4d-ed9150de2477.mp3"),
      sunoTrack("Freedom", "https://cdn1.suno.ai/312ec841-e3db-4cf4-9cf0-5a581e02322d.mp3"),
      sunoTrack("Home Becomes Peace", "https://cdn1.suno.ai/5ef5743f-4848-4d92-84c6-873d9b51958e.mp3"),
      sunoTrack("Pepper 4 Body", "https://cdn1.suno.ai/5262fb23-fc38-404e-932b-e95de36effa8.mp3"),
      sunoTrack("Dad is Missing", "https://cdn1.suno.ai/7a8b0fa8-fb18-4af8-9007-c2b54e2daa0b.mp3"),
      sunoTrack("Comfort Zone", "https://cdn1.suno.ai/5baa29da-81ce-4f7d-94cc-3b15e88055f5.mp3"),
      sunoTrack("Detty Season", "https://cdn1.suno.ai/b618aae7-c7b0-4260-af4a-2f7d2e5e3b70.mp3"),
      sunoTrack("Detty December", "https://cdn1.suno.ai/204380c2-034e-441b-8bf3-ef4e361554c0.mp3"),
      sunoTrack("Persecutory Paranoia", "https://cdn1.suno.ai/8e63cdab-2e25-4993-ad25-1d074224b0c2.mp3"),
      sunoTrack("Famine Of Fathers", "https://cdn1.suno.ai/22d01aa2-02bb-4c6a-917c-0cd1b1d28552.mp3"),
      sunoTrack("Guilt Trip Trap", "https://cdn1.suno.ai/f0666a04-fab8-4c4f-bb75-56147c49feaa.mp3"),
      sunoTrack("Watchman", "https://cdn1.suno.ai/5c17dd10-1770-467a-947a-db773c72ec78.mp3"),
      sunoTrack("\u1eccm\u1ecdl\u00fa\u00e0b\u00ed", "https://cdn1.suno.ai/fb1daddf-1de4-4164-bb9d-113f9639d732.mp3"),
      sunoTrack("Take The Risk", "https://cdn1.suno.ai/d3ec2b0a-6062-417f-a62c-4d746f7f4f57.mp3"),
      sunoTrack("Woman who Hates Correction", "https://cdn1.suno.ai/d14755f5-381a-42c2-9cec-5a539d2937bf.mp3"),
      sunoTrack("Home That Looks Safe", "https://cdn1.suno.ai/08a939af-4823-4054-bef6-1b8420857d9c.mp3"),
      sunoTrack("TikTok", "https://cdn1.suno.ai/d5669af3-5caf-49e2-aca4-47fbc73a6d25.mp3"),
      sunoTrack("Something Is About To Happen", "https://cdn1.suno.ai/800b9280-4389-47f6-b20d-6aa7dd3298ad.mp3"),
      sunoTrack("Haters", "https://cdn1.suno.ai/160aa857-a65f-4f60-9217-6045b2091183.mp3"),
      sunoTrack("Does It Matter To Matter", "https://cdn1.suno.ai/c6e3b4e8-964c-48dc-8187-3005865cb00a.mp3"),
      sunoTrack("Pastor or Hustler", "https://cdn1.suno.ai/a5a8c49a-6871-40b6-9054-36c81ed8be90.mp3"),
      sunoTrack("Fore-runner\u2019s Map", "https://cdn1.suno.ai/7356371a-b8f7-470a-87a3-dbe5c2916f72.mp3"),
      sunoTrack("No Look Down", "https://cdn1.suno.ai/5ad4f8bc-4cef-4ad4-b847-c4f1b8147445.mp3"),
      sunoTrack("Covenant Of Isolation", "https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3"),
      sunoTrack("Ghostwriter", "https://cdn1.suno.ai/57a24cc6-ab05-447a-91ab-008321e9fc6a.mp3"),
      sunoTrack("She Said No (Franca Viola Story)", "https://cdn1.suno.ai/b8a32f06-edd8-475f-9e06-7f54fc84d571.mp3"),
      sunoTrack("A Wa Good Gan", "https://cdn1.suno.ai/c84b1a3e-b364-41d3-be5f-8e3b2273eb96.mp3"),
      sunoTrack("Stir Am Well", "https://cdn1.suno.ai/ce45202a-56e3-4d86-b185-3aa741aac131.mp3"),
      sunoTrack("Talk Wey Bend (Obfuscation)", "https://cdn1.suno.ai/d58c70e0-b330-4cda-8ee5-afd65f874d39.mp3"),
      sunoTrack("Belong Wahala", "https://cdn1.suno.ai/dbb44f28-64a1-49bb-bcbf-b5460c29ccd4.mp3"),
      sunoTrack("Habatically", "https://cdn1.suno.ai/19c15d58-c776-4f1c-9ef7-3bb7890b26bb.mp3"),
      sunoTrack("Party No Go Stop (Instrumental)", "https://cdn1.suno.ai/c6bb53b4-def2-4a68-bfaf-35f7f6dd7810.mp3"),
      sunoTrack("As Far As Your Mind Can See", "https://cdn1.suno.ai/53a2cbb3-7a29-4641-aca3-43ad0a1d8ae1.mp3"),
      sunoTrack("The Distance", "https://cdn1.suno.ai/e70059ca-398f-481e-9a71-6338fcfb9a1d.mp3"),
      sunoTrack("Stand With Truth", "https://cdn1.suno.ai/ab26a763-cba1-4426-9bf0-8117d0602684.mp3"),
      sunoTrack("Tears Of Love", "https://cdn1.suno.ai/017e178e-3478-485f-b844-aa72b327e2a6.mp3"),
      sunoTrack("Raising Boys", "https://cdn1.suno.ai/c48de9b1-a68b-4889-b43b-243da2d54bc0.mp3"),
      sunoTrack("Destiny No Dey Wait", "https://cdn1.suno.ai/f7f72dd2-12cd-4568-b831-f745973fa063.mp3"),
      sunoTrack("Pass The Baton", "https://cdn1.suno.ai/471dc968-d463-435c-8c3d-85f0d4556d8f.mp3"),
      sunoTrack("Moore\u2019s Law", "https://cdn1.suno.ai/891af5b2-b1fe-4db2-9c99-e1b1a15697a2.mp3"),
      sunoTrack("Same Ni", "https://cdn1.suno.ai/473edd61-d1ba-4bad-8014-7302cd1a9b71.mp3"),
      sunoTrack("Envy", "https://cdn1.suno.ai/553eefd4-54ba-4b73-ba02-4df85bfb5bb0.mp3"),
      sunoTrack("Echoes Of Ice", "https://cdn1.suno.ai/6af3b681-f3e6-4e84-85c7-9a2ad5f14e44.mp3"),
      sunoTrack("Wisdom Moves", "https://cdn1.suno.ai/e9562054-31e2-4195-ab30-cbe2902193f8.mp3"),
      sunoTrack("Bread Crumb Effect", "https://cdn1.suno.ai/81ba8cdd-bf24-492c-9504-b52b0a93fb39.mp3"),
      sunoTrack("Love Without Empathy", "https://cdn1.suno.ai/df20133e-8c32-48ec-b7d7-969aefef3478.mp3"),
      sunoTrack("Normal No Mean NOT Toxic", "https://cdn1.suno.ai/9ce53c0b-5bb2-4ac7-aee7-050013396548.mp3"),
      sunoTrack("No Contact", "https://cdn1.suno.ai/d010f7ec-5367-4d82-8243-8a515fcaf961.mp3"),
      sunoTrack("Shadows Teach The Light", "https://cdn1.suno.ai/8961b5ef-ca9b-4d0b-bce5-1bf065915db9.mp3"),
      sunoTrack("Midnight Maybe", "https://cdn1.suno.ai/f76cf242-e031-4785-a4b5-209b615da414.mp3"),
      sunoTrack("Run Di Settings", "https://cdn1.suno.ai/db52c7ad-c0aa-4f69-ab66-c7a6740ff1e5.mp3"),
];

export const ariyoGeoAudioAlbums: GeoAudioAlbum[] = [
  {
    id: 'ariyo-geoaudio-omoluabi-catalogue',
    title: 'Omoluabi Production Catalogue',
    description: 'Ariyo AI Omoluabi catalogue rebuilt from Ariyo source data and exact Suno manifest identity mappings.',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    genre: 'Afrobeats / Spoken Word',
    mood: 'Curated',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/Ariyo-AI/',
    coverArtUrl: ariyoUrl('icons/Ariyo.png'),
    tracks: ARIYO_AI_OMOLUABI_TRACKS,
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

export const sourceTruthJourneyAudit: GeoAudioCatalogAuditRow[] = auditGeoAudioCatalog(buildJourneyCatalog());

export const journeyCatalog: JourneyCatalogEntry[] = GEOAUDIO_JOURNEYS_ENABLED ? buildJourneyCatalog() : [];

const journeyCatalogIssues = validateJourneyCatalog(journeyCatalog);
if (journeyCatalogIssues.length && process.env.NODE_ENV !== 'production') {
  console.warn('[geoaudio] Journey catalog validation issues', journeyCatalogIssues);
}

export const ariyoGeoAudioChannels: Station[] = GEOAUDIO_JOURNEYS_ENABLED ? ariyoGeoAudioAlbums.map(adaptAriyoAlbumToGeoAudioChannel).filter((station) => station.is_active && Boolean(station.geoAudio?.tracks.length)) : [];
