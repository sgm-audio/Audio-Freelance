import sys
sys.path.insert(0, '.')

from api.routes import app
from fastapi.testclient import TestClient

client = TestClient(app)

print('Testing bookmarklet endpoint...')
response = client.get('/bookmarklet')
print('Bookmarklet status:', response.status_code)
if response.status_code == 200:
    print('SUCCESS: Bookmarklet endpoint works!')
    print('Content type:', response.headers.get('content-type'))
else:
    print('FAILED: Bookmarklet failed:', response.text[:200])

print('Testing manual lead endpoint...')
response = client.post('/api/v1/leads/manual', json={
    'title': 'Test Lead',
    'url': 'https://example.com/test',
    'snippet': 'Test snippet',
    'source': 'test',
    'niche': 'plugin_dev'
})
print('Manual lead status:', response.status_code)
if response.status_code == 200:
    print('SUCCESS: Manual lead endpoint works!')
    data = response.json()
    print('Verdict:', data.get('verdict', 'N/A'))
    print('Score:', data.get('score', 'N/A'))
    print('Signals:', list(data.get('signals', {}).keys()))
else:
    print('FAILED: Error:', response.text[:200])