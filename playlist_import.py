import os
import pandas as pd
import spotipy
from spotipy.oauth2 import SpotifyOAuth


def load_env(path=".env"):
    """Minimal .env loader so we don't need python-dotenv."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()

# Authenticate with write permissions
sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=os.environ["SPOTIFY_CLIENT_ID"],
    client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
    # Spotify rejects http://localhost as "not secure", but allows the
    # loopback IP. Use the exact same value in your app's dashboard.
    redirect_uri="http://127.0.0.1:8888/callback",
    scope="playlist-modify-public"
))

# 1. Read your sorted CSV
df = pd.read_csv('Sorted_RnB_Groove_Playlist.csv')
user_id = sp.current_user()['id']

# 2. Create the blank playlist in your account
new_playlist = sp.user_playlist_create(
    user=user_id, 
    name="Smooth R&B Groove (Sorted)", 
    public=True, 
    description="70-110 BPM strictly sorted by Energy and Camelot Key."
)
playlist_id = new_playlist['id']

# 3. Collect the Spotify URIs straight from the CSV's "Track URI" column
track_uris = []
for index, row in df.iterrows():
    uri = str(row['Track URI']).strip()
    if uri.startswith('spotify:track:'):
        track_uris.append(uri)
    else:
        print(f"Skipping invalid URI for: {row['Track Name']} -> {uri!r}")

# 4. Add the tracks to your new playlist in batches of 100 (Spotify's API limit)
for i in range(0, len(track_uris), 100):
    batch = track_uris[i:i+100]
    sp.playlist_add_items(playlist_id, batch)

print("Playlist successfully created and populated!")