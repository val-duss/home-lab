# home-lab

Monorepo pour les applications du home lab.

## Structure

```
apps/
  <nom-app>/
    backend/       # API Python (FastAPI)
    frontend/      # frontend statique (nginx)
    helm/<nom-app>/ # chart Helm de déploiement
    argocd/         # manifeste ArgoCD Application
    docker-compose.yml
```

## Applications

- [`apps/home-lab`](apps/home-lab) — application front/back de base, sans contenu métier pour l'instant.

## Déploiement

Chaque application s'appuie sur son propre chart Helm (`apps/<nom-app>/helm/<nom-app>`) et est déployée
via ArgoCD à partir du manifeste `apps/<nom-app>/argocd/application.yaml` :

```bash
kubectl apply -f apps/home-lab/argocd/application.yaml
```

ArgoCD synchronise ensuite automatiquement le chart Helm correspondant sur le cluster.
