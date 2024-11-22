// animalPostsRoutes.js
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const CircuitBreaker = require('./circuitBreaker');

const router = express.Router();
const ANIMAL_POSTS_PROTO_PATH = './animal_posts.proto';

// Instanțele serviciului AnimalPost
const instances = [
    'http://animal-post-service-1:50052',
    'http://animal-post-service-2:50052',
    'http://animal-post-service-3:50052'
];

// Crearea unei instanțe a CircuitBreaker pentru serviciul AnimalPost
const circuitBreaker = new CircuitBreaker(3, 3500, instances); // 3 erori înainte de a comuta instanțele

// Încărcarea serviciului animal_posts.proto
const animalPostsPackageDef = protoLoader.loadSync(ANIMAL_POSTS_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const animalPostsProto = grpc.loadPackageDefinition(animalPostsPackageDef).animal_posts;

let animalPostsClient;
const cache = {};

// Inițializarea clientului gRPC
const initAnimalPostsClient = (serviceUrl) => {
    animalPostsClient = new animalPostsProto.AnimalPostService(
        serviceUrl,
        grpc.credentials.createInsecure()
    );
};

// Crearea unei postări de animale
router.post('/', async (req, res) => {
    const { title, description, location, status, images } = req.body;
    const request = { title, description, location, status, images };

    try {
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                animalPostsClient.CreateAnimalPost(request, (error, response) => {
                    if (error) return reject(error);
                    resolve(response);
                });
            });
        });

        cache['animalPosts'] = null; // Golirea cache-ului după creare
        res.status(200).json({ message: response.message, postId: response.postId });
    } catch (error) {
        res.status(500).json({ error: error.details || 'Serviciu indisponibil' });
    }
});

// Actualizarea unei postări de animale
router.put('/:postId', async (req, res) => {
    const { postId } = req.params;
    const { title, description, location, status, images } = req.body;
    const request = { postId: Number(postId), title, description, location, status, images };

    try {
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                animalPostsClient.UpdateAnimalPost(request, (error, response) => {
                    if (error) return reject(error);
                    resolve(response);
                });
            });
        });

        cache['animalPosts'] = null; // Golirea cache-ului după actualizare
        res.status(200).json({ message: response.message });
    } catch (error) {
        res.status(500).json({ error: error.details || 'Serviciu indisponibil' });
    }
});

// Obținerea tuturor postărilor de animale cu cache
router.get('/', async (req, res) => {
    if (cache['animalPosts']) {
        return res.status(200).json({ posts: cache['animalPosts'], source: 'cache' });
    }

    try {
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                animalPostsClient.GetAnimals({}, (error, response) => {
                    if (error) return reject(error);
                    resolve(response);
                });
            });
        });

        cache['animalPosts'] = response.posts; // Salvarea în cache
        res.status(200).json({ posts: response.posts, source: response.source || 'database' });
    } catch (error) {
        res.status(500).json({ error: error.details || 'Serviciu indisponibil' });
    }
});

// Ștergerea unei postări de animale
router.delete('/:postId', async (req, res) => {
    const { postId } = req.params;
    const request = { postId: Number(postId) };

    try {
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                animalPostsClient.DeleteAnimalPost(request, (error, response) => {
                    if (error) return reject(error);
                    resolve(response);
                });
            });
        });

        cache['animalPosts'] = null; // Golirea cache-ului după ștergere
        res.status(200).json({ message: response.message });
    } catch (error) {
        res.status(500).json({ error: error.details || 'Serviciu indisponibil' });
    }
});

// Verificarea stării serviciului AnimalPosts
router.get('/status', async (req, res) => {
    try {
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                animalPostsClient.CheckStatus({}, (error, response) => {
                    if (error) return reject(error);
                    resolve(response);
                });
            });
        });
        res.status(200).json({ status: response.status });
    } catch (error) {
        res.status(500).json({ error: error.details || 'Serviciu indisponibil' });
    }
});

// Endpoint pentru testarea circuit breaker-ului și a instanțelor serviciului
router.get('/test_failover', async (req, res) => {
    try {
        // Încercăm să obținem postările
        const response = await circuitBreaker.callService(() => {
            return new Promise((resolve, reject) => {
                // Simulăm o eroare 500 pentru a testa failover-ul
                // Aici se simulează o eroare în momentul în care gateway-ul face cererea către serviciul gRPC
                const simulateError = 1 + Math.random() > 0.5; // Probabilitate de 50% pentru a simula eroare
                if (simulateError) {
                    reject(new Error('Simulăm eroare 500 la serviciu'));
                } else {
                    // Dacă nu există eroare, continuăm cu răspunsul normal
                    animalPostsClient.GetAnimals({}, (error, response) => {
                        if (error) return reject(error);
                        resolve(response);
                    });
                }
            });
        });
        res.status(200).json({ message: 'success', posts: response.posts });
    } catch (error) {
        // În cazul unei erori, returnăm un mesaj de tip 500
        res.status(500).json({ error: 'Instance failed', message: error.message });
    }
});


// Endpoint pentru a genera o eroare 500 pentru testare
router.get('/post_test', (req, res) => {
    // Simulăm o eroare internă (500)
    res.status(500).json({ error: 'Internal Server Error', message: 'This is a test error for /post_test' });
});

module.exports = { router, initAnimalPostsClient };
