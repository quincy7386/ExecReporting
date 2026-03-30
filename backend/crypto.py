"""
Symmetric encryption for the CBC API secret key.
The encryption key is auto-generated on first run and stored in data/secret.key.
"""
import os
from pathlib import Path
from cryptography.fernet import Fernet

KEY_PATH = Path(os.getenv("SECRET_KEY_PATH", "data/secret.key"))


def _load_or_create_key() -> bytes:
    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes()
    key = Fernet.generate_key()
    KEY_PATH.write_bytes(key)
    return key


_fernet = Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
