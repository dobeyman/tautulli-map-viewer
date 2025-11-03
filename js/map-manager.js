// Map management with Leaflet
class MapManager {
    constructor(config, tautulliAPI) {
        this.config = config;
        this.api = tautulliAPI;
        this.map = null;
        this.markers = new Map();
        this.connections = new Map();
        this.serverMarker = null;
        this.hasInitiallyFitted = false;
        
        // Tile layers
        this.tileLayers = {
            dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }),
            light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri',
                maxZoom: 19
            })
        };
    }

    init() {
        // Initialize map
        this.map = L.map('map', {
            center: [this.config.get('serverLat'), this.config.get('serverLon')],
            zoom: 5,
            zoomControl: true,
            preferCanvas: true
        });

        // Add default tile layer
        this.tileLayers.dark.addTo(this.map);

        // Add server marker
        this.addServerMarker();

        // Add zoom controls
        L.control.zoom({
            position: 'topright'
        }).addTo(this.map);

        // Add scale
        L.control.scale({
            imperial: false,
            position: 'bottomleft'
        }).addTo(this.map);

        return this;
    }

    addServerMarker() {
        const serverPos = [this.config.get('serverLat'), this.config.get('serverLon')];
        
        // Create custom server icon
        const serverIcon = L.divIcon({
            className: 'server-marker',
            html: '<div style="position: relative; width: 30px; height: 30px;"><div class="server-marker"></div></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        this.serverMarker = L.marker(serverPos, {
            icon: serverIcon,
            zIndexOffset: 1000
        }).addTo(this.map);

        // Add tooltip
        this.serverMarker.bindTooltip('Serveur Plex', {
            permanent: false,
            direction: 'top',
            offset: [0, -20],
            className: 'custom-tooltip'
        });
    }

    updateStreams(streams) {
        console.log(`Updating map with ${streams.length} streams`);
        
        // Debug: log all stream keys
        console.log('Stream keys:', streams.map(s => s.sessionKey));
        
        // Keep track of current stream keys
        const currentStreamKeys = new Set(streams.map(s => s.sessionKey));
        
        // Remove markers and connections for ended streams
        const toRemove = [];
        for (const [key, marker] of this.markers) {
            if (!currentStreamKeys.has(key)) {
                toRemove.push(key);
            }
        }
        
        toRemove.forEach(key => {
            console.log(`Removing ended stream: ${key}`);
            this.removeStream(key);
        });

        // Group streams by location (lat/lon) to handle multiple users at same location
        const streamsByLocation = new Map();
        streams.forEach(stream => {
            if (stream.location) {
                const locKey = `${stream.location.lat},${stream.location.lon}`;
                if (!streamsByLocation.has(locKey)) {
                    streamsByLocation.set(locKey, []);
                }
                streamsByLocation.get(locKey).push(stream);
            }
        });

        // Add or update current streams
        streams.forEach((stream) => {
            if (!stream.location) {
                console.warn(`Stream ${stream.sessionKey} has no location, skipping`);
                return;
            }
            
            const locKey = `${stream.location.lat},${stream.location.lon}`;
            const sameLocStreams = streamsByLocation.get(locKey);
            const streamIndex = sameLocStreams.indexOf(stream);
            const offset = this.calculateOffset(streamIndex, sameLocStreams.length);
            
            console.log(`Processing stream ${stream.sessionKey} (${stream.username}) - index ${streamIndex} of ${sameLocStreams.length} at location`);
            
            this.addOrUpdateStream(stream, offset);
        });

        console.log(`Active markers: ${this.markers.size}, Expected: ${streams.length}`);
        
        // Debug: list all active markers
        console.log('Active marker keys:', Array.from(this.markers.keys()));

        // Only fit bounds on first load or if explicitly needed
        if (streams.length > 0 && !this.hasInitiallyFitted) {
            this.fitBounds();
            this.hasInitiallyFitted = true;
        }
    }

    getAllBounds() {
        const bounds = L.latLngBounds();
        bounds.extend([this.config.get('serverLat'), this.config.get('serverLon')]);
        for (const marker of this.markers.values()) {
            bounds.extend(marker.getLatLng());
        }
        return bounds;
    }

    calculateOffset(index, total) {
        if (total === 1) return { lat: 0, lon: 0 };
        
        const angle = (2 * Math.PI * index) / total;
        const radius = 0.002; // Slightly larger offset for better visibility
        
        return {
            lat: radius * Math.sin(angle),
            lon: radius * Math.cos(angle) * 1.5 // Elongate horizontally for better separation
        };
    }

    addOrUpdateStream(stream, offset = { lat: 0, lon: 0 }) {
        const key = stream.sessionKey;
        
        if (!stream.location) {
            console.log(`No location for stream ${key}`);
            return;
        }

        // Apply offset to handle multiple users at same location
        const userPos = [
            stream.location.lat + offset.lat,
            stream.location.lon + offset.lon
        ];
        
        if (this.markers.has(key)) {
            // Update existing marker
            const marker = this.markers.get(key);
            marker.setLatLng(userPos);
            this.updateTooltip(marker, stream);
            this.updateConnection(key, userPos);
            console.log(`Updated marker for ${stream.username} at ${userPos}`);
        } else {
            // Create new marker
            const marker = this.createUserMarker(userPos, stream);
            this.markers.set(key, marker);
            this.createConnection(key, userPos);
            console.log(`Created marker for ${stream.username} at ${userPos}`);
        }
    }

    createUserMarker(position, stream) {
        // Create custom user icon with animation
        const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: `<div class="user-marker" style="background-color: ${this.getColorForBandwidth(stream.stream.bandwidth)}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker(position, {
            icon: userIcon,
            zIndexOffset: 500 + Math.floor(Math.random() * 100) // Random z-index to prevent overlapping
        }).addTo(this.map);

        // Store stream data on marker for debugging
        marker.streamData = stream;

        this.updateTooltip(marker, stream);
        
        return marker;
    }

    updateTooltip(marker, stream) {
        const tooltipContent = this.createTooltipContent(stream);
        
        if (marker.getTooltip()) {
            marker.setTooltipContent(tooltipContent);
        } else {
            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-tooltip'
            });
        }
    }

    createTooltipContent(stream) {
        const mediaTitle = TautulliAPI.formatMediaTitle(stream.media);
        const bandwidth = TautulliAPI.formatBandwidth(stream.stream.bandwidth);
        const location = `${stream.location.city}, ${stream.location.country}`;
        
        return `
            <div class="movie-title">${mediaTitle}</div>
            <div><strong>${stream.username}</strong></div>
            <div>${location}</div>
            <div>Débit: ${bandwidth}</div>
            <div>Qualité: ${stream.stream.quality}</div>
            <div>Player: ${stream.stream.player}</div>
        `;
    }

    createConnection(key, userPos) {
        const serverPos = [this.config.get('serverLat'), this.config.get('serverLon')];
        
        // Get stream data from marker
        const marker = this.markers.get(key);
        const bandwidth = marker?.streamData?.stream?.bandwidth || 0;
        
        // Get color based on bandwidth
        const bandwidthColor = this.getColorForBandwidth(bandwidth);
        
        // Create animated polyline with bandwidth-based color
        const polyline = L.polyline([serverPos, userPos], {
            color: bandwidthColor,
            weight: 3,
            opacity: 0.8,
            className: 'connection-line'
        }).addTo(this.map);

        // Add arrow markers along the line with matching color
        this.addArrowsToPolyline(polyline, serverPos, userPos, bandwidthColor);
        
        // Store the connection first
        this.connections.set(key, polyline);
        
        // Add animation after a delay to ensure DOM is ready
        setTimeout(() => {
            this.animateConnection(polyline);
        }, 100);
    }

    addArrowsToPolyline(polyline, startPos, endPos, color = '#2196f3') {
        // Calculate the angle of the line
        const dx = endPos[1] - startPos[1];
        const dy = endPos[0] - startPos[0];
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        
        // Create arrow markers at intervals along the line
        const numArrows = 3;
        polyline.arrows = [];
        
        for (let i = 1; i <= numArrows; i++) {
            const ratio = i / (numArrows + 1);
            const lat = startPos[0] + (endPos[0] - startPos[0]) * ratio;
            const lng = startPos[1] + (endPos[1] - startPos[1]) * ratio;
            
            // Create arrow icon with matching color
            const arrowIcon = L.divIcon({
                className: 'arrow-marker',
                html: `<div style="transform: rotate(${angle}deg); color: ${color}; font-size: 16px;">➤</div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            
            const arrowMarker = L.marker([lat, lng], {
                icon: arrowIcon,
                interactive: false,
                zIndexOffset: -100
            }).addTo(this.map);
            
            polyline.arrows.push(arrowMarker);
        }
    }

    updateConnection(key, userPos) {
        if (this.connections.has(key)) {
            const serverPos = [this.config.get('serverLat'), this.config.get('serverLon')];
            const polyline = this.connections.get(key);
            
            // Get updated bandwidth and color
            const marker = this.markers.get(key);
            const bandwidth = marker?.streamData?.stream?.bandwidth || 0;
            const bandwidthColor = this.getColorForBandwidth(bandwidth);
            
            // Update polyline position and color
            polyline.setLatLngs([serverPos, userPos]);
            polyline.setStyle({ color: bandwidthColor });
            
            // Update arrows if they exist
            if (polyline.arrows) {
                polyline.arrows.forEach(arrow => {
                    this.map.removeLayer(arrow);
                });
                polyline.arrows = [];
            }
            
            // Re-add arrows at new position with updated color
            this.addArrowsToPolyline(polyline, serverPos, userPos, bandwidthColor);
        }
    }

    animateConnection(polyline) {
        // Ensure the polyline is rendered before animating
        const startAnimation = () => {
            if (!polyline || !polyline._map) {
                // Polyline has been removed, stop trying
                return;
            }
            
            // Check if polyline is rendered in the DOM and has the necessary properties
            if (polyline._path && polyline._path.parentNode && polyline._renderer && polyline._renderer._container) {
                // Add a CSS class for animation instead of JavaScript animation
                try {
                    // Set initial dash style
                    polyline.setStyle({
                        dashArray: '4, 8'
                    });
                    
                    // Add CSS class for animation
                    if (polyline._path) {
                        polyline._path.classList.add('animated-dash');
                    }
                } catch (e) {
                    // If there's still an error, apply a simple static dashed line
                    console.warn('Error setting polyline animation:', e);
                    try {
                        polyline.setStyle({
                            dashArray: '4, 8',
                            dashOffset: '0'
                        });
                    } catch (e2) {
                        // Ignore if this also fails
                    }
                }
            } else {
                // Not ready yet, try again with a longer delay
                setTimeout(startAnimation, 100);
            }
        };
        
        // Wait for the map to be fully ready before starting animation
        if (this.map && this.map._loaded) {
            // Start checking after a longer delay to ensure rendering is complete
            setTimeout(startAnimation, 200);
        } else {
            // Wait for map to load
            this.map.once('load', () => {
                setTimeout(startAnimation, 200);
            });
        }
    }

    removeStream(key) {
        // Remove marker
        if (this.markers.has(key)) {
            this.map.removeLayer(this.markers.get(key));
            this.markers.delete(key);
        }

        // Remove connection and its animation
        if (this.connections.has(key)) {
            const polyline = this.connections.get(key);
            
            // Clear animation interval if exists
            if (polyline.animationInterval) {
                clearInterval(polyline.animationInterval);
            }
            
            // Remove arrow markers if they exist
            if (polyline.arrows) {
                polyline.arrows.forEach(arrow => {
                    this.map.removeLayer(arrow);
                });
            }
            
            this.map.removeLayer(polyline);
            this.connections.delete(key);
        }
    }

    getColorForBandwidth(bandwidth) {
        // Color based on bandwidth (in kbps)
        if (bandwidth > 20000) return '#ff4444';  // Red for > 20 Mbps
        if (bandwidth > 10000) return '#ff8844';  // Orange for > 10 Mbps
        if (bandwidth > 5000) return '#ffaa44';   // Yellow-orange for > 5 Mbps
        if (bandwidth > 2000) return '#ffcc44';   // Yellow for > 2 Mbps
        return '#44ff44';                         // Green for <= 2 Mbps
    }

    fitBounds() {
        const bounds = L.latLngBounds();
        
        // Add server position
        bounds.extend([this.config.get('serverLat'), this.config.get('serverLon')]);
        
        // Add all user positions
        for (const marker of this.markers.values()) {
            bounds.extend(marker.getLatLng());
        }

        // Fit map to bounds with padding
        this.map.fitBounds(bounds, { 
            padding: [50, 50],
            maxZoom: 10
        });
    }

    switchTileLayer(layerName) {
        // Remove current layer
        for (const layer of Object.values(this.tileLayers)) {
            if (this.map.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }
        }

        // Add new layer
        if (this.tileLayers[layerName]) {
            this.tileLayers[layerName].addTo(this.map);
        }
    }

    // Handle window resize
    invalidateSize() {
        this.map.invalidateSize();
    }

    // Clean up
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markers.clear();
        this.connections.clear();
    }
}