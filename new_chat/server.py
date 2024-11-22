#new_chat/server.py
import asyncio
import time
import websockets
from pymongo import MongoClient
import datetime
import requests
import json
from flask import Flask
from prometheus_flask_exporter import PrometheusMetrics, NO_PREFIX
# MongoDB connection
client = MongoClient("mongodb://mongo:27017/")
db = client['chat_db']
messages_collection = db['messages']
# Connect Prometheus
app = Flask(__name__)
metrics = PrometheusMetrics(app, defaults_prefix=NO_PREFIX)
metrics.info('app_info', 'Application info', version='1.0.3')
# Global variables
connected_clients = {}  # Each room will have a set of connected clients
client_rooms = {}  # Track the room each client is in
max_concurrent_tasks = 3
# Semaphore for limiting concurrent tasks
semaphore = asyncio.Semaphore(max_concurrent_tasks)

# Register the chat service with a service discovery
def register_service(service_name, service_url):
    try:
        requests.post("http://service_discovery:3001/register", json={
            "serviceName": service_name,
            "serviceUrl": service_url
        })
    except Exception as e:
        print(f"Failed to register service: {e}")

async def handle_client(websocket):
    room_name = "lobby" 
    await join_room(websocket, room_name)  

    try:
        async for message in websocket:
            try:
                data = json.loads(message)

                if data.get('action') == 'join_room':
                    new_room = data.get('room', 'lobby')
                    await join_room(websocket, new_room)
                    room_name = new_room  
                elif data.get('action') == 'get_history':
                    await send_chat_history(websocket, room_name)
                else:
                    await handle_chat_message(data, websocket, room_name)
            except json.JSONDecodeError:
                error_message = json.dumps({"error": "Invalid JSON format"})
                await websocket.send(error_message)
            except Exception as e:
                print(f"Error handling message: {e}")

    finally:
        await leave_room(websocket, room_name)
        print(f"Client disconnected: {websocket.remote_address}")

async def join_room(websocket, room_name):
    # Leave any current room
    current_room = client_rooms.get(websocket)

    if current_room:
        await leave_room(websocket, current_room)  # Ensure leaving current room

    # Join the specified room
    if room_name not in connected_clients:
        connected_clients[room_name] = set()
    connected_clients[room_name].add(websocket)
    client_rooms[websocket] = room_name  # Track which room the client is in

    # Notify other users in the room
    await broadcast_to_room(room_name, json.dumps({
        "system": f"A new user has joined the room: {room_name}"
    }))
    print(f"User joined room {room_name}")

async def leave_room(websocket, room_name):
    # Remove client from the specified room
    if room_name in connected_clients:
        connected_clients[room_name].discard(websocket)
        if not connected_clients[room_name]:
            del connected_clients[room_name]  # Clean up empty room

        # Notify others in the room
        await broadcast_to_room(room_name, json.dumps({
            "system": f"A user has left the room: {room_name}"
        }))

    # Remove the room from client tracking
    client_rooms.pop(websocket, None)

async def handle_chat_message(data, websocket, room_name):
    # Limit concurrent execution
    async with semaphore:
        try:
            # Extract username and message from the received data
            username = data.get('username')
            chat_message = data.get('message')

            if username and chat_message:
                # Log the received message with username
                client_info = f"{websocket.remote_address}"
                print(f"Received message from {username} in {room_name} ({client_info}): {chat_message}")

                # Save the message to MongoDB with room name
                message_record = {
                    "username": username,
                    "message": chat_message,
                    "room": room_name,
                    "timestamp": datetime.datetime.utcnow()
                }
                messages_collection.insert_one(message_record)

                # Prepare broadcast message for the room
                broadcast_message = json.dumps({"username": username, "message": chat_message})

                # Broadcast the message to all connected clients in the room
                await broadcast_to_room(room_name, broadcast_message)
        except Exception as e:
            print(f"Error saving message or sending broadcast: {e}")

async def broadcast_to_room(room_name, message):
    # Send a message to all clients in a specific room
    if room_name in connected_clients:
        tasks = []
        for client in connected_clients[room_name]:
            # Check if the client connection is still open
            tasks.append(
                asyncio.create_task(send_message_if_open(client, message))
            )
        await asyncio.gather(*tasks)

async def send_message_if_open(client, message):
    try:
        # Attempt to send a message, and ignore clients that have closed the connection
        await client.send(message)
    except websockets.exceptions.ConnectionClosed:
        # If the connection is closed, do nothing (or log if necessary)
        print(f"Connection closed for {client.remote_address}")


async def send_chat_history(websocket, room_name):
    try:
        # Set a timeout
        await asyncio.wait_for(retrieve_and_send_history(websocket, room_name), timeout=5.0)
    except asyncio.TimeoutError:
        print("Time out")
        await websocket.send(json.dumps({"error": "Could not retrieve chat history within the timeout"}))

async def retrieve_and_send_history(websocket, room_name):
    # Retrieve chat history from MongoDB for the specific room
    messages = list(messages_collection.find({"room": room_name}).sort("timestamp", 1))
    history = [{"username": message['username'], "message": message['message']} for message in messages]

    # Send the chat history back to the requesting client
    history_message = json.dumps({"action": "chat_history", "history": history})
    await websocket.send(history_message)

async def main():
    register_service("ChatService", "ws://new_chat:6789")
    async with websockets.serve(handle_client, "new_chat", 6789):
        print("WebSocket server running on ws://new_chat:6789")
        await asyncio.Future()  
from threading import Thread
# Start Flask metrics server
@app.route("/metrics")
def metrics_endpoint():
    return metrics.generate_latest()
def start_websocket_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(main())

if __name__ == "__main__":
    try:
        # Start WebSocket server in a separate thread
        websocket_thread = Thread(target=start_websocket_server)
        websocket_thread.start()

        # Start Flask app for Prometheus metrics
        app.run(host="0.0.0.0", port=9100)
    except KeyboardInterrupt:
        print("Server is shutting down...")