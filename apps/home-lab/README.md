# home-lab (app)

Application front/back minimale, sans contenu pour l'instant — sert de socle prêt à être développé.

- **backend/** : API FastAPI (Python), expose `/health`.
- **frontend/** : page statique servie par nginx, appelle le backend via `config.js`.

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
