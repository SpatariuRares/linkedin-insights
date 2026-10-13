import { FeedsSection } from '../components/settings/feeds-section';
import { ProfilesSection } from '../components/settings/profiles-section';
import { VoiceSection } from '../components/settings/voice-section';
import { EmbeddingsSection } from '../components/settings/embeddings-section';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">
          Fonti delle news, la tua voce, i modelli per scrivere e la ricerca per significato.
        </p>
      </div>
      <FeedsSection />
      <VoiceSection />
      <ProfilesSection />
      <EmbeddingsSection />
    </div>
  );
}
