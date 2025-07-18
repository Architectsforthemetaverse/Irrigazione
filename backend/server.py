from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
from datetime import datetime

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB configuration
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
client = AsyncIOMotorClient(MONGO_URL)
db = client.irrigation_system

# Pydantic models
class IrrigationAction(BaseModel):
    id: str = None
    time: str  # Format: "HH:MM"
    action: str  # Description of what to do
    sectors: List[int] = []  # List of sector numbers
    main_valves: List[int] = []  # List of main valve numbers
    action_type: str  # "open", "close", "switch"

class IrrigationDay(BaseModel):
    id: str = None
    day_number: int
    name: str  # e.g., "Day 1", "Day 2"
    schedules: List[IrrigationAction] = []
    is_active: bool = True

# API Routes
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "Irrigation System API is running"}

@app.get("/api/days")
async def get_all_days():
    """Get all irrigation days"""
    try:
        days_cursor = db.days.find({})
        days = []
        async for day in days_cursor:
            # Remove MongoDB ObjectId and convert to dict properly
            day_dict = dict(day)
            if '_id' in day_dict:
                del day_dict['_id']
            days.append(day_dict)
        return {"days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/days/{day_id}")
async def get_day(day_id: str):
    """Get a specific irrigation day"""
    try:
        day = await db.days.find_one({"id": day_id})
        if not day:
            raise HTTPException(status_code=404, detail="Day not found")
        
        # Remove MongoDB ObjectId and convert to dict properly
        day_dict = dict(day)
        if '_id' in day_dict:
            del day_dict['_id']
        return day_dict
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/days")
async def create_day(day: IrrigationDay):
    """Create a new irrigation day"""
    try:
        day.id = str(uuid.uuid4())
        day_dict = day.dict()
        
        # Ensure each schedule has an ID
        for schedule in day_dict.get('schedules', []):
            if not schedule.get('id'):
                schedule['id'] = str(uuid.uuid4())
        
        # Insert into database
        result = await db.days.insert_one(day_dict)
        
        # Return the created day without MongoDB ObjectId
        return {"message": "Day created successfully", "day": day_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/days/{day_id}")
async def update_day(day_id: str, day: IrrigationDay):
    """Update an existing irrigation day"""
    try:
        day.id = day_id
        day_dict = day.dict()
        
        # Ensure each schedule has an ID
        for schedule in day_dict.get('schedules', []):
            if not schedule.get('id'):
                schedule['id'] = str(uuid.uuid4())
        
        result = await db.days.update_one(
            {"id": day_id},
            {"$set": day_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Day not found")
        
        return {"message": "Day updated successfully", "day": day_dict}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/days/{day_id}")
async def delete_day(day_id: str):
    """Delete an irrigation day"""
    try:
        result = await db.days.delete_one({"id": day_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Day not found")
        return {"message": "Day deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/days/{day_id}/schedules")
async def add_schedule(day_id: str, schedule: IrrigationAction):
    """Add a new schedule to a day"""
    try:
        schedule.id = str(uuid.uuid4())
        schedule_dict = schedule.dict()
        
        result = await db.days.update_one(
            {"id": day_id},
            {"$push": {"schedules": schedule_dict}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Day not found")
        
        return {"message": "Schedule added successfully", "schedule": schedule_dict}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/days/{day_id}/schedules/{schedule_id}")
async def update_schedule(day_id: str, schedule_id: str, schedule: IrrigationAction):
    """Update a specific schedule within a day"""
    try:
        schedule.id = schedule_id
        schedule_dict = schedule.dict()
        
        result = await db.days.update_one(
            {"id": day_id, "schedules.id": schedule_id},
            {"$set": {"schedules.$": schedule_dict}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Day or schedule not found")
        
        return {"message": "Schedule updated successfully", "schedule": schedule_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/days/{day_id}/schedules/{schedule_id}")
async def delete_schedule(day_id: str, schedule_id: str):
    """Delete a specific schedule from a day"""
    try:
        result = await db.days.update_one(
            {"id": day_id},
            {"$pull": {"schedules": {"id": schedule_id}}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Day not found")
        
        return {"message": "Schedule deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Initialize with sample data
@app.post("/api/initialize")
async def initialize_sample_data():
    """Initialize the system with sample irrigation data"""
    try:
        # Clear existing data
        await db.days.delete_many({})
        
        # Sample data
        sample_days = [
            {
                "id": str(uuid.uuid4()),
                "day_number": 1,
                "name": "Day 1",
                "schedules": [
                    {
                        "id": str(uuid.uuid4()),
                        "time": "15:00",
                        "action": "Open sectors 1, 2, 3 and open main valve 1 and main valve 2",
                        "sectors": [1, 2, 3],
                        "main_valves": [1, 2],
                        "action_type": "open"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "time": "17:00",
                        "action": "Close sectors 1, 2, 3 and open sectors 4, 5, 6",
                        "sectors": [1, 2, 3, 4, 5, 6],
                        "main_valves": [],
                        "action_type": "switch"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "time": "20:00",
                        "action": "Close main valve 1 and 2, and close sectors 4, 5, 6",
                        "sectors": [4, 5, 6],
                        "main_valves": [1, 2],
                        "action_type": "close"
                    }
                ],
                "is_active": True
            },
            {
                "id": str(uuid.uuid4()),
                "day_number": 2,
                "name": "Day 2",
                "schedules": [
                    {
                        "id": str(uuid.uuid4()),
                        "time": "14:00",
                        "action": "Open sectors 7, 8, 9 and open main valve 3",
                        "sectors": [7, 8, 9],
                        "main_valves": [3],
                        "action_type": "open"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "time": "18:00",
                        "action": "Close all sectors and valves",
                        "sectors": [7, 8, 9],
                        "main_valves": [3],
                        "action_type": "close"
                    }
                ],
                "is_active": True
            }
        ]
        
        await db.days.insert_many(sample_days)
        
        return {"message": "Sample data initialized successfully", "days_created": len(sample_days)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)