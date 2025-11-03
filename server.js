const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 8188;
const CONFIG_FILE = path.join(__dirname, 'config', 'settings.json');

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Ensure config directory exists
async function ensureConfigDir() {
    try {
        await fs.mkdir(path.join(__dirname, 'config'), { recursive: true });
    } catch (error) {
        console.error('Error creating config directory:', error);
    }
}

// Load configuration
app.get('/api/config', async (req, res) => {
    try {
        console.log('Loading config from:', CONFIG_FILE);
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const config = JSON.parse(data);
        console.log('Config loaded successfully:', config);
        res.json(config);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty config
            console.log('Config file does not exist yet');
            res.json({});
        } else {
            console.error('Error reading config:', error);
            res.status(500).json({ error: 'Failed to load configuration' });
        }
    }
});

// Save configuration
app.post('/api/config', async (req, res) => {
    try {
        console.log('Saving config:', req.body);
        await ensureConfigDir();
        await fs.writeFile(CONFIG_FILE, JSON.stringify(req.body, null, 2));
        console.log('Config saved to:', CONFIG_FILE);
        res.json({ success: true, message: 'Configuration saved' });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// Serve static files after API routes
app.use(express.static(path.join(__dirname)));

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
ensureConfigDir().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Configuration server running on port ${PORT}`);
    });
});