from flask import Flask, request, jsonify, render_template, send_from_directory
import uuid
import os
import re
import json
from werkzeug.utils import secure_filename
import pytesseract
from PIL import Image
import cv2
import numpy as np
import google.generativeai as genai
from dotenv import load_dotenv
import threading
from datetime import datetime, timezone

# Load environment variables
load_dotenv()

# Load central configuration
CONFIG_FILE = os.path.join(os.path.dirname(__file__), '..', 'config.json')
with open(CONFIG_FILE, 'r') as f:
    config = json.load(f)

# Point static_folder to the root of the build directory, template_folder remains the same
app = Flask(__name__, static_folder='../frontend/build',
            template_folder='../frontend/build')

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
DATA_FILE = os.path.join(os.path.dirname(__file__), 'data.json')
SESSIONS_FILE = os.path.join(os.path.dirname(
    __file__), 'sessions.json')  # New file for sessions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

# Configure Google Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("Warning: GEMINI_API_KEY not found in environment variables.")

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory storage (will be loaded from/saved to file)
items = {}  # Item IDs will be strings (UUIDs)
users = set()
data_lock = threading.RLock()  # Use RLock (Reentrant Lock) instead of Lock

# Add Session storage
sessions = {}  # Session IDs are integers, Item IDs within sessions are strings
current_session_id = 1
active_session_id = None  # Track the ID of the session currently loaded in memory


def save_data():
    """Saves the current items and users to a JSON file."""
    with data_lock:
        try:
            # Convert sets to lists for JSON compatibility
            serializable_items = {}
            for item_id, data in items.items():
                serializable_items[item_id] = {
                    'name': data['name'],
                    'price': data['price'],
                    'assigned_users': list(data['assigned_users'])
                }
            with open(DATA_FILE, 'w') as f:
                json.dump({'items': serializable_items,
                          'users': list(users)}, f, indent=4)
        except IOError as e:
            print(f"Error saving data: {e}")


def load_data():
    """Loads items and users from a JSON file."""
    global items, users
    with data_lock:
        if not os.path.exists(DATA_FILE):
            items = {}
            users = set()
            return  # No data file yet

        try:
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
                loaded_items = data.get('items', {})
                # Convert loaded item assigned_users lists back to sets
                items = {}
                for item_id, item_data in loaded_items.items():
                    items[item_id] = {
                        'name': item_data['name'],
                        'price': item_data['price'],
                        'assigned_users': set(item_data.get('assigned_users', []))
                    }
                users = set(data.get('users', []))
        except (IOError, json.JSONDecodeError) as e:
            print(f"Error loading data: {e}. Starting with empty data.")
            items = {}
            users = set()


def save_sessions_to_disk():
    """Saves the sessions (including timestamps) to a JSON file."""
    with data_lock:
        try:
            serializable_sessions = {}
            for session_id, session_data in sessions.items():
                serializable_sessions[str(session_id)] = {
                    'name': session_data['name'],
                    'items': {
                        item_id: {
                            'name': item_data['name'],
                            'price': item_data['price'],
                            'assigned_users': list(item_data['assigned_users'])
                        } for item_id, item_data in session_data.get('items', {}).items()
                    },
                    'users': list(session_data.get('users', set())),
                    'updated_at': session_data.get('updated_at')
                }

            with open(SESSIONS_FILE, 'w') as f:
                json.dump({'sessions': serializable_sessions,
                          'current_session_id': current_session_id}, f, indent=4)
        except IOError as e:
            print(f"Error saving sessions: {e}")


def load_sessions_from_disk():
    """Loads sessions (including timestamps) from a JSON file."""
    global sessions, current_session_id
    with data_lock:
        if not os.path.exists(SESSIONS_FILE):
            sessions = {}
            current_session_id = 1
            return  # No sessions file yet

        try:
            with open(SESSIONS_FILE, 'r') as f:
                data = json.load(f)
                loaded_sessions = data.get('sessions', {})
                sessions = {}
                for session_id_str, session_data in loaded_sessions.items():
                    session_id = int(session_id_str)
                    sessions[session_id] = {
                        'name': session_data.get('name', f'Session {session_id}'),
                        'items': {
                            item_id: {
                                'name': item_data.get('name', 'Unknown Item'),
                                'price': item_data.get('price', 0.0),
                                'assigned_users': set(item_data.get('assigned_users', []))
                            } for item_id, item_data in session_data.get('items', {}).items()
                        },
                        'users': set(session_data.get('users', [])),
                        'updated_at': session_data.get('updated_at')
                    }
                current_session_id = data.get('current_session_id', 1)
        except (IOError, json.JSONDecodeError, ValueError) as e:
            print(
                f"Error loading sessions: {e}. Starting with empty sessions.")
            sessions = {}
            current_session_id = 1


def load_session_data_into_memory(session_id_to_load):
    """Loads data from a specific session ID into the global items/users vars."""
    global items, users, active_session_id
    if session_id_to_load in sessions:
        with data_lock:
            session = sessions[session_id_to_load]
            loaded_items = {}
            for item_id, data in session.get('items', {}).items():
                loaded_items[item_id] = {
                    'name': data.get('name', 'Unknown Item'),
                    'price': data.get('price', 0.0),
                    'assigned_users': set(data.get('assigned_users', []))
                }
            loaded_users = set(session.get('users', []))

            # Replace global state
            items = loaded_items
            users = loaded_users
            active_session_id = session_id_to_load
            print(f"Loaded session {session_id_to_load} into memory.")
            save_data()
            return True
    else:
        print(
            f"Attempted to load non-existent session {session_id_to_load} into memory.")
        return False


# Load initial data and sessions
load_data()
load_sessions_from_disk()

# Auto-load most recent session on startup
most_recent_session_id = None
latest_time = None

if sessions:
    for sid, sdata in sessions.items():
        if sdata.get('updated_at'):
            try:
                current_time = datetime.fromisoformat(sdata['updated_at'])
                if latest_time is None or current_time > latest_time:
                    latest_time = current_time
                    most_recent_session_id = sid
            except (ValueError, TypeError):
                print(f"Warning: Could not parse timestamp for session {sid}")
                continue

    if most_recent_session_id is None and sessions:
        most_recent_session_id = max(sessions.keys())
        print(
            f"No valid timestamps found, defaulting to highest session ID: {most_recent_session_id}")

if most_recent_session_id is not None:
    print(
        f"Attempting to auto-load most recent session: {most_recent_session_id}")
    load_session_data_into_memory(most_recent_session_id)
else:
    print("No sessions found or unable to determine most recent session. Using data from data.json or empty state.")
    active_session_id = None


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """Serve React App"""
    full_path = os.path.join(app.static_folder, path)

    if path != "" and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    else:
        index_path = os.path.join(app.template_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.template_folder, 'index.html')
        else:
            return jsonify({"error": "index.html not found in build directory. Run 'npm run build' in frontend."}), 404


@app.route('/api/items', methods=['GET'])
def get_items():
    """Returns the current list of items."""
    with data_lock:
        items_list = []
        for item_id, data in items.items():
            items_list.append({
                'id': item_id,
                'name': data['name'],
                'price': data['price'],
                'assigned_users': list(data['assigned_users'])
            })
        return jsonify({'items': items_list, 'users': list(users)})


@app.route('/api/items', methods=['POST'])
def add_item():
    """Adds a new item."""
    data = request.json
    name = data.get('name')
    price = data.get('price')

    if not name or price is None:
        return jsonify({'error': 'Missing item name or price'}), 400
    try:
        price = float(price)
        if price < 0:
            raise ValueError("Price cannot be negative")
    except ValueError:
        return jsonify({'error': 'Invalid price'}), 400

    item_id = str(uuid.uuid4())
    with data_lock:
        items[item_id] = {'name': name,
                          'price': price, 'assigned_users': set()}
    save_data()
    return jsonify({'id': item_id, 'name': name, 'price': price}), 201


@app.route('/api/items/batch', methods=['POST'])
def add_items_batch():
    """Adds multiple items in a single request."""
    data = request.json
    if not isinstance(data, list):
        return jsonify({'error': 'Request body must be a list of items'}), 400

    added_items_info = []
    new_items_to_add = {}

    for item_data in data:
        name = item_data.get('name')
        price = item_data.get('price')

        if not name or price is None:
            continue
        try:
            price = float(price)
            if price < 0:
                continue
        except (ValueError, TypeError):
            continue

        item_id = str(uuid.uuid4())
        new_items_to_add[item_id] = {'name': name,
                                     'price': price, 'assigned_users': set()}
        added_items_info.append({'id': item_id, 'name': name, 'price': price})

    if not new_items_to_add:
        return jsonify({'error': 'No valid items provided in the batch'}), 400

    with data_lock:
        items.update(new_items_to_add)
    save_data()

    return jsonify(added_items_info), 201


@app.route('/api/users', methods=['POST'])
def add_user():
    """Adds a new user."""
    data = request.json
    user_name = data.get('name')

    if not user_name:
        return jsonify({'error': 'Missing user name'}), 400
    if user_name in users:
        return jsonify({'error': 'User already exists'}), 409

    with data_lock:
        users.add(user_name)
    save_data()
    return jsonify({'name': user_name}), 201


@app.route('/api/users/<user_name>', methods=['PUT'])
def edit_user(user_name):
    """Edits a user's name."""
    with data_lock:
        user_name = user_name.strip()
        if user_name not in users:
            return jsonify({'error': 'User not found'}), 404

        data = request.json
        new_name = data.get('name', '').strip()

        if not new_name:
            return jsonify({'error': 'Missing new user name'}), 400

        if new_name in users:
            return jsonify({'error': 'User name already exists'}), 409

        # Update user name in users set
        users.remove(user_name)
        users.add(new_name)

        # Update user name in all item assignments
        for item_id, item_data in items.items():
            if user_name in item_data['assigned_users']:
                item_data['assigned_users'].remove(user_name)
                item_data['assigned_users'].add(new_name)

    save_data()
    return jsonify({'message': f'User {user_name} renamed to {new_name}'})


@app.route('/api/users/<user_name>', methods=['DELETE'])
def remove_user(user_name):
    """Removes a user."""
    with data_lock:
        user_name = user_name.strip()
        if user_name not in users:
            return jsonify({'error': 'User not found'}), 404

        # Remove from users set
        users.remove(user_name)

        # Remove from all item assignments
        for item_id, item_data in items.items():
            if user_name in item_data['assigned_users']:
                item_data['assigned_users'].remove(user_name)

    save_data()
    return jsonify({'message': f'User {user_name} removed'})


@app.route('/api/items/<item_id>/assign', methods=['POST'])
def assign_user_to_item(item_id):
    """Assigns or unassigns a user to an item."""
    with data_lock:
        if item_id not in items:
            return jsonify({'error': 'Item not found'}), 404

        data = request.json
        user_name = data.get('user_name')
        assign = data.get('assign', True)

        if user_name not in users:
            return jsonify({'error': 'User not found'}), 404

        if assign:
            items[item_id]['assigned_users'].add(user_name)
        else:
            items[item_id]['assigned_users'].discard(user_name)

    save_data()
    return jsonify({'message': f'User {user_name} {"assigned to" if assign else "unassigned from"} item {item_id}'})


@app.route('/api/items/<item_id>', methods=['PUT'])
def edit_item(item_id):
    """Edits an existing item."""
    with data_lock:
        if item_id not in items:
            return jsonify({'error': 'Item not found'}), 404

        data = request.json
        name = data.get('name')
        price = data.get('price')

        if not name or price is None:
            return jsonify({'error': 'Missing item name or price'}), 400

        try:
            price = float(price)
            if price < 0:
                raise ValueError("Price cannot be negative")
        except ValueError:
            return jsonify({'error': 'Invalid price'}), 400

        items[item_id]['name'] = name
        items[item_id]['price'] = price

    save_data()
    return jsonify({
        'id': item_id,
        'name': name,
        'price': price,
        'assigned_users': list(items[item_id]['assigned_users'])
    })


@app.route('/api/items/<item_id>', methods=['DELETE'])
def remove_item(item_id):
    """Removes a specific item."""
    with data_lock:
        if item_id not in items:
            return jsonify({'error': 'Item not found'}), 404
        del items[item_id]
    save_data()
    return jsonify({'message': f'Item {item_id} removed'}), 200


@app.route('/api/items', methods=['DELETE'])
def clear_items():
    """Clears all items from the list."""
    with data_lock:
        global items
        items = {}

    save_data()
    return jsonify({'message': 'All items have been cleared'}), 200


@app.route('/api/calculate', methods=['GET'])
def calculate_split():
    """Calculates how much each user owes."""
    with data_lock:
        user_totals = {user: 0.0 for user in users}

        for item_id, item_data in items.items():
            assigned_users = item_data['assigned_users']
            if not assigned_users:
                continue

            price = item_data['price']
            num_users = len(assigned_users)
            share = price / num_users

            for user in assigned_users:
                if user in user_totals:
                    user_totals[user] += share

    formatted_totals = {user: round(total, 2)
                        for user, total in user_totals.items()}

    return jsonify(formatted_totals)


@app.route('/api/scan-receipt', methods=['POST'])
def scan_receipt():
    """Scan a receipt image using OCR and extract items with prices."""
    if 'receipt' not in request.files:
        return jsonify({'error': 'No receipt image provided'}), 400

    file = request.files['receipt']

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        try:
            if GEMINI_API_KEY:
                try:
                    extracted_items = process_receipt_with_gemini(file_path)
                    if extracted_items:
                        return jsonify({'items': extracted_items})
                except Exception as e:
                    print(
                        f"Gemini processing failed: {str(e)}. Falling back to OCR.")

            extracted_items = process_receipt_with_ocr(file_path)
            return jsonify({'items': extracted_items})
        except Exception as e:
            return jsonify({'error': f'Error processing receipt: {str(e)}'}), 500
    else:
        return jsonify({'error': 'Invalid file type. Please upload a JPG, JPEG or PNG image'}), 400


def get_datetime_from_session(session_data):
    """Safely gets a timezone-aware datetime object from session data."""
    updated_at_str = session_data.get('updated_at')
    if updated_at_str:
        try:
            # Attempt to parse ISO format string
            dt = datetime.fromisoformat(updated_at_str)
            # Make it timezone-aware if it's naive (assume UTC if naive)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            # Handle cases where it might not be a valid string or format
            pass  # Fall through to return minimum datetime
    # Return a very old, timezone-aware datetime if missing or invalid
    return datetime.min.replace(tzinfo=timezone.utc)


@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Returns a list of saved sessions under the 'sessions' key, sorted by update/creation time."""
    session_list = []
    try:
        with data_lock:
            # Log raw data
            app.logger.debug(f"Raw sessions data from memory: {sessions}")
            temp_list = []
            for session_id, session_data in sessions.items():
                # Check if session_data is a dictionary before accessing keys
                if isinstance(session_data, dict):
                    # Manually construct the dictionary for the response, converting sets
                    response_session_data = {
                        'id': int(session_id),  # Convert id to int
                        'name': session_data.get('name', f'Session {session_id}'),
                        'updated_at': session_data.get('updated_at'),
                        # Convert users set to list
                        'users': list(session_data.get('users', set())),
                        # Convert items, ensuring assigned_users within items are lists
                        'items': {
                            item_id: {
                                'name': item_data.get('name', 'Unknown Item'),
                                'price': item_data.get('price', 0.0),
                                # Convert assigned_users set to list
                                'assigned_users': list(item_data.get('assigned_users', set()))
                            } for item_id, item_data in session_data.get('items', {}).items()
                        }
                    }
                    temp_list.append(response_session_data)
                else:
                    app.logger.warning(
                        f"Skipping non-dict session data for ID {session_id}: {session_data}")
            session_list = temp_list
            app.logger.debug(
                f"Session list after manual conversion: {session_list}")

            # --- Re-enable sorting ---
            app.logger.debug(f"Session list before sorting: {session_list}")
            # Use the helper function
            session_list.sort(key=get_datetime_from_session)
            app.logger.debug(f"Session list after sorting: {session_list}")
            # --- End re-enable sorting ---

        app.logger.debug(
            f"Final sorted session list to return: {session_list}")
        # Return the list nested under the 'sessions' key
        return jsonify({"sessions": session_list})
    except Exception as e:
        app.logger.error(f"Error getting sessions: {e}", exc_info=True)
        # Return error under 'error' key for consistency
        return jsonify({"error": "Failed to retrieve sessions"}), 500


@app.route('/api/sessions/active', methods=['GET'])
def get_active_session():
    """Returns the ID of the session currently loaded in memory."""
    with data_lock:
        return jsonify({'active_session_id': active_session_id})


@app.route('/api/sessions', methods=['POST'])
def save_session():
    """Saves a new session placeholder with a clean slate and timestamp."""
    global current_session_id
    data = request.json
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Missing session name'}), 400

    with data_lock:
        if any(session_data['name'].lower() == name.lower() for session_data in sessions.values()):
            return jsonify({'error': 'A session with this name already exists'}), 409

        session_id = current_session_id
        sessions[session_id] = {
            'name': name,
            'items': {},
            'users': set(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        current_session_id += 1

    save_sessions_to_disk()
    return jsonify({'id': session_id, 'name': name}), 201


@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
def edit_session(session_id):
    """Edits a session name and updates its timestamp."""
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404

    data = request.json
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Missing session name'}), 400

    for sid, session_data in sessions.items():
        if sid != session_id and session_data['name'].lower() == name.lower():
            return jsonify({'error': 'A session with this name already exists'}), 409

    with data_lock:
        sessions[session_id]['name'] = name
        sessions[session_id]['updated_at'] = datetime.now(
            timezone.utc).isoformat()
        save_sessions_to_disk()
    return jsonify({'id': session_id, 'name': name})


@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Deletes a session."""
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404

    with data_lock:
        del sessions[session_id]
        global active_session_id
        if active_session_id == session_id:
            active_session_id = None
        save_sessions_to_disk()
    return jsonify({'message': f'Session {session_id} deleted'})


@app.route('/api/sessions/<int:session_id>/load', methods=['POST'])
def load_session(session_id):
    """Loads a saved session into memory, making it the current working state."""
    if load_session_data_into_memory(session_id):
        return jsonify({'message': f'Session {session_id} loaded'})
    else:
        return jsonify({'error': 'Session not found'}), 404


@app.route('/api/sessions/<int:session_id>/update', methods=['PUT'])
def update_session_data(session_id):
    """Updates the data of an existing session and its timestamp."""
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404

    with data_lock:
        session_items = {}
        for item_id, data in items.items():
            session_items[item_id] = {
                'name': data['name'],
                'price': data['price'],
                'assigned_users': list(data.get('assigned_users', set()))
            }

        session_users = list(users)

        sessions[session_id]['items'] = session_items
        sessions[session_id]['users'] = session_users
        sessions[session_id]['updated_at'] = datetime.now(
            timezone.utc).isoformat()

        save_sessions_to_disk()

    return jsonify({'message': f'Session {session_id} updated with current state'})


def process_receipt_with_gemini(image_path):
    """Process receipt image using Google's Gemini Vision API."""
    with open(image_path, "rb") as image_file:
        image_bytes = image_file.read()

    generation_config = {
        "temperature": 0.0,
        "top_p": 1,
        "top_k": 1,
        "max_output_tokens": 2048,
    }

    model = genai.GenerativeModel(
        model_name=os.getenv('GEMINI_MODEL'),
        generation_config=generation_config,
    )

    image_parts = [
        {
            "mime_type": "image/jpeg",
            "data": image_bytes
        }
    ]

    prompt_text = """
    This is an image of a receipt. Please extract all individual items and their prices.
    Format your response as a JSON array with objects that have 'name' and 'price' properties.
    For example: 
    [
        {"name": "Milk", "price": 3.50},
        {"name": "Bread", "price": 2.25}
    ]
    Only include actual purchased items with prices. Skip subtotals, totals, tax lines, etc.
    Return ONLY the JSON array, with no other text or explanation.
    """

    response = model.generate_content([prompt_text, *image_parts])

    try:
        response_text = response.text.strip()

        if not response_text.startswith('['):
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(0)

        extracted_items = json.loads(response_text)

        formatted_items = []
        for item in extracted_items:
            if 'name' in item and 'price' in item:
                name = item['name'].strip()
                try:
                    price = float(item['price'])
                    if name and price > 0:
                        formatted_items.append({
                            'name': name,
                            'price': price
                        })
                except (ValueError, TypeError):
                    pass

        return formatted_items
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"Error parsing Gemini response: {e}")
        print(f"Response received: {response.text}")
        return []


def process_receipt_with_ocr(image_path):
    """Process receipt image using traditional OCR as a fallback."""
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

    text = pytesseract.image_to_string(thresh)
    extracted_items = []
    lines = text.split('\n')
    price_pattern = r'\$?\s*(\d+\.\d{2})'

    for line in lines:
        if not line.strip():
            continue

        price_match = re.search(price_pattern, line)
        if price_match:
            price_str = price_match.group(1)
            try:
                price = float(price_str)
                name = line[:price_match.start()].strip()

                if name and price > 0 and len(name) > 1:
                    name = re.sub(r'^\d+\.?\s*', '', name)
                    name = re.sub(r'^\d+x\s*', '', name)

                    extracted_items.append({
                        'name': name,
                        'price': price
                    })
            except ValueError:
                pass

    return extracted_items


if __name__ == '__main__':
    load_data()
    load_sessions_from_disk()
    app.run(debug=True, host='0.0.0.0', port=config['ports']['backend'])
