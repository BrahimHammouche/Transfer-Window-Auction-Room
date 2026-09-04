import json
import os
import sqlite3
import uuid
from pathlib import Path


class GameDatabase:
    def __init__(self, root: Path):
        self.url = os.getenv("DATABASE_URL", f"sqlite:///{root / 'data' / 'transfer-auction.db'}")
        self.sqlite = self.url.startswith("sqlite:///")
        self.sqlite_path = self.url.removeprefix("sqlite:///") if self.sqlite else None
        self.memory_connection = None
        self.pool = None
        if not self.sqlite:
            try:
                from psycopg_pool import ConnectionPool
            except ImportError as error:
                raise RuntimeError("PostgreSQL requires psycopg-pool. Install requirements.txt first.") from error
            self.pool = ConnectionPool(conninfo=self.url, min_size=1, max_size=6, open=True)
        self._init_schema()

    def _connect(self):
        if self.sqlite:
            if self.sqlite_path == ":memory:":
                if self.memory_connection is None:
                    self.memory_connection = sqlite3.connect(":memory:")
                    self.memory_connection.row_factory = sqlite3.Row
                return self.memory_connection
            connection = sqlite3.connect(self.sqlite_path)
            connection.row_factory = sqlite3.Row
            return connection
        return self.pool.connection()

    def _init_schema(self):
        statements = [
            "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, wins INTEGER NOT NULL DEFAULT 0, titles INTEGER NOT NULL DEFAULT 0, games_played INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, owner_id TEXT NOT NULL, state_json TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS room_members (room_code TEXT NOT NULL, user_id TEXT NOT NULL, team_name TEXT NOT NULL, joined_at BIGINT NOT NULL, PRIMARY KEY (room_code, user_id), UNIQUE (room_code, team_name))",
        ]
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                for statement in statements:
                    cursor.execute(statement)
            finally:
                cursor.close()

    def _query(self, query, params=(), one=False):
        if not self.sqlite:
            query = query.replace("?", "%s")
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(query, params)
                if not cursor.description:
                    return None
                columns = [column[0] for column in cursor.description]
                rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
                return (rows[0] if rows else None) if one else rows
            finally:
                cursor.close()

    def create_user(self, username, password_hash, password_salt, created_at):
        user_id = str(uuid.uuid4())
        self._query("INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)", (user_id, username, password_hash, password_salt, created_at))
        return self.get_user_by_id(user_id)

    def get_user_by_username(self, username):
        return self._query("SELECT * FROM users WHERE username = ?", (username,), one=True)

    def get_user_by_id(self, user_id):
        return self._query("SELECT * FROM users WHERE id = ?", (user_id,), one=True)

    def get_users_by_ids(self, user_ids):
        unique_ids = list(dict.fromkeys(user_id for user_id in user_ids if user_id))
        if not unique_ids:
            return {}
        placeholders = ", ".join("?" for _ in unique_ids)
        users = self._query(f"SELECT * FROM users WHERE id IN ({placeholders})", tuple(unique_ids))
        return {user["id"]: user for user in users}

    def update_user_record(self, user_id, wins, titles, games):
        self._query("UPDATE users SET wins = wins + ?, titles = titles + ?, games_played = games_played + ? WHERE id = ?", (wins, titles, games, user_id))

    def get_room(self, code):
        room = self._query("SELECT * FROM rooms WHERE code = ?", (code,), one=True)
        if room:
            room["state"] = json.loads(room.pop("state_json"))
        return room

    def save_room(self, code, owner_id, state, timestamp):
        payload = json.dumps(state, ensure_ascii=False)
        self._query(
            "INSERT INTO rooms (code, owner_id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT (code) DO UPDATE SET owner_id = excluded.owner_id, state_json = excluded.state_json, updated_at = excluded.updated_at",
            (code, owner_id, payload, timestamp, timestamp),
        )

    def get_member(self, room_code, user_id):
        return self._query("SELECT * FROM room_members WHERE room_code = ? AND user_id = ?", (room_code, user_id), one=True)

    def add_member(self, room_code, user_id, team_name, timestamp):
        self._query("INSERT INTO room_members (room_code, user_id, team_name, joined_at) VALUES (?, ?, ?, ?)", (room_code, user_id, team_name, timestamp))

    def members(self, room_code):
        return self._query("SELECT room_members.*, users.username, users.wins, users.titles, users.games_played FROM room_members JOIN users ON users.id = room_members.user_id WHERE room_code = ? ORDER BY room_members.joined_at", (room_code,))
