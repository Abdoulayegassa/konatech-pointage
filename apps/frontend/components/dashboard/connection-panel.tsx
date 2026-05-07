import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ConnectionPanelProps = {
  apiBaseUrl: string;
  checkedAt: string;
  errorMessage?: string;
  isConnected: boolean;
};

export function ConnectionPanel({
  apiBaseUrl,
  checkedAt,
  errorMessage,
  isConnected,
}: ConnectionPanelProps) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <Badge variant={isConnected ? 'success' : 'outline'}>
          {isConnected ? 'Connexion validée' : 'Connexion à vérifier'}
        </Badge>
        <CardTitle>Chaîne frontend → backend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
        <p>
          La page d’accueil appelle les routes Nest au rendu serveur pour
          confirmer la disponibilité de l’API avant d’afficher l’état du
          produit.
        </p>
        <div className="rounded-lg border border-border/70 bg-muted/50 p-4 transition duration-200 hover:border-primary/20 hover:bg-white">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Base URL
          </p>
          <p className="mt-2 break-all font-medium text-foreground">
            {apiBaseUrl}
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/50 p-4 transition duration-200 hover:border-primary/20 hover:bg-white">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Dernière réponse dashboard
          </p>
          <p className="mt-2 font-medium text-foreground">
            {new Date(checkedAt).toLocaleString('fr-FR')}
          </p>
        </div>
        {!isConnected && errorMessage ? (
          <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 font-medium text-accent">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
