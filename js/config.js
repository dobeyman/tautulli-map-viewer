// Configuration management
class Config {
    constructor() {
        this.storageKey = 'tautulli-map-config';
        this.configApiUrl = '/api/config';
        this.defaultConfig = {
            tautulliUrl: 'http://localhost:8181',
            apiKey: '',
            serverLat: 48.856614,  // Paris par défaut
            serverLon: 2.352222,
            refreshInterval: 30,
            mapStyle: 'dark'
        };
        this.config = this.defaultConfig;
        this.loadConfig(); // Load asynchronously
    }

    async loadConfig() {
        console.log('Loading configuration...');
        try {
            // Try to load from server first
            const response = await fetch(this.configApiUrl);
            console.log('Server config response status:', response.status);
            
            if (response.ok) {
                const serverConfig = await response.json();
                console.log('Server config data:', serverConfig);
                
                if (Object.keys(serverConfig).length > 0 && serverConfig.apiKey) {
                    this.config = { ...this.defaultConfig, ...serverConfig };
                    // Also update localStorage for offline fallback
                    localStorage.setItem(this.storageKey, JSON.stringify(this.config));
                    console.log('Configuration loaded from server:', this.config);
                    
                    // Dispatch event to notify app that config is loaded
                    window.dispatchEvent(new CustomEvent('configLoaded', { detail: this.config }));
                    return;
                } else {
                    console.log('Server config is empty or missing apiKey, falling back to localStorage');
                }
            } else {
                console.warn('Server returned non-OK status:', response.status);
            }
        } catch (error) {
            console.warn('Failed to load config from server, trying localStorage:', error);
        }

        // Fall back to localStorage
        const localConfig = this.load();
        console.log('Using localStorage config:', localConfig);
        this.config = localConfig;
        window.dispatchEvent(new CustomEvent('configLoaded', { detail: this.config }));
    }

    load() {
        const savedConfig = localStorage.getItem(this.storageKey);
        if (savedConfig) {
            return { ...this.defaultConfig, ...JSON.parse(savedConfig) };
        }
        return this.defaultConfig;
    }

    async save() {
        // Save to localStorage first (immediate)
        localStorage.setItem(this.storageKey, JSON.stringify(this.config));
        console.log('Configuration saved to localStorage:', this.config);

        // Then save to server
        try {
            const response = await fetch(this.configApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.config)
            });
            
            if (response.ok) {
                console.log('Configuration saved to server');
            } else {
                console.error('Failed to save config to server');
            }
        } catch (error) {
            console.error('Error saving config to server:', error);
        }
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
    }

    async setAll(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.save();
    }

    isConfigured() {
        return this.config.apiKey && this.config.apiKey.length > 0;
    }

    getTautulliApiUrl() {
        return `${this.config.tautulliUrl}/api/v2`;
    }
}

// Modal management
class ConfigModal {
    constructor(config) {
        this.config = config;
        this.modal = document.getElementById('config-modal');
        this.form = document.getElementById('config-form');
        this.settingsBtn = document.getElementById('settings-btn');
        this.isInitialized = false;
        
        this.init();
    }

    init() {
        // Event listeners - only add if button exists
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => this.open());
        }
        
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.save();
        });

        // Wait for config to be loaded before checking if we need to show modal
        window.addEventListener('configLoaded', () => {
            this.updateFormFields();
            
            // Only show modal if not configured after loading from server
            if (!this.config.isConfigured()) {
                this.open();
            }
            
            this.isInitialized = true;
        }, { once: true });
    }

    updateFormFields() {
        // Populate form with current config
        document.getElementById('tautulli-url').value = this.config.get('tautulliUrl');
        document.getElementById('api-key').value = this.config.get('apiKey');
        document.getElementById('server-lat').value = this.config.get('serverLat');
        document.getElementById('server-lon').value = this.config.get('serverLon');
        document.getElementById('refresh-interval').value = this.config.get('refreshInterval');
    }

    open() {
        if (this.isInitialized) {
            this.updateFormFields();
        }
        this.modal.style.display = 'block';
    }

    close() {
        this.modal.style.display = 'none';
    }

    async save() {
        const newConfig = {
            tautulliUrl: document.getElementById('tautulli-url').value,
            apiKey: document.getElementById('api-key').value,
            serverLat: parseFloat(document.getElementById('server-lat').value),
            serverLon: parseFloat(document.getElementById('server-lon').value),
            refreshInterval: parseInt(document.getElementById('refresh-interval').value)
        };

        await this.config.setAll(newConfig);
        this.close();
        
        // Trigger config updated event
        window.dispatchEvent(new CustomEvent('configUpdated', { detail: newConfig }));
    }
}

// Export instances
const config = new Config();
const configModal = new ConfigModal(config);