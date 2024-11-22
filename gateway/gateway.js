//gateway.js
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const WebSocket = require('ws');
const axios = require('axios');
const connectPrometheus = require('./prometheus');
const CircuitBreaker = require('./circuitBreaker');

// Import routes and gRPC client initialization
const { router: animalPostsRoutes, initAnimalPostsClient } = require('./animalPostsRoutes');

// Configuration
const CHAT_WS_URL = 'ws://new_chat:6789';
const CRITICAL_LOAD_THRESHOLD = 60;
const FAILURE_THRESHOLD = 3;
const TIMEOUT = 5000;

// Initialize Express app
const app = express();
app.use(express.json());

connectPrometheus(app); 

// Instanțele serviciului AnimalPost
const animalPostInstances = [
    'http://animal-post-service-1:50052',
    'http://animal-post-service-2:50052',
    'http://animal-post-service-3:50052'
];

// Initialize Circuit Breaker pentru serviciul AnimalService
const circuitBreakerAnimalService = new CircuitBreaker(FAILURE_THRESHOLD, TIMEOUT, animalPostInstances);

// Alerts for critical load conditions
const alertCriticalLoad = (load, serviceName) => {
    if (load > CRITICAL_LOAD_THRESHOLD) {
        console.warn(`ALERT: ${serviceName} is under critical load: ${load} requests per second.`);
    }
};

// Retry service calls if they fail
const retryServiceCall = async (circuitBreaker, serviceCall, serviceName) => {
    let attempt = 0;
    while (attempt < 3) {
        try {
            return await circuitBreaker.callService(serviceCall);
        } catch (error) {
            attempt++;
            console.log(`Attempt ${attempt} failed for ${serviceName}`);
            if (attempt === 3) {
                throw error;
            }
        }
    }
};

// Descoperirea serviciului URL cu protecție din circuit breaker
const discoverService = async (serviceName) => {
    try {
        return await retryServiceCall(circuitBreakerAnimalService, async () => {
            const response = await axios.get(`http://service_discovery:3001/services/${serviceName}`);
            return response.data.url.replace(/^http:\/\//, ''); // Returnează doar URL-ul fără "http://"
        }, serviceName);
    } catch (error) {
        console.error(`Circuit Breaker Alert for ${serviceName}:`, error.message);
        throw error;
    }
};

// Initialize WebSocket connection to the chat service
const createWsChatClient = () => {
    const wsChatClient = new WebSocket(CHAT_WS_URL);

    wsChatClient.on('open', () => {
        console.log('WebSocket connected');
    });

    wsChatClient.on('message', (data) => {
        const messageData = JSON.parse(data);
        if (messageData.action === 'chat_history') {
            const { room, history } = messageData;
            if (!chatRooms[room]) {
                chatRooms[room] = { history: [] };
            }
            chatRooms[room].history = history; // Store history for the room
        } else {
            const { username, message, room } = messageData;
            if (chatRooms[room]) {
                chatRooms[room].clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ username, message }));
                    }
                });
            }
        }
    });

    wsChatClient.on('error', (error) => {
        console.error(`WebSocket error: ${error.message}`);
    });

    wsChatClient.on('close', () => {
        console.log('WebSocket connection closed, attempting to reconnect...');
        setTimeout(createWsChatClient, 5000); // Retry connecting after 5 seconds
    });

    return wsChatClient;
};

// Initialize chat rooms and WebSocket clients
const chatRooms = {}; // Store chat rooms and their participants
// In-memory storage for users and their WebSocket connections
const userSockets = {}; // Maps username to their WebSocket client

// Endpoint to join a chat room
app.post('/chat/join', (req, res) => {
    const { username } = req.body;

    // Create a new WebSocket for each user if they don't have one already
    if (!userSockets[username]) {
        const userSocket = createWsChatClient();

        userSocket.on('open', () => {
            const room = req.body.room || 'lobby'; // Default to lobby if no room is specified
            if (!chatRooms[room]) {
                chatRooms[room] = { clients: [] }; // Create room if it doesn't exist
            }
            chatRooms[room].clients.push(userSocket); // Add client to the room
            userSockets[username] = userSocket; // Store WebSocket for this user
            res.status(200).json({ message: `User ${username} joined room ${room}` });
        });

        userSocket.on('error', (error) => {
            console.error(`WebSocket error for ${username}: ${error.message}`);
        });
    } else {
        res.status(400).json({ error: `User ${username} is already connected` });
    }
});

// Endpoint to send a chat message to a specific room
app.post('/chat/message', (req, res) => {
    const { username, room, message } = req.body;

    // Retrieve the stored WebSocket connection for the user
    const userSocket = userSockets[username];

    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
        const chatData = JSON.stringify({ username, room, message, action: 'send_message' });
        
        // Send the message via the user's WebSocket connection
        userSocket.send(chatData, (err) => {
            if (err) {
                console.error(`Failed to send message for ${username}: ${err.message}`);
                return res.status(500).json({ error: 'Failed to send message' });
            }
            res.status(200).json({ message: 'Message sent to chat room' });
        });
    } else {
        console.error(`WebSocket for ${username} is not open or doesn't exist`);
        res.status(500).json({ error: 'WebSocket connection is not open' });
    }
});


// Endpoint to retrieve chat history for a specific room
app.get('/chat/history/:room', (req, res) => {
    const { room } = req.params;
    const history = chatRooms[room]?.history || []; // Safely access history
    res.status(200).json({ history });
});

// Endpoint to check the WebSocket connection status
app.get('/chat/status', (req, res) => {
    const wsStatus = wsChatClient.readyState;

    let statusMessage = '';
    switch (wsStatus) {
        case WebSocket.CONNECTING:
            statusMessage = 'WebSocket is connecting...';
            break;
        case WebSocket.OPEN:
            statusMessage = 'WebSocket is open and connected';
            break;
        case WebSocket.CLOSING:
            statusMessage = 'WebSocket is closing...';
            break;
        case WebSocket.CLOSED:
            statusMessage = 'WebSocket is closed or failed to open';
            break;
        default:
            statusMessage = 'Unknown WebSocket status';
    }

    res.status(200).json({ status: statusMessage });
});

// Status endpoint for the gateway
app.get('/status', (req, res) => {
    res.status(200).json({ status: 'Gateway is running', timestamp: new Date() });
});

// Start the gateway server
const startServer = async () => {
    try {
        const ANIMAL_SERVICE_URL = await discoverService('AnimalService');
        initAnimalPostsClient(ANIMAL_SERVICE_URL);
        app.use('/animal-posts', animalPostsRoutes);

        // Start the gateway server
        const PORT = 3000;
        app.listen(PORT, () => {
            console.log(`Gateway server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting the server:', error.message);
    }
};

// Start the server
startServer();
