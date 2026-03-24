import sqlite3
import os
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import request, jsonify
from itsdangerous import URLSafeTimedSerializer

# DB Setup
DB_PATH = os.path.join(os.path.dirname(__file__), 'grocery.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        session_id INTEGER,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS item_users (
        item_id TEXT,
        user_name TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
    )''')
    conn.commit()
    conn.close()

init_db()

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-grocery-split")
serializer = URLSafeTimedSerializer(SECRET_KEY)

def create_token(user_id):
    return serializer.dumps(user_id, salt='auth-salt')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
        
        try:
            # Token expires in 24 hours (86400 seconds)
            user_id = serializer.loads(token, salt='auth-salt', max_age=86400)
            conn = get_db_connection()
            user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.close()
            if not user:
                return jsonify({'error': 'User not found!'}), 401
            current_user = dict(user)
        except Exception as e:
            return jsonify({'error': 'Invalid or expired token!'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated
