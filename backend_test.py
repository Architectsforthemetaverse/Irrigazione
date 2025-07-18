import requests
import sys
import json
from datetime import datetime

class IrrigationAPITester:
    def __init__(self, base_url="https://895a47ad-4fad-4e5d-99c8-4c69360bd96c.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_day_id = None
        self.created_schedule_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "api/health",
            200
        )
        return success

    def test_initialize_sample_data(self):
        """Test sample data initialization"""
        success, response = self.run_test(
            "Initialize Sample Data",
            "POST",
            "api/initialize",
            200
        )
        return success

    def test_get_all_days(self):
        """Test getting all days"""
        success, response = self.run_test(
            "Get All Days",
            "GET",
            "api/days",
            200
        )
        if success and 'days' in response:
            print(f"   Found {len(response['days'])} days")
        return success

    def test_create_day(self):
        """Test creating a new day"""
        test_day = {
            "day_number": 99,
            "name": "Test Day 99",
            "schedules": [],
            "is_active": True
        }
        
        success, response = self.run_test(
            "Create Day",
            "POST",
            "api/days",
            200,
            data=test_day
        )
        
        if success and 'day' in response:
            self.created_day_id = response['day']['id']
            print(f"   Created day with ID: {self.created_day_id}")
        
        return success

    def test_get_specific_day(self):
        """Test getting a specific day"""
        if not self.created_day_id:
            print("❌ Skipping - No day ID available")
            return False
            
        success, response = self.run_test(
            "Get Specific Day",
            "GET",
            f"api/days/{self.created_day_id}",
            200
        )
        return success

    def test_add_schedule(self):
        """Test adding a schedule to a day"""
        if not self.created_day_id:
            print("❌ Skipping - No day ID available")
            return False
            
        test_schedule = {
            "time": "10:30",
            "action": "Test irrigation action - open sectors 1, 2",
            "sectors": [1, 2],
            "main_valves": [1],
            "action_type": "open"
        }
        
        success, response = self.run_test(
            "Add Schedule",
            "POST",
            f"api/days/{self.created_day_id}/schedules",
            200,
            data=test_schedule
        )
        
        if success and 'schedule' in response:
            self.created_schedule_id = response['schedule']['id']
            print(f"   Created schedule with ID: {self.created_schedule_id}")
        
        return success

    def test_update_schedule(self):
        """Test updating a schedule"""
        if not self.created_day_id or not self.created_schedule_id:
            print("❌ Skipping - No day or schedule ID available")
            return False
            
        updated_schedule = {
            "time": "11:00",
            "action": "Updated test irrigation action - close sectors 1, 2",
            "sectors": [1, 2],
            "main_valves": [1],
            "action_type": "close"
        }
        
        success, response = self.run_test(
            "Update Schedule",
            "PUT",
            f"api/days/{self.created_day_id}/schedules/{self.created_schedule_id}",
            200,
            data=updated_schedule
        )
        return success

    def test_delete_schedule(self):
        """Test deleting a schedule"""
        if not self.created_day_id or not self.created_schedule_id:
            print("❌ Skipping - No day or schedule ID available")
            return False
            
        success, response = self.run_test(
            "Delete Schedule",
            "DELETE",
            f"api/days/{self.created_day_id}/schedules/{self.created_schedule_id}",
            200
        )
        return success

    def test_update_day(self):
        """Test updating a day"""
        if not self.created_day_id:
            print("❌ Skipping - No day ID available")
            return False
            
        updated_day = {
            "day_number": 99,
            "name": "Updated Test Day 99",
            "schedules": [],
            "is_active": False
        }
        
        success, response = self.run_test(
            "Update Day",
            "PUT",
            f"api/days/{self.created_day_id}",
            200,
            data=updated_day
        )
        return success

    def test_delete_day(self):
        """Test deleting a day"""
        if not self.created_day_id:
            print("❌ Skipping - No day ID available")
            return False
            
        success, response = self.run_test(
            "Delete Day",
            "DELETE",
            f"api/days/{self.created_day_id}",
            200
        )
        return success

    def test_error_cases(self):
        """Test error handling"""
        print(f"\n🔍 Testing Error Cases...")
        
        # Test getting non-existent day
        success1, _ = self.run_test(
            "Get Non-existent Day",
            "GET",
            "api/days/non-existent-id",
            404
        )
        
        # Test creating day with invalid data
        success2, _ = self.run_test(
            "Create Day with Invalid Data",
            "POST",
            "api/days",
            422,  # FastAPI validation error
            data={"invalid": "data"}
        )
        
        return success1 and success2

def main():
    print("🌱 Starting Irrigation System API Tests")
    print("=" * 50)
    
    tester = IrrigationAPITester()
    
    # Run all tests in sequence
    test_results = []
    
    # Basic functionality tests
    test_results.append(tester.test_health_check())
    test_results.append(tester.test_initialize_sample_data())
    test_results.append(tester.test_get_all_days())
    
    # CRUD operations tests
    test_results.append(tester.test_create_day())
    test_results.append(tester.test_get_specific_day())
    test_results.append(tester.test_add_schedule())
    test_results.append(tester.test_update_schedule())
    test_results.append(tester.test_delete_schedule())
    test_results.append(tester.test_update_day())
    test_results.append(tester.test_delete_day())
    
    # Error handling tests
    test_results.append(tester.test_error_cases())
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed! API is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())