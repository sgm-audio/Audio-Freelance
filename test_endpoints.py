import sys

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

print("Testing health endpoint...")
response = client.get("/api/v1/health")
print("Health status:", response.status_code)
if response.status_code == 200:
    print("SUCCESS: Health endpoint works!")
    print("Content type:", response.headers.get("content-type"))
else:
    print("FAILED: Health endpoint failed:", response.text[:200])

print("Testing manual lead endpoint...")
response = client.post(
    "/api/v1/leads/manual",
    json={
        "title": "Test Lead",
        "url": "https://example.com/test",
        "snippet": "Test snippet",
        "source": "test",
        "niche": "plugin_dev",
    },
)
print("Manual lead status:", response.status_code)
if response.status_code == 200:
    print("SUCCESS: Manual lead endpoint works!")
    data = response.json()
    print("Verdict:", data.get("verdict", "N/A"))
    print("Score:", data.get("score", "N/A"))
    print("Signals:", list(data.get("signals", {}).keys()))
else:
    print("FAILED: Error:", response.text[:200])
