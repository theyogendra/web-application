import requests, sys

base = 'http://localhost:8000'
print('=== Backend Validation ===')

try:
    r = requests.get(f'{base}/', timeout=3)
    print(f'GET /          -> {r.status_code} OK')
except Exception as e:
    print(f'GET / FAILED: {e}')
    sys.exit(1)

try:
    r = requests.get(f'{base}/health', timeout=3)
    print(f'GET /health    -> {r.status_code}: {r.json()}')
except Exception as e:
    print(f'GET /health FAILED: {e}')

try:
    r = requests.post(
        f'{base}/api/v1/auth/login',
        data={'username': 'admin@enterprise.com', 'password': 'password'},
        timeout=5
    )
    print(f'POST /login    -> {r.status_code}')
    data = r.json()
    if r.status_code == 200:
        token = data.get('access_token', '')
        user = data.get('user', {})
        print(f'  token prefix: {token[:25]}...')
        print(f'  user email:   {user.get("email")}')
        print(f'  user role:    {user.get("role")}')
        print('=== LOGIN SUCCESS ===')
    else:
        print(f'  ERROR: {data}')
except Exception as e:
    print(f'POST /login FAILED: {e}')
