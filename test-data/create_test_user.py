"""
Create test users through Supabase Auth for verification testing.
"""
import requests
import json

SUPABASE_URL = "https://hjzghinbochdgozyqaoy.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

print("="*80)
print("Creating Test Users via Supabase Auth Admin API")
print("="*80)

# Test User 1
test_user1 = {
    "email": "test1_paperlens@example.com",
    "password": "TestPass123!",
    "email_confirm": True,  # Skip email confirmation for testing
    "user_metadata": {
        "full_name": "Test User One"
    }
}

# Test User 2 
test_user2 = {
    "email": "test2_paperlens@example.com", 
    "password": "TestPass456!",
    "email_confirm": True,
    "user_metadata": {
        "full_name": "Test User Two"
    }
}

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

for i, user_data in enumerate([test_user1, test_user2], 1):
    print(f"\n[{i}] Creating user: {user_data['email']}")
    
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=headers,
            json=user_data,
            timeout=10
        )
        
        if resp.status_code in [200, 201]:
            user = resp.json()
            print(f"✅ User created successfully")
            print(f"   User ID: {user['id']}")
            print(f"   Email: {user['email']}")
            print(f"   Email confirmed: {user.get('email_confirmed_at') is not None}")
            
            # Also create a profile entry if needed
            profile_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user['id']}",
                headers=headers
            )
            
            if profile_resp.status_code == 200:
                profiles = profile_resp.json()
                if len(profiles) == 0:
                    print(f"   ⚠️ Note: Profile not auto-created (trigger may need manual run)")
                else:
                    print(f"   ✅ Profile exists in profiles table")
            
        elif resp.status_code == 422 and "already been registered" in resp.text:
            print(f"✅ User already exists")
            # Get the existing user
            list_resp = requests.get(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers=headers,
                timeout=10
            )
            if list_resp.status_code == 200:
                users = list_resp.json().get('users', [])
                existing = next((u for u in users if u['email'] == user_data['email']), None)
                if existing:
                    print(f"   User ID: {existing['id']}")
                    print(f"   Email: {existing['email']}")
        else:
            print(f"❌ Failed: {resp.status_code}")
            print(f"   Response: {resp.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

print("\n" + "="*80)
print("Test Users Summary:")
print("="*80)
print(f"User 1: {test_user1['email']} / {test_user1['password']}")
print(f"User 2: {test_user2['email']} / {test_user2['password']}")
print("\nThese credentials can be used to sign in at http://localhost:3001/login")
print("="*80)
