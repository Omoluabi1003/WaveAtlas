import { PolicyPage } from "@/components/legal/PolicyPage";

export default function PrivacyPage() { return <PolicyPage title="Privacy Policy" intro="How WaveAtlas™ handles product data, browser storage, and submitted signals." sections={[
{heading:"Information collected",body:"WaveAtlas may process station interactions, search context, destination history, favorites, settings preferences, technical logs, and user-submitted station data."},
{heading:"Browser storage",body:"The app uses localStorage and sessionStorage for favorites, history, arrival flow state, destination context, settings, and similar product preferences."},
{heading:"Analytics",body:"If analytics are present, they may measure aggregate product usage, performance, errors, and feature engagement. Analytics should not be used to sell personal information."},
{heading:"User-submitted station data",body:"Add Signal submissions may include station name, stream URL, city, country, genre, language, station website, submitter name, optional email, and notes."},
{heading:"Optional email",body:"Email collection for Add Signal is optional and may be used to clarify a submission, prevent abuse, or follow up about review status."},
{heading:"How data is used",body:"Data is used to operate WaveAtlas, validate streams, improve discovery, protect the service, troubleshoot issues, and review community submissions."},
{heading:"Retention",body:"Browser storage remains on your device until cleared. Server-side logs and submissions may be retained as needed for operations, security, compliance, and curation."},
{heading:"Third-party links and services",body:"Radio streams, publisher links, map providers, RSS feeds, and external websites have their own privacy practices. Review those policies before interacting with them."},
{heading:"User rights and contact",body:"Depending on your location, you may request access, correction, deletion, or restriction of personal data. Contact: privacy@example.com."}
]} />; }
