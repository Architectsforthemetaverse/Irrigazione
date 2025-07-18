import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function App() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [showAddDay, setShowAddDay] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    time: '',
    action: '',
    sectors: '',
    main_valves: '',
    action_type: 'open'
  });
  const [newDay, setNewDay] = useState({
    day_number: '',
    name: ''
  });

  useEffect(() => {
    fetchDays();
  }, []);

  const fetchDays = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/days`);
      if (!response.ok) {
        throw new Error('Failed to fetch days');
      }
      const data = await response.json();
      setDays(data.days || []);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching days:', err);
    } finally {
      setLoading(false);
    }
  };

  const initializeSampleData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/initialize`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to initialize sample data');
      }
      await fetchDays();
    } catch (err) {
      setError(err.message);
      console.error('Error initializing sample data:', err);
    }
  };

  const handleAddSchedule = async () => {
    if (!selectedDay || !newSchedule.time || !newSchedule.action) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const sectors = newSchedule.sectors ? newSchedule.sectors.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s)) : [];
      const mainValves = newSchedule.main_valves ? newSchedule.main_valves.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v)) : [];

      const scheduleData = {
        time: newSchedule.time,
        action: newSchedule.action,
        sectors: sectors,
        main_valves: mainValves,
        action_type: newSchedule.action_type
      };

      const response = await fetch(`${API_BASE_URL}/api/days/${selectedDay.id}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleData),
      });

      if (!response.ok) {
        throw new Error('Failed to add schedule');
      }

      setNewSchedule({
        time: '',
        action: '',
        sectors: '',
        main_valves: '',
        action_type: 'open'
      });
      setShowAddSchedule(false);
      
      // Refresh the days data first
      await fetchDays();
      
      // Then update selected day with fresh data from the refreshed days array
      const dayResponse = await fetch(`${API_BASE_URL}/api/days/${selectedDay.id}`);
      if (dayResponse.ok) {
        const updatedDay = await dayResponse.json();
        setSelectedDay(updatedDay);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error adding schedule:', err);
    }
  };

  const handleAddDay = async () => {
    if (!newDay.day_number || !newDay.name) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const dayData = {
        day_number: parseInt(newDay.day_number),
        name: newDay.name,
        schedules: [],
        is_active: true
      };

      const response = await fetch(`${API_BASE_URL}/api/days`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dayData),
      });

      if (!response.ok) {
        throw new Error('Failed to add day');
      }

      setNewDay({
        day_number: '',
        name: ''
      });
      setShowAddDay(false);
      await fetchDays();
    } catch (err) {
      setError(err.message);
      console.error('Error adding day:', err);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!selectedDay || !confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/days/${selectedDay.id}/schedules/${scheduleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }

      await fetchDays();
      
      // Update selected day with new data
      const dayResponse = await fetch(`${API_BASE_URL}/api/days/${selectedDay.id}`);
      if (dayResponse.ok) {
        const updatedDay = await dayResponse.json();
        setSelectedDay(updatedDay);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error deleting schedule:', err);
    }
  };

  const handleDeleteDay = async (dayId) => {
    if (!confirm('Are you sure you want to delete this entire day and all its schedules? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/days/${dayId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete day');
      }

      // Navigate back to day selection and refresh the list
      setSelectedDay(null);
      await fetchDays();
    } catch (err) {
      setError(err.message);
      console.error('Error deleting day:', err);
    }
  };

  const sortedSchedules = (schedules) => {
    return schedules.sort((a, b) => {
      const timeA = a.time.split(':').map(Number);
      const timeB = b.time.split(':').map(Number);
      return timeA[0] - timeB[0] || timeA[1] - timeB[1];
    });
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">Loading irrigation system...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🌱 Irrigation System Manager</h1>
        <p>Manage your irrigation schedules by day</p>
      </header>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)} className="close-error">×</button>
        </div>
      )}

      {days.length === 0 ? (
        <div className="empty-state">
          <h2>No irrigation days found</h2>
          <p>Initialize the system with sample data to get started</p>
          <button onClick={initializeSampleData} className="btn btn-primary">
            Initialize Sample Data
          </button>
        </div>
      ) : (
        <div className="main-content">
          {!selectedDay ? (
            <div className="day-selection">
              <div className="section-header">
                <h2>Select Irrigation Day</h2>
                <button 
                  onClick={() => setShowAddDay(true)} 
                  className="btn btn-secondary"
                >
                  + Add Day
                </button>
              </div>
              
              <div className="day-grid">
                {days.map((day) => (
                  <div 
                    key={day.id} 
                    className="day-card"
                    onClick={() => setSelectedDay(day)}
                  >
                    <h3>{day.name}</h3>
                    <p>{day.schedules ? day.schedules.length : 0} schedules</p>
                    <div className="day-preview">
                      {day.schedules && day.schedules.length > 0 ? (
                        <small>
                          Next: {sortedSchedules(day.schedules)[0].time} - 
                          {sortedSchedules(day.schedules)[0].action.substring(0, 30)}...
                        </small>
                      ) : (
                        <small>No schedules yet</small>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="day-details">
              <div className="section-header">
                <button 
                  onClick={() => setSelectedDay(null)} 
                  className="btn btn-back"
                >
                  ← Back to Days
                </button>
                <h2>{selectedDay.name}</h2>
                <div className="day-actions">
                  <button 
                    onClick={() => setShowAddSchedule(true)} 
                    className="btn btn-primary"
                  >
                    + Add Schedule
                  </button>
                  <button 
                    onClick={() => handleDeleteDay(selectedDay.id)} 
                    className="btn btn-danger"
                  >
                    🗑️ Delete Day
                  </button>
                </div>
              </div>

              <div className="schedules-container">
                {selectedDay.schedules && selectedDay.schedules.length > 0 ? (
                  <div className="schedules-list">
                    {sortedSchedules(selectedDay.schedules).map((schedule) => (
                      <div key={schedule.id} className="schedule-card">
                        <div className="schedule-header">
                          <span className="schedule-time">{schedule.time}</span>
                          <button 
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            className="btn btn-danger btn-small"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="schedule-action">
                          {schedule.action}
                        </div>
                        <div className="schedule-details">
                          {schedule.sectors && schedule.sectors.length > 0 && (
                            <span className="detail-tag">
                              Sectors: {schedule.sectors.join(', ')}
                            </span>
                          )}
                          {schedule.main_valves && schedule.main_valves.length > 0 && (
                            <span className="detail-tag">
                              Main Valves: {schedule.main_valves.join(', ')}
                            </span>
                          )}
                          <span className={`detail-tag action-type-${schedule.action_type}`}>
                            {schedule.action_type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-schedules">
                    <p>No schedules for this day yet</p>
                    <button 
                      onClick={() => setShowAddSchedule(true)} 
                      className="btn btn-primary"
                    >
                      Add First Schedule
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Schedule Modal */}
      {showAddSchedule && (
        <div className="modal-overlay" onClick={() => setShowAddSchedule(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Schedule</h3>
              <button 
                onClick={() => setShowAddSchedule(false)}
                className="close-modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Time</label>
                <input
                  type="time"
                  value={newSchedule.time}
                  onChange={(e) => setNewSchedule({...newSchedule, time: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Action Description</label>
                <textarea
                  value={newSchedule.action}
                  onChange={(e) => setNewSchedule({...newSchedule, action: e.target.value})}
                  placeholder="e.g., Open sectors 1, 2, 3 and open main valve 1 and main valve 2"
                  className="form-input"
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>Sectors (comma-separated numbers)</label>
                <input
                  type="text"
                  value={newSchedule.sectors}
                  onChange={(e) => setNewSchedule({...newSchedule, sectors: e.target.value})}
                  placeholder="e.g., 1, 2, 3"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Main Valves (comma-separated numbers)</label>
                <input
                  type="text"
                  value={newSchedule.main_valves}
                  onChange={(e) => setNewSchedule({...newSchedule, main_valves: e.target.value})}
                  placeholder="e.g., 1, 2"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Action Type</label>
                <select
                  value={newSchedule.action_type}
                  onChange={(e) => setNewSchedule({...newSchedule, action_type: e.target.value})}
                  className="form-input"
                >
                  <option value="open">Open</option>
                  <option value="close">Close</option>
                  <option value="switch">Switch</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddSchedule(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddSchedule}
                className="btn btn-primary"
              >
                Add Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Day Modal */}
      {showAddDay && (
        <div className="modal-overlay" onClick={() => setShowAddDay(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Day</h3>
              <button 
                onClick={() => setShowAddDay(false)}
                className="close-modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Day Number</label>
                <input
                  type="number"
                  value={newDay.day_number}
                  onChange={(e) => setNewDay({...newDay, day_number: e.target.value})}
                  placeholder="e.g., 3"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Day Name</label>
                <input
                  type="text"
                  value={newDay.name}
                  onChange={(e) => setNewDay({...newDay, name: e.target.value})}
                  placeholder="e.g., Day 3"
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddDay(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddDay}
                className="btn btn-primary"
              >
                Add Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;