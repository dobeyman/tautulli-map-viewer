// Main application controller
class TautulliMapApp {
    constructor() {
        this.api = null;
        this.mapManager = null;
        this.refreshInterval = null;
        this.isConnected = false;
        this.lastUpdate = null;
        this.currentMode = 'live'; // 'live' or 'history'
        this.historyData = [];
        this.historyStats = {};
        this.historyPlayback = {
            isPlaying: false,
            currentIndex: 0,
            timer: null,
            speed: 1000 // ms between frames
        };
        
        // UI elements
        this.elements = {
            connectionStatus: document.getElementById('connection-status'),
            lastUpdate: document.getElementById('last-update'),
            userCount: document.getElementById('user-count'),
            totalBandwidth: document.getElementById('total-bandwidth'),
            activeStreams: document.getElementById('active-streams'),
            userList: document.getElementById('user-list'),
            mapContainer: document.getElementById('map-container'),
            historyControls: document.getElementById('history-controls'),
            startDate: document.getElementById('start-date'),
            endDate: document.getElementById('end-date'),
            playbackSlider: document.getElementById('playback-slider'),
            playbackTime: document.getElementById('playback-time')
        };
    }

    async init() {
        console.log('Initializing Tautulli Map Viewer...');
        
        // Show loading spinner
        this.showLoading(true);
        
        // Initialize API
        this.api = new TautulliAPI(config);
        
        // Initialize map
        this.mapManager = new MapManager(config, this.api).init();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start refresh cycle if configured
        if (config.isConfigured()) {
            await this.start();
        } else {
            this.showLoading(false);
            this.updateConnectionStatus(false);
        }
    }

    setupEventListeners() {
        // Tab navigation
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // History controls
        document.getElementById('apply-date-range').addEventListener('click', () => {
            this.loadHistoryData();
        });

        // Preset buttons
        document.getElementById('preset-24h').addEventListener('click', () => {
            this.setDatePreset(1);
        });
        document.getElementById('preset-7d').addEventListener('click', () => {
            this.setDatePreset(7);
        });
        document.getElementById('preset-10d').addEventListener('click', () => {
            this.setDatePreset(10);
        });

        // Playback controls
        document.getElementById('play-pause').addEventListener('click', () => {
            this.togglePlayback();
        });

        // Playback slider
        this.elements.playbackSlider.addEventListener('input', (e) => {
            this.seekPlayback(parseInt(e.target.value));
        });

        // Config update handler
        window.addEventListener('configUpdated', async (e) => {
            console.log('Configuration updated:', e.detail);
            
            // Clear existing interval
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            // Reinitialize with new config
            await this.start();
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            this.mapManager.invalidateSize();
        });

        // Visibility change handler (pause updates when tab is hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }

    switchTab(tab) {
        // Update active tab
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update mode
        this.currentMode = tab;

        // Show/hide history controls
        this.elements.historyControls.classList.toggle('active', tab === 'history');
        this.elements.mapContainer.classList.toggle('with-history-controls', tab === 'history');

        // Update page title in header
        const titleMap = {
            'live': 'Statistiques en Direct',
            'history': 'Historique'
        };
        document.querySelector('#info-panel h2').textContent = titleMap[tab] || 'Statistiques';

        if (tab === 'live') {
            // Switch to live mode
            this.pause();
            this.stopPlayback();
            this.resume();
        } else if (tab === 'history') {
            // Switch to history mode
            this.pause();
            this.setDatePreset(10); // Default to 10 days
            this.loadHistoryData();
        }
    }

    setDatePreset(days) {
        const now = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Format for datetime-local input
        const formatDate = (date) => {
            const d = new Date(date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().slice(0, 16);
        };

        this.elements.startDate.value = formatDate(startDate);
        this.elements.endDate.value = formatDate(now);

        // Update active preset button
        document.querySelectorAll('.preset-button').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
    }

    async loadHistoryData() {
        try {
            this.showLoading(true);
            
            // Get date range
            const startDate = new Date(this.elements.startDate.value);
            const endDate = new Date(this.elements.endDate.value);
            
            // Calculate days
            const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            
            // Fetch history data
            console.log(`Loading history for ${days} days...`);
            this.historyData = await this.api.getHistoryDays(days);
            
            console.log(`Loaded ${this.historyData.length} historical sessions`);
            
            // Debug: Log some sessions
            console.log('Sample sessions:');
            this.historyData.slice(0, 5).forEach(session => {
                console.log(`- ${session.username} watched "${session.media.title}" from ${session.location?.city || 'Unknown'}`);
            });
            
            // Count unique users and locations
            const uniqueUsers = new Set(this.historyData.map(s => s.username));
            const uniqueLocations = new Set(this.historyData.map(s => s.location ? `${s.location.lat},${s.location.lon}` : 'unknown'));
            console.log(`Unique users: ${uniqueUsers.size}, Unique locations: ${uniqueLocations.size}`);
            
            // Get statistics
            this.historyStats = await this.api.getHistoryStats(this.historyData);
            
            // Update UI with history overview
            this.updateHistoryUI();
            
            // Initialize playback
            this.initPlayback();
            
        } catch (error) {
            console.error('Failed to load history:', error);
            this.showError('Impossible de charger l\'historique');
        } finally {
            this.showLoading(false);
        }
    }

    updateHistoryUI() {
        // Update stats display
        this.elements.userCount.textContent = `Sessions totales: ${this.historyStats.totalSessions}`;
        this.elements.totalBandwidth.textContent = `Temps de visionnage: ${this.formatDuration(this.historyStats.totalWatchTime)}`;
        this.elements.activeStreams.textContent = `Utilisateurs uniques: ${this.historyStats.uniqueUsers}`;
        
        // Update user list with summary
        this.elements.userList.innerHTML = '';
        
        // Sort users by watch time
        const userList = Object.entries(this.historyStats.byUser)
            .sort((a, b) => b[1].watchTime - a[1].watchTime)
            .slice(0, 10); // Top 10 users
        
        userList.forEach(([username, stats]) => {
            const li = document.createElement('li');
            li.className = 'user-item';
            li.innerHTML = `
                <div class="user-name">${username}</div>
                <div class="user-details">
                    <div>${stats.sessions} sessions</div>
                    <div>Temps: ${this.formatDuration(stats.watchTime)}</div>
                    ${stats.location ? `<div>${stats.location.city}, ${stats.location.country}</div>` : ''}
                </div>
            `;
            this.elements.userList.appendChild(li);
        });
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}min`;
        }
        return `${minutes}min`;
    }

    initPlayback() {
        // Reset playback state
        this.historyPlayback.currentIndex = 0;
        this.historyPlayback.isPlaying = false;
        
        // Create timeline for playback
        this.createHistoryTimeline();
        
        // Set slider range based on timeline
        if (this.historyPlayback.timeline) {
            this.elements.playbackSlider.max = this.historyPlayback.timeline.length - 1;
            this.elements.playbackSlider.value = 0;
        }
        
        // Show all sessions initially (not playback mode)
        this.showHistoryFrame(0);
    }

    showHistoryFrame(index) {
        // For history mode, show ALL sessions at once with different styling
        if (this.currentMode === 'history' && index === 0) {
            // Show all historical sessions on the map
            this.showAllHistorySessions();
            return;
        }
        
        // For playback mode, create a timeline and show active sessions at specific time
        if (this.historyPlayback.timeline && index >= 0 && index < this.historyPlayback.timeline.length) {
            const currentTime = this.historyPlayback.timeline[index];
            
            // Find all sessions that were active at this time
            const activeSessions = this.historyData.filter(session => {
                return session.startTime <= currentTime && session.stopTime >= currentTime;
            });
            
            console.log(`Time: ${new Date(currentTime).toLocaleString()}, Active sessions: ${activeSessions.length}`);
            
            // Update map with active sessions
            this.mapManager.updateStreams(activeSessions);
            
            // Update time display
            const timeStr = new Date(currentTime).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            this.elements.playbackTime.textContent = timeStr;
            
            // Update slider
            this.elements.playbackSlider.value = index;
            
            // Store current index
            this.historyPlayback.currentIndex = index;
        }
    }

    showAllHistorySessions() {
        console.log(`Showing all ${this.historyData.length} historical sessions on map`);
        
        // Clear existing streams
        this.mapManager.updateStreams([]);
        
        // Group sessions by location to handle overlapping markers
        const sessionsByLocation = new Map();
        let sessionsWithoutLocation = [];
        
        this.historyData.forEach((session, index) => {
            if (session.location && session.location.lat && session.location.lon) {
                const locKey = `${session.location.lat},${session.location.lon}`;
                if (!sessionsByLocation.has(locKey)) {
                    sessionsByLocation.set(locKey, []);
                }
                sessionsByLocation.get(locKey).push({...session, originalIndex: index});
            } else {
                // Collect sessions without valid location
                sessionsWithoutLocation.push({...session, originalIndex: index});
                console.log(`Session without location: ${session.username} - ${session.media.title}`);
            }
        });
        
        // If sessions have no location, add them to server location with larger offset
        if (sessionsWithoutLocation.length > 0) {
            const serverLat = config.get('serverLat');
            const serverLon = config.get('serverLon');
            const serverKey = `${serverLat},${serverLon}`;
            
            if (!sessionsByLocation.has(serverKey)) {
                sessionsByLocation.set(serverKey, []);
            }
            
            // Add sessions without location to server location with special flag
            sessionsWithoutLocation.forEach(session => {
                sessionsByLocation.get(serverKey).push({
                    ...session,
                    noLocation: true,
                    location: {
                        lat: serverLat,
                        lon: serverLon,
                        city: 'Server Location',
                        country: 'Unknown'
                    }
                });
            });
            
            console.log(`Added ${sessionsWithoutLocation.length} sessions without location to server location`);
        }
        
        console.log(`Sessions grouped by ${sessionsByLocation.size} unique locations`);
        
        // Add all historical sessions as markers with offset for overlapping
        sessionsByLocation.forEach((sessions, locKey) => {
            sessions.forEach((session, locIndex) => {
                // Calculate offset for overlapping markers
                const offset = this.mapManager.calculateOffset(locIndex, sessions.length);
                
                // Use larger offset for sessions without location (placed at server)
                const offsetMultiplier = session.noLocation ? 1.5 : 0.5;
                
                const position = [
                    session.location.lat + offset.lat * offsetMultiplier,
                    session.location.lon + offset.lon * offsetMultiplier
                ];
                
                // Create a unique session for each historical entry
                const historicalStream = {
                    ...session,
                    sessionKey: `hist-${session.sessionKey}-${session.originalIndex}`,
                    isHistorical: true
                };
                
                // Add marker
                const marker = this.mapManager.createUserMarker(position, historicalStream);
                this.mapManager.markers.set(historicalStream.sessionKey, marker);
                
                // Add connection line with color based on bandwidth
                const serverPos = [config.get('serverLat'), config.get('serverLon')];
                const bandwidthColor = this.mapManager.getColorForBandwidth(session.stream.bandwidth);
                
                const lineStyle = session.noLocation ? {
                    color: bandwidthColor,
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10', // Dashed line for no location
                    className: 'connection-line history-line no-location'
                } : {
                    color: bandwidthColor,
                    weight: 2,
                    opacity: 0.5,
                    className: 'connection-line history-line'
                };
                
                const polyline = L.polyline([serverPos, position], lineStyle).addTo(this.mapManager.map);
                
                this.mapManager.connections.set(historicalStream.sessionKey, polyline);
            });
        });
        
        // Fit map to show all markers
        if (this.historyData.length > 0) {
            this.mapManager.fitBounds();
        }
        
        // Update stats
        const totalSessions = this.historyData.length;
        const uniqueUsers = new Set(this.historyData.map(s => s.username)).size;
        const uniqueLocations = sessionsByLocation.size;
        const totalTime = this.historyData.reduce((sum, s) => sum + (s.watchedDuration || 0), 0);
        
        this.elements.playbackTime.textContent = `${totalSessions} sessions, ${uniqueUsers} utilisateurs, ${uniqueLocations} lieux`;
        
        // Update user list with all sessions
        this.updateHistoryList();
    }

    updateHistoryList() {
        this.elements.userList.innerHTML = '';
        
        // Group sessions by user
        const sessionsByUser = new Map();
        this.historyData.forEach(session => {
            if (!sessionsByUser.has(session.username)) {
                sessionsByUser.set(session.username, []);
            }
            sessionsByUser.get(session.username).push(session);
        });
        
        // Sort users by total sessions
        const userList = Array.from(sessionsByUser.entries())
            .sort((a, b) => b[1].length - a[1].length);
        
        userList.forEach(([username, sessions]) => {
            const totalTime = sessions.reduce((sum, s) => sum + (s.watchedDuration || 0), 0);
            const li = document.createElement('li');
            li.className = 'user-item';
            li.innerHTML = `
                <div class="user-name">${username}</div>
                <div class="user-details">
                    <div>${sessions.length} sessions</div>
                    <div>Temps: ${this.formatDuration(totalTime)}</div>
                    <div class="session-list" style="font-size: 0.75rem; margin-top: 0.5rem;">
                        ${sessions.slice(0, 3).map(s => `
                            <div style="opacity: 0.7;">- ${s.media.title}</div>
                        `).join('')}
                        ${sessions.length > 3 ? `<div style="opacity: 0.7;">... et ${sessions.length - 3} autres</div>` : ''}
                    </div>
                </div>
            `;
            this.elements.userList.appendChild(li);
        });
    }

    createHistoryTimeline() {
        // Create a timeline of all unique timestamps
        const timestamps = new Set();
        
        this.historyData.forEach(session => {
            timestamps.add(session.startTime);
            timestamps.add(session.stopTime);
        });
        
        // Sort timestamps
        const timeline = Array.from(timestamps).sort((a, b) => a - b);
        
        // Add intermediate timestamps for smoother playback (every hour)
        const enhancedTimeline = [];
        for (let i = 0; i < timeline.length - 1; i++) {
            enhancedTimeline.push(timeline[i]);
            
            const diff = timeline[i + 1] - timeline[i];
            const hourMs = 3600000; // 1 hour in ms
            
            if (diff > hourMs) {
                // Add hourly timestamps
                let currentTime = timeline[i] + hourMs;
                while (currentTime < timeline[i + 1]) {
                    enhancedTimeline.push(currentTime);
                    currentTime += hourMs;
                }
            }
        }
        enhancedTimeline.push(timeline[timeline.length - 1]);
        
        this.historyPlayback.timeline = enhancedTimeline;
        console.log(`Created timeline with ${enhancedTimeline.length} points`);
    }

    togglePlayback() {
        const playButton = document.getElementById('play-pause');
        
        if (this.historyPlayback.isPlaying) {
            // Pause
            this.historyPlayback.isPlaying = false;
            playButton.textContent = '▶️ Lecture';
            
            if (this.historyPlayback.timer) {
                clearInterval(this.historyPlayback.timer);
                this.historyPlayback.timer = null;
            }
        } else {
            // Play
            this.historyPlayback.isPlaying = true;
            playButton.textContent = '⏸️ Pause';
            
            // Start playback
            this.historyPlayback.timer = setInterval(() => {
                this.historyPlayback.currentIndex++;
                
                if (this.historyPlayback.currentIndex >= this.historyData.length) {
                    // End of data, stop playback
                    this.togglePlayback();
                    this.historyPlayback.currentIndex = 0;
                } else {
                    this.showHistoryFrame(this.historyPlayback.currentIndex);
                }
            }, this.historyPlayback.speed);
        }
    }

    stopPlayback() {
        if (this.historyPlayback.isPlaying) {
            this.togglePlayback();
        }
        this.historyPlayback.currentIndex = 0;
    }

    seekPlayback(index) {
        this.showHistoryFrame(index);
    }

    async start() {
        console.log('Starting refresh cycle...');
        
        // Initial fetch
        await this.refresh();
        
        // Set up refresh interval
        const interval = config.get('refreshInterval') * 1000;
        this.refreshInterval = setInterval(() => this.refresh(), interval);
    }

    pause() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // Also stop history playback if running
        if (this.historyPlayback.isPlaying) {
            this.stopPlayback();
        }
    }

    resume() {
        if (!this.refreshInterval && config.isConfigured() && this.currentMode === 'live') {
            this.start();
        }
    }

    async refresh() {
        // Only refresh in live mode
        if (this.currentMode !== 'live') return;
        
        try {
            console.log('Refreshing data...');
            
            // Get active streams
            const streams = await this.api.getActiveStreams();
            console.log(`App received ${streams.length} streams from API`);
            
            // Log stream details for debugging
            streams.forEach(stream => {
                console.log(`Stream: ${stream.username} (${stream.sessionKey}) at ${stream.ipAddress}`);
            });
            
            // Update connection status
            this.updateConnectionStatus(true);
            
            // Update map
            this.mapManager.updateStreams(streams);
            
            // Update UI
            this.updateUI(streams);
            
            // Update last refresh time
            this.lastUpdate = new Date();
            this.updateLastUpdateTime();
            
        } catch (error) {
            console.error('Refresh failed:', error);
            this.updateConnectionStatus(false);
            
            // Show error message
            this.showError('Impossible de se connecter à Tautulli. Vérifiez votre configuration.');
        }
    }

    updateUI(streams) {
        // Update user count
        this.elements.userCount.textContent = `Utilisateurs actifs: ${streams.length}`;
        
        // Calculate total bandwidth
        const totalBandwidth = streams.reduce((sum, stream) => sum + stream.stream.bandwidth, 0);
        this.elements.totalBandwidth.textContent = `Bande passante totale: ${TautulliAPI.formatBandwidth(totalBandwidth)}`;
        
        // Update active streams count
        this.elements.activeStreams.textContent = `Streams actifs: ${streams.length}`;
        
        // Update user list
        this.updateUserList(streams);
    }

    updateUserList(streams) {
        // Clear existing list
        this.elements.userList.innerHTML = '';
        
        // Sort streams by bandwidth (highest first)
        streams.sort((a, b) => b.stream.bandwidth - a.stream.bandwidth);
        
        // Create list items
        streams.forEach(stream => {
            const li = document.createElement('li');
            li.className = 'user-item';
            li.innerHTML = `
                <div class="user-name">${stream.username}</div>
                <div class="user-details">
                    <div>${TautulliAPI.formatMediaTitle(stream.media)}</div>
                    <div>${stream.location.city}, ${stream.location.country}</div>
                    <div class="bandwidth">Débit: ${TautulliAPI.formatBandwidth(stream.stream.bandwidth)}</div>
                    <div>Qualité: ${stream.stream.quality}</div>
                </div>
            `;
            
            // Add click handler to center map on user
            li.addEventListener('click', () => {
                const marker = this.mapManager.markers.get(stream.sessionKey);
                if (marker) {
                    this.mapManager.map.setView(marker.getLatLng(), 10);
                }
            });
            
            this.elements.userList.appendChild(li);
        });
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        this.elements.connectionStatus.textContent = connected ? 'Connecté' : 'Déconnecté';
        this.elements.connectionStatus.className = connected ? 'status-indicator connected' : 'status-indicator';
    }

    updateLastUpdateTime() {
        if (!this.lastUpdate) return;
        
        const updateTime = () => {
            const now = new Date();
            const diff = Math.floor((now - this.lastUpdate) / 1000);
            
            let timeStr;
            if (diff < 60) {
                timeStr = 'À l\'instant';
            } else if (diff < 3600) {
                timeStr = `Il y a ${Math.floor(diff / 60)} min`;
            } else {
                timeStr = `Il y a ${Math.floor(diff / 3600)} h`;
            }
            
            this.elements.lastUpdate.textContent = `Dernière mise à jour: ${timeStr}`;
        };
        
        updateTime();
        
        // Update every 10 seconds
        if (this.updateTimeInterval) {
            clearInterval(this.updateTimeInterval);
        }
        this.updateTimeInterval = setInterval(updateTime, 10000);
    }

    showLoading(show) {
        if (show) {
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            spinner.id = 'main-loading-spinner';
            this.elements.mapContainer.appendChild(spinner);
        } else {
            const spinner = document.getElementById('main-loading-spinner');
            if (spinner) {
                spinner.remove();
            }
        }
    }

    showError(message) {
        // Create error notification
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #f44336;
            color: white;
            padding: 1rem 2rem;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            z-index: 2000;
            animation: fadeIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // Clean up
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.updateTimeInterval) {
            clearInterval(this.updateTimeInterval);
        }
        if (this.mapManager) {
            this.mapManager.destroy();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Always wait for config to be loaded from server
    window.addEventListener('configLoaded', async () => {
        // Create and start app
        window.app = new TautulliMapApp();
        await window.app.init();
    }, { once: true });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.destroy();
    }
});