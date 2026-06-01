import urllib.request
import json
import sys

BASE_URL = "http://localhost:8000"

def test_endpoint(path, name):
    try:
        response = urllib.request.urlopen(f"{BASE_URL}{path}")
        data = json.loads(response.read().decode())
        print(f"✅ [PASS] {name} - Status code: 200")
        return data
    except Exception as e:
        print(f"❌ [FAIL] {name} - Error: {e}")
        return None

def run_tests():
    print("Starting automated API verification tests...")
    
    # 1. Test patient profile
    patient = test_endpoint("/api/patient", "Get Patient Profile")
    if patient:
        assert patient["name"] == "Eugene Vestel", "Name mismatch"
        assert "Blue Shield California" in patient["insurance_provider"], "Insurance mismatch"
        
    # 2. Test physician list
    physicians = test_endpoint("/api/physicians", "Get Physicians List")
    if physicians:
        assert len(physicians) == 3, "Seeded physicians count mismatch"
        assert physicians[0]["name"] == "Dr. Jane Miller", "First physician mismatch"
        
    # 3. Test forms templates
    forms = test_endpoint("/api/forms", "Get Forms List")
    if forms:
        assert len(forms) >= 2, "Seeded forms count mismatch"
        assert "Intake Form" in forms[0]["title"], "First form mismatch"
        
    # 4. Test appointments
    appointments = test_endpoint("/api/appointments", "Get Appointments List")
    if appointments:
        assert len(appointments) >= 1, "Appointments list is empty"
        
    print("\nAPI Verification complete.")

if __name__ == "__main__":
    run_tests()
