// Tautulli API integration
class TautulliAPI {
    constructor(config) {
        this.config = config;
        this.cache = {
            geoip: new Map(),
            users: new Map()
        };
    }

    // Build API URL with parameters
    buildUrl(cmd, params = {}) {
        const url = new URL(this.config.getTautulliApiUrl());
        url.searchParams.append('apikey', this.config.get('apiKey'));
        url.searchParams.append('cmd', cmd);
        
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }
        
        return url.toString();
    }

    // Generic API request method
    async request(cmd, params = {}) {
        try {
            const url = this.buildUrl(cmd, params);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.response.result !== 'success') {
                throw new Error(data.response.message || 'API request failed');
            }
            
            return data.response.data;
        } catch (error) {
            console.error('Tautulli API error:', error);
            throw error;
        }
    }

    // Get current activity
    async getActivity() {
        try {
            const data = await this.request('get_activity');
            console.log('Raw activity data:', data);
            return data;
        } catch (error) {
            console.error('Failed to get activity:', error);
            return null;
        }
    }

    // Get user details
    async getUser(userId) {
        if (this.cache.users.has(userId)) {
            return this.cache.users.get(userId);
        }

        try {
            const data = await this.request('get_user', { user_id: userId });
            this.cache.users.set(userId, data);
            return data;
        } catch (error) {
            console.error(`Failed to get user ${userId}:`, error);
            return null;
        }
    }

    // Get GeoIP information for an IP address
    async getGeoIP(ipAddress) {
        // Skip local IPs
        if (this.isLocalIP(ipAddress)) {
            return null;
        }

        if (this.cache.geoip.has(ipAddress)) {
            return this.cache.geoip.get(ipAddress);
        }

        try {
            const data = await this.request('get_geoip_lookup', { ip_address: ipAddress });
            
            if (data && data.latitude && data.longitude) {
                const geoData = {
                    lat: parseFloat(data.latitude),
                    lon: parseFloat(data.longitude),
                    city: data.city || 'Unknown',
                    region: data.region || '',
                    country: data.country || 'Unknown',
                    isp: data.isp || 'Unknown ISP'
                };
                
                this.cache.geoip.set(ipAddress, geoData);
                return geoData;
            }
            
            return null;
        } catch (error) {
            console.error(`Failed to get GeoIP for ${ipAddress}:`, error);
            return null;
        }
    }

    // Check if IP is local
    isLocalIP(ip) {
        return ip === '127.0.0.1' || 
               ip === 'localhost' || 
               ip.startsWith('192.168.') || 
               ip.startsWith('10.') || 
               ip.startsWith('172.');
    }

    // Get all active streams with location data
    async getActiveStreams() {
        try {
            const activity = await this.getActivity();
            
            if (!activity || !activity.sessions) {
                console.log('No active sessions found');
                return [];
            }

            console.log(`Found ${activity.sessions.length} active sessions`);

            const streams = await Promise.all(activity.sessions.map(async (session, index) => {
                console.log(`Processing session ${index + 1}:`, {
                    username: session.username,
                    ip: session.ip_address,
                    sessionKey: session.session_key,
                    state: session.state
                });
                
                let geoData = await this.getGeoIP(session.ip_address);
                
                // If no geo data, create a default location
                if (!geoData) {
                    // Place users with unknown location near the server with offset
                    const angle = (2 * Math.PI * index) / activity.sessions.length;
                    const radius = 0.01; // Larger offset for visibility
                    geoData = {
                        lat: this.config.get('serverLat') + radius * Math.sin(angle),
                        lon: this.config.get('serverLon') + radius * Math.cos(angle),
                        city: this.isLocalIP(session.ip_address) ? 'Local Network' : 'Unknown',
                        region: '',
                        country: this.isLocalIP(session.ip_address) ? 'LAN' : 'Unknown',
                        isp: this.isLocalIP(session.ip_address) ? 'Local Network' : 'Unknown ISP'
                    };
                    console.log(`Created position for ${session.username} (${session.ip_address}):`, geoData);
                }
                
                // Ensure unique session key by combining with timestamp and index
                const uniqueSessionKey = session.session_key ?
                    `${session.session_key}-${session.started || Date.now()}-${index}` :
                    `session-${Date.now()}-${index}`;
                
                return {
                    sessionKey: uniqueSessionKey,
                    userId: session.user_id,
                    username: session.friendly_name || session.username || 'Unknown User',
                    ipAddress: session.ip_address,
                    location: geoData,
                    media: {
                        title: session.title || 'Unknown Title',
                        type: session.media_type,
                        year: session.year,
                        grandparentTitle: session.grandparent_title,
                        parentTitle: session.parent_title,
                        thumb: session.thumb
                    },
                    stream: {
                        state: session.state,
                        videoDecision: session.video_decision,
                        audioDecision: session.audio_decision,
                        bandwidth: session.bandwidth ? parseInt(session.bandwidth) : 0,
                        quality: session.quality_profile || 'Unknown',
                        player: session.player || 'Unknown Player',
                        platform: session.platform || 'Unknown Platform'
                    },
                    progress: {
                        viewOffset: session.view_offset,
                        duration: session.duration,
                        progressPercent: session.progress_percent || 0
                    },
                    startedAt: session.started
                };
            }));

            // Log streams info
            const validStreams = streams.filter(stream => stream.location !== null);
            console.log(`Streams with valid location: ${validStreams.length}/${streams.length}`);
            
            // Return all streams with locations (including local ones)
            return validStreams;
        } catch (error) {
            console.error('Failed to get active streams:', error);
            return [];
        }
    }

    // Get server info
    async getServerInfo() {
        try {
            const data = await this.request('get_server_info');
            return data;
        } catch (error) {
            console.error('Failed to get server info:', error);
            return null;
        }
    }

    // Format bandwidth for display
    static formatBandwidth(bandwidth) {
        if (!bandwidth || bandwidth === 0) return '0 Mbps';
        
        const mbps = (bandwidth / 1000).toFixed(1);
        return `${mbps} Mbps`;
    }

    // Format media title
    static formatMediaTitle(media) {
        if (media.type === 'episode') {
            return `${media.grandparentTitle} - ${media.parentTitle} - ${media.title}`;
        } else if (media.type === 'movie') {
            return `${media.title} (${media.year || 'N/A'})`;
        } else if (media.type === 'track') {
            return `${media.grandparentTitle} - ${media.title}`;
        }
        return media.title;
    }

    // Clear caches
    clearCache() {
        this.cache.geoip.clear();
        this.cache.users.clear();
    }

    // Get history data from Tautulli
    async getHistory(start_date = null, end_date = null, length = 50000) {
        const params = {
            length: length,
            order_column: 'date',
            order_dir: 'desc',
            include_activity: 1  // Include all activity types
        };

        // Set date range if provided
        if (start_date && end_date) {
            // Parse dates and ensure they're valid
            const startDate = new Date(start_date);
            const endDate = new Date(end_date);
            
            // Tautulli expects Unix timestamps
            const startTimestamp = Math.floor(startDate.getTime() / 1000);
            const endTimestamp = Math.floor(endDate.getTime() / 1000);
            
            // Try different parameter names that Tautulli might accept
            params.start = startTimestamp;   // Some versions use 'start'
            params.before = endTimestamp;    // Before end date
            
            console.log(`Fetching history between dates: ${startDate.toISOString()} to ${endDate.toISOString()}`);
            console.log(`Fetching history between timestamps: ${startTimestamp} to ${endTimestamp}`);
            console.log(`Start: ${new Date(startTimestamp * 1000).toLocaleString()}`);
            console.log(`End: ${new Date(endTimestamp * 1000).toLocaleString()}`);
            
            // Also try with string dates in case the API prefers them
            params.start_date = start_date;
            params.end_date = end_date;
        }

        try {
            const data = await this.request('get_history', params);
            console.log(`Tautulli returned ${data.data?.length || 0} history items`);
            console.log(`Total records available: ${data.recordsTotal || 'unknown'}`);
            
            // If we didn't get all records, we might need to paginate
            if (data.recordsTotal && data.recordsTotal > length) {
                console.warn(`WARNING: Total records (${data.recordsTotal}) exceeds limit (${length}). Some data might be missing.`);
            }
            
            return data.data || [];
        } catch (error) {
            console.error('Failed to get history:', error);
            return [];
        }
    }

    // Get location from IP for historical data
    async getLocationFromIP(ipAddress) {
        // Use the existing getGeoIP method
        const geoData = await this.getGeoIP(ipAddress);
        
        if (!geoData) {
            // For local IPs or failed lookups, return a default location near server
            const randomOffset = () => (Math.random() - 0.5) * 0.02;
            return {
                lat: this.config.get('serverLat') + randomOffset(),
                lon: this.config.get('serverLon') + randomOffset(),
                city: this.isLocalIP(ipAddress) ? 'Local Network' : 'Unknown',
                region: '',
                country: this.isLocalIP(ipAddress) ? 'LAN' : 'Unknown',
                isp: this.isLocalIP(ipAddress) ? 'Local Network' : 'Unknown ISP'
            };
        }
        
        return geoData;
    }

    // Get history for the last N days
    async getHistoryDays(days = 10) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        console.log(`Fetching all history and filtering for last ${days} days`);
        console.log(`Date range: ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`);

        // First, try to get ALL history without date filtering
        // The API might not support date filtering properly
        const params = {
            length: 1000,  // Get more records
            order_column: 'date',
            order_dir: 'desc',
            include_activity: 1
        };

        try {
            const data = await this.request('get_history', params);
            console.log(`Tautulli returned ${data.data?.length || 0} history items`);
            console.log(`Total records available: ${data.recordsTotal || 'unknown'}`);
            
            const history = data.data || [];
            
            // Now filter client-side for our date range
            const filteredHistory = history.filter(session => {
                const sessionDate = session.started * 1000;
                const inRange = sessionDate >= startDate.getTime() && sessionDate <= endDate.getTime();
                if (inRange && history.indexOf(session) < 5) {
                    console.log(`Session: ${session.user} watched "${session.full_title || session.title}" on ${new Date(sessionDate).toLocaleString()}`);
                }
                return inRange;
            });

            console.log(`Sessions within last ${days} days: ${filteredHistory.length}`);
            
            // Log unique users found
            const uniqueUsers = new Set(filteredHistory.map(s => s.user || s.username || s.friendly_name || 'Unknown'));
            console.log(`Unique users found: ${Array.from(uniqueUsers).join(', ')}`);
            
            // If we got fewer records than total, warn the user
            if (data.recordsTotal && history.length < data.recordsTotal) {
                console.warn(`WARNING: Only received ${history.length} of ${data.recordsTotal} total records. Some sessions may be missing.`);
                console.warn(`Try increasing the 'length' parameter or implement pagination.`);
            }
            
            // Continue with processing the filtered history
            const processedHistory = [];
            let processedCount = 0;
            
            for (const session of filteredHistory) {
                // Process all sessions, even without IP
                const locationData = await this.getLocationFromIP(session.ip_address || '0.0.0.0');
                
                const processedSession = {
                    sessionKey: `hist-${session.reference_id || session.session_key || session.id || Math.random()}-${processedCount}`,
                    username: session.user || session.username || session.friendly_name || 'Unknown User',
                    userId: session.user_id,
                    ipAddress: session.ip_address || 'Unknown',
                    location: locationData,
                    media: {
                        type: session.media_type,
                        title: session.full_title || session.title || 'Unknown',
                        year: session.year,
                        grandparentTitle: session.grandparent_title || '',
                        parentTitle: session.parent_title || ''
                    },
                    stream: {
                        player: session.player,
                        platform: session.platform,
                        quality: session.quality_profile || session.transcode_decision || 'Unknown',
                        bandwidth: parseInt(session.bandwidth) || 0
                    },
                    startTime: session.started * 1000, // Convert to milliseconds
                    stopTime: session.stopped ? session.stopped * 1000 : (session.started + (session.duration || 0)) * 1000,
                    duration: session.duration || 0,
                    pausedDuration: session.paused_duration || 0,
                    watchedDuration: (session.duration || 0) - (session.paused_duration || 0)
                };
                
                processedHistory.push(processedSession);
                processedCount++;
                
                // Log every 10 sessions processed
                if (processedCount % 10 === 0) {
                    console.log(`Processed ${processedCount} sessions...`);
                }
            }

            console.log(`Total processed sessions: ${processedHistory.length}`);

            // Sort by start time (oldest first for chronological playback)
            processedHistory.sort((a, b) => a.startTime - b.startTime);

            return processedHistory;
            
        } catch (error) {
            console.error('Failed to get history:', error);
            return [];
        }
    }

    // Get history statistics
    async getHistoryStats(history) {
        const stats = {
            totalSessions: history.length,
            totalWatchTime: 0,
            uniqueUsers: new Set(),
            uniqueCountries: new Set(),
            byUser: {},
            byCountry: {},
            byDay: {},
            byHour: Array(24).fill(0)
        };

        history.forEach(session => {
            // Total watch time
            stats.totalWatchTime += session.watchedDuration;

            // Unique users
            stats.uniqueUsers.add(session.username);

            // By country
            if (session.location?.country) {
                stats.uniqueCountries.add(session.location.country);
                stats.byCountry[session.location.country] = (stats.byCountry[session.location.country] || 0) + 1;
            }

            // By user
            if (!stats.byUser[session.username]) {
                stats.byUser[session.username] = {
                    sessions: 0,
                    watchTime: 0,
                    location: session.location
                };
            }
            stats.byUser[session.username].sessions++;
            stats.byUser[session.username].watchTime += session.watchedDuration;

            // By day
            const day = new Date(session.startTime).toLocaleDateString();
            stats.byDay[day] = (stats.byDay[day] || 0) + 1;

            // By hour
            const hour = new Date(session.startTime).getHours();
            stats.byHour[hour]++;
        });

        stats.uniqueUsers = stats.uniqueUsers.size;
        stats.uniqueCountries = stats.uniqueCountries.size;

        return stats;
    }
}