import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom Metrics
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectionErrors = new Rate('ws_connection_errors');
const wsDroppedConnections = new Counter('ws_dropped_connections');
const httpLatency = new Trend('http_req_duration');
const httpErrorRate = new Rate('http_error_rate');

export const options = {
    scenarios: {
        // 1. WebSocket Load (Long-lived connections)
        websocket_soak: {
            executor: 'ramping-vus',
            exec: 'ws_scenario',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 200 },  // Ramp-up
                { duration: '10m', target: 200 }, // Steady soak state
                { duration: '30s', target: 500 }, // Burst spike
                { duration: '30s', target: 200 }, // Recovery
                { duration: '2m', target: 0 },    // Ramp-down
            ],
        },
        // 2. HTTP Load (150 req/sec sustained)
        http_load: {
            executor: 'constant-arrival-rate',
            exec: 'http_scenario',
            rate: 150,           // 150 requests
            timeUnit: '1s',      // per second
            duration: '14m',     // Run alongside the WS scenario
            preAllocatedVUs: 50,
            maxVUs: 300,
        },
    },
};

const BASE_HTTP_URL = 'http://localhost:8000';
const BASE_WS_URL = 'ws://localhost:8000';

// ==========================================
// SCENARIO 1: Mixed Speed WebSocket Clients
// ==========================================
export function ws_scenario() {
    const url = `${BASE_WS_URL}/ws/live`;
    const isSlowClient = Math.random() < 0.10; // 10% chance to be a slow client

    const res = ws.connect(url, {}, function (socket) {
        socket.on('open', () => {
            // Keep connection alive
            socket.setInterval(() => {
                socket.send(JSON.stringify({ type: 'ping' }));
            }, 10000); // ping every 10s
        });

        socket.on('message', (msg) => {
            wsMessagesReceived.add(1);
            
            // Simulate network latency/slow parsing for 10% of clients
            if (isSlowClient) {
                sleep(randomIntBetween(500, 2000) / 1000.0);
            }
        });

        socket.on('close', () => {
            wsDroppedConnections.add(1);
        });

        socket.on('error', (e) => {
            if (e.error() != 'websocket: close sent') {
                wsConnectionErrors.add(1);
            }
        });

        // Set scenario duration limit for the connection
        socket.setTimeout(() => {
            socket.close();
        }, 840000); // 14 mins
    });

    check(res, { 'WS connection successful': (r) => r && r.status === 101 });
}

// ==========================================
// SCENARIO 2: HTTP API Load
// ==========================================
export function http_scenario() {
    // Mix of endpoints to hit
    const endpoints = ['/api/v1/health', '/metrics', '/'];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    
    const res = http.get(`${BASE_HTTP_URL}${endpoint}`);

    httpLatency.add(res.timings.duration);
    httpErrorRate.add(res.status >= 400);

    check(res, {
        'status is 200': (r) => r.status === 200,
    });
}
