const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// in-memory store for registered services
const services = {};

// register a service
app.post('/register', (req, res) => {
    const { serviceName, serviceUrl } = req.body;

    if (!serviceName || !serviceUrl) {
        return res.status(400).json({ error: 'Service name and URL are required' });
    }

    //register the service
    services[serviceName] = serviceUrl;

    console.log(`Service registered: ${serviceName} at ${serviceUrl}`);
    res.status(200).json({ message: 'Service registered successfully' });
});

//endpoint to get a service URL
app.get('/services/:name', (req, res) => {
    const serviceName = req.params.name;

    const serviceUrl = services[serviceName];
    if (!serviceUrl) {
        return res.status(404).json({ error: 'Service not found' });
    }

    res.status(200).json({ url: serviceUrl });
});

//endpoint to list all registered services
app.get('/services', (req, res) => {
    res.status(200).json(services);
});
//endpoint to update service load
app.post('/services/load', (req, res) => {
    const { serviceName, load } = req.body;

    if (!serviceName || load === undefined) {
        return res.status(400).json({ error: 'Service name and load value are required' });
    }

    console.log(`Load updated for service: ${serviceName}, Load: ${load}`);

    res.status(200).json({ message: 'Load updated successfully' });
});

//status endpoint for service discovery
app.get('/status', (req, res) => {
    res.status(200).json({ status: 'Service Discovery is running', timestamp: new Date(), services });
});
//start the service discovery server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Service Discovery server is running on port ${PORT}`);
});
