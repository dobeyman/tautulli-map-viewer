# Configuration Debugging Guide

## Testing the Configuration System

The configuration system has been updated to store settings on the server to persist across browser sessions and cache clears.

### Quick Test

1. **Access the test page**: Open http://localhost:8187/test-config.html (or your server URL)
2. Click the buttons in order:
   - "Test Connection" - Should show "Connection successful!"
   - "Load Config" - Shows current configuration
   - "Save Test Config" - Saves a test configuration
   - "Test localStorage" - Verifies browser storage works

### Running the Application

#### Option 1: With Docker (Recommended)
```bash
cd tautulli-map-viewer
docker-compose up -d
```
Then access: http://localhost:8187

#### Option 2: Without Docker (Development)
```bash
cd tautulli-map-viewer
npm install
node server.js
```
Then access: http://localhost:8188

### Important Notes

1. **Don't open index.html directly** - The configuration API requires the Node.js server
2. **Check the config directory** - After saving, you should see `config/settings.json`
3. **Volume permissions** - In Docker, ensure the config directory is writable

### Troubleshooting

1. **Configuration resets on refresh**:
   - Open browser console (F12)
   - Look for messages starting with "Loading configuration..."
   - Check if API returns data or errors

2. **Docker issues**:
   - Check logs: `docker logs tautulli-map-viewer`
   - Verify volume mount: `docker exec tautulli-map-viewer ls -la /app/config`

3. **Permission issues**:
   - Ensure the config directory has write permissions
   - On Linux/Mac: `chmod 755 config`

### Configuration Flow

1. Page loads → Config.loadConfig() runs
2. Tries to fetch from `/api/config`
3. If successful and has apiKey → Uses server config
4. If empty or fails → Falls back to localStorage
5. When you save → Saves to both server and localStorage

### Expected Console Output

When working correctly, you should see:
```
Loading configuration...
Server config response status: 200
Config loaded successfully: {your-config}
Configuration loaded from server: {your-config}
```

If you see the config modal on every refresh, check for these errors in the console.