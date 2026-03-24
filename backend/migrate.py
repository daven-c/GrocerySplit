import json
import sqlite3
import os

DB_PATH = 'backend/grocery.db'
SESSIONS_PATH = 'backend/sessions.json'

def migrate():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if not os.path.exists(SESSIONS_PATH):
        print("No sessions.json found.")
        return

    with open(SESSIONS_PATH, 'r') as f:
        data = json.load(f)

    for sid, sdata in data.get('sessions', {}).items():
        session_id = int(sid)
        name = sdata.get('name', f"Session {sid}")
        updated_at = sdata.get('updated_at', '2025-01-01T00:00:00')
        
        c.execute("INSERT OR IGNORE INTO sessions (id, name, updated_at) VALUES (?, ?, ?)", (session_id, name, updated_at))
        
        items = sdata.get('items', {})
        for iid, idata in items.items():
            iname = idata.get('name')
            iprice = idata.get('price')
            c.execute("INSERT OR IGNORE INTO items (id, session_id, name, price) VALUES (?, ?, ?, ?)", (iid, session_id, iname, iprice))
            
            assigned = idata.get('assigned_users', [])
            for au in assigned:
                c.execute("SELECT 1 FROM item_users WHERE item_id = ? AND user_name = ?", (iid, au))
                if not c.fetchone():
                    c.execute("INSERT INTO item_users (item_id, user_name) VALUES (?, ?)", (iid, au))

    conn.commit()
    conn.close()
    print("Migration completed!")

if __name__ == '__main__':
    migrate()
