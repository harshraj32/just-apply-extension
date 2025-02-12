const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();

// CORS configuration
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Content-Length'],
    credentials: false
};

// Apply CORS middleware first, before any routes
app.use(cors(corsOptions));

// Add CORS headers to all responses, including errors
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, X-Requested-With');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

// Health check endpoint with error handling
app.get('/health', async (req, res) => {
    try {
        // Add basic health checks here
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        // Ensure CORS headers are set even for errors
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// File conversion endpoint
app.post('/convert', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Your conversion logic here...
        
        res.json({ status: 'success', message: 'File processed successfully' });
    } catch (error) {
        // Ensure CORS headers are set for errors
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Error handling middleware - ensure CORS headers are set for all errors
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.header('Access-Control-Allow-Origin', '*');
    res.status(500).json({
        status: 'error',
        message: err.message || 'Internal server error'
    });
});

// Start server with error handling
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Gracefully shutdown
    server.close(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Gracefully shutdown
    server.close(() => process.exit(1));
}); 