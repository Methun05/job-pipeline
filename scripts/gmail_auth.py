"""
One-time script to generate gmail_token.json.
Run this locally once, then never again.

Usage:
    python3 scripts/gmail_auth.py

It will open a browser, ask you to sign in with your Gmail,
and save gmail_token.json to the project root.
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",  # for bounce detection
]

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "..", "credentials.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "gmail_token.json")


def main():
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    print("✓ gmail_token.json saved successfully")
    print(f"  Token file: {os.path.abspath(TOKEN_FILE)}")


if __name__ == "__main__":
    main()
