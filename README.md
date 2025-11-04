# Tautulli Map Viewer

Une interface web interactive qui affiche une carte en temps réel des utilisateurs actifs de Plex en utilisant les données de Tautulli.
![20251103_225410](https://github.com/user-attachments/assets/1b26fc8c-800e-4b2b-8402-13d7b1452888)

## Fonctionnalités

- **Carte interactive** : Visualisation en temps réel de la position géographique du serveur et des utilisateurs
- **Connexions animées** : Lignes animées reliant le serveur aux utilisateurs avec code couleur selon la bande passante
- **Informations détaillées** : Affichage du film/série en cours, de la bande passante, de la qualité et du lecteur au survol
- **Panneau de statistiques** : Vue d'ensemble de la bande passante totale et liste des utilisateurs actifs
- **Mise à jour automatique** : Rafraîchissement périodique des données
- **Interface responsive** : S'adapte aux écrans mobiles et desktop
- **Historique** : Visualisation de l'activité des 10 derniers jours
- **Configuration persistante** : Sauvegarde côté serveur pour conserver les paramètres même après effacement du cache

## Prérequis

- Un serveur Tautulli fonctionnel avec accès API
- Un navigateur web moderne (Chrome, Firefox, Edge, Safari)
- Une clé API Tautulli valide
- (Optionnel) Docker et Docker Compose pour le déploiement conteneurisé

## Installation

### Option 1 : Docker (Recommandé)

1. **Clonez ou téléchargez** le dossier `tautulli-map-viewer`

2. **Construisez et lancez** avec Docker Compose :
```bash
cd tautulli-map-viewer
docker-compose up -d
```

3. **Accédez** à l'application sur http://localhost:8187

4. **Pour arrêter** :
```bash
docker-compose down
```

### Option 2 : Docker avec commandes manuelles

```bash
# Construire l'image
docker build -t tautulli-map-viewer .

# Lancer le conteneur
docker run -d \
  --name tautulli-map-viewer \
  -p 8187:8188 \
  -v ./config:/app/config \
  --restart unless-stopped \
  tautulli-map-viewer
```

### Option 3 : Installation manuelle

1. Copiez le dossier `tautulli-map-viewer` sur votre serveur web ou ouvrez simplement `index.html` dans votre navigateur

2. Aucune installation supplémentaire nécessaire - toutes les dépendances sont chargées via CDN

## Configuration

1. Ouvrez l'application dans votre navigateur
2. Cliquez sur le bouton de configuration (⚙️) en bas à droite
3. Renseignez les informations suivantes :
   - **URL Tautulli** : L'URL de votre instance Tautulli (ex: http://localhost:8181)
   - **Clé API** : Votre clé API Tautulli (disponible dans Settings > Web Interface)
   - **Latitude/Longitude du serveur** : Position GPS de votre serveur Plex
   - **Intervalle de rafraîchissement** : Fréquence de mise à jour en secondes

### Obtenir la clé API Tautulli

1. Connectez-vous à Tautulli
2. Allez dans Settings → Web Interface
3. Copiez la valeur de "API key"

## Utilisation

### Interface principale

- **Carte** : Affiche la position du serveur (marqueur vert) et des utilisateurs (marqueurs orange/rouge)
- **Lignes de connexion** : Relient le serveur aux utilisateurs, colorées selon la bande passante :
  - Bleu : ≤ 2 Mbps
  - Jaune : 2-5 Mbps
  - Orange : 5-10 Mbps
  - Rouge : > 10 Mbps
- **Survol** : Passez la souris sur un marqueur pour voir les détails de la session
- **Panneau latéral** : Liste tous les utilisateurs actifs avec leurs statistiques

### Interactions

- **Zoom** : Utilisez la molette ou les boutons +/- 
- **Déplacement** : Cliquez et glissez sur la carte
- **Centre sur utilisateur** : Cliquez sur un utilisateur dans le panneau latéral

## Code couleur de la bande passante

- 🟢 **Vert** : ≤ 2 Mbps (SD)
- 🟡 **Jaune** : 2-5 Mbps (HD 720p)
- 🟠 **Orange** : 5-10 Mbps (HD 1080p)
- 🔴 **Rouge** : > 10 Mbps (4K)

## Dépannage

### "Impossible de se connecter à Tautulli"

1. Vérifiez que l'URL Tautulli est correcte
2. Assurez-vous que la clé API est valide
3. Vérifiez que Tautulli est accessible depuis votre navigateur
4. Si vous utilisez HTTPS, assurez-vous que les certificats sont valides

### Les utilisateurs n'apparaissent pas sur la carte

1. Vérifiez que la géolocalisation est activée dans Tautulli
2. Les utilisateurs avec des IPs locales (192.168.x.x, 10.x.x.x) ne seront pas affichés
3. Assurez-vous qu'il y a des streams actifs

### Problèmes de performance

1. Réduisez l'intervalle de rafraîchissement si nécessaire
2. Fermez d'autres onglets si la carte est lente

## Déploiement Docker

### Variables d'environnement

Le conteneur Docker supporte les variables suivantes :
- `TZ` : Fuseau horaire (ex: Europe/Paris, America/New_York)

### Volumes

- `./config:/app/config` : Stockage persistant de la configuration côté serveur

La configuration est maintenant sauvegardée côté serveur dans le dossier `config`. Cela permet de conserver vos paramètres même après avoir effacé le cache du navigateur ou changé d'appareil.

### Mise à jour

Avec Docker Compose :
```bash
docker-compose pull
docker-compose up -d
```

Ou manuellement :
```bash
docker pull tautulli-map-viewer:latest
docker stop tautulli-map-viewer
docker rm tautulli-map-viewer
docker run -d --name tautulli-map-viewer -p 8187:80 tautulli-map-viewer:latest
```

### Construction personnalisée

Pour modifier l'image :
1. Éditez les fichiers souhaités
2. Reconstruisez : `docker-compose build --no-cache`
3. Redémarrez : `docker-compose up -d`

### Configuration persistante

La configuration est maintenant stockée côté serveur dans le fichier `config/settings.json`. Cela garantit que vos paramètres sont conservés même si vous :
- Effacez le cache de votre navigateur
- Changez de navigateur ou d'appareil
- Redémarrez le conteneur Docker

Le système utilise une approche hybride :
1. Au démarrage, il tente de charger la configuration depuis le serveur
2. Si aucune configuration serveur n'existe, il utilise le localStorage
3. Toute modification est sauvegardée à la fois localement et sur le serveur

## Technologies utilisées

- **Leaflet.js** : Bibliothèque de cartographie
- **Tautulli API** : Source des données
- **Vanilla JavaScript** : Aucun framework requis
- **CSS3** : Animations et style moderne
- **Docker** : Conteneurisation avec Node.js Alpine
- **Node.js/Express** : Serveur web avec API de configuration

## Licence

Ce projet est fourni tel quel pour usage personnel. Veuillez respecter les conditions d'utilisation de Tautulli et Plex.

## Contribution


Les suggestions et améliorations sont les bienvenues ! N'hésitez pas à proposer des modifications.
