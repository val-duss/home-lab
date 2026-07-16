# home-lab (app)

Portail d'accueil protégé par un code d'accès, listant plusieurs mini-applications :

- **Calendrier** : événements d'un compte Google Calendar (OAuth2)
- **Todo-list** : tâches avec catégories (gérées) et labels (libres)
- **Électricité** : page vide pour l'instant
- **Actualités** : agrégateur RSS multi-thématiques (actualité générale, F1, tech, finance,
  international), sans compte requis

- **backend/** : API FastAPI (Python) — code d'accès + session JWT, OAuth Google Calendar,
  todo-list (SQLite), agrégation RSS.
- **frontend/** : pages statiques servies par nginx, appelle le backend via `config.js`.

## Dev local

```bash
docker compose up --build
```

- Frontend : http://localhost:3000
- Backend : http://localhost:8000/health

## Déploiement Kubernetes

Chart Helm dans `helm/home-lab/`, manifeste ArgoCD dans `argocd/application.yaml` :

```bash
kubectl apply -f argocd/application.yaml
```

Voir `helm/home-lab/values.yaml` pour la configuration (images, ingress, ressources).

### Secrets à surcharger en prod

Ne pas laisser les valeurs par défaut de `values.yaml` telles quelles. À surcharger via les
Parameters de l'Application ArgoCD (ou un `values-secret.yaml` non commité) :

- `backend.auth.accessCode` — le code demandé à la première connexion
- `backend.auth.jwtSecret` — clé de signature des sessions
- `backend.google.clientId` / `backend.google.clientSecret` — voir ci-dessous

### Connecter Google Calendar (procédure unique)

Google **refuse les redirect URI en HTTP** sauf pour `localhost`. Comme l'app est exposée en HTTP
sur une IP LAN, la liaison initiale doit se faire en local via `kubectl port-forward` — la
consultation quotidienne du calendrier fonctionne ensuite normalement via l'URL habituelle.

1. **Créer les identifiants OAuth** sur [Google Cloud Console](https://console.cloud.google.com/apis/credentials) :
   - Créer un projet (ou en réutiliser un), activer l'API **Google Calendar API**
   - Écran de consentement OAuth : type "External", ajouter ton compte Google en tant qu'utilisateur de test
   - Identifiants > Créer des identifiants > ID client OAuth > type **Application Web**
   - URI de redirection autorisée : `http://localhost:8000/calendar/oauth-callback`
   - Récupérer le **Client ID** et le **Client Secret**

2. **Renseigner les valeurs** `backend.google.clientId` / `backend.google.clientSecret` (et
   `backend.auth.accessCode`) dans le déploiement (ArgoCD Parameters, pas dans le values.yaml
   commité).

3. **Port-forward le backend** :
   ```bash
   kubectl port-forward -n app svc/home-lab-backend 8000:8000
   ```

4. **Obtenir un token de session** :
   ```bash
   curl -X POST http://localhost:8000/auth/access \
     -H "Content-Type: application/json" \
     -d '{"code":"<ton-code-d-acces>"}'
   ```

5. **Récupérer l'URL de consentement Google** :
   ```bash
   curl http://localhost:8000/calendar/auth-url \
     -H "Authorization: Bearer <token-obtenu-ci-dessus>"
   ```

6. Ouvrir l'URL renvoyée dans un navigateur, se connecter avec le compte Google, accepter — tu es
   redirigé vers `localhost:8000/calendar/oauth-callback`, qui affiche un message de succès. Le
   refresh token est alors stocké de façon persistante (PVC monté sur `/app/data`).

7. Le calendrier est maintenant accessible normalement via l'app (IP LAN / ingress), sans repasser
   par cette procédure — sauf si le refresh token est un jour révoqué côté Google.

### Modifier les sources d'actualités

La liste des flux RSS par thématique vit dans `helm/home-lab/values.yaml` sous
`backend.news.sources` (une ConfigMap générée à partir de cette valeur, montée sans `subPath` —
donc un `helm upgrade` / sync ArgoCD suffit, pas besoin de rebuild d'image ni de redémarrage
manuel du pod, le changement est pris en compte au prochain appel, sous 1 minute).

Chaque thématique a une clé, un `label` affiché dans l'app, et une liste de sources
`{name, url}` (flux RSS ou Atom). En dev local, le fichier équivalent est
`apps/home-lab/news_sources.json` (monté dans `docker-compose.yml`).
