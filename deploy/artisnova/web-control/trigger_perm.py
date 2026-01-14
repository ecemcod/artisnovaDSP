import sounddevice as sd
try:
    print("Requesting microphone access...")
    with sd.InputStream(device=None, channels=1):
        print("Access granted!")
except Exception as e:
    print(f"Error: {e}")
