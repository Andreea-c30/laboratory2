// prometheus.js
const client = require('prom-client');

function connectPrometheus(app) {
    // Create a Registry to register the metrics
    const register = new client.Registry();

    // Default metrics (GC, memory usage, etc.)
    client.collectDefaultMetrics({
        app: 'gateway',
        timeout: 10000,
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Garbage Collection duration buckets
        register: register
    });

    // Create a histogram metric for tracking HTTP request durations
    const httpRequestDurationMicroseconds = new client.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'code'],
        buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10] // 0.1 to 10 seconds
    });

    register.registerMetric(httpRequestDurationMicroseconds);

    // Middleware to track the duration of HTTP requests
    app.use((req, res, next) => {
        const end = httpRequestDurationMicroseconds.startTimer();
        
        res.on('finish', () => {
            // After the response is finished, record the duration with method, route, and status code
            end({ route: req.route ? req.route.path : req.url, code: res.statusCode, method: req.method });
        });

        next(); // Proceed with the next middleware/handler
    });

    // Expose the /metrics endpoint for Prometheus scraping
    app.get('/metrics', async (req, res) => {
        res.setHeader('Content-Type', register.contentType);
        res.send(await register.metrics());
    });
}

module.exports = connectPrometheus;
